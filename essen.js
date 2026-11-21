// Essenswünsche pro Person. Neue Antworten haben eine Personenliste (Spalte responses.personen, JSON),
// alte Antworten nur Haken für die ganze Anmeldung (vegetarian, vegan). Beides wird hier einheitlich gelesen und gezählt.

export const KOST = ['', 'vegetarisch', 'vegan'];

// Personenliste einer Antwort oder null bei alten Antworten
export function personenVon(r) {
  try {
    const l = JSON.parse(r?.personen || '[]');
    if (Array.isArray(l) && l.length) return l.map((p) => ({ name: String(p.name || ''), kost: KOST.includes(p.kost) ? p.kost : '', hinweis: String(p.hinweis || '') }));
  } catch { /* alte Antwort */ }
  return null;
}

// Zusagen: Personen mit vegetarischem oder veganem Wunsch. Ein alter Haken zählt als eine Person (mindestens).
export function kostZahlen(antworten) {
  let vegetarisch = 0; let vegan = 0;
  for (const r of antworten.filter((x) => x.attending)) {
    const l = personenVon(r);
    if (l) { vegetarisch += l.filter((p) => p.kost === 'vegetarisch').length; vegan += l.filter((p) => p.kost === 'vegan').length; }
    else { vegetarisch += r.vegetarian ? 1 : 0; vegan += r.vegan ? 1 : 0; }
  }
  return { vegetarisch, vegan };
}

// Eingabe des Gasts prüfen: genau `anzahl` Einträge, Texte gekürzt, Essenswunsch nur aus der Liste
export function bereinigen(liste, anzahl, kuerzen) {
  const aus = [];
  for (let i = 0; i < anzahl; i++) {
    const p = Array.isArray(liste) ? liste[i] || {} : {};
    aus.push({ name: kuerzen(p.name, 80), kost: KOST.includes(p.kost) ? p.kost : '', hinweis: kuerzen(p.hinweis, 120) });
  }
  return aus;
}
