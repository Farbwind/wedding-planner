// Auf jeder Seite: Menü am Handy und Hilfen für die Unterseiten.

(function menue() {
  const kopf = document.querySelector('.kopf');
  const knopf = kopf?.querySelector('.menue-knopf');
  if (!knopf) return;
  const setzen = (offen) => {
    kopf.classList.toggle('offen', offen);
    knopf.setAttribute('aria-expanded', String(offen));
    document.documentElement.classList.toggle('menue-offen', offen);
  };
  knopf.addEventListener('click', () => setzen(!kopf.classList.contains('offen')));
  kopf.querySelectorAll('.hauptmenue a').forEach((a) => a.addEventListener('click', () => setzen(false)));
  addEventListener('keydown', (e) => { if (e.key === 'Escape' && kopf.classList.contains('offen')) { setzen(false); knopf.focus(); } });
})();

// Hilfen für die Unterseiten
window.hz = {
  esc: (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]),
  absaetze: (t) => String(t ?? '').split(/\n{2,}/).map((a) => `<p>${window.hz.esc(a).replace(/\n/g, '<br>')}</p>`).join(''),
  datum: (s) => new Date(s.replace(' ', 'T') + 'Z').toLocaleDateString('de-DE', { day: 'numeric', month: 'long', year: 'numeric' }),
  async daten() {
    const r = await fetch('/api/seite');
    if (!r.ok) throw new Error('Laden fehlgeschlagen');
    return r.json();
  },
};
