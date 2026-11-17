# Wortnetz

Ein Wortassoziationsspiel für Studierende und Lehrende: Hinweiswörter finden, die ein KI-Modell richtig zuordnet, und dabei erleben, wie es Bedeutung als Nähe in einem Vektorraum abbildet. Statisch, ohne Backend, ohne API-Schlüssel, ohne Build-Schritt und ohne externe Requests: Das Modell liegt als Datei im Ordner und rechnet im Browser, Eingaben verlassen das Gerät nicht. Komplett auf Deutsch.

---

**Lernziel:** erleben, wie KI-Modelle Bedeutung als Nähe in einem Vektorraum abbilden (Embeddings, semantische Suche), und merken, wo die Assoziationen des Modells von den eigenen abweichen.

Die Spielenden geben **Hinweiswörter** ein. Das Modell liefert für jedes Wort einen Vektor aus 300 Zahlen und sortiert die Wörter im Spiel nach ihrer Kosinus-Ähnlichkeit zum Hinweis.

**Modus „Blöcke“ (ohne Zeitdruck)**
- Raster aus 8 Reihen mit Wortblöcken in vier Farben. Die Farben sind zusätzlich durch Symbol und Muster unterscheidbar.
- Das Raster hat 4 Spalten, auf Handys unter 480 px Breite 3, damit auch lange Wörter einzeilig auf einen Block passen.
- Der Hinweis trifft den ähnlichsten Block. Er verschwindet zusammen mit allen direkt angrenzenden Blöcken gleicher Farbe (Flood-Fill), die Blöcke darüber rutschen nach.
- Punkte: 10, 30, 60, 100 … für 1, 2, 3, 4 … Blöcke auf einmal.
- Nach jedem Zug fallen 1–2 neue Blöcke. Die Chance auf zwei Blöcke steigt im Lauf der Runde von 50 % auf 100 %.
- Jeder zweite neue Block bekommt bewusst eine andere Farbe als seine Nachbarn, damit die Farbgruppen nicht zu groß werden.
- Liegt ein Block in der obersten Zeile, ist das Spiel vorbei.
- Bei zufälligen Hinweisen dauert eine Runde laut Simulation im Median 34 Züge (3 Spalten) bzw. 42 Züge (4 Spalten); gezieltes Spiel hält länger.
- Optional tippen die Spielenden vorher einen Block an und markieren ihn so als **ihr Ziel**. Nur dann kann das Spiel am Ende zeigen, wo das Modell anders gerankt hat.

**Modus „Arcade“ (unter Zeitdruck)**
- Liste mit anfangs 8 Wörtern, ein Zielwort ist hervorgehoben (★, pink).
- Nach dem Hinweis sortiert sich die Liste animiert: Die ähnlichsten Wörter wandern nach unten.
- Landet das Ziel in der **Trefferzone** (die untersten 4 Plätze, ab 12 Treffern nur noch 3), verschwindet es samt allen Wörtern darunter.
- Punkte: 10 je entferntem Wort plus ein Platzierungsbonus (40 / 25 / 15 / 5 für Platz 1–4 von unten).
- Von oben rücken neue Wörter nach. Der Abstand beginnt bei 6,5 s und sinkt je Wort um 3 %, mindestens 2,2 s.
- Bei 14 Wörtern ist das Spiel vorbei.
- Pause per Knopf oder Esc. Die Wörter werden dabei ausgeblendet, und wenn der Tab im Hintergrund ist, pausiert das Spiel automatisch.

**Hinweisregeln:** genau ein Wort aus mindestens 2 Buchstaben. Es darf nicht im Spiel sein und keines der Wörter enthalten oder darin enthalten sein. Verglichen wird ohne Groß-/Kleinschreibung, Umlaute werden ausgeschrieben.

**Transparenz:** Nach jedem Zug zeigt das einklappbare Panel „So hat das Modell gerankt“ alle Wörter mit Ähnlichkeitswert und Balken, dazu eine kurze Erklärung zu Embeddings und Kosinus-Ähnlichkeit. Am Spielende stehen eine Reflexionsfrage und die drei überraschendsten Züge, also die mit dem größten Abstand zwischen erwartetem Rang 1 und tatsächlichem Rang des gemeinten Wortes.

**Kein Levelanstieg:** Jede Runde zieht zufällig Wörter aus dem gewählten Pool (Alltag, Uni & Studium, KI & Daten, Natur, Gemischt). Bestwerte je Modus und Pool liegen im `localStorage`.

## Modellwahl

Wortnetz nutzt **deutsche fastText-Wortvektoren** (`cc.de.300`, Grave et al. 2018, Lizenz CC BY-SA 3.0). Sie wurden mit einem neuronalen Netz aus Common-Crawl-Texten gelernt: Wörter, die oft in ähnlichen Zusammenhängen stehen, bekommen ähnliche Vektoren.

Anfangs lief ein Transformer-Satzmodell (distiluse) mit transformers.js im Browser. Bei einzelnen Wörtern ordnete es aber oft unverständlich zu, etwa „Tropfen“ → Samen statt Regen. Deshalb wurde verglichen, auf 55 deutschen Paaren aus Hinweis und Zielwort (z. B. „Biene“ → Honig, „Laub“ → Herbst), jeweils auf 300 zufälligen Spielbrettern mit 12 Pool-Wörtern:

| Modell | Ladegröße | Ziel auf Platz 1 | Ziel unter den Top 4 |
|---|---|---|---|
| distiluse-base-multilingual-cased-v2 (vorher im Spiel) | 138 MB | 55 % | 81 % |
| **fastText cc.de.300, 4 Bit** | **ca. 23 MB** | **81 %** | **97 %** |

Außerdem wurden paraphrase-multilingual-mpnet, LaBSE, multilingual-e5-base, gte-multilingual-base und bge-m3 an Beispielen wie „Tropfen“, „nass“ oder „gefährlich“ geprüft. Keines ordnete einzelne Wörter verlässlich zu; Satzmodelle sind für ganze Sätze gebaut, nicht für Einzelwörter.

*Grenzen:* Das Modell kennt nur Sprachgebrauch, keine Bedeutung. „Gefahr“ landet nicht bei „Tiger“, weil die Wörter selten zusammen stehen; „Raubkatze“ trifft dagegen sicher. Genau diese Unterschiede sind Thema der Reflexion im Spiel.

## Ladegröße und Dateien

- `data/vocab.txt` (1,8 MB): 150.000 Wörter, häufigste zuerst. Hinweise außerhalb dieses Wortschatzes lehnt das Spiel freundlich ab.
- `data/vec-1.bin` (7,5 MB): Vektoren der rund 50.000 häufigsten Wörter inklusive aller Pool-Wörter. Wird beim Start geladen.
- `data/vec-2.bin` (15 MB): Vektoren der übrigen Wörter. Lädt im Hintergrund, während schon gespielt wird.
- `data/vectors.json`: Anzahl, Dimensionen und Skalen.
- Alle Dateien sind kleiner als 25 MB und lassen sich deshalb auch über die GitHub-Weboberfläche hochladen.
- Es gibt keine externen Requests: Alles kommt vom selben Server wie das Spiel.

Die Vektoren sind auf Länge 1 normiert und pro Dimension auf 4 Bit gerundet. Das halbiert die Größe gegenüber 8 Bit ohne messbaren Qualitätsverlust. Neu erzeugen lassen sie sich mit `python scripts/build-vectors.py cc.de.300.vec.gz` (Rohdaten: https://dl.fbaipublicfiles.com/fasttext/vectors-crawl/cc.de.300.vec.gz, ca. 1,3 GB). Geprüft werden sie mit `node scripts/test-vectors.mjs`.

## Wortlisten ergänzen

Die Pools stehen in `data/wordlists.json`:

```json
{ "pools": [
  { "id": "natur", "name": "Natur", "beschreibung": "Pflanzen, Tiere, Landschaften und Wetter.",
    "words": ["Baum", "Wald", "Wiese", "…"] }
] }
```

Regeln:
- Pro Pool mindestens 80 deutsche Substantive, großgeschrieben und eindeutig, möglichst häufige Wörter.
- Höchstens zweiteilige Komposita, mindestens 3 Buchstaben.
- Innerhalb eines Pools darf kein Wort in einem anderen stecken, also nicht „Schrank“ und „Kühlschrank“ und nicht „Affe“ und „Giraffe“. Sonst wären viele Hinweise automatisch ungültig.
- Jedes Wort muss im Wortschatz des Modells stehen. Der Validator prüft das; fehlt ein Wort, ersetzen oder `scripts/build-vectors.py` neu laufen lassen.
- Ein neuer Pool erscheint automatisch auf der Startseite.

Prüfen im Repo-Root:

```bash
node scripts/validate-wordlists.mjs
```

```bash
node scripts/test-logic.mjs
```

Der Validator meldet Dubletten, Teilwort-Überschneidungen, zu kleine Pools und Fehler im Format. Sehr lange Wörter meldet er nur als Hinweis. `test-logic.mjs` testet Hinweisregeln, Ranking, Arcade-Wertung und Flood-Fill.

---

## Lokal starten

Die Spieldaten werden per `fetch` geladen. Deshalb muss die Seite über einen Webserver laufen, ein Doppelklick auf `index.html` (`file://`) reicht nicht. Im Repo-Root:

```bash
python3 -m http.server 8000
```

(Unter Windows ggf. `python -m http.server 8000` oder `py -m http.server 8000`.)

Danach im Browser öffnen: <http://localhost:8000/>.

Eine Internetverbindung braucht das Spiel nicht: Das Modell liegt in `data/` und kommt vom selben Server wie das Spiel.

---

## Auf GitHub Pages veröffentlichen

Die drei Lernspiele liegen nebeneinander in einem gemeinsamen Repository:

```
<repo>/KI-Lernspiele/quellenprobe/
<repo>/KI-Lernspiele/leitstelle/
<repo>/KI-Lernspiele/wortnetz/
```

1. Den Ordner `wortnetz` mit seinem ganzen Inhalt nach `KI-Lernspiele/wortnetz/` ins Repository legen (Weboberfläche: **Add file → Upload files**, oder per `git add` und `git push`).
2. Falls GitHub Pages für das Repository noch nicht läuft: **Settings → Pages**, Source „Deploy from a branch“, Branch `main`, Ordner `/ (root)`.
3. Das Spiel ist dann erreichbar unter `https://<benutzername>.github.io/<repo>/KI-Lernspiele/wortnetz/`. Groß-/Kleinschreibung zählt.

Alle Pfade sind relativ, deshalb funktioniert das Spiel unter jedem Unterpfad. Die Links „Weitere Lernspiele“ im Seitenfuß zeigen auf die Nachbarordner (`../quellenprobe/`, `../leitstelle/`, `../wortnetz/`) und funktionieren, solange die drei Ordner nebeneinanderliegen.

Ein Doppelklick auf `index.html` reicht nicht: Browser blockieren beim Öffnen von der Festplatte das Nachladen der Daten. Lokal also immer über einen kleinen Webserver starten (siehe „Lokal starten“).

---

## Barrierearmut

- Per Tastatur bedienbar. Enter schickt den Hinweis ab, Esc pausiert den Arcade-Modus. Im Modus Blöcke wählen die Pfeiltasten einen Block, Enter markiert ihn als Ziel.
- Zugergebnisse werden über eine `aria-live`-Region angesagt.
- Blockfarben sind zusätzlich durch Symbol und Muster unterscheidbar.
- Das Eingabefeld bleibt auf dem Handy über der Bildschirmtastatur.
- `prefers-reduced-motion` wird berücksichtigt.

## Inspiration

Die Mechanik von *Wortnetz*, Wörter mit einem Hinweis per semantischer Ähnlichkeit zu treffen, ist von Googles Experiment **„Semantris“** (2018) angeregt. *Wortnetz* ist ein eigenständiges Spiel: Name, Texte, Wortlisten, Gestaltung, Punktesystem und das Transparenz-Panel sind neu entwickelt. Grafiken und Branding des Vorbilds werden nicht verwendet.

## Hinweis

Alle Szenarien in diesem Spiel sind **immer frei erfunden**: Personen, Dokumente, Einrichtungen, Termine und Zahlen gibt es so nicht. Ähnlichkeiten mit realen Personen oder Vorgängen sind nicht beabsichtigt. Das Spiel weist auf der Startseite und im Seitenfuß darauf hin.
