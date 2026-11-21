// Verwaltung: Raumplan. Tische in vier Formen und Objekte (Bühne, Tanzfläche, Buffet ...) frei auf einer Fläche platzieren,
// per Ziehen verschieben, drehen und in der Größe ändern. Gäste per Ziehen an einen Tisch setzen.
// Nutzt dieselben Daten wie die Listenansicht (/api/admin/sitzplan), die Lage steht in den Tischen (x, y, breite, hoehe, drehung).

const $ = (s, r = document) => r.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const SVG = 'http://www.w3.org/2000/svg';
const BREITE = 1200; const HOEHE = 760; const RASTER = 10;

async function api(pfad, opts = {}) {
  const res = await fetch(pfad, { ...opts, headers: opts.body ? { 'Content-Type': 'application/json' } : undefined, body: opts.body ? JSON.stringify(opts.body) : undefined });
  const d = await res.json().catch(() => ({}));
  if (res.status === 401) { location.reload(); throw new Error('Bitte neu anmelden.'); }
  if (!res.ok) throw new Error(d.error || 'Das hat nicht geklappt.');
  return d;
}

const FORMEN = { rund: { b: 130, h: 130, name: 'Runder Tisch' }, rechteck: { b: 200, h: 90, name: 'Rechteckiger Tisch' }, lang: { b: 400, h: 70, name: 'Lange Tafel' }, oval: { b: 220, h: 120, name: 'Ovaler Tisch' } };
const OBJEKTE = { 'Bühne': [300, 120], 'Tanzfläche': [240, 240], 'Buffet': [280, 60], 'Bar': [200, 50], 'DJ': [130, 70], 'Eingang': [130, 40], 'Torte': [70, 70], 'Fotoecke': [170, 140] };
const FARBE = { tisch: '#ffffff', rand: '#2d6a4f', objekt: '#e3f0e7', objektRand: '#86c19a', platz: '#ffffff', platzRand: '#9db8a5', belegt: '#2d6a4f', text: '#153a2c', rot: '#b23a3a', vegan: '#3fa77f', veggie: '#c4d86a' };

let daten = { gaeste: [], tische: [] };
let gewaehlt = null;
let speichernTimer = null;

const istObjekt = (t) => t.art === 'objekt';
function groesse(t) {
  const f = FORMEN[t.form] || FORMEN.rund;
  const b = t.breite || f.b;
  return { b, h: t.form === 'rund' && !istObjekt(t) ? b : (t.hoehe || f.h) };
}
const am = (t) => daten.gaeste.filter((g) => g.tisch === t.id).sort((a, b) => a.sort - b.sort);
const kuerzel = (n) => String(n).trim().split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase();

// Plätze rund um oder entlang des Tisches, relativ zur Mitte
function plaetzeAuf(t) {
  const { b, h } = groesse(t); const n = t.plaetze; const aus = [];
  if (!n || istObjekt(t)) return aus;
  if (t.form === 'rund' || t.form === 'oval') {
    const a = b / 2 + 17; const c = h / 2 + 17;
    for (let i = 0; i < n; i++) { const w = (i / n) * Math.PI * 2 - Math.PI / 2; aus.push([Math.cos(w) * a, Math.sin(w) * c]); }
  } else {
    const oben = Math.ceil(n / 2); const unten = n - oben;
    for (let i = 0; i < oben; i++) aus.push([-b / 2 + ((i + 0.5) / oben) * b, -h / 2 - 17]);
    for (let i = 0; i < unten; i++) aus.push([-b / 2 + ((i + 0.5) / unten) * b, h / 2 + 17]);
  }
  return aus;
}

const el = (name, attr = {}, kinder = []) => {
  const e = document.createElementNS(SVG, name);
  for (const [k, v] of Object.entries(attr)) e.setAttribute(k, v);
  for (const k of [].concat(kinder)) if (k != null) e.append(k);
  return e;
};
const text = (inhalt, attr) => { const t = el('text', { 'text-anchor': 'middle', 'dominant-baseline': 'central', 'font-family': 'Baloo 2, system-ui, sans-serif', fill: FARBE.text, ...attr }); t.textContent = inhalt; return t; };

function tischZeichnen(t) {
  const { b, h } = groesse(t);
  const d = t.drehung || 0;
  const g = el('g', { 'data-tisch': t.id, class: `rp-tisch${gewaehlt === t.id ? ' gewaehlt' : ''}`, transform: `translate(${t.x} ${t.y}) rotate(${d})` });
  const obj = istObjekt(t);
  const belegt = am(t);
  const zuViel = !obj && belegt.length > t.plaetze;
  const fuellung = obj ? FARBE.objekt : FARBE.tisch;
  const rand = zuViel ? FARBE.rot : obj ? FARBE.objektRand : FARBE.rand;
  const attr = { fill: fuellung, stroke: gewaehlt === t.id ? '#153a2c' : rand, 'stroke-width': gewaehlt === t.id ? 3 : 2, class: 'rp-koerper', ...(obj ? { 'stroke-dasharray': '6 4' } : {}) };
  g.append(t.form === 'rund' && !obj ? el('circle', { r: b / 2, ...attr })
    : t.form === 'oval' && !obj ? el('ellipse', { rx: b / 2, ry: h / 2, ...attr })
      : el('rect', { x: -b / 2, y: -h / 2, width: b, height: h, rx: obj ? 10 : 12, ...attr }));
  // Beschriftung bleibt beim Drehen lesbar
  const beschriftung = el('g', { transform: `rotate(${-d})`, 'pointer-events': 'none' });
  beschriftung.append(text(t.name, { 'font-size': Math.min(17, Math.max(11, b / 9)), 'font-weight': 600, y: obj ? 0 : -7 }));
  if (!obj) beschriftung.append(text(`${belegt.length}/${t.plaetze}`, { 'font-size': 13, y: 11, fill: zuViel ? FARBE.rot : '#54695e' }));
  g.append(beschriftung);
  // Plätze mit den Gästen
  plaetzeAuf(t).forEach(([sx, sy], i) => {
    const gast = belegt[i];
    const platz = el('g', { transform: `translate(${sx} ${sy})`, class: 'rp-platz', ...(gast ? { 'data-gast': gast.key } : {}) });
    platz.append(el('circle', { r: 14, fill: gast ? FARBE.belegt : FARBE.platz, stroke: gast?.vegan ? FARBE.vegan : gast?.vegetarisch ? FARBE.veggie : FARBE.platzRand, 'stroke-width': gast && (gast.vegan || gast.vegetarisch) ? 3.5 : 1.6 }));
    if (gast) platz.append(Object.assign(text(kuerzel(gast.name), { 'font-size': 11, 'font-weight': 600, fill: '#fff', transform: `rotate(${-d})`, 'pointer-events': 'none' }), {}));
    if (gast) { const ti = el('title'); ti.textContent = `${gast.name}${gast.vegan ? ' (vegan)' : gast.vegetarisch ? ' (vegetarisch)' : ''}`; platz.append(ti); }
    g.append(platz);
  });
  // Überzählige Gäste
  if (!obj && belegt.length > t.plaetze) g.append(Object.assign(text(`+${belegt.length - t.plaetze}`, { 'font-size': 12, 'font-weight': 700, fill: FARBE.rot, y: h / 2 + 40, transform: `rotate(${-d})` }), {}));
  return g;
}

function flaecheZeichnen() {
  const svg = $('#rp-flaeche');
  svg.replaceChildren();
  const raster = el('pattern', { id: 'rp-raster', width: 40, height: 40, patternUnits: 'userSpaceOnUse' }, [el('path', { d: 'M40 0H0V40', fill: 'none', stroke: '#d8e3da', 'stroke-width': 1 })]);
  svg.append(el('defs', {}, [raster]));
  svg.append(el('rect', { width: BREITE, height: HOEHE, rx: 14, fill: '#fbfdfb', stroke: '#d8e3da' }));
  svg.append(el('rect', { width: BREITE, height: HOEHE, rx: 14, fill: 'url(#rp-raster)', 'pointer-events': 'none' }));
  // Objekte zuerst, Tische darüber
  for (const t of daten.tische.filter(istObjekt)) svg.append(tischZeichnen(t));
  for (const t of daten.tische.filter((x) => !istObjekt(x))) svg.append(tischZeichnen(t));
}

function poolZeichnen() {
  const q = $('#rp-suche').value.trim().toLowerCase();
  const ohne = daten.gaeste.filter((g) => g.tisch == null || !daten.tische.some((t) => t.id === g.tisch));
  $('#rp-pool-anzahl').textContent = `(${ohne.length})`;
  const buendel = new Map();
  for (const g of ohne) {
    if (q && !g.name.toLowerCase().includes(q) && !g.haushaltName.toLowerCase().includes(q)) continue;
    if (!buendel.has(g.haushalt)) buendel.set(g.haushalt, { titel: g.haushaltName, gaeste: [] });
    buendel.get(g.haushalt).gaeste.push(g);
  }
  $('#rp-pool-liste').innerHTML = [...buendel.values()].sort((a, b) => a.titel.localeCompare(b.titel, 'de')).map((b) => `
    <div class="buendel"><button type="button" class="buendel-kopf" data-rp-gast="${esc(b.gaeste.map((g) => g.key).join(','))}" title="Alle zusammen auf einen Tisch ziehen"><span class="greifer" aria-hidden="true"></span>${esc(b.titel)} <span>${b.gaeste.length}</span></button>
    <div class="buendel-gaeste">${b.gaeste.map((g) => `<button type="button" class="gast" data-rp-gast="${esc(g.key)}"><span class="gast-punkt" aria-hidden="true"></span>${esc(g.name)}${g.vegan ? '<span class="gast-essen">vegan</span>' : g.vegetarisch ? '<span class="gast-essen">veggie</span>' : ''}</button>`).join('')}</div></div>`).join('')
    || `<p class="leer-klein">${daten.gaeste.length ? 'Alle haben einen Platz.' : 'Sobald Zusagen da sind, erscheinen die Gäste hier.'}</p>`;
}

function panelZeichnen() {
  const t = daten.tische.find((x) => x.id === gewaehlt);
  const p = $('#rp-panel');
  if (!t) { p.innerHTML = '<h2>Tisch bearbeiten</h2><p class="hilfe">Klickt einen Tisch oder ein Objekt an. Ziehen verschiebt, Gäste zieht ihr aus der Liste links auf einen Tisch.</p>'; return; }
  const { b, h } = groesse(t); const obj = istObjekt(t); const belegt = am(t);
  p.innerHTML = `<h2>${obj ? 'Objekt' : 'Tisch'} bearbeiten</h2>
    <label>Name<input data-rp-feld="name" value="${esc(t.name)}" maxlength="60"></label>
    ${obj ? '' : `<label>Form<select data-rp-feld="form">${Object.entries(FORMEN).map(([k, v]) => `<option value="${k}"${t.form === k ? ' selected' : ''}>${v.name}</option>`).join('')}</select></label>
    <label>Plätze<input data-rp-feld="plaetze" type="number" min="1" max="40" value="${t.plaetze}"></label>`}
    <label>${t.form === 'rund' && !obj ? 'Durchmesser' : 'Breite'}<input data-rp-feld="breite" type="range" min="50" max="${obj ? 500 : 520}" step="10" value="${Math.round(b)}"></label>
    ${t.form === 'rund' && !obj ? '' : `<label>Tiefe<input data-rp-feld="hoehe" type="range" min="30" max="400" step="10" value="${Math.round(h)}"></label>`}
    <label>Drehung <output>${Math.round(t.drehung || 0)}°</output><input data-rp-feld="drehung" type="range" min="-180" max="180" step="5" value="${Math.round(t.drehung || 0)}"></label>
    <div class="reihe"><button type="button" class="knopf leise" data-rp-dreh="-15">↺ 15°</button><button type="button" class="knopf leise" data-rp-dreh="15">↻ 15°</button><button type="button" class="knopf leise" data-rp-kopie>Kopieren</button><button type="button" class="knopf leise weg" data-rp-weg>Löschen</button></div>
    ${obj ? '' : `<h3>Gäste am Tisch (${belegt.length}/${t.plaetze})</h3>
    <ul class="rp-gaeste">${belegt.map((g) => `<li><span>${esc(g.name)}${g.vegan ? ' <small>vegan</small>' : g.vegetarisch ? ' <small>veggie</small>' : ''}</span><button type="button" class="link-knopf" data-rp-raus="${esc(g.key)}">entfernen</button></li>`).join('') || '<li class="hilfe">Noch niemand. Gäste links auf den Tisch ziehen.</li>'}</ul>`}`;
}

function alles() { flaecheZeichnen(); poolZeichnen(); panelZeichnen(); }

/* Speichern */
function tischSpeichern(t, sofort = false) {
  clearTimeout(speichernTimer);
  const los = () => api(`/api/admin/sitzplan/tisch/${t.id}`, { method: 'PUT', body: { name: t.name, plaetze: t.plaetze, form: t.form, x: t.x, y: t.y, breite: t.breite, hoehe: t.hoehe, drehung: t.drehung } }).catch((e) => alert(e.message));
  if (sofort) return los();
  speichernTimer = setTimeout(los, 300);
  return null;
}
async function neuLaden() {
  daten = await api('/api/admin/sitzplan');
  // Tische ohne Lage in ein Raster setzen
  let n = 0;
  for (const t of daten.tische) {
    if (t.x == null || t.y == null) {
      const spalte = n % 4; const zeile = Math.floor(n / 4); n++;
      t.x = 200 + spalte * 270; t.y = 150 + zeile * 210;
      if (istObjekt(t) && !t.breite) { const [ob, oh] = OBJEKTE[t.name] || [160, 80]; t.breite = ob; t.hoehe = oh; }
      await tischSpeichern(t, true);
    }
  }
  if (gewaehlt && !daten.tische.some((t) => t.id === gewaehlt)) gewaehlt = null;
  alles();
}
async function platzSetzen(keys, tischId) {
  await api('/api/admin/sitzplan/platz', { method: 'PUT', body: { gaeste: keys, tisch: tischId } });
  await neuLaden();
  document.dispatchEvent(new CustomEvent('sitzplan-geaendert'));
}

/* Neue Tische und Objekte */
async function tischNeu(form, objektName) {
  const obj = !!objektName;
  const [ob, oh] = obj ? (OBJEKTE[objektName] || [160, 80]) : [FORMEN[form].b, FORMEN[form].h];
  const plaetze = form === 'rund' ? 8 : form === 'lang' ? 12 : form === 'oval' ? 10 : 6;
  const r = await api('/api/admin/sitzplan/tisch', { method: 'POST', body: { art: obj ? 'objekt' : 'tisch', form: obj ? 'rechteck' : form, name: objektName || undefined, plaetze, x: 520 + (daten.tische.length % 6) * 40, y: 330 + (daten.tische.length % 6) * 30, breite: ob, hoehe: oh } });
  gewaehlt = r.id;
  await neuLaden();
}

/* Ziehen von Tischen */
const svgPunkt = (e) => { const svg = $('#rp-flaeche'); const pt = svg.createSVGPoint(); pt.x = e.clientX; pt.y = e.clientY; return pt.matrixTransform(svg.getScreenCTM().inverse()); };
let zug = null;
function zugStart(e) {
  if (e.button !== 0 && e.pointerType === 'mouse') return;
  const platz = e.target.closest('.rp-platz[data-gast]');
  if (platz) { geistStart(e, [platz.dataset.gast], platz); return; }
  const g = e.target.closest('[data-tisch]');
  if (!g) { gewaehlt = null; alles(); return; }
  const t = daten.tische.find((x) => x.id === Number(g.dataset.tisch));
  const p = svgPunkt(e);
  zug = { t, dx: p.x - t.x, dy: p.y - t.y, bewegt: false, start: { x: e.clientX, y: e.clientY } };
  if (gewaehlt !== t.id) { gewaehlt = t.id; panelZeichnen(); flaecheZeichnen(); }
  $('#rp-flaeche').setPointerCapture?.(e.pointerId);
}
function zugBewegung(e) {
  if (geist) { geistBewegung(e); return; }
  if (!zug) return;
  if (!zug.bewegt && Math.hypot(e.clientX - zug.start.x, e.clientY - zug.start.y) < 4) return;
  zug.bewegt = true;
  const p = svgPunkt(e);
  const { b, h } = groesse(zug.t);
  const halb = Math.max(b, h) / 2 * 0.4;
  zug.t.x = Math.min(BREITE - halb, Math.max(halb, Math.round((p.x - zug.dx) / RASTER) * RASTER));
  zug.t.y = Math.min(HOEHE - halb, Math.max(halb, Math.round((p.y - zug.dy) / RASTER) * RASTER));
  const g = $(`[data-tisch="${zug.t.id}"]`);
  if (g) g.setAttribute('transform', `translate(${zug.t.x} ${zug.t.y}) rotate(${zug.t.drehung || 0})`);
}
function zugEnde(e) {
  if (geist) { geistEnde(e); return; }
  if (!zug) return;
  const z = zug; zug = null;
  if (z.bewegt) tischSpeichern(z.t, true);
}

/* Gäste ziehen: ein schwebendes Etikett folgt dem Zeiger, losgelassen wird auf einem Tisch oder in der Liste */
let geist = null;
function geistStart(e, keys) {
  const namen = keys.map((k) => daten.gaeste.find((g) => g.key === k)?.name).filter(Boolean);
  geist = { keys, start: { x: e.clientX, y: e.clientY }, el: null, namen };
}
function geistBewegung(e) {
  if (!geist) return;
  if (!geist.el) {
    if (Math.hypot(e.clientX - geist.start.x, e.clientY - geist.start.y) < 6) return;
    geist.el = Object.assign(document.createElement('div'), { className: 'rp-geist', textContent: geist.namen.length > 1 ? `${geist.namen[0]} +${geist.namen.length - 1}` : geist.namen[0] });
    document.body.append(geist.el);
  }
  geist.el.style.left = `${e.clientX + 12}px`; geist.el.style.top = `${e.clientY + 12}px`;
  const ziel = document.elementFromPoint(e.clientX, e.clientY)?.closest('[data-tisch]');
  document.querySelectorAll('.rp-ziel').forEach((x) => x.classList.remove('rp-ziel'));
  if (ziel) ziel.classList.add('rp-ziel');
}
async function geistEnde(e) {
  const g = geist; geist = null;
  document.querySelectorAll('.rp-ziel').forEach((x) => x.classList.remove('rp-ziel'));
  if (!g?.el) return;
  g.el.remove();
  const unter = document.elementFromPoint(e.clientX, e.clientY);
  const tisch = unter?.closest('[data-tisch]');
  if (tisch) {
    const t = daten.tische.find((x) => x.id === Number(tisch.dataset.tisch));
    if (t && !istObjekt(t)) return platzSetzen(g.keys, t.id).catch((x) => alert(x.message));
  } else if (unter?.closest('.rp-pool')) return platzSetzen(g.keys, null).catch((x) => alert(x.message));
  return undefined;
}

/* Bild und Druck */
function bildLaden() {
  const svg = $('#rp-flaeche').cloneNode(true);
  svg.setAttribute('xmlns', SVG);
  svg.setAttribute('width', BREITE); svg.setAttribute('height', HOEHE);
  svg.querySelectorAll('.gewaehlt .rp-koerper').forEach((k) => { k.setAttribute('stroke', FARBE.rand); k.setAttribute('stroke-width', 2); });
  const blob = new Blob([`<?xml version="1.0" encoding="UTF-8"?>\n${new XMLSerializer().serializeToString(svg)}`], { type: 'image/svg+xml' });
  const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: 'raumplan.svg' });
  a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}

/* Bedienung */
const sitzplanBereich = () => $('[data-bereich="sitzplan"]');
function ansicht(art) {
  const raum = art === 'raum';
  sitzplanBereich().classList.toggle('raum-modus', raum);
  document.querySelectorAll('[data-sitz-ansicht]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.sitzAnsicht === art)));
  $('#raumplan').hidden = !raum;
  try { localStorage.setItem('hz-sitz-ansicht', art); } catch {}
  if (raum) neuLaden().catch((x) => alert(x.message));
  else document.dispatchEvent(new CustomEvent('sitzplan-geaendert')); // Listenansicht neu laden
}
document.querySelectorAll('[data-sitz-ansicht]').forEach((b) => b.addEventListener('click', () => ansicht(b.dataset.sitzAnsicht)));

const flaeche = $('#rp-flaeche');
flaeche.addEventListener('pointerdown', zugStart);
addEventListener('pointermove', zugBewegung);
addEventListener('pointerup', zugEnde);
addEventListener('pointercancel', zugEnde);
$('#rp-pool-liste').addEventListener('pointerdown', (e) => {
  const k = e.target.closest('[data-rp-gast]');
  if (k && (e.button === 0 || e.pointerType !== 'mouse')) { e.preventDefault(); geistStart(e, k.dataset.rpGast.split(',')); }
});
$('#rp-suche').addEventListener('input', poolZeichnen);
document.querySelectorAll('[data-rp-neu]').forEach((b) => b.addEventListener('click', () => tischNeu(b.dataset.rpNeu).catch((x) => alert(x.message))));
$('#rp-objekt').addEventListener('change', (e) => { if (e.target.value) tischNeu('rechteck', e.target.value).catch((x) => alert(x.message)); e.target.value = ''; });
$('#rp-ordnen').addEventListener('click', async () => {
  if (!confirm('Alle Tische und Objekte neu in ein Raster setzen? Eure Anordnung geht dabei verloren.')) return;
  daten.tische.forEach((t) => { t.x = null; t.y = null; });
  await Promise.all(daten.tische.map((t) => api(`/api/admin/sitzplan/tisch/${t.id}`, { method: 'PUT', body: { x: null, y: null } })));
  await neuLaden();
});
$('#rp-bild').addEventListener('click', bildLaden);
$('#rp-drucken').addEventListener('click', () => { document.body.classList.add('druck-raumplan'); print(); setTimeout(() => document.body.classList.remove('druck-raumplan'), 500); });

$('#rp-panel').addEventListener('input', (e) => {
  const f = e.target.dataset.rpFeld; const t = daten.tische.find((x) => x.id === gewaehlt);
  if (!f || !t) return;
  const wert = e.target.type === 'range' || e.target.type === 'number' ? Number(e.target.value) : e.target.value;
  t[f] = f === 'plaetze' ? Math.max(1, Math.min(40, wert || 1)) : wert;
  if (f === 'form' && t.form === 'rund') t.hoehe = 0;
  if (f === 'form') { const standard = FORMEN[t.form]; t.breite = standard.b; t.hoehe = t.form === 'rund' ? 0 : standard.h; }
  flaecheZeichnen(); poolZeichnen();
  if (f === 'form' || f === 'plaetze') panelZeichnen();
  else if (f === 'drehung') { const o = e.target.parentElement.querySelector('output'); if (o) o.textContent = `${Math.round(wert)}°`; }
  tischSpeichern(t);
});
$('#rp-panel').addEventListener('click', async (e) => {
  const t = daten.tische.find((x) => x.id === gewaehlt);
  const dreh = e.target.closest('[data-rp-dreh]');
  if (dreh && t) { t.drehung = ((((t.drehung || 0) + Number(dreh.dataset.rpDreh) + 180) % 360) + 360) % 360 - 180; flaecheZeichnen(); panelZeichnen(); tischSpeichern(t); return; }
  if (e.target.closest('[data-rp-weg]') && t) {
    if (!confirm(`„${t.name}“ löschen? Die Gäste am Tisch kommen zurück in die Liste.`)) return;
    await api(`/api/admin/sitzplan/tisch/${t.id}`, { method: 'DELETE' }); gewaehlt = null; await neuLaden(); document.dispatchEvent(new CustomEvent('sitzplan-geaendert')); return;
  }
  if (e.target.closest('[data-rp-kopie]') && t) {
    const r = await api('/api/admin/sitzplan/tisch', { method: 'POST', body: { art: t.art, form: t.form, name: `${t.name} 2`, plaetze: t.plaetze, x: Math.min(BREITE - 80, t.x + 40), y: Math.min(HOEHE - 80, t.y + 40), breite: t.breite, hoehe: t.hoehe, drehung: t.drehung } });
    gewaehlt = r.id; await neuLaden(); return;
  }
  const raus = e.target.closest('[data-rp-raus]');
  if (raus) platzSetzen([raus.dataset.rpRaus], null).catch((x) => alert(x.message));
});

document.addEventListener('reiter', (e) => {
  if (e.detail !== 'sitzplan') return;
  let a = 'liste'; try { a = localStorage.getItem('hz-sitz-ansicht') || 'liste'; } catch {}
  ansicht(a);
});
