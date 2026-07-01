# CodeBlock-Manager Wiki

> 🚀 **Sprachübergreifender Block-Austausch per Zwischenablage für VS Code**

---

## 📋 Inhaltsverzeichnis

1. [Installation](#installation)
2. [Erste Schritte](#erste-schritte)
3. [Unterstützte Sprachen](#unterstützte-sprachen)
4. [Block-Navigator](#block-navigator)
5. [Live-Modus](#live-modus)
6. [Einstellungen](#einstellungen)
7. [Tastenkürzel](#tastenkürzel)
8. [Tipps & Tricks](#tipps--tricks)
9. [FAQ](#faq)
10. [Entwicklung](#entwicklung)

---

## Installation

### Via VS Code Marketplace
Öffne die Extensions-Ansicht (`Strg+Umschalt+X`), suche nach **„CodeBlock-Manager"** und klicke auf Installieren.

### Via VSIX
Lade die aktuelle `.vsix`-Datei von der [Releases-Seite](https://github.com/RoccoAmmon/CodeBlock-Manager-VSC/releases) herunter und installiere sie über:
- Extensions-Ansicht → `…` → „Aus VSIX installieren…"

---

## Erste Schritte

1. **Eine unterstützte Datei** öffnen (`.ps1`, `.py`, `.ts`, `.cs`, …)
2. **Einen Block kopieren** – z. B. eine ganze Funktion via `Strg+C`
3. **`Strg+Alt+V`** drücken → Diff-Vorschau prüfen → **„Übernehmen"** klicken

Das Plugin erkennt automatisch die Sprache der geöffneten Datei und wendet das passende Block-Parsing an.

---

## Unterstützte Sprachen

| Sprache | Dateien | Blöcke |
|---------|---------|--------|
| PowerShell | `.ps1`, `.psm1`, `.psd1` | `function`, `filter`, `workflow`, `configuration`, `class`, `enum` |
| Python | `.py`, `.pyw` | `def`, `class`, `async def` |
| JavaScript | `.js`, `.jsx`, `.mjs`, `.cjs` | `function`, `class`, `async function` |
| TypeScript | `.ts`, `.tsx`, `.mts`, `.cts` | `function`, `class`, `async function` |
| C# | `.cs` | `class`, `struct`, `interface`, `enum`, `record` |
| Java | `.java` | `class`, `interface`, `enum`, `record` |
| Go | `.go` | `func`, `type` |
| Ruby | `.rb`, `.ruby` | `def`, `class`, `module` |
| Rust | `.rs` | `fn`, `struct`, `enum`, `trait`, `impl` |
| PHP | `.php` | `function`, `class`, `interface`, `trait`, `enum` |
| C/C++ | `.cpp`, `.cxx`, `.cc`, `.c`, `.h`, `.hpp` | `class`, `struct`, `enum` |

> **Neue Sprache?** Öffne `src/blockPatterns.ts` und füge einen neuen Eintrag in `ALL_LANGUAGES` hinzu!

---

## Block-Navigator

Der **Block-Navigator** zeigt alle Blöcke der aktuell geöffneten Datei als TreeView im Explorer-Bereich an.

**Funktionen:**
- **Klick** auf einen Block → springt zur Definition
- **Rechtsklick** → Block aus Zwischenablage ersetzen
- Icons unterscheiden Block-Typen (Function, Class, Enum, …)
- Aktualisiert sich automatisch bei Dateiwechsel und -änderungen

**Aktivieren:**
1. `Strg+Umschalt+E` → Explorer öffnen
2. Ganz unten den Bereich **„Block-Navigator"** aufklappen

---

## Live-Modus

Der Live-Modus überwacht die Zwischenablage **jede Sekunde** und ersetzt Blöcke automatisch.

**Aktivieren:**
- Klick auf das **Auge-Symbol** in der Statusleiste
- Oder Befehl: `CodeBlock: Live-Ueberwachung ein/aus`

**Ideal für:**
- Arbeiten mit mehreren Monitoren
- Remote-Sitzungen (RDP, TeamViewer)
- Schnelles Iterieren zwischen Editor und Web/IDE

---

## Einstellungen

Öffnen via `Strg+,` → „CodeBlock-Manager" oder in `settings.json`:

| Einstellung | Default | Beschreibung |
|-------------|---------|--------------|
| `codeblockManager.vorschauDiff` | `true` | Diff-Fenster vor dem Ersetzen anzeigen |
| `codeblockManager.autoBackup` | `true` | Automatische `.bak`-Sicherung |
| `codeblockManager.kommentareEinbeziehen` | `true` | Kommentare oberhalb mit-ersetzen |
| `codeblockManager.markierungTimeoutSek` | `5` | Sekunden bis Markierung verschwindet |
| `codeblockManager.neueFunktionenAnhaengen` | `true` | Unbekannte Blöcke ans Ende anhängen |
| `codeblockManager.liveUeberwachung` | `false` | Live-Modus automatisch starten |

---

## Tastenkürzel

| Kürzel | Befehl |
|--------|--------|
| `Strg+Alt+V` | Block aus Zwischenablage einfügen/ersetzen |
| Statusleiste (Klick) | Live-Überwachung umschalten |

---

## Tipps & Tricks

### 🔄 Schnelles Aktualisieren einer Funktion
1. Funktion in Quell-Datei markieren → `Strg+C`
2. In Zieldatei `Strg+Alt+V`
3. Diff prüfen, übernehmen – fertig

### 📦 Mehrere Blöcke auf einmal kopieren
Du kannst mehrere `function`-/`def`-/`class`-Blöcke hintereinander kopieren – alle werden nacheinander verarbeitet.

### 🧪 Neue Blöcke testen
Block existiert noch nicht in der Datei? Er wird **ans Ende angehängt** (einstellbar).

### 🔒 Sicherheit
- **Kein Netzwerk** – das Plugin arbeitet komplett lokal
- **Backup** vor jeder Änderung (`.bak`)
- **Diff-Vorschau** verhindert versehentliches Überschreiben

---

## FAQ

**F: Warum wird mein Block nicht erkannt?**
A: Prüfe, ob die Datei-Endung unterstützt wird. Für neue Sprachen: Eintrag in `blockPatterns.ts` ergänzen.

**F: Kann ich rückgängig machen?**
A: Ja! `Strg+Z` macht die letzte Ersetzung rückgängig (ein Undo-Schritt).

**F: Funktioniert das auch mit Remote SSH / Dev Containers?**
A: Ja, die Extension arbeitet lokal und erkennt die Sprache über die Datei-Endung.

**F: Wo ist der Block-Navigator?**
A: Im Explorer (`Strg+Umschalt+E`) ganz unten als eigener Abschnitt „Block-Navigator".

---

## Entwicklung

```powershell
# Repo klonen
git clone https://github.com/RoccoAmmon/CodeBlock-Manager-VSC.git
cd CodeBlock-Manager-VSC

# Abhängigkeiten installieren
npm install

# Kompilieren (falls Node.js nicht im PATH)
& 'C:\Program Files\nodejs\node.exe' node_modules/typescript/bin/tsc -p ./

# VSIX bauen
npx @vscode/vsce package

# Extension Development Host starten (F5 in VS Code)
```

---

*Stand: Juli 2026 | Version 1.1.0*
