// Verwaltung: Inhalte (Fotos, Geschichte, Quiz)

const $ = (s, r = document) => r.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const datum = (s) => (s ? new Date(s.replace(' ', 'T') + 'Z').toLocaleString('de-DE', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' }) : '');

async function api(pfad, opts = {}) {
  const res = await fetch(pfad, { ...opts, headers: opts.body ? { 'Content-Type': 'application/json' } : undefined, body: opts.body ? JSON.stringify(opts.body) : undefined });
  const d = await res.json().catch(() => ({}));
  if (res.status === 401) { location.reload(); throw new Error('Bitte neu anmelden.'); }
  if (!res.ok) throw new Error(d.error || 'Das hat nicht geklappt.');
  return d;
}

// Foto im Browser verkleinern und ohne Zusatzdaten als JPEG hochladen.
// Die Prüfsumme lässt den Server erkennen, ob die Datei unterwegs beschädigt wurde, dann wird neu gesendet.
// Manche Browser kennen die Option für die Ausrichtung nicht, dann ohne sie und zuletzt über ein normales Bild
async function bildLesen(datei) {
  const versuch = await createImageBitmap(datei, { imageOrientation: 'from-image' }).catch(() => null)
    || await createImageBitmap(datei).catch(() => null);
  if (versuch) return versuch;
  const url = URL.createObjectURL(datei);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    return img;
  } catch { return null; } finally { setTimeout(() => URL.revokeObjectURL(url), 5000); }
}
async function fotoHochladen(datei) {
  if (!datei.size) throw new Error(`${datei.name}: Die Datei ist leer. Liegt das Foto vielleicht nur in der iCloud? Bitte erst herunterladen.`);
  const bild = await bildLesen(datei);
  if (!bild) throw new Error(`${datei.name}: Dieses Foto lässt sich nicht lesen. Bitte als JPG speichern und noch einmal versuchen.`);
  const f = Math.min(1, 2000 / Math.max(bild.width, bild.height));
  const c = document.createElement('canvas');
  c.width = Math.round(bild.width * f); c.height = Math.round(bild.height * f);
  c.getContext('2d').drawImage(bild, 0, 0, c.width, c.height);
  const blob = await new Promise((ok) => c.toBlob(ok, 'image/jpeg', 0.86));
  const puffer = await blob.arrayBuffer();
  const sha256 = await window.hzSha256(puffer);
  let bin = ''; const bytes = new Uint8Array(puffer);
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  const daten = btoa(bin);
  let fehler;
  for (let v = 0; v < 4; v++) {
    try { return (await api('/api/admin/bild', { method: 'POST', body: { daten, sha256 } })).datei; }
    catch (e) { fehler = e; }
  }
  throw fehler;
}

const SAMMLUNGEN = {
  fotos: {
    hilfe: 'Fotos für „Momente von uns“ auf der Startseite. Ihr könnt mehrere auf einmal auswählen. Die Reihenfolge lässt sich unten ändern.',
    seite: '/#momente',
    felder: [{ name: 'bild', typ: 'bild' }, { name: 'text', label: 'Bildunterschrift (freiwillig)', max: 200 }],
  },
  geschichte: {
    hilfe: 'Die Stationen eurer Geschichte, von oben nach unten so wie auf der Seite. Text mit Leerzeile ergibt einen neuen Absatz.',
    seite: '/geschichte',
    felder: [{ name: 'zeit', label: 'Wann', platz: 'z. B. Sommer 2016', max: 60 }, { name: 'titel', label: 'Überschrift', max: 120 }, { name: 'text', label: 'Text', typ: 'lang' }, { name: 'bild', typ: 'bild' }],
  },
  quiz: {
    hilfe: 'Fragen mit zwei bis vier Antworten. Markiert die richtige Antwort. Die Auflösung erscheint nach dem Antworten.',
    seite: '/quiz',
    felder: [{ name: 'frage', label: 'Frage', max: 300 }, { name: 'antworten', typ: 'antworten' }, { name: 'erklaerung', label: 'Auflösung (freiwillig)', max: 800, typ: 'lang' }],
  },
};

let sammlung = 'fotos';
let eintraege = [];

function feldHtml(f, wert, id) {
  if (f.typ === 'bild') {
    return `<div class="bild-feld">
      <input type="hidden" name="bild" value="${esc(wert)}">
      <img class="bild-vorschau" ${wert ? `src="/bilder/${esc(wert)}"` : 'hidden'} alt="">
      <label class="knopf leise datei-knopf">${wert ? 'Foto ändern' : 'Foto auswählen'}<input type="file" accept="image/*" data-bild></label>
      <span class="hilfe bild-zieh">oder Foto auf die Station ziehen, oder kopieren, hier klicken und ⌘V</span>
      ${wert ? '<button type="button" class="knopf leise" data-bild-weg>Foto entfernen</button>' : ''}
      <span class="hilfe" data-bild-status role="status"></span>
    </div>`;
  }
  if (f.typ === 'antworten') {
    const a = wert?.antworten || [];
    return `<fieldset class="antworten-feld"><legend>Antworten (richtige markieren)</legend>
      ${[0, 1, 2, 3].map((i) => `<div class="antwort-zeile"><input type="radio" name="richtig-${id}" value="${i}" ${(wert?.richtig ?? 0) === i ? 'checked' : ''} aria-label="Antwort ${i + 1} ist richtig"><input name="antwort" value="${esc(a[i] || '')}" placeholder="Antwort ${i + 1}${i > 1 ? ' (freiwillig)' : ''}" maxlength="200"></div>`).join('')}
    </fieldset>`;
  }
  const attr = `name="${f.name}" maxlength="${f.max || 4000}" ${f.platz ? `placeholder="${esc(f.platz)}"` : ''}`;
  return `<label>${f.label}${f.typ === 'lang' ? `<textarea ${attr} rows="${f.name === 'text' ? 6 : 2}">${esc(wert)}</textarea>` : `<input ${attr} value="${esc(wert)}">`}</label>`;
}

function formularHtml(e, id) {
  const def = SAMMLUNGEN[sammlung];
  return def.felder.map((f) => feldHtml(f, f.typ === 'antworten' ? e : e?.[f.name] ?? '', id)).join('');
}

function werte(form) {
  const w = {};
  for (const f of SAMMLUNGEN[sammlung].felder) {
    if (f.typ === 'antworten') {
      const alle = [...form.querySelectorAll('input[name="antwort"]')].map((x, i) => ({ text: x.value.trim(), i }));
      const gewaehlt = Number(form.querySelector('input[type="radio"]:checked')?.value ?? 0);
      const gefuellt = alle.filter((x) => x.text);
      w.antworten = gefuellt.map((x) => x.text);
      w.richtig = Math.max(0, gefuellt.findIndex((x) => x.i === gewaehlt));
    } else {
      w[f.name] = form.elements[f.name]?.value ?? '';
    }
  }
  return w;
}

// Daneben fallengelassene Dateien nicht vom Browser öffnen lassen, sonst ist die Verwaltung weg
window.addEventListener('dragover', (ev) => ev.preventDefault());
window.addEventListener('drop', (ev) => ev.preventDefault());

// Kopiertes Foto (z. B. aus WhatsApp: „Bild kopieren“) mit ⌘V in die zuletzt angeklickte Station einfügen
let aktivesFormular = null;
document.addEventListener('paste', (ev) => {
  const datei = [...(ev.clipboardData?.files || [])].find((d) => /^image\//.test(d.type));
  if (!datei || !aktivesFormular?.isConnected || !aktivesFormular._hochladen) return;
  ev.preventDefault();
  aktivesFormular._hochladen(datei);
});

function bildFeldVerdrahten(form) {
  const feld = form.querySelector('.bild-feld');
  const hochladen = async (datei) => {
    if (!datei) return;
    const st = form.querySelector('[data-bild-status]');
    st.classList.remove('fehler');
    st.textContent = 'Wird hochgeladen …';
    try {
      const name = await fotoHochladen(datei);
      form.elements.bild.value = name;
      const v = form.querySelector('.bild-vorschau');
      v.src = `/bilder/${name}`; v.hidden = false;
      if (form.dataset.id) {
        // Bestehenden Eintrag gleich mit Foto speichern, damit es nicht verloren geht
        await api(`/api/admin/inhalt/${sammlung}/${form.dataset.id}`, { method: 'PUT', body: werte(form) });
        st.textContent = 'Foto gespeichert.';
      } else st.textContent = 'Hochgeladen, jetzt noch „Hinzufügen“.';
    } catch (e) { st.classList.add('fehler'); st.textContent = e.message; }
  };
  form.querySelector('[data-bild]')?.addEventListener('change', (ev) => hochladen(ev.target.files[0]));
  // Foto auch per Ziehen annehmen (Finder, Fotos, WhatsApp), irgendwo auf die Station
  if (!feld) return;
  form._hochladen = hochladen;
  form.addEventListener('pointerdown', () => { aktivesFormular = form; });
  form.addEventListener('focusin', () => { aktivesFormular = form; });
  form.addEventListener('dragover', (ev) => { ev.preventDefault(); form.classList.add('ziel'); });
  form.addEventListener('dragleave', (ev) => { if (!form.contains(ev.relatedTarget)) form.classList.remove('ziel'); });
  form.addEventListener('drop', (ev) => {
    ev.preventDefault();
    form.classList.remove('ziel');
    const datei = [...(ev.dataTransfer?.files || [])].find((d) => /^image\//.test(d.type) || /\.(jpe?g|png|heic|webp)$/i.test(d.name));
    if (datei) hochladen(datei);
    else {
      const st = form.querySelector('[data-bild-status]');
      st.classList.add('fehler');
      st.textContent = 'Das kam nicht als Foto an. Aus WhatsApp: Rechtsklick aufs Bild, „Bild kopieren“, dann hier klicken und ⌘V drücken. Oder das Bild erst speichern und „Foto auswählen“ nehmen.';
    }
  });
  form.querySelector('[data-bild-weg]')?.addEventListener('click', () => {
    form.elements.bild.value = '';
    form.querySelector('.bild-vorschau').hidden = true;
    form.querySelector('[data-bild-status]').textContent = 'Entfernt, bitte speichern.';
  });
}

async function inhalteLaden() {
  const def = SAMMLUNGEN[sammlung];
  $('#inhalt-hilfe').textContent = def.hilfe;
  $('#inhalt-ansehen').href = def.seite;
  eintraege = await api(`/api/admin/inhalt/${sammlung}`);

  // Neu anlegen
  const neu = $('#inhalt-neu');
  if (sammlung === 'fotos') {
    neu.innerHTML = `<div class="block neu-block"><h2>Fotos hinzufügen</h2>
      <label class="knopf datei-knopf">Fotos auswählen<input type="file" accept="image/*" multiple id="fotos-mehrere"></label>
      <p class="hilfe" id="fotos-status" role="status"></p></div>`;
    $('#fotos-mehrere').addEventListener('change', async (ev) => {
      const dateien = [...ev.target.files];
      const st = $('#fotos-status');
      let n = 0;
      for (const d of dateien) {
        st.textContent = `Lade ${++n} von ${dateien.length} hoch …`;
        try { const bild = await fotoHochladen(d); await api('/api/admin/inhalt/fotos', { method: 'POST', body: { bild, text: '' } }); }
        catch (e) { st.textContent = e.message; }
      }
      st.textContent = `${dateien.length} ${dateien.length === 1 ? 'Foto' : 'Fotos'} hinzugefügt.`;
      inhalteLaden();
    });
  } else {
    neu.innerHTML = `<details class="block neu-block" ${eintraege.length ? '' : 'open'}><summary>Neu hinzufügen</summary>
      <form class="inhalt-form" data-neu>${formularHtml(null, 'neu')}<div class="reihe"><button class="knopf">Hinzufügen</button></div><p class="hilfe" data-status role="status"></p></form></details>`;
    const f = neu.querySelector('form');
    bildFeldVerdrahten(f);
    f.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      try { await api(`/api/admin/inhalt/${sammlung}`, { method: 'POST', body: werte(f) }); inhalteLaden(); }
      catch (e) { f.querySelector('[data-status]').textContent = e.message; }
    });
  }

  // Bestehende Einträge
  const liste = $('#inhalt-liste');
  liste.innerHTML = eintraege.map((e, i) => `
    <form class="block inhalt-form ${sammlung === 'fotos' ? 'foto-eintrag' : ''}" data-id="${e.id}">
      <p class="eintrag-nr">${i + 1}${e.titel ? ` · ${esc(e.titel)}` : e.ort ? ` · ${esc(e.ort)}` : ''}</p>
      ${formularHtml(e, e.id)}
      <div class="reihe">
        <button class="knopf">Speichern</button>
        <button type="button" class="knopf leise" data-schieben="-1" ${i === 0 ? 'disabled' : ''}>Nach oben</button>
        <button type="button" class="knopf leise" data-schieben="1" ${i === eintraege.length - 1 ? 'disabled' : ''}>Nach unten</button>
        <button type="button" class="knopf leise weg" data-loeschen>Löschen</button>
      </div>
      <p class="hilfe" data-status role="status"></p>
    </form>`).join('') || '<p class="leer">Noch nichts angelegt.</p>';

  liste.querySelectorAll('form').forEach((f) => {
    bildFeldVerdrahten(f);
    const id = Number(f.dataset.id);
    f.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const st = f.querySelector('[data-status]');
      try { await api(`/api/admin/inhalt/${sammlung}/${id}`, { method: 'PUT', body: werte(f) }); st.textContent = 'Gespeichert.'; }
      catch (e) { st.textContent = e.message; }
    });
    f.querySelector('[data-loeschen]').addEventListener('click', async () => {
      if (!confirm('Diesen Eintrag wirklich löschen?')) return;
      await api(`/api/admin/inhalt/${sammlung}/${id}`, { method: 'DELETE' });
      inhalteLaden();
    });
    f.querySelectorAll('[data-schieben]').forEach((b) => b.addEventListener('click', async () => {
      const ids = eintraege.map((x) => x.id);
      const pos = ids.indexOf(id);
      const ziel = pos + Number(b.dataset.schieben);
      [ids[pos], ids[ziel]] = [ids[ziel], ids[pos]];
      await api(`/api/admin/inhalt/${sammlung}/reihenfolge`, { method: 'POST', body: { ids } });
      inhalteLaden();
    }));
  });
}

document.querySelectorAll('[data-sammlung]').forEach((b) => b.addEventListener('click', () => {
  sammlung = b.dataset.sammlung;
  document.querySelectorAll('[data-sammlung]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
  inhalteLaden().catch((e) => alert(e.message));
}));

document.addEventListener('reiter', (e) => {
  if (e.detail === 'inhalte') inhalteLaden().catch((x) => alert(x.message));
});
