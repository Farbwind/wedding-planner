// Verwaltung der Gästeliste

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const zeit = (s) => (s ? new Date(s.replace(' ', 'T') + 'Z').toLocaleString('de-DE', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' }) : '');

let daten = null;
let filter = 'alle';

async function api(pfad, opts = {}) {
  const res = await fetch(pfad, {
    ...opts,
    headers: opts.body && !(opts.body instanceof Blob) ? { 'Content-Type': 'application/json' } : undefined,
    body: opts.body && !(opts.body instanceof Blob) ? JSON.stringify(opts.body) : opts.body,
  });
  const json = await res.json().catch(() => ({}));
  if (res.status === 401 && !pfad.endsWith('/login') && !pfad.endsWith('/password')) { zeigeAnmeldung(); throw new Error(json.error); }
  if (!res.ok) throw new Error(json.error || 'Fehler');
  return json;
}

/* Anmeldung */
async function zeigeAnmeldung() {
  const s = await fetch('/api/admin/session').then((r) => r.json());
  if (s.user) return starteApp();
  $('#app').hidden = true;
  $('#anmeldung').hidden = false;
  const wahl = $('#wer-wahl');
  wahl.innerHTML = s.users.map((u, i) => `<label><input type="radio" name="user" value="${esc(u.name)}" data-bereit="${u.ready}" ${i === 0 ? 'checked' : ''}><span>${esc(u.name)}</span></label>`).join('');
  const aktualisieren = () => {
    const r = $('input[name="user"]:checked');
    const bereit = r.dataset.bereit === 'true';
    const hilfe = $('#login-hilfe');
    $('#pw').autocomplete = bereit ? 'current-password' : 'new-password';
    $('#pw-label').textContent = bereit ? 'Passwort' : 'Neues Passwort festlegen (mindestens 8 Zeichen)';
    $('#login-knopf').textContent = bereit ? 'Anmelden' : 'Festlegen und anmelden';
    hilfe.hidden = bereit;
    hilfe.textContent = s.setupAllowed
      ? `${r.value} hat noch kein Passwort. Das legst du jetzt fest.`
      : `${r.value} hat noch kein Passwort. Das erste Passwort lässt sich nur direkt im eigenen Netzwerk festlegen. Auf einem Server im Internet setzt es der Betreiber mit ADMIN_PASSWORD (siehe README).`;
  };
  wahl.onchange = aktualisieren;
  aktualisieren();
  $('#pw').focus();
}

$('#login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = $('#login-fehler');
  f.hidden = true;
  try {
    await api('/api/admin/login', { method: 'POST', body: { user: $('input[name="user"]:checked').value, password: $('#pw').value } });
    $('#pw').value = '';
    starteApp();
  } catch (err) { f.textContent = err.message; f.hidden = false; }
});

$('#abmelden').addEventListener('click', async () => { await api('/api/admin/logout', { method: 'POST' }); zeigeAnmeldung(); });

/* Reiter */
function reiter(name) {
  $$('[data-reiter]').forEach((b) => (b.dataset.reiter === name ? b.setAttribute('aria-current', 'page') : b.removeAttribute('aria-current')));
  $$('[data-bereich]').forEach((s) => (s.hidden = s.dataset.bereich !== name));
  try { localStorage.setItem('hz-reiter', name); } catch {}
  if (name === 'angaben') ladeAngaben();
  // Die Bereiche Sitzplan, Beiträge und Inhalte laden ihre Daten selbst
  document.dispatchEvent(new CustomEvent('reiter', { detail: name }));
}
$$('[data-reiter]').forEach((b) => b.addEventListener('click', () => reiter(b.dataset.reiter)));

async function starteApp() {
  $('#anmeldung').hidden = true;
  $('#app').hidden = false;
  let r = 'gaesteliste';
  try { r = localStorage.getItem('hz-reiter') || r; } catch {}
  if (!$(`[data-bereich="${r}"]`)) r = 'gaesteliste';
  reiter(r);
  await laden();
}

async function laden() {
  daten = await api('/api/admin/overview');
  zahlen();
  antworten();
  $('#qr-link').textContent = daten.publicUrl;
}

// Die Zähler oben füllt admin-planung.js, hier nur Bescheid geben, dass es neue Antworten gibt
function zahlen() {
  document.dispatchEvent(new Event('antworten-geladen'));
}

function antworten() {
  const q = $('#suche').value.trim().toLowerCase();
  const passt = (t) => !q || String(t || '').toLowerCase().includes(q);
  const zeilen = [];
  {
    for (const r of daten.responses) {
      if (filter === 'ja' && !r.attending) continue;
      if (filter === 'nein' && r.attending) continue;
      if (filter === 'essen' && !(r.attending && (r.vegetarian || r.vegan))) continue;
      if (!passt(r.name) && !passt(r.invite_name) && !passt(r.companions)) continue;
      const details = [
        r.civil ? '<p><b>Standesamt:</b> ja</p>' : '',
        r.companions ? `<p><b>Mitreisende:</b> ${esc(r.companions)}</p>` : '',
        r.attending && (r.vegetarian || r.vegan) ? `<p class="essen">${r.vegetarian ? '<span class="marke gruen">Vegetarisch</span>' : ''}${r.vegan ? '<span class="marke gruen">Vegan</span>' : ''}</p>` : '',
        r.diet ? `<p><b>Allergien/Wünsche:</b> ${esc(r.diet)}</p>` : '',
        r.message ? `<p><b>Nachricht:</b> ${esc(r.message)}</p>` : '',
      ].join('');
      zeilen.push(`<article class="zeile">
        <div class="zeile-name"><strong>${esc(r.name)}</strong></div>
        <div><span class="marke ${r.attending ? 'ja' : 'nein'}">${r.attending ? 'Zusage' : 'Absage'}</span></div>
        <div class="zeile-zahl">${r.attending ? r.persons : ''}${r.attending ? `<small>${r.persons === 1 ? 'Person' : 'Personen'}</small>` : ''}</div>
        <div class="details">${details || '<p class="hilfe">Keine weiteren Angaben</p>'}<p class="zeile-zeit">${zeit(r.updated_at)}</p></div>
        <div class="aktionen"><button type="button" class="weg" data-antwort-weg="${r.id}">Löschen</button></div>
      </article>`);
    }
  }
  $('#antworten-liste').innerHTML = zeilen.join('') || `<p class="leer">${q ? 'Niemand gefunden.' : 'Noch keine Antworten. Sobald jemand antwortet, steht es hier.'}</p>`;
}

$$('[data-filter]').forEach((b) => b.addEventListener('click', () => {
  filter = b.dataset.filter;
  $$('[data-filter]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
  antworten();
}));
$('#suche').addEventListener('input', antworten);

document.addEventListener('click', async (e) => {
  const t = e.target.closest('button');
  if (!t) return;
  if (t.hasAttribute('data-kopieren-start')) {
    try { await navigator.clipboard.writeText(daten.publicUrl); t.textContent = 'Kopiert'; }
    catch { prompt('Adresse zum Kopieren:', daten.publicUrl); }
    setTimeout(() => (t.textContent = 'Adresse kopieren'), 1600);
  }
  if (t.dataset.antwortWeg) {
    if (!confirm('Diese Antwort wirklich löschen? Das lässt sich nicht rückgängig machen.')) return;
    await api(`/api/admin/responses/${t.dataset.antwortWeg}`, { method: 'DELETE' });
    laden();
  }
});

/* Angaben */
async function ladeAngaben() {
  const s = await api('/api/admin/settings');
  const f = $('#angaben-form');
  for (const [k, v] of Object.entries(s)) if (f.elements[k]) f.elements[k].value = v;
  const img = $('#foto-vorschau');
  img.src = `/foto?t=${Date.now()}`;
  img.onload = () => (img.hidden = false);
  img.onerror = () => (img.hidden = true);
}
$('#angaben-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const body = Object.fromEntries(new FormData(e.target));
  await api('/api/admin/settings', { method: 'PUT', body });
  const ok = $('#angaben-ok');
  ok.hidden = false;
  setTimeout(() => (ok.hidden = true), 2500);
});
$('#foto-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const file = $('#foto').files[0];
  const st = $('#foto-status');
  if (!file) { st.textContent = 'Bitte zuerst ein Bild auswählen.'; return; }
  if (file.size > 8 * 1024 * 1024) { st.textContent = 'Das Bild ist größer als 8 MB. Bitte vorher verkleinern.'; return; }
  try {
    await api('/api/admin/photo', { method: 'POST', body: file });
    st.textContent = 'Foto ist online.';
    ladeAngaben();
  } catch (err) { st.textContent = err.message; }
});
$('#foto-weg').addEventListener('click', async () => {
  await api('/api/admin/photo', { method: 'DELETE' });
  $('#foto-status').textContent = 'Foto entfernt.';
  ladeAngaben();
});
$('#pw-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const st = $('#pw-status');
  try {
    await api('/api/admin/password', { method: 'POST', body: { old: $('#pw-alt').value, password: $('#pw-neu').value } });
    st.textContent = 'Passwort geändert.';
    e.target.reset();
  } catch (err) { st.textContent = err.message; }
});

zeigeAnmeldung();
