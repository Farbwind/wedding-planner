// Gästefotos: Gäste laden während der Hochzeit Fotos hoch, sortiert nach Abschnitten (Standesamt, Kirche, Feier ...).
// Ablage getrennt von den Bildern der Website: /data/gaestefotos/<abschnitt>/, Vorschaubilder in /data/gaestefotos/_vorschau.
// Wird von server.js eingebunden: const behandle = gaestefotos({...}); if (await behandle(req, res, url)) return;

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import QRCode from 'qrcode';

const QR_OPTS = { errorCorrectionLevel: 'M', margin: 2, color: { dark: '#1d2430', light: '#ffffff' } };
const GROESSTES_FOTO = 30 * 1024 * 1024;

const slug = (s) => String(s || '').toLowerCase()
  .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
  .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'foto';
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const istJpeg = (b) => b.length > 4 && b[0] === 0xff && b[1] === 0xd8 && b[b.length - 2] === 0xff && b[b.length - 1] === 0xd9;

export function gaestefotos({ db, send, json, str, int, sessionUser, limited, clientIp, DATA, getSettings, PUBLIC_URL }) {
  const ORDNER = path.join(DATA, 'gaestefotos');
  const VORSCHAU = path.join(ORDNER, '_vorschau');
  fs.mkdirSync(VORSCHAU, { recursive: true });

  db.exec(`
CREATE TABLE IF NOT EXISTS foto_abschnitte (id INTEGER PRIMARY KEY, sort INTEGER NOT NULL DEFAULT 0, name TEXT NOT NULL,
  datum TEXT NOT NULL DEFAULT '', ordner TEXT NOT NULL, offen INTEGER NOT NULL DEFAULT 1);
CREATE TABLE IF NOT EXISTS gaestefotos (id INTEGER PRIMARY KEY, abschnitt_id INTEGER, name TEXT NOT NULL, datei TEXT NOT NULL,
  groesse INTEGER NOT NULL, crc INTEGER NOT NULL, breite INTEGER NOT NULL DEFAULT 0, hoehe INTEGER NOT NULL DEFAULT 0,
  versteckt INTEGER NOT NULL DEFAULT 0, erstellt TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS vorlagen (name TEXT PRIMARY KEY);
`);
  // Ab welcher Uhrzeit ein Abschnitt gilt. Damit wählt die Fotoseite am Hochzeitstag den passenden Abschnitt vor.
  if (!db.prepare("SELECT 1 FROM pragma_table_info('foto_abschnitte') WHERE name = 'ab'").get()) db.exec("ALTER TABLE foto_abschnitte ADD COLUMN ab TEXT NOT NULL DEFAULT ''");
  const uhrzeit = (t) => { const m = String(t || '').match(/(\d{1,2})[:.](\d{2})/); return m && Number(m[1]) < 24 && Number(m[2]) < 60 ? `${m[1].padStart(2, '0')}:${m[2]}` : ''; };
  const spaeter = (t, stunden) => { if (!t) return ''; const [h, m] = t.split(':').map(Number); return `${String(Math.min(23, h + stunden)).padStart(2, '0')}:${String(m).padStart(2, '0')}`; };
  // Feier ohne feste Uhrzeit („im Anschluss“): zwei Stunden nach der Kirche, in der Verwaltung änderbar
  const startZeiten = (s) => ({ Standesamt: uhrzeit(s.civil_time), Kirche: uhrzeit(s.church_time), Feier: uhrzeit(s.party_time) || spaeter(uhrzeit(s.church_time), 2) });

  // Ordnername bleibt beim Umbenennen gleich, damit nichts verschoben werden muss
  function neuerOrdner(name) {
    const basis = slug(name);
    let o = basis; let n = 2;
    while (db.prepare('SELECT 1 FROM foto_abschnitte WHERE ordner = ?').get(o) || o === '_vorschau') o = `${basis}-${n++}`;
    fs.mkdirSync(path.join(ORDNER, o), { recursive: true });
    return o;
  }
  function abschnittAnlegen(name, datum = '', offen = 1, ab = '') {
    const max = db.prepare('SELECT COALESCE(MAX(sort), 0) AS s FROM foto_abschnitte').get().s;
    return Number(db.prepare('INSERT INTO foto_abschnitte (sort, name, datum, ordner, offen, ab) VALUES (?, ?, ?, ?, ?, ?)')
      .run(max + 1, name, datum, neuerOrdner(name), offen ? 1 : 0, ab).lastInsertRowid);
  }
  // Startabschnitte einmalig aus den Angaben der Seite
  if (!db.prepare("SELECT 1 FROM vorlagen WHERE name = 'gaestefotos-abschnitte'").get()) {
    const s = getSettings();
    if (!db.prepare('SELECT 1 FROM foto_abschnitte').get()) {
      const z = startZeiten(s);
      abschnittAnlegen('Standesamt', s.civil_date, 1, z.Standesamt);
      abschnittAnlegen('Kirche', s.church_date, 1, z.Kirche);
      abschnittAnlegen('Feier', s.church_date, 1, z.Feier);
    }
    db.prepare("INSERT INTO vorlagen (name) VALUES ('gaestefotos-abschnitte')").run();
  }
  // Bestehende Startabschnitte bekommen einmalig ihre Uhrzeit
  if (!db.prepare("SELECT 1 FROM vorlagen WHERE name = 'gaestefotos-zeiten'").get()) {
    const z = startZeiten(getSettings());
    for (const [name, ab] of Object.entries(z)) db.prepare("UPDATE foto_abschnitte SET ab = ? WHERE name = ? AND ab = ''").run(ab, name);
    db.prepare("INSERT INTO vorlagen (name) VALUES ('gaestefotos-zeiten')").run();
  }

  const jetzt = () => new Date().toISOString().replace('T', ' ').slice(0, 19);
  const stempel = () => {
    const t = new Date().toLocaleString('sv-SE', { timeZone: 'Europe/Berlin' }); // 2027-06-19 14:31:05
    return t.replace(/-/g, '').replace(' ', '-').replace(/:/g, '');
  };
  const galerieAn = () => getSettings().galerie_gaeste !== '0';
  const abschnitte = (nurSichtbare) => db.prepare(`SELECT a.*, (SELECT COUNT(*) FROM gaestefotos f WHERE f.abschnitt_id = a.id${nurSichtbare ? ' AND f.versteckt = 0' : ''}) AS anzahl
    FROM foto_abschnitte a ORDER BY a.sort, a.id`).all();
  const pfadVon = (f) => {
    const a = db.prepare('SELECT ordner FROM foto_abschnitte WHERE id = ?').get(f.abschnitt_id);
    return path.join(ORDNER, a ? a.ordner : '_ohne-abschnitt', f.datei);
  };
  const fotoUrl = (id) => `${PUBLIC_URL}/fotos?a=${id}`;

  async function leseRoh(req, limit) {
    const teile = []; let groesse = 0;
    for await (const c of req) {
      groesse += c.length;
      if (groesse > limit) throw Object.assign(new Error('Das Foto ist zu groß.'), { status: 413 });
      teile.push(c);
    }
    return Buffer.concat(teile);
  }
  async function leseJson(req) {
    if (!String(req.headers['content-type'] || '').includes('application/json')) throw Object.assign(new Error('Falsches Format'), { status: 415 });
    try { return JSON.parse((await leseRoh(req, 64 * 1024)).toString('utf8') || '{}'); }
    catch { throw Object.assign(new Error('Ungültige Daten'), { status: 400 }); }
  }

  // ZIP ohne Kompression (Fotos lassen sich ohnehin kaum packen), mit ZIP64, falls es mehr als 4 GB werden.
  // Größe und CRC stehen schon in der Datenbank, deshalb kann der Download sofort starten.
  async function zipSenden(res, eintraege, dateiname) {
    res.writeHead(200, { 'Content-Type': 'application/zip', 'Content-Disposition': `attachment; filename="${dateiname}"`, 'Cache-Control': 'no-store' });
    let offset = 0;
    const schreib = (buf) => new Promise((ok, fehler) => {
      offset += buf.length;
      if (res.destroyed) return fehler(new Error('Abgebrochen'));
      if (res.write(buf)) ok(); else res.once('drain', ok);
    });
    const VOLL = 0xffffffff;
    const zentral = [];
    for (const e of eintraege) {
      const name = Buffer.from(e.pfad, 'utf8');
      const d = e.zeit;
      const zeit = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1);
      const datum = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
      const gross = e.groesse >= VOLL;
      const lokal = offset;
      const h = Buffer.alloc(30);
      h.writeUInt32LE(0x04034b50, 0); h.writeUInt16LE(gross ? 45 : 20, 4); h.writeUInt16LE(0x0800, 6); h.writeUInt16LE(0, 8);
      h.writeUInt16LE(zeit, 10); h.writeUInt16LE(datum, 12); h.writeUInt32LE(e.crc >>> 0, 14);
      h.writeUInt32LE(gross ? VOLL : e.groesse, 18); h.writeUInt32LE(gross ? VOLL : e.groesse, 22);
      let extra = Buffer.alloc(0);
      if (gross) { extra = Buffer.alloc(20); extra.writeUInt16LE(1, 0); extra.writeUInt16LE(16, 2); extra.writeBigUInt64LE(BigInt(e.groesse), 4); extra.writeBigUInt64LE(BigInt(e.groesse), 12); }
      h.writeUInt16LE(name.length, 26); h.writeUInt16LE(extra.length, 28);
      await schreib(Buffer.concat([h, name, extra]));
      for await (const stueck of fs.createReadStream(e.datei)) await schreib(stueck);
      zentral.push({ e, name, lokal, zeit, datum, gross });
    }
    const cdStart = offset;
    for (const z of zentral) {
      const felder = [];
      if (z.gross) felder.push(z.e.groesse, z.e.groesse);
      if (z.lokal >= VOLL) felder.push(z.lokal);
      const extra = Buffer.alloc(felder.length ? 4 + 8 * felder.length : 0);
      if (felder.length) { extra.writeUInt16LE(1, 0); extra.writeUInt16LE(8 * felder.length, 2); felder.forEach((v, i) => extra.writeBigUInt64LE(BigInt(v), 4 + 8 * i)); }
      const h = Buffer.alloc(46);
      h.writeUInt32LE(0x02014b50, 0); h.writeUInt16LE(45, 4); h.writeUInt16LE(felder.length ? 45 : 20, 6); h.writeUInt16LE(0x0800, 8); h.writeUInt16LE(0, 10);
      h.writeUInt16LE(z.zeit, 12); h.writeUInt16LE(z.datum, 14); h.writeUInt32LE(z.e.crc >>> 0, 16);
      h.writeUInt32LE(z.gross ? VOLL : z.e.groesse, 20); h.writeUInt32LE(z.gross ? VOLL : z.e.groesse, 24);
      h.writeUInt16LE(z.name.length, 28); h.writeUInt16LE(extra.length, 30); h.writeUInt16LE(0, 32);
      h.writeUInt16LE(0, 34); h.writeUInt16LE(0, 36); h.writeUInt32LE(0, 38); h.writeUInt32LE(Math.min(z.lokal, VOLL), 42);
      await schreib(Buffer.concat([h, z.name, extra]));
    }
    const cdGroesse = offset - cdStart;
    const anzahl = zentral.length;
    if (anzahl >= 0xffff || cdStart >= VOLL || cdGroesse >= VOLL) {
      const z64 = offset;
      const r = Buffer.alloc(56);
      r.writeUInt32LE(0x06064b50, 0); r.writeBigUInt64LE(44n, 4); r.writeUInt16LE(45, 12); r.writeUInt16LE(45, 14);
      r.writeUInt32LE(0, 16); r.writeUInt32LE(0, 20); r.writeBigUInt64LE(BigInt(anzahl), 24); r.writeBigUInt64LE(BigInt(anzahl), 32);
      r.writeBigUInt64LE(BigInt(cdGroesse), 40); r.writeBigUInt64LE(BigInt(cdStart), 48);
      const l = Buffer.alloc(20);
      l.writeUInt32LE(0x07064b50, 0); l.writeUInt32LE(0, 4); l.writeBigUInt64LE(BigInt(z64), 8); l.writeUInt32LE(1, 16);
      await schreib(Buffer.concat([r, l]));
    }
    const ende = Buffer.alloc(22);
    ende.writeUInt32LE(0x06054b50, 0); ende.writeUInt16LE(0, 4); ende.writeUInt16LE(0, 6);
    ende.writeUInt16LE(Math.min(anzahl, 0xffff), 8); ende.writeUInt16LE(Math.min(anzahl, 0xffff), 10);
    ende.writeUInt32LE(Math.min(cdGroesse, VOLL), 12); ende.writeUInt32LE(Math.min(cdStart, VOLL), 16); ende.writeUInt16LE(0, 20);
    await schreib(ende);
    res.end();
  }

  // Druckvorlage: eine Karte pro offenem Abschnitt zum Aufstellen auf der Hochzeit
  async function aufsteller() {
    const s = getSettings();
    const liste = db.prepare('SELECT * FROM foto_abschnitte WHERE offen = 1 ORDER BY sort, id').all();
    const host = new URL(PUBLIC_URL).host;
    const karten = [];
    for (const a of liste) {
      const svg = await QRCode.toString(fotoUrl(a.id), { ...QR_OPTS, type: 'svg' });
      karten.push(`<section class="karte">
        <p class="paar">${esc(s.couple)}</p>
        <h1>Teilt eure Fotos!</h1>
        <p class="abschnitt">${esc(a.name)}</p>
        <div class="qr">${svg}</div>
        <ol><li>Kamera öffnen und den Code scannen</li><li>Namen eintragen</li><li>Fotos auswählen, fertig</li></ol>
        <p class="adresse">oder ${esc(host)}/fotos</p>
      </section>`);
    }
    return `<!doctype html><html lang="de"><head><meta charset="utf-8"><title>Aufsteller Gästefotos</title>
<style>
@font-face{font-family:"Cormorant Garamond";src:url(/fonts/cormorant-garamond-latin-500-normal.woff2) format("woff2");font-weight:500}
@font-face{font-family:"Hanken Grotesk";src:url(/fonts/hanken-grotesk-latin-400-normal.woff2) format("woff2");font-weight:400}
@font-face{font-family:"Hanken Grotesk";src:url(/fonts/hanken-grotesk-latin-600-normal.woff2) format("woff2");font-weight:600}
@page{size:A4;margin:0}
*{box-sizing:border-box}body{margin:0;font-family:"Hanken Grotesk",system-ui,sans-serif;color:#1f2b23;background:#e9ece6}
.knopf{position:fixed;top:16px;right:16px;font:600 15px "Hanken Grotesk",sans-serif;background:#2e4636;color:#fff;border:0;border-radius:999px;padding:12px 22px;cursor:pointer}
main{display:grid;grid-template-columns:105mm 105mm;justify-content:center;gap:0;padding:20px 0}
.karte{width:105mm;height:148.5mm;background:#fdfdfa;text-align:center;padding:12mm 10mm 9mm;display:flex;flex-direction:column;align-items:center;outline:1px dashed #b9c1b5;break-inside:avoid}
.paar{margin:0;font:500 15pt "Cormorant Garamond",serif;color:#a8864e;letter-spacing:.04em}
h1{margin:2mm 0 0;font:500 27pt/1 "Cormorant Garamond",serif;color:#2e4636}
.abschnitt{margin:3mm 0 0;font-weight:600;font-size:10pt;letter-spacing:.14em;text-transform:uppercase;color:#536156}
.qr{width:52mm;margin:5mm 0 3mm}.qr svg{width:100%;height:auto;display:block}
ol{margin:0;padding:0 0 0 5mm;text-align:left;font-size:9.5pt;line-height:1.55;color:#1f2b23}
.adresse{margin:auto 0 0;font-size:8.5pt;color:#536156}
@media print{body{background:none}.knopf{display:none}main{padding:0}}
</style></head><body>
<button class="knopf" onclick="print()">Drucken</button>
<main>${karten.join('') || '<p>Kein Abschnitt ist offen. Öffnet in der Verwaltung mindestens einen Abschnitt.</p>'}</main>
</body></html>`;
  }

  return async function behandle(req, res, url) {
    const p = url.pathname;
    const m = req.method;
    let t;

    // Öffentlich: Abschnitte und sichtbare Fotos
    if (p === '/api/gaestefotos' && m === 'GET') {
      const galerie = galerieAn();
      json(res, 200, {
        galerie,
        abschnitte: abschnitte(true).map((a) => ({ id: a.id, name: a.name, datum: a.datum, ab: a.ab, offen: !!a.offen, anzahl: galerie ? a.anzahl : 0 })),
        fotos: galerie ? db.prepare('SELECT id, abschnitt_id, name, breite, hoehe, erstellt FROM gaestefotos WHERE versteckt = 0 ORDER BY id DESC').all() : [],
      });
      return true;
    }

    // Öffentlich: Foto hochladen. Körper = Vorschau + Foto (beide JPEG), dazu Prüfsumme über alles.
    if (p === '/api/gaestefotos' && m === 'POST') {
      // Auf der Feier teilen sich viele Gäste dasselbe WLAN, also eine IP: Grenze großzügig
      if (limited(`gfoto:${clientIp(req)}`, 2000, 3600_000)) { json(res, 429, { error: 'Gerade kommen sehr viele Fotos an. Bitte gleich noch einmal versuchen.' }); return true; }
      const a = db.prepare('SELECT * FROM foto_abschnitte WHERE id = ?').get(int(url.searchParams.get('abschnitt'), 0, 1e9));
      if (!a) { json(res, 400, { error: 'Bitte wählt aus, wo die Fotos entstanden sind.', field: 'abschnitt' }); return true; }
      if (!a.offen) { json(res, 403, { error: `Für „${a.name}“ ist das Hochladen gerade geschlossen.` }); return true; }
      let name = '';
      try { name = str(decodeURIComponent(String(req.headers['x-name'] || '')), 80); } catch { /* ungültig */ }
      if (name.length < 2) { json(res, 400, { error: 'Bitte trag deinen Namen ein.', field: 'name' }); return true; }
      const roh = await leseRoh(req, GROESSTES_FOTO);
      const sha = String(req.headers['x-sha256'] || '');
      if (crypto.createHash('sha256').update(roh).digest('hex') !== sha) { json(res, 422, { error: 'Das Foto kam beschädigt an. Es wird noch einmal gesendet.' }); return true; }
      const vl = int(req.headers['x-vorschau-laenge'], 0, roh.length);
      const vorschau = roh.subarray(0, vl);
      const bild = roh.subarray(vl);
      if (!istJpeg(vorschau) || !istJpeg(bild)) { json(res, 400, { error: 'Bitte nur Fotos hochladen.' }); return true; }
      const datei = `${stempel()}-${slug(name).slice(0, 24)}-${crypto.randomBytes(3).toString('hex')}.jpg`;
      fs.mkdirSync(path.join(ORDNER, a.ordner), { recursive: true });
      fs.writeFileSync(path.join(ORDNER, a.ordner, datei), bild);
      fs.writeFileSync(path.join(VORSCHAU, datei), vorschau);
      const r = db.prepare('INSERT INTO gaestefotos (abschnitt_id, name, datei, groesse, crc, breite, hoehe, erstellt) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
        .run(a.id, name, datei, bild.length, zlib.crc32(bild), int(req.headers['x-breite'], 0, 20000), int(req.headers['x-hoehe'], 0, 20000), jetzt());
      json(res, 200, { ok: true, id: Number(r.lastInsertRowid) });
      return true;
    }

    // Fotos ausliefern: für Gäste nur bei offener Galerie, angemeldet immer
    if ((t = p.match(/^\/gaestefotos\/(\d+)(\/vorschau)?\.jpg$/)) && m === 'GET') {
      const f = db.prepare('SELECT * FROM gaestefotos WHERE id = ?').get(Number(t[1]));
      const darf = f && (sessionUser(req) || (galerieAn() && !f.versteckt));
      const datei = f && (t[2] ? path.join(VORSCHAU, f.datei) : pfadVon(f));
      if (!darf || !fs.existsSync(datei)) { send(res, 404, 'Nicht gefunden', 'text/plain; charset=utf-8'); return true; }
      const extra = { 'Cache-Control': 'private, max-age=600' };
      if (url.searchParams.has('download')) extra['Content-Disposition'] = `attachment; filename="${f.datei}"`;
      res.writeHead(200, { 'Content-Type': 'image/jpeg', 'Content-Length': fs.statSync(datei).size, 'X-Content-Type-Options': 'nosniff', ...extra });
      fs.createReadStream(datei).pipe(res);
      return true;
    }

    if (!p.startsWith('/api/admin/gaestefotos')) return false;
    if (!sessionUser(req)) { json(res, 401, { error: 'Bitte anmelden.' }); return true; }

    if (p === '/api/admin/gaestefotos' && m === 'GET') {
      json(res, 200, {
        galerie: galerieAn(),
        publicUrl: PUBLIC_URL,
        abschnitte: abschnitte(false).map((a) => ({ ...a, url: fotoUrl(a.id) })),
        fotos: db.prepare('SELECT id, abschnitt_id, name, datei, groesse, breite, hoehe, versteckt, erstellt FROM gaestefotos ORDER BY id DESC').all(),
      });
      return true;
    }
    if (p === '/api/admin/gaestefotos/abschnitt' && m === 'POST') {
      const b = await leseJson(req);
      const name = str(b.name, 60);
      if (!name) { json(res, 400, { error: 'Bitte einen Namen eintragen.' }); return true; }
      json(res, 200, { ok: true, id: abschnittAnlegen(name, /^\d{4}-\d{2}-\d{2}$/.test(b.datum || '') ? b.datum : '', b.offen !== false, uhrzeit(b.ab)) });
      return true;
    }
    if ((t = p.match(/^\/api\/admin\/gaestefotos\/abschnitt\/(\d+)$/))) {
      const id = Number(t[1]);
      const a = db.prepare('SELECT * FROM foto_abschnitte WHERE id = ?').get(id);
      if (!a) { json(res, 404, { error: 'Nicht gefunden.' }); return true; }
      if (m === 'PUT') {
        const b = await leseJson(req);
        db.prepare('UPDATE foto_abschnitte SET name = ?, datum = ?, offen = ?, ab = ? WHERE id = ?').run(
          'name' in b ? str(b.name, 60) || a.name : a.name,
          'datum' in b ? (/^\d{4}-\d{2}-\d{2}$/.test(b.datum || '') ? b.datum : '') : a.datum,
          'offen' in b ? (b.offen ? 1 : 0) : a.offen,
          'ab' in b ? uhrzeit(b.ab) : a.ab, id);
        json(res, 200, { ok: true });
        return true;
      }
      if (m === 'DELETE') {
        if (db.prepare('SELECT 1 FROM gaestefotos WHERE abschnitt_id = ?').get(id)) { json(res, 409, { error: 'In diesem Abschnitt liegen noch Fotos. Verschiebt oder löscht sie zuerst.' }); return true; }
        db.prepare('DELETE FROM foto_abschnitte WHERE id = ?').run(id);
        fs.rmSync(path.join(ORDNER, a.ordner), { recursive: true, force: true });
        json(res, 200, { ok: true });
        return true;
      }
    }
    if (p === '/api/admin/gaestefotos/reihenfolge' && m === 'POST') {
      const b = await leseJson(req);
      const up = db.prepare('UPDATE foto_abschnitte SET sort = ? WHERE id = ?');
      (b.ids || []).forEach((x, i) => up.run(i + 1, int(x, 0, 1e9)));
      json(res, 200, { ok: true });
      return true;
    }
    if ((t = p.match(/^\/api\/admin\/gaestefotos\/foto\/(\d+)$/))) {
      const f = db.prepare('SELECT * FROM gaestefotos WHERE id = ?').get(Number(t[1]));
      if (!f) { json(res, 404, { error: 'Nicht gefunden.' }); return true; }
      if (m === 'PATCH') {
        const b = await leseJson(req);
        if ('versteckt' in b) db.prepare('UPDATE gaestefotos SET versteckt = ? WHERE id = ?').run(b.versteckt ? 1 : 0, f.id);
        if ('abschnitt_id' in b) {
          const ziel = db.prepare('SELECT * FROM foto_abschnitte WHERE id = ?').get(int(b.abschnitt_id, 0, 1e9));
          if (ziel && ziel.id !== f.abschnitt_id) {
            const alt = pfadVon(f);
            fs.mkdirSync(path.join(ORDNER, ziel.ordner), { recursive: true });
            if (fs.existsSync(alt)) fs.renameSync(alt, path.join(ORDNER, ziel.ordner, f.datei));
            db.prepare('UPDATE gaestefotos SET abschnitt_id = ? WHERE id = ?').run(ziel.id, f.id);
          }
        }
        json(res, 200, { ok: true });
        return true;
      }
      if (m === 'DELETE') {
        fs.rmSync(pfadVon(f), { force: true });
        fs.rmSync(path.join(VORSCHAU, f.datei), { force: true });
        db.prepare('DELETE FROM gaestefotos WHERE id = ?').run(f.id);
        json(res, 200, { ok: true });
        return true;
      }
    }
    if (p === '/api/admin/gaestefotos/zip' && m === 'GET') {
      const nur = int(url.searchParams.get('abschnitt'), 0, 1e9);
      const liste = db.prepare(`SELECT f.*, a.name AS abschnitt FROM gaestefotos f LEFT JOIN foto_abschnitte a ON a.id = f.abschnitt_id
        ${nur ? 'WHERE f.abschnitt_id = ?' : ''} ORDER BY a.sort, f.id`).all(...(nur ? [nur] : []));
      const ordnerName = (n) => String(n || 'Ohne Abschnitt').replace(/[\\/:*?"<>|]+/g, '-').trim() || 'Ohne Abschnitt';
      const eintraege = liste.map((f) => ({ pfad: `${ordnerName(f.abschnitt)}/${f.datei}`, datei: pfadVon(f), groesse: f.groesse, crc: f.crc, zeit: new Date(`${f.erstellt.replace(' ', 'T')}Z`) }))
        .filter((e) => fs.existsSync(e.datei));
      const name = nur ? `gaestefotos-${slug(liste[0]?.abschnitt || 'abschnitt')}.zip` : 'gaestefotos-alle.zip';
      try { await zipSenden(res, eintraege, name); } catch { res.destroy(); }
      return true;
    }
    if ((t = p.match(/^\/api\/admin\/gaestefotos\/qr\/(\d+|alle)\.(svg|png)$/)) && m === 'GET') {
      const ziel = t[1] === 'alle' ? `${PUBLIC_URL}/fotos` : fotoUrl(Number(t[1]));
      const a = t[1] === 'alle' ? null : db.prepare('SELECT name FROM foto_abschnitte WHERE id = ?').get(Number(t[1]));
      const fname = `qr-fotos-${a ? slug(a.name) : 'alle'}.${t[2]}`;
      const dl = url.searchParams.has('download') ? { 'Content-Disposition': `attachment; filename="${fname}"` } : {};
      if (t[2] === 'svg') send(res, 200, await QRCode.toString(ziel, { ...QR_OPTS, type: 'svg' }), 'image/svg+xml', dl);
      else send(res, 200, await QRCode.toBuffer(ziel, { ...QR_OPTS, width: 1200 }), 'image/png', dl);
      return true;
    }
    if (p === '/api/admin/gaestefotos/aufsteller' && m === 'GET') {
      send(res, 200, await aufsteller(), 'text/html; charset=utf-8');
      return true;
    }
    json(res, 404, { error: 'Nicht gefunden.' });
    return true;
  };
}
