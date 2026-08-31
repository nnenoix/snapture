// extract.js — pure, DOM-free logic shared by the app and the tests.
// No `window`/`document` here, so Node can import it directly for unit tests.

const MONTHS = {
  // English (full + 3-letter)
  jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3, apr: 4, april: 4,
  may: 5, jun: 6, june: 6, jul: 7, july: 7, aug: 8, august: 8, sep: 9, sept: 9,
  september: 9, oct: 10, october: 10, nov: 11, november: 11, dec: 12, december: 12,
  // Russian (nominative + genitive, the form seen on posters: "31 августа")
  январь: 1, января: 1, февраль: 2, февраля: 2, март: 3, марта: 3, апрель: 4,
  апреля: 4, май: 5, мая: 5, июнь: 6, июня: 6, июль: 7, июля: 7, август: 8,
  августа: 8, сентябрь: 9, сентября: 9, октябрь: 10, октября: 10, ноябрь: 11,
  ноября: 11, декабрь: 12, декабря: 12,
};

const unique = (arr) => [...new Set(arr)];
const pad2 = (n) => String(n).padStart(2, '0');
const pad4 = (n) => String(n).padStart(4, '0');

export function monthNum(name) {
  if (!name) return null;
  return MONTHS[name.toLowerCase().replace(/\.$/, '')] ?? null;
}

export function firstLine(text) {
  return (text || '')
    .split(/\r?\n/)
    .map((s) => s.trim())
    .find((s) => s.length > 0) || '';
}

export function guessTitle(text) {
  return firstLine(text).slice(0, 70);
}

// ---- detectors -------------------------------------------------------------

export function findEmails(text) {
  return unique((text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) || []).map((s) => s.toLowerCase()));
}

export function findUrls(text) {
  return unique(
    (text.match(/\bhttps?:\/\/[^\s]+|\bwww\.[^\s]+/gi) || []).map((s) => s.replace(/[.,;)]+$/, ''))
  );
}

export function findPhones(text) {
  const raw = text.match(/\+?\d[\d\-\s().]{6,}\d/g) || [];
  return unique(
    raw
      .map((s) => s.trim())
      .filter((s) => {
        const digits = s.replace(/\D/g, '');
        return digits.length >= 7 && digits.length <= 15;
      })
  );
}

export function findAmounts(text) {
  const re = /(?:[$€£₽]\s?\d[\d.,]*\d?)|(?:\d[\d.,]*\d?\s?(?:€|£|₽|\$|руб\.?|р\.|usd|eur|rub))/gi;
  return unique((text.match(re) || []).map((s) => s.trim()));
}

// ---- date / time -----------------------------------------------------------

function parseTime(text) {
  // "19:00", "7:30 pm", "7 pm"
  let m = text.match(/\b(\d{1,2}):(\d{2})\s*([ap]\.?m\.?)?/i);
  if (m) {
    let hh = +m[1];
    const mm = +m[2];
    if (m[3]) hh = to24(hh, m[3]);
    if (hh <= 23 && mm <= 59) return { hh, mm };
  }
  m = text.match(/\b(\d{1,2})\s*([ap])\.?m\.?\b/i);
  if (m) {
    const hh = to24(+m[1], m[2]);
    if (hh <= 23) return { hh, mm: 0 };
  }
  return null;
}

function to24(hh, ampm) {
  const pm = /p/i.test(ampm);
  if (pm && hh < 12) return hh + 12;
  if (!pm && hh === 12) return 0;
  return hh;
}

/**
 * Find the first plausible date (optionally with time) in free text.
 * Supports: 2026-08-31, 31.08.2026, 31/08/26, "31 августа 2026",
 * "August 31, 2026", "Aug 31", "31 Aug". Year defaults to `now`'s year.
 * Returns { y, m, d, hh, mm, hasTime } or null.
 */
export function parseDateTime(text, now = new Date()) {
  let y = null;
  let mo = null;
  let d = null;
  let m;

  if ((m = text.match(/\b(\d{4})-(\d{1,2})-(\d{1,2})\b/))) {
    y = +m[1];
    mo = +m[2];
    d = +m[3];
  } else if ((m = text.match(/\b(\d{1,2})[.\/](\d{1,2})[.\/](\d{2,4})\b/))) {
    const a = +m[1];
    const b = +m[2];
    const yy = +m[3];
    if (a > 12 && b <= 12) {
      d = a;
      mo = b;
    } else if (b > 12 && a <= 12) {
      mo = a;
      d = b;
    } else {
      d = a; // default day-first (RU/EU); ambiguous but consistent
      mo = b;
    }
    y = yy < 100 ? 2000 + yy : yy;
  } else {
    const names = Object.keys(MONTHS).sort((x, z) => z.length - x.length).join('|');
    const reDMY = new RegExp('\\b(\\d{1,2})\\s+(' + names + ')\\.?(?:\\s+(\\d{4}))?', 'i');
    const reMDY = new RegExp('\\b(' + names + ')\\.?\\s+(\\d{1,2})(?:,?\\s+(\\d{4}))?', 'i');
    if ((m = text.match(reDMY))) {
      d = +m[1];
      mo = monthNum(m[2]);
      if (m[3]) y = +m[3];
    } else if ((m = text.match(reMDY))) {
      mo = monthNum(m[1]);
      d = +m[2];
      if (m[3]) y = +m[3];
    }
  }

  if (mo == null || d == null) return null;
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  if (y == null) y = now.getFullYear();

  const t = parseTime(text);
  return { y, m: mo, d, hh: t ? t.hh : 0, mm: t ? t.mm : 0, hasTime: !!t };
}

// ---- classification --------------------------------------------------------

const RECEIPT_WORDS = /\b(total|subtotal|amount due|receipt|invoice|vat|tax|итого|сумма|чек|ндс|к\s*оплате|кол-?во)\b/i;

/**
 * Decide what a scanned blob of text most likely is, and pull structured bits.
 * type: 'receipt' | 'event' | 'contact' | 'text'
 */
export function classify(text, now = new Date()) {
  const emails = findEmails(text);
  const phones = findPhones(text);
  const urls = findUrls(text);
  let amounts = findAmounts(text);
  const dateTime = parseDateTime(text, now);
  const lines = text.split(/\r?\n/).filter((l) => l.trim()).length;
  // A total line ("TOTAL 3.70", "Итого 512,00") counts even without a currency sign.
  const totalMatch = text.match(/(?:total|итого|amount due|subtotal|к\s*оплате)\D{0,10}(\d[\d.,]*\d)/i);
  const isReceipt = RECEIPT_WORDS.test(text) && (amounts.length > 0 || !!totalMatch);
  if (isReceipt && amounts.length === 0 && totalMatch) amounts = [totalMatch[1]];

  let type = 'text';
  if (isReceipt) type = 'receipt';
  else if (dateTime) type = 'event';
  else if ((phones.length || emails.length) && lines <= 8) type = 'contact';

  return { type, emails, phones, urls, amounts, dateTime };
}

// ---- exporters -------------------------------------------------------------

function esc(s) {
  return String(s).replace(/([,;\\])/g, '\\$1').replace(/\r?\n/g, '\\n');
}

function icsStamp(dt) {
  // UTC basic format for DTSTAMP: YYYYMMDDTHHMMSSZ
  return (
    pad4(dt.getUTCFullYear()) +
    pad2(dt.getUTCMonth() + 1) +
    pad2(dt.getUTCDate()) +
    'T' +
    pad2(dt.getUTCHours()) +
    pad2(dt.getUTCMinutes()) +
    pad2(dt.getUTCSeconds()) +
    'Z'
  );
}

function localBasic(o, withTime) {
  const date = pad4(o.y) + pad2(o.m) + pad2(o.d);
  return withTime ? date + 'T' + pad2(o.hh) + pad2(o.mm) + '00' : date;
}

/**
 * Build a valid iCalendar string. `start` is a parseDateTime() result.
 * All-day when start.hasTime is false; otherwise a 1-hour default block.
 */
export function buildICS({ title, start, description, location }, now = new Date()) {
  const withTime = !!start.hasTime;
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Snapture//EN',
    'CALSCALE:GREGORIAN',
    'BEGIN:VEVENT',
    'UID:snapture-' + localBasic(start, withTime) + '-' + Math.abs(hash(title || '')) + '@snapture.app',
    'DTSTAMP:' + icsStamp(now),
  ];
  if (withTime) {
    lines.push('DTSTART:' + localBasic(start, true));
    const end = { ...start, hh: (start.hh + 1) % 24 };
    lines.push('DTEND:' + localBasic(end, true));
  } else {
    lines.push('DTSTART;VALUE=DATE:' + localBasic(start, false));
  }
  lines.push('SUMMARY:' + esc(title || 'Event'));
  if (description) lines.push('DESCRIPTION:' + esc(description));
  if (location) lines.push('LOCATION:' + esc(location));
  lines.push('END:VEVENT', 'END:VCALENDAR');
  return lines.join('\r\n');
}

/** Build a vCard 3.0 string. */
export function buildVCard({ name, phones = [], emails = [], org, url }) {
  const l = ['BEGIN:VCARD', 'VERSION:3.0', 'FN:' + esc(name || 'Contact')];
  if (org) l.push('ORG:' + esc(org));
  phones.forEach((p) => l.push('TEL;TYPE=CELL:' + p));
  emails.forEach((e) => l.push('EMAIL;TYPE=INTERNET:' + e));
  if (url) l.push('URL:' + url);
  l.push('END:VCARD');
  return l.join('\r\n');
}

function hash(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  }
  return h;
}
