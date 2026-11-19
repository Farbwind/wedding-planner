// Fotos teilen: Gäste wählen Abschnitt und Namen, der Browser verkleinert die Fotos und lädt sie einzeln hoch.
// Darunter die Galerie, wenn sie in der Verwaltung freigeschaltet ist.
const { esc } = window.hz;
const feld = (n) => document.querySelector(`[data-feld="${n}"]`);
const form = document.getElementById('upload-form');
const NAME = 'hochzeit-fotoname';
const ABSCHNITT = 'hochzeit-fotoabschnitt';
const SCHLUESSEL = 'hochzeit-fotoschluessel';
const GROSS = 3000; // längste Seite in Pixeln
const KLEIN = 480;

let daten = { abschnitte: [], fotos: [], galerie: false, erlaubt: true, modus: 'offen' };
let filter = 0;
let sicht = [];
let pos = 0;

const merken = (k, v) => { try { localStorage.setItem(k, v); } catch {} };
const lesen = (k) => { try { return localStorage.getItem(k) || ''; } catch { return ''; } };
const fehler = (text) => { const f = feld('fehler'); f.textContent = text; f.hidden = !text; };
// Zugangsschlüssel aus dem QR-Code (?z=...) oder aus einem früheren Besuch. Nur nötig, wenn die Fotoseite auf „nur mit QR-Code“ steht.
const normal = (t) => String(t || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
let schluessel = normal(new URLSearchParams(location.search).get('z')) || normal(lesen(SCHLUESSEL));
const mitSchluessel = (u) => (schluessel ? `${u}?z=${schluessel}` : u);
const tag = (iso) => (iso ? new Date(`${iso}T12:00:00`).toLocaleDateString('de-DE', { weekday: 'short', day: 'numeric', month: 'numeric' }) : '');

// Name aus früheren Besuchen oder aus der Zusage übernehmen
function nameVorschlag() {
  const n = lesen(NAME);
  if (n) return n;
  try { return JSON.parse(lesen('hochzeit-antwort') || 'null')?.response?.name || ''; } catch { return ''; }
}

async function laden() {
  const r = await fetch('/api/gaestefotos', { headers: schluessel ? { 'X-Zugang': schluessel } : {} });
  if (!r.ok) throw new Error('Laden fehlgeschlagen');
  daten = await r.json();
}

// Abschnitt, der heute gerade dran ist: Datum von heute, bei mehreren der zuletzt begonnene (Uhrzeit „ab“).
// Hat noch keiner begonnen, der erste des Tages.
function jetztDran(liste) {
  const d = new Date();
  const heute = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const uhr = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  const heutige = liste.filter((a) => a.datum === heute).sort((x, y) => (x.ab || '').localeCompare(y.ab || ''));
  if (!heutige.length) return null;
  const begonnen = heutige.filter((a) => !a.ab || a.ab <= uhr);
  return begonnen.length ? begonnen[begonnen.length - 1] : heutige[0];
}

function gesperrtZeichnen() {
  const g = feld('gesperrt');
  g.hidden = daten.erlaubt;
  feld('gesperrt-text').textContent = schluessel
    ? 'Dieser Code passt leider nicht (mehr). Scannt den QR-Code auf eurem Tisch noch einmal oder tragt den Code von der Karte ein.'
    : 'Die Fotos sind nur über den QR-Code auf eurem Tisch erreichbar. Scannt ihn mit der Kamera oder tragt den Code von der Karte hier ein.';
}

function uploadZeichnen() {
  if (!daten.erlaubt) { form.hidden = true; feld('geschlossen').hidden = true; return; }
  const offen = daten.abschnitte.filter((a) => a.offen);
  form.hidden = !offen.length;
  feld('geschlossen').hidden = !!offen.length;
  if (!offen.length) return;
  const ausLink = offen.find((a) => a.id === Number(new URLSearchParams(location.search).get('a')));
  const nachZeit = jetztDran(offen);
  const gemerkt = offen.find((a) => a.id === Number(lesen(ABSCHNITT)));
  const gewaehlt = ausLink || nachZeit || gemerkt || (offen.length === 1 ? offen[0] : null);
  const hinweis = feld('abschnitt-hinweis');
  hinweis.hidden = !(nachZeit && !ausLink);
  hinweis.textContent = 'Passend zu heute vorausgewählt, du kannst es oben ändern.';
  feld('abschnitte').innerHTML = offen.map((a) => `
    <label class="abschnitt"><input type="radio" name="abschnitt" value="${a.id}" ${gewaehlt?.id === a.id ? 'checked' : ''}>
      <span><b>${esc(a.name)}</b>${a.datum ? `<small>${esc(tag(a.datum))}</small>` : ''}</span></label>`).join('');
  if (!form.name.value) form.name.value = nameVorschlag();
}

function galerieZeichnen() {
  const g = feld('galerie');
  g.hidden = !daten.galerie || !daten.erlaubt;
  if (g.hidden) return;
  const mitFotos = daten.abschnitte.filter((a) => a.anzahl);
  feld('filter').innerHTML = [`<button type="button" data-filter="0" aria-pressed="${filter === 0}">Alle <span>${daten.fotos.length}</span></button>`,
    ...mitFotos.map((a) => `<button type="button" data-filter="${a.id}" aria-pressed="${filter === a.id}">${esc(a.name)} <span>${a.anzahl}</span></button>`)].join('');
  feld('filter').hidden = mitFotos.length < 2;
  sicht = daten.fotos.filter((f) => !filter || f.abschnitt_id === filter);
  feld('raster').innerHTML = sicht.map((f, i) => `
    <button type="button" class="galerie-foto" data-i="${i}" aria-label="Foto von ${esc(f.name)} öffnen">
      <img src="${mitSchluessel(`/gaestefotos/${f.id}/vorschau.jpg`)}" alt="" loading="lazy" ${f.breite && f.hoehe ? `width="${f.breite}" height="${f.hoehe}"` : ''}>
    </button>`).join('');
  feld('galerie-leer').hidden = !!sicht.length;
}

feld('filter').addEventListener('click', (e) => {
  const b = e.target.closest('[data-filter]');
  if (!b) return;
  filter = Number(b.dataset.filter);
  galerieZeichnen();
});

// Großansicht
const kasten = feld('leuchtkasten');
function zeigen(i) {
  pos = (i + sicht.length) % sicht.length;
  const f = sicht[pos];
  const a = daten.abschnitte.find((x) => x.id === f.abschnitt_id);
  feld('gross').src = mitSchluessel(`/gaestefotos/${f.id}.jpg`);
  feld('gross').alt = `Foto von ${f.name}`;
  feld('gross-text').textContent = [`Von ${f.name}`, a?.name].filter(Boolean).join(' · ');
  if (!kasten.open) kasten.showModal();
}
feld('raster').addEventListener('click', (e) => { const b = e.target.closest('[data-i]'); if (b) zeigen(Number(b.dataset.i)); });
kasten.addEventListener('click', (e) => {
  if (e.target.closest('[data-zu]') || e.target === kasten) return kasten.close();
  const s = e.target.closest('[data-schritt]');
  if (s) zeigen(pos + Number(s.dataset.schritt));
});
kasten.addEventListener('keydown', (e) => { if (e.key === 'ArrowRight') zeigen(pos + 1); if (e.key === 'ArrowLeft') zeigen(pos - 1); });
let wischStart = null;
kasten.addEventListener('touchstart', (e) => { wischStart = e.touches[0].clientX; }, { passive: true });
kasten.addEventListener('touchend', (e) => {
  if (wischStart == null) return;
  const d = e.changedTouches[0].clientX - wischStart;
  if (Math.abs(d) > 50) zeigen(pos + (d < 0 ? 1 : -1));
  wischStart = null;
});

// Foto lesen und verkleinern. Manche Browser kennen die Option für die Ausrichtung nicht.
async function bildLesen(datei) {
  const b = await createImageBitmap(datei, { imageOrientation: 'from-image' }).catch(() => null)
    || await createImageBitmap(datei).catch(() => null);
  if (b) return b;
  const url = URL.createObjectURL(datei);
  try { const img = new Image(); img.src = url; await img.decode(); return img; }
  catch { return null; } finally { setTimeout(() => URL.revokeObjectURL(url), 5000); }
}
function alsJpeg(bild, max, qualitaet) {
  const f = Math.min(1, max / Math.max(bild.width, bild.height));
  const c = document.createElement('canvas');
  c.width = Math.round(bild.width * f); c.height = Math.round(bild.height * f);
  c.getContext('2d').drawImage(bild, 0, 0, c.width, c.height);
  return new Promise((ok, nein) => c.toBlob((b) => (b ? ok({ blob: b, breite: c.width, hoehe: c.height }) : nein(new Error('Das Foto ließ sich nicht umwandeln.'))), 'image/jpeg', qualitaet));
}

function senden(abschnitt, name, koerper, vorschauLaenge, sha, breite, hoehe, fortschritt) {
  return new Promise((ok, nein) => {
    const x = new XMLHttpRequest();
    x.open('POST', `/api/gaestefotos?abschnitt=${abschnitt}`);
    x.setRequestHeader('Content-Type', 'application/octet-stream');
    x.setRequestHeader('X-Name', encodeURIComponent(name));
    if (schluessel) x.setRequestHeader('X-Zugang', schluessel);
    x.setRequestHeader('X-Sha256', sha);
    x.setRequestHeader('X-Vorschau-Laenge', String(vorschauLaenge));
    x.setRequestHeader('X-Breite', String(breite));
    x.setRequestHeader('X-Hoehe', String(hoehe));
    x.upload.onprogress = (e) => { if (e.lengthComputable) fortschritt(e.loaded / e.total); };
    x.onload = () => {
      let d = {}; try { d = JSON.parse(x.responseText); } catch {}
      if (x.status === 200) ok(d); else nein(Object.assign(new Error(d.error || 'Das hat nicht geklappt.'), { status: x.status, field: d.field }));
    };
    x.onerror = () => nein(Object.assign(new Error('Keine Verbindung.'), { status: 0 }));
    x.send(koerper);
  });
}

async function hochladen(datei, eintrag, abschnitt, name) {
  const status = eintrag.querySelector('.upload-status');
  const balken = eintrag.querySelector('.upload-balken span');
  status.textContent = 'Wird vorbereitet …';
  const bild = await bildLesen(datei);
  if (!bild) throw new Error('Dieses Foto lässt sich nicht lesen.');
  const gross = await alsJpeg(bild, GROSS, 0.9);
  const klein = await alsJpeg(bild, KLEIN, 0.78);
  bild.close?.();
  eintrag.querySelector('img').src = URL.createObjectURL(klein.blob);
  const teil1 = new Uint8Array(await klein.blob.arrayBuffer());
  const teil2 = new Uint8Array(await gross.blob.arrayBuffer());
  const koerper = new Uint8Array(teil1.length + teil2.length);
  koerper.set(teil1); koerper.set(teil2, teil1.length);
  const sha = await window.hzSha256(koerper.buffer);
  // Bis zu viermal versuchen: Funklöcher und verfälschte Übertragungen kommen auf Feiern vor
  for (let versuch = 1; ; versuch++) {
    try {
      status.textContent = 'Wird hochgeladen …';
      await senden(abschnitt, name, koerper, teil1.length, sha, gross.breite, gross.hoehe, (a) => { balken.style.width = `${Math.round(a * 100)}%`; });
      return;
    } catch (e) {
      if (versuch >= 4 || (e.status >= 400 && e.status < 500 && e.status !== 422 && e.status !== 429)) throw e;
      status.textContent = 'Verbindung wackelt, neuer Versuch …';
      await new Promise((r) => setTimeout(r, 1500 * versuch));
    }
  }
}

form.fotos.addEventListener('change', async () => {
  const dateien = [...form.fotos.files];
  form.fotos.value = '';
  if (!dateien.length) return;
  fehler('');
  const abschnitt = Number(form.querySelector('input[name="abschnitt"]:checked')?.value || 0);
  const name = form.name.value.trim();
  if (!abschnitt) return fehler('Bitte wähl zuerst aus, wo die Fotos entstanden sind.');
  if (name.length < 2) { form.name.focus(); return fehler('Bitte trag zuerst deinen Namen ein.'); }
  merken(NAME, name);
  merken(ABSCHNITT, String(abschnitt));
  const liste = feld('warteschlange');
  const eintraege = dateien.map((d) => {
    const li = document.createElement('li');
    li.className = 'upload-eintrag';
    li.innerHTML = `<img alt=""><div><p class="upload-name">${esc(d.name || 'Foto')}</p><p class="upload-status">Wartet …</p><div class="upload-balken"><span></span></div></div>`;
    liste.prepend(li);
    return li;
  });
  let fertig = 0;
  for (let i = 0; i < dateien.length; i++) {
    const li = eintraege[i];
    try {
      await hochladen(dateien[i], li, abschnitt, name);
      li.classList.add('fertig');
      li.querySelector('.upload-status').textContent = 'Hochgeladen';
      fertig++;
    } catch (e) {
      li.classList.add('fehlgeschlagen');
      li.querySelector('.upload-status').textContent = e.message;
      if (e.field === 'name') form.name.focus();
    }
  }
  if (fertig) {
    try { await laden(); galerieZeichnen(); } catch {}
  }
});

// Code von Hand eintragen (für Gäste, die den QR-Code nicht scannen können)
feld('code-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const eingabe = normal(e.target.code.value);
  if (!eingabe) return;
  schluessel = eingabe;
  try {
    await laden();
    if (daten.erlaubt) { merken(SCHLUESSEL, schluessel); location.replace(`/fotos?z=${schluessel}`); return; }
  } catch {}
  gesperrtZeichnen();
});

try {
  await laden();
  if (daten.erlaubt && schluessel) merken(SCHLUESSEL, schluessel);
  gesperrtZeichnen();
  uploadZeichnen();
  galerieZeichnen();
} catch {
  fehler('Die Seite konnte nicht geladen werden. Bitte später noch einmal versuchen.');
  form.hidden = false;
}
