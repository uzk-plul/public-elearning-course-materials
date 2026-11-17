# Wortnetz

Ein Wortassoziationsspiel für Studierende und Lehrende: Hinweiswörter finden, die ein Sprachmodell richtig zuordnet, und dabei erleben, wie es Bedeutung als Nähe in einem Vektorraum abbildet. Statisch, ohne Backend, ohne API-Schlüssel, ohne Build-Schritt. Das KI-Modell läuft im Browser, Eingaben verlassen das Gerät nicht. Oberfläche auf Deutsch.

---

**Lernziel:** erleben, wie Sprachmodelle Bedeutung als Nähe in einem Vektorraum abbilden (Embeddings, semantische Suche), und merken, wo die Assoziationen des Modells von den eigenen abweichen.

Die Spielenden geben **Hinweiswörter** ein. Ein Sprachmodell, das im Browser läuft, berechnet für jedes Wort einen Vektor aus 768 Zahlen und sortiert die Wörter im Spiel nach ihrer Kosinus-Ähnlichkeit zum Hinweis.

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

Im Spiel läuft **`Xenova/distiluse-base-multilingual-cased-v2`** (quantisiert, `q8`) mit **transformers.js 4.3.2**. Verglichen wurden die beiden vorgegebenen Kandidaten und, weil beide schwach abschnitten, zwei weitere Modelle ähnlicher Größe:

| Modell | Download | Ziel auf Platz 1 | Ziel unter den Top 4 | Zeit pro Hinweis* |
|---|---|---|---|---|
| paraphrase-multilingual-MiniLM-L12-v2 | 118 MB | 42 % | 63 % | 8 ms |
| multilingual-e5-small (Präfix `query: `) | 135 MB | 36 % | 56 % | 8 ms |
| jina-embeddings-v2-base-de | 162 MB | 49 % | 77 % | 14 ms |
| **distiluse-base-multilingual-cased-v2** | **138 MB** | **55 %** | **81 %** | 8 ms |

\* gemessen in Node auf einem Laptop (CPU)

*Test:* 55 deutsche Paare aus Hinweis und Zielwort aus allen fünf Pools, zum Beispiel „Biene“ → Honig, „Laub“ → Herbst oder „abschreiben“ → Plagiat. Jedes Paar wurde auf 300 zufälligen Spielbrettern mit 12 Pool-Wörtern gerankt.

*Ergebnis:* distiluse rankt am plausibelsten und ist kaum größer als die anderen. Ein erster, kleinerer Test mit nur 20 Paaren und einem festen Brett hatte noch e5-small vorn gesehen; auf den echten Spielbrettern war e5 aber das schwächste Modell (z. B. „Ritter“ → Roboter statt Schloss). MiniLM neigt zu „Hub-Wörtern“, die bei sehr vielen Hinweisen oben landen.

Der Vergleich lässt sich mit `scripts/compare-models.mjs` wiederholen. Das Modell steht zentral in `js/model-config.js` und lässt sich dort mit einer Zeile tauschen.

*Rechenweg:* Gerechnet wird mit WebAssembly auf der CPU. Mit WebGPU lieferte das quantisierte Modell im Test unplausible Ränge und brauchte rund 3,5 s pro Wort. Wer WebGPU ausprobieren will, hängt `?device=webgpu` an die Adresse; ist es nicht verfügbar, nutzt das Spiel automatisch WASM.

## Ladegröße und Quellen

- **Bibliothek:** `@huggingface/transformers@4.3.2` (`dist/transformers.min.js`) von jsDelivr, ca. 0,6 MB, plus die ONNX-Runtime als WebAssembly, ebenfalls von jsDelivr.
- **Modell:** `Xenova/distiluse-base-multilingual-cased-v2` von huggingface.co, `onnx/model_quantized.onnx` mit 135 MB und den Tokenizer-Dateien mit 3 MB. Zusammen sind das **rund 138 MB beim ersten Start**, danach kommt es aus dem Browser-Cache.
- Weitere externe Requests gibt es nicht. Hinweiswörter werden nur lokal im Web Worker eingebettet.

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

Beim ersten Start braucht das Spiel eine Internetverbindung für Bibliothek und Modell (ca. 138 MB). Ab dann kommt beides aus dem Browser-Cache.

---

## Auf GitHub Pages veröffentlichen

1. Diesen Ordner als eigenes Repository auf GitHub pushen, am besten unter dem Namen **`wortnetz`**.
2. Auf GitHub unter **Settings → Pages** bei **Source** „Deploy from a branch“ wählen, Branch `main` und Ordner `/ (root)` einstellen und speichern.
3. Nach ein bis zwei Minuten ist das Spiel erreichbar unter `https://<benutzername>.github.io/wortnetz/`.

Alle Pfade sind relativ, deshalb funktioniert das Spiel unter jedem Unterpfad. Die leere `.nojekyll` sorgt dafür, dass GitHub die Dateien unverändert ausliefert.

**Verweise auf die anderen Spiele:** Im Fuß der Seite stehen Links auf die Schwesterspiele (`../quellenprobe/`, `../leitstelle/`, `../wortnetz/`). Sie funktionieren, wenn die drei Repositories genau so heißen und im selben GitHub-Konto liegen. Andernfalls die Links in `index.html` anpassen.

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

Alle Personen, Dokumente, Projekte und Zahlen im Spiel sind frei erfunden. Ähnlichkeiten mit realen Personen oder Vorgängen sind nicht beabsichtigt.
