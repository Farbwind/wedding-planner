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

const tag = (iso, opts) => new Date(`${iso}T12:00:00`).toLocaleDateString('de-DE', opts);
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
  if (i.hasPhoto) { feld('foto').src = '/foto'; feld('foto-rahmen').hidden = false; document.getElementById('start').classList.add('mit-foto'); }

  setze('hero-datum', langesDatum(i.church.date));
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
  setze('name-label', i.invite ? 'Name' : 'Name, bei mehreren gern alle');
  setze('max-hinweis', i.invite && maxPersonen > 1 ? `Für euch sind ${maxPersonen} Plätze reserviert.` : '');
  if (i.codeUnknown) feld('code-unbekannt').hidden = false;
  if (i.contact) { const k = setze('kontakt', `Fragen? ${i.contact}`); k.hidden = false; }

  formular.name.value = i.invite?.name || '';
  if (i.invite && maxPersonen > 1) personen = maxPersonen;
  zaehlerZeigen();
  wahlZeigen();
}

function zaehlerZeigen() {
  personenAnzeige.textContent = personen;
  document.querySelector('[data-schritt="-1"]').disabled = personen <= 1;
  document.querySelector('[data-schritt="1"]').disabled = personen >= maxPersonen;
}

function wahlZeigen() {
  // Personen und Essenswunsch sind von Anfang an sichtbar, nur eine Absage blendet sie aus
  const ja = formular.attending.value !== 'nein';
  document.querySelectorAll('.nur-ja').forEach((el) => (el.hidden = !ja));
  feld('mitreisende-feld').hidden = !ja || personen < 2;
  // Bei nur einem Platz braucht es keinen Zähler
  document.querySelector('.zaehler').closest('.feld').hidden = !ja || maxPersonen === 1;
  setze('absenden', formular.attending.value === 'nein' ? 'Absage senden' : 'Zusage senden');
}

function formularFuellen(r) {
  formular.name.value = r.name;
  formular.attending.value = r.attending ? 'ja' : 'nein';
  if (r.attending) personen = Math.max(1, Math.min(maxPersonen, r.persons));
  formular.companions.value = r.companions || '';
  formular.vegetarian.checked = !!r.vegetarian;
  formular.vegan.checked = !!r.vegan;
  formular.message.value = r.message || '';
  zaehlerZeigen();
  wahlZeigen();
}

function bestaetigungZeigen(r, druckt) {
  const zeilen = r.attending
    ? [
        ['Name', r.name],
        ['Personen', r.persons],
        ['Datum', langesDatum(info.church.date)],
        r.vegetarian || r.vegan ? ['Essen', [r.vegetarian && 'Vegetarisch', r.vegan && 'Vegan'].filter(Boolean).join(', ')] : null,
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
formular.name.addEventListener('input', () => formular.name.removeAttribute('aria-invalid'));
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
        companions: formular.companions.value,
        vegetarian: formular.vegetarian.checked,
        vegan: formular.vegan.checked,
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
