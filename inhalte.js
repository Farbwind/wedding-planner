// Inhalte, Gästebeiträge, Fotos und Sitzplan.
// Wird von server.js eingebunden: const behandle = inhalte({...}); if (await behandle(req, res, url)) return;

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { personenVon } from './essen.js';

// In der Verwaltung gepflegte Sammlungen
const SAMMLUNGEN = {
  geschichte: { titel: 120, zeit: 60, text: 4000, bild: 'bild' },
  quiz: { frage: 300, antworten: 'liste', richtig: 'zahl', erklaerung: 800 },
  fotos: { text: 200, bild: 'bild' },
};

export function inhalte({ db, send, json, str, int, sessionUser, limited, clientIp, DATA, gruppenAusListe }) {
  const BILDER = path.join(DATA, 'bilder');
  fs.mkdirSync(BILDER, { recursive: true });

  for (const [name, felder] of Object.entries(SAMMLUNGEN)) {
    const spalten = Object.entries(felder).map(([f, typ]) => (typ === 'zahl' ? `${f} INTEGER NOT NULL DEFAULT 0` : `${f} TEXT NOT NULL DEFAULT ''`));
    db.exec(`CREATE TABLE IF NOT EXISTS ${name} (id INTEGER PRIMARY KEY, sort INTEGER NOT NULL DEFAULT 0, ${spalten.join(', ')}, erstellt TEXT NOT NULL DEFAULT (datetime('now')))`);
  }
  db.exec(`
CREATE TABLE IF NOT EXISTS tische (id INTEGER PRIMARY KEY, sort INTEGER NOT NULL DEFAULT 0, name TEXT NOT NULL, plaetze INTEGER NOT NULL DEFAULT 8);
CREATE TABLE IF NOT EXISTS sitz (gast TEXT PRIMARY KEY, tisch INTEGER, sort INTEGER NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS gast_info (gast TEXT PRIMARY KEY, name TEXT NOT NULL DEFAULT '', gruppe TEXT NOT NULL DEFAULT '');
CREATE TABLE IF NOT EXISTS gaeste_extra (id INTEGER PRIMARY KEY, name TEXT NOT NULL, gruppe TEXT NOT NULL DEFAULT '');
`);

  // Raumplan (seit 1.9.0): Form, Lage, Größe und Drehung der Tische, dazu Objekte wie Bühne oder Tanzfläche
  for (const [spalte, typ] of [['form', "TEXT NOT NULL DEFAULT 'rund'"], ['x', 'REAL'], ['y', 'REAL'], ['breite', 'REAL NOT NULL DEFAULT 0'], ['hoehe', 'REAL NOT NULL DEFAULT 0'], ['drehung', 'REAL NOT NULL DEFAULT 0'], ['art', "TEXT NOT NULL DEFAULT 'tisch'"]])
    if (!db.prepare("SELECT 1 FROM pragma_table_info('tische') WHERE name = ?").get(spalte)) db.exec(`ALTER TABLE tische ADD COLUMN ${spalte} ${typ}`);
  const FORMEN = ['rund', 'rechteck', 'lang', 'oval'];
  const OBJEKTE = ['Bühne', 'Tanzfläche', 'Buffet', 'Bar', 'DJ', 'Eingang', 'Torte', 'Fotoecke'];
  const zahl = (v, min, max, standard) => (Number.isFinite(Number(v)) && v !== null && v !== '' ? Math.min(max, Math.max(min, Number(v))) : standard);
  // Lage und Form aus den Eingaben, nur die Felder, die mitgeschickt wurden
  function tischFelder(b, alt = {}) {
    const art = b.art === 'objekt' ? 'objekt' : (alt.art || 'tisch');
    return {
      art,
      form: FORMEN.includes(b.form) ? b.form : (alt.form || 'rund'),
      x: 'x' in b ? zahl(b.x, 0, 1200, null) : (alt.x ?? null),
      y: 'y' in b ? zahl(b.y, 0, 760, null) : (alt.y ?? null),
      breite: 'breite' in b ? zahl(b.breite, 30, 700, 0) : (alt.breite || 0),
      hoehe: 'hoehe' in b ? zahl(b.hoehe, 30, 500, 0) : (alt.hoehe || 0),
      drehung: 'drehung' in b ? zahl(b.drehung, -360, 360, 0) : (alt.drehung || 0),
    };
  }

  const jetzt = () => new Date().toISOString().replace('T', ' ').slice(0, 19);

  // Beispielinhalte, einmalig beim ersten Start angelegt. Danach gehören sie der Verwaltung (Reiter „Inhalte“).
  db.exec('CREATE TABLE IF NOT EXISTS vorlagen (name TEXT PRIMARY KEY)');
  const einmalig = (name, fn) => {
    if (db.prepare('SELECT 1 FROM vorlagen WHERE name = ?').get(name)) return;
    fn();
    db.prepare('INSERT INTO vorlagen (name) VALUES (?)').run(name);
  };
  einmalig('beispiel-geschichte', () => {
    const stationen = [
      ['Sommer 2018', 'Wie alles begann', 'Beispieltext: Hier erzählt ihr, wie ihr euch kennengelernt habt. Diesen Text, die Jahreszahl und das Foto ändert ihr in der Verwaltung unter „Inhalte“.'],
      ['Frühling 2023', 'Der Antrag', 'Beispieltext: Eine Station eurer Geschichte. Mit einer Leerzeile im Text beginnt ein neuer Absatz.'],
      ['Sommer 2028', 'Unsere Hochzeit', 'Und jetzt feiern wir mit euch.'],
    ];
    const ins = db.prepare('INSERT INTO geschichte (sort, zeit, titel, text, bild) VALUES (?, ?, ?, ?, ?)');
    stationen.forEach(([zeit, titel, text], i) => ins.run(i + 1, zeit, titel, text, ''));
  });
  einmalig('beispiel-quiz', () => {
    const fragen = [
      ['Beispielfrage: Wo haben wir uns kennengelernt?', ['Im Urlaub', 'Bei der Arbeit', 'Auf einer Party'], 1, 'Fragen, Antworten und diese Auflösung ändert ihr in der Verwaltung unter „Inhalte“.'],
      ['Beispielfrage: Wer hat den ersten Schritt gemacht?', ['Anna', 'Ben', 'Beide gleichzeitig'], 2, ''],
    ];
    const ins = db.prepare('INSERT INTO quiz (sort, frage, antworten, richtig, erklaerung) VALUES (?, ?, ?, ?, ?)');
    fragen.forEach(([frage, antworten, richtig, erk], i) => ins.run(i + 1, frage, JSON.stringify(antworten), richtig, erk));
  });

  async function leseJson(req, limit) {
    if (!String(req.headers['content-type'] || '').includes('application/json')) throw Object.assign(new Error('Falsches Format'), { status: 415 });
    const teile = []; let groesse = 0;
    for await (const c of req) {
      groesse += c.length;
      if (groesse > limit) throw Object.assign(new Error('Das Foto ist zu groß.'), { status: 413 });
      teile.push(c);
    }
    try { return JSON.parse(Buffer.concat(teile).toString('utf8') || '{}'); }
    catch { throw Object.assign(new Error('Ungültige Daten'), { status: 400 }); }
  }

  // JPEG ohne EXIF (Ort, Kamera) speichern. Der Browser verkleinert vorher, das hier ist die Absicherung.
  function ohneMetadaten(buf) {
    if (buf[0] !== 0xff || buf[1] !== 0xd8) return null;
    const teile = [buf.subarray(0, 2)];
    let i = 2;
    while (i + 4 <= buf.length) {
      if (buf[i] !== 0xff) return null;
      const marke = buf[i + 1];
      if (marke === 0xda) { teile.push(buf.subarray(i)); return Buffer.concat(teile); } // ab Bilddaten alles übernehmen
      const laenge = buf.readUInt16BE(i + 2);
      const ende = i + 2 + laenge;
      if (ende > buf.length) return null;
      if (!(marke === 0xe1 || marke === 0xed || marke === 0xfe)) teile.push(buf.subarray(i, ende)); // APP1 (EXIF/XMP), APP13, Kommentar weg
      i = ende;
    }
    return null;
  }
  function bildSpeichern(b) {
    if (!b || typeof b.daten !== 'string') return '';
    const roh = Buffer.from(b.daten.replace(/^data:image\/jpeg;base64,/, ''), 'base64');
    // Prüfsumme vom Browser: fängt verfälschte Übertragungen ab (der Heimserver hatte damit schon Probleme)
    if (b.sha256 && crypto.createHash('sha256').update(roh).digest('hex') !== b.sha256)
      throw Object.assign(new Error('Das Foto kam beschädigt an. Bitte noch einmal versuchen.'), { status: 422 });
    if (roh.length > 4 * 1024 * 1024) throw Object.assign(new Error('Das Foto ist zu groß.'), { status: 413 });
    const sauber = ohneMetadaten(roh);
    if (!sauber) throw Object.assign(new Error('Bitte ein Foto im JPG-Format hochladen.'), { status: 400 });
    const datei = `${crypto.randomBytes(12).toString('hex')}.jpg`;
    fs.writeFileSync(path.join(BILDER, datei), sauber);
    return datei;
  }
  function bildLoeschen(datei) {
    if (/^[a-f0-9]{24}\.jpg$/.test(datei || '')) fs.rmSync(path.join(BILDER, datei), { force: true });
  }

  const liste = (name) => db.prepare(`SELECT * FROM ${name} ORDER BY sort, id`).all().map((z) => {
    if (name === 'quiz') { try { z.antworten = JSON.parse(z.antworten || '[]'); } catch { z.antworten = []; } }
    return z;
  });
  function werteAus(name, b) {
    const w = {};
    for (const [f, typ] of Object.entries(SAMMLUNGEN[name])) {
      if (typ === 'bild') continue;
      if (typ === 'zahl') w[f] = int(b[f], 0, 99);
      else if (typ === 'liste') w[f] = JSON.stringify((Array.isArray(b[f]) ? b[f] : []).map((x) => str(x, 200)).filter(Boolean).slice(0, 8));
      else w[f] = str(b[f], typ);
    }
    return w;
  }

  // Sitzplan: aus jeder Zusage werden einzelne Personen
  const trenner = /\s*(?:,|;|\n|\+|&|\bund\b)\s*/i;
  function gaeste() {
    const info = new Map(db.prepare('SELECT * FROM gast_info').all().map((g) => [g.gast, g]));
    const sitz = new Map(db.prepare('SELECT * FROM sitz').all().map((s) => [s.gast, s]));
    const ausListe = gruppenAusListe ? gruppenAusListe() : new Map();
    const klein = (s) => String(s || '').toLowerCase().replace(/\s+/g, ' ').trim();
    const out = [];
    for (const r of db.prepare('SELECT * FROM responses WHERE attending = 1 ORDER BY name COLLATE NOCASE').all()) {
      const n = Math.max(1, r.persons);
      const personenListe = personenVon(r);
      let namen = (r.companions || '').split(trenner).map((t) => t.trim()).filter(Boolean);
      if (personenListe) namen = personenListe.map((p, i) => p.name || (i === 0 ? r.name : ''));
      else if (n === 1) namen = [r.name];
      else if (namen.length >= n) namen = namen.slice(0, n);
      else if (!namen.length && r.name.split(trenner).filter(Boolean).length === n) namen = r.name.split(trenner).map((t) => t.trim()).filter(Boolean);
      else namen = [r.name, ...namen];
      const liste = ausListe.get(r.id) || [];
      for (let i = 0; i < n; i++) {
        const key = `r${r.id}-${i}`;
        const g = info.get(key);
        // Gruppe aus der Gästeliste: passender Name, sonst der erste Eintrag dieser Antwort
        const ausGaesteliste = (liste.find((x) => klein(x.name) === klein(namen[i])) || liste[0])?.gruppe || '';
        out.push({ key, name: g?.name || namen[i] || `Begleitung ${i}`, haushalt: `r${r.id}`, haushaltName: r.name,
          gruppe: g?.gruppe || ausGaesteliste, tisch: sitz.get(key)?.tisch ?? null, sort: sitz.get(key)?.sort ?? 0,
          vegetarisch: personenListe ? personenListe[i]?.kost === 'vegetarisch' : !!r.vegetarian, vegan: personenListe ? personenListe[i]?.kost === 'vegan' : !!r.vegan });
      }
    }
    for (const x of db.prepare('SELECT * FROM gaeste_extra ORDER BY name COLLATE NOCASE').all()) {
      const key = `x${x.id}`;
      out.push({ key, name: x.name, haushalt: key, haushaltName: x.name, gruppe: info.get(key)?.gruppe || x.gruppe || '',
        tisch: sitz.get(key)?.tisch ?? null, sort: sitz.get(key)?.sort ?? 0, extra: true });
    }
    return out;
  }
  const csvZelle = (v) => { const s = String(v ?? ''); return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };


  async function behandle(req, res, url) {
    const p = url.pathname;
    const m = req.method;
    let t;

    // Fotos ausliefern
    if ((t = p.match(/^\/bilder\/([a-f0-9]{24}\.jpg)$/))) {
      const f = path.join(BILDER, t[1]);
      if (!fs.existsSync(f)) { send(res, 404, 'Nicht gefunden', 'text/plain; charset=utf-8'); return true; }
      send(res, 200, fs.readFileSync(f), 'image/jpeg', { 'Cache-Control': 'public, max-age=31536000, immutable' });
      return true;
    }

    // Öffentliche Daten für die Unterseiten
    if (p === '/api/seite' && m === 'GET') {
      json(res, 200, { geschichte: liste('geschichte'), quiz: liste('quiz'), fotos: liste('fotos') });
      return true;
    }

    if (!p.startsWith('/api/admin/')) return false;
    // Ab hier nur angemeldet
    const istNeu = ['/api/admin/inhalt', '/api/admin/bild', '/api/admin/sitzplan'];
    if (!istNeu.some((x) => p.startsWith(x))) return false;
    if (!sessionUser(req)) { json(res, 401, { error: 'Bitte anmelden.' }); return true; }

    if (p === '/api/admin/bild' && m === 'POST') {
      try {
        const b = await leseJson(req, 8 * 1024 * 1024);
        json(res, 200, { datei: bildSpeichern(b) });
      } catch (e) {
        // Im Protokoll festhalten, damit sich ein gescheiterter Upload später nachvollziehen lässt
        console.error('Foto-Upload:', e.message, req.headers['content-length'] || '');
        throw e;
      }
      return true;
    }

    // Sammlungen: Liste, anlegen, ändern, löschen, sortieren
    if ((t = p.match(/^\/api\/admin\/inhalt\/(geschichte|quiz|fotos)(?:\/(\d+|reihenfolge))?$/))) {
      const [, name, id] = t;
      if (!id && m === 'GET') { json(res, 200, liste(name)); return true; }
      if (id === 'reihenfolge' && m === 'POST') {
        const b = await leseJson(req, 64 * 1024);
        const up = db.prepare(`UPDATE ${name} SET sort = ? WHERE id = ?`);
        (b.ids || []).forEach((x, i) => up.run(i, int(x, 0, 1e9)));
        json(res, 200, { ok: true });
        return true;
      }
      if (!id && m === 'POST') {
        const b = await leseJson(req, 64 * 1024);
        const w = werteAus(name, b);
        if (SAMMLUNGEN[name].bild) w.bild = str(b.bild, 40);
        const max = db.prepare(`SELECT COALESCE(MAX(sort), 0) AS s FROM ${name}`).get().s;
        const felder = Object.keys(w);
        const r = db.prepare(`INSERT INTO ${name} (sort, ${felder.join(', ')}) VALUES (?, ${felder.map(() => '?').join(', ')})`).run(max + 1, ...felder.map((f) => w[f]));
        json(res, 200, { ok: true, id: Number(r.lastInsertRowid) });
        return true;
      }
      if (id && m === 'PUT') {
        const b = await leseJson(req, 64 * 1024);
        const w = werteAus(name, b);
        if (SAMMLUNGEN[name].bild && 'bild' in b) {
          const alt = db.prepare(`SELECT bild FROM ${name} WHERE id = ?`).get(Number(id))?.bild;
          if (alt && alt !== b.bild) bildLoeschen(alt);
          w.bild = str(b.bild, 40);
        }
        const felder = Object.keys(w);
        db.prepare(`UPDATE ${name} SET ${felder.map((f) => `${f} = ?`).join(', ')} WHERE id = ?`).run(...felder.map((f) => w[f]), Number(id));
        json(res, 200, { ok: true });
        return true;
      }
      if (id && m === 'DELETE') {
        if (SAMMLUNGEN[name].bild) bildLoeschen(db.prepare(`SELECT bild FROM ${name} WHERE id = ?`).get(Number(id))?.bild);
        db.prepare(`DELETE FROM ${name} WHERE id = ?`).run(Number(id));
        json(res, 200, { ok: true });
        return true;
      }
    }

    // Sitzplan
    if (p === '/api/admin/sitzplan' && m === 'GET') {
      const vorgemerkt = db.prepare("SELECT DISTINCT gruppe FROM einladung WHERE gruppe != ''").all().map((x) => x.gruppe);
      json(res, 200, { gaeste: gaeste(), tische: db.prepare('SELECT * FROM tische ORDER BY sort, id').all(), gruppen: vorgemerkt });
      return true;
    }
    if (p === '/api/admin/sitzplan/platz' && m === 'PUT') {
      // { gaeste: [key, ...], tisch: id|null, vor: key|null } setzt Gäste an einen Tisch, optional vor einen anderen Gast
      const b = await leseJson(req, 64 * 1024);
      const keys = (b.gaeste || []).map((k) => str(k, 40)).filter((k) => /^(r\d+-\d+|x\d+)$/.test(k));
      const tisch = b.tisch == null ? null : int(b.tisch, 0, 1e9);
      db.exec('BEGIN');
      try {
        const am = tisch == null ? [] : db.prepare('SELECT gast FROM sitz WHERE tisch = ? ORDER BY sort').all(tisch).map((x) => x.gast).filter((k) => !keys.includes(k));
        let pos = b.vor ? am.indexOf(str(b.vor, 40)) : -1;
        if (pos < 0) pos = am.length;
        am.splice(pos, 0, ...keys);
        const up = db.prepare('INSERT INTO sitz (gast, tisch, sort) VALUES (?, ?, ?) ON CONFLICT(gast) DO UPDATE SET tisch = excluded.tisch, sort = excluded.sort');
        if (tisch == null) keys.forEach((k, i) => up.run(k, null, i));
        else am.forEach((k, i) => up.run(k, tisch, i));
        db.exec('COMMIT');
      } catch (e) { db.exec('ROLLBACK'); throw e; }
      json(res, 200, { ok: true });
      return true;
    }
    if (p === '/api/admin/sitzplan/gast' && m === 'PUT') {
      const b = await leseJson(req, 16 * 1024);
      const key = str(b.gast, 40);
      if (!/^(r\d+-\d+|x\d+)$/.test(key)) { json(res, 400, { error: 'Unbekannter Gast.' }); return true; }
      db.prepare('INSERT INTO gast_info (gast, name, gruppe) VALUES (?, ?, ?) ON CONFLICT(gast) DO UPDATE SET name = excluded.name, gruppe = excluded.gruppe')
        .run(key, str(b.name, 80), str(b.gruppe, 60));
      json(res, 200, { ok: true });
      return true;
    }
    if (p === '/api/admin/sitzplan/gruppe' && m === 'PUT') {
      const b = await leseJson(req, 64 * 1024);
      const gruppe = str(b.gruppe, 60);
      const up = db.prepare("INSERT INTO gast_info (gast, name, gruppe) VALUES (?, '', ?) ON CONFLICT(gast) DO UPDATE SET gruppe = excluded.gruppe");
      for (const k of (b.gaeste || []).map((x) => str(x, 40)).filter((x) => /^(r\d+-\d+|x\d+)$/.test(x))) up.run(k, gruppe);
      json(res, 200, { ok: true });
      return true;
    }
    if (p === '/api/admin/sitzplan/extra' && m === 'POST') {
      const b = await leseJson(req, 16 * 1024);
      const name = str(b.name, 80);
      if (!name) { json(res, 400, { error: 'Bitte einen Namen eintragen.' }); return true; }
      db.prepare('INSERT INTO gaeste_extra (name, gruppe) VALUES (?, ?)').run(name, str(b.gruppe, 60));
      json(res, 200, { ok: true });
      return true;
    }
    if ((t = p.match(/^\/api\/admin\/sitzplan\/extra\/(\d+)$/)) && m === 'DELETE') {
      db.prepare('DELETE FROM gaeste_extra WHERE id = ?').run(Number(t[1]));
      db.prepare('DELETE FROM sitz WHERE gast = ?').run(`x${t[1]}`);
      db.prepare('DELETE FROM gast_info WHERE gast = ?').run(`x${t[1]}`);
      json(res, 200, { ok: true });
      return true;
    }
    if (p === '/api/admin/sitzplan/tisch' && m === 'POST') {
      const b = await leseJson(req, 16 * 1024);
      const max = db.prepare('SELECT COALESCE(MAX(sort), 0) AS s FROM tische').get().s;
      const anzahl = db.prepare('SELECT COUNT(*) AS n FROM tische').get().n;
      const f = tischFelder(b);
      const plaetze = f.art === 'objekt' ? 0 : (int(b.plaetze, 1, 40) || 8);
      const r = db.prepare('INSERT INTO tische (sort, name, plaetze, form, x, y, breite, hoehe, drehung, art) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
        .run(max + 1, str(b.name, 60) || (f.art === 'objekt' ? 'Objekt' : `Tisch ${anzahl + 1}`), plaetze, f.form, f.x, f.y, f.breite, f.hoehe, f.drehung, f.art);
      json(res, 200, { ok: true, id: Number(r.lastInsertRowid) });
      return true;
    }
    if ((t = p.match(/^\/api\/admin\/sitzplan\/tisch\/(\d+)$/))) {
      if (m === 'PUT') {
        const b = await leseJson(req, 16 * 1024);
        const alt = db.prepare('SELECT * FROM tische WHERE id = ?').get(Number(t[1]));
        if (!alt) { json(res, 404, { error: 'Nicht gefunden.' }); return true; }
        const f = tischFelder(b, alt);
        const plaetze = alt.art === 'objekt' ? 0 : ('plaetze' in b ? (int(b.plaetze, 1, 40) || 8) : alt.plaetze);
        db.prepare('UPDATE tische SET name = ?, plaetze = ?, form = ?, x = ?, y = ?, breite = ?, hoehe = ?, drehung = ? WHERE id = ?')
          .run('name' in b ? str(b.name, 60) || alt.name : alt.name, plaetze, f.form, f.x, f.y, f.breite, f.hoehe, f.drehung, alt.id);
        json(res, 200, { ok: true });
        return true;
      }
      if (m === 'DELETE') {
        db.prepare('UPDATE sitz SET tisch = NULL WHERE tisch = ?').run(Number(t[1]));
        db.prepare('DELETE FROM tische WHERE id = ?').run(Number(t[1]));
        json(res, 200, { ok: true });
        return true;
      }
    }
    if (p === '/api/admin/sitzplan.csv' && m === 'GET') {
      const tische = new Map(db.prepare('SELECT * FROM tische').all().map((x) => [x.id, x.name]));
      const zeilen = [['Tisch', 'Name', 'Gruppe', 'Antwort von', 'Essen']];
      const alle = gaeste().sort((a, b) => (tische.get(a.tisch) || '~').localeCompare(tische.get(b.tisch) || '~', 'de') || a.sort - b.sort);
      for (const g of alle) zeilen.push([tische.get(g.tisch) || 'ohne Platz', g.name, g.gruppe, g.haushaltName, [g.vegetarisch && 'vegetarisch', g.vegan && 'vegan'].filter(Boolean).join(', ')]);
      send(res, 200, '﻿' + zeilen.map((z) => z.map(csvZelle).join(';')).join('\r\n'), 'text/csv; charset=utf-8', { 'Content-Disposition': 'attachment; filename="sitzplan.csv"' });
      return true;
    }
    return false;
  }
  // Für Seiten, die den Sitzplan nur lesen (Dienstleister-Link)
  behandle.sitzplanDaten = () => ({ gaeste: gaeste(), tische: db.prepare('SELECT * FROM tische ORDER BY sort, id').all() });
  return behandle;
}
