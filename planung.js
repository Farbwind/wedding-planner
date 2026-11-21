// Hochzeitsplanung in der Verwaltung: Einladungsliste, To-dos, Kosten und Geschenke.
// Wird von server.js eingebunden: const behandlePlanung = planung({...}); if (await behandlePlanung(req, res, url)) return;

import { kostZahlen } from './essen.js';

export const GAST_KATEGORIEN = ['Familie', 'Freunde', 'Kollegen', 'Bekannte'];
export const KATEGORIEN = ['Location', 'Essen', 'Trinken', 'Personal', 'Dienstleister', 'Kleidung', 'Deko', 'Papeterie', 'Sonstiges'];

export function planung({ db, json, send, str, int, sessionUser, getSettings }) {
  db.exec(`
CREATE TABLE IF NOT EXISTS einladung (id INTEGER PRIMARY KEY, name TEXT NOT NULL, standesamt INTEGER NOT NULL DEFAULT 0, hochzeit INTEGER NOT NULL DEFAULT 1,
  versendet INTEGER NOT NULL DEFAULT 0, antwort_id INTEGER, status_s TEXT NOT NULL DEFAULT 'auto', status_h TEXT NOT NULL DEFAULT 'auto',
  notiz TEXT NOT NULL DEFAULT '', erstellt TEXT NOT NULL DEFAULT (datetime('now')));
CREATE TABLE IF NOT EXISTS todos (id INTEGER PRIMARY KEY, titel TEXT NOT NULL, faellig TEXT NOT NULL DEFAULT '', bereich TEXT NOT NULL DEFAULT '',
  notiz TEXT NOT NULL DEFAULT '', erledigt TEXT, erstellt TEXT NOT NULL DEFAULT (datetime('now')));
CREATE TABLE IF NOT EXISTS kosten (id INTEGER PRIMARY KEY, datum TEXT NOT NULL DEFAULT '', titel TEXT NOT NULL, wo TEXT NOT NULL DEFAULT '',
  kategorie TEXT NOT NULL DEFAULT 'Sonstiges', cent INTEGER NOT NULL DEFAULT 0, bezahlt INTEGER NOT NULL DEFAULT 1, todo_id INTEGER,
  erstellt TEXT NOT NULL DEFAULT (datetime('now')));
CREATE TABLE IF NOT EXISTS geschenke (id INTEGER PRIMARY KEY, von TEXT NOT NULL, art TEXT NOT NULL DEFAULT 'Geld', cent INTEGER NOT NULL DEFAULT 0,
  notiz TEXT NOT NULL DEFAULT '', erstellt TEXT NOT NULL DEFAULT (datetime('now')));
CREATE TABLE IF NOT EXISTS vorlagen (name TEXT PRIMARY KEY);
`);
  if (!db.prepare("SELECT 1 FROM pragma_table_info('einladung') WHERE name = 'kategorie'").get()) db.exec("ALTER TABLE einladung ADD COLUMN kategorie TEXT NOT NULL DEFAULT ''");
  const gastKategorie = (k) => (GAST_KATEGORIEN.includes(k) ? k : '');
  // Sitzplan-Gruppe schon in der Gästeliste setzen, der Sitzplan übernimmt sie für die Personen der zugeordneten Antwort
  if (!db.prepare("SELECT 1 FROM pragma_table_info('einladung') WHERE name = 'gruppe'").get()) db.exec("ALTER TABLE einladung ADD COLUMN gruppe TEXT NOT NULL DEFAULT ''");
  // Postadresse für die Einladungskarten
  if (!db.prepare("SELECT 1 FROM pragma_table_info('einladung') WHERE name = 'adresse'").get()) db.exec("ALTER TABLE einladung ADD COLUMN adresse TEXT NOT NULL DEFAULT ''");
  const adresse = (a) => String(a ?? '').replace(/\r/g, '').split('\n').map((z) => z.trim()).filter(Boolean).slice(0, 5).join('\n').slice(0, 300);
  const alleGruppen = () => [...new Set([
    ...db.prepare("SELECT gruppe FROM einladung WHERE gruppe != ''").all(),
    ...db.prepare("SELECT gruppe FROM gast_info WHERE gruppe != ''").all(),
    ...db.prepare("SELECT gruppe FROM gaeste_extra WHERE gruppe != ''").all(),
  ].map((x) => x.gruppe))].sort((a, b) => a.localeCompare(b, 'de'));

  // Beispiel-Checkliste: Fälligkeit in Tagen vor dem Hochzeitstermin (Kirche und Feier), wird beim Einfügen ausgerechnet
  const TODO_VORLAGE = [
    ['Budget festlegen', 365, 'Planung', 'Grober Rahmen pro Kategorie, im Bereich Kosten im Blick behalten'],
    ['Termin und Location festlegen', 365, 'Location', ''],
    ['Gästeliste erstellen', 330, 'Gäste', 'Wer ist zum Standesamt eingeladen, wer zur Feier?'],
    ['Trauzeugen fragen', 330, 'Gäste', ''],
    ['Save-the-Date verschicken', 300, 'Papeterie', ''],
    ['Fotografin oder Fotografen buchen', 300, 'Dienstleister', ''],
    ['Unterlagen für das Standesamt klären', 240, 'Behörden', 'Beim Standesamt nachfragen, welche Urkunden und Ausweise nötig sind'],
    ['Traugespräch vereinbaren', 240, 'Kirche', 'Termin und Ablauf festhalten'],
    ['DJ oder Band buchen', 240, 'Dienstleister', ''],
    ['Essen für die Feier festlegen und buchen', 210, 'Dienstleister', 'Catering, Buffet oder Menü, vegetarisch und vegan einplanen'],
    ['Getränke planen', 210, 'Location', 'Lieferant, Kühlung, Gläser'],
    ['Einladungen gestalten', 180, 'Papeterie', 'QR-Code aus der Verwaltung einfügen'],
    ['Eheringe aussuchen und bestellen', 180, 'Kleidung', 'Lieferzeit und Gravur einplanen'],
    ['Brautkleid und Anzug aussuchen', 180, 'Kleidung', ''],
    ['Eheschließung beim Standesamt anmelden', 150, 'Behörden', 'Die Anmeldung gilt nur begrenzt, Fristen beim Standesamt erfragen'],
    ['Einladungen drucken lassen', 120, 'Papeterie', ''],
    ['Einladungen verschicken', 105, 'Gäste', 'In der Gästeliste bei jedem „Einladung versendet“ setzen'],
    ['Musik für die Trauung abstimmen', 90, 'Kirche', ''],
    ['Deko-Konzept festlegen', 90, 'Deko', 'Farben, Tischdeko, Blumen'],
    ['Floristin oder Floristen buchen', 75, 'Dienstleister', 'Brautstrauß, Anstecker, Tischblumen'],
    ['Friseur und Make-up buchen, Probetermin', 75, 'Kleidung', ''],
    ['Hochzeitstorte aussuchen', 75, 'Dienstleister', ''],
    ['Übernachtungsmöglichkeiten für Gäste sammeln', 70, 'Gäste', ''],
    ['Fehlende Rückmeldungen nachfragen', 40, 'Gäste', 'Offene Gäste stehen in der Gästeliste'],
    ['Sitzplan erstellen', 35, 'Gäste', 'Im Bereich Sitzplan'],
    ['Personenzahl und Essenswünsche ans Catering geben', 35, 'Dienstleister', 'Nur Anzahlen weitergeben, keine Namen (so steht es in der Datenschutzerklärung)'],
    ['Tischkarten und Menükarten drucken', 25, 'Papeterie', ''],
    ['Ablaufplan für den Tag schreiben und verteilen', 21, 'Planung', 'An Trauzeugen, DJ, Fotografie und Location'],
    ['Eheringe abholen', 14, 'Kleidung', ''],
    ['Gastgeschenke vorbereiten', 10, 'Deko', ''],
    ['Aufbau und Deko mit Helfern planen', 7, 'Location', ''],
    ['Notfallkörbchen packen', 7, 'Planung', 'Pflaster, Nähzeug, Schmerztabletten, Taschentücher'],
    ['Ausweise und Unterlagen bereitlegen', 3, 'Behörden', ''],
    ['Danksagungskarten verschicken', -30, 'Papeterie', 'Geschenke stehen im Bereich Kosten'],
    ['Namensänderung bei Bank, Versicherungen und Ämtern', -45, 'Behörden', 'Falls ihr einen gemeinsamen Namen wählt'],
  ];

  // Namen vergleichen: Einladungsliste gegen die Antworten der Gäste
  const norm = (s) => String(s || '').toLowerCase().normalize('NFKC').replace(/\s+/g, ' ').trim();
  const trenner = /\s*(?:,|;|\n|\+|&|\bund\b)\s*/i;
  const woerter = (s) => norm(s).replace(/familie|fam\.|\bmit\b/g, ' ').split(/[^a-zäöüß0-9-]+/).filter((w) => w.length > 1);

  function abgleich() {
    const antworten = db.prepare('SELECT * FROM responses ORDER BY updated_at DESC').all();
    const teile = antworten.map((r) => {
      const namen = [r.name, ...(r.companions || '').split(trenner)].map(norm).filter(Boolean);
      const alle = new Set([...woerter(r.name), ...woerter(r.companions)]);
      return { r, namen: new Set([...namen, ...r.name.split(trenner).map(norm)]), alle };
    });
    // Nach Nachnamen sortieren: letztes Wort des Namens („Anna Muster“ → Muster, „Familie Beispiel“ → Beispiel),
    // bei gleichem Nachnamen nach Vornamen
    const nachname = (n) => String(n).trim().split(/\s+/).pop() || '';
    const gaeste = db.prepare('SELECT * FROM einladung').all()
      .sort((a, b) => nachname(a.name).localeCompare(nachname(b.name), 'de', { sensitivity: 'base' }) || a.name.localeCompare(b.name, 'de', { sensitivity: 'base' }));
    const verknuepft = new Set();
    for (const g of gaeste) {
      let antwort = null;
      if (g.antwort_id > 0) antwort = antworten.find((r) => r.id === g.antwort_id) || null;
      else if (g.antwort_id == null) {
        const n = norm(g.name);
        const w = woerter(g.name);
        antwort = teile.find((t) => t.namen.has(n))?.r
          || (w.length >= 2 ? teile.find((t) => w.every((x) => t.alle.has(x)))?.r : null)
          || null;
      }
      const auto = antwort ? (antwort.attending ? 'ja' : 'nein') : 'offen';
      g.antwort = antwort ? { id: antwort.id, name: antwort.name, attending: !!antwort.attending, manuell: g.antwort_id > 0 } : null;
      g.s = g.standesamt ? (g.status_s === 'auto' ? auto : g.status_s) : null;
      g.h = g.hochzeit ? (g.status_h === 'auto' ? auto : g.status_h) : null;
      if (antwort) verknuepft.add(antwort.id);
    }
    const ohne = antworten.filter((r) => !verknuepft.has(r.id)).map((r) => ({ id: r.id, name: r.name, companions: r.companions, attending: !!r.attending, persons: r.persons }));
    const zaehle = (feld, wert) => gaeste.filter((g) => g[feld] === wert).length;
    const ja = antworten.filter((r) => r.attending);
    return {
      gaeste,
      gruppen: alleGruppen(),
      ohneEintrag: ohne,
      antworten: antworten.map((r) => ({ id: r.id, name: r.name })),
      zahlen: {
        standesamt: { eingeladen: gaeste.filter((g) => g.standesamt).length, ja: zaehle('s', 'ja'), nein: zaehle('s', 'nein') },
        hochzeit: { eingeladen: gaeste.filter((g) => g.hochzeit).length, ja: zaehle('h', 'ja'), nein: zaehle('h', 'nein') },
        personenZugesagt: ja.reduce((a, r) => a + r.persons, 0),
        vegetarisch: kostZahlen(antworten).vegetarisch,
        vegan: kostZahlen(antworten).vegan,
        versendet: gaeste.filter((g) => g.versendet).length,
        kategorien: Object.fromEntries([...GAST_KATEGORIEN, ''].map((k) => [k || 'Ohne Kategorie', gaeste.filter((g) => g.kategorie === k).length])),
      },
    };
  }

  const STATUS = ['auto', 'ja', 'nein', 'offen'];
  const euro = (v) => Math.round((Number(String(v ?? '').replace(/\./g, '').replace(',', '.')) || 0) * 100);
  const datum = (v) => (/^\d{4}-\d{2}-\d{2}$/.test(String(v || '')) ? String(v) : '');

  function kostenUebersicht() {
    const kosten = db.prepare("SELECT * FROM kosten ORDER BY CASE WHEN datum = '' THEN 1 ELSE 0 END, datum DESC, id DESC").all();
    const geschenke = db.prepare('SELECT * FROM geschenke ORDER BY erstellt DESC').all();
    const proKategorie = Object.fromEntries(KATEGORIEN.map((k) => [k, 0]));
    for (const k of kosten) proKategorie[KATEGORIEN.includes(k.kategorie) ? k.kategorie : 'Sonstiges'] += k.cent;
    const gesamt = kosten.reduce((a, k) => a + k.cent, 0);
    const bezahlt = kosten.filter((k) => k.bezahlt).reduce((a, k) => a + k.cent, 0);
    const geld = geschenke.filter((g) => g.art === 'Geld').reduce((a, g) => a + g.cent, 0);
    const personen = db.prepare('SELECT COALESCE(SUM(persons), 0) AS n FROM responses WHERE attending = 1').get().n;
    return { kosten, geschenke, kategorien: KATEGORIEN, proKategorie, gesamt, bezahlt, offen: gesamt - bezahlt, geld, eigenanteil: gesamt - geld, personen, proGast: personen ? Math.round(gesamt / personen) : null };
  }

  // Für den Sitzplan: Antwort-ID → Einträge der Gästeliste mit Gruppe
  function gruppenJeAntwort() {
    const m = new Map();
    for (const g of abgleich().gaeste) {
      if (!g.gruppe || !g.antwort) continue;
      if (!m.has(g.antwort.id)) m.set(g.antwort.id, []);
      m.get(g.antwort.id).push({ name: g.name, gruppe: g.gruppe });
    }
    return m;
  }

  const behandle = async function behandle(req, res, url) {
    const p = url.pathname;
    if (!/^\/api\/admin\/(gaesteliste|einladung|todos|kosten|geschenke)/.test(p)) return false;
    if (!sessionUser(req)) { json(res, 401, { error: 'Bitte anmelden.' }); return true; }
    const m = req.method;
    const body = async () => {
      if (!String(req.headers['content-type'] || '').includes('application/json')) throw Object.assign(new Error('Falsches Format'), { status: 415 });
      const t = []; for await (const c of req) t.push(c);
      try { return JSON.parse(Buffer.concat(t).toString('utf8') || '{}'); } catch { throw Object.assign(new Error('Ungültige Daten'), { status: 400 }); }
    };
    let t;

    // Einladungsliste
    if (p === '/api/admin/gaesteliste' && m === 'GET') { json(res, 200, abgleich()); return true; }
    if (p === '/api/admin/einladung' && m === 'POST') {
      const b = await body();
      const liste = (Array.isArray(b.items) ? b.items : [b]).map((x) => ({ name: str(x.name, 120), s: x.standesamt ? 1 : 0, h: x.hochzeit === false ? 0 : 1, k: gastKategorie(x.kategorie), g: str(x.gruppe, 60), a: adresse(x.adresse) })).filter((x) => x.name);
      if (!liste.length) { json(res, 400, { error: 'Bitte einen Namen eintragen.' }); return true; }
      const ins = db.prepare('INSERT INTO einladung (name, standesamt, hochzeit, kategorie, gruppe, adresse) VALUES (?, ?, ?, ?, ?, ?)');
      liste.forEach((x) => ins.run(x.name, x.s, x.h, x.k, x.g, x.a));
      json(res, 200, { ok: true, angelegt: liste.length });
      return true;
    }
    if ((t = p.match(/^\/api\/admin\/einladung\/(\d+)$/))) {
      const id = Number(t[1]);
      if (m === 'PUT') {
        const b = await body();
        const g = db.prepare('SELECT * FROM einladung WHERE id = ?').get(id);
        if (!g) { json(res, 404, { error: 'Nicht gefunden.' }); return true; }
        const neu = {
          name: 'name' in b ? str(b.name, 120) || g.name : g.name,
          standesamt: 'standesamt' in b ? (b.standesamt ? 1 : 0) : g.standesamt,
          hochzeit: 'hochzeit' in b ? (b.hochzeit ? 1 : 0) : g.hochzeit,
          versendet: 'versendet' in b ? (b.versendet ? 1 : 0) : g.versendet,
          status_s: STATUS.includes(b.status_s) ? b.status_s : g.status_s,
          status_h: STATUS.includes(b.status_h) ? b.status_h : g.status_h,
          antwort_id: 'antwort_id' in b ? (b.antwort_id === null ? null : int(b.antwort_id, -1, 1e9)) : g.antwort_id,
          notiz: 'notiz' in b ? str(b.notiz, 500) : g.notiz,
          kategorie: 'kategorie' in b ? gastKategorie(b.kategorie) : g.kategorie,
          gruppe: 'gruppe' in b ? str(b.gruppe, 60) : g.gruppe,
          adresse: 'adresse' in b ? adresse(b.adresse) : g.adresse,
        };
        db.prepare('UPDATE einladung SET name=?, standesamt=?, hochzeit=?, versendet=?, status_s=?, status_h=?, antwort_id=?, notiz=?, kategorie=?, gruppe=?, adresse=? WHERE id=?')
          .run(neu.name, neu.standesamt, neu.hochzeit, neu.versendet, neu.status_s, neu.status_h, neu.antwort_id, neu.notiz, neu.kategorie, neu.gruppe, neu.adresse, id);
        // Neue Gruppe aus der Gästeliste gilt: im Sitzplan von Hand gesetzte Gruppen dieser Antwort zurücksetzen
        if (neu.gruppe !== g.gruppe) {
          const a = abgleich().gaeste.find((x) => x.id === id)?.antwort;
          if (a) db.prepare("UPDATE gast_info SET gruppe = '' WHERE gast LIKE ?").run(`r${a.id}-%`);
        }
        json(res, 200, { ok: true });
        return true;
      }
      if (m === 'DELETE') { db.prepare('DELETE FROM einladung WHERE id = ?').run(id); json(res, 200, { ok: true }); return true; }
    }

    // To-dos
    if (p === '/api/admin/todos/vorlage' && m === 'POST') {
      const ziel = getSettings().church_date;
      const basis = /^\d{4}-\d{2}-\d{2}$/.test(ziel) ? new Date(`${ziel}T12:00:00Z`) : null;
      const vorhanden = new Set(db.prepare('SELECT titel FROM todos').all().map((x) => x.titel));
      const ins = db.prepare('INSERT INTO todos (titel, faellig, bereich, notiz) VALUES (?, ?, ?, ?)');
      let neu = 0;
      for (const [titel, tage, bereich, notiz] of TODO_VORLAGE) {
        if (vorhanden.has(titel)) continue;
        const faellig = basis ? new Date(basis.getTime() - tage * 864e5).toISOString().slice(0, 10) : '';
        ins.run(titel, faellig, bereich, notiz);
        neu++;
      }
      json(res, 200, { ok: true, neu });
      return true;
    }
    if (p === '/api/admin/todos' && m === 'GET') {
      json(res, 200, db.prepare("SELECT t.*, k.cent AS kosten_cent FROM todos t LEFT JOIN kosten k ON k.todo_id = t.id ORDER BY CASE WHEN faellig = '' THEN 1 ELSE 0 END, faellig, t.id").all());
      return true;
    }
    if (p === '/api/admin/todos' && m === 'POST') {
      const b = await body();
      const titel = str(b.titel, 200);
      if (!titel) { json(res, 400, { error: 'Bitte beschreiben, was zu tun ist.' }); return true; }
      db.prepare('INSERT INTO todos (titel, faellig, bereich, notiz) VALUES (?, ?, ?, ?)').run(titel, datum(b.faellig), str(b.bereich, 40), str(b.notiz, 1000));
      json(res, 200, { ok: true });
      return true;
    }
    if ((t = p.match(/^\/api\/admin\/todos\/(\d+)$/))) {
      const id = Number(t[1]);
      if (m === 'PUT') {
        const b = await body();
        const alt = db.prepare('SELECT * FROM todos WHERE id = ?').get(id);
        if (!alt) { json(res, 404, { error: 'Nicht gefunden.' }); return true; }
        const erledigt = 'erledigt' in b ? (b.erledigt ? (alt.erledigt || new Date().toISOString().replace('T', ' ').slice(0, 19)) : null) : alt.erledigt;
        db.prepare('UPDATE todos SET titel=?, faellig=?, bereich=?, notiz=?, erledigt=? WHERE id=?')
          .run('titel' in b ? str(b.titel, 200) || alt.titel : alt.titel, 'faellig' in b ? datum(b.faellig) : alt.faellig,
            'bereich' in b ? str(b.bereich, 40) : alt.bereich, 'notiz' in b ? str(b.notiz, 1000) : alt.notiz, erledigt, id);
        // Beim Abhaken optional gleich die Kosten eintragen
        if (b.kosten && euro(b.kosten.betrag) > 0) {
          db.prepare('INSERT INTO kosten (datum, titel, wo, kategorie, cent, bezahlt, todo_id) VALUES (?, ?, ?, ?, ?, 1, ?)')
            .run(new Date().toISOString().slice(0, 10), str(b.kosten.titel, 200) || alt.titel, str(b.kosten.wo, 120),
              KATEGORIEN.includes(b.kosten.kategorie) ? b.kosten.kategorie : 'Sonstiges', euro(b.kosten.betrag), id);
        }
        json(res, 200, { ok: true });
        return true;
      }
      if (m === 'DELETE') { db.prepare('DELETE FROM todos WHERE id = ?').run(id); json(res, 200, { ok: true }); return true; }
    }

    // Kosten und Geschenke
    if (p === '/api/admin/kosten' && m === 'GET') { json(res, 200, kostenUebersicht()); return true; }
    if (p === '/api/admin/kosten' && m === 'POST') {
      const b = await body();
      const titel = str(b.titel, 200);
      if (!titel || !euro(b.betrag)) { json(res, 400, { error: 'Bitte Bezeichnung und Betrag eintragen.' }); return true; }
      db.prepare('INSERT INTO kosten (datum, titel, wo, kategorie, cent, bezahlt) VALUES (?, ?, ?, ?, ?, ?)')
        .run(datum(b.datum), titel, str(b.wo, 120), KATEGORIEN.includes(b.kategorie) ? b.kategorie : 'Sonstiges', euro(b.betrag), b.bezahlt === false ? 0 : 1);
      json(res, 200, { ok: true });
      return true;
    }
    if ((t = p.match(/^\/api\/admin\/kosten\/(\d+)$/))) {
      const id = Number(t[1]);
      if (m === 'PUT') {
        const b = await body();
        db.prepare('UPDATE kosten SET datum=?, titel=?, wo=?, kategorie=?, cent=?, bezahlt=? WHERE id=?')
          .run(datum(b.datum), str(b.titel, 200), str(b.wo, 120), KATEGORIEN.includes(b.kategorie) ? b.kategorie : 'Sonstiges', euro(b.betrag), b.bezahlt ? 1 : 0, id);
        json(res, 200, { ok: true });
        return true;
      }
      if (m === 'DELETE') { db.prepare('DELETE FROM kosten WHERE id = ?').run(id); json(res, 200, { ok: true }); return true; }
    }
    if (p === '/api/admin/geschenke' && m === 'POST') {
      const b = await body();
      const von = str(b.von, 120);
      if (!von) { json(res, 400, { error: 'Bitte eintragen, von wem das Geschenk ist.' }); return true; }
      db.prepare('INSERT INTO geschenke (von, art, cent, notiz) VALUES (?, ?, ?, ?)').run(von, b.art === 'Sachgeschenk' ? 'Sachgeschenk' : 'Geld', euro(b.betrag), str(b.notiz, 500));
      json(res, 200, { ok: true });
      return true;
    }
    if ((t = p.match(/^\/api\/admin\/geschenke\/(\d+)$/)) && m === 'DELETE') {
      db.prepare('DELETE FROM geschenke WHERE id = ?').run(Number(t[1]));
      json(res, 200, { ok: true });
      return true;
    }
    return false;
  };
  behandle.gruppenJeAntwort = gruppenJeAntwort;
  return behandle;
}
