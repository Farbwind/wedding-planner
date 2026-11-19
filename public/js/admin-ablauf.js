// Verwaltung: Ablauf des Hochzeitstags und Links für Dienstleister.

const $ = (s, r = document) => r.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const tagText = (t) => (t ? new Date(`${t}T12:00:00`).toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) : 'Ohne Datum');
const zeit = (s) => new Date(`${s.replace(' ', 'T')}Z`).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

async function api(pfad, opts = {}) {
  const res = await fetch(pfad, { ...opts, headers: opts.body ? { 'Content-Type': 'application/json' } : undefined, body: opts.body ? JSON.stringify(opts.body) : undefined });
  const d = await res.json().catch(() => ({}));
  if (res.status === 401) { location.reload(); throw new Error('Bitte neu anmelden.'); }
  if (!res.ok) throw new Error(d.error || 'Das hat nicht geklappt.');
  return d;
}

let daten = { ablauf: [], links: [] };

async function laden() {
  daten = await api('/api/admin/ablauf');
  zeichnen();
}

function zeichnen() {
  const { ablauf, links } = daten;
  $('#ab-stand').textContent = ablauf.length
    ? `${ablauf.length} ${ablauf.length === 1 ? 'Programmpunkt' : 'Programmpunkte'}, ${ablauf.filter((a) => a.intern).length} davon nur intern.`
    : 'Noch kein Ablauf. Legt unten den ersten Punkt an oder startet mit einem Beispiel.';
  $('#ab-beispiel').hidden = !!ablauf.length;

  const tage = new Map();
  for (const a of ablauf) { if (!tage.has(a.tag)) tage.set(a.tag, []); tage.get(a.tag).push(a); }
  $('#ab-liste').innerHTML = [...tage].map(([tag, zeilen]) => `
    <h3 class="ab-tag">${esc(tagText(tag))}</h3>
    <div class="liste">${zeilen.map((a) => `
      <article class="ab-zeile${a.intern ? ' intern' : ''}" data-id="${a.id}">
        <strong class="ab-zeit">${esc(a.zeit || '–')}</strong>
        <div class="ab-text"><b>${esc(a.titel)}</b>${a.ort ? ` <span>${esc(a.ort)}</span>` : ''}${a.notiz ? `<p>${esc(a.notiz)}</p>` : ''}</div>
        <div class="ab-marken">${a.wer ? `<span class="marke">${esc(a.wer)}</span>` : ''}${a.intern ? '<span class="marke nein">intern</span>' : ''}</div>
        <div class="ab-knoepfe"><button type="button" class="knopf leise" data-ab-bearbeiten>Bearbeiten</button><button type="button" class="knopf leise weg" data-ab-weg>Löschen</button></div>
      </article>`).join('')}</div>`).join('');

  $('#dl-liste').innerHTML = links.map((l) => {
    const inhalt = [l.ablauf && 'Ablauf', l.zahlen && 'Zahlen und Essen', l.songs && 'Songwünsche', l.sitzplan === 1 && 'Sitzplan (Anzahl)', l.sitzplan === 2 && 'Sitzplan (Namen)'].filter(Boolean);
    return `<article class="dl-karte${l.aktiv ? '' : ' aus'}" data-id="${l.id}">
      <div class="dl-kopf"><strong>${esc(l.name)}</strong><span class="hilfe">${esc(inhalt.join(', ') || 'nichts freigegeben')}${l.geoeffnet ? ` · zuletzt geöffnet ${esc(zeit(l.geoeffnet))}` : ' · noch nicht geöffnet'}</span></div>
      <input class="dl-url" value="${esc(l.url)}" readonly aria-label="Link für ${esc(l.name)}">
      <div class="dl-knoepfe">
        <button type="button" class="knopf leise" data-dl-kopieren="${esc(l.url)}">Link kopieren</button>
        <a class="knopf leise" href="${esc(l.url)}" target="_blank" rel="noopener">Ansehen</a>
        <button type="button" class="knopf leise" data-dl-aktiv>${l.aktiv ? 'Sperren' : 'Freigeben'}</button>
        <button type="button" class="knopf leise" data-dl-neu title="Der alte Link funktioniert danach nicht mehr">Neuer Link</button>
        <button type="button" class="knopf leise weg" data-dl-weg>Löschen</button>
      </div>
    </article>`;
  }).join('') || '<p class="hilfe">Noch kein Link. Legt oben einen an, zum Beispiel für Catering.</p>';
}

/* Programmpunkte */
const form = $('#ab-form');
function formularLeeren() {
  form.reset(); form.id.value = '';
  $('#ab-form-titel').textContent = 'Programmpunkt hinzufügen';
  $('#ab-speichern').textContent = 'Hinzufügen';
  $('#ab-abbrechen').hidden = true;
  $('#ab-fehler').hidden = true;
}
$('#ab-abbrechen').addEventListener('click', () => { formularLeeren(); $('#ab-neu').open = false; });
form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const body = { tag: form.tag.value, zeit: form.zeit.value, titel: form.titel.value, ort: form.ort.value, wer: form.wer.value, notiz: form.notiz.value, intern: form.intern.checked };
  const f = $('#ab-fehler'); f.hidden = true;
  try {
    if (form.id.value) await api(`/api/admin/ablauf/${form.id.value}`, { method: 'PUT', body });
    else await api('/api/admin/ablauf', { method: 'POST', body });
    const tag = form.tag.value;
    formularLeeren(); form.tag.value = tag; // der nächste Punkt liegt meist am selben Tag
    await laden();
    form.titel.focus();
  } catch (x) { f.textContent = x.message; f.hidden = false; }
});
$('#ab-beispiel').addEventListener('click', async () => {
  await api('/api/admin/ablauf/beispiel', { method: 'POST' }).catch((x) => alert(x.message));
  laden();
});
$('#ab-liste').addEventListener('click', async (e) => {
  const z = e.target.closest('[data-id]');
  if (!z) return;
  const a = daten.ablauf.find((x) => x.id === Number(z.dataset.id));
  if (e.target.closest('[data-ab-bearbeiten]')) {
    form.id.value = a.id; form.tag.value = a.tag; form.zeit.value = a.zeit; form.titel.value = a.titel;
    form.ort.value = a.ort; form.wer.value = a.wer; form.notiz.value = a.notiz; form.intern.checked = a.intern;
    $('#ab-form-titel').textContent = 'Programmpunkt bearbeiten';
    $('#ab-speichern').textContent = 'Speichern';
    $('#ab-abbrechen').hidden = false;
    $('#ab-neu').open = true;
    form.scrollIntoView({ behavior: 'smooth', block: 'center' });
    form.titel.focus();
  }
  if (e.target.closest('[data-ab-weg]')) {
    if (!confirm(`„${a.titel}“ löschen?`)) return;
    await api(`/api/admin/ablauf/${a.id}`, { method: 'DELETE' }).catch((x) => alert(x.message));
    laden();
  }
});

/* Links für Dienstleister */
$('#dl-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = e.target; const fehler = $('#dl-fehler'); fehler.hidden = true;
  try {
    await api('/api/admin/dienstleister', { method: 'POST', body: { name: f.name.value, ablauf: f.ablauf.checked, zahlen: f.zahlen.checked, songs: f.songs.checked, sitzplan: Number(f.sitzplan.value) } });
    f.name.value = '';
    laden();
  } catch (x) { fehler.textContent = x.message; fehler.hidden = false; }
});
$('#dl-liste').addEventListener('click', async (e) => {
  const z = e.target.closest('[data-id]');
  if (!z) return;
  const l = daten.links.find((x) => x.id === Number(z.dataset.id));
  const k = e.target.closest('[data-dl-kopieren]');
  if (k) {
    await navigator.clipboard?.writeText(l.url).catch(() => $('.dl-url', z).select());
    k.textContent = 'Kopiert';
    setTimeout(() => { k.textContent = 'Link kopieren'; }, 1500);
    return;
  }
  const sicher = async (fn) => { await fn().catch((x) => alert(x.message)); laden(); };
  if (e.target.closest('[data-dl-aktiv]')) return sicher(() => api(`/api/admin/dienstleister/${l.id}`, { method: 'PUT', body: { aktiv: !l.aktiv } }));
  if (e.target.closest('[data-dl-neu]')) {
    if (!confirm(`Neuen Link für „${l.name}“ erzeugen? Der bisherige funktioniert danach nicht mehr, ihr müsst den neuen weitergeben.`)) return;
    return sicher(() => api(`/api/admin/dienstleister/${l.id}/neu`, { method: 'POST' }));
  }
  if (e.target.closest('[data-dl-weg]')) {
    if (!confirm(`Link für „${l.name}“ löschen?`)) return;
    return sicher(() => api(`/api/admin/dienstleister/${l.id}`, { method: 'DELETE' }));
  }
});
$('#dl-liste').addEventListener('focusin', (e) => { if (e.target.matches('.dl-url')) e.target.select(); });

document.addEventListener('reiter', (e) => { if (e.detail === 'ablauf') laden().catch((x) => alert(x.message)); });
