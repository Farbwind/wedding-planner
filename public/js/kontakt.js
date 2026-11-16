// Kontakt: das Brautpaar und die Trauzeugen
const { esc } = window.hz;
const box = document.querySelector('[data-feld="kontakte"]');

const wege = (k) => [
  k.tel && `<a href="tel:${esc(k.tel.replace(/[^\d+]/g, ''))}"><svg aria-hidden="true"><use href="#telefon"/></svg>${esc(k.tel)}</a>`,
  k.mail && `<a href="mailto:${esc(k.mail)}"><svg aria-hidden="true"><use href="#brief"/></svg>${esc(k.mail)}</a>`,
].filter(Boolean).join('');

try {
  const i = await (await fetch('/api/info')).json();
  const karten = [
    `<section class="kontakt kontakt-paar">
      <h2>${esc(i.paar.namen)}</h2>
      <p class="kontakt-rolle">Das Brautpaar</p>
      <div class="kontakt-wege">${wege(i.paar)}</div>
    </section>`,
  ];
  if (i.trauzeugen.length) {
    karten.push(`<section class="kontakt kontakt-tz">
      <h2>Unsere Trauzeugen</h2>
      <p class="kontakt-rolle">Für Fragen und alle Überraschungen, von denen wir nichts wissen sollen</p>
      <ul>${i.trauzeugen.map((t) => `<li><strong>${esc(t.name)}</strong>${t.rolle ? `<span class="kontakt-person-rolle">${esc(t.rolle)}</span>` : ''}<div class="kontakt-wege">${wege(t)}</div></li>`).join('')}</ul>
    </section>`);
  }
  box.innerHTML = karten.join('');
} catch {
  box.innerHTML = '<p class="fehler">Die Kontakte konnten nicht geladen werden.</p>';
}
