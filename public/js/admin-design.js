// Verwaltung: Designer für die Gästeseite. Vorlagen, Farben, Schrift, Formen, Aufbau, eigene Blöcke und Pro-Modus.
// Alle Änderungen landen in einem Entwurf (live neben der Vorschau). „Veröffentlichen“ macht ihn für die Gäste sichtbar.

const $ = (s, r = document) => r.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

async function api(pfad, opts = {}) {
  const res = await fetch(pfad, { ...opts, headers: opts.body ? { 'Content-Type': 'application/json' } : undefined, body: opts.body ? JSON.stringify(opts.body) : undefined });
  const d = await res.json().catch(() => ({}));
  if (res.status === 401) { location.reload(); throw new Error('Bitte neu anmelden.'); }
  if (!res.ok) throw new Error(d.error || 'Das hat nicht geklappt.');
  return d;
}

let info = null; // Vorlagen, Schriften und Listen vom Server
let d = null; // der Entwurf, an dem gearbeitet wird
let hatEntwurf = false;
let timer = null;

const FARBEN = [
  ['akzent', 'Hauptfarbe', 'Überschriften, Knöpfe, Linien'],
  ['grund', 'Hintergrund', 'Seitenfläche'],
  ['text', 'Textfarbe', 'Fließtext und Namen'],
  ['gold', 'Zierfarbe', '&-Zeichen, Zahlen, feine Linien'],
  ['licht', 'Lichtfarbe', 'warmer Schimmer im Hintergrund'],
  ['band', 'Flächenfarbe', 'Hintergrund von Termine und Gut zu wissen (leer = automatisch)'],
  ['tief', 'Dunkle Flächen', 'Countdown, Zusage und Fuß (leer = automatisch)'],
];
const OPTIONAL = ['tief', 'band'];

function status(text, neu) {
  $('#dsg-status').textContent = text;
  $('#dsg-veroeffentlichen').disabled = !neu;
  $('#dsg-verwerfen').disabled = !neu;
}

/* ---- Speichern und Vorschau ---- */
function aenderung() {
  hatEntwurf = true;
  status('Speichert …', true);
  clearTimeout(timer);
  timer = setTimeout(speichern, 500);
}
async function speichern() {
  try {
    const r = await api('/api/admin/design/entwurf', { method: 'PUT', body: { design: d } });
    d = r.design;
    status('Entwurf gespeichert. Die Gäste sehen noch die veröffentlichte Fassung.', true);
    vorschau();
  } catch (e) { status(`Fehler: ${e.message}`, true); }
}
function vorschau() { $('#dsg-iframe').src = `/?entwurf=1&t=${Date.now()}`; }

/* ---- Vorlagen ---- */
function vorlagenZeichnen() {
  $('#dsg-vorlagen').innerHTML = info.vorlagen.map((v) => {
    const f = v.design.farben; const sc = info.schriften.find((s) => s.id === v.design.schrift);
    return `<button type="button" class="dsg-vorlage${d.vorlage === v.id ? ' aktiv' : ''}" data-vorlage="${v.id}" aria-pressed="${d.vorlage === v.id}">
      <span class="dsg-vorlage-bild" style="background:${f.grund};color:${f.text};border-color:${f.text}22">
        <span class="dsg-v-name" style="font-family:${esc(sc.schreib || sc.titel)};color:${f.akzent === f.grund ? f.text : f.akzent}">Anna &amp; Ben</span>
        <span class="dsg-v-linie" style="background:${f.gold}"></span>
        <span class="dsg-v-punkte"><i style="background:${f.akzent}"></i><i style="background:${f.gold}"></i><i style="background:${f.band || f.licht}"></i><i style="background:${f.tief || f.akzent}"></i></span>
      </span>
      <strong>${esc(v.name)}</strong><small>${esc(v.beschreibung)}</small></button>`;
  }).join('');
}
$('#dsg-vorlagen').addEventListener('click', (e) => {
  const k = e.target.closest('[data-vorlage]');
  if (!k) return;
  if (hatInhalt() && !confirm('Die Vorlage ersetzt Farben, Schrift, Formen und Aufbau. Eure eigenen Blöcke und der Pro-Modus bleiben erhalten. Fortfahren?')) return;
  const v = info.vorlagen.find((x) => x.id === k.dataset.vorlage);
  const behalten = { bloecke: d.bloecke, css: d.css, html_oben: d.html_oben, html_unten: d.html_unten };
  d = { ...JSON.parse(JSON.stringify(v.design)), ...behalten, vorlage: v.id };
  alles(); aenderung();
});
const hatInhalt = () => d.vorlage === 'eigene';

/* ---- Farben ---- */
function farbenZeichnen() {
  $('#dsg-farben').innerHTML = FARBEN.map(([k, name, hinweis]) => {
    const w = d.farben[k] || '';
    return `<label class="dsg-farbe"><span><b>${name}</b><small>${hinweis}</small></span>
      <span class="dsg-farbwahl"><input type="color" data-farbe="${k}" value="${w || (k === 'tief' ? '#1d3a2e' : k === 'band' ? '#eee6d4' : '#000000')}" ${OPTIONAL.includes(k) && !w ? 'class="leer"' : ''}>
      <input type="text" data-farbe-text="${k}" value="${esc(w)}" maxlength="7" placeholder="${OPTIONAL.includes(k) ? 'automatisch' : '#rrggbb'}" spellcheck="false"></span></label>`;
  }).join('') + '<p class="hilfe">Hinweis: Auf sehr dunklem Hintergrund (Mitternacht) wird die Seite automatisch hell auf dunkel gesetzt.</p>';
}
function farbeSetzen(k, wert) {
  if (/^#[0-9a-fA-F]{6}$/.test(wert)) d.farben[k] = wert.toLowerCase();
  else if (OPTIONAL.includes(k) && wert === '') delete d.farben[k];
  else return;
  d.vorlage = 'eigene';
  aenderung(); vorlagenZeichnen();
}
$('#dsg-farben').addEventListener('input', (e) => {
  if (e.target.dataset.farbe) { farbeSetzen(e.target.dataset.farbe, e.target.value); const t = $(`[data-farbe-text="${e.target.dataset.farbe}"]`); if (t) t.value = e.target.value; }
  if (e.target.dataset.farbeText) farbeSetzen(e.target.dataset.farbeText, e.target.value.trim());
});

/* ---- Schrift und Formen ---- */
function formenZeichnen() {
  const wahl = (name, werte, aktuell, titel) => `<fieldset class="dsg-wahl"><legend>${titel}</legend><div class="filter" role="group">${werte.map(([k, t]) => `<button type="button" data-form="${name}" data-wert="${k}" aria-pressed="${aktuell === k}">${t}</button>`).join('')}</div></fieldset>`;
  $('#dsg-formen').innerHTML = `
    <fieldset class="dsg-wahl"><legend>Charakter</legend><div class="dsg-schriften">${info.stile.map(([k, t, b]) => `
      <button type="button" class="dsg-schrift${d.stil === k ? ' aktiv' : ''}" data-form="stil" data-wert="${k}" aria-pressed="${d.stil === k}"><strong>${esc(t)}</strong><small>${esc(b)}</small></button>`).join('')}</div></fieldset>
    ${wahl('flaechen', [['ruhig', 'Ruhig, ein Hintergrund'], ['bunt', 'Farbige Flächen']], d.flaechen, 'Abschnitte')}
    ${wahl('textur', [['keine', 'Glatt'], ['papier', 'Papierkorn']], d.textur, 'Oberfläche')}
    <fieldset class="dsg-wahl"><legend>Schrift</legend><div class="dsg-schriften">${info.schriften.map((s) => `
      <button type="button" class="dsg-schrift${d.schrift === s.id ? ' aktiv' : ''}" data-form="schrift" data-wert="${s.id}" aria-pressed="${d.schrift === s.id}">
        <span style="font-family:${esc(s.schreib || s.titel)};font-size:1.7rem;line-height:1.1">Anna &amp; Ben</span><span style="font-family:${esc(s.text)}">Wir heiraten im Sommer</span><small>${esc(s.beschreibung)}</small></button>`).join('')}</div></fieldset>
    ${wahl('rundung', [['eckig', 'Eckig'], ['weich', 'Weich'], ['rund', 'Rund']], d.rundung, 'Rundung von Karten und Bildern')}
    ${wahl('knoepfe', [['pille', 'Pillenform'], ['eckig', 'Eckig']], d.knoepfe, 'Knöpfe')}`;
}
$('#dsg-formen').addEventListener('click', (e) => {
  const k = e.target.closest('[data-form]');
  if (!k) return;
  d[k.dataset.form] = k.dataset.wert; d.vorlage = 'eigene';
  formenZeichnen(); vorlagenZeichnen(); aenderung();
});

/* ---- Aufbau: Anfang, Elemente, Reihenfolge ---- */
function aufbauZeichnen() {
  const name = (id) => info.sektionen.find(([k]) => k === id)?.[1] || id;
  $('#dsg-aufbau').innerHTML = `
    <fieldset class="dsg-wahl"><legend>Motiv (nur beim Anfang „Karte mit Motiv“)</legend><div class="dsg-schriften">${info.motive.map(([k, t]) => `<button type="button" class="dsg-schrift${d.motiv === k ? ' aktiv' : ''}" data-form="motiv" data-wert="${k}" aria-pressed="${d.motiv === k}"><strong>${esc(t)}</strong></button>`).join('')}</div></fieldset>
    <fieldset class="dsg-wahl"><legend>Anfang der Seite</legend><div class="dsg-heros">${info.heros.map(([k, t]) => `<button type="button" class="dsg-hero${d.hero === k ? ' aktiv' : ''}" data-form="hero" data-wert="${k}" aria-pressed="${d.hero === k}"><span class="dsg-hero-bild dsg-hero-${k}"><i></i><i></i></span>${t}</button>`).join('')}</div></fieldset>
    <fieldset class="dsg-wahl"><legend>Kleine Effekte</legend>${info.elemente.map(([k, t]) => `<label class="haken"><input type="checkbox" data-element="${k}" ${d.elemente[k] !== false ? 'checked' : ''}> ${t}</label>`).join('')}</fieldset>
    <fieldset class="dsg-wahl"><legend>Abschnitte und Reihenfolge</legend>
      <ol class="dsg-reihe">${d.reihenfolge.map((k, i) => `<li data-sek="${k}"><label class="haken"><input type="checkbox" data-zeigen="${k}" ${k === 'countdown' ? (d.elemente.countdown !== false ? 'checked' : '') : (d.aus.includes(k) ? '' : 'checked')}> <span>${name(k)}</span></label>
        <span class="dsg-pfeile"><button type="button" class="link-knopf" data-hoch="${i}" ${i === 0 ? 'disabled' : ''} aria-label="Nach oben">▲</button><button type="button" class="link-knopf" data-runter="${i}" ${i === d.reihenfolge.length - 1 ? 'disabled' : ''} aria-label="Nach unten">▼</button></span></li>`).join('')}</ol>
      <p class="hilfe">Der Anfang mit Namen und Foto bleibt immer oben. Wer die Zusage ausblendet, kann keine Antworten mehr sammeln.</p></fieldset>`;
}
$('#dsg-aufbau').addEventListener('click', (e) => {
  const f = e.target.closest('[data-form]');
  if (f) { d[f.dataset.form] = f.dataset.wert; d.vorlage = 'eigene'; aufbauZeichnen(); vorlagenZeichnen(); aenderung(); return; }
  const h = e.target.closest('[data-hoch]'); const r = e.target.closest('[data-runter]');
  const i = h ? Number(h.dataset.hoch) : r ? Number(r.dataset.runter) : -1;
  if (i < 0) return;
  const j = h ? i - 1 : i + 1;
  [d.reihenfolge[i], d.reihenfolge[j]] = [d.reihenfolge[j], d.reihenfolge[i]];
  d.vorlage = 'eigene'; aufbauZeichnen(); blockSelectZeichnen(); aenderung();
});
$('#dsg-aufbau').addEventListener('change', (e) => {
  const el = e.target;
  if (el.dataset.element) { d.elemente[el.dataset.element] = el.checked; }
  if (el.dataset.zeigen) {
    const k = el.dataset.zeigen;
    if (k === 'countdown') d.elemente.countdown = el.checked;
    else d.aus = el.checked ? d.aus.filter((x) => x !== k) : [...new Set([...d.aus, k])];
  }
  d.vorlage = 'eigene'; vorlagenZeichnen(); aenderung();
});

/* ---- Eigene Blöcke ---- */
const NACH = () => [['anfang', 'Direkt nach dem Anfang'], ...d.reihenfolge.map((k) => [k, `Nach „${info.sektionen.find(([x]) => x === k)[1]}“`])];
function blockSelectZeichnen() {
  $('#dsg-block-neu').innerHTML = info.blocktypen.map(([k, t]) => `<option value="${k}">${t}</option>`).join('');
}
function blockZeichnen() {
  $('#dsg-bloecke').innerHTML = d.bloecke.map((b, i) => {
    const t = info.blocktypen.find(([k]) => k === b.typ)?.[1];
    return `<div class="dsg-block" data-block="${i}">
      <div class="dsg-block-kopf"><strong>${esc(t)}</strong><span class="dsg-pfeile"><button type="button" class="link-knopf" data-b-hoch="${i}" ${i === 0 ? 'disabled' : ''}>▲</button><button type="button" class="link-knopf" data-b-runter="${i}" ${i === d.bloecke.length - 1 ? 'disabled' : ''}>▼</button><button type="button" class="link-knopf weg" data-b-weg="${i}">Löschen</button></span></div>
      <label>Stelle<select data-b="nach">${NACH().map(([k, n]) => `<option value="${k}"${b.nach === k ? ' selected' : ''}>${esc(n)}</option>`).join('')}</select></label>
      ${b.typ !== 'bild' && b.typ !== 'trenner' ? `<label>${b.typ === 'zitat' ? 'Wer hat es gesagt' : 'Überschrift'}<input data-b="titel" value="${esc(b.titel)}" maxlength="120"></label>` : ''}
      ${['text', 'zitat', 'zweispaltig', 'knopf'].includes(b.typ) ? `<label>Text<textarea data-b="text" rows="4" maxlength="4000">${esc(b.text)}</textarea></label>` : ''}
      ${b.typ === 'bild' || b.typ === 'zweispaltig' ? `<div class="dsg-bildwahl">${b.bild ? `<img src="/bilder/${esc(b.bild)}" alt="" width="96" height="64">` : '<span class="hilfe">Noch kein Bild</span>'}<label class="knopf leise">Bild wählen<input type="file" accept="image/*" data-b-bild="${i}" hidden></label></div>` : ''}
      ${b.typ === 'knopf' ? `<label>Beschriftung des Knopfs<input data-b="knopf" value="${esc(b.knopf)}" maxlength="60"></label><label>Link (https://, / oder mailto:)<input data-b="link" value="${esc(b.link)}" maxlength="300" placeholder="https://"></label>` : ''}
    </div>`;
  }).join('') || '<p class="hilfe">Noch keine eigenen Blöcke.</p>';
}
$('#dsg-block-hinzu').addEventListener('click', () => {
  if (d.bloecke.length >= 12) return alert('Mehr als 12 Blöcke sind nicht möglich.');
  d.bloecke.push({ id: `b${Date.now().toString(36)}`, typ: $('#dsg-block-neu').value, titel: '', text: '', bild: '', link: '', knopf: '', nach: 'wissen' });
  blockZeichnen(); aenderung();
});
$('#dsg-bloecke').addEventListener('input', (e) => {
  const z = e.target.closest('[data-block]'); const f = e.target.dataset.b;
  if (!z || !f) return;
  d.bloecke[Number(z.dataset.block)][f] = e.target.value;
  aenderung();
});
$('#dsg-bloecke').addEventListener('click', (e) => {
  const weg = e.target.closest('[data-b-weg]'); const hoch = e.target.closest('[data-b-hoch]'); const runter = e.target.closest('[data-b-runter]');
  if (weg) { if (!confirm('Diesen Block löschen?')) return; d.bloecke.splice(Number(weg.dataset.bWeg), 1); }
  else if (hoch || runter) { const i = Number((hoch || runter).dataset.bHoch ?? (hoch || runter).dataset.bRunter); const j = hoch ? i - 1 : i + 1; [d.bloecke[i], d.bloecke[j]] = [d.bloecke[j], d.bloecke[i]]; }
  else return;
  blockZeichnen(); aenderung();
});
$('#dsg-bloecke').addEventListener('change', async (e) => {
  const f = e.target.closest('[data-b-bild]');
  if (!f || !f.files[0]) return;
  try { d.bloecke[Number(f.dataset.bBild)].bild = await bildHochladen(f.files[0]); blockZeichnen(); aenderung(); }
  catch (x) { alert(x.message); }
});
// Foto verkleinern (längste Seite 1800 px) und hochladen wie in den Inhalten
async function bildHochladen(datei) {
  const bmp = await createImageBitmap(datei, { imageOrientation: 'from-image' }).catch(() => null);
  if (!bmp) throw new Error('Dieses Bild lässt sich nicht lesen. Bitte ein JPG oder PNG nehmen.');
  const f = Math.min(1, 1800 / Math.max(bmp.width, bmp.height));
  const c = Object.assign(document.createElement('canvas'), { width: Math.round(bmp.width * f), height: Math.round(bmp.height * f) });
  c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
  const blob = await new Promise((ok) => c.toBlob(ok, 'image/jpeg', 0.86));
  const roh = new Uint8Array(await blob.arrayBuffer());
  let bin = ''; for (let i = 0; i < roh.length; i += 0x8000) bin += String.fromCharCode(...roh.subarray(i, i + 0x8000));
  const sha = await window.hzSha256(roh.buffer);
  const r = await api('/api/admin/bild', { method: 'POST', body: { daten: btoa(bin), sha256: sha } });
  return r.datei;
}

/* ---- Pro-Modus ---- */
for (const [id, feld] of [['#dsg-css', 'css'], ['#dsg-html-oben', 'html_oben'], ['#dsg-html-unten', 'html_unten']]) {
  $(id).addEventListener('input', (e) => { d[feld] = e.target.value; aenderung(); });
  $(id).addEventListener('keydown', (e) => { if (e.key === 'Tab') { e.preventDefault(); const t = e.target; const a = t.selectionStart; t.setRangeText('  ', a, t.selectionEnd, 'end'); t.dispatchEvent(new Event('input')); } });
}

/* ---- Vorschau, Veröffentlichen, Verwerfen ---- */
document.querySelectorAll('[data-dsg-breite]').forEach((b) => b.addEventListener('click', () => {
  document.querySelectorAll('[data-dsg-breite]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
  $('#dsg-rahmen').classList.toggle('handy', b.dataset.dsgBreite === 'handy');
}));
$('#dsg-veroeffentlichen').addEventListener('click', async () => {
  clearTimeout(timer); await speichern();
  if (!confirm('Das Design für alle Gäste veröffentlichen?')) return;
  try { await api('/api/admin/design/veroeffentlichen', { method: 'POST' }); hatEntwurf = false; status('Veröffentlicht. Die Gäste sehen jetzt dieses Design.', false); vorschau(); }
  catch (e) { alert(e.message); }
});
$('#dsg-verwerfen').addEventListener('click', async () => {
  if (!confirm('Den Entwurf verwerfen und zur veröffentlichten Fassung zurückkehren?')) return;
  await api('/api/admin/design/entwurf', { method: 'DELETE' }).catch((e) => alert(e.message));
  await laden();
});

function alles() {
  vorlagenZeichnen(); farbenZeichnen(); formenZeichnen(); aufbauZeichnen(); blockSelectZeichnen(); blockZeichnen();
  $('#dsg-css').value = d.css || ''; $('#dsg-html-oben').value = d.html_oben || ''; $('#dsg-html-unten').value = d.html_unten || '';
}
async function laden() {
  info = await api('/api/admin/design');
  hatEntwurf = !!info.entwurf;
  d = JSON.parse(JSON.stringify(info.entwurf || info.live));
  alles();
  status(hatEntwurf ? 'Entwurf gespeichert. Die Gäste sehen noch die veröffentlichte Fassung.' : 'Das Design ist veröffentlicht. Änderungen landen zuerst in einem Entwurf.', hatEntwurf);
  vorschau();
}
document.addEventListener('reiter', (e) => { if (e.detail === 'design') laden().catch((x) => alert(x.message)); });
