# Quellenprobe

Ein Lernspiel für Studierende und Lehrende: KI-Antworten Aussage für Aussage gegen das Quellmaterial prüfen und typische Halluzinationsmuster erkennen. Statisch, ohne Backend, ohne API-Aufrufe, ohne Build-Schritt und ohne externe Requests. Komplett auf Deutsch.

---

**Lernziel:** KI-Antworten nicht blind vertrauen. Die Spielenden prüfen jede Aussage gegen das Quellmaterial und lernen dabei typische Halluzinationsmuster kennen.

**Ablauf**

1. Ein Level zeigt 1–3 kurze, fiktive Dokumente aus dem Hochschulalltag, etwa ein Sitzungsprotokoll, eine Pressemitteilung, ein Paper-Abstract, eine Software-Doku oder eine E-Mail. Dazu gibt es eine Nutzerfrage und eine fertige „KI-Antwort“, die als zusammenhängender Text in einer Sprechblase steht. Jeder ihrer 4–6 Sätze lässt sich antippen und so markieren.
2. In jeder Antwort sind 1–2 Aussagen nicht durch die Quelle gedeckt. Die Spielenden markieren sie und klicken auf **Auswerten**.
3. Die Auflösung zeigt für jede Aussage, ob sie richtig erkannt, übersehen oder fälschlich verdächtigt wurde. Bei Halluzinationen kommen Musterbezeichnung, Erklärung und Prüftipp dazu, außerdem wird die entscheidende Quellstelle hervorgehoben. Bei korrekten Aussagen lässt sich die stützende Stelle anzeigen.

**Punkte:** +2 je gefundene Halluzination, −1 je Fehlalarm, 0 je übersehene Halluzination. Fehlerfreie Level verlängern die Serie.
**Levelauswahl:** zufällig, ohne Levelanstieg. Innerhalb einer Sitzung wiederholt sich kein Level, bis der (gefilterte) Pool durch ist.
**Filter:** Schwierigkeit (leicht/mittel/schwer) und Muster (Mehrfachauswahl). Standard ist „alle“.
**Zwischenbilanz:** Nach je 5 Leveln zeigt das Spiel, welche Muster gut erkannt und welche übersehen wurden, und stellt eine Reflexionsfrage.
**Beispiel:** Die Startseite erklärt das Spiel in vier Schritten an einem kleinen, festen Beispiel (Aushang der Bibliothek, KI-Antwort mit einem erfundenen Samstag).
**Speicher:** Highscore, beste Serie und Musterstatistik liegen im `localStorage` des Browsers. Es wird nichts übertragen, und der Fortschritt lässt sich auf der Startseite zurücksetzen.

## Die 10 Muster (`data/patterns.json`)

| id | Muster |
|---|---|
| `zahl` | Falsches Datum oder falsche Zahl |
| `fehlende-quelle` | Fehlende Quelle |
| `verwechslung` | Gleicher Name, anderes Ding |
| `geplant` | Geplant vs. umgesetzt |
| `zitation` | Erfundene Zitation |
| `teilweise` | Nur teilweise gestützt |
| `veraltet` | Veraltete Information |
| `echo` | Sekundäres Echo |
| `korrelation` | Korrelationsfalle |
| `schlagzeile` | Überdehnte Schlagzeile |

---

## Lokal starten

Die Spieldaten werden per `fetch` geladen. Deshalb muss die Seite über einen Webserver laufen, ein Doppelklick auf `index.html` (`file://`) reicht nicht. Im Repo-Root:

```bash
python3 -m http.server 8000
```

(Unter Windows ggf. `python -m http.server 8000` oder `py -m http.server 8000`.)

Danach im Browser öffnen: <http://localhost:8000/>.

---

## Level ergänzen

Level stehen in `data/levels.json`, einem Array von Objekten:

```json
{
  "id": "L31",
  "schwierigkeit": "mittel",
  "thema": "bibliothek",
  "quellen": [
    { "titel": "…", "typ": "E-Mail", "text": "80–200 Wörter …" }
  ],
  "frage": "Die Nutzerfrage an die KI",
  "aussagen": [
    { "id": "a1", "text": "Korrekte Aussage", "halluzination": false,
      "erklaerung": "Kurz, warum sie gedeckt ist.", "beleg": "wörtliches Zitat aus text" },
    { "id": "a2", "text": "Nicht gedeckte Aussage", "halluzination": true, "muster": "geplant",
      "erklaerung": "1–2 Sätze, warum sie nicht gedeckt ist.", "beleg": "entscheidende Stelle, wörtlich" }
  ]
}
```

**Regeln**

- `schwierigkeit`: `leicht` | `mittel` | `schwer`
- `thema`: `pruefungsordnung` | `forschung` | `mensa` | `bibliothek` | `it-dienste` | `studienorganisation`
- 1–3 Quellen mit je 80–200 Wörtern, 4–6 Aussagen, davon **1–2** mit `"halluzination": true`.
- `muster` nur bei Halluzinationen, und nur mit einer `id` aus `patterns.json`.
- `beleg` muss **zeichengenau** in einem der Quelltexte vorkommen (Satzzeichen, Anführungszeichen „…“ und Leerzeichen eingeschlossen), sonst klappt die Hervorhebung nicht.
- Ob eine Aussage stimmt, muss sich allein aus dem Quellmaterial ergeben, nicht aus Weltwissen.
- Halluzinationen sollen plausibel klingen: gleicher Ton und Wortschatz wie die korrekten Aussagen.
- Alle Quellen sind fiktiv. Keine echten Personen.

Neue Themen ergänzt man in `scripts/validate-levels.mjs` (`THEMEN`) und in `js/i18n.js` (`themen`).

---

## Validierung ausführen

Das Skript braucht nur Node.js (ab Version 18) und keine weiteren Pakete. Im Repo-Root:

```bash
node scripts/validate-levels.mjs
```

Es prüft:

- das Schema: Pflichtfelder, erlaubte Werte, 1–3 Quellen, 4–6 Aussagen, 80–200 Wörter je Quelle
- eindeutige Level-IDs und eindeutige Aussagen-IDs pro Level
- gültige Muster-IDs
- 1–2 Halluzinationen pro Level
- ob jeder `beleg` exakt im Quelltext vorkommt
- ob jedes Muster mindestens zweimal vorkommt

Bei Fehlern endet das Skript mit Exit-Code 1. Hinweise (etwa wenn `text` und `beleg` identisch sind) brechen nicht ab.

---

## Auf GitHub Pages veröffentlichen

Die drei Lernspiele liegen nebeneinander in einem gemeinsamen Repository:

```
<repo>/KI-Lernspiele/quellenprobe/
<repo>/KI-Lernspiele/leitstelle/
<repo>/KI-Lernspiele/wortnetz/
```

1. Den Ordner `quellenprobe` mit seinem ganzen Inhalt nach `KI-Lernspiele/quellenprobe/` ins Repository legen (Weboberfläche: **Add file → Upload files**, oder per `git add` und `git push`).
2. Falls GitHub Pages für das Repository noch nicht läuft: **Settings → Pages**, Source „Deploy from a branch“, Branch `main`, Ordner `/ (root)`.
3. Das Spiel ist dann erreichbar unter `https://<benutzername>.github.io/<repo>/KI-Lernspiele/quellenprobe/`. Groß-/Kleinschreibung zählt.

Alle Pfade sind relativ, deshalb funktioniert das Spiel unter jedem Unterpfad. Die Links „Weitere Lernspiele“ im Seitenfuß zeigen auf die Nachbarordner (`../quellenprobe/`, `../leitstelle/`, `../wortnetz/`) und funktionieren, solange die drei Ordner nebeneinanderliegen.

Ein Doppelklick auf `index.html` reicht nicht: Browser blockieren beim Öffnen von der Festplatte das Nachladen der Daten. Lokal also immer über einen kleinen Webserver starten (siehe „Lokal starten“).

---

## Barrierearmut

- Vollständig per Tastatur bedienbar. Aussagen sind Umschaltknöpfe (`aria-pressed`), der Fokus ist sichtbar.
- Die Auswertung wird über eine `aria-live`-Region angesagt, und der Fokus springt zur Auswertung.
- Ergebnisse sind nicht nur farbig markiert, sondern zusätzlich mit Icon und Text („Richtig erkannt“, „Übersehen“, „Fälschlich verdächtigt“, „Korrekt belegt“).
- Die Kontraste von Text und Bedienelementen liegen bei mindestens 4,5:1.
- `prefers-reduced-motion` wird berücksichtigt.

## Inspiration

Die Grundidee, KI-Aussagen einzeln gegen eine Quelle zu prüfen, ist vom Spiel **„Hallucination Hunt“** angeregt. *Quellenprobe* ist ein eigenständiges Spiel: Namen, Texte, Level, Muster-Systematik und Gestaltung sind neu entwickelt und nicht übernommen.

## Hinweis

Alle Szenarien in diesem Spiel sind **immer frei erfunden**: Personen, Dokumente, Einrichtungen, Termine und Zahlen gibt es so nicht. Ähnlichkeiten mit realen Personen oder Vorgängen sind nicht beabsichtigt. Das Spiel weist auf der Startseite und im Seitenfuß darauf hin.
