// Verwaltung: Sitzplan mit Drag & Drop (Maus und Finger) und Gruppen

const $ = (s, r = document) => r.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

async function api(pfad, opts = {}) {
  const res = await fetch(pfad, { ...opts, headers: opts.body ? { 'Content-Type': 'application/json' } : undefined, body: opts.body ? JSON.stringify(opts.body) : undefined });
  const d = await res.json().catch(() => ({}));
  if (res.status === 401) { location.reload(); throw new Error('Bitte neu anmelden.'); }
  if (!res.ok) throw new Error(d.error || 'Das hat nicht geklappt.');
  return d;
}

// Gruppenfarben aus der Palette der Seite, fest pro Gruppenname
const FARBEN = ['#2e4636', '#a8864e', '#4d7a7c', '#8a3a51', '#6b5a1e', '#5b6f9a', '#7a5c8e', '#3f7d5a'];
const farbe = (g) => { let h = 0; for (const c of g) h = (h * 31 + c.charCodeAt(0)) >>> 0; return FARBEN[h % FARBEN.length]; };

let daten = { gaeste: [], tische: [] };
let gruppierung = 'haushalt';
let auswahlModus = false;
const auswahl = new Set();

function chip(g) {
  const essen = g.vegan ? 'vegan' : g.vegetarisch ? 'veggie' : '';
  return `<button type="button" class="gast${auswahl.has(g.key) ? ' gewaehlt' : ''}" data-gast="${esc(g.key)}" aria-pressed="${auswahlModus ? auswahl.has(g.key) : 'false'}" ${g.gruppe ? `style="--gruppe:${farbe(g.gruppe)}"` : ''} title="${esc(g.gruppe ? `Gruppe: ${g.gruppe}` : 'Keine Gruppe')}">
    <span class="gast-punkt" aria-hidden="true"></span>${esc(g.name)}${essen ? `<span class="gast-essen">${essen}</span>` : ''}
  </button>`;
}

function zeichnen() {
  const q = $('#pool-suche').value.trim().toLowerCase();
  const ohne = daten.gaeste.filter((g) => g.tisch == null || !daten.tische.some((t) => t.id === g.tisch));
  $('#pool-anzahl').textContent = `(${ohne.length})`;

  // Pool nach Antwort oder Gruppe gebündelt
  const buendel = new Map();
  for (const g of ohne) {
    if (q && !g.name.toLowerCase().includes(q) && !g.haushaltName.toLowerCase().includes(q)) continue;
    const k = gruppierung === 'gruppe' ? (g.gruppe || 'Ohne Gruppe') : g.haushalt;
    if (!buendel.has(k)) buendel.set(k, { titel: gruppierung === 'gruppe' ? k : g.haushaltName, gaeste: [] });
    buendel.get(k).gaeste.push(g);
  }
  const sortiert = [...buendel.values()].sort((a, b) => a.titel.localeCompare(b.titel, 'de'));
  $('#pool-liste').innerHTML = sortiert.map((b) => `
    <div class="buendel">
      <button type="button" class="buendel-kopf" data-buendel="${esc(b.gaeste.map((g) => g.key).join(','))}" title="Alle zusammen ziehen">
        <span class="greifer" aria-hidden="true"></span>${esc(b.titel)} <span>${b.gaeste.length}</span>
      </button>
      <div class="buendel-gaeste">${b.gaeste.map(chip).join('')}</div>
    </div>`).join('') || `<p class="leer-klein">${daten.gaeste.length ? 'Alle haben einen Platz.' : 'Sobald Zusagen da sind, erscheinen die Gäste hier.'}</p>`;

  // Tische
  $('#tische').innerHTML = daten.tische.map((t) => {
    const am = daten.gaeste.filter((g) => g.tisch === t.id).sort((a, b) => a.sort - b.sort);
    const voll = am.length > t.plaetze;
    return `<section class="tisch ${voll ? 'ueberbucht' : ''}" data-ziel="${t.id}">
      <header class="tisch-kopf">
        <button type="button" class="tisch-name" data-tisch-bearbeiten="${t.id}">${esc(t.name)}</button>
        <span class="tisch-belegung">${am.length}/${t.plaetze}</span>
        <button type="button" class="tisch-buendel" data-buendel="${esc(am.map((g) => g.key).join(','))}" ${am.length ? '' : 'hidden'} title="Ganzen Tisch verschieben"><span class="greifer" aria-hidden="true"></span></button>
      </header>
      <div class="tisch-gaeste">${am.map(chip).join('') || '<p class="leer-klein">Gäste hierher ziehen</p>'}</div>
    </section>`;
  }).join('') + '<button type="button" class="tisch tisch-plus" id="tisch-plus">Tisch hinzufügen</button>';
  $('#tisch-plus').addEventListener('click', tischNeu);

  const gruppen = [...new Set([...daten.gaeste.map((g) => g.gruppe), ...(daten.gruppen || [])].filter(Boolean))].sort((a, b) => a.localeCompare(b, 'de'));
  $('#gruppen-liste').innerHTML = gruppen.map((g) => `<option value="${esc(g)}">`).join('');
  $('#auswahl-leiste').hidden = !auswahlModus;
  $('#auswahl-zahl').textContent = `${auswahl.size} ausgewählt`;
  $('#auswahl-tisch').innerHTML = '<option value="">ohne Platz</option>' + daten.tische.map((t) => `<option value="${t.id}">${esc(t.name)}</option>`).join('');
}

async function laden() {
  daten = await api('/api/admin/sitzplan');
  zeichnen();
}

async function setzen(gaeste, tisch, vor = null) {
  await api('/api/admin/sitzplan/platz', { method: 'PUT', body: { gaeste, tisch, vor } });
  await laden();
}

async function tischNeu() {
  const name = prompt('Name des Tisches (z. B. Tisch 1 oder Brauttisch):', `Tisch ${daten.tische.length + 1}`);
  if (name === null) return;
  const plaetze = Number(prompt('Wie viele Plätze?', '8')) || 8;
  await api('/api/admin/sitzplan/tisch', { method: 'POST', body: { name, plaetze } });
  laden();
}

// Ziehen mit Zeiger: funktioniert mit Maus, Stift und Finger
let zug = null;
document.addEventListener('pointerdown', (e) => {
  const quelle = e.target.closest('#app [data-bereich="sitzplan"] .gast, #app [data-bereich="sitzplan"] [data-buendel]');
  if (!quelle || e.button > 0) return;
  // Ein markierter Gast nimmt alle markierten mit
  const gaeste = quelle.dataset.gast
    ? (auswahl.has(quelle.dataset.gast) ? [...auswahl] : [quelle.dataset.gast])
    : quelle.dataset.buendel.split(',').filter(Boolean);
  if (!gaeste.length) return;
  zug = { quelle, gaeste, x: e.clientX, y: e.clientY, aktiv: false, id: e.pointerId };
});
document.addEventListener('pointermove', (e) => {
  if (!zug || e.pointerId !== zug.id) return;
  if (!zug.aktiv) {
    if (Math.hypot(e.clientX - zug.x, e.clientY - zug.y) < 6) return;
    zug.aktiv = true;
    zug.geist = document.createElement('div');
    zug.geist.className = 'zieh-geist';
    zug.geist.textContent = zug.gaeste.length > 1 ? `${zug.gaeste.length} Gäste` : zug.quelle.textContent.trim();
    document.body.append(zug.geist);
    document.body.classList.add('zieht');
    zug.quelle.classList.add('wird-gezogen');
  }
  e.preventDefault();
  zug.geist.style.transform = `translate(${e.clientX + 12}px, ${e.clientY + 12}px)`;
  const unter = document.elementFromPoint(e.clientX, e.clientY);
  document.querySelectorAll('.ziel-aktiv').forEach((x) => x.classList.remove('ziel-aktiv'));
  zug.ziel = unter?.closest('[data-ziel]');
  zug.vor = unter?.closest('.tisch-gaeste .gast')?.dataset.gast || null;
  zug.ziel?.classList.add('ziel-aktiv');
  // Am Rand automatisch scrollen
  if (e.clientY < 60) scrollBy(0, -12); else if (e.clientY > innerHeight - 60) scrollBy(0, 12);
}, { passive: false });
document.addEventListener('pointerup', async (e) => {
  if (!zug || e.pointerId !== zug.id) return;
  const z = zug; zug = null;
  if (!z.aktiv) return; // war nur ein Tipp, dann öffnet der Klick den Dialog
  z.geist.remove();
  document.body.classList.remove('zieht');
  document.querySelectorAll('.ziel-aktiv, .wird-gezogen').forEach((x) => x.classList.remove('ziel-aktiv', 'wird-gezogen'));
  z.quelle.dataset.gezogen = '1';
  setTimeout(() => delete z.quelle.dataset.gezogen, 50);
  if (!z.ziel) return;
  const tisch = z.ziel.dataset.ziel === 'pool' ? null : Number(z.ziel.dataset.ziel);
  if (z.vor && z.gaeste.includes(z.vor)) return;
  try { await setzen(z.gaeste, tisch, z.vor); auswahl.clear(); zeichnen(); } catch (err) { alert(err.message); }
});
document.addEventListener('pointercancel', () => {
  if (!zug) return;
  zug.geist?.remove(); document.body.classList.remove('zieht'); zug = null;
});

// Antippen öffnet den Dialog für Name, Gruppe und Tisch
document.addEventListener('click', async (e) => {
  const c = e.target.closest('[data-bereich="sitzplan"] .gast');
  if (c && !c.dataset.gezogen) {
    if (!auswahlModus) return gastBearbeiten(c.dataset.gast);
    if (auswahl.has(c.dataset.gast)) auswahl.delete(c.dataset.gast); else auswahl.add(c.dataset.gast);
    return zeichnen();
  }
  const t = e.target.closest('[data-tisch-bearbeiten]');
  if (t) return tischBearbeiten(Number(t.dataset.tischBearbeiten));
});

function gastBearbeiten(key) {
  const g = daten.gaeste.find((x) => x.key === key);
  if (!g) return;
  const d = $('#gast-dialog');
  const f = $('#gast-form');
  $('#gast-titel').textContent = g.extra ? 'Gast ohne Antwort' : `Aus der Antwort von ${g.haushaltName}`;
  f.name.value = g.name;
  f.gruppe.value = g.gruppe;
  f.tisch.innerHTML = '<option value="">ohne Platz</option>' + daten.tische.map((t) => `<option value="${t.id}" ${t.id === g.tisch ? 'selected' : ''}>${esc(t.name)}</option>`).join('');
  const haushalt = daten.gaeste.filter((x) => x.haushalt === g.haushalt);
  $('#g-alle-zeile').hidden = haushalt.length < 2;
  f.alle.checked = false;
  $('#g-loeschen').hidden = !g.extra;
  d.onclose = async () => {
    try {
      if (d.returnValue === 'loeschen') {
        if (confirm(`${g.name} entfernen?`)) await api(`/api/admin/sitzplan/extra/${g.key.slice(1)}`, { method: 'DELETE' });
      } else if (d.returnValue === 'ok') {
        const tisch = f.tisch.value ? Number(f.tisch.value) : null;
        await api('/api/admin/sitzplan/gast', { method: 'PUT', body: { gast: g.key, name: f.name.value, gruppe: f.gruppe.value } });
        const betroffen = f.alle.checked ? haushalt.map((x) => x.key) : [g.key];
        if (f.alle.checked) await api('/api/admin/sitzplan/gruppe', { method: 'PUT', body: { gaeste: betroffen, gruppe: f.gruppe.value } });
        if (tisch !== g.tisch || f.alle.checked) await api('/api/admin/sitzplan/platz', { method: 'PUT', body: { gaeste: betroffen, tisch } });
      }
      await laden();
    } catch (err) { alert(err.message); }
  };
  d.showModal();
}

async function tischBearbeiten(id) {
  const t = daten.tische.find((x) => x.id === id);
  const name = prompt('Name des Tisches (leer lassen und OK zum Löschen):', t.name);
  if (name === null) return;
  if (!name.trim()) {
    if (confirm(`„${t.name}“ löschen? Die Gäste landen wieder bei „Ohne Platz“.`)) await api(`/api/admin/sitzplan/tisch/${id}`, { method: 'DELETE' });
  } else {
    const plaetze = Number(prompt('Wie viele Plätze?', String(t.plaetze))) || t.plaetze;
    await api(`/api/admin/sitzplan/tisch/${id}`, { method: 'PUT', body: { name, plaetze } });
  }
  laden();
}

$('#tisch-neu').addEventListener('click', tischNeu);
$('#auswahl-modus').addEventListener('click', (e) => {
  auswahlModus = !auswahlModus;
  e.currentTarget.setAttribute('aria-pressed', String(auswahlModus));
  e.currentTarget.textContent = auswahlModus ? 'Auswahl beenden' : 'Mehrere auswählen';
  if (!auswahlModus) auswahl.clear();
  zeichnen();
});
$('#auswahl-leeren').addEventListener('click', () => { auswahl.clear(); zeichnen(); });
$('#auswahl-gruppieren').addEventListener('click', async () => {
  if (!auswahl.size) return alert('Bitte erst Personen antippen.');
  await api('/api/admin/sitzplan/gruppe', { method: 'PUT', body: { gaeste: [...auswahl], gruppe: $('#auswahl-gruppe').value } });
  auswahl.clear(); laden();
});
$('#auswahl-setzen').addEventListener('click', async () => {
  if (!auswahl.size) return alert('Bitte erst Personen antippen.');
  const v = $('#auswahl-tisch').value;
  await setzen([...auswahl], v ? Number(v) : null);
  auswahl.clear(); zeichnen();
});
$('#gast-neu').addEventListener('click', async () => {
  const name = prompt('Name des Gastes (z. B. ein Kind, die Fotografin oder ihr selbst):');
  if (!name?.trim()) return;
  await api('/api/admin/sitzplan/extra', { method: 'POST', body: { name } });
  laden();
});
$('#pool-suche').addEventListener('input', zeichnen);
document.querySelectorAll('[data-gruppierung]').forEach((b) => b.addEventListener('click', () => {
  gruppierung = b.dataset.gruppierung;
  document.querySelectorAll('[data-gruppierung]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
  zeichnen();
}));
document.addEventListener('reiter', (e) => { if (e.detail === 'sitzplan') laden().catch((x) => alert(x.message)); });
