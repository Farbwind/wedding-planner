// Verwaltung: Countdown, Zähler, Einladungsliste, To-dos, Kosten und Geschenke

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const eur = (cent) => (cent / 100).toLocaleString('de-DE', { style: 'currency', currency: 'EUR' });
const zuEingabe = (cent) => (cent / 100).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const tagDatum = (iso) => (iso ? new Date(`${iso}T12:00:00`).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '');
const heute = () => new Date().toLocaleDateString('sv-SE');

async function api(pfad, opts = {}) {
  const res = await fetch(pfad, { ...opts, headers: opts.body ? { 'Content-Type': 'application/json' } : undefined, body: opts.body ? JSON.stringify(opts.body) : undefined });
  const d = await res.json().catch(() => ({}));
  if (res.status === 401) { location.reload(); throw new Error('Bitte neu anmelden.'); }
  if (!res.ok) throw new Error(d.error || 'Das hat nicht geklappt.');
  return d;
}

/* Countdown bis zu beiden Tagen */
async function countdown() {
  const info = await (await fetch('/api/info')).json();
  const tage = (iso) => Math.round((new Date(`${iso}T12:00:00`) - new Date(`${heute()}T12:00:00`)) / 864e5);
  const teil = (name, iso) => {
    if (!iso) return '';
    const t = tage(iso);
    if (t > 1) return `<span><b>${name}</b> in ${t} Tagen</span>`;
    if (t === 1) return `<span><b>${name}</b> ist morgen</span>`;
    if (t === 0) return `<span><b>${name}</b> ist heute!</span>`;
    return `<span><b>${name}</b> war vor ${-t} Tagen</span>`;
  };
  $('#countdown').innerHTML = [teil('Standesamt', info.civil?.date), teil('Kirche & Feier', info.church?.date)].filter(Boolean).join('');
}

/* Gästeliste mit Abgleich der Antworten */
let plan = null;
let planFilter = 'alle';
const STATUS_TEXT = { ja: 'zugesagt', nein: 'abgesagt', offen: 'offen' };

function statusZelle(g, tag) {
  const eingeladen = tag === 's' ? g.standesamt : g.hochzeit;
  const wert = tag === 's' ? g.status_s : g.status_h;
  const ist = g[tag];
  const auto = g.antwort ? (g.antwort.attending ? 'zugesagt' : 'abgesagt') : 'offen';
  return `<div class="plan-tag ${eingeladen ? '' : 'nicht'}">
    <label class="haken-klein"><input type="checkbox" data-feld="${tag === 's' ? 'standesamt' : 'hochzeit'}" ${eingeladen ? 'checked' : ''}> eingeladen</label>
    ${eingeladen ? `<select data-feld="status_${tag}" class="status-wahl status-${ist}" aria-label="Status">
      <option value="auto" ${wert === 'auto' ? 'selected' : ''}>Automatisch: ${auto}</option>
      <option value="ja" ${wert === 'ja' ? 'selected' : ''}>Zugesagt</option>
      <option value="nein" ${wert === 'nein' ? 'selected' : ''}>Abgesagt</option>
      <option value="offen" ${wert === 'offen' ? 'selected' : ''}>Offen</option>
    </select>` : ''}
  </div>`;
}

function planZeichnen() {
  if (!plan) return;
  const z = plan.zahlen;
  $('#z-s-ja').textContent = z.standesamt.ja; $('#z-s-eingeladen').textContent = `/${z.standesamt.eingeladen}`; $('#z-s-nein').textContent = z.standesamt.nein;
  $('#z-h-ja').textContent = z.hochzeit.ja; $('#z-h-eingeladen').textContent = `/${z.hochzeit.eingeladen}`; $('#z-h-nein').textContent = z.hochzeit.nein;
  $('#z-veggie').textContent = `${z.vegetarisch} Pers.`; $('#z-vegan').textContent = `${z.vegan} Pers.`;
  $('#z-personen').textContent = z.personenZugesagt;
  $('#z-versendet').textContent = `${z.versendet}/${plan.gaeste.length}`;
  platzZeichnen();

  const q = $('#plan-suche').value.trim().toLowerCase();
  const kat = $('#plan-kategorie').value;
  const passt = (g) => {
    if (q && !`${g.name} ${g.gruppe || ''}`.toLowerCase().includes(q)) return false;
    if (kat === 'ohne' ? g.kategorie : kat && g.kategorie !== kat) return false;
    const staende = [g.s, g.h].filter(Boolean);
    if (planFilter === 'offen') return staende.includes('offen');
    if (planFilter === 'ja') return staende.includes('ja');
    if (planFilter === 'nein') return staende.includes('nein');
    if (planFilter === 'nicht-versendet') return !g.versendet;
    return true;
  };
  const optionen = (g) => `<option value="auto" ${g.antwort_id == null ? 'selected' : ''}>Automatisch nach Namen</option>
    <option value="-1" ${g.antwort_id === -1 ? 'selected' : ''}>Keine Antwort zuordnen</option>
    ${plan.antworten.map((a) => `<option value="${a.id}" ${g.antwort_id === a.id ? 'selected' : ''}>${esc(a.name)}</option>`).join('')}`;
  const zeilen = plan.gaeste.filter(passt).map((g) => `
    <article class="zeile plan-zeile" data-id="${g.id}">
      <div class="zeile-name"><button type="button" class="name-knopf" data-umbenennen>${esc(g.name)}</button>
        <small>${g.antwort ? `Antwort: ${esc(g.antwort.name)}${g.antwort.manuell ? '' : ' (automatisch erkannt)'}` : 'noch keine Antwort'}</small>
        ${g.adresse ? `<small class="adresse-kurz">${esc(g.adresse.replace(/\n/g, ', '))}</small>` : ''}
        <select data-feld="kategorie" class="kat-wahl kat-${esc(g.kategorie || 'ohne')}" aria-label="Kategorie von ${esc(g.name)}">
          ${['', 'Familie', 'Freunde', 'Kollegen', 'Bekannte'].map((k) => `<option value="${k}" ${g.kategorie === k ? 'selected' : ''}>${k || 'Kategorie wählen'}</option>`).join('')}
        </select>
        <input data-feld="gruppe" class="gruppe-wahl" list="plan-gruppen" maxlength="60" value="${esc(g.gruppe || '')}" placeholder="Gruppe" aria-label="Gruppe für ${esc(g.name)}" title="Gruppe für Sitzplan und Einladungskarte"></div>
      ${statusZelle(g, 's')}
      ${statusZelle(g, 'h')}
      <label class="haken-klein versendet"><input type="checkbox" data-feld="versendet" ${g.versendet ? 'checked' : ''}> Einladung versendet</label>
      <details class="plan-mehr"><summary>Mehr</summary>
        <label>Adresse<textarea data-feld="adresse" rows="3" placeholder="Straße Nr.&#10;PLZ Ort">${esc(g.adresse || '')}</textarea></label>
        <label>Antwort zuordnen<select data-feld="antwort_id">${optionen(g)}</select></label>
        <button type="button" class="knopf leise weg" data-loeschen>Aus der Liste löschen</button>
      </details>
    </article>`);
  $('#plan-gruppen').innerHTML = (plan.gruppen || []).map((x) => `<option value="${esc(x)}">`).join('');
  kartenZeichnen();
  $('#plan-liste').innerHTML = zeilen.join('') || `<p class="leer">${plan.gaeste.length ? 'Niemand passt zum Filter.' : 'Tragt oben ein, wen ihr einladen wollt. Antworten der Gäste werden dann automatisch über den Namen zugeordnet.'}</p>`;

  const ohne = plan.ohneEintrag;
  const box = $('#ohne-eintrag');
  box.hidden = !ohne.length;
  box.innerHTML = ohne.length ? `<h3>Antworten ohne passenden Gast in der Liste (${ohne.length})</h3>
    <p class="hilfe">Diese Namen fehlen in der Einladungsliste oder sind anders geschrieben. Übernehmt sie oder ordnet sie bei einem Gast unter „Mehr“ zu.</p>
    <ul>${ohne.map((a) => `<li><strong>${esc(a.name)}</strong> ${a.attending ? `(Zusage, ${a.persons} ${a.persons === 1 ? 'Person' : 'Personen'})` : '(Absage)'}${a.companions ? `, mit ${esc(a.companions)}` : ''}
      <button type="button" class="knopf leise" data-uebernehmen="${a.id}">In die Liste übernehmen</button></li>`).join('')}</ul>` : '';
}

let plaetze = { platz_standesamt: '', platz_feier: '' };
async function planLaden() {
  const [p, s] = await Promise.all([api('/api/admin/gaesteliste'), api('/api/admin/settings')]);
  plan = p;
  plaetze = { platz_standesamt: s.platz_standesamt, platz_feier: s.platz_feier };
  planZeichnen();
}

// Summe der Häkchen pro Tag und Abgleich mit den verfügbaren Plätzen
function platzZeichnen() {
  const tag = (titel, z, schluessel) => {
    const offen = z.eingeladen - z.ja - z.nein;
    const erwartet = z.eingeladen - z.nein;
    const platz = Number(plaetze[schluessel]) || 0;
    const frei = platz - erwartet;
    const anteil = platz ? Math.min(100, (erwartet / platz) * 100) : 0;
    return `<section class="platz-tag ${platz && frei < 0 ? 'zu-voll' : ''}">
      <h3>${titel}</h3>
      <p class="platz-haken"><strong>${z.eingeladen}</strong> ${z.eingeladen === 1 ? 'Person' : 'Personen'} mit Häkchen</p>
      <p class="platz-detail">${z.ja} zugesagt · ${offen} offen · ${z.nein} abgesagt</p>
      <label class="platz-eingabe">Plätze vorhanden <input type="number" min="0" max="999" inputmode="numeric" data-platz="${schluessel}" value="${esc(plaetze[schluessel])}" placeholder="z. B. 80"></label>
      ${platz ? `<div class="platz-balken" role="img" aria-label="${erwartet} von ${platz} Plätzen belegt"><span style="width:${anteil}%"></span></div>
        <p class="platz-ergebnis">${frei >= 0 ? `Noch <b>${frei}</b> ${frei === 1 ? 'Platz' : 'Plätze'} frei` : `<b>${-frei}</b> ${frei === -1 ? 'Person' : 'Personen'} zu viel`}, gerechnet mit allen außer den Absagen (${erwartet})</p>` : '<p class="platz-ergebnis hilfe">Tragt die Plätze ein, dann rechnet die Liste mit.</p>'}
    </section>`;
  };
  const kats = Object.entries(plan.zahlen.kategorien || {}).filter(([, n]) => n);
  $('#platz-uebersicht').innerHTML = tag('Standesamt', plan.zahlen.standesamt, 'platz_standesamt') + tag('Kirche &amp; Feier', plan.zahlen.hochzeit, 'platz_feier')
    + (kats.length ? `<p class="kat-summen">${kats.map(([k, n]) => `<span class="kat-${k === 'Ohne Kategorie' ? 'ohne' : k}">${k} <b>${n}</b></span>`).join('')}</p>` : '');
}
$('#platz-uebersicht').addEventListener('change', async (e) => {
  const k = e.target.dataset.platz;
  if (!k) return;
  plaetze[k] = e.target.value.replace(/\D/g, '');
  await api('/api/admin/settings', { method: 'PUT', body: { [k]: plaetze[k] } });
  platzZeichnen();
});

/* Einladungskarten: eine Karte pro Gruppe, getrennt nur bei verschiedenen Adressen */
const und = (l) => (l.length < 2 ? l.join('') : `${l.slice(0, -1).join(', ')} und ${l[l.length - 1]}`);
function anschrift(namen) {
  const teile = namen.map((n) => n.trim().split(/\s+/));
  const nach = teile.map((t) => (t.length > 1 ? t[t.length - 1] : ''));
  if (namen.length > 1 && nach[0] && nach.every((x) => x === nach[0])) return `${und(teile.map((t) => t.slice(0, -1).join(' ')))} ${nach[0]}`;
  return und(namen);
}
function karten() {
  const gruppen = new Map();
  for (const g of plan.gaeste) {
    const k = g.gruppe ? `g:${g.gruppe.trim().toLowerCase()}` : `e:${g.id}`;
    if (!gruppen.has(k)) gruppen.set(k, []);
    gruppen.get(k).push(g);
  }
  const norm = (a) => a.toLowerCase().replace(/\s+/g, ' ').trim();
  const liste = [];
  for (const mitglieder of gruppen.values()) {
    const adressen = [...new Map(mitglieder.filter((g) => g.adresse).map((g) => [norm(g.adresse), g.adresse])).entries()];
    const teile = adressen.length > 1
      ? adressen.map(([n, a], i) => ({ adresse: a, gaeste: mitglieder.filter((g) => (g.adresse ? norm(g.adresse) === n : i === 0)) }))
      : [{ adresse: adressen[0]?.[1] || '', gaeste: mitglieder }];
    for (const t of teile) {
      liste.push({
        ...t,
        gruppe: mitglieder[0].gruppe || '',
        geteilt: teile.length > 1,
        an: anschrift(t.gaeste.map((g) => g.name)),
        s: t.gaeste.some((g) => g.standesamt),
        h: t.gaeste.some((g) => g.hochzeit),
        versendet: t.gaeste.every((g) => g.versendet),
      });
    }
  }
  return liste;
}
const zuWas = (k) => (k.s && k.h ? 'Standesamt, Kirche &amp; Feier' : k.s ? 'nur Standesamt' : k.h ? 'Kirche &amp; Feier' : 'kein Tag angehakt');
function kartenZeichnen() {
  const alle = karten();
  const offen = alle.filter((k) => !k.versendet);
  const ohneAdresse = alle.filter((k) => !k.adresse).length;
  const zeigen = $('#karten-nur-offen').checked ? offen : alle;
  $('#karten-zahl').textContent = `${alle.length} ${alle.length === 1 ? 'Karte' : 'Karten'} für ${plan.gaeste.length} ${plan.gaeste.length === 1 ? 'Gast' : 'Gäste'}${ohneAdresse ? `, ${ohneAdresse} ohne Adresse` : ''}`;
  $('#karten-titel').textContent = `Einladungskarten: ${zeigen.length} Stück`;
  $('#karten-liste').innerHTML = zeigen.map((k) => `
    <li class="karte${k.versendet ? ' ist-versendet' : ''}">
      <p class="karte-an">${esc(k.an)}</p>
      ${k.adresse ? `<p class="karte-adresse">${esc(k.adresse)}</p>` : '<p class="karte-fehlt">Adresse fehlt</p>'}
      <p class="karte-meta">${k.gaeste.length} ${k.gaeste.length === 1 ? 'Person' : 'Personen'} · ${zuWas(k)}${k.gruppe ? ` · Gruppe ${esc(k.gruppe)}${k.geteilt ? ' (verschiedene Adressen)' : ''}` : ''}</p>
      <label class="haken-klein nicht-drucken"><input type="checkbox" data-karte-versendet="${k.gaeste.map((g) => g.id).join(',')}" ${k.versendet ? 'checked' : ''}> versendet</label>
    </li>`).join('') || '<li class="leer">Keine Karten.</li>';
}
$('#karten-nur-offen').addEventListener('change', kartenZeichnen);
$('#karten-liste').addEventListener('change', async (e) => {
  const ids = e.target.dataset.karteVersendet;
  if (!ids) return;
  await Promise.all(ids.split(',').map((id) => api(`/api/admin/einladung/${id}`, { method: 'PUT', body: { versendet: e.target.checked } })));
  planLaden();
});
$('#karten-drucken').addEventListener('click', () => {
  $('#karten').open = true;
  document.body.classList.add('druck-karten');
  window.addEventListener('afterprint', () => document.body.classList.remove('druck-karten'), { once: true });
  window.print();
});
$('#karten-csv').addEventListener('click', () => {
  const zelle = (v) => { const s = String(v ?? ''); return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const zeilen = [['Anschrift', 'Adresszeile 1', 'Adresszeile 2', 'Adresszeile 3', 'Personen', 'Namen', 'Gruppe', 'Eingeladen zu', 'Versendet']];
  const liste = $('#karten-nur-offen').checked ? karten().filter((k) => !k.versendet) : karten();
  for (const k of liste) {
    const a = k.adresse.split('\n');
    zeilen.push([k.an, a[0] || '', a[1] || '', a.slice(2).join(', '), k.gaeste.length, k.gaeste.map((g) => g.name).join(', '), k.gruppe, zuWas(k).replace('&amp;', '&'), k.versendet ? 'ja' : 'nein']);
  }
  const blob = new Blob(['\ufeff' + zeilen.map((z) => z.map(zelle).join(';')).join('\r\n')], { type: 'text/csv;charset=utf-8' });
  const link = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: 'einladungskarten.csv' });
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);
});

$('#plan-liste').addEventListener('change', async (e) => {
  const zeile = e.target.closest('[data-id]');
  const feld = e.target.dataset.feld;
  if (!zeile || !feld) return;
  let wert = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
  if (feld === 'antwort_id') wert = wert === 'auto' ? null : Number(wert);
  await api(`/api/admin/einladung/${zeile.dataset.id}`, { method: 'PUT', body: { [feld]: wert } });
  planLaden();
});
$('#plan-liste').addEventListener('click', async (e) => {
  const zeile = e.target.closest('[data-id]');
  if (!zeile) return;
  const g = plan.gaeste.find((x) => x.id === Number(zeile.dataset.id));
  if (e.target.closest('[data-umbenennen]')) {
    const name = prompt('Name ändern:', g.name);
    if (name?.trim()) { await api(`/api/admin/einladung/${g.id}`, { method: 'PUT', body: { name } }); planLaden(); }
  }
  if (e.target.closest('[data-loeschen]') && confirm(`${g.name} aus der Einladungsliste löschen?`)) {
    await api(`/api/admin/einladung/${g.id}`, { method: 'DELETE' });
    planLaden();
  }
});
$('#ohne-eintrag').addEventListener('click', async (e) => {
  const b = e.target.closest('[data-uebernehmen]');
  if (!b) return;
  const a = plan.ohneEintrag.find((x) => x.id === Number(b.dataset.uebernehmen));
  const teile = (a.companions || '').split(/\s*(?:,|;|\n|\+|&|\bund\b)\s*/i).map((t) => t.trim()).filter(Boolean);
  const namen = [...new Set([a.name, ...teile])];
  await api('/api/admin/einladung', { method: 'POST', body: { items: namen.map((name) => ({ name, hochzeit: true })) } });
  planLaden();
});
$('#plan-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = e.target;
  try {
    await api('/api/admin/einladung', { method: 'POST', body: { name: f.name.value, standesamt: f.standesamt.checked, hochzeit: f.hochzeit.checked, kategorie: f.kategorie.value, gruppe: f.gruppe.value, adresse: f.adresse.value } });
    f.name.value = ''; f.name.focus();
    planLaden();
  } catch (err) { alert(err.message); }
});
$('#plan-viele').addEventListener('submit', async (e) => {
  e.preventDefault();
  const KAT = ['Familie', 'Freunde', 'Kollegen', 'Bekannte'];
  const items = e.target.liste.value.split('\n').map((z) => z.split(/[;\t]/).map((x) => x.trim())).filter((z) => z[0]).map(([name, ...rest]) => {
    const nurS = rest.some((t) => /^nur\s*s$/i.test(t));
    const auchS = rest.some((t) => /^s$/i.test(t) || /^standesamt$/i.test(t));
    const kategorie = KAT.find((k) => rest.some((t) => t.toLowerCase() === k.toLowerCase())) || '';
    const gruppe = rest.find((t) => t && !/^nur\s*s$/i.test(t) && !/^s$/i.test(t) && !/^standesamt$/i.test(t) && !KAT.some((k) => k.toLowerCase() === t.toLowerCase())) || '';
    return { name, standesamt: nurS || auchS, hochzeit: !nurS, kategorie, gruppe };
  });
  if (!items.length) return;
  await api('/api/admin/einladung', { method: 'POST', body: { items } });
  e.target.liste.value = '';
  planLaden();
});
$$('[data-plan-filter]').forEach((b) => b.addEventListener('click', () => {
  planFilter = b.dataset.planFilter;
  $$('[data-plan-filter]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
  planZeichnen();
}));
$('#plan-suche').addEventListener('input', planZeichnen);
$('#plan-kategorie').addEventListener('change', planZeichnen);

/* To-dos */
let todos = [];
let todoFilter = 'offen';
let kategorien = ['Location', 'Essen', 'Trinken', 'Personal', 'Dienstleister', 'Kleidung', 'Deko', 'Papeterie', 'Sonstiges'];

function gruppeVon(t) {
  if (t.erledigt) return 'Erledigt';
  if (!t.faellig) return 'Ohne Datum';
  const h = heute();
  if (t.faellig < h) return 'Überfällig';
  const in30 = new Date(Date.now() + 30 * 864e5).toLocaleDateString('sv-SE');
  return t.faellig <= in30 ? 'In den nächsten 30 Tagen' : 'Später';
}

function todosZeichnen() {
  const offen = todos.filter((t) => !t.erledigt);
  const ueber = offen.filter((t) => t.faellig && t.faellig < heute()).length;
  const marke = $('#todo-marke');
  marke.textContent = ueber || '';
  marke.hidden = !ueber;
  $('#todo-stand').textContent = `${todos.length - offen.length} von ${todos.length} erledigt`;
  const naechstes = offen.find((t) => t.faellig);
  const n = $('#naechstes');
  n.hidden = !naechstes;
  if (naechstes) n.innerHTML = `<span>Als Nächstes</span> ${esc(naechstes.titel)} <b>${tagDatum(naechstes.faellig)}</b>`;
  $('#bereiche').innerHTML = [...new Set(todos.map((t) => t.bereich).filter(Boolean))].map((b) => `<option value="${esc(b)}">`).join('');

  const sicht = todos.filter((t) => (todoFilter === 'offen' ? !t.erledigt : todoFilter === 'erledigt' ? t.erledigt : true));
  const reihenfolge = ['Überfällig', 'In den nächsten 30 Tagen', 'Später', 'Ohne Datum', 'Erledigt'];
  const gruppen = new Map(reihenfolge.map((g) => [g, []]));
  sicht.forEach((t) => gruppen.get(gruppeVon(t)).push(t));
  if (gruppen.get('Erledigt').length) gruppen.get('Erledigt').sort((a, b) => (b.erledigt || '').localeCompare(a.erledigt || ''));
  $('#todo-liste').innerHTML = [...gruppen].filter(([, l]) => l.length).map(([g, l]) => `
    <section class="todo-gruppe ${g === 'Überfällig' ? 'ueberfaellig' : ''}">
      <h3>${g} <span>${l.length}</span></h3>
      ${l.map((t) => `
        <div class="todo ${t.erledigt ? 'fertig' : ''}" data-id="${t.id}">
          <input type="checkbox" class="todo-haken" ${t.erledigt ? 'checked' : ''} aria-label="${esc(t.titel)} erledigt">
          <div class="todo-text">
            <p class="todo-titel">${esc(t.titel)}</p>
            <p class="todo-meta">${t.faellig ? `<span class="todo-datum">${tagDatum(t.faellig)}</span>` : ''}${t.bereich ? `<span class="todo-bereich">${esc(t.bereich)}</span>` : ''}${t.kosten_cent ? `<span class="todo-kosten">${eur(t.kosten_cent)}</span>` : ''}${t.notiz ? `<span class="todo-notiz">${esc(t.notiz)}</span>` : ''}</p>
          </div>
          <details class="todo-mehr"><summary aria-label="Bearbeiten">Bearbeiten</summary>
            <form class="todo-edit">
              <label>Titel<input name="titel" value="${esc(t.titel)}"></label>
              <label>Fällig<input type="date" name="faellig" value="${esc(t.faellig)}"></label>
              <label>Bereich<input name="bereich" value="${esc(t.bereich)}" list="bereiche"></label>
              <label>Notiz<input name="notiz" value="${esc(t.notiz)}"></label>
              <div class="reihe"><button class="knopf">Speichern</button><button type="button" class="knopf leise weg" data-todo-weg>Löschen</button></div>
            </form>
          </details>
        </div>`).join('')}
    </section>`).join('') || (todos.length ? '<p class="leer">Nichts mehr offen. Stark!</p>' : '<p class="leer">Noch keine To-dos. Mit „Beispiel-To-dos einfügen“ bekommt ihr eine Checkliste, deren Fristen sich nach dem Hochzeitsdatum aus den Angaben richten.</p>');
}

$('#todo-vorlage').addEventListener('click', async (e) => {
  e.target.disabled = true;
  try {
    const r = await api('/api/admin/todos/vorlage', { method: 'POST', body: {} });
    e.target.textContent = r.neu ? `${r.neu} To-dos eingefügt` : 'Schon alle da';
  } catch (x) { alert(x.message); }
  setTimeout(() => { e.target.disabled = false; e.target.textContent = 'Beispiel-To-dos einfügen'; }, 2500);
  todosLaden();
});

async function todosLaden() {
  todos = await api('/api/admin/todos');
  todosZeichnen();
}

$('#todo-liste').addEventListener('change', async (e) => {
  if (!e.target.classList.contains('todo-haken')) return;
  const id = Number(e.target.closest('[data-id]').dataset.id);
  const t = todos.find((x) => x.id === id);
  if (!e.target.checked) { await api(`/api/admin/todos/${id}`, { method: 'PUT', body: { erledigt: false } }); return todosLaden(); }
  // Beim Abhaken fragen, ob es etwas gekostet hat
  const d = $('#kosten-dialog');
  const f = $('#kosten-frage');
  f.reset();
  f.kategorie.innerHTML = kategorien.map((k) => `<option>${k}</option>`).join('');
  $('#kosten-frage-titel').textContent = t.titel;
  d.onclose = async () => {
    try {
      if (d.returnValue === 'mit') await api(`/api/admin/todos/${id}`, { method: 'PUT', body: { erledigt: true, kosten: { betrag: f.betrag.value, kategorie: f.kategorie.value, wo: f.wo.value, titel: t.titel } } });
      else if (d.returnValue === 'ohne') await api(`/api/admin/todos/${id}`, { method: 'PUT', body: { erledigt: true } });
    } catch (err) { alert(err.message); }
    todosLaden();
    if (d.returnValue === 'mit') kostenLaden();
  };
  d.showModal();
  f.betrag.focus();
});
$('#todo-liste').addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = e.target;
  const id = Number(f.closest('[data-id]').dataset.id);
  await api(`/api/admin/todos/${id}`, { method: 'PUT', body: { titel: f.titel.value, faellig: f.faellig.value, bereich: f.bereich.value, notiz: f.notiz.value } });
  todosLaden();
});
$('#todo-liste').addEventListener('click', async (e) => {
  if (!e.target.closest('[data-todo-weg]')) return;
  const id = Number(e.target.closest('[data-id]').dataset.id);
  if (!confirm('Dieses To-do löschen?')) return;
  await api(`/api/admin/todos/${id}`, { method: 'DELETE' });
  todosLaden();
});
$('#todo-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = e.target;
  try {
    await api('/api/admin/todos', { method: 'POST', body: { titel: f.titel.value, faellig: f.faellig.value, bereich: f.bereich.value, notiz: f.notiz.value } });
    f.reset(); todosLaden();
  } catch (err) { alert(err.message); }
});
$$('[data-todo-filter]').forEach((b) => b.addEventListener('click', () => {
  todoFilter = b.dataset.todoFilter;
  $$('[data-todo-filter]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
  todosZeichnen();
}));

/* Kosten, Geschenke und Tortendiagramm */
const FARBE = { Location: '#2e4636', Essen: '#a8864e', Trinken: '#4d7a7c', Personal: '#7a5c8e', Dienstleister: '#b0603c', Kleidung: '#8a3a51', Deko: '#5f9a6f', Papeterie: '#5b6f9a', Sonstiges: '#7d8578' };

function torte(k) {
  const summe = k.gesamt;
  const r = 80; const dicke = 30; const umfang = 2 * Math.PI * r;
  let start = 0;
  const teile = k.kategorien.map((name) => ({ name, cent: k.proKategorie[name] })).filter((t) => t.cent > 0).sort((a, b) => b.cent - a.cent);
  const boegen = teile.map((t) => {
    const anteil = t.cent / summe;
    const laenge = Math.max(0, anteil * umfang - (teile.length > 1 ? 2 : 0));
    const b = `<circle cx="100" cy="100" r="${r}" fill="none" stroke="${FARBE[t.name]}" stroke-width="${dicke}" stroke-dasharray="${laenge} ${umfang}" stroke-dashoffset="${-start * umfang}" transform="rotate(-90 100 100)"><title>${t.name}: ${eur(t.cent)} (${Math.round(anteil * 100)} %)</title></circle>`;
    start += anteil;
    return b;
  }).join('');
  const svg = $('#torte');
  svg.innerHTML = summe ? boegen : `<circle cx="100" cy="100" r="${r}" fill="none" stroke="#e7ede3" stroke-width="${dicke}"/>`;
  svg.setAttribute('aria-label', teile.map((t) => `${t.name} ${eur(t.cent)}`).join(', ') || 'Noch keine Kosten');
  $('#torte-mitte').innerHTML = `<strong>${eur(summe)}</strong><span>gesamt</span>`;
  $('#legende').innerHTML = k.kategorien.map((name) => {
    const cent = k.proKategorie[name];
    return `<li class="${cent ? '' : 'leer-kat'}"><span class="farbe" style="background:${FARBE[name]}"></span>${name}<b>${eur(cent)}</b><small>${summe ? Math.round((cent / summe) * 100) : 0} %</small></li>`;
  }).join('');
}

async function kostenLaden() {
  const k = await api('/api/admin/kosten');
  kategorien = k.kategorien;
  $$('#kosten-form [name="kategorie"]').forEach((s) => { s.innerHTML = k.kategorien.map((x) => `<option>${x}</option>`).join(''); });
  torte(k);
  $('#kosten-zahlen').innerHTML = `
    <dl class="kosten-kennzahlen">
      <div class="gross"><dt>Kosten pro zugesagtem Gast</dt><dd>${k.proGast != null ? eur(k.proGast) : 'noch keine Zusagen'}</dd><p class="hilfe">${eur(k.gesamt)} geteilt durch ${k.personen} ${k.personen === 1 ? 'Person' : 'Personen'} laut Antworten</p></div>
      <div><dt>Schon bezahlt</dt><dd>${eur(k.bezahlt)}</dd></div>
      <div><dt>Noch offen</dt><dd>${eur(k.offen)}</dd></div>
      <div><dt>Geldgeschenke</dt><dd>${eur(k.geld)}</dd></div>
      <div class="gross"><dt>Was ihr selbst zahlt</dt><dd>${eur(k.eigenanteil)}</dd><p class="hilfe">Kosten minus Geldgeschenke</p></div>
    </dl>`;
  $('#kosten-liste').innerHTML = k.kosten.map((x) => `
    <article class="zeile kosten-zeile" data-id="${x.id}">
      <span class="farbe" style="background:${FARBE[x.kategorie] || FARBE.Sonstiges}" aria-hidden="true"></span>
      <div class="zeile-name"><strong>${esc(x.titel)}</strong><small>${[x.wo, x.kategorie, tagDatum(x.datum)].filter(Boolean).map(esc).join(' · ')}</small></div>
      <div class="kosten-betrag">${eur(x.cent)}${x.bezahlt ? '' : '<span class="marke offen">offen</span>'}</div>
      <details class="todo-mehr"><summary>Bearbeiten</summary>
        <form class="kosten-edit raster">
          <label>Was?<input name="titel" value="${esc(x.titel)}"></label>
          <label>Wo?<input name="wo" value="${esc(x.wo)}"></label>
          <label>Betrag in €<input name="betrag" value="${zuEingabe(x.cent)}" inputmode="decimal"></label>
          <label>Kategorie<select name="kategorie">${k.kategorien.map((c) => `<option ${c === x.kategorie ? 'selected' : ''}>${c}</option>`).join('')}</select></label>
          <label>Datum<input type="date" name="datum" value="${esc(x.datum)}"></label>
          <label class="haken"><input type="checkbox" name="bezahlt" ${x.bezahlt ? 'checked' : ''}> bezahlt</label>
          <div class="reihe"><button class="knopf">Speichern</button><button type="button" class="knopf leise weg" data-kosten-weg>Löschen</button></div>
        </form>
      </details>
    </article>`).join('') || '<p class="leer">Noch keine Ausgaben.</p>';
  $('#geschenk-liste').innerHTML = k.geschenke.map((g) => `
    <article class="zeile geschenk-zeile" data-id="${g.id}">
      <div class="zeile-name"><strong>${esc(g.von)}</strong><small>${esc(g.art)}${g.notiz ? ` · ${esc(g.notiz)}` : ''}</small></div>
      <div class="kosten-betrag">${g.cent ? eur(g.cent) : ''}</div>
      <div class="aktionen"><button type="button" class="weg" data-geschenk-weg>Löschen</button></div>
    </article>`).join('') || '<p class="leer">Noch keine Geschenke eingetragen.</p>';
}

$('#kosten-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = e.target;
  try {
    await api('/api/admin/kosten', { method: 'POST', body: { titel: f.titel.value, wo: f.wo.value, betrag: f.betrag.value, kategorie: f.kategorie.value, datum: f.datum.value, bezahlt: f.bezahlt.checked } });
    f.reset(); f.bezahlt.checked = true; kostenLaden();
  } catch (err) { alert(err.message); }
});
$('#kosten-liste').addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = e.target;
  const id = f.closest('[data-id]').dataset.id;
  await api(`/api/admin/kosten/${id}`, { method: 'PUT', body: { titel: f.titel.value, wo: f.wo.value, betrag: f.betrag.value, kategorie: f.kategorie.value, datum: f.datum.value, bezahlt: f.bezahlt.checked } });
  kostenLaden();
});
$('#kosten-liste').addEventListener('click', async (e) => {
  if (!e.target.closest('[data-kosten-weg]')) return;
  if (!confirm('Diese Ausgabe löschen?')) return;
  await api(`/api/admin/kosten/${e.target.closest('[data-id]').dataset.id}`, { method: 'DELETE' });
  kostenLaden();
});
$('#geschenk-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = e.target;
  try {
    await api('/api/admin/geschenke', { method: 'POST', body: { von: f.von.value, art: f.art.value, betrag: f.betrag.value, notiz: f.notiz.value } });
    f.reset(); kostenLaden();
  } catch (err) { alert(err.message); }
});
$('#geschenk-liste').addEventListener('click', async (e) => {
  if (!e.target.closest('[data-geschenk-weg]')) return;
  if (!confirm('Dieses Geschenk löschen?')) return;
  await api(`/api/admin/geschenke/${e.target.closest('[data-id]').dataset.id}`, { method: 'DELETE' });
  kostenLaden();
});

/* Laden, wenn die Verwaltung startet oder ein Bereich geöffnet wird */
let gestartet = false;
document.addEventListener('reiter', (e) => {
  if (!gestartet) { gestartet = true; countdown().catch(() => {}); planLaden().catch(() => {}); todosLaden().catch(() => {}); }
  if (e.detail === 'todos') todosLaden().catch((x) => alert(x.message));
  if (e.detail === 'kosten') kostenLaden().catch((x) => alert(x.message));
  if (e.detail === 'gaesteliste') planLaden().catch(() => {});
});
document.addEventListener('antworten-geladen', () => { if (gestartet) planLaden().catch(() => {}); });
