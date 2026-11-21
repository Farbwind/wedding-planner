// Design der Gästeseite: Vorlagen, Anpassungen (Farben, Schrift, Formen, Elemente, eigene Blöcke) und der Pro-Modus mit eigenem CSS und HTML.
// Gespeichert wird ein JSON in settings ('design_json' veröffentlicht, 'design_entwurf' in Arbeit). Dieses Modul prüft alles, was hineinkommt,
// und baut daraus das CSS und die Blöcke für seiten.js. Pro-Modus: nur HTML und CSS, kein JavaScript (siehe auch die Content-Security-Policy in server.js).

import { MOTIVE, motivHtml } from './motive.js';
export { MOTIVE };

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const HEX = /^#[0-9a-fA-F]{6}$/;

/* ---- Schriften (liegen lokal in /fonts, Dateien kommen beim Bauen aus @fontsource) ---- */
const F = (familie, dateien) => ({ familie, dateien });
const CORMORANT = F('Cormorant Garamond', [[400, 'normal', 'cormorant-garamond-latin-400-normal'], [500, 'normal', 'cormorant-garamond-latin-500-normal'], [600, 'normal', 'cormorant-garamond-latin-600-normal'], [500, 'italic', 'cormorant-garamond-latin-500-italic']]);
const HANKEN = F('Hanken Grotesk', [[400, 'normal', 'hanken-grotesk-latin-400-normal'], [500, 'normal', 'hanken-grotesk-latin-500-normal'], [600, 'normal', 'hanken-grotesk-latin-600-normal']]);
const PLAYFAIR = F('Playfair Display', [[400, 'normal', 'playfair-display-latin-400-normal'], [500, 'normal', 'playfair-display-latin-500-normal'], [400, 'italic', 'playfair-display-latin-400-italic'], [500, 'italic', 'playfair-display-latin-500-italic']]);
const DMSERIF = F('DM Serif Display', [[400, 'normal', 'dm-serif-display-latin-400-normal'], [400, 'italic', 'dm-serif-display-latin-400-italic']]);
const DMSANS = F('DM Sans', [[400, 'normal', 'dm-sans-latin-400-normal'], [500, 'normal', 'dm-sans-latin-500-normal'], [600, 'normal', 'dm-sans-latin-600-normal']]);
const FRAUNCES = F('Fraunces', [[400, 'normal', 'fraunces-latin-400-normal'], [500, 'normal', 'fraunces-latin-500-normal'], [400, 'italic', 'fraunces-latin-400-italic'], [500, 'italic', 'fraunces-latin-500-italic']]);
const PINYON = F('Pinyon Script', [[400, 'normal', 'pinyon-script-latin-400-normal']]);

const INSTRUMENT = F('Instrument Serif', [[400, 'normal', 'instrument-serif-latin-400-normal'], [400, 'italic', 'instrument-serif-latin-400-italic']]);
const BRICOLAGE = F('Bricolage Grotesque', [[400, 'normal', 'bricolage-grotesque-latin-400-normal'], [500, 'normal', 'bricolage-grotesque-latin-500-normal'], [600, 'normal', 'bricolage-grotesque-latin-600-normal'], [700, 'normal', 'bricolage-grotesque-latin-700-normal']]);
const YOUNG = F('Young Serif', [[400, 'normal', 'young-serif-latin-400-normal']]);
const ALLURA = F('Allura', [[400, 'normal', 'allura-latin-400-normal']]);
const ELITE = F('Special Elite', [[400, 'normal', 'special-elite-latin-400-normal']]);
const COURIER = F('Courier Prime', [[400, 'normal', 'courier-prime-latin-400-normal'], [700, 'normal', 'courier-prime-latin-700-normal']]);
const OSWALD = F('Oswald', [[400, 'normal', 'oswald-latin-400-normal'], [500, 'normal', 'oswald-latin-500-normal'], [600, 'normal', 'oswald-latin-600-normal']]);
const BODONI = F('Bodoni Moda', [[400, 'normal', 'bodoni-moda-latin-400-normal'], [500, 'normal', 'bodoni-moda-latin-500-normal'], [400, 'italic', 'bodoni-moda-latin-400-italic'], [500, 'italic', 'bodoni-moda-latin-500-italic']]);
const REENIE = F('Reenie Beanie', [[400, 'normal', 'reenie-beanie-latin-400-normal']]);
const CAVEAT = F('Caveat', [[500, 'normal', 'caveat-latin-500-normal'], [700, 'normal', 'caveat-latin-700-normal']]);

export const SCHRIFTEN = {
  klassisch: { name: 'Klassisch', beschreibung: 'Cormorant Garamond und Hanken Grotesk', titel: CORMORANT, text: HANKEN, stapelTitel: '"Cormorant Garamond", Georgia, serif', stapelText: '"Hanken Grotesk", system-ui, sans-serif' },
  elegant: { name: 'Elegant', beschreibung: 'Playfair Display und Hanken Grotesk', titel: PLAYFAIR, text: HANKEN, stapelTitel: '"Playfair Display", Georgia, serif', stapelText: '"Hanken Grotesk", system-ui, sans-serif' },
  modern: { name: 'Modern', beschreibung: 'DM Serif Display und DM Sans', titel: DMSERIF, text: DMSANS, stapelTitel: '"DM Serif Display", Georgia, serif', stapelText: '"DM Sans", system-ui, sans-serif' },
  boho: { name: 'Boho', beschreibung: 'Fraunces und DM Sans', titel: FRAUNCES, text: DMSANS, stapelTitel: '"Fraunces", Georgia, serif', stapelText: '"DM Sans", system-ui, sans-serif' },
  schreib: { name: 'Handschrift', beschreibung: 'Pinyon Script für die Namen, Cormorant Garamond und Hanken Grotesk', titel: CORMORANT, text: HANKEN, namenSchrift: PINYON, stapelTitel: '"Cormorant Garamond", Georgia, serif', stapelText: '"Hanken Grotesk", system-ui, sans-serif', stapelName: '"Pinyon Script", "Cormorant Garamond", cursive' },
  magazin: { name: 'Magazin', beschreibung: 'Instrument Serif und DM Sans, große Namen wie auf einem Titelblatt', titel: INSTRUMENT, text: DMSANS, stapelTitel: '"Instrument Serif", Georgia, serif', stapelText: '"DM Sans", system-ui, sans-serif' },
  retro: { name: 'Retro', beschreibung: 'Young Serif und Bricolage Grotesque, kräftig und warm', titel: YOUNG, text: BRICOLAGE, stapelTitel: '"Young Serif", Georgia, serif', stapelText: '"Bricolage Grotesque", system-ui, sans-serif' },
  hand: { name: 'Handgeschrieben', beschreibung: 'Caveat für die Namen, Fraunces und DM Sans', titel: FRAUNCES, text: DMSANS, namenSchrift: CAVEAT, stapelTitel: '"Fraunces", Georgia, serif', stapelText: '"DM Sans", system-ui, sans-serif', stapelName: '"Caveat", "Fraunces", cursive' },
  zart: { name: 'Zart', beschreibung: 'Allura für „Wir heiraten“, Cormorant Garamond und Hanken Grotesk', titel: CORMORANT, text: HANKEN, namenSchrift: ALLURA, stapelTitel: '"Cormorant Garamond", Georgia, serif', stapelText: '"Hanken Grotesk", system-ui, sans-serif', stapelName: '"Allura", "Cormorant Garamond", cursive' },
  schreibmaschine: { name: 'Schreibmaschine', beschreibung: 'Special Elite und DM Sans, wie getippt', titel: ELITE, text: DMSANS, stapelTitel: '"Special Elite", "Courier New", monospace', stapelText: '"DM Sans", system-ui, sans-serif' },
  reisepass: { name: 'Reisepass', beschreibung: 'Oswald und Courier Prime, wie Stempel und Formular', titel: OSWALD, text: COURIER, stapelTitel: '"Oswald", Impact, sans-serif', stapelText: '"Courier Prime", "Courier New", monospace' },
  franzoesisch: { name: 'Französisch', beschreibung: 'Bodoni Moda, Reenie Beanie für die Namen und DM Sans', titel: BODONI, text: DMSANS, namenSchrift: REENIE, stapelTitel: '"Bodoni Moda", Georgia, serif', stapelText: '"DM Sans", system-ui, sans-serif', stapelName: '"Reenie Beanie", "Bodoni Moda", cursive' },
  schlicht: { name: 'Schlicht', beschreibung: 'DM Sans in Titeln und Text', titel: DMSANS, text: DMSANS, stapelTitel: '"DM Sans", system-ui, sans-serif', stapelText: '"DM Sans", system-ui, sans-serif' },
};

export const SEKTIONEN = [['countdown', 'Countdown'], ['termine', 'Termine'], ['buchen', 'Zusage'], ['momente', 'Momente von uns'], ['geschenk', 'Geschenke'], ['wissen', 'Gut zu wissen']];
export const ELEMENTE = [['siegel', 'Drehendes Siegel am Foto'], ['lichtpunkte', 'Aufsteigende Lichtpunkte'], ['laufband', 'Laufband mit Namen und Datum'], ['konfetti', 'Konfetti nach der Zusage']];
const ELEMENT_STANDARD = { siegel: true, lichtpunkte: false, laufband: false, konfetti: true };
export const STILE = [
  ['sanft', 'Sanft', 'Weiche Karten und feine Linien'],
  ['magazin', 'Magazin', 'Riesige Namen, Haarlinien, Nummern wie in einem Heft'],
  ['retro', 'Retro', 'Kräftige Rahmen, harte Schatten, Wellenlinie unter den Titeln'],
  ['polaroid', 'Polaroid', 'Fotos mit weißem Rahmen und Klebeband, leicht schief'],
  ['fliesen', 'Fliesen', 'Doppelte Rahmen und ein Band aus Fliesenmuster'],
  ['reise', 'Reise', 'Termine als Bordkarten, Stempel und Schreibmaschinenschrift'],
];
export const HEROS = [['bogen', 'Foto im Bogen'], ['vollbild', 'Foto als Hintergrund'], ['geteilt', 'Foto geteilt, rechts'], ['schlicht', 'Nur Schrift'], ['karte', 'Karte mit Motiv']];
export const BLOCKTYPEN = [['text', 'Text mit Überschrift'], ['zitat', 'Zitat'], ['bild', 'Bild'], ['zweispaltig', 'Bild und Text'], ['knopf', 'Knopf mit Link'], ['trenner', 'Trenner']];

/* ---- Vorlagen ---- */
const alleAn = { countdown: true, siegel: false, lichtpunkte: false, laufband: false, konfetti: true };
const rf = ['countdown', 'termine', 'buchen', 'momente', 'geschenk', 'wissen'];
// Eine Vorlage ist: Farben, Schrift, Motiv, Charakter (stil), Flächen, Textur, Rundung, Knöpfe, Anfang und Effekte
const v = (name, beschreibung, farben, schrift, o) => ({ name, beschreibung, design: { vorlage: null, farben, schrift, motiv: o.motiv || 'keins', stil: o.stil || 'sanft', flaechen: o.flaechen || 'bunt', textur: o.textur || 'papier', rundung: o.rundung || 'weich', knoepfe: o.knoepfe || 'pille', hero: o.hero || 'karte', elemente: { ...alleAn, ...(o.elemente || {}) }, reihenfolge: rf, aus: [], bloecke: [], css: '', html_oben: '', html_unten: '' } });
export const VORLAGEN = {
  schleierkraut: v('Schleierkraut', 'Salbeigrüne Karte mit gezeichnetem Trockenblumenstrauß, zarte Schreibschrift, weiße Blüten.',
    { akzent: '#5c6b4b', grund: '#eef0e1', band: '#d6dcc3', text: '#2e3528', gold: '#a39463', licht: '#f6f3e2', tief: '#46553a' }, 'zart', { motiv: 'schleierkraut' }),
  himmel: v('Himmel', 'Blauer Himmel, Wolken und schwebende Seifenblasen. Leicht, verträumt und so noch nirgends gesehen.',
    { akzent: '#4a7fbf', grund: '#f3f8ff', band: '#dbeafb', text: '#22364d', gold: '#e08fb5', licht: '#ffe8f2', tief: '#2f5580' }, 'magazin', { motiv: 'himmel', textur: 'keine', rundung: 'rund' }),
  sueden: v('Süden', 'Gezeichnetes Küstendorf mit Olivenbäumen, Palme und Leuchtturm. Cremefarbenes Papier und Schreibschrift.',
    { akzent: '#35523f', grund: '#f6eee0', band: '#e8dcc5', text: '#2b2a25', gold: '#2e6173', licht: '#f1e3c8', tief: '#26403a' }, 'schreib', { motiv: 'sueden' }),
  fingerabdruck: v('Fingerabdruck', 'Kraftpapier, ein Herz aus Fingerabdruck in Rot und Schreibmaschinenschrift. Handgemacht und persönlich.',
    { akzent: '#b2382a', grund: '#dcc19b', band: '#d0b088', text: '#4a3225', gold: '#b2382a', licht: '#e8d2ad', tief: '#5a2b22' }, 'schreibmaschine', { motiv: 'fingerabdruck', rundung: 'eckig', knoepfe: 'eckig' }),
  reisepass: v('Reisepass', 'Pass mit Globus, Stempel und Bordkarten für die Termine. Für alle, die gern verreisen.',
    { akzent: '#1f3a5f', grund: '#f0e7d1', band: '#e3d6b6', text: '#2a2a27', gold: '#b48e36', licht: '#f4e8c6', tief: '#14263f' }, 'reisepass', { motiv: 'reise', stil: 'reise', rundung: 'eckig', knoepfe: 'eckig' }),
  karikatur: v('Karikatur', 'Braut und Bräutigam als lockere Tuschezeichnung im französischen Stil, mit Schreibschrift und Bodoni.',
    { akzent: '#27324d', grund: '#fbf5ea', band: '#f2e4d3', text: '#232323', gold: '#c8453a', licht: '#f7dcd2', tief: '#222b44' }, 'franzoesisch', { motiv: 'karikatur' }),
};
for (const [id, vl] of Object.entries(VORLAGEN)) vl.design.vorlage = id;

export const standardDesign = () => JSON.parse(JSON.stringify(VORLAGEN.schleierkraut.design));

/* ---- Eingaben prüfen: nur bekannte Felder, Werte aus Listen, Farben als #rrggbb, Texte gekürzt ---- */
const kurz = (t, n) => String(t ?? '').slice(0, n);
export function bereinigen(eingabe) {
  const e = eingabe && typeof eingabe === 'object' ? eingabe : {};
  const basis = standardDesign();
  const aus = {
    vorlage: VORLAGEN[e.vorlage] ? e.vorlage : 'eigene',
    farben: {},
    schrift: SCHRIFTEN[e.schrift] ? e.schrift : basis.schrift,
    motiv: MOTIVE.some(([k]) => k === e.motiv) ? e.motiv : 'keins',
    stil: STILE.some(([k]) => k === e.stil) ? e.stil : 'sanft',
    flaechen: ['ruhig', 'bunt'].includes(e.flaechen) ? e.flaechen : 'ruhig',
    textur: ['keine', 'papier'].includes(e.textur) ? e.textur : 'keine',
    rundung: ['eckig', 'weich', 'rund'].includes(e.rundung) ? e.rundung : basis.rundung,
    knoepfe: ['pille', 'eckig'].includes(e.knoepfe) ? e.knoepfe : basis.knoepfe,
    hero: HEROS.some(([k]) => k === e.hero) ? e.hero : basis.hero,
    elemente: {},
    reihenfolge: [],
    aus: [],
    bloecke: [],
    css: kurz(e.css, 30000),
    html_oben: kurz(e.html_oben, 30000),
    html_unten: kurz(e.html_unten, 30000),
  };
  for (const k of ['akzent', 'grund', 'text', 'tief', 'gold', 'licht', 'band']) {
    const w = e.farben?.[k];
    if (HEX.test(w)) aus.farben[k] = w.toLowerCase();
    else if (!['tief', 'band'].includes(k)) aus.farben[k] = basis.farben[k] || '';
  }
  for (const [k] of ELEMENTE) aus.elemente[k] = e.elemente && typeof e.elemente[k] === 'boolean' ? e.elemente[k] : ELEMENT_STANDARD[k];
  aus.elemente.countdown = e.elemente ? e.elemente.countdown !== false : true;
  const ids = SEKTIONEN.map(([k]) => k);
  const gewuenscht = Array.isArray(e.reihenfolge) ? e.reihenfolge.filter((k) => ids.includes(k)) : [];
  aus.reihenfolge = [...new Set([...gewuenscht, ...ids])];
  aus.aus = Array.isArray(e.aus) ? [...new Set(e.aus.filter((k) => ids.includes(k)))] : [];
  const blockIds = new Set();
  for (const b of (Array.isArray(e.bloecke) ? e.bloecke : []).slice(0, 12)) {
    const typ = BLOCKTYPEN.some(([k]) => k === b?.typ) ? b.typ : null;
    if (!typ) continue;
    let id = String(b.id || '').replace(/[^a-z0-9-]/gi, '').slice(0, 20) || `b${blockIds.size + 1}`;
    while (blockIds.has(id)) id += 'x';
    blockIds.add(id);
    aus.bloecke.push({
      id, typ,
      titel: kurz(b.titel, 120), text: kurz(b.text, 4000), bild: /^[a-f0-9]{24}\.jpg$/.test(b.bild || '') ? b.bild : '',
      link: linkOk(b.link) ? kurz(b.link, 300) : '', knopf: kurz(b.knopf, 60),
      nach: ids.includes(b.nach) ? b.nach : (b.nach === 'anfang' ? 'anfang' : 'wissen'),
    });
  }
  return aus;
}
const linkOk = (l) => /^(https:\/\/|\/|mailto:|#)/.test(String(l || '').trim());

/* ---- Farben ableiten ---- */
function mischen(a, b, anteil) {
  const kanal = (hex, i) => parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16);
  const wert = (i) => Math.round(kanal(a, i) + (kanal(b, i) - kanal(a, i)) * anteil).toString(16).padStart(2, '0');
  return `#${wert(0)}${wert(1)}${wert(2)}`;
}
const hell = (hex) => { const k = (i) => { const c = parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16) / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; }; return 0.2126 * k(0) + 0.7152 * k(1) + 0.0722 * k(2); };

/* ---- CSS: Schriften, Variablen, Reihenfolge, Ausblenden ---- */
export function cssVon(design) {
  const d = design;
  const z = [];
  const fa = d.farben;
  const dunkel = hell(fa.grund) < 0.3;
  const schrift = SCHRIFTEN[d.schrift];
  // Schriftdateien nur für die gewählte Paarung laden, die Standardschriften stehen in style.css
  const faces = [];
  for (const teil of [schrift.titel, schrift.text, schrift.namenSchrift].filter(Boolean)) {
    if (teil === CORMORANT || teil === HANKEN) continue;
    for (const [gew, stil, datei] of teil.dateien) faces.push(`@font-face{font-family:"${teil.familie}";src:url(/fonts/${datei}.woff2) format("woff2");font-weight:${gew};font-style:${stil};font-display:swap}`);
  }
  z.push(`--farbe-akzent:${fa.akzent}`, `--farbe-akzent-dunkel:${mischen(fa.akzent, dunkel ? '#ffffff' : '#000000', dunkel ? 0.2 : 0.25)}`, `--farbe-akzent-hell:${mischen(fa.akzent, fa.grund, 0.88)}`);
  z.push(`--farbe-grund:${fa.grund}`, `--farbe-text:${fa.text}`, `--farbe-text-weich:${mischen(fa.text, fa.grund, 0.32)}`);
  z.push(`--farbe-band:${fa.band || mischen(fa.grund, fa.text, dunkel ? 0.08 : 0.06)}`, `--farbe-linie:${mischen(fa.grund, fa.text, dunkel ? 0.16 : 0.12)}`, `--farbe-flaeche:${dunkel ? mischen(fa.grund, '#ffffff', 0.06) : mischen(fa.grund, '#ffffff', 0.7)}`);
  z.push(`--farbe-tief:${fa.tief || (dunkel ? mischen(fa.grund, '#000000', 0.35) : mischen(fa.akzent, '#0b120e', 0.3))}`, `--farbe-gold:${fa.gold}`, `--farbe-licht:${fa.licht}`);
  z.push(`--farbe-auf-akzent:${hell(fa.akzent) > 0.5 ? '#161616' : '#ffffff'}`);
  z.push(`--schrift-titel:${schrift.stapelTitel}`, `--schrift-text:${schrift.stapelText}`, `--schrift-name:${schrift.stapelName || schrift.stapelTitel}`, `--name-abstand:${schrift.namenSchrift ? '0' : '-.02em'}`);
  const rad = { eckig: ['4px', '6px', '4px'], weich: ['22px', '26px', '14px'], rund: ['34px', '42px', '24px'] }[d.rundung];
  z.push(`--r-karte:${rad[0]}`, `--r-gross:${rad[1]}`, `--radius:${rad[2]}`);
  const regeln = [`${faces.join('')}:root{${z.join(';')}}`];
  if (dunkel) regeln.push('color-scheme: dark;'.replace(/^/, ':root{') + '}');
  // Reihenfolge der Abschnitte und ausgeblendete Elemente
  const reihe = d.reihenfolge.filter((k) => k !== 'countdown');
  const m = 'body.seite-start main';
  regeln.push(`${m}{display:flex;flex-direction:column}`);
  regeln.push(`${m}>.countdown{order:${d.reihenfolge.indexOf('countdown') * 10 + 10}}`);
  for (const k of reihe) regeln.push(`${m}>.${k}{order:${d.reihenfolge.indexOf(k) * 10 + 10}}`);
  for (const k of d.aus) regeln.push(`${m}>.${k}{display:none!important}`);
  if (!d.elemente.countdown) regeln.push(`${m}>.countdown{display:none!important}`);
  return regeln.join('\n');
}
// Attribute am <html>, mit denen style.css die Varianten schaltet
export function htmlAttribute(d) {
  const aus = [...Object.entries(d.elemente).filter(([, an]) => !an).map(([k]) => k)];
  const dunkel = hell(d.farben.grund) < 0.3 ? ' data-dunkel' : '';
  return ` data-hero="${esc(d.hero)}" data-knoepfe="${esc(d.knoepfe)}" data-rundung="${esc(d.rundung)}" data-stil="${esc(d.stil)}" data-motiv="${esc(d.motiv)}" data-flaechen="${esc(d.flaechen)}" data-textur="${esc(d.textur)}" data-aus="${esc(aus.join(' '))}"${dunkel}`;
}

/* ---- Eigene Blöcke ---- */
export function bloeckeHtml(d) {
  const ids = d.reihenfolge;
  return d.bloecke.map((b) => {
    const basis = b.nach === 'anfang' ? 5 : (ids.indexOf(b.nach) * 10 + 10) + 1 + d.bloecke.indexOf(b);
    const absaetze = esc(b.text).split(/\n{2,}/).map((a) => `<p>${a.replace(/\n/g, '<br>')}</p>`).join('');
    const titel = b.titel ? `<h2>${esc(b.titel)}</h2>` : '';
    const bild = b.bild ? `<figure class="bl-bild"><img src="/bilder/${esc(b.bild)}" alt="${esc(b.titel || 'Foto')}" loading="lazy"></figure>` : '';
    let innen = '';
    if (b.typ === 'text') innen = `${titel}<div class="bl-text">${absaetze}</div>`;
    else if (b.typ === 'zitat') innen = `<blockquote class="bl-zitat">${absaetze}${b.titel ? `<footer>${esc(b.titel)}</footer>` : ''}</blockquote>`;
    else if (b.typ === 'bild') innen = `${bild}`;
    else if (b.typ === 'zweispaltig') innen = `<div class="bl-zwei">${bild}<div>${titel}<div class="bl-text">${absaetze}</div></div></div>`;
    else if (b.typ === 'knopf') innen = `${titel}<div class="bl-text">${absaetze}</div>${b.link ? `<p><a class="knopf" href="${esc(b.link)}"${/^https:/.test(b.link) ? ' target="_blank" rel="noopener"' : ''}>${esc(b.knopf || 'Mehr erfahren')}</a></p>` : ''}`;
    else if (b.typ === 'trenner') innen = '<div class="bl-trenner" aria-hidden="true"><span></span></div>';
    return `<section class="block block-${b.typ}" id="block-${esc(b.id)}" style="order:${basis}"><div class="block-innen">${innen}</div></section>`;
  }).join('\n');
}

/* ---- Pro-Modus: HTML und CSS säubern. JavaScript, Formulare und fremde Quellen sind nicht erlaubt ---- */
export function htmlSaeubern(html) {
  return String(html || '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<\s*(script|iframe|object|embed|link|meta|base|form|input|button|textarea|select|template|frame|frameset|applet|noscript)\b[\s\S]*?(<\s*\/\s*\1\s*>|$)/gi, '')
    .replace(/<\s*(script|iframe|object|embed|link|meta|base|form|input|button|textarea|select|template|frame|applet)\b[^>]*>/gi, '')
    .replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]*)/gi, '')
    .replace(/\s(href|src|action|formaction|xlink:href|srcdoc)\s*=\s*("\s*(javascript|data:text|vbscript)[^"]*"|'\s*(javascript|data:text|vbscript)[^']*')/gi, ' $1="#"')
    .replace(/<style\b([^>]*)>([\s\S]*?)<\/style>/gi, (_, a, css) => `<style>${cssSaeubern(css)}</style>`);
}
export function cssSaeubern(css) {
  return String(css || '')
    .replace(/<\/?style[^>]*>/gi, '')
    .replace(/@import[^;]*;?/gi, '')
    .replace(/expression\s*\(/gi, '(')
    .replace(/behaviou?r\s*:[^;}]*/gi, '')
    .replace(/-moz-binding\s*:[^;}]*/gi, '')
    .replace(/url\(\s*(['"]?)\s*(https?:|\/\/|javascript:|data:(?!image\/))[^)]*\)/gi, 'none');
}

// Laufband unter dem Anfang: Namen, Datum und Ort im Wechsel mit einer kleinen Raute
export function laufbandHtml(d, teile) {
  const t = (teile || []).filter(Boolean);
  if (!d.elemente.laufband || !t.length) return '';
  const einheit = `<span>${t.map(esc).join('<i></i>')}<i></i></span>`;
  return `<div class="laufband" aria-hidden="true" style="order:1"><div class="laufband-spur">${einheit.repeat(8)}</div></div>`;
}

// Alles, was seiten.js für eine Seite braucht
export function aufbereiten(design, laufbandTexte, motivTexte) {
  const d = bereinigen(design);
  return {
    design: d,
    css: cssVon(d),
    proCss: cssSaeubern(d.css),
    attribute: htmlAttribute(d),
    bloecke: bloeckeHtml(d),
    laufband: laufbandHtml(d, laufbandTexte),
    motiv: motivHtml(d.motiv, motivTexte),
    oben: htmlSaeubern(d.html_oben),
    unten: htmlSaeubern(d.html_unten),
  };
}
