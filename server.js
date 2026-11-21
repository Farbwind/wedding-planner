// Hochzeitsseite mit Verwaltung: Zusagen, Gästeliste, Sitzplan, To-dos und Kosten.
// Node 24 ohne Framework, Daten in SQLite (node:sqlite) im Volume /data.

import http from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import QRCode from 'qrcode';
import { inhalte } from './inhalte.js';
import { seitenGeruest } from './seiten.js';
import { planung } from './planung.js';
import { gaestefotos } from './gaestefotos.js';
import { ablauf } from './ablauf.js';
import { personenVon, kostZahlen, bereinigen } from './essen.js';
import { bereinigen as designPruefen, standardDesign, VORLAGEN, SCHRIFTEN, SEKTIONEN, ELEMENTE, HEROS, BLOCKTYPEN, STILE } from './design.js';

const VERSION = '2.1.0';
const PORT = Number(process.env.PORT || 3000);
const DATA = process.env.DATA_DIR || './data';
const PUBLIC_URL = (process.env.PUBLIC_URL || 'http://localhost:8080').replace(/\/$/, '');
const PUB = path.join(import.meta.dirname, 'public');
// Zugänge zur Verwaltung, per Umgebungsvariable ADMIN_USERS änderbar (Namen mit Komma getrennt)
const USERS = (process.env.ADMIN_USERS || 'Anna,Ben').split(',').map((x) => x.trim()).filter(Boolean).slice(0, 6);

fs.mkdirSync(DATA, { recursive: true });
const db = new DatabaseSync(path.join(DATA, 'hochzeit.db'));
db.exec(`
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS invites (
  id INTEGER PRIMARY KEY,
  code TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  max_persons INTEGER NOT NULL DEFAULT 2,
  civil INTEGER NOT NULL DEFAULT 0,
  note TEXT NOT NULL DEFAULT '',
  opened_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS responses (
  id INTEGER PRIMARY KEY,
  invite_id INTEGER REFERENCES invites(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  attending INTEGER NOT NULL,
  persons INTEGER NOT NULL DEFAULT 0,
  civil INTEGER NOT NULL DEFAULT 0,
  companions TEXT NOT NULL DEFAULT '',
  diet TEXT NOT NULL DEFAULT '',
  message TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE UNIQUE INDEX IF NOT EXISTS responses_invite ON responses(invite_id) WHERE invite_id IS NOT NULL;
CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS users (name TEXT PRIMARY KEY, pw TEXT);
CREATE TABLE IF NOT EXISTS sessions (token TEXT PRIMARY KEY, user TEXT NOT NULL, expires INTEGER NOT NULL);
`);
// Gäste ohne Pass bekommen einen Schlüssel, mit dem sie ihre Antwort später ändern können
if (!db.prepare("SELECT 1 FROM pragma_table_info('responses') WHERE name = 'token'").get()) db.exec("ALTER TABLE responses ADD COLUMN token TEXT");
// Essenswünsche als Haken (seit 2.3.0), freiwillig
for (const spalte of ['vegetarian', 'vegan'])
  if (!db.prepare("SELECT 1 FROM pragma_table_info('responses') WHERE name = ?").get(spalte))
    db.exec(`ALTER TABLE responses ADD COLUMN ${spalte} INTEGER NOT NULL DEFAULT 0`);
// Personenliste mit Essenswunsch je Person (seit 1.8.0), JSON
if (!db.prepare("SELECT 1 FROM pragma_table_info('responses') WHERE name = 'personen'").get()) db.exec("ALTER TABLE responses ADD COLUMN personen TEXT NOT NULL DEFAULT ''");
// Songwunsch und Beitrag der Gäste (seit 1.5.0), freiwillig
for (const spalte of ['song', 'beitrag'])
  if (!db.prepare("SELECT 1 FROM pragma_table_info('responses') WHERE name = ?").get(spalte))
    db.exec(`ALTER TABLE responses ADD COLUMN ${spalte} TEXT NOT NULL DEFAULT ''`);
for (const u of USERS) db.prepare('INSERT OR IGNORE INTO users (name, pw) VALUES (?, NULL)').run(u);
// Erstes Passwort per Umgebungsvariable ADMIN_PASSWORD (mindestens 8 Zeichen), nur für Zugänge ohne Passwort.
// Praktisch, wenn der Server im Internet steht und das Passwort nicht im Heimnetz gesetzt werden kann.
if ((process.env.ADMIN_PASSWORD || '').length >= 8)
  for (const u of db.prepare('SELECT name FROM users WHERE pw IS NULL').all()) db.prepare('UPDATE users SET pw = ? WHERE name = ?').run(hashPw(process.env.ADMIN_PASSWORD), u.name);

// Angaben, die das Paar in der Verwaltung (Reiter „Angaben“) pflegt. Das hier sind nur die Startwerte.
const DEFAULTS = {
  couple: 'Anna & Ben',
  civil_mode: 'all', // all = alle sehen das Standesamt, marked = nur markierte Einladungen
  civil_date: '2028-06-09',
  civil_time: '11:00',
  civil_place: 'Standesamt',
  civil_address: 'Musterstraße 1, 12345 Musterstadt',
  civil_map: '',
  civil_note: 'Im kleinen Kreis, anschließend gibt es einen Sektempfang.',
  church_date: '2028-06-10',
  church_time: '14:00',
  church_place: 'Stadtkirche',
  church_address: 'Kirchplatz 1, 12345 Musterstadt',
  church_map: '',
  party_time: 'im Anschluss',
  party_place: 'Festsaal am See',
  party_address: 'Seestraße 5, 12345 Musterstadt',
  party_map: '',
  party_note: '',
  deadline: '2028-04-01',
  contact: '',
  gift: 'Das schönste Geschenk ist, dass ihr mit uns feiert. Wenn ihr uns trotzdem etwas schenken möchtet, freuen wir uns über einen Beitrag zu unserer gemeinsamen Zukunft.',
  welcome: 'Wir freuen uns riesig, diesen Tag mit euch zu feiern.',
  max_persons_open: '6',
  // Impressum und Datenschutz
  imp_names: '',
  imp_address: '',
  imp_email: '',
  imp_phone: '',
  delete_after: '2028-09-30', // danach werden alle Antworten automatisch gelöscht
  // Gut zu wissen
  info_dresscode: 'Kommt so, wie ihr euch wohlfühlt. Festlich, aber bequem genug zum Tanzen.',
  info_spiele: 'Wenn ihr eine Überraschung plant, sprecht sie bitte mit unseren Trauzeugen ab.',
  // Kontakt
  paar_tel: '',
  paar_mail: '',
  tz1_name: '', tz1_rolle: 'Trauzeugin', tz1_tel: '', tz1_mail: '',
  tz2_name: '', tz2_rolle: 'Trauzeuge', tz2_tel: '', tz2_mail: '',
  // Platz pro Tag, für die Übersicht in der Gästeliste
  platz_standesamt: '', platz_feier: '',
  // Gästefotos: Galerie auf /fotos für Gäste sichtbar ('1') oder nur in der Verwaltung ('0')
  galerie_gaeste: '1',
  // Wer die Fotoseite nutzen darf: 'offen' (jeder mit dem Link) oder 'qr' (nur mit dem Schlüssel aus den gedruckten QR-Codes)
  galerie_zugang: 'offen',
  // Zusage: Felder für Songwunsch und Beitrag (Rede, Lied, Spiel) anzeigen ('1') oder nicht ('0')
  zusage_song: '1',
  zusage_beitrag: '1',
  // Design: Haupt-, Hintergrund- und Textfarbe der Gästeseite als #rrggbb, leer = Standard aus style.css
  design_akzent: '',
  design_grund: '',
  design_text: '',
};
const getSettings = () => {
  const s = { ...DEFAULTS };
  for (const r of db.prepare('SELECT key, value FROM settings').all()) if (r.key in DEFAULTS) s[r.key] = r.value;
  return s;
};

// Hilfsfunktionen
const now = () => new Date().toISOString().replace('T', ' ').slice(0, 19);
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
function newCode() {
  for (;;) {
    let c = '';
    const b = crypto.randomBytes(6);
    for (const x of b) c += CODE_ALPHABET[x % CODE_ALPHABET.length];
    if (!db.prepare('SELECT 1 FROM invites WHERE code = ?').get(c)) return c;
  }
}
const normCode = (c) => String(c || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12);
const str = (v, max = 500) => String(v ?? '').replace(/\u0000/g, '').trim().slice(0, max);
const int = (v, lo, hi) => Math.max(lo, Math.min(hi, Number.parseInt(v, 10) || 0));

function hashPw(pw) {
  const salt = crypto.randomBytes(16).toString('hex');
  return `${salt}:${crypto.scryptSync(pw, salt, 64).toString('hex')}`;
}
function checkPw(pw, stored) {
  if (!stored) return false;
  const [salt, hash] = stored.split(':');
  const a = Buffer.from(hash, 'hex');
  const b = crypto.scryptSync(pw, salt, 64);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function clientIp(req) {
  return String(req.headers['cf-connecting-ip'] || req.socket.remoteAddress || '');
}
// Ersteinrichtung eines Passworts nur direkt im Heimnetz, nie über den Tunnel
function fromHomeNetwork(req) {
  if (req.headers['cf-connecting-ip'] || req.headers['cf-ray'] || req.headers['x-forwarded-for']) return false;
  const ip = String(req.socket.remoteAddress || '').replace(/^::ffff:/, '');
  return /^(127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|::1$)/.test(ip);
}

const buckets = new Map();
function limited(key, max, windowMs) {
  const t = Date.now();
  const b = buckets.get(key) || [];
  const recent = b.filter((x) => t - x < windowMs);
  recent.push(t);
  buckets.set(key, recent);
  return recent.length > max;
}
// Antworten nach dem in der Datenschutzerklärung genannten Datum löschen
function altesLoeschen() {
  const bis = getSettings().delete_after;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(bis)) return;
  const heute = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Berlin' });
  if (heute > bis) {
    const r = db.prepare('DELETE FROM responses').run();
    if (r.changes) console.log(`${r.changes} Antworten nach Ablauf (${bis}) gelöscht`);
  }
}
setInterval(() => {
  const t = Date.now();
  for (const [k, v] of buckets) if (!v.some((x) => t - x < 3600_000)) buckets.delete(k);
  db.prepare('DELETE FROM sessions WHERE expires < ?').run(t);
  altesLoeschen();
}, 600_000).unref();
setTimeout(altesLoeschen, 5000).unref();

function cookies(req) {
  const out = {};
  for (const part of String(req.headers.cookie || '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}
function sessionUser(req) {
  const t = cookies(req).hz_s;
  if (!t) return null;
  const s = db.prepare('SELECT user, expires FROM sessions WHERE token = ?').get(t);
  return s && s.expires > Date.now() ? s.user : null;
}
const isHttps = (req) => req.headers['x-forwarded-proto'] === 'https' || !!req.headers['cf-ray'];

function send(res, status, body, type = 'application/json; charset=utf-8', extra = {}) {
  const data = typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': type,
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'same-origin',
    ...extra,
  });
  res.end(data);
}
const json = (res, status, obj, extra) => send(res, status, obj, undefined, extra);

async function readBody(req, limit = 64 * 1024) {
  const chunks = [];
  let size = 0;
  for await (const c of req) {
    size += c.length;
    if (size > limit) throw Object.assign(new Error('Zu groß'), { status: 413 });
    chunks.push(c);
  }
  return Buffer.concat(chunks);
}
async function readJson(req, limit) {
  if (!String(req.headers['content-type'] || '').includes('application/json'))
    throw Object.assign(new Error('Falsches Format'), { status: 415 });
  try { return JSON.parse((await readBody(req, limit)).toString('utf8') || '{}'); }
  catch { throw Object.assign(new Error('Ungültige Daten'), { status: 400 }); }
}

const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.png': 'image/png', '.jpg': 'image/jpeg', '.ico': 'image/x-icon',
  '.webmanifest': 'application/manifest+json',
};
function serveStatic(req, res, rel) {
  const file = path.normalize(path.join(PUB, rel));
  if (!file.startsWith(PUB)) return send(res, 404, 'Nicht gefunden', 'text/plain');
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) return send(res, 404, 'Nicht gefunden', 'text/plain; charset=utf-8');
    const long = rel.startsWith('/fonts/') || rel.startsWith('/img/');
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(file)] || 'application/octet-stream',
      'Cache-Control': long ? 'public, max-age=31536000, immutable' : 'no-cache',
      'X-Content-Type-Options': 'nosniff',
    });
    fs.createReadStream(file).pipe(res);
  });
}

// Seiten mit Versionsnummer an CSS und JS ausliefern. Cloudflare setzt für diese
// Dateien eigenmächtig 4 Stunden Browser-Cache, so holt jedes Update sofort die neue Fassung.
const htmlCache = new Map();
function serveHtml(res, name) {
  if (!htmlCache.has(name)) {
    const roh = fs.readFileSync(path.join(PUB, name), 'utf8');
    htmlCache.set(name, roh.replace(/(href|src)="(\/[\w/-]+\.(?:css|js))"/g, `$1="$2?v=${VERSION}"`));
  }
  send(res, 200, htmlCache.get(name), 'text/html; charset=utf-8', { 'Cache-Control': 'no-cache' });
}

// Kalenderdatei (.ics) aus den aktuellen Angaben. Ohne Uhrzeit wird es ein Ganztagstermin.
function kalender(welche) {
  const s = getSettings();
  const uhrzeit = (t) => {
    const m = String(t || '').match(/(\d{1,2})[:.](\d{2})/) || String(t || '').match(/(\d{1,2})\s*uhr/i);
    if (!m) return null;
    const h = Number(m[1]); const min = Number(m[2] || 0);
    return h < 24 && min < 60 ? [h, min] : null;
  };
  const zwei = (n) => String(n).padStart(2, '0');
  const tag = (iso) => iso.replace(/-/g, '');
  const naechsterTag = (iso) => { const d = new Date(`${iso}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + 1); return d.toISOString().slice(0, 10).replace(/-/g, ''); };
  const text = (v) => String(v ?? '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
  const falten = (zeile) => { // RFC 5545: höchstens 75 Bytes pro Zeile
    const out = []; let rest = Buffer.from(zeile, 'utf8');
    while (rest.length > 75) {
      let n = out.length ? 74 : 75;
      while ((rest[n] & 0xc0) === 0x80) n--; // keine UTF-8-Zeichen zerschneiden
      out.push(rest.subarray(0, n).toString('utf8')); rest = rest.subarray(n);
    }
    out.push(rest.toString('utf8'));
    return out.join('\r\n ');
  };
  const stempel = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
  const ort = (p, a) => [p, a].filter(Boolean).join(', ');

  const termin = ({ uid, datum, zeit, dauerStunden, titel, wo, beschreibung }) => {
    const z = uhrzeit(zeit);
    let von, bis;
    if (z) {
      von = `DTSTART;TZID=Europe/Berlin:${tag(datum)}T${zwei(z[0])}${zwei(z[1])}00`;
      const ende = new Date(Date.UTC(2000, 0, 1, z[0], z[1]) + dauerStunden * 3600e3);
      const ueber = ende.getUTCDate() > 1;
      bis = `DTEND;TZID=Europe/Berlin:${ueber ? naechsterTag(datum) : tag(datum)}T${zwei(ende.getUTCHours())}${zwei(ende.getUTCMinutes())}00`;
    } else {
      von = `DTSTART;VALUE=DATE:${tag(datum)}`;
      bis = `DTEND;VALUE=DATE:${naechsterTag(datum)}`;
    }
    return ['BEGIN:VEVENT', `UID:${uid}@${new URL(PUBLIC_URL).hostname}`, `DTSTAMP:${stempel}`, von, bis,
      `SUMMARY:${text(titel)}`, `LOCATION:${text(wo)}`, `DESCRIPTION:${text(beschreibung)}`,
      `URL:${PUBLIC_URL}`, 'END:VEVENT'];
  };

  const ereignisse = [];
  const standesamtSichtbar = s.civil_mode === 'all';
  if (standesamtSichtbar && (welche === 'standesamt' || welche === 'alle')) {
    ereignisse.push(...termin({
      uid: 'standesamt-hochzeit', datum: s.civil_date, zeit: s.civil_time, dauerStunden: 1,
      titel: `Standesamt: ${s.couple} heiraten`,
      wo: ort(s.civil_place, s.civil_address),
      beschreibung: [s.civil_note, `Alle Infos: ${PUBLIC_URL}`].filter(Boolean).join('\n'),
    }));
  }
  if (welche === 'hochzeit' || welche === 'alle') {
    const feier = [s.party_time && `Feier ${/uhr/i.test(s.party_time) || !/\d/.test(s.party_time) ? s.party_time : `${s.party_time} Uhr`}`, ort(s.party_place, s.party_address)].filter(Boolean).join(': ');
    ereignisse.push(...termin({
      uid: 'feier-hochzeit', datum: s.church_date, zeit: s.church_time, dauerStunden: 11,
      titel: `Hochzeit ${s.couple}: Kirche und Feier`,
      wo: ort(s.church_place, s.church_address),
      beschreibung: [`Kirche: ${ort(s.church_place, s.church_address)}`, `Danach ${feier}`, s.party_note, `Alle Infos: ${PUBLIC_URL}`].filter(Boolean).join('\n'),
    }));
  }
  const zeilen = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Hochzeitsseite//Hochzeit//DE', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
    `X-WR-CALNAME:Hochzeit ${s.couple}`,
    'BEGIN:VTIMEZONE', 'TZID:Europe/Berlin',
    'BEGIN:DAYLIGHT', 'TZOFFSETFROM:+0100', 'TZOFFSETTO:+0200', 'TZNAME:MESZ', 'DTSTART:19700329T020000', 'RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU', 'END:DAYLIGHT',
    'BEGIN:STANDARD', 'TZOFFSETFROM:+0200', 'TZOFFSETTO:+0100', 'TZNAME:MEZ', 'DTSTART:19701025T030000', 'RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU', 'END:STANDARD',
    'END:VTIMEZONE',
    ...ereignisse,
    'END:VCALENDAR',
  ];
  return zeilen.map(falten).join('\r\n') + '\r\n';
}

// Impressum und Datenschutzerklärung, serverseitig erzeugt
function rechtsSeite(art) {
  const s = getSettings();
  const e = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const fehlt = '<em class="fehlt">Angaben folgen</em>';
  const name = e(s.imp_names) || fehlt;
  const adresse = s.imp_address ? e(s.imp_address).replace(/\s*[\n,]\s*/g, '<br>') : fehlt;
  const mail = s.imp_email ? `<a href="mailto:${e(s.imp_email)}">${e(s.imp_email)}</a>` : fehlt;
  const tel = s.imp_phone ? `<br>Telefon: ${e(s.imp_phone)}` : '';
  const loeschDatum = /^\d{4}-\d{2}-\d{2}$/.test(s.delete_after)
    ? new Date(`${s.delete_after}T12:00:00`).toLocaleDateString('de-DE', { day: 'numeric', month: 'long', year: 'numeric' })
    : 'drei Monate nach der Feier';
  const verantwortlich = `<p>${name}<br>${adresse}</p><p>E-Mail: ${mail}${tel}</p>`;

  const inhalt = art === 'impressum' ? `
    <h1>Impressum</h1>
    <p>Diese Seite ist ein privates, nicht kommerzielles Angebot für die Gäste unserer Hochzeit.</p>
    <h2>Angaben nach § 5 DDG und § 18 Abs. 1 MStV</h2>
    ${verantwortlich}
    <h2>Haftung für Links</h2>
    <p>Die Seite verlinkt auf Google Maps. Für die Inhalte dieser fremden Seite ist allein deren Anbieter verantwortlich. Zum Zeitpunkt der Verlinkung waren keine Rechtsverstöße erkennbar. Sollten uns Rechtsverletzungen bekannt werden, entfernen wir den Link umgehend.</p>
    <h2>Bilder und Texte</h2>
    <p>Fotos und Texte auf dieser Seite stammen von uns. Bitte nicht ohne Rückfrage weiterverwenden.</p>
  ` : `
    <h1>Datenschutz</h1>
    <p>Wir freuen uns, dass ihr hier seid, und gehen mit euren Angaben sorgsam um. Hier steht, welche Daten beim Besuch dieser Seite und bei eurer Rückmeldung verarbeitet werden.</p>

    <h2>1. Verantwortlich</h2>
    ${verantwortlich}

    <h2>2. Aufruf der Seite</h2>
    <p>Die Seite läuft auf einem Server, den wir selbst betreiben. Er führt keine Zugriffsprotokolle mit IP-Adressen. Damit niemand das Antwortformular massenhaft missbrauchen kann, merkt sich der Server die IP-Adresse höchstens eine Stunde lang im Arbeitsspeicher und speichert sie nicht dauerhaft. Rechtsgrundlage ist unser berechtigtes Interesse an einer sicheren Seite (Art. 6 Abs. 1 lit. f DSGVO).</p>

    <h2>3. Eure Rückmeldung</h2>
    <p>Wenn ihr zu- oder absagt, speichern wir eure Angaben: Name, Zu- oder Absage, Anzahl der Personen, ob ihr zum Standesamt kommt, Namen der Mitreisenden, Essenswünsche (vegetarisch, vegan) und eure Nachricht an uns. Alle Angaben außer Name und Zu- oder Absage sind freiwillig.</p>
    <p>Wir nutzen die Angaben ausschließlich, um unsere Hochzeit zu planen: wie viele Plätze wir brauchen und was auf den Tisch kommt. Sehen können sie nur wir beide. An Küche oder Catering geben wir nur die Anzahl der Essenswünsche weiter, keine Namen. Rechtsgrundlage ist eure Einwilligung, die ihr mit dem Absenden gebt (Art. 6 Abs. 1 lit. a DSGVO).</p>
    <p>Ihr könnt eure Einwilligung jederzeit widerrufen, eine kurze Nachricht an uns genügt. Dann löschen wir eure Rückmeldung. Spätestens am <strong>${e(loeschDatum)}</strong> löscht der Server alle Rückmeldungen automatisch.</p>

    <h2>4. Speicherung auf eurem Gerät</h2>
    <p>Wir setzen keine Cookies für Gäste und nutzen keine Analyse- oder Werbedienste. Nach dem Absenden speichert euer Browser einen zufälligen Schlüssel und eure Antwort im lokalen Speicher. So seht ihr eure Bestätigung beim nächsten Besuch wieder und könnt die Antwort ändern. Das ist für diese von euch gewünschte Funktion unbedingt erforderlich (§ 25 Abs. 2 Nr. 2 TDDDG). Auf der Fotoseite merkt sich euer Browser außerdem euren Namen, damit ihr ihn nicht jedes Mal neu eintippen müsst. Ihr könnt den Speicher jederzeit in den Browser-Einstellungen löschen.</p>

    <h2>5. Fotos von der Hochzeit</h2>
    <p>Auf der Seite „Fotos“ könnt ihr Bilder von unserer Hochzeit hochladen. Wir speichern dabei das Foto, den Namen, den ihr angebt, den Abschnitt (zum Beispiel Kirche oder Feier) und den Zeitpunkt. Euer Browser verkleinert jedes Foto vor dem Hochladen und speichert es neu, dabei fallen eingebettete Zusatzdaten wie Aufnahmeort und Kamera weg. Die Fotos liegen nur auf unserem eigenen Server.</p>
    <p>Sehen können die Fotos wir und, solange wir die Galerie freigeschaltet haben, alle Besucher dieser Seite, mit dem Namen, den ihr angegeben habt. Ladet bitte nur Fotos hoch, die ihr selbst gemacht habt, und nur, wenn die Abgebildeten damit einverstanden sind. Rechtsgrundlage ist eure Einwilligung durch das Hochladen (Art. 6 Abs. 1 lit. a DSGVO).</p>
    <p>Wir bewahren die Fotos als Erinnerung an unsere Hochzeit auf. Wenn ihr ein Foto entfernt haben möchtet, weil ihr es hochgeladen habt oder darauf zu sehen seid, schreibt uns kurz, dann löschen wir es.</p>

    <h2>6. Schriften und Karten</h2>
    <p>Alle Schriften liefern wir von unserem eigenen Server aus. Beim Aufruf entsteht keine Verbindung zu Google oder anderen Schriftanbietern. Die Knöpfe „Auf der Karte anzeigen“ sind einfache Links zu Google Maps. Erst wenn ihr darauf tippt, öffnet sich Google Maps, dann gilt die <a href="https://policies.google.com/privacy?hl=de" rel="noopener">Datenschutzerklärung von Google</a>.</p>

    <h2>7. Eure Rechte</h2>
    <p>Ihr habt das Recht auf Auskunft über eure gespeicherten Daten (Art. 15 DSGVO), auf Berichtigung (Art. 16), Löschung (Art. 17), Einschränkung der Verarbeitung (Art. 18), Datenübertragbarkeit (Art. 20) und auf Widerspruch gegen Verarbeitungen aus berechtigtem Interesse (Art. 21). Eine erteilte Einwilligung könnt ihr jederzeit für die Zukunft widerrufen (Art. 7 Abs. 3). Schreibt uns dafür einfach. Außerdem könnt ihr euch bei einer Datenschutz-Aufsichtsbehörde beschweren (Art. 77 DSGVO), zum Beispiel in dem Bundesland, in dem ihr wohnt.</p>

  `;

  return geruest.layout({ name: art, titel: art === 'impressum' ? 'Impressum' : 'Datenschutz', inhalt: `<main class="recht">${inhalt}</main>` });
}

// Öffentliche Daten
function publicInfo(code) {
  const s = getSettings();
  let invite = null;
  let response = null;
  if (code) {
    const inv = db.prepare('SELECT * FROM invites WHERE code = ?').get(code);
    if (inv) {
      if (!inv.opened_at) db.prepare('UPDATE invites SET opened_at = ? WHERE id = ?').run(now(), inv.id);
      invite = { code: inv.code, name: inv.name, max_persons: inv.max_persons, civil: !!inv.civil };
      const r = db.prepare('SELECT * FROM responses WHERE invite_id = ?').get(inv.id);
      if (r) response = pubResponse(r);
    }
  }
  const showCivil = s.civil_mode === 'all' || !!invite?.civil;
  return {
    couple: s.couple,
    welcome: s.welcome,
    gift: s.gift,
    civil: showCivil ? { date: s.civil_date, time: s.civil_time, place: s.civil_place, address: s.civil_address, note: s.civil_note, map: s.civil_map } : null,
    church: { date: s.church_date, time: s.church_time, place: s.church_place, address: s.church_address, map: s.church_map },
    party: { time: s.party_time, place: s.party_place, address: s.party_address, note: s.party_note, map: s.party_map },
    deadline: s.deadline,
    contact: s.contact,
    maxPersons: invite ? invite.max_persons : int(s.max_persons_open, 1, 20),
    hasPhoto: fs.existsSync(path.join(DATA, 'foto.jpg')),
    fotos: db.prepare('SELECT bild, text FROM fotos ORDER BY sort, id').all(),
    zusageSong: s.zusage_song !== '0',
    zusageBeitrag: s.zusage_beitrag !== '0',
    infoDresscode: s.info_dresscode,
    infoSpiele: s.info_spiele,
    trauzeugen: [1, 2].map((i) => ({ name: s[`tz${i}_name`], rolle: s[`tz${i}_rolle`], tel: s[`tz${i}_tel`], mail: s[`tz${i}_mail`] })).filter((t) => t.name),
    paar: { namen: s.imp_names, mail: s.paar_mail || s.imp_email, tel: s.paar_tel },
    invite,
    response,
    codeUnknown: !!code && !invite,
  };
}
const pubResponse = (r) => ({
  name: r.name, attending: !!r.attending, persons: r.persons, civil: !!r.civil,
  companions: r.companions, diet: r.diet, vegetarian: !!r.vegetarian, vegan: !!r.vegan, personen: personenVon(r) || [], song: r.song || '', beitrag: r.beitrag || '', message: r.message, updated_at: r.updated_at,
});

async function handleRsvp(req, res) {
  const ip = clientIp(req);
  if (limited(`rsvp:${ip}`, 30, 3600_000)) return json(res, 429, { error: 'Zu viele Antworten in kurzer Zeit. Bitte versucht es später noch einmal.' });
  const b = await readJson(req);
  if (str(b.website)) return json(res, 200, { ok: true }); // Falle für Bots
  const s = getSettings();
  const code = normCode(b.code);
  const inv = code ? db.prepare('SELECT * FROM invites WHERE code = ?').get(code) : null;
  if (code && !inv) return json(res, 404, { error: 'Diesen Einladungslink kennen wir nicht. Prüft bitte den Link oder QR-Code auf eurer Einladung.' });
  const name = str(b.name, 120);
  if (name.length < 2) return json(res, 400, { error: 'Bitte tragt euren Namen ein.', field: 'name' });
  if (typeof b.attending !== 'boolean') return json(res, 400, { error: 'Bitte wählt aus, ob ihr kommt.', field: 'attending' });
  const max = inv ? inv.max_persons : int(s.max_persons_open, 1, 20);
  const persons = b.attending ? int(b.persons, 1, max) : 0;
  const civilAllowed = s.civil_mode === 'all' || !!inv?.civil;
  // Personenliste: Name, Essenswunsch und Hinweis je Person. Die erste Person ist die Anmeldung selbst.
  const liste = b.attending && Array.isArray(b.personen) ? bereinigen(b.personen, persons, (t, n) => str(t, n)) : null;
  if (liste) liste[0].name = name;
  const row = {
    name,
    attending: b.attending ? 1 : 0,
    persons,
    civil: b.attending && civilAllowed && b.civil ? 1 : 0,
    companions: liste ? liste.slice(1).map((p) => p.name).filter(Boolean).join(', ') : (b.attending ? str(b.companions, 600) : ''),
    diet: liste ? liste.filter((p) => p.hinweis).map((p) => `${p.name || 'Gast'}: ${p.hinweis}`).join('; ').slice(0, 600) : '',
    vegetarian: liste ? (liste.some((p) => p.kost === 'vegetarisch') ? 1 : 0) : (b.attending && b.vegetarian ? 1 : 0),
    vegan: liste ? (liste.some((p) => p.kost === 'vegan') ? 1 : 0) : (b.attending && b.vegan ? 1 : 0),
    personen: liste ? JSON.stringify(liste) : '',
    song: b.attending && s.zusage_song !== '0' ? str(b.song, 200) : '',
    beitrag: b.attending && s.zusage_beitrag !== '0' ? str(b.beitrag, 400) : '',
    message: str(b.message, 1500),
  };
  let id;
  const token = str(b.token, 64);
  const existing = inv
    ? db.prepare('SELECT id, token FROM responses WHERE invite_id = ?').get(inv.id)
    : token ? db.prepare('SELECT id, token FROM responses WHERE invite_id IS NULL AND token = ?').get(token) : null;
  if (existing) {
    db.prepare(`UPDATE responses SET name=?, attending=?, persons=?, civil=?, companions=?, diet=?, vegetarian=?, vegan=?, personen=?, song=?, beitrag=?, message=?, updated_at=? WHERE id=?`)
      .run(row.name, row.attending, row.persons, row.civil, row.companions, row.diet, row.vegetarian, row.vegan, row.personen, row.song, row.beitrag, row.message, now(), existing.id);
    id = existing.id;
  } else {
    const r = db.prepare(`INSERT INTO responses (invite_id, name, attending, persons, civil, companions, diet, vegetarian, vegan, personen, song, beitrag, message, created_at, updated_at, token)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(inv?.id ?? null, row.name, row.attending, row.persons, row.civil, row.companions, row.diet, row.vegetarian, row.vegan, row.personen, row.song, row.beitrag, row.message, now(), now(), crypto.randomBytes(18).toString('hex'));
    id = Number(r.lastInsertRowid);
  }
  const saved = db.prepare('SELECT * FROM responses WHERE id = ?').get(id);
  json(res, 200, { ok: true, updated: !!existing, response: pubResponse(saved), token: inv ? undefined : saved.token });
}

// Verwaltung
function overview() {
  const invites = db.prepare(`
    SELECT i.*, r.id AS response_id, r.attending, r.persons, r.updated_at AS answered_at
    FROM invites i LEFT JOIN responses r ON r.invite_id = i.id ORDER BY i.name COLLATE NOCASE`).all();
  const responses = db.prepare(`
    SELECT r.*, i.code, i.name AS invite_name, i.max_persons FROM responses r
    LEFT JOIN invites i ON i.id = r.invite_id ORDER BY r.updated_at DESC`).all();
  const yes = responses.filter((r) => r.attending);
  const no = responses.filter((r) => !r.attending);
  const open = invites.filter((i) => !i.response_id);
  return {
    stats: {
      persons: yes.reduce((a, r) => a + r.persons, 0),
      civil: yes.filter((r) => r.civil).reduce((a, r) => a + r.persons, 0),
      vegetarian: kostZahlen(responses).vegetarisch,   // seit 1.8.0 Personen, früher Anmeldungen
      vegan: kostZahlen(responses).vegan,
      yes: yes.length,
      no: no.length,
      declinedPersons: no.reduce((a, r) => a + (r.max_persons || 1), 0),
      open: open.length,
      openPersons: open.reduce((a, i) => a + i.max_persons, 0),
      invites: invites.length,
      invitedPersons: invites.reduce((a, i) => a + i.max_persons, 0),
    },
    invites,
    responses,
    publicUrl: PUBLIC_URL,
  };
}

// Songwünsche und Beiträge aller Zusagen als Tabelle (für DJ und Moderation)
function exportSongsCsv() {
  const zeilen = db.prepare("SELECT name, song, beitrag FROM responses WHERE attending = 1 AND (song != '' OR beitrag != '') ORDER BY name COLLATE NOCASE").all();
  return '\ufeff' + [['Name', 'Songwunsch', 'Beitrag'], ...zeilen.map((r) => [r.name, r.song, r.beitrag])].map((z) => z.map(csvCell).join(';')).join('\r\n');
}

const inviteUrl = (code) => `${PUBLIC_URL}/p/${code}`;
const QR_OPTS = { errorCorrectionLevel: 'M', margin: 2, color: { dark: '#1d2430', light: '#ffffff' } };

function csvCell(v) {
  const s = String(v ?? '');
  return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
function exportCsv() {
  const o = overview();
  const lines = [['Name', 'Antwort', 'Personen', 'Standesamt', 'Mitreisende', 'Vegetarisch (Personen)', 'Vegan (Personen)', 'Essen je Person', 'Nachricht', 'Geantwortet am']];
  for (const r of o.responses)
    { const l = r.attending ? personenVon(r) : null; const z = kostZahlen([r]);
      lines.push([r.name, r.attending ? 'Zusage' : 'Absage', r.persons, r.civil ? 'ja' : '', r.companions, z.vegetarisch || '', z.vegan || '', l ? l.map((p) => `${p.name || 'Gast'}: ${p.kost || 'alles'}${p.hinweis ? ` (${p.hinweis})` : ''}`).join('; ') : '', r.message, r.updated_at]); }
  for (const i of o.invites.filter((x) => !x.response_id))
    lines.push([i.name, 'offen', '', '', '', '', '', '', '', '', '']);
  return '﻿' + lines.map((l) => l.map(csvCell).join(';')).join('\r\n');
}
function exportInvitesCsv() {
  const lines = [['Einladung für', 'Nummer', 'Link', 'Personen', 'Standesamt']];
  for (const i of db.prepare('SELECT * FROM invites ORDER BY name COLLATE NOCASE').all())
    lines.push([i.name, i.code, inviteUrl(i.code), i.max_persons, i.civil ? 'ja' : '']);
  return '﻿' + lines.map((l) => l.map(csvCell).join(';')).join('\r\n');
}

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
async function qrSheet() {
  const invites = db.prepare('SELECT * FROM invites ORDER BY name COLLATE NOCASE').all();
  const items = [];
  for (const i of invites) {
    const svg = await QRCode.toString(inviteUrl(i.code), { ...QR_OPTS, type: 'svg' });
    items.push(`<figure>${svg}<figcaption><strong>${esc(i.name)}</strong><span>Nr. ${esc(i.code)} · ${i.max_persons} ${i.max_persons === 1 ? 'Person' : 'Personen'}</span></figcaption></figure>`);
  }
  return `<!doctype html><html lang="de"><head><meta charset="utf-8"><title>QR-Codes Einladungen</title>
<style>@page{size:A4;margin:12mm}body{font:11px/1.3 system-ui,sans-serif;color:#1d2430;margin:0}
h1{font-size:15px;margin:0 0 8mm}main{display:grid;grid-template-columns:repeat(4,1fr);gap:6mm}
figure{margin:0;break-inside:avoid;text-align:center;border:1px dashed #b9c2cc;padding:3mm}
svg{width:100%;height:auto;display:block}figcaption strong{display:block;font-size:11px}
figcaption span{color:#4b5563;font-size:10px}</style></head><body>
<h1>QR-Codes für die Einladungen (${invites.length})</h1><main>${items.join('') || '<p>Noch keine Einladungen angelegt.</p>'}</main>
<script>addEventListener('load',()=>setTimeout(()=>print(),300))</script></body></html>`;
}

// Anmeldung über ein vorgeschaltetes Portal (zum Beispiel ein Kundenkonto): Das Portal baut mit dem gemeinsamen Geheimnis
// PORTAL_GEHEIMNIS einen Link, der eine Minute lang und nur einmal gilt. Ohne Geheimnis ist die Funktion aus.
// Link: /admin/einmal?t=<zeit>.<name base64url>.<zufall>.<hmac sha256 hex über die ersten drei Teile>
const PORTAL_GEHEIMNIS = process.env.PORTAL_GEHEIMNIS || '';
const verbraucht = new Map(); // Zufallswert -> Ablaufzeit
function einmalAnmeldung(req, res, url) {
  const zurueck = { Location: '/admin', 'Cache-Control': 'no-store', 'Referrer-Policy': 'same-origin' };
  if (!PORTAL_GEHEIMNIS) return send(res, 404, 'Nicht gefunden', 'text/plain; charset=utf-8');
  if (limited(`einmal:${clientIp(req)}`, 20, 600_000)) return send(res, 429, 'Zu viele Versuche', 'text/plain; charset=utf-8');
  const [zeit, name64, zufall, sig] = String(url.searchParams.get('t') || '').split('.');
  const jetzt = Date.now();
  for (const [z, bis] of verbraucht) if (bis < jetzt) verbraucht.delete(z);
  const erwartet = crypto.createHmac('sha256', PORTAL_GEHEIMNIS).update(`${zeit}.${name64}.${zufall}`).digest('hex');
  const a = Buffer.from(String(sig || '')), b = Buffer.from(erwartet);
  const echt = a.length === b.length && crypto.timingSafeEqual(a, b);
  const frisch = Math.abs(jetzt / 1000 - Number(zeit)) <= 60;
  const u = echt && frisch && zufall && !verbraucht.has(zufall) ? db.prepare('SELECT name FROM users WHERE name = ?').get(Buffer.from(name64, 'base64url').toString('utf8')) : null;
  if (!u) { res.writeHead(302, zurueck); return res.end(); } // abgelaufen oder ungültig: normale Anmeldeseite
  verbraucht.set(zufall, jetzt + 120_000);
  const token = crypto.randomBytes(32).toString('hex');
  const tage = 60;
  db.prepare('INSERT INTO sessions (token, user, expires) VALUES (?, ?, ?)').run(token, u.name, jetzt + tage * 864e5);
  res.writeHead(302, { ...zurueck, 'Set-Cookie': `hz_s=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${tage * 86400}${isHttps(req) ? '; Secure' : ''}` });
  res.end();
}

async function admin(req, res, url) {
  const p = url.pathname;
  if (p === '/api/admin/session' && req.method === 'GET') {
    const user = sessionUser(req);
    const users = db.prepare('SELECT name, pw IS NOT NULL AS has FROM users').all();
    return json(res, 200, { user, users: users.map((u) => ({ name: u.name, ready: !!u.has })), setupAllowed: fromHomeNetwork(req) });
  }
  if (p === '/api/admin/login' && req.method === 'POST') {
    const ip = clientIp(req);
    if (limited(`login:${ip}`, 8, 600_000)) return json(res, 429, { error: 'Zu viele Versuche. Bitte in zehn Minuten noch einmal.' });
    const b = await readJson(req);
    const u = db.prepare('SELECT * FROM users WHERE name = ?').get(str(b.user, 40));
    const pw = String(b.password || '');
    if (!u) return json(res, 400, { error: 'Unbekannter Zugang.' });
    if (!u.pw) {
      if (!fromHomeNetwork(req)) return json(res, 403, { error: 'Das erste Passwort lässt sich nur direkt im eigenen Netzwerk festlegen. Auf einem Server im Internet setzt ihr es beim Start mit der Umgebungsvariable ADMIN_PASSWORD.' });
      if (pw.length < 8) return json(res, 400, { error: 'Bitte mindestens 8 Zeichen.' });
      db.prepare('UPDATE users SET pw = ? WHERE name = ?').run(hashPw(pw), u.name);
    } else if (!checkPw(pw, u.pw)) {
      return json(res, 401, { error: 'Passwort stimmt nicht.' });
    }
    const token = crypto.randomBytes(32).toString('hex');
    const days = 60;
    db.prepare('INSERT INTO sessions (token, user, expires) VALUES (?, ?, ?)').run(token, u.name, Date.now() + days * 864e5);
    const cookie = `hz_s=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${days * 86400}${isHttps(req) ? '; Secure' : ''}`;
    return json(res, 200, { ok: true, user: u.name }, { 'Set-Cookie': cookie });
  }
  if (p === '/api/admin/logout' && req.method === 'POST') {
    const t = cookies(req).hz_s;
    if (t) db.prepare('DELETE FROM sessions WHERE token = ?').run(t);
    return json(res, 200, { ok: true }, { 'Set-Cookie': 'hz_s=; Path=/; Max-Age=0' });
  }

  const user = sessionUser(req);
  if (!user) return json(res, 401, { error: 'Bitte anmelden.' });

  if (p === '/api/admin/overview' && req.method === 'GET') return json(res, 200, overview());
  if (p === '/api/admin/password' && req.method === 'POST') {
    const b = await readJson(req);
    const u = db.prepare('SELECT * FROM users WHERE name = ?').get(user);
    if (!checkPw(String(b.old || ''), u.pw)) return json(res, 401, { error: 'Altes Passwort stimmt nicht.' });
    if (String(b.password || '').length < 8) return json(res, 400, { error: 'Bitte mindestens 8 Zeichen.' });
    db.prepare('UPDATE users SET pw = ? WHERE name = ?').run(hashPw(String(b.password)), user);
    return json(res, 200, { ok: true });
  }
  if (p === '/api/admin/settings') {
    if (req.method === 'GET') return json(res, 200, getSettings());
    if (req.method === 'PUT') {
      const b = await readJson(req);
      const up = db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value');
      const colorPattern = /^#[0-9a-fA-F]{6}$/;
      for (const k of Object.keys(DEFAULTS)) {
        if (!(k in b)) continue;
        if (k.startsWith('design_')) {
          const v = String(b[k]);
          if (v && !colorPattern.test(v)) return json(res, 400, { error: 'Bitte eine Farbe im Format #rrggbb angeben.' });
        }
        if (k === 'galerie_zugang' && !['offen', 'qr'].includes(String(b[k]))) return json(res, 400, { error: 'Zugang: offen oder qr.' });
        up.run(k, str(b[k], 1000));
      }
      return json(res, 200, getSettings());
    }
  }
  if (p === '/api/admin/design' && req.method === 'GET') {
    return json(res, 200, {
      live: liveDesign(), entwurf: holeJson('design_entwurf'),
      vorlagen: Object.entries(VORLAGEN).map(([id, v]) => ({ id, name: v.name, beschreibung: v.beschreibung, design: v.design })),
      schriften: Object.entries(SCHRIFTEN).map(([id, s]) => ({ id, name: s.name, beschreibung: s.beschreibung, titel: s.stapelTitel, text: s.stapelText, schreib: s.stapelName || '' })),
      sektionen: SEKTIONEN, elemente: ELEMENTE, heros: HEROS, blocktypen: BLOCKTYPEN, stile: STILE,
    });
  }
  if (p === '/api/admin/design/entwurf' && req.method === 'PUT') {
    const b = await readJson(req, 512 * 1024);
    const d = designPruefen(b.design);
    speichereJson('design_entwurf', d);
    return json(res, 200, { ok: true, design: d });
  }
  if (p === '/api/admin/design/entwurf' && req.method === 'DELETE') {
    db.prepare("DELETE FROM settings WHERE key = 'design_entwurf'").run();
    return json(res, 200, { ok: true });
  }
  if (p === '/api/admin/design/veroeffentlichen' && req.method === 'POST') {
    const d = holeJson('design_entwurf');
    if (!d) return json(res, 400, { error: 'Es gibt keinen Entwurf zum Veröffentlichen.' });
    speichereJson('design_json', designPruefen(d));
    db.prepare("DELETE FROM settings WHERE key = 'design_entwurf'").run();
    return json(res, 200, { ok: true });
  }
  if (p === '/api/admin/photo') {
    const f = path.join(DATA, 'foto.jpg');
    if (req.method === 'DELETE') { fs.rmSync(f, { force: true }); return json(res, 200, { ok: true }); }
    if (req.method === 'POST') {
      const buf = await readBody(req, 8 * 1024 * 1024);
      const isJpg = buf[0] === 0xff && buf[1] === 0xd8;
      const isPng = buf[0] === 0x89 && buf[1] === 0x50;
      if (!isJpg && !isPng) return json(res, 400, { error: 'Bitte ein JPG oder PNG hochladen.' });
      fs.writeFileSync(f, buf);
      return json(res, 200, { ok: true });
    }
  }
  if (p === '/api/admin/invites' && req.method === 'POST') {
    const b = await readJson(req);
    const ins = db.prepare('INSERT INTO invites (code, name, max_persons, civil, note) VALUES (?, ?, ?, ?, ?)');
    let list = Array.isArray(b.items) ? b.items : [b];
    list = list.map((x) => ({ name: str(x.name, 120), max: int(x.max_persons, 1, 20) || 1, civil: x.civil ? 1 : 0, note: str(x.note, 500) })).filter((x) => x.name);
    if (!list.length) return json(res, 400, { error: 'Bitte einen Namen eintragen.' });
    db.exec('BEGIN');
    try { for (const x of list) ins.run(newCode(), x.name, x.max, x.civil, x.note); db.exec('COMMIT'); }
    catch (e) { db.exec('ROLLBACK'); throw e; }
    return json(res, 200, { ok: true, created: list.length });
  }
  let m;
  if ((m = p.match(/^\/api\/admin\/invites\/(\d+)$/))) {
    const id = Number(m[1]);
    if (req.method === 'PUT') {
      const b = await readJson(req);
      const name = str(b.name, 120);
      if (!name) return json(res, 400, { error: 'Bitte einen Namen eintragen.' });
      db.prepare('UPDATE invites SET name=?, max_persons=?, civil=?, note=? WHERE id=?').run(name, int(b.max_persons, 1, 20) || 1, b.civil ? 1 : 0, str(b.note, 500), id);
      return json(res, 200, { ok: true });
    }
    if (req.method === 'DELETE') {
      db.prepare('DELETE FROM responses WHERE invite_id = ?').run(id);
      db.prepare('DELETE FROM invites WHERE id = ?').run(id);
      return json(res, 200, { ok: true });
    }
  }
  if ((m = p.match(/^\/api\/admin\/responses\/(\d+)$/)) && req.method === 'DELETE') {
    db.prepare('DELETE FROM responses WHERE id = ?').run(Number(m[1]));
    return json(res, 200, { ok: true });
  }
  if ((m = p.match(/^\/api\/admin\/qr\/([A-Z0-9]+|start)\.(svg|png)$/)) && req.method === 'GET') {
    const target = m[1] === 'start' ? PUBLIC_URL : inviteUrl(m[1]);
    const fname = m[1] === 'start' ? 'qr-hochzeit' : `qr-pass-${m[1]}`;
    const dl = url.searchParams.has('download') ? { 'Content-Disposition': `attachment; filename="${fname}.${m[2]}"` } : {};
    if (m[2] === 'svg') return send(res, 200, await QRCode.toString(target, { ...QR_OPTS, type: 'svg' }), 'image/svg+xml', dl);
    return send(res, 200, await QRCode.toBuffer(target, { ...QR_OPTS, width: 1200 }), 'image/png', dl);
  }
  if (p === '/api/admin/export.csv') return send(res, 200, exportCsv(), 'text/csv; charset=utf-8', { 'Content-Disposition': 'attachment; filename="hochzeit-antworten.csv"' });
  if (p === '/api/admin/songs.csv') return send(res, 200, exportSongsCsv(), 'text/csv; charset=utf-8', { 'Content-Disposition': 'attachment; filename="hochzeit-songs-und-beitraege.csv"' });
  if (p === '/api/admin/paesse.csv') return send(res, 200, exportInvitesCsv(), 'text/csv; charset=utf-8', { 'Content-Disposition': 'attachment; filename="hochzeit-paesse.csv"' });
  if (p === '/api/admin/qr-bogen') return send(res, 200, await qrSheet(), 'text/html; charset=utf-8');
  return json(res, 404, { error: 'Nicht gefunden.' });
}

// Design der Gästeseite (veröffentlicht und Entwurf), siehe design.js
const holeJson = (k) => { try { const r = db.prepare('SELECT value FROM settings WHERE key = ?').get(k); return r ? JSON.parse(r.value) : null; } catch { return null; } };
const speichereJson = (k, v) => db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(k, JSON.stringify(v));
// Vor dem Designer gab es nur drei Farben in den Angaben: sie bleiben gültig, solange kein Design gespeichert ist
function altesDesign() {
  const d = standardDesign(); const s = getSettings();
  for (const [k, f] of [['akzent', 'design_akzent'], ['grund', 'design_grund'], ['text', 'design_text']]) if (/^#[0-9a-fA-F]{6}$/.test(s[f])) d.farben[k] = s[f].toLowerCase();
  return d;
}
const liveDesign = () => holeJson('design_json') || altesDesign();
const CSP = "default-src 'self'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; font-src 'self'; script-src 'self'; connect-src 'self'; frame-src 'none'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'self'";
const geruest = seitenGeruest({ VERSION, PUB, getSettings, getDesign: liveDesign });
const behandleInhalte = inhalte({ db, send, json, str, int, sessionUser, limited, clientIp, DATA, gruppenAusListe: () => behandlePlanung.gruppenJeAntwort() });
const behandlePlanung = planung({ db, json, send, str, int, sessionUser, getSettings });
const behandleFotos = gaestefotos({ db, send, json, str, int, sessionUser, limited, clientIp, DATA, getSettings, PUBLIC_URL });
const behandleAblauf = ablauf({ db, send, json, str, int, sessionUser, limited, clientIp, getSettings, overview, sitzplanDaten: () => behandleInhalte.sitzplanDaten(), PUBLIC_URL });
const UNTERSEITEN = ['geschichte', 'quiz', 'fotos', 'kontakt'];

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://x');
    const p = url.pathname;
    if (p === '/api/health') return json(res, 200, { ok: true, version: VERSION });
    if (p === '/api/info' && req.method === 'GET') return json(res, 200, publicInfo(normCode(url.searchParams.get('code'))));
    if (p === '/api/rsvp' && req.method === 'POST') return await handleRsvp(req, res);
    if (p === '/foto') {
      const f = path.join(DATA, 'foto.jpg');
      if (!fs.existsSync(f)) return send(res, 404, 'Kein Foto', 'text/plain; charset=utf-8');
      const buf = fs.readFileSync(f);
      return send(res, 200, buf, buf[0] === 0x89 ? 'image/png' : 'image/jpeg', { 'Cache-Control': 'no-cache' });
    }
    if (await behandleInhalte(req, res, url)) return;
    if (await behandlePlanung(req, res, url)) return;
    if (await behandleFotos(req, res, url)) return;
    if (await behandleAblauf(req, res, url)) return;
    if (p.startsWith('/api/admin/')) return await admin(req, res, url);
    if (p === '/kalender.ics') {
      const welche = ['standesamt', 'hochzeit'].includes(url.searchParams.get('termin')) ? url.searchParams.get('termin') : 'alle';
      const datei = { standesamt: 'standesamt.ics', hochzeit: 'hochzeit.ics', alle: 'hochzeit-termine.ics' }[welche];
      return send(res, 200, kalender(welche), 'text/calendar; charset=utf-8', { 'Content-Disposition': `inline; filename="${datei}"` });
    }
    if (p === '/impressum' || p === '/datenschutz') return send(res, 200, rechtsSeite(p.slice(1)), 'text/html; charset=utf-8', { 'Cache-Control': 'no-cache' });
    if (p === '/admin/einmal' && req.method === 'GET') return einmalAnmeldung(req, res, url);
    if (p === '/admin' || p === '/admin/') return serveHtml(res, 'admin.html');
    const html = (inhalt) => send(res, 200, inhalt, 'text/html; charset=utf-8', { 'Cache-Control': 'no-cache', 'Content-Security-Policy': CSP });
    // Vorschau im Designer: wer angemeldet ist, sieht mit ?entwurf=1 den Entwurf
    const entwurf = url.searchParams.get('entwurf') === '1' && sessionUser(req) ? (holeJson('design_entwurf') || liveDesign()) : undefined;
    if (p === '/' || /^\/p\/[A-Za-z0-9-]{3,16}\/?$/.test(p)) return html(geruest.seite('start', entwurf));
    const unterseite = p.replace(/\/$/, '').slice(1);
    if (UNTERSEITEN.includes(unterseite)) return html(geruest.seite(unterseite, entwurf));
    return serveStatic(req, res, p);
  } catch (e) {
    if (!e.status) console.error(e);
    json(res, e.status || 500, { error: e.status ? e.message : 'Da ist etwas schiefgelaufen. Bitte versucht es gleich noch einmal.' });
  }
});
server.listen(PORT, () => console.log(`Hochzeit ${VERSION} läuft auf Port ${PORT}`));
