# CodeBlock-Manager für VS Code

Tauscht PowerShell-Funktionen **live im Editor** aus der Zwischenablage aus.

## Funktionen

- 🔄 Block aus der Zwischenablage erkennen und im Editor ersetzen
- 🧩 Mehr Block-Typen: `function`, `filter`, `workflow`, `configuration`, `class`, `enum`
- 👀 Diff-Vorschau (alt ↔ neu) mit „Übernehmen / Verwerfen" vor dem Ersetzen
- 💬 Comment-Based-Help / Kommentarblock oberhalb wird mit ersetzt
- 📐 Einrückung wird automatisch an die Zieltiefe angepasst
- 🎯 Springt nach dem Ersetzen direkt zur geänderten Stelle
- 💾 Auto-Backup (`.bak`) vor jeder Ersetzung
- ➕ Neue Blöcke automatisch anhängen
- 📚 Mehrfach-Modus (mehrere Blöcke auf einmal)
- 🟡 Gelb = ersetzt, 🟢 Grün = angehängt (blendet automatisch aus)
- 👁️ Optionale Live-Überwachung der Zwischenablage

## Einstellungen

| Einstellung | Standard | Beschreibung |
|-------------|----------|--------------|
| `codeblockManager.vorschauDiff` | `true` | Diff-Fenster zur Bestätigung anzeigen |
| `codeblockManager.autoBackup` | `true` | `.bak`-Sicherung vor jeder Ersetzung |
| `codeblockManager.kommentareEinbeziehen` | `true` | Kommentar/Help-Block mit ersetzen |
| `codeblockManager.markierungTimeoutSek` | `5` | Markierung nach X s ausblenden (0 = nie) |
| `codeblockManager.neueFunktionenAnhaengen` | `true` | Unbekannte Blöcke ans Ende anhängen |
| `codeblockManager.liveUeberwachung` | `false` | Zwischenablage automatisch überwachen |

## Verwendung

1. Eine `.ps1`-Datei öffnen
2. Eine Funktion kopieren (z. B. `function Write-Log { ... }`)
3. **`Strg+Alt+V`** drücken – fertig!

Oder Live-Modus aktivieren: Klick auf **„CodeBlock: Live AUS"** in der Statusleiste.

## Befehle

| Befehl | Tastenkürzel |
|--------|--------------|
| Funktion aus Zwischenablage einfügen | `Strg+Alt+V` |
| Live-Überwachung ein/aus | (Statusleiste) |
| Markierungen löschen | (Befehlspalette) |
