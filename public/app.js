// Startseite: Angaben aus der Verwaltung laden, Antwortformular steuern, Bestätigung zeigen.
// Die Texte stehen in public/seiten/start.html, die Werte kommen von /api/info.

const feld = (n) => document.querySelector(`[data-feld="${n}"]`);
const setze = (n, text) => { const el = feld(n); if (el) el.textContent = text ?? ''; return el; };
const formular = document.getElementById('formular');
const bestaetigung = document.getElementById('bestaetigung');
const fehler = document.getElementById('fehler');
const personenAnzeige = document.getElementById('personen');
const SPEICHER = 'hochzeit-antwort';

// Persönlicher Einladungslink /p/CODE (optional, die Verwaltung kann solche Links anlegen)
const code = (location.pathname.match(/^\/p\/([A-Za-z0-9-]+)/) || [])[1]
  || new URLSearchParams(location.search).get('p') || '';

let info = null;
let personen = 1;
let maxPersonen = 6;
let wir = true;
let tokenGast = '';
let personenDaten = [{ name: '', kost: '', hinweis: '' }]; // Name, Essenswunsch und Hinweis je Person

const tag = (iso, opts) => new Date(`${iso}T12:00:00`).toLocaleDateString('de-DE', opts);
const tagZahl = (iso) => String(new Date(`${iso}T12:00:00`).getDate());
const monatName = (iso) => tag(iso, { month: 'long' });
const langesDatum = (iso) => tag(iso, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
const fristDatum = (iso) => tag(iso, { day: 'numeric', month: 'long', year: 'numeric' });
// „Uhr“ nur an echte Uhrzeiten hängen, Text wie „im Anschluss“ bleibt wie er ist
const uhr = (t) => (!t ? '' : /uhr/i.test(t) || !/\d/.test(t) ? t : `${t} Uhr`);
// Eigener Kartenlink aus der Verwaltung, sonst Suche nach Ort und Adresse
const karte = (ort, adresse, link) => (/^https:\/\//.test(link || '') ? link : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent([ort, adresse].filter(Boolean).join(', '))}`);
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

function seiteFuellen() {
  const i = info;
  wir = !(i.invite && i.invite.max_persons === 1);
  maxPersonen = i.maxPersons;

  const [n1, n2] = i.couple.split(/\s*&\s*|\s+und\s+/);
  if (n1 && n2) { setze('name1', n1.trim()); setze('name2', n2.trim()); }
  if (i.hasPhoto) { feld('foto').src = '/foto'; feld('foto-rahmen').hidden = false; feld('hero-inhalt').classList.add('mit-foto'); }

  setze('hero-datum', langesDatum(i.church.date));
  setze('hero-ort', [i.church.place, i.party.place].filter(Boolean).filter((o, n, a) => a.indexOf(o) === n).join(' · '));
  siegelFuellen(i, n1 && n2 ? `${n1.trim()} & ${n2.trim()}` : i.couple);
  lichtpunkte();
  countdownStarten(i);
  setze('willkommen', i.welcome);
  if (i.invite) {
    const g = setze('gruss', `${i.invite.name}, wir freuen uns, wenn ${wir ? 'ihr dabei seid' : 'du dabei bist'}.`);
    g.hidden = false;
  }

  // Termine
  if (i.civil) {
    setze('e1-datum', langesDatum(i.civil.date));
    setze('e1-titel', i.civil.place);
    setze('e1-zeit', uhr(i.civil.time) || 'Uhrzeit folgt');
    setze('e1-adresse', i.civil.address);
    setze('e1-notiz', i.civil.note);
    if (i.civil.address || i.civil.map) feld('e1-karte').href = karte(i.civil.place, i.civil.address, i.civil.map); else feld('e1-karte').hidden = true;
  } else {
    feld('etappe1').hidden = true;
  }
  if (i.civil) { setze('e1-tag', tagZahl(i.civil.date)); setze('e1-monat', monatName(i.civil.date)); }
  for (const n of ['e2', 'e3']) { setze(`${n}-tag`, tagZahl(i.church.date)); setze(`${n}-monat`, monatName(i.church.date)); }
  setze('e2-datum', langesDatum(i.church.date));
  setze('e3-datum', langesDatum(i.church.date));
  setze('kirche-zeit', uhr(i.church.time) || 'Uhrzeit folgt');
  setze('kirche-ort', i.church.place);
  setze('kirche-adresse', i.church.address);
  feld('kirche-karte').href = karte(i.church.place, i.church.address, i.church.map);
  setze('feier-zeit', uhr(i.party.time) || 'im Anschluss');
  setze('feier-ort', i.party.place);
  setze('feier-adresse', i.party.address);
  feld('feier-karte').href = karte(i.party.place, i.party.address, i.party.map);
  setze('feier-notiz', i.party.note);

  // Gut zu wissen, Geschenke, Fotos
  if (i.infoDresscode) setze('info-dresscode', i.infoDresscode); else feld('wissen-dresscode').hidden = true;
  if (i.infoSpiele) setze('info-spiele', i.infoSpiele); else feld('wissen-spiele').hidden = true;
  if (i.gift) setze('geschenk', i.gift); else feld('geschenk-bereich').hidden = true;
  // Hinweis auf die Trauzeugen erst, wenn sie eingetragen sind
  if (!i.trauzeugen?.length) feld('nachricht-hilfe')?.remove();
  if (i.fotos?.length) {
    feld('momente-raster').innerHTML = i.fotos.map((f, n) => `<figure class="moment-foto m${n % 5}"><img src="/bilder/${esc(f.bild)}" alt="${esc(f.text || 'Foto von uns')}" loading="lazy">${f.text ? `<figcaption>${esc(f.text)}</figcaption>` : ''}</figure>`).join('');
    feld('momente').hidden = false;
  }

  // Antwortformular
  setze('frage', wir ? 'Kommt ihr?' : 'Kommst du?');
  setze('frist', i.deadline ? `Bitte ${wir ? 'antwortet' : 'antworte'} bis zum ${fristDatum(i.deadline)}.` : '');
  setze('ja-text', wir ? 'Wir sind dabei' : 'Ich bin dabei');
  setze('nein-text', wir ? 'Wir können leider nicht' : 'Ich kann leider nicht');
  setze('name-label', 'Name');
  setze('max-hinweis', i.invite && maxPersonen > 1 ? `Für euch sind ${maxPersonen} Plätze reserviert.` : '');
  if (i.codeUnknown) feld('code-unbekannt').hidden = false;
  if (i.contact) { const k = setze('kontakt', `Fragen? ${i.contact}`); k.hidden = false; }

  formular.name.value = i.invite?.name || '';
  if (i.invite && maxPersonen > 1) personen = maxPersonen;
  zaehlerZeigen();
  wahlZeigen();
}

// Drehendes Siegel am Foto: Text auf dem Kreis, Datum aus den Angaben
function siegelFuellen(i, namen) {
  const el = feld('siegel-text');
  if (!el) return;
  const teile = [`${namen}`, tag(i.church.date, { day: 'numeric', month: 'long', year: 'numeric' }), 'Wir heiraten'];
  el.textContent = `${teile.join(' · ')} · `;
}

// Ein paar warme Lichtpunkte, die langsam im Hintergrund aufsteigen (nur CSS, ruht bei reduzierter Bewegung)
function lichtpunkte() {
  const box = feld('licht');
  if (!box || box.childElementCount || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  box.innerHTML = Array.from({ length: 14 }, (_, n) => {
    const s = 10 + ((n * 37) % 38);
    return `<i style="--x:${(n * 7.3 + 4) % 96}%;--s:${s}px;--d:${-((n * 2.7) % 18).toFixed(1)}s;--t:${(14 + (n * 1.9) % 10).toFixed(1)}s;--dx:${((n % 5) - 2) * 40}px"></i>`;
  }).join('');
}

// Countdown bis zur Trauung, springt am Tag selbst auf „Heute ist es so weit“
function countdownStarten(i) {
  const band = feld('countdown');
  if (!band || !i.church.date) return;
  const zeit = (i.church.time || '').match(/(\d{1,2})[:.](\d{2})/);
  const ziel = new Date(`${i.church.date}T${zeit ? `${zeit[1].padStart(2, '0')}:${zeit[2]}` : '14:00'}:00`);
  const zwei = (n) => String(n).padStart(2, '0');
  const tick = () => {
    const rest = ziel - Date.now();
    band.hidden = false;
    if (rest <= 0) {
      const heute = new Date().toDateString() === ziel.toDateString();
      feld('cd-zahlen').hidden = true;
      feld('cd-vor').hidden = true;
      const satz = feld('cd-satz');
      satz.hidden = false;
      satz.textContent = heute ? 'Heute ist es so weit.' : `Wir sind verheiratet. Danke, dass ${wir ? 'ihr dabei wart' : 'du dabei warst'}.`;
      return false;
    }
    feld('cd-tage').textContent = Math.floor(rest / 864e5);
    feld('cd-std').textContent = zwei(Math.floor(rest / 36e5) % 24);
    feld('cd-min').textContent = zwei(Math.floor(rest / 6e4) % 60);
    feld('cd-sek').textContent = zwei(Math.floor(rest / 1e3) % 60);
    return true;
  };
  if (!tick()) return;
  const lauf = setInterval(() => { if (!tick()) clearInterval(lauf); }, 1000);
}

// Konfetti nach der Zusage
function konfetti() {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  if ((document.documentElement.dataset.aus || '').split(' ').includes('konfetti')) return; // im Designer abgeschaltet
  const farben = ['#b88a45', '#f4e3bf', '#ffffff', 'var(--farbe-akzent-hell)', '#d9b36a'];
  const box = document.createElement('div');
  box.className = 'konfetti';
  box.setAttribute('aria-hidden', 'true');
  box.innerHTML = Array.from({ length: 70 }, (_, n) => {
    const w = 6 + (n % 5) * 2;
    return `<i style="--x:${(n * 13.7) % 100}%;--w:${w}px;--h:${w * (n % 3 ? 1.6 : 1)}px;--f:${farben[n % farben.length]};--d:${((n * 0.037) % 0.9).toFixed(2)}s;--t:${(2.4 + (n % 7) * 0.3).toFixed(1)}s;--dx:${((n % 9) - 4) * 28}px;--r:${(n * 47) % 360}deg"></i>`;
  }).join('');
  document.body.append(box);
  setTimeout(() => box.remove(), 5200);
}

// Eine Zeile je Person: Name (die erste ist die Anmeldung selbst), Essenswunsch, Hinweis
function personenSammeln() {
  const zeilen = [...document.querySelectorAll('.person-zeile')];
  return zeilen.map((z, i) => ({
    name: i === 0 ? formular.name.value.trim() : z.querySelector('[name="p-name"]').value.trim(),
    kost: z.querySelector('[name="p-kost"]').value,
    hinweis: z.querySelector('[name="p-hinweis"]').value.trim(),
  }));
}
function personenZeigen() {
  const liste = feld('personen-liste');
  if (!liste) return;
  // vorhandene Eingaben sichern, bevor die Zeilen neu gebaut werden
  if (liste.children.length) personenDaten = personenSammeln();
  while (personenDaten.length < personen) personenDaten.push({ name: '', kost: '', hinweis: '' });
  const daten = personenDaten.slice(0, personen);
  liste.innerHTML = daten.map((p, i) => `
    <li class="person-zeile">
      <div class="person-kopf">
        <span class="person-nr" aria-hidden="true">${i + 1}</span>
        ${i === 0
    ? `<span class="person-name" data-feld="person-erster">${esc(formular.name.value.trim() || 'Name von oben')}</span><input type="hidden" name="p-name" value="">`
    : `<input name="p-name" maxlength="80" autocomplete="off" placeholder="Name der Begleitung" aria-label="Name, Person ${i + 1}" value="${esc(p.name)}">`}
        <select name="p-kost" aria-label="Essen, Person ${i + 1}">
          <option value="">isst alles</option>
          <option value="vegetarisch"${p.kost === 'vegetarisch' ? ' selected' : ''}>vegetarisch</option>
          <option value="vegan"${p.kost === 'vegan' ? ' selected' : ''}>vegan</option>
        </select>
      </div>
      <input name="p-hinweis" maxlength="120" autocomplete="off" placeholder="Allergie oder Wunsch (freiwillig)" aria-label="Hinweis, Person ${i + 1}" value="${esc(p.hinweis)}">
    </li>`).join('');
}
const essenZeile = (r) => {
  const l = (r.personen || []).filter((p) => p.kost);
  if (l.length) return ['Essen', l.map((p) => `${p.name || 'Gast'}: ${p.kost}`).join(', ')];
  return r.vegetarian || r.vegan ? ['Essen', [r.vegetarian && 'Vegetarisch', r.vegan && 'Vegan'].filter(Boolean).join(', ')] : null;
};

function zaehlerZeigen() {
  personenAnzeige.textContent = personen;
  document.querySelector('[data-schritt="-1"]').disabled = personen <= 1;
  document.querySelector('[data-schritt="1"]').disabled = personen >= maxPersonen;
}

function wahlZeigen() {
  // Personen und Essenswunsch sind von Anfang an sichtbar, nur eine Absage blendet sie aus
  const ja = formular.attending.value !== 'nein';
  document.querySelectorAll('.nur-ja').forEach((el) => (el.hidden = !ja));
  feld('personen-feld').hidden = !ja;
  personenZeigen();
  feld('song-feld').hidden = !ja || !info.zusageSong;
  feld('beitrag-feld').hidden = !ja || !info.zusageBeitrag;
  // Bei nur einem Platz braucht es keinen Zähler
  document.querySelector('.zaehler').closest('.feld').hidden = !ja || maxPersonen === 1;
  setze('absenden', formular.attending.value === 'nein' ? 'Absage senden' : 'Zusage senden');
}

function formularFuellen(r) {
  formular.name.value = r.name;
  formular.attending.value = r.attending ? 'ja' : 'nein';
  if (r.attending) personen = Math.max(1, Math.min(maxPersonen, r.persons));
  if (r.attending && r.personen?.length) personenDaten = r.personen.map((p) => ({ ...p }));
  else {
    // ältere Antwort ohne Personenliste: Namen aus „Mitreisende“, Haken gelten für alle
    const kost = r.vegan ? 'vegan' : r.vegetarian ? 'vegetarisch' : '';
    const namen = [r.name, ...String(r.companions || '').split(/\s*(?:,|;|\n|\+|&|\bund\b)\s*/i).map((t) => t.trim()).filter(Boolean)];
    personenDaten = Array.from({ length: Math.max(1, r.persons || 1) }, (_, i) => ({ name: namen[i] || '', kost, hinweis: '' }));
  }
  formular.song.value = r.song || '';
  formular.beitrag.value = r.beitrag || '';
  formular.message.value = r.message || '';
  feld('personen-liste').innerHTML = ''; // neu aus personenDaten aufbauen
  zaehlerZeigen();
  wahlZeigen();
}

function bestaetigungZeigen(r, druckt) {
  const zeilen = r.attending
    ? [
        ['Name', r.name],
        ['Personen', r.persons],
        ['Datum', langesDatum(info.church.date)],
        essenZeile(r),
        r.song ? ['Songwunsch', r.song] : null,
      ]
    : [['Name', r.name], ['Antwort', 'Absage']];
  feld('karte').innerHTML = `<dl>${zeilen.filter(Boolean).map(([k, w]) => `<div><dt>${esc(k)}</dt><dd>${esc(w)}</dd></div>`).join('')}</dl>`;
  setze('zusammenfassung', r.attending
    ? `Danke, ${r.name}! ${wir ? 'Eure Zusage ist' : 'Deine Zusage ist'} bei uns angekommen. Wir freuen uns riesig auf ${wir ? 'euch' : 'dich'}.`
    : `Schade, ${r.name}. Danke, dass ${wir ? 'ihr Bescheid gebt' : 'du Bescheid gibst'}. Wir denken an ${wir ? 'euch' : 'dich'}.`);
  const kal = feld('kalender-knopf');
  kal.hidden = !r.attending;
  formular.hidden = true;
  bestaetigung.hidden = false;
  if (druckt) bestaetigung.focus({ preventScroll: true });
}

function fehlerZeigen(text, feldName) {
  fehler.textContent = text;
  fehler.hidden = false;
  if (feldName === 'name') { formular.name.setAttribute('aria-invalid', 'true'); formular.name.focus(); }
  if (feldName === 'attending') { const w = document.querySelector('.reiter'); w.setAttribute('aria-invalid', 'true'); w.querySelector('input').focus(); }
}

formular.addEventListener('change', (e) => {
  if (e.target.name === 'attending') { wahlZeigen(); document.querySelector('.reiter').removeAttribute('aria-invalid'); fehler.hidden = true; }
});
formular.name.addEventListener('input', () => {
  formular.name.removeAttribute('aria-invalid');
  const erster = feld('person-erster');
  if (erster) erster.textContent = formular.name.value.trim() || 'Name von oben';
});
document.querySelectorAll('.zaehler-knopf').forEach((b) => b.addEventListener('click', () => {
  personen = Math.max(1, Math.min(maxPersonen, personen + Number(b.dataset.schritt)));
  zaehlerZeigen();
  wahlZeigen();
}));

formular.addEventListener('submit', async (e) => {
  e.preventDefault();
  fehler.hidden = true;
  const wahl = formular.attending.value;
  if (!wahl) return fehlerZeigen(`Bitte ${wir ? 'wählt' : 'wähle'} oben aus, ob ${wir ? 'ihr dabei seid' : 'du dabei bist'}.`, 'attending');
  const name = formular.name.value.trim();
  if (name.length < 2) return fehlerZeigen(`Bitte ${wir ? 'tragt euren' : 'trag deinen'} Namen ein.`, 'name');
  const knopf = formular.querySelector('.absenden');
  knopf.setAttribute('aria-busy', 'true');
  knopf.disabled = true;
  try {
    const res = await fetch('/api/rsvp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        code: info.invite?.code || '',
        token: tokenGast,
        name,
        attending: wahl === 'ja',
        persons: personen,
        personen: personenSammeln(),
        song: formular.song.value,
        beitrag: formular.beitrag.value,
        message: formular.message.value,
        website: formular.website.value,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return fehlerZeigen(data.error || 'Das hat nicht geklappt. Bitte versucht es noch einmal.', data.field);
    if (!info.invite && data.token) {
      tokenGast = data.token;
      try { localStorage.setItem(SPEICHER, JSON.stringify({ token: data.token, response: data.response })); } catch {}
    }
    info.response = data.response;
    bestaetigungZeigen(data.response, true);
    if (data.response.attending) konfetti();
    document.getElementById('buchen').scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
  } catch {
    fehlerZeigen('Keine Verbindung. Bitte prüft das Internet und versucht es noch einmal.');
  } finally {
    knopf.removeAttribute('aria-busy');
    knopf.disabled = false;
  }
});

document.getElementById('aendern').addEventListener('click', () => {
  if (info.response) formularFuellen(info.response);
  bestaetigung.hidden = true;
  formular.hidden = false;
  formular.name.focus();
});

async function start() {
  try {
    const res = await fetch(`/api/info${code ? `?code=${encodeURIComponent(code)}` : ''}`);
    info = await res.json();
  } catch {
    fehlerZeigen('Die Seite konnte nicht geladen werden. Bitte später noch einmal versuchen.');
    return;
  }
  seiteFuellen();
  if (!info.invite) {
    try {
      const gespeichert = JSON.parse(localStorage.getItem(SPEICHER) || 'null');
      if (gespeichert?.token) { tokenGast = gespeichert.token; info.response = gespeichert.response; }
    } catch {}
  }
  if (info.response) {
    formularFuellen(info.response);
    bestaetigungZeigen(info.response, false);
  }
}
start();
