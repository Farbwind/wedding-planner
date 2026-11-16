// Unsere Geschichte: Stationen als Zeitleiste mit Foto
const { esc, absaetze, daten } = window.hz;
const liste = document.querySelector('[data-feld="zeitleiste"]');

try {
  const { geschichte } = await daten();
  if (!geschichte.length) document.querySelector('[data-feld="leer"]').hidden = false;
  liste.innerHTML = geschichte.map((g, i) => `
    <li class="kapitel${i % 2 ? ' rechts' : ''}">
      ${g.bild
        ? `<figure class="kapitel-bild"><img src="/bilder/${esc(g.bild)}" alt="${esc(g.titel)}" loading="lazy"></figure>`
        : '<figure class="kapitel-bild kapitel-platzhalter" aria-hidden="true"><svg><use href="#kamera"/></svg><span>Foto folgt</span></figure>'}
      <div class="kapitel-text">
        ${g.zeit ? `<p class="kapitel-zeit">${esc(g.zeit)}</p>` : ''}
        <h2>${esc(g.titel)}</h2>
        ${absaetze(g.text)}
      </div>
    </li>`).join('');
} catch {
  liste.innerHTML = '<li class="fehler">Die Geschichte konnte nicht geladen werden. Bitte später noch einmal versuchen.</li>';
}
