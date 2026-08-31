import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseDateTime,
  classify,
  findEmails,
  findPhones,
  findUrls,
  findAmounts,
  buildICS,
  buildVCard,
  monthNum,
  guessTitle,
} from '../extract.js';

const NOW = new Date('2026-08-31T10:00:00Z');

test('monthNum handles EN + RU', () => {
  assert.equal(monthNum('Aug'), 8);
  assert.equal(monthNum('August'), 8);
  assert.equal(monthNum('августа'), 8);
  assert.equal(monthNum('Декабрь'), 12);
  assert.equal(monthNum('nope'), null);
});

test('parseDateTime: ISO', () => {
  assert.deepEqual(parseDateTime('meeting 2026-09-15', NOW), { y: 2026, m: 9, d: 15, hh: 0, mm: 0, hasTime: false });
});

test('parseDateTime: dd.mm.yyyy day-first', () => {
  const r = parseDateTime('15.09.2026', NOW);
  assert.equal(r.d, 15);
  assert.equal(r.m, 9);
  assert.equal(r.y, 2026);
});

test('parseDateTime: US mm/dd when first > 12', () => {
  const r = parseDateTime('09/15/26', NOW);
  assert.equal(r.m, 9);
  assert.equal(r.d, 15);
  assert.equal(r.y, 2026);
});

test('parseDateTime: RU textual "31 августа" fills current year', () => {
  const r = parseDateTime('Концерт 31 августа, вход свободный', NOW);
  assert.deepEqual(r, { y: 2026, m: 8, d: 31, hh: 0, mm: 0, hasTime: false });
});

test('parseDateTime: EN textual with time', () => {
  const r = parseDateTime('Party on August 31, 2026 at 7:30 pm', NOW);
  assert.deepEqual(r, { y: 2026, m: 8, d: 31, hh: 19, mm: 30, hasTime: true });
});

test('parseDateTime: 24h time', () => {
  const r = parseDateTime('01.12.2026 19:00', NOW);
  assert.deepEqual(r, { y: 2026, m: 12, d: 1, hh: 19, mm: 0, hasTime: true });
});

test('parseDateTime: bare "7pm" attaches to date', () => {
  const r = parseDateTime('Show 5 Dec 7pm', NOW);
  assert.equal(r.hh, 19);
  assert.equal(r.mm, 0);
  assert.equal(r.hasTime, true);
});

test('parseDateTime: rejects garbage', () => {
  assert.equal(parseDateTime('no date here', NOW), null);
  assert.equal(parseDateTime('45.99.2026', NOW), null);
});

test('findEmails / findUrls / findPhones', () => {
  const t = 'Reach me: John@Acme.CO or visit https://acme.co/team. Tel +1 (415) 555-2671';
  assert.deepEqual(findEmails(t), ['john@acme.co']);
  assert.deepEqual(findUrls(t), ['https://acme.co/team']);
  assert.deepEqual(findPhones(t), ['+1 (415) 555-2671']);
});

test('findPhones ignores short number runs', () => {
  assert.deepEqual(findPhones('room 214, table 5'), []);
});

test('findAmounts catches currency both sides', () => {
  const a = findAmounts('Total: $42.50 and 1200 руб and €9');
  assert.ok(a.includes('$42.50'));
  assert.ok(a.some((x) => /1200\s?руб/.test(x)));
  assert.ok(a.includes('€9'));
});

test('classify: receipt beats event when total + amount present', () => {
  const t = 'GROCERY MART\n12.08.2026\nMilk 2.50\nBread 1.20\nTOTAL 3.70';
  const r = classify(t, NOW);
  assert.equal(r.type, 'receipt');
  assert.ok(r.amounts.length >= 1);
});

test('classify: event from a poster', () => {
  const r = classify('Jazz Night\n31 августа 19:00\nBlue Note Club', NOW);
  assert.equal(r.type, 'event');
  assert.equal(r.dateTime.hh, 19);
});

test('classify: contact from a business card', () => {
  const r = classify('Jane Doe\nAcme Inc\njane@acme.co\n+1 415 555 2671', NOW);
  assert.equal(r.type, 'contact');
  assert.deepEqual(r.emails, ['jane@acme.co']);
});

test('classify: plain text fallback', () => {
  assert.equal(classify('just some scanned paragraph of prose', NOW).type, 'text');
});

test('buildICS: timed event has DTSTART/DTEND with +1h', () => {
  const start = { y: 2026, m: 8, d: 31, hh: 19, mm: 0, hasTime: true };
  const ics = buildICS({ title: 'Jazz Night', start }, NOW);
  assert.match(ics, /BEGIN:VCALENDAR/);
  assert.match(ics, /DTSTART:20260831T190000/);
  assert.match(ics, /DTEND:20260831T200000/);
  assert.match(ics, /SUMMARY:Jazz Night/);
  assert.match(ics, /END:VCALENDAR$/);
});

test('buildICS: all-day event uses VALUE=DATE', () => {
  const start = { y: 2026, m: 8, d: 31, hh: 0, mm: 0, hasTime: false };
  const ics = buildICS({ title: 'Holiday', start }, NOW);
  assert.match(ics, /DTSTART;VALUE=DATE:20260831/);
  assert.doesNotMatch(ics, /DTEND/);
});

test('buildICS: escapes commas in summary', () => {
  const start = { y: 2026, m: 1, d: 1, hh: 0, mm: 0, hasTime: false };
  const ics = buildICS({ title: 'Meet Bob, Alice', start }, NOW);
  assert.match(ics, /SUMMARY:Meet Bob\\, Alice/);
});

test('buildVCard: multiple phones and emails', () => {
  const vcf = buildVCard({ name: 'Jane Doe', org: 'Acme', phones: ['+1 415 555 2671'], emails: ['jane@acme.co'] });
  assert.match(vcf, /BEGIN:VCARD/);
  assert.match(vcf, /FN:Jane Doe/);
  assert.match(vcf, /ORG:Acme/);
  assert.match(vcf, /TEL;TYPE=CELL:\+1 415 555 2671/);
  assert.match(vcf, /EMAIL;TYPE=INTERNET:jane@acme.co/);
  assert.match(vcf, /END:VCARD$/);
});

test('guessTitle takes first non-empty line, trimmed', () => {
  assert.equal(guessTitle('\n\n  Jazz Night  \n31 Aug'), 'Jazz Night');
});
