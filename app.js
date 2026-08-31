// app.js — UI wiring. Pure logic lives in extract.js; OCR is Tesseract.js (CDN).
import { classify, buildICS, buildVCard, guessTitle } from './extract.js';

const $ = (id) => document.getElementById(id);
const stages = { capture: $('capture'), processing: $('processing'), result: $('result') };

function show(name) {
  for (const [k, el] of Object.entries(stages)) el.hidden = k !== name;
}

function toast(msg) {
  const t = $('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => t.classList.remove('show'), 2200);
}

function download(filename, text, mime) {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

// ---- OCR worker (lazy, reused) --------------------------------------------
let workerPromise = null;
function getWorker() {
  if (!workerPromise) {
    // Self-hosted engine (same-origin) — no CDN, works offline & fully private.
    workerPromise = Tesseract.createWorker(['eng', 'rus'], 1, {
      workerPath: './vendor/tesseract/worker.min.js',
      corePath: './vendor/tesseract/tesseract-core.wasm.js',
      langPath: './vendor/tesseract/tessdata/',
      logger: (m) => {
        if (m && typeof m.progress === 'number') setProgress(m.status, m.progress);
      },
    });
  }
  return workerPromise;
}

const STATUS_LABEL = {
  'loading tesseract core': 'Warming up the recognizer…',
  'initializing tesseract': 'Warming up the recognizer…',
  'loading language traineddata': 'Loading languages (first time only)…',
  'initializing api': 'Almost ready…',
  'recognizing text': 'Reading the text…',
};

function setProgress(status, progress) {
  const pct = Math.round((progress || 0) * 100);
  $('procBar').style.width = pct + '%';
  $('procStatus').textContent = STATUS_LABEL[status] || 'Working…';
}

// ---- flow ------------------------------------------------------------------
async function handleImage(file) {
  if (!file) return;
  show('processing');
  $('procBar').style.width = '0%';
  $('procStatus').textContent = 'Reading the image…';
  const objectUrl = URL.createObjectURL(file);
  $('preview').src = objectUrl;

  try {
    const worker = await getWorker();
    const { data } = await worker.recognize(file);
    URL.revokeObjectURL(objectUrl);
    renderResult((data.text || '').trim());
  } catch (err) {
    console.error(err);
    toast('Could not read that image. Try a clearer, well-lit photo.');
    show('capture');
  }
}

let currentText = '';

function renderResult(text) {
  currentText = text || '';
  $('textOut').value = currentText;
  refreshFromText();
  show('result');
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function refreshFromText() {
  const text = $('textOut').value;
  const info = classify(text);
  $('typeTag').textContent = text.trim() ? info.type : 'empty';
  renderSmartCard(info, text);
}

function esc(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

function fmtDate(dt) {
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const base = `${dt.d} ${months[dt.m - 1]} ${dt.y}`;
  return dt.hasTime ? `${base}, ${String(dt.hh).padStart(2, '0')}:${String(dt.mm).padStart(2, '0')}` : base;
}

function renderSmartCard(info, text) {
  const host = $('smartCard');
  if (info.type === 'event') {
    const title = guessTitle(text) || 'Event';
    host.innerHTML = `
      <div class="card">
        <p class="kicker">${icon('calendar')} Calendar event</p>
        <input class="field" id="evtTitle" value="${esc(title)}" aria-label="Event title" />
        <p class="meta"><b>${esc(fmtDate(info.dateTime))}</b></p>
        <button class="btn btn--primary card-cta" id="icsBtn">Add to calendar</button>
      </div>`;
    $('icsBtn').onclick = () => {
      const ics = buildICS({ title: $('evtTitle').value.trim() || 'Event', start: info.dateTime, description: text });
      download('event.ics', ics, 'text/calendar');
      toast('Calendar file saved');
    };
  } else if (info.type === 'contact') {
    const name = guessTitle(text) || 'Contact';
    host.innerHTML = `
      <div class="card">
        <p class="kicker">${icon('user')} Contact</p>
        <input class="field" id="ctName" value="${esc(name)}" aria-label="Contact name" />
        <div class="chips">
          ${info.phones.map((p) => `<span class="chip">${icon('phone')} ${esc(p)}</span>`).join('')}
          ${info.emails.map((e) => `<span class="chip">${icon('mail')} ${esc(e)}</span>`).join('')}
        </div>
        <button class="btn btn--primary card-cta" id="vcfBtn">Save contact</button>
      </div>`;
    $('vcfBtn').onclick = () => {
      const vcf = buildVCard({ name: $('ctName').value.trim() || 'Contact', phones: info.phones, emails: info.emails, url: info.urls[0] });
      download('contact.vcf', vcf, 'text/vcard');
      toast('Contact file saved');
    };
  } else if (info.type === 'receipt') {
    const total = info.amounts[info.amounts.length - 1] || info.amounts[0] || '';
    host.innerHTML = `
      <div class="card">
        <p class="kicker">${icon('receipt')} Receipt</p>
        <div class="amount">${esc(total)}</div>
        <p class="meta">Detected total — tap to copy.</p>
        <button class="btn btn--primary card-cta" id="totBtn">Copy total</button>
      </div>`;
    $('totBtn').onclick = async () => { await copy(total); toast('Total copied'); };
  } else {
    host.innerHTML = text.trim()
      ? `<div class="card"><p class="kicker">${icon('text')} Text</p><h3>Recognized text</h3><p class="meta">Copy, share, or save it below.</p></div>`
      : `<div class="card"><p class="kicker">${icon('text')} Nothing found</p><p class="meta">No text detected. Try a sharper, well-lit photo.</p></div>`;
  }
}

function icon(name) {
  const p = {
    calendar: 'M7 2v2H5a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2h-2V2h-2v2H9V2H7Zm12 7v10H5V9h14Z',
    user: 'M12 12a5 5 0 1 0-5-5 5 5 0 0 0 5 5Zm0 2c-4 0-8 2-8 5v1h16v-1c0-3-4-5-8-5Z',
    phone: 'M6.6 10.8a15 15 0 0 0 6.6 6.6l2.2-2.2a1 1 0 0 1 1-.25 11 11 0 0 0 3.5.56 1 1 0 0 1 1 1V20a1 1 0 0 1-1 1A17 17 0 0 1 3 4a1 1 0 0 1 1-1h3.5a1 1 0 0 1 1 1 11 11 0 0 0 .56 3.5 1 1 0 0 1-.25 1L6.6 10.8Z',
    mail: 'M4 4h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Zm8 7 8-5H4l8 5Zm0 2L4 8v10h16V8l-8 5Z',
    receipt: 'M6 2 4 4 6 6 4 8l2 2-2 2 2 2-2 2 2 2v2h12V2H6Zm2 4h8v2H8V6Zm0 4h8v2H8v-2Z',
    text: 'M4 5h16v2H4V5Zm0 4h16v2H4V9Zm0 4h10v2H4v-2Zm0 4h16v2H4v-2Z',
  }[name];
  return `<svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true"><path fill="currentColor" d="${p}"/></svg>`;
}

async function copy(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    ta.remove();
    return true;
  }
}

// ---- events ----------------------------------------------------------------
$('cameraInput').addEventListener('change', (e) => handleImage(e.target.files[0]));
$('fileInput').addEventListener('change', (e) => handleImage(e.target.files[0]));

let debounce;
$('textOut').addEventListener('input', () => {
  clearTimeout(debounce);
  debounce = setTimeout(refreshFromText, 250);
});

$('copyBtn').onclick = async () => { await copy($('textOut').value); toast('Copied'); };
$('txtBtn').onclick = () => { download('snapture.txt', $('textOut').value, 'text/plain'); toast('Saved snapture.txt'); };
$('shareBtn').onclick = async () => {
  const text = $('textOut').value;
  if (navigator.share) {
    try { await navigator.share({ text }); } catch {}
  } else {
    await copy(text);
    toast('Sharing not supported here — copied instead');
  }
};
$('againBtn').onclick = () => {
  $('cameraInput').value = '';
  $('fileInput').value = '';
  show('capture');
};

// ---- PWA service worker ----------------------------------------------------
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => {}));
}
