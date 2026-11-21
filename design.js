// Design der Gästeseite: Vorlagen, Anpassungen (Farben, Schrift, Formen, Elemente, eigene Blöcke) und der Pro-Modus mit eigenem CSS und HTML.
// Gespeichert wird ein JSON in settings ('design_json' veröffentlicht, 'design_entwurf' in Arbeit). Dieses Modul prüft alles, was hineinkommt,
// und baut daraus das CSS und die Blöcke für seiten.js. Pro-Modus: nur HTML und CSS, kein JavaScript (siehe auch die Content-Security-Policy in server.js).

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
];
export const HEROS = [['bogen', 'Foto im Bogen'], ['vollbild', 'Foto als Hintergrund'], ['geteilt', 'Foto geteilt, rechts'], ['schlicht', 'Nur Schrift']];
export const BLOCKTYPEN = [['text', 'Text mit Überschrift'], ['zitat', 'Zitat'], ['bild', 'Bild'], ['zweispaltig', 'Bild und Text'], ['knopf', 'Knopf mit Link'], ['trenner', 'Trenner']];

/* ---- Vorlagen ---- */
const alleAn = { countdown: true, siegel: true, lichtpunkte: false, laufband: false, konfetti: true };
const rf = ['countdown', 'termine', 'buchen', 'momente', 'geschenk', 'wissen'];
// Eine Vorlage ist: Farben, Schrift, Charakter (stil), Flächen, Textur, Rundung, Knöpfe, Anfang und Effekte
const v = (name, beschreibung, farben, schrift, o) => ({ name, beschreibung, design: { vorlage: null, farben, schrift, stil: o.stil || 'sanft', flaechen: o.flaechen || 'bunt', textur: o.textur || 'keine', rundung: o.rundung || 'weich', knoepfe: o.knoepfe || 'pille', hero: o.hero || 'bogen', elemente: { ...alleAn, ...(o.elemente || {}) }, reihenfolge: rf, aus: [], bloecke: [], css: '', html_oben: '', html_unten: '' } });
export const VORLAGEN = {
  abendlicht: v('Abendlicht', 'Tiefes Salbeigrün auf warmem Cremeweiß, Goldlinien, Foto im Bogen. Feierlich und warm.',
    { akzent: '#3d5a47', grund: '#f8f1e3', band: '#ecdfc4', text: '#2a2b26', gold: '#b4803a', licht: '#f2d9a6', tief: '#22372b' }, 'klassisch', { textur: 'papier', elemente: { siegel: true } }),
  dolcevita: v('Dolce Vita', 'Butter, Tomatenrot und Pinienwald. Italienischer Sommer mit Laufband und kräftigen Rahmen.',
    { akzent: '#d2402b', grund: '#fdf2cc', band: '#f7de86', text: '#3a1f14', gold: '#1f6a4c', licht: '#ffd9c9', tief: '#1f5a43' }, 'retro', { stil: 'retro', textur: 'papier', rundung: 'weich', hero: 'bogen', elemente: { laufband: true, siegel: true } }),
  magazin: v('Magazin', 'Zeitungspapier, Tinte und ein Hauch Zinnober. Namen so groß wie auf einem Titelblatt.',
    { akzent: '#161513', grund: '#f1ece1', band: '#e3dccb', text: '#161513', gold: '#c4472b', licht: '#f1ece1', tief: '#161513' }, 'magazin', { stil: 'magazin', textur: 'papier', rundung: 'eckig', knoepfe: 'eckig', hero: 'geteilt', elemente: { siegel: false, laufband: true, konfetti: false } }),
  olivgarten: v('Olivgarten', 'Olive, Salbei und Sonnengold. Runde Formen, weich und wild wie ein Gartenfest.',
    { akzent: '#55683a', grund: '#f5f1e1', band: '#dde4c4', text: '#263020', gold: '#b9862f', licht: '#f1e2b0', tief: '#34441f' }, 'boho', { textur: 'papier', rundung: 'rund', hero: 'bogen', elemente: { siegel: true } }),
  mitternacht: v('Mitternacht', 'Nachtblau, Gold und aufsteigende Sterne. Das einzige Design mit Lichtpunkten.',
    { akzent: '#e3c27c', grund: '#0f1b27', band: '#172838', text: '#eaeef2', gold: '#e3c27c', licht: '#31465a', tief: '#08121b' }, 'elegant', { textur: 'papier', hero: 'vollbild', elemente: { siegel: true, lichtpunkte: true } }),
  polaroid: v('Polaroid', 'Blush, Weinrot und ein Album voller Schnappschüsse mit Klebeband. Persönlich und handgeschrieben.',
    { akzent: '#9c4558', grund: '#fbeee9', band: '#f2d6d0', text: '#3b2427', gold: '#c08a5b', licht: '#f8dccf', tief: '#5b2a36' }, 'hand', { stil: 'polaroid', textur: 'papier', rundung: 'weich', hero: 'bogen', elemente: { siegel: false } }),
  azul: v('Azul', 'Kobaltblau, Cremeweiß und Sonnengelb. Fliesenmuster und doppelte Rahmen wie am Mittelmeer.',
    { akzent: '#1d4fa3', grund: '#f7f3e7', band: '#d3e1f4', text: '#12254a', gold: '#e8ae2c', licht: '#d3e1f4', tief: '#0d2d66' }, 'modern', { stil: 'fliesen', textur: 'keine', rundung: 'eckig', knoepfe: 'eckig', hero: 'geteilt', elemente: { siegel: false, konfetti: true } }),
};
for (const [id, vl] of Object.entries(VORLAGEN)) vl.design.vorlage = id;

export const standardDesign = () => JSON.parse(JSON.stringify(VORLAGEN.abendlicht.design));

/* ---- Eingaben prüfen: nur bekannte Felder, Werte aus Listen, Farben als #rrggbb, Texte gekürzt ---- */
const kurz = (t, n) => String(t ?? '').slice(0, n);
export function bereinigen(eingabe) {
  const e = eingabe && typeof eingabe === 'object' ? eingabe : {};
  const basis = standardDesign();
  const aus = {
    vorlage: VORLAGEN[e.vorlage] ? e.vorlage : 'eigene',
    farben: {},
    schrift: SCHRIFTEN[e.schrift] ? e.schrift : basis.schrift,
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
  return ` data-hero="${esc(d.hero)}" data-knoepfe="${esc(d.knoepfe)}" data-rundung="${esc(d.rundung)}" data-stil="${esc(d.stil)}" data-flaechen="${esc(d.flaechen)}" data-textur="${esc(d.textur)}" data-aus="${esc(aus.join(' '))}"${dunkel}`;
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
export function aufbereiten(design, laufbandTexte) {
  const d = bereinigen(design);
  return {
    design: d,
    css: cssVon(d),
    proCss: cssSaeubern(d.css),
    attribute: htmlAttribute(d),
    bloecke: bloeckeHtml(d),
    laufband: laufbandHtml(d, laufbandTexte),
    oben: htmlSaeubern(d.html_oben),
    unten: htmlSaeubern(d.html_unten),
  };
}
