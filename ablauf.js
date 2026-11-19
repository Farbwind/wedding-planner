// Ablauf des Hochzeitstags und Links für Dienstleister (Catering, DJ, Location, Fotografie).
// Das Paar pflegt den Ablauf in der Verwaltung (Reiter „Ablauf“) und gibt pro Dienstleister einen Link frei, der nur das zeigt,
// was dieser braucht: Ablauf, Zahlen und Essenswünsche, Songwünsche, Sitzplan. Die Seite unter /d/<schlüssel> ist nur lesbar.
// Wird von server.js eingebunden: const behandle = ablauf({...}); if (await behandle(req, res, url)) return;

import crypto from 'node:crypto';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const ZEIT = /^([01]\d|2[0-3]):[0-5]\d$/;
const TAG = /^\d{4}-\d{2}-\d{2}$/;
const SCHLUESSEL = /^[A-Za-z0-9_-]{20}$/;

export function ablauf({ db, send, json, str, int, sessionUser, limited, clientIp, getSettings, overview, sitzplanDaten, PUBLIC_URL }) {
  db.exec(`
CREATE TABLE IF NOT EXISTS ablauf (id INTEGER PRIMARY KEY, tag TEXT NOT NULL DEFAULT '', zeit TEXT NOT NULL DEFAULT '', titel TEXT NOT NULL,
  ort TEXT NOT NULL DEFAULT '', wer TEXT NOT NULL DEFAULT '', notiz TEXT NOT NULL DEFAULT '', intern INTEGER NOT NULL DEFAULT 0,
  erstellt TEXT NOT NULL DEFAULT (datetime('now')));
CREATE TABLE IF NOT EXISTS dienstleister (id INTEGER PRIMARY KEY, name TEXT NOT NULL, schluessel TEXT NOT NULL UNIQUE,
  ablauf INTEGER NOT NULL DEFAULT 1, zahlen INTEGER NOT NULL DEFAULT 0, songs INTEGER NOT NULL DEFAULT 0, sitzplan INTEGER NOT NULL DEFAULT 0,
  aktiv INTEGER NOT NULL DEFAULT 1, geoeffnet TEXT, erstellt TEXT NOT NULL DEFAULT (datetime('now')));
`);

  const jetzt = () => new Date().toISOString().replace('T', ' ').slice(0, 19);
  const neuerSchluessel = () => crypto.randomBytes(15).toString('base64url'); // 20 Zeichen
  const liste = () => db.prepare(`SELECT * FROM ablauf ORDER BY CASE WHEN tag = '' THEN 1 ELSE 0 END, tag, CASE WHEN zeit = '' THEN 1 ELSE 0 END, zeit, id`).all();
  const linkVon = (d) => ({ ...d, aktiv: !!d.aktiv, url: `${PUBLIC_URL}/d/${d.schluessel}` });

  async function leseJson(req) {
    if (!String(req.headers['content-type'] || '').includes('application/json')) throw Object.assign(new Error('Falsches Format'), { status: 415 });
    const teile = []; let groesse = 0;
    for await (const c of req) { groesse += c.length; if (groesse > 64 * 1024) throw Object.assign(new Error('Zu groß'), { status: 413 }); teile.push(c); }
    try { return JSON.parse(Buffer.concat(teile).toString('utf8') || '{}'); } catch { throw Object.assign(new Error('Ungültige Daten'), { status: 400 }); }
  }

  // Ein Programmpunkt aus den Eingaben, oder null mit Fehlertext
  function punkt(b) {
    const titel = str(b.titel, 120);
    if (!titel) return { fehler: 'Bitte tragt ein, was passiert.' };
    const zeit = String(b.zeit || '').trim();
    if (zeit && !ZEIT.test(zeit)) return { fehler: 'Die Uhrzeit bitte als HH:MM angeben.' };
    const tag = String(b.tag || '').trim();
    if (tag && !TAG.test(tag)) return { fehler: 'Das Datum stimmt nicht.' };
    return { tag, zeit, titel, ort: str(b.ort, 120), wer: str(b.wer, 80), notiz: str(b.notiz, 500), intern: b.intern ? 1 : 0 };
  }

  // Beispielablauf, Zeiten ab der Trauung (Standard 14:00), Datum aus den Angaben
  function beispiel() {
    const s = getSettings();
    const m = String(s.church_time || '').match(/(\d{1,2})[:.](\d{2})/);
    const start = m ? Number(m[1]) * 60 + Number(m[2]) : 14 * 60;
    const um = (min) => { const t = Math.min(23 * 60 + 59, start + min); return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`; };
    const tag = TAG.test(s.church_date) ? s.church_date : '';
    const ort = s.church_place || '';
    const zeilen = [
      [-180, 'Aufbau und Dekoration', '', 'Trauzeugen', 1],
      [-30, 'Gäste kommen an', ort, '', 0],
      [0, 'Trauung', ort, '', 0],
      [60, 'Sektempfang', '', 'Catering', 0],
      [90, 'Gruppenfoto mit allen Gästen', '', 'Fotografie', 0],
      [120, 'Kaffee und Kuchen', '', 'Catering', 0],
      [240, 'Abendessen', '', 'Catering', 0],
      [330, 'Anschnitt der Hochzeitstorte', '', 'Catering', 0],
      [360, 'Eröffnungstanz', '', 'DJ', 0],
      [540, 'Mitternachtssnack', '', 'Catering', 0],
    ];
    const ins = db.prepare('INSERT INTO ablauf (tag, zeit, titel, ort, wer, intern) VALUES (?, ?, ?, ?, ?, ?)');
    for (const [min, titel, o, wer, intern] of zeilen) ins.run(tag, min < 0 ? um(Math.max(min, -start + 60)) : um(min), titel, o, wer, intern);
  }

  const langesDatum = (tag) => (TAG.test(tag) ? new Date(`${tag}T12:00:00Z`).toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }) : 'Ohne Datum');

  function seite(d) {
    const s = getSettings();
    const teile = [];
    if (d.ablauf) {
      const tage = new Map();
      for (const a of liste().filter((x) => !x.intern)) { if (!tage.has(a.tag)) tage.set(a.tag, []); tage.get(a.tag).push(a); }
      teile.push(`<section><h2>Ablauf</h2>${[...tage].map(([tag, zeilen]) => `<h3>${esc(langesDatum(tag))}</h3>
        <table><tbody>${zeilen.map((a) => `<tr><th scope="row">${esc(a.zeit || '')}</th><td><b>${esc(a.titel)}</b>${a.ort ? `<br><span>${esc(a.ort)}</span>` : ''}${a.notiz ? `<br><span>${esc(a.notiz)}</span>` : ''}</td><td class="wer">${esc(a.wer)}</td></tr>`).join('')}</tbody></table>`).join('') || '<p class="leer">Der Ablauf ist noch nicht eingetragen.</p>'}</section>`);
    }
    if (d.zahlen) {
      const st = overview().stats;
      teile.push(`<section><h2>Zahlen</h2>
        <dl class="zahlen"><div><dt>Zugesagt</dt><dd>${st.persons} ${st.persons === 1 ? 'Person' : 'Personen'}</dd></div>
        <div><dt>Noch ohne Antwort</dt><dd>${st.openPersons} ${st.openPersons === 1 ? 'Person' : 'Personen'}</dd></div>
        <div><dt>Vegetarisch</dt><dd>${st.vegetarian} ${st.vegetarian === 1 ? 'Antwort' : 'Antworten'}</dd></div>
        <div><dt>Vegan</dt><dd>${st.vegan} ${st.vegan === 1 ? 'Antwort' : 'Antworten'}</dd></div></dl>
        <p class="leer">Eine Antwort kann mehrere Personen umfassen, die genaue Zahl für das Menü nennt euch das Paar.${TAG.test(s.deadline) ? ` Antwortfrist: ${esc(langesDatum(s.deadline))}.` : ''}</p></section>`);
    }
    if (d.songs) {
      const songs = [...new Set(db.prepare("SELECT song FROM responses WHERE attending = 1 AND song != '' ORDER BY id").all().map((r) => r.song))].slice(0, 300);
      teile.push(`<section><h2>Songwünsche</h2>${songs.length ? `<ol>${songs.map((x) => `<li>${esc(x)}</li>`).join('')}</ol>` : '<p class="leer">Noch keine Wünsche eingegangen.</p>'}</section>`);
    }
    if (d.sitzplan) {
      const sp = sitzplanDaten();
      const tische = sp.tische.map((t) => ({ ...t, gaeste: sp.gaeste.filter((g) => g.tisch === t.id).sort((a, b) => a.sort - b.sort) }));
      const ohne = sp.gaeste.filter((g) => g.tisch == null).length;
      teile.push(`<section><h2>Sitzplan</h2><div class="tische">${tische.map((t) => `<div class="tisch"><h3>${esc(t.name)}</h3><p class="plaetze">${t.gaeste.length} von ${t.plaetze} Plätzen</p>${d.sitzplan === 2 ? `<ul>${t.gaeste.map((g) => `<li>${esc(g.name)}</li>`).join('')}</ul>` : ''}</div>`).join('') || '<p class="leer">Es sind noch keine Tische angelegt.</p>'}</div>
        ${ohne ? `<p class="leer">${ohne} ${ohne === 1 ? 'Gast hat' : 'Gäste haben'} noch keinen Platz.</p>` : ''}</section>`);
    }
    return `<!doctype html><html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow"><meta name="referrer" content="no-referrer">
<title>${esc(d.name)} · ${esc(s.couple)}</title>
<style>
@font-face{font-family:"Hanken Grotesk";src:url(/fonts/hanken-grotesk-latin-400-normal.woff2) format("woff2");font-weight:400;font-display:swap}
@font-face{font-family:"Hanken Grotesk";src:url(/fonts/hanken-grotesk-latin-600-normal.woff2) format("woff2");font-weight:600;font-display:swap}
@font-face{font-family:"Cormorant Garamond";src:url(/fonts/cormorant-garamond-latin-500-normal.woff2) format("woff2");font-weight:500;font-display:swap}
:root{--akzent:${/^#[0-9a-fA-F]{6}$/.test(s.design_akzent) ? s.design_akzent : '#3f5a4d'};--text:#25282b;--weich:#5d6670;--linie:#dfe3dc}
*{box-sizing:border-box}body{margin:0;background:#faf9f6;color:var(--text);font:400 1rem/1.55 "Hanken Grotesk",system-ui,sans-serif}
main{max-width:760px;margin:0 auto;padding:32px 18px 64px}
h1{margin:0;font:500 clamp(2rem,6vw,2.8rem)/1.1 "Cormorant Garamond",Georgia,serif;color:var(--akzent)}
.fuer{margin:6px 0 28px;color:var(--weich)}
h2{margin:36px 0 10px;font:500 1.7rem/1.2 "Cormorant Garamond",Georgia,serif;color:var(--akzent)}
h3{margin:22px 0 8px;font-size:1rem;font-weight:600}
table{width:100%;border-collapse:collapse;background:#fff;border:1px solid var(--linie);border-radius:12px;overflow:hidden}
th,td{padding:11px 14px;text-align:left;vertical-align:top;border-bottom:1px solid var(--linie)}tr:last-child>*{border:0}
th{width:76px;font-weight:600;font-variant-numeric:tabular-nums;color:var(--akzent)}td span{color:var(--weich);font-size:.92rem}.wer{width:110px;color:var(--weich);font-size:.9rem;text-align:right}
.zahlen{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px;margin:0}.zahlen div{background:#fff;border:1px solid var(--linie);border-radius:12px;padding:12px 14px}
.zahlen dt{font-size:.85rem;color:var(--weich)}.zahlen dd{margin:2px 0 0;font-size:1.3rem;font-weight:600}
ol{padding-left:22px;margin:0}li{margin:3px 0}.leer{color:var(--weich);font-size:.92rem}
.tische{display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:12px}.tisch{background:#fff;border:1px solid var(--linie);border-radius:12px;padding:12px 16px;break-inside:avoid}
.tisch h3{margin:0}.plaetze{margin:2px 0 6px;color:var(--weich);font-size:.9rem}.tisch ul{margin:0;padding-left:18px;font-size:.95rem}
.fuss{margin-top:44px;color:var(--weich);font-size:.85rem}
@media print{body{background:#fff}main{padding:0}}
</style></head><body><main>
<h1>${esc(s.couple)}</h1>
<p class="fuer">Informationen für ${esc(d.name)}${TAG.test(s.church_date) ? ` · ${esc(langesDatum(s.church_date))}` : ''}</p>
${teile.join('') || '<p class="leer">Für diesen Link ist noch nichts freigegeben.</p>'}
<p class="fuss">Diese Seite aktualisiert sich von selbst. Stand ${esc(new Date().toLocaleString('de-DE', { timeZone: 'Europe/Berlin', dateStyle: 'short', timeStyle: 'short' }))} Uhr. Bitte den Link nicht weitergeben.</p>
</main></body></html>`;
  }

  return async function behandle(req, res, url) {
    const p = url.pathname;
    const m = req.method;
    let t;

    // Öffentlich: Seite für einen Dienstleister, nur lesbar
    if ((t = p.match(/^\/d\/([A-Za-z0-9_-]{20})$/)) && m === 'GET') {
      const kopf = { 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex', 'Referrer-Policy': 'no-referrer' };
      if (limited(`dl:${clientIp(req)}`, 120, 3600_000)) { send(res, 429, 'Zu viele Aufrufe', 'text/plain; charset=utf-8'); return true; }
      const d = db.prepare('SELECT * FROM dienstleister WHERE schluessel = ? AND aktiv = 1').get(t[1]);
      if (!d) { send(res, 404, 'Diesen Link gibt es nicht (mehr).', 'text/plain; charset=utf-8', kopf); return true; }
      db.prepare('UPDATE dienstleister SET geoeffnet = ? WHERE id = ?').run(jetzt(), d.id);
      send(res, 200, seite(d), 'text/html; charset=utf-8', kopf);
      return true;
    }

    if (!/^\/api\/admin\/(ablauf|dienstleister)/.test(p)) return false;
    if (!sessionUser(req)) { json(res, 401, { error: 'Bitte anmelden.' }); return true; }

    if (p === '/api/admin/ablauf' && m === 'GET') {
      json(res, 200, { ablauf: liste().map((a) => ({ ...a, intern: !!a.intern })), links: db.prepare('SELECT * FROM dienstleister ORDER BY id').all().map(linkVon), publicUrl: PUBLIC_URL });
      return true;
    }
    if (p === '/api/admin/ablauf' && m === 'POST') {
      const a = punkt(await leseJson(req));
      if (a.fehler) { json(res, 400, { error: a.fehler }); return true; }
      const r = db.prepare('INSERT INTO ablauf (tag, zeit, titel, ort, wer, notiz, intern) VALUES (?, ?, ?, ?, ?, ?, ?)').run(a.tag, a.zeit, a.titel, a.ort, a.wer, a.notiz, a.intern);
      json(res, 200, { ok: true, id: Number(r.lastInsertRowid) });
      return true;
    }
    if (p === '/api/admin/ablauf/beispiel' && m === 'POST') {
      if (db.prepare('SELECT 1 FROM ablauf').get()) { json(res, 409, { error: 'Es gibt schon Programmpunkte.' }); return true; }
      beispiel();
      json(res, 200, { ok: true });
      return true;
    }
    if ((t = p.match(/^\/api\/admin\/ablauf\/(\d+)$/))) {
      const id = Number(t[1]);
      if (!db.prepare('SELECT 1 FROM ablauf WHERE id = ?').get(id)) { json(res, 404, { error: 'Nicht gefunden.' }); return true; }
      if (m === 'PUT') {
        const a = punkt(await leseJson(req));
        if (a.fehler) { json(res, 400, { error: a.fehler }); return true; }
        db.prepare('UPDATE ablauf SET tag=?, zeit=?, titel=?, ort=?, wer=?, notiz=?, intern=? WHERE id=?').run(a.tag, a.zeit, a.titel, a.ort, a.wer, a.notiz, a.intern, id);
        json(res, 200, { ok: true });
        return true;
      }
      if (m === 'DELETE') { db.prepare('DELETE FROM ablauf WHERE id = ?').run(id); json(res, 200, { ok: true }); return true; }
    }

    if (p === '/api/admin/dienstleister' && m === 'POST') {
      const b = await leseJson(req);
      const name = str(b.name, 60);
      if (!name) { json(res, 400, { error: 'Bitte einen Namen eintragen, zum Beispiel „Catering“ oder „DJ“.' }); return true; }
      const r = db.prepare('INSERT INTO dienstleister (name, schluessel, ablauf, zahlen, songs, sitzplan) VALUES (?, ?, ?, ?, ?, ?)')
        .run(name, neuerSchluessel(), b.ablauf === false ? 0 : 1, b.zahlen ? 1 : 0, b.songs ? 1 : 0, int(b.sitzplan, 0, 2));
      json(res, 200, { ok: true, id: Number(r.lastInsertRowid) });
      return true;
    }
    if ((t = p.match(/^\/api\/admin\/dienstleister\/(\d+)(\/neu)?$/))) {
      const id = Number(t[1]);
      const d = db.prepare('SELECT * FROM dienstleister WHERE id = ?').get(id);
      if (!d) { json(res, 404, { error: 'Nicht gefunden.' }); return true; }
      if (t[2] && m === 'POST') { db.prepare('UPDATE dienstleister SET schluessel = ?, geoeffnet = NULL WHERE id = ?').run(neuerSchluessel(), id); json(res, 200, { ok: true }); return true; }
      if (m === 'PUT') {
        const b = await leseJson(req);
        db.prepare('UPDATE dienstleister SET name=?, ablauf=?, zahlen=?, songs=?, sitzplan=?, aktiv=? WHERE id=?').run(
          'name' in b ? str(b.name, 60) || d.name : d.name,
          'ablauf' in b ? (b.ablauf ? 1 : 0) : d.ablauf, 'zahlen' in b ? (b.zahlen ? 1 : 0) : d.zahlen, 'songs' in b ? (b.songs ? 1 : 0) : d.songs,
          'sitzplan' in b ? int(b.sitzplan, 0, 2) : d.sitzplan, 'aktiv' in b ? (b.aktiv ? 1 : 0) : d.aktiv, id);
        json(res, 200, { ok: true });
        return true;
      }
      if (m === 'DELETE') { db.prepare('DELETE FROM dienstleister WHERE id = ?').run(id); json(res, 200, { ok: true }); return true; }
    }
    json(res, 404, { error: 'Nicht gefunden.' });
    return true;
  };
}
