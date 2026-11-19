# Hinweise für KI-Assistenten

Dieses Projekt ist der "Wedding Planner": eine Hochzeitsseite mit Verwaltung. Node.js 24 ohne Framework, kein Build-Schritt, Daten in SQLite (`node:sqlite`), einzige Abhängigkeit zur Laufzeit ist `qrcode`. Alles läuft in einem Docker-Container. Die Oberfläche ist auf Deutsch.

## Starten und prüfen

```bash
docker compose up -d --build     # mit "build: ." in der docker-compose.yml statt "image:"
```

Danach `http://localhost:8080` (Gäste) und `http://localhost:8080/admin` (Verwaltung). Das Passwort für `/admin` legst du beim ersten Öffnen fest, oder du setzt `ADMIN_PASSWORD` in der Compose-Datei. Prüfe jede Änderung im Browser, auch in schmaler Handy-Breite (375 px). Aufräumen: `docker compose down` (das Volume mit den Daten bleibt).

## Aufbau

| Datei | Aufgabe |
| --- | --- |
| `server.js` | HTTP-Server, Startwerte der Angaben (`DEFAULTS`), Antworten (`/api/rsvp`), Anmeldung der Verwaltung, Kalenderdatei, Impressum und Datenschutz (`rechtsSeite`) |
| `seiten.js` | Rahmen aller Gästeseiten: Kopf, Menü (`MENUE`), Fuß. Namen und Titel kommen aus den Angaben |
| `inhalte.js` | Fotos, Geschichte, Quiz (Sammlungen) und Sitzplan, dazu Beispielinhalte beim ersten Start |
| `planung.js` | Gästeliste, Einladungskarten, To-dos (mit Beispiel-Checkliste), Kosten, Geschenke |
| `gaestefotos.js` | Fotos der Gäste: Abschnitte, Upload (`POST /api/gaestefotos`), Galerie, ZIP-Download, QR-Codes und Druckvorlage. Ablage in `/data/gaestefotos/<abschnitt>/` |
| `public/style.css` | Gesamtes Aussehen der Gästeseiten. Farben, Schriften und Rundungen stehen oben unter `:root`. Drei Farben kann die Verwaltung überschreiben (Schlüssel `design_akzent`, `design_grund`, `design_text` in den Angaben): `seiten.js` gibt sie als `<style>` direkt nach `style.css` aus und leitet Abstufungen ab. Die Standardwerte in `style.css` und in `public/admin.js` (`FARBEN`) müssen übereinstimmen |
| `public/seiten/*.html` | Inhalt der Gästeseiten (ohne Kopf und Fuß). Startseite: `start.html` |
| `public/app.js` | Logik der Startseite: lädt `/api/info`, füllt die Felder, steuert das Antwortformular |
| `public/js/*.js` | Skripte der Unterseiten (`geschichte.js`, `quiz.js`, `kontakt.js`), `basis.js` (Menü, Hilfen) und die Skripte der Verwaltung (`admin-*.js`) |
| `public/admin.html`, `admin.css`, `admin.js` | Verwaltung |
| `Dockerfile` | Baut das Image und kopiert die Schriften aus `@fontsource` nach `public/fonts` |

## Regeln

- **Nur ändern, was verlangt wird.** Die Verwaltung unter `/admin` nur anfassen, wenn der Nutzer es ausdrücklich möchte.
- **`data-feld`-Attribute und `id`s in den HTML-Dateien nicht umbenennen oder löschen.** Die Skripte (`app.js`, `js/*.js`) finden ihre Elemente darüber. Neue Elemente und neues Styling sind frei, bestehende Felder bleiben.
- **Aussehen ändert man in `public/style.css`.** Zuerst die Variablen unter `:root`, dann die Regeln. Neue Bilder kommen nach `public/img` (werden ein Jahr lang gecacht, bei Austausch einen neuen Dateinamen wählen).
- **Datenschutz:** keine Schriften, Skripte, Karten oder Analyse-Tools von fremden Servern einbinden. Schriften liegen lokal in `/fonts`. Keine Cookies für Gäste.
- **Keine neuen Abhängigkeiten und kein Build-Schritt.** Reines HTML, CSS und JavaScript im Browser, Node ohne Framework auf dem Server.
- **Sprache:** Texte für Gäste auf Deutsch, Ansprache mit "ihr". Keine Gendersternchen mit Doppelpunkt.
- **`VERSION` in `server.js` hochzählen**, wenn Dateien in `public/` geändert wurden. Sie wird als `?v=` an CSS und JS gehängt, sonst zeigen Browser die alte Fassung.
- **Daten schützen:** Das Volume `/data` enthält die echten Antworten der Gäste. Nie löschen, nie in den Quellcode übernehmen, nie committen.

## Angaben des Paars

Namen, Termine, Orte, Texte, Kontakt, Impressum stehen in der Tabelle `settings`. Die Startwerte und alle erlaubten Schlüssel stehen in `server.js` unter `DEFAULTS`. Sie werden in der Verwaltung (Reiter "Angaben") geändert und über `/api/info` an die Startseite geliefert. Ein neues Feld braucht drei Stellen: `DEFAULTS`, `publicInfo()` in `server.js` und ein Eingabefeld in `public/admin.html`.

## Eine neue Seite anlegen

1. `public/seiten/anfahrt.html` mit dem Inhalt (ohne Kopf und Fuß, Vorbild: `kontakt.html`)
2. In `seiten.js`: Eintrag in `MENUE`, in `titelVon` und in `SKRIPTE` (falls ein Skript nötig ist, unter `public/js/`)
3. In `server.js`: Name in die Liste `UNTERSEITEN` aufnehmen

## Datenbank und Schnittstellen

- Tabellen: `settings`, `responses` (Antworten), `invites` (optionale persönliche Einladungslinks `/p/CODE`), `einladung` (Gästeliste), `todos`, `kosten`, `geschenke`, `geschichte`, `quiz`, `fotos`, `tische`, `sitz`, `gast_info`, `gaeste_extra`, `foto_abschnitte`, `gaestefotos`, `users`, `sessions`
- Fotoseite: Einstellung `galerie_zugang` (`offen` oder `qr`). Bei `qr` brauchen Liste, Upload und Bilder den Schlüssel aus den QR-Codes (`?z=` oder Header `X-Zugang`). Der Schlüssel steht in `settings` unter `galerie_schluessel`, bewusst nicht in `DEFAULTS`, und kommt nie über `/api/info`. Die Gästeseite speichert ihn im localStorage, nicht als Cookie
- Öffentlich: `GET /api/info`, `GET /api/seite`, `POST /api/rsvp`, `GET /kalender.ics`, `GET` und `POST /api/gaestefotos`, Fotos unter `/gaestefotos/<id>.jpg`
- Verwaltung unter `/api/admin/...`, nur mit Anmeldung (Cookie `hz_s`)
- Neue Spalten werden beim Start mit `ALTER TABLE ... ADD COLUMN` ergänzt, wenn sie fehlen (Beispiele in `planung.js`). Bestehende Daten dürfen dabei nie verloren gehen.
