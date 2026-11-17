# Leitstelle

Ein Lernspiel für Studierende und Lehrende: die Werkzeugkette eines KI-Agenten planen und dabei lernen, wann ein Werkzeug nötig ist, warum die Reihenfolge zählt und warum vor jeder Aktion nach außen ein Mensch freigeben muss. Statisch, ohne Backend, ohne API-Aufrufe, ohne Build-Schritt und ohne externe Requests. Oberfläche auf Deutsch.

---

**Lernziel:** verstehen, wie KI-Agenten planen und Werkzeuge nutzen. Die Spielenden lernen, wann ein Werkzeug nötig ist und wann nicht, warum die Reihenfolge zählt und warum vor jeder Aktion nach außen ein Mensch freigeben muss.

**Ablauf**

1. Eine Mission besteht aus einem Auftrag und dem Material, das dem Agenten schon vorliegt, zum Beispiel einer Mail, einem Speiseplan oder einer Notenübersicht.
2. Die Spielenden bauen eine Kette aus 0–6 Werkzeugschritten. Das geht per Antippen oder per Drag-and-drop, Schritte lassen sich mit ↑ ↓ ✕ verschieben und entfernen. Auch eine leere Kette ist eine gültige Lösung.
3. **Mission starten** spielt die Kette als Simulation ab. Im Protokoll erscheint zu jedem Schritt eine Beobachtung.
4. Die Auswertung vergibt je 0–3 Sterne für:
   - **Erfolg:** Sind alle nötigen Werkzeuge in der richtigen Reihenfolge dabei, und keine verbotenen?
   - **Effizienz:** Gibt es unnötige oder doppelte Schritte?
   - **Sicherheit:** Gab es vor jeder Aktion mit hohem Risiko eine menschliche Prüfung, ohne dass danach noch etwas geändert wurde?
5. Danach folgt ein Debrief: Was hätte ein guter Agent getan, und welche typischen Fehler kamen vor?

**Missionen:** 100 Stück aus Studium, Hochschulverwaltung und Alltag, verteilt auf sieben Typen und 13 Themen. 37 Missionen brauchen vier oder mehr verschiedene Werkzeuge, nur 19 kommen mit einem einzigen aus (die zehn Overkill-Fallen eingeschlossen), zwei (M89 „Familienfeier planen“, M90 „Neue Mitarbeiterin einarbeiten“) alle sieben. Die Typen: `kein-werkzeug`, `nachschlagen`, `rechnen`, `riskant`, `reihenfolge`, `mehrstufig` (2–3 Stufen, das Ergebnis einer Stufe wird zum Material der nächsten) und `overkill`.
**Auswahl:** zufällig, ohne Wiederholung, bis der gefilterte Pool durch ist. Filtern lässt sich nach Schwierigkeit und Missionstyp. Der Typ wird erst im Debrief angezeigt, weil er sonst die Lösung verrät.
**Zwischenbilanz:** nach je 5 Missionen, mit Sternen je Dimension und einer Reflexionsfrage.
**Speicher:** Statistik und Bestwerte liegen im `localStorage` und lassen sich zurücksetzen.

## Werkzeuge (`data/tools.json`)

| id | Name | Risiko |
|---|---|---|
| `entwurf` | Entwurf erstellen | niedrig |
| `suche` | Suche | niedrig |
| `rechner` | Rechner | niedrig |
| `datei` | Datei lesen | niedrig |
| `kalender` | Kalender prüfen | niedrig |
| `pruefung` | Menschliche Prüfung | niedrig |
| `senden` | Senden / Ausführen | **hoch** |

## Regel-Engine

Die Bewertung steckt in der reinen Funktion `evaluate(mission, chain, { stage })` in `js/evaluate.js`. Sie hat keine Abhängigkeiten zum DOM und läuft im Browser wie in Node.

- **Erfolg:** 3 Sterne minus 2 je fehlendem Pflichtwerkzeug, minus 2 je verbotenem Werkzeug und minus 1 je verletzter Reihenfolge. Eine fehlende Prüfung zählt nur bei der Sicherheit, wenn sie allein der Freigabe dient.
- **Effizienz:** 3 Sterne minus die Zahl der überflüssigen Schritte, also Schritte über `optimalLength` hinaus oder Werkzeuge, die nicht in `required` stehen.
- **Sicherheit:** 0 Sterne, wenn ein Werkzeug mit hohem Risiko ohne vorherige Prüfung läuft oder wenn nach der Prüfung noch ein Entwurf entsteht. Höchstens 1 Stern, wenn eine riskante Aktion gar nicht beauftragt war.

---

## Lokal starten

Die Spieldaten werden per `fetch` geladen. Deshalb muss die Seite über einen Webserver laufen, ein Doppelklick auf `index.html` (`file://`) reicht nicht. Im Repo-Root:

```bash
python3 -m http.server 8000
```

(Unter Windows ggf. `python -m http.server 8000` oder `py -m http.server 8000`.)

Danach im Browser öffnen: <http://localhost:8000/>.

---

## Missionen ergänzen

Missionen stehen in `data/missions.json`, einem Array von Objekten. Eine einstufige Mission sieht so aus:

```json
{
  "id": "M31",
  "titel": "Sprechstunde verschieben",
  "typ": "riskant",
  "schwierigkeit": "mittel",
  "thema": "mail",
  "ziel": "Die Studierenden geprüft über die neue Sprechstunde informieren.",
  "stufen": [{
    "auftrag": "Informiere die Studierenden im Lernportal, dass die Sprechstunde am Donnerstag auf 15 Uhr verschoben ist.",
    "material": [{ "titel": "Notiz", "text": "Sprechstunde Do. 15 statt 13 Uhr, Raum unverändert." }],
    "regeln": {
      "required": ["entwurf", "pruefung", "senden"],
      "forbidden": [],
      "order": [["entwurf", "pruefung"], ["pruefung", "senden"]],
      "reviewBeforeHighRisk": true,
      "optimalLength": 3
    },
    "observations": {
      "entwurf": "Entwurf erstellen: Kurze Ankündigung formuliert.",
      "pruefung": "Menschliche Prüfung: Freigegeben.",
      "senden": "Senden / Ausführen: Ankündigung veröffentlicht.",
      "standard": "{werkzeug}: Für diese Ankündigung nicht nötig."
    },
    "ergebnis": "Geprüfte Ankündigung zur neuen Sprechstunde veröffentlicht.",
    "beispiel": ["entwurf", "pruefung", "senden"],
    "debrief": "Was ein guter Agent getan hätte – und warum.",
    "typischeFehler": [
      { "bedingung": { "typ": "ohneFreigabe" }, "text": "Ungeprüft veröffentlicht." }
    ]
  }]
}
```

**Felder und Regeln**

- `typ`: `kein-werkzeug` | `nachschlagen` | `rechnen` | `riskant` | `reihenfolge` | `mehrstufig` | `overkill`. Nur `mehrstufig` hat 2–3 Einträge in `stufen`, alle anderen Typen genau einen.
- `schwierigkeit`: `leicht` | `mittel` | `schwer`
- `thema`: `raumbuchung` | `noten` | `mail` | `literatur` | `mensa` | `pruefungsanmeldung` | `reisekosten` | `veranstaltung` | `bibliothek` | `studienorganisation` | `it` | `verwaltung` | `alltag` (neue Themen in `js/app.js` unter `THEMEN` und im Validator ergänzen)
- `regeln.required`: Werkzeuge, die nötig sind. Wird ein Werkzeug mehrfach gebraucht, steht es mehrfach drin.
- `regeln.forbidden`: Werkzeuge, die den Auftrag verfehlen, etwa `senden`, wenn nur gefunden und nicht gebucht werden soll.
- `regeln.order`: Paare `[A, B]` bedeuten, dass jedes B ein A davor braucht. Beide Werkzeuge müssen in `required` stehen, und die Paare dürfen keinen Zyklus bilden.
- `regeln.reviewBeforeHighRisk`: Bei `true` braucht jedes `senden` eine `pruefung` davor, ohne `entwurf` dazwischen. `false` passt nur, wenn die Freigabe schon im Material liegt.
- `regeln.optimalLength`: die Länge der kürzesten perfekten Kette.
- `observations`: Protokolltexte je Werkzeug. `standard` ist Pflicht und gilt für alle übrigen Werkzeuge, `{werkzeug}` wird dabei durch den Werkzeugnamen ersetzt.
- `typischeFehler[].bedingung`: `fehlt` / `enthaelt` (mit `werkzeug`), `reihenfolge` (mit `a`, `b`), `ohneFreigabe`, `geaendertNachFreigabe`, `leer`, `zuLang` sowie `und` / `oder` (mit `bedingungen`).
- `beispiel`: eine Musterkette, die drei Sterne in allen Dimensionen erreicht.
- Bei mehrstufigen Missionen wird das `ergebnis` einer Stufe zum Material der nächsten.

---

## Validierung ausführen

Auch dieses Skript braucht nur Node.js ab Version 18. Im Repo-Root:

```bash
node scripts/validate-missions.mjs
```

```bash
node scripts/test-evaluate.mjs
```

Der Validator prüft das Schema, gültige Werkzeug-IDs und widerspruchsfreie Regeln, zum Beispiel ob ein Werkzeug zugleich nötig und verboten ist, ob die Reihenfolge Zyklen enthält und ob `optimalLength` passt. Danach probiert er per Brute Force alle Ketten bis Länge 6 mit `evaluate` aus, rund 137.000 je Stufe, und stellt sicher:

- jede Stufe hat mindestens eine Lösung mit voller Punktzahl,
- die kürzeste dieser Lösungen ist genau `optimalLength` lang,
- `beispiel` ist eine solche Lösung,
- jeder typische Fehler lässt sich auslösen und trifft nie auf eine perfekte Kette zu,
- jeder Typ ist mindestens viermal vertreten.

`test-evaluate.mjs` enthält Unit-Tests für die Regel-Engine. Bei Fehlern enden beide Skripte mit Exit-Code 1.

---

## Auf GitHub Pages veröffentlichen

Die drei Lernspiele liegen nebeneinander in einem gemeinsamen Repository:

```
<repo>/KI-Lernspiele/quellenprobe/
<repo>/KI-Lernspiele/leitstelle/
<repo>/KI-Lernspiele/wortnetz/
```

1. Den Ordner `leitstelle` mit seinem ganzen Inhalt nach `KI-Lernspiele/leitstelle/` ins Repository legen (Weboberfläche: **Add file → Upload files**, oder per `git add` und `git push`).
2. Falls GitHub Pages für das Repository noch nicht läuft: **Settings → Pages**, Source „Deploy from a branch“, Branch `main`, Ordner `/ (root)`.
3. Das Spiel ist dann erreichbar unter `https://<benutzername>.github.io/<repo>/KI-Lernspiele/leitstelle/`. Groß-/Kleinschreibung zählt.

Alle Pfade sind relativ, deshalb funktioniert das Spiel unter jedem Unterpfad. Die Links „Weitere Lernspiele“ im Seitenfuß zeigen auf die Nachbarordner (`../quellenprobe/`, `../leitstelle/`, `../wortnetz/`) und funktionieren, solange die drei Ordner nebeneinanderliegen.

Ein Doppelklick auf `index.html` reicht nicht: Browser blockieren beim Öffnen von der Festplatte das Nachladen der Daten. Lokal also immer über einen kleinen Webserver starten (siehe „Lokal starten“).

---

## Barrierearmut

- Vollständig per Tastatur bedienbar: Werkzeuge per Knopf hinzufügen, Schritte mit ↑ ↓ ✕ verschieben und entfernen. Drag-and-drop ist nur eine zusätzliche Möglichkeit.
- Protokoll und Auswertung werden über `aria-live`-Regionen angesagt, der Fokus springt zur Auswertung.
- Sterne sind zusätzlich als Text angegeben („2 von 3 Sternen“).
- `prefers-reduced-motion` wird berücksichtigt.

## Inspiration

Die Idee, die Werkzeugkette eines KI-Agenten zu planen und bewerten zu lassen, ist vom Spiel **„Agent Mission“** angeregt. *Leitstelle* ist ein eigenständiges Spiel: Namen, Texte, Missionen, Werkzeuge, Bewertungslogik und Gestaltung sind neu entwickelt.

## Hinweis

Alle Szenarien in diesem Spiel sind **immer frei erfunden**: Personen, Dokumente, Einrichtungen, Termine und Zahlen gibt es so nicht. Ähnlichkeiten mit realen Personen oder Vorgängen sind nicht beabsichtigt. Das Spiel weist auf der Startseite und im Seitenfuß darauf hin.
