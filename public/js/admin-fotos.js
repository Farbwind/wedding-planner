// Verwaltung: Gästefotos. Abschnitte mit QR-Codes einrichten, Fotos ansehen, verschieben, verbergen, löschen, als ZIP laden.

const $ = (s, r = document) => r.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const zeit = (s) => new Date(`${s.replace(' ', 'T')}Z`).toLocaleString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
const mb = (b) => `${(b / 1048576).toLocaleString('de-DE', { maximumFractionDigits: 1 })} MB`;
const GESEHEN = 'hz-gf-gesehen';

async function api(pfad, opts = {}) {
  const res = await fetch(pfad, { ...opts, headers: opts.body ? { 'Content-Type': 'application/json' } : undefined, body: opts.body ? JSON.stringify(opts.body) : undefined });
  const d = await res.json().catch(() => ({}));
  if (res.status === 401) { location.reload(); throw new Error('Bitte neu anmelden.'); }
  if (!res.ok) throw new Error(d.error || 'Das hat nicht geklappt.');
  return d;
}

let daten = { abschnitte: [], fotos: [], galerie: true, zugang: 'offen', schluessel: '' };
let filter = 0;
let offen = false;

// Kleine Zahl am Reiter: neue Fotos seit dem letzten Blick
function markeSetzen() {
  let gesehen = 0;
  try { gesehen = Number(localStorage.getItem(GESEHEN) || 0); } catch {}
  const neu = daten.fotos.filter((f) => f.id > gesehen).length;
  const m = $('#gf-marke');
  m.textContent = neu || '';
  m.hidden = !neu || offen;
}
function alsGesehen() {
  const max = Math.max(0, ...daten.fotos.map((f) => f.id));
  try { localStorage.setItem(GESEHEN, String(max)); } catch {}
  markeSetzen();
}

async function laden() {
  daten = await api('/api/admin/gaestefotos');
  zeichnen();
  markeSetzen();
}

function zeichnen() {
  const { abschnitte, fotos } = daten;
  const name = (id) => abschnitte.find((a) => a.id === id)?.name || 'Ohne Abschnitt';
  // Filter und ZIP
  $('#gf-filter').innerHTML = [`<button type="button" data-gf-filter="0" aria-pressed="${filter === 0}">Alle ${fotos.length}</button>`,
    ...abschnitte.map((a) => `<button type="button" data-gf-filter="${a.id}" aria-pressed="${filter === a.id}">${esc(a.name)} ${a.anzahl}</button>`)].join('');
  const zip = $('#gf-zip');
  zip.href = filter ? `/api/admin/gaestefotos/zip?abschnitt=${filter}` : '/api/admin/gaestefotos/zip';
  zip.textContent = filter ? `„${name(filter)}“ als ZIP laden` : 'Alle als ZIP laden';
  const sicht = fotos.filter((f) => !filter || f.abschnitt_id === filter);
  zip.hidden = !sicht.length;
  const groesse = sicht.reduce((s, f) => s + f.groesse, 0);
  const versteckt = sicht.filter((f) => f.versteckt).length;
  const personen = new Set(sicht.map((f) => f.name.trim().toLowerCase())).size;
  $('#gf-stand').textContent = sicht.length
    ? `${sicht.length} ${sicht.length === 1 ? 'Foto' : 'Fotos'} von ${personen} ${personen === 1 ? 'Person' : 'Personen'}, zusammen ${mb(groesse)}${versteckt ? `, davon ${versteckt} für Gäste verborgen` : ''}.`
    : 'Noch keine Fotos. Sobald Gäste hochladen, erscheinen sie hier.';

  // Einrichtung
  $('#gf-galerie').checked = daten.galerie;
  for (const r of document.querySelectorAll('input[name="gf-zugang"]')) r.checked = r.value === daten.zugang;
  $('#gf-schluessel').hidden = daten.zugang !== 'qr';
  $('#gf-schluessel-text').textContent = daten.schluessel;
  $('#gf-abschnitte').innerHTML = abschnitte.map((a, i) => `
    <div class="gf-abschnitt" data-id="${a.id}">
      <a class="gf-qr" href="/api/admin/gaestefotos/qr/${a.id}.svg" target="_blank" rel="noopener" title="QR-Code groß ansehen"><img src="/api/admin/gaestefotos/qr/${a.id}.svg" alt="QR-Code für ${esc(a.name)}" width="88" height="88"></a>
      <div class="gf-abschnitt-felder">
        <label>Name<input data-gf-feld="name" value="${esc(a.name)}" maxlength="60"></label>
        <label>Datum<input data-gf-feld="datum" type="date" value="${esc(a.datum)}"></label>
        <label>ab Uhrzeit<input data-gf-feld="ab" type="time" value="${esc(a.ab || '')}"></label>
        <label class="haken-klein"><input type="checkbox" data-gf-feld="offen" ${a.offen ? 'checked' : ''}> Hochladen offen</label>
        <p class="gf-abschnitt-info">${a.anzahl} ${a.anzahl === 1 ? 'Foto' : 'Fotos'} · <a href="/api/admin/gaestefotos/qr/${a.id}.svg?download">QR als SVG</a> · <a href="/api/admin/gaestefotos/qr/${a.id}.png?download">als PNG</a> · <button type="button" class="link-knopf" data-gf-kopieren="${esc(a.url)}">Link kopieren</button></p>
      </div>
      <div class="gf-abschnitt-knoepfe">
        <button type="button" class="knopf leise" data-gf-schieben="-1" ${i === 0 ? 'disabled' : ''} aria-label="Nach oben">↑</button>
        <button type="button" class="knopf leise" data-gf-schieben="1" ${i === abschnitte.length - 1 ? 'disabled' : ''} aria-label="Nach unten">↓</button>
        <button type="button" class="knopf leise weg" data-gf-abschnitt-weg ${a.anzahl ? 'disabled title="Erst die Fotos verschieben oder löschen"' : ''}>Löschen</button>
      </div>
    </div>`).join('') || '<p class="leer">Noch kein Abschnitt. Legt unten einen an.</p>';

  // Fotos
  const wahl = (f) => abschnitte.map((a) => `<option value="${a.id}" ${a.id === f.abschnitt_id ? 'selected' : ''}>${esc(a.name)}</option>`).join('');
  $('#gf-raster').innerHTML = sicht.map((f) => `
    <figure class="gf-foto${f.versteckt ? ' versteckt' : ''}" data-id="${f.id}">
      <a href="/gaestefotos/${f.id}.jpg" target="_blank" rel="noopener"><img src="/gaestefotos/${f.id}/vorschau.jpg" alt="Foto von ${esc(f.name)}" loading="lazy"></a>
      <figcaption>
        <strong>${esc(f.name)}</strong>
        <span>${zeit(f.erstellt)} · ${mb(f.groesse)}${f.versteckt ? ' · verborgen' : ''}</span>
        <select data-gf-verschieben aria-label="Abschnitt">${wahl(f)}</select>
        <span class="gf-foto-knoepfe">
          <a class="knopf leise" href="/gaestefotos/${f.id}.jpg?download">Laden</a>
          <button type="button" class="knopf leise" data-gf-verbergen>${f.versteckt ? 'Zeigen' : 'Verbergen'}</button>
          <button type="button" class="knopf leise weg" data-gf-weg>Löschen</button>
        </span>
      </figcaption>
    </figure>`).join('');
}

$('#gf-filter').addEventListener('click', (e) => {
  const b = e.target.closest('[data-gf-filter]');
  if (!b) return;
  filter = Number(b.dataset.gfFilter);
  zeichnen();
});

$('#gf-galerie').addEventListener('change', async (e) => {
  await api('/api/admin/settings', { method: 'PUT', body: { galerie_gaeste: e.target.checked ? '1' : '0' } }).catch((x) => alert(x.message));
  laden();
});

document.querySelectorAll('input[name="gf-zugang"]').forEach((r) => r.addEventListener('change', async (e) => {
  if (!e.target.checked) return;
  if (e.target.value === 'qr' && !confirm('Nur mit QR-Code: Die bisherigen QR-Codes und Links ohne Schlüssel funktionieren danach nicht mehr. Druckt die Aufsteller neu (Knopf unten). Umstellen?')) return laden();
  await api('/api/admin/settings', { method: 'PUT', body: { galerie_zugang: e.target.value } }).catch((x) => alert(x.message));
  laden();
}));
$('#gf-schluessel-neu').addEventListener('click', async () => {
  if (!confirm('Neuen Code erzeugen? Alle bisher gedruckten QR-Codes und der Code auf den Karten funktionieren dann nicht mehr.')) return;
  await api('/api/admin/gaestefotos/schluessel', { method: 'POST' }).catch((x) => alert(x.message));
  laden();
});

$('#gf-abschnitte').addEventListener('change', async (e) => {
  const z = e.target.closest('[data-id]');
  const f = e.target.dataset.gfFeld;
  if (!z || !f) return;
  const wert = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
  await api(`/api/admin/gaestefotos/abschnitt/${z.dataset.id}`, { method: 'PUT', body: { [f]: wert } }).catch((x) => alert(x.message));
  laden();
});
$('#gf-abschnitte').addEventListener('click', async (e) => {
  const z = e.target.closest('[data-id]');
  if (!z) return;
  const id = Number(z.dataset.id);
  if (e.target.closest('[data-gf-kopieren]')) {
    const b = e.target.closest('[data-gf-kopieren]');
    await navigator.clipboard?.writeText(b.dataset.gfKopieren).catch(() => {});
    b.textContent = 'Kopiert';
    setTimeout(() => { b.textContent = 'Link kopieren'; }, 1500);
    return;
  }
  const s = e.target.closest('[data-gf-schieben]');
  if (s) {
    const ids = daten.abschnitte.map((a) => a.id);
    const i = ids.indexOf(id); const j = i + Number(s.dataset.gfSchieben);
    [ids[i], ids[j]] = [ids[j], ids[i]];
    await api('/api/admin/gaestefotos/reihenfolge', { method: 'POST', body: { ids } });
    return laden();
  }
  if (e.target.closest('[data-gf-abschnitt-weg]')) {
    const a = daten.abschnitte.find((x) => x.id === id);
    if (!confirm(`Abschnitt „${a.name}“ löschen? Gedruckte QR-Codes dafür funktionieren danach nicht mehr.`)) return;
    await api(`/api/admin/gaestefotos/abschnitt/${id}`, { method: 'DELETE' }).catch((x) => alert(x.message));
    if (filter === id) filter = 0;
    laden();
  }
});

$('#gf-neu').addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = e.target;
  await api('/api/admin/gaestefotos/abschnitt', { method: 'POST', body: { name: f.name.value, datum: f.datum.value, ab: f.ab.value } }).catch((x) => alert(x.message));
  f.reset();
  laden();
});

$('#gf-raster').addEventListener('change', async (e) => {
  const fig = e.target.closest('[data-id]');
  if (!fig || !e.target.matches('[data-gf-verschieben]')) return;
  await api(`/api/admin/gaestefotos/foto/${fig.dataset.id}`, { method: 'PATCH', body: { abschnitt_id: Number(e.target.value) } }).catch((x) => alert(x.message));
  laden();
});
$('#gf-raster').addEventListener('click', async (e) => {
  const fig = e.target.closest('[data-id]');
  if (!fig) return;
  const f = daten.fotos.find((x) => x.id === Number(fig.dataset.id));
  if (e.target.closest('[data-gf-verbergen]')) {
    await api(`/api/admin/gaestefotos/foto/${f.id}`, { method: 'PATCH', body: { versteckt: !f.versteckt } });
    return laden();
  }
  if (e.target.closest('[data-gf-weg]')) {
    if (!confirm(`Foto von ${f.name} endgültig löschen?`)) return;
    await api(`/api/admin/gaestefotos/foto/${f.id}`, { method: 'DELETE' });
    laden();
  }
});

document.addEventListener('reiter', (e) => {
  offen = e.detail === 'gaestefotos';
  if (offen) laden().then(alsGesehen).catch((x) => alert(x.message));
});
// Nach dem Anmelden nur die Zahl am Reiter holen (ohne Neuladen der Seite, falls noch niemand angemeldet ist)
document.addEventListener('antworten-geladen', async () => {
  if (offen) return;
  const r = await fetch('/api/admin/gaestefotos').catch(() => null);
  if (r?.ok) { daten = await r.json(); markeSetzen(); }
}, { once: true });
