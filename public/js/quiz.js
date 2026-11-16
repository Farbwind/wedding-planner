// Quiz über uns: eine Frage nach der anderen, Auswertung am Ende
const { esc, daten } = window.hz;
const box = document.querySelector('[data-feld="quiz"]');
let fragen = [];
let nr = 0;
let punkte = 0;

const urteil = (p, n) => {
  const q = p / n;
  if (q === 1) return 'Volltreffer! Ihr kennt uns wirklich gut.';
  if (q >= 0.7) return 'Stark! Ihr kennt uns ziemlich gut.';
  if (q >= 0.4) return 'Nicht schlecht. Auf der Hochzeit erzählen wir euch den Rest.';
  return 'Da ist noch Luft nach oben. Perfekter Anlass, uns besser kennenzulernen.';
};

// Antworten bei jedem Spiel neu mischen, die richtige steht in der Verwaltung oft an erster Stelle
const mischen = (liste) => { const a = [...liste]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

function zeigeFrage() {
  const f = fragen[nr];
  const reihe = mischen(f.antworten.map((text, i) => ({ text, i })));
  box.innerHTML = `
    <div class="quiz-karte">
      <p class="quiz-stand">Frage ${nr + 1} von ${fragen.length}</p>
      <div class="quiz-balken" aria-hidden="true"><span style="width:${(nr / fragen.length) * 100}%"></span></div>
      <h2>${esc(f.frage)}</h2>
      <div class="quiz-antworten">
        ${reihe.map((a) => `<button type="button" class="quiz-antwort" data-i="${a.i}">${esc(a.text)}</button>`).join('')}
      </div>
      <p class="quiz-erklaerung" hidden></p>
      <button type="button" class="knopf quiz-weiter" hidden>${nr + 1 < fragen.length ? 'Nächste Frage' : 'Auswertung'}</button>
    </div>`;
  box.querySelector('.quiz-antworten').addEventListener('click', (e) => {
    const k = e.target.closest('.quiz-antwort');
    if (!k || box.querySelector('.quiz-antworten').dataset.fertig) return;
    box.querySelector('.quiz-antworten').dataset.fertig = '1';
    const gewaehlt = Number(k.dataset.i);
    const richtig = gewaehlt === f.richtig;
    if (richtig) punkte++;
    box.querySelectorAll('.quiz-antwort').forEach((b) => {
      b.disabled = true;
      if (Number(b.dataset.i) === f.richtig) b.classList.add('richtig');
      else if (b === k) b.classList.add('falsch');
    });
    const erk = box.querySelector('.quiz-erklaerung');
    erk.textContent = `${richtig ? 'Richtig!' : 'Leider nicht.'} ${f.erklaerung || ''}`.trim();
    erk.hidden = false;
    const weiter = box.querySelector('.quiz-weiter');
    weiter.hidden = false;
    weiter.focus();
  });
  box.querySelector('.quiz-weiter').addEventListener('click', () => {
    nr++;
    if (nr < fragen.length) zeigeFrage(); else zeigeErgebnis();
  });
}

function zeigeErgebnis() {
  box.innerHTML = `
    <div class="quiz-karte quiz-ergebnis">
      <p class="quiz-punkte"><strong>${punkte}</strong> von ${fragen.length}</p>
      <h2>${esc(urteil(punkte, fragen.length))}</h2>
      <button type="button" class="knopf-leise quiz-neu">Noch einmal spielen</button>
    </div>`;
  box.querySelector('.quiz-neu').addEventListener('click', () => { nr = 0; punkte = 0; zeigeFrage(); });
}

try {
  ({ quiz: fragen } = await daten());
  fragen = fragen.filter((f) => f.frage && f.antworten.length >= 2);
  if (!fragen.length) document.querySelector('[data-feld="leer"]').hidden = false;
  else zeigeFrage();
} catch {
  box.innerHTML = '<p class="fehler">Das Quiz konnte nicht geladen werden. Bitte später noch einmal versuchen.</p>';
}
