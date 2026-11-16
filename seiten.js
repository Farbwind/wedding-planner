// Gemeinsames Seitengerüst: Kopf mit Menü und Fuß. Namen und Titel kommen aus den Angaben der Verwaltung.
// Die Inhalte der einzelnen Seiten liegen in public/seiten/<name>.html.

import fs from 'node:fs';
import path from 'node:path';

const MENUE = [
  ['/#termine', 'Termine', 'start'],
  ['/geschichte', 'Unsere Geschichte', 'geschichte'],
  ['/quiz', 'Quiz', 'quiz'],
  ['/kontakt', 'Kontakt', 'kontakt'],
];

// Kleine Symbole, mit <svg><use href="#name"/></svg> überall nutzbar
const SYMBOLE = `<svg width="0" height="0" style="position:absolute" aria-hidden="true">
  <symbol id="kalender" viewBox="0 0 24 24"><g fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><rect x="3.5" y="5" width="17" height="15" rx="2.5"/><path d="M3.5 10h17M8 3v4M16 3v4"/></g></symbol>
  <symbol id="pin" viewBox="0 0 24 24"><path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21z" fill="none" stroke="currentColor" stroke-width="1.6"/><circle cx="12" cy="9.5" r="2.4" fill="none" stroke="currentColor" stroke-width="1.6"/></symbol>
  <symbol id="telefon" viewBox="0 0 24 24"><path d="M6.6 3.5h2.6l1.4 4.2-2 1.4a12 12 0 0 0 6.3 6.3l1.4-2 4.2 1.4v2.6a2 2 0 0 1-2.2 2A16.6 16.6 0 0 1 4.6 5.7a2 2 0 0 1 2-2.2z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></symbol>
  <symbol id="brief" viewBox="0 0 24 24"><g fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"><rect x="3" y="5.5" width="18" height="13" rx="2"/><path d="M3.5 6.5l8.5 6.5 8.5-6.5"/></g></symbol>
  <symbol id="kamera" viewBox="0 0 24 24"><g fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"><path d="M4 8h3l1.5-2.5h7L17 8h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z"/><circle cx="12" cy="13" r="3.6"/></g></symbol>
</svg>`;

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

export function seitenGeruest({ VERSION, PUB, getSettings }) {
  const v = (pfad) => `${pfad}?v=${VERSION}`;

  // „Anna & Ben“ oder „Anna und Ben“ in zwei Namen zerlegen
  function paar() {
    const voll = getSettings().couple || '';
    const [a = voll, b = ''] = voll.split(/\s*&\s*|\s+und\s+/).map((x) => x.trim());
    return { voll, a, b, initialen: [a, b].filter(Boolean).map((x) => x[0].toUpperCase()) };
  }
  const titelVon = { start: (p) => `${p.voll} heiraten`, geschichte: () => 'Unsere Geschichte', quiz: () => 'Quiz', kontakt: () => 'Kontakt' };

  function layout({ name, titel, inhalt, skript, beschreibung }) {
    const p = paar();
    const menue = MENUE.map(([href, text, seite]) =>
      `<a href="${href}"${seite === name && name !== 'start' ? ' aria-current="page"' : ''}>${esc(text)}</a>`).join('\n      ');
    const seitenTitel = name === 'start' ? titel : `${titel} · ${p.voll}`;
    return `<!doctype html>
<html lang="de">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${esc(seitenTitel)}</title>
<meta name="description" content="${esc(beschreibung || `Hochzeit von ${p.voll}`)}">
<meta name="robots" content="noindex, nofollow">
<link rel="icon" href="/img/icon.svg" type="image/svg+xml">
<link rel="preload" href="/fonts/cormorant-garamond-latin-500-normal.woff2" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="${v('/style.css')}">
</head>
<body class="seite-${name}">
${SYMBOLE}
<header class="kopf">
  <a class="monogramm" href="/" aria-label="Zur Startseite">${p.initialen.map(esc).join('<span>&amp;</span>')}</a>
  <button class="menue-knopf" type="button" aria-expanded="false" aria-controls="hauptmenue"><span class="menue-striche" aria-hidden="true"></span><span class="menue-wort">Menü</span></button>
  <nav class="hauptmenue" id="hauptmenue" aria-label="Hauptmenü">
      ${menue}
      <a class="kopf-knopf" href="/#buchen">Zusagen</a>
  </nav>
</header>
${inhalt}
<footer class="fuss">
  <p class="fuss-namen">${esc(p.voll)}</p>
  <p data-feld="kontakt" hidden></p>
  <nav class="fuss-links" aria-label="Weitere Seiten"><a href="/kontakt">Kontakt</a><a href="/impressum">Impressum</a><a href="/datenschutz">Datenschutz</a></nav>
</footer>
<script src="${v('/js/basis.js')}"></script>
${skript ? `<script src="${v(skript)}" type="module"></script>` : ''}
</body>
</html>`;
  }

  const SKRIPTE = { start: '/app.js', geschichte: '/js/geschichte.js', quiz: '/js/quiz.js', kontakt: '/js/kontakt.js' };

  // Die Seite wird bei jedem Aufruf frisch gebaut, damit geänderte Namen aus der Verwaltung sofort erscheinen
  function seite(name) {
    const inhalt = fs.readFileSync(path.join(PUB, 'seiten', `${name}.html`), 'utf8');
    const p = paar();
    return layout({ name, titel: titelVon[name](p), inhalt, skript: SKRIPTE[name] });
  }

  return { layout, seite };
}
