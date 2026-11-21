// Motive für den Anfang der Gästeseite: gezeichnete SVG-Bilder, die der Designer pro Vorlage einsetzt.
// Alles ist selbst gezeichnet (keine Fremdbilder). Farben kommen aus CSS-Variablen, die public/motive.css pro Motiv setzt:
// Klassen f1 bis f6 füllen, s1 bis s4 zeichnen Linien.

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const rng = (seed) => () => { seed |= 0; seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const n1 = (n) => Math.round(n * 10) / 10;

export const MOTIVE = [
  ['keins', 'Kein Motiv'],
  ['schleierkraut', 'Trockenblumen mit Schleierkraut'],
  ['himmel', 'Himmel mit Seifenblasen'],
  ['sueden', 'Küste im Süden'],
  ['fingerabdruck', 'Fingerabdruck-Herz'],
  ['reise', 'Reisepass'],
  ['karikatur', 'Karikatur Braut und Bräutigam'],
];

/* ---- Schleierkraut: Strauß aus feinen Zweigen mit weißen Blüten ---- */
function schleierkraut() {
  const r = rng(11);
  let linien = ''; let blueten = ''; let dolden = '';
  const zweig = (x, y, w, l, tiefe, dick) => {
    const x2 = x + Math.sin(w) * l; const y2 = y - Math.cos(w) * l;
    const v = (r() - 0.5) * l * 0.28;
    const cx = (x + x2) / 2 + Math.cos(w) * v; const cy = (y + y2) / 2 + Math.sin(w) * v;
    linien += `<path d="M${n1(x)} ${n1(y)}Q${n1(cx)} ${n1(cy)} ${n1(x2)} ${n1(y2)}" stroke-width="${n1(dick)}"/>`;
    if (tiefe > 0) {
      const k = tiefe > 1 ? 3 : 2;
      for (let i = 0; i < k; i++) zweig(x2, y2, w + (i - (k - 1) / 2) * (0.5 + r() * 0.3), l * (0.56 + r() * 0.12), tiefe - 1, dick * 0.72);
      if (tiefe > 1) zweig((x + x2) / 2, (y + y2) / 2, w + (r() < 0.5 ? -0.8 : 0.8), l * 0.5, tiefe - 2, dick * 0.7);
    } else {
      for (let i = 0; i < 5; i++) {
        const bx = x2 + (r() - 0.5) * 11; const by = y2 + (r() - 0.5) * 11;
        blueten += `<circle cx="${n1(bx)}" cy="${n1(by)}" r="${n1(2 + r() * 2.2)}"/>`;
      }
    }
  };
  for (let i = 0; i < 9; i++) zweig(160, 334, -0.78 + i * 0.195 + (r() - 0.5) * 0.12, 60 + r() * 26, 3, 1.5);
  // Dolde mit dunklen Punkten, wie Dill
  for (const [a, l] of [[-0.95, 150], [0.62, 168]]) {
    const ex = 160 + Math.sin(a) * l; const ey = 334 - Math.cos(a) * l * 0.92;
    linien += `<path d="M160 334Q${n1(160 + Math.sin(a) * l * 0.4)} ${n1(334 - l * 0.55)} ${n1(ex)} ${n1(ey)}" stroke-width="1.2"/>`;
    for (let i = 0; i < 18; i++) {
      const t = (i / 18) * Math.PI * 1.7 - 0.85 + a * 0.4; const q = 12 + (i % 3) * 5;
      dolden += `<circle cx="${n1(ex + Math.sin(t) * q)}" cy="${n1(ey - Math.cos(t) * q)}" r="1.5"/>`;
    }
  }
  const schleife = '<path d="M160 330C132 300 118 338 160 334C202 338 188 300 160 330ZM160 334C152 350 146 360 138 372M160 334C168 350 176 360 184 372" fill="none" stroke-width="1.6"/>';
  return `<svg class="mv" viewBox="0 0 320 384" aria-hidden="true" focusable="false"><g class="s2" fill="none" stroke-linecap="round">${linien}</g><g class="f3">${dolden}</g><g class="f1">${blueten}</g><g class="s2">${schleife}</g></svg>`;
}

/* ---- Himmel: Wolken und Seifenblasen ---- */
function himmel() {
  const wolke = (x, y, s) => `<g transform="translate(${x} ${y}) scale(${s})" class="f1" filter="url(#hm-w)"><circle cx="0" cy="0" r="30"/><circle cx="34" cy="-12" r="26"/><circle cx="68" cy="0" r="30"/><circle cx="34" cy="10" r="30"/><circle cx="-26" cy="8" r="20"/><circle cx="96" cy="10" r="18"/></g>`;
  const blase = (x, y, rad, d, t) => `<g transform="translate(${x} ${y})"><g class="blase" style="--d:${d}s;--t:${t}s"><circle r="${rad}" fill="url(#hm-b)"/><circle r="${rad}" fill="none" stroke="url(#hm-r)" stroke-width="${n1(Math.max(1, rad / 18))}"/><path d="M${n1(-rad * 0.62)} ${n1(-rad * 0.12)}A${n1(rad * 0.66)} ${n1(rad * 0.66)} 0 0 1 ${n1(-rad * 0.12)} ${n1(-rad * 0.62)}" fill="none" stroke="#fff" stroke-opacity=".9" stroke-width="${n1(Math.max(1.4, rad / 12))}" stroke-linecap="round"/><circle cx="${n1(rad * 0.42)}" cy="${n1(rad * 0.46)}" r="${n1(rad * 0.07)}" fill="#fff" fill-opacity=".7"/></g></g>`;
  return `<svg class="mv" viewBox="0 0 560 300" aria-hidden="true" focusable="false">
<defs><filter id="hm-w" x="-20%" y="-30%" width="140%" height="160%"><feGaussianBlur stdDeviation="3.2"/></filter>
<radialGradient id="hm-b" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="#fff" stop-opacity=".02"/><stop offset=".72" stop-color="#cfe7ff" stop-opacity=".16"/><stop offset="1" stop-color="#ffd9ef" stop-opacity=".55"/></radialGradient>
<linearGradient id="hm-r" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#8fd8ff"/><stop offset=".35" stop-color="#ffb8e4"/><stop offset=".7" stop-color="#fff0a8"/><stop offset="1" stop-color="#a6f0d2"/></linearGradient></defs>
${wolke(40, 214, 1.15)}${wolke(360, 232, 1.35)}${wolke(238, 262, 0.9)}${wolke(446, 150, 0.7)}
${blase(112, 96, 40, 9, 0)}${blase(236, 150, 22, 7, 1.2)}${blase(318, 66, 52, 11, 0.4)}${blase(440, 108, 24, 8, 2)}${blase(496, 190, 15, 6, 0.8)}${blase(176, 40, 14, 7, 1.6)}${blase(402, 196, 30, 10, 2.4)}${blase(40, 176, 18, 8, 3)}
</svg>`;
}

/* ---- Süden: Küstendorf mit Olivenbäumen, Palme und Leuchtturm ---- */
function sueden() {
  const olive = (x, y, s) => `<g transform="translate(${x} ${y}) scale(${s})"><path class="s4" d="M0 0C-3-16 4-26-2-40" stroke-width="5" fill="none" stroke-linecap="round"/><g class="f2"><ellipse cx="-14" cy="-44" rx="20" ry="13"/><ellipse cx="12" cy="-50" rx="22" ry="14"/><ellipse cx="-2" cy="-62" rx="19" ry="12"/></g><g class="f3"><ellipse cx="-6" cy="-40" rx="12" ry="7"/><ellipse cx="18" cy="-44" rx="10" ry="6"/></g></g>`;
  const zypresse = (x, y, s) => `<g transform="translate(${x} ${y}) scale(${s})"><path class="f2" d="M0 0L0-6C-9-14-9-58 0-78C9-58 9-14 0-6Z"/><path class="f3" d="M0-8C-4-26-3-52 0-74C3-52 4-26 0-8Z"/></g>`;
  const palme = (x, y, s) => `<g transform="translate(${x} ${y}) scale(${s})"><path class="s4" d="M0 0C6-24 4-52 14-78" stroke-width="5" fill="none" stroke-linecap="round"/><g class="s2" fill="none" stroke-width="3.2" stroke-linecap="round"><path d="M14-78C34-84 46-72 52-60"/><path d="M14-78C30-96 48-92 58-84"/><path d="M14-78C8-98 -8-104 -22-96"/><path d="M14-78C-8-80 -28-70 -34-58"/><path d="M14-78C26-62 20-52 28-40"/></g></g>`;
  const haus = (x, y, w, h) => `<g transform="translate(${x} ${y})"><rect class="f1" width="${w}" height="${h}"/><path class="f5" d="M-6 0L${w / 2} -22L${w + 6} 0Z"/><g class="f4"><rect x="${w * 0.14}" y="${h * 0.28}" width="9" height="15" rx="4.5"/><rect x="${w * 0.46}" y="${h * 0.28}" width="9" height="15" rx="4.5"/><rect x="${w * 0.76}" y="${h * 0.28}" width="9" height="15" rx="4.5"/><path d="M${w * 0.36} ${h}v-18a9 9 0 0 1 18 0v18Z"/></g></g>`;
  const boot = (x, y, s) => `<g transform="translate(${x} ${y}) scale(${s})"><path class="f1" d="M-18 0H18L12 8H-12Z"/><path class="f5" d="M-18 0H18L16 3H-16Z"/><path class="s4" d="M0 0V-22" stroke-width="1.6"/><path class="f1" d="M1 -22L14 -4H1Z"/></g>`;
  const wellen = [[470, 188], [540, 202], [610, 184], [690, 206], [760, 190], [830, 204], [520, 220], [650, 224], [770, 222]].map(([x, y]) => `<path class="s1" d="M${x} ${y}q8-6 16 0t16 0" fill="none" stroke-width="1.6" stroke-linecap="round"/>`).join('');
  return `<svg class="mv" viewBox="0 0 900 250" preserveAspectRatio="xMidYMax slice" aria-hidden="true" focusable="false">
<path class="f6" d="M380 176C470 164 560 166 640 170C730 174 820 166 900 156V250H380Z"/>
${wellen}
<path class="f2" d="M0 158C50 138 120 130 200 136C280 142 340 158 410 182L420 250H0Z"/>
<path class="f3" d="M0 190C80 170 170 168 260 180C330 190 380 206 420 222V250H0Z"/>
<path class="f2" d="M700 178C730 140 770 120 818 116C858 112 884 118 900 124V170C830 164 750 172 700 178Z"/>
<path class="f3" d="M752 160C780 136 820 128 860 132C880 134 892 138 900 142V166C850 160 790 164 752 160Z"/>
<g transform="translate(846 56)"><path class="f1" d="M-8 0H8L12 56H-12Z"/><path class="f6" d="M-10 22H10L11 32H-11Z"/><rect class="f4" x="-9" y="-12" width="18" height="12" rx="2"/><path class="f5" d="M-12 -12L0 -26L12 -12Z"/></g>
${haus(176, 104, 96, 46)}${haus(120, 122, 52, 38)}${haus(284, 118, 60, 36)}
${zypresse(110, 150, 1.05)}${zypresse(128, 154, 0.8)}${zypresse(350, 160, 1)}${zypresse(368, 166, 0.76)}
${palme(396, 176, 0.95)}
${olive(36, 188, 1.15)}${olive(92, 206, 0.95)}${olive(268, 196, 1)}${olive(334, 210, 0.85)}${olive(208, 214, 0.8)}
<path class="s1" d="M24 238C120 216 220 224 320 214" fill="none" stroke-width="1.2" opacity=".6"/>
${boot(540, 196, 1)}${boot(640, 212, 0.8)}${boot(744, 200, 0.9)}
</svg>`;
}

/* ---- Fingerabdruck: Herz aus Fingerlinien ---- */
function fingerabdruck() {
  const herz = 'M0 70C-110-5-80-85-40-80C-18-77-5-62 0-48C5-62 18-77 40-80C80-85 110-5 0 70Z';
  const r = rng(5); let linien = '';
  for (let k = 0; k < 17; k++) {
    const sc = 1 - k * 0.058; if (sc < 0.07) break;
    const dy = (1 - sc) * 10;
    const da = `${Math.round(70 + r() * 150)} ${Math.round(2 + r() * 5)} ${Math.round(40 + r() * 130)} ${Math.round(2 + r() * 6)}`;
    linien += `<path d="${herz}" transform="translate(150 ${n1(130 + dy)}) scale(${sc.toFixed(3)})" stroke-dasharray="${da}"/>`;
  }
  linien += '<path d="M-6 8C-4-2 8-4 10 6C12 16 0 20-4 14" transform="translate(150 150)"/>';
  return `<svg class="mv" viewBox="0 0 300 240" aria-hidden="true" focusable="false">
<defs><filter id="fa-t" x="-5%" y="-5%" width="110%" height="110%"><feTurbulence type="fractalNoise" baseFrequency=".045" numOctaves="2" seed="3" result="w"/><feDisplacementMap in="SourceGraphic" in2="w" scale="5"/></filter></defs>
<g class="s1" fill="none" stroke-width="2.6" stroke-linecap="round" filter="url(#fa-t)">${linien.replace(/<path /g, '<path vector-effect="non-scaling-stroke" ')}</g></svg>`;
}

/* ---- Reisepass mit Stempeln ---- */
function reise(t) {
  const datum = esc(t.datumKurz || '');
  const ort = esc((t.ort || 'Hochzeit').toUpperCase().slice(0, 22));
  const meridian = [22, 40].map((rx) => `<ellipse cx="150" cy="212" rx="${rx}" ry="54"/>`).join('');
  const parallele = [-30, 0, 30].map((y) => { const l = Math.sqrt(54 * 54 - y * y); return `<path d="M${n1(150 - l)} ${212 + y}H${n1(150 + l)}"/>`; }).join('');
  return `<svg class="mv" viewBox="0 0 460 410" aria-hidden="true" focusable="false">
<defs><path id="rp-k" d="M70 330m-34 0a34 34 0 1 1 68 0a34 34 0 1 1-68 0"/></defs>
<g transform="translate(90 5)"><rect class="f1" x="0" y="0" width="290" height="390" rx="16"/><rect class="s2" x="16" y="16" width="258" height="358" rx="9" fill="none" stroke-width="1.4"/>
<text class="mv-t f2" x="145" y="66" text-anchor="middle" font-size="15" letter-spacing="6">EINLADUNG</text>
<text class="mv-t f2" x="145" y="106" text-anchor="middle" font-size="31" letter-spacing="3">REISEPASS</text>
<g class="s2" fill="none" stroke-width="1.6"><circle cx="150" cy="212" r="54"/>${meridian}${parallele}<circle cx="150" cy="212" r="66" stroke-width=".8"/></g>
<path class="f2" d="M196 158l22 -10l-6 14l12 8l-16 -2l-4 10l-4 -8l-10 -2z" transform="rotate(18 205 160)"/>
<text class="mv-t f2" x="145" y="318" text-anchor="middle" font-size="14" letter-spacing="5">${ort}</text>
<text class="mv-t f2" x="145" y="346" text-anchor="middle" font-size="12" letter-spacing="3">${datum}</text></g>
<g class="stempel s3" transform="rotate(-14 70 330)" fill="none"><circle cx="70" cy="330" r="48" stroke-width="3"/><circle cx="70" cy="330" r="36" stroke-width="1.6"/>
<text class="mv-t" font-size="9" letter-spacing="2" fill="currentColor"><textPath href="#rp-k" startOffset="2%">ABFLUG · DEPARTURE · </textPath></text>
<text class="mv-t" x="70" y="334" text-anchor="middle" font-size="10" fill="currentColor" stroke="none">${datum.slice(0, 10)}</text></g>
<g class="stempel s4" transform="rotate(9 398 110)" fill="none"><rect x="346" y="84" width="104" height="52" rx="4" stroke-width="3"/><rect x="352" y="90" width="92" height="40" rx="2" stroke-width="1.2"/>
<text class="mv-t" x="398" y="108" text-anchor="middle" font-size="10" letter-spacing="1" fill="currentColor" stroke="none">WILLKOMMEN</text><text class="mv-t" x="398" y="124" text-anchor="middle" font-size="9" letter-spacing="2" fill="currentColor" stroke="none">ARRIVÉE</text></g>
</svg>`;
}

/* ---- Karikatur: Braut und Bräutigam, locker mit Tusche gezeichnet ---- */
function karikatur() {
  const arm = (d, haut = 'f4', stoff = 'f3', bw = 14) => `<path class="s1" d="${d}" fill="none" stroke-width="${bw + 3}" stroke-linecap="round"/><path class="${stoff.replace('f', 's')}" d="${d}" fill="none" stroke-width="${bw}" stroke-linecap="round"/>`;
  return `<svg class="mv" viewBox="0 0 440 372" aria-hidden="true" focusable="false">
<defs><filter id="ka-w" x="-3%" y="-3%" width="106%" height="106%"><feTurbulence type="fractalNoise" baseFrequency=".03" numOctaves="2" seed="8" result="n"/><feDisplacementMap in="SourceGraphic" in2="n" scale="3"/></filter></defs>
<g filter="url(#ka-w)" stroke-linejoin="round" stroke-linecap="round">
<!-- Herz zwischen den beiden -->
<path d="M214 34C206 18 186 24 192 40C196 50 214 60 214 60C214 60 232 50 236 40C242 24 222 18 214 34Z" fill="none" class="s5" stroke-width="2.6"/>
<!-- Braut -->
<g class="s1" stroke-width="2.4">
<path class="f5" d="M104 46C60 74 50 160 70 252C86 192 102 136 118 104Z" opacity=".75"/>
<path class="f1" d="M108 154C76 208 34 262 30 324Q76 342 118 330Q164 344 208 326C206 264 162 206 132 154Z"/>
<path fill="none" d="M96 222C84 250 76 288 74 326M128 214C130 250 134 290 132 330M160 220C174 252 188 290 192 328" opacity=".55" stroke-width="1.6"/>
<path class="f1" d="M104 112Q120 102 138 112L134 158H108Z"/>
<path class="f4" d="M118 100V110H124V100Z"/>
<circle class="f4" cx="121" cy="76" r="30"/>
<path class="f6" d="M92 70C90 40 118 34 144 46C150 52 150 62 146 68C140 56 120 50 98 62Z"/><circle class="f6" cx="122" cy="38" r="13"/>
<circle cx="131" cy="74" r="2.2" fill="#222" stroke="none"/><circle cx="147" cy="74" r="2.2" fill="#222" stroke="none"/>
<path fill="none" d="M139 76q-3 9 3 9"/><path fill="none" d="M130 92q9 6 18 -2"/>
<circle cx="128" cy="86" r="4.5" fill="#f2a9a0" stroke="none" opacity=".7"/>
<ellipse class="f4" cx="70" cy="326" rx="12" ry="5"/><ellipse class="f4" cx="148" cy="335" rx="12" ry="5"/>
</g>
<!-- Bräutigam -->
<g class="s1" stroke-width="2.4">
<rect class="f3" x="272" y="214" width="25" height="112" rx="4"/><rect class="f3" x="305" y="214" width="25" height="112" rx="4"/>
<ellipse class="f4" cx="276" cy="332" rx="19" ry="6"/><ellipse class="f4" cx="324" cy="332" rx="19" ry="6"/>
<path class="f3" d="M268 98Q300 88 332 98L344 216Q300 232 256 216Z"/>
<path class="f1" d="M290 94L300 152L310 94Z"/>
<path class="f5" d="M300 99L288 92V108ZM300 99L312 92V108Z"/>
<path class="f4" d="M292 90V96H308V90Z"/>
<circle class="f4" cx="300" cy="62" r="30"/>
<path class="f6" d="M270 56C268 34 296 24 322 34C328 40 328 50 324 56C318 42 296 40 278 54Z" fill="#222"/>
<circle cx="289" cy="58" r="2.3" fill="#222" stroke="none"/><circle cx="308" cy="58" r="2.3" fill="#222" stroke="none"/>
<path fill="none" d="M296 60q-9 12 2 14"/>
<path d="M286 78q8-6 14 0q6-6 14 0" fill="#222" stroke="#222"/>
</g>
${arm('M276 108Q240 138 240 178', 'f4', 'f3')}${arm('M334 106Q352 160 346 204', 'f4', 'f3')}
${arm('M136 114Q214 104 241 176', 'f4', 'f4')}<circle class="f4 s1" cx="241" cy="182" r="9" stroke-width="2.4"/>
</g></svg>`;
}

const GENERATOREN = { schleierkraut, himmel, sueden, fingerabdruck, reise, karikatur };

// t: { datumKurz, ort }. Rückgabe: HTML für den Platz im Anfang, leer ohne Motiv
export function motivHtml(id, t = {}) {
  const g = GENERATOREN[id];
  return g ? `<div class="hero-motiv" aria-hidden="true">${g(t)}</div>` : '';
}
