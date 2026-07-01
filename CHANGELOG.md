# Changelog

All notable changes to the **CodeBlock-Manager** extension.

---

## [1.1.0] – 2026-07-02

### 🌟 Neu: Sprachübergreifende Block-Erkennung
- **11 Sprachen** werden jetzt unterstützt: PowerShell, Python, JavaScript, TypeScript, C#, Java, Go, Ruby, Rust, PHP, C/C++
- Block-Parsing je nach Sprachtyp: Brace-basiert (`{}`) für C-Syntax-Sprachen, Indent-basiert für Python
- Sprachspezifische Kommentarstile (`#`, `//`, `/* */`, `<# #>`, `'''`) werden korrekt erkannt und mit-ersetzt
- Neue Sprachdefinitionen einfach via `src/blockPatterns.ts` erweiterbar

### 🌲 Neu: Block-Navigator (TreeView in der Sidebar)
- Alle Blöcke der aktuellen Datei werden im Explorer-Bereich als TreeView angezeigt
- **Klick** auf einen Block → springt direkt zur Definition im Editor
- **Rechtsklick** → Block aus Zwischenablage ersetzen
- Icons pro Block-Typ (Function, Class, Enum, etc.)
- Automatische Aktualisierung bei Editor-Wechsel und Datei-Änderungen (500 ms Debounce)

### 🔧 Technische Änderungen
- `src/blockPatterns.ts` – neue Datei: Sprachdefinitionen & sprachspezifische Block-Erkennung
- `src/blockTreeProvider.ts` – neue Datei: TreeView-Provider für Sidebar-Navigation
- `src/extension.ts` – komplett auf sprachspezifische Patterns umgestellt
- `package.json` – Views, Commands, Keywords erweitert
- `README.md` – erweitert um Sprachtabelle, neue Beispiele

---

## [1.0.7] – 2026-06-??

### 🐛 Fixes & Verbesserungen
- Cooldown nach Verwerfen (3 s Pause) verhindert versehentliches Überschreiben
- Clipboard-Cache wird bei Workspace-Wechsel zurückgesetzt
- Stabilitätsverbesserungen bei der Block-Erkennung

---

## [1.0.0] – 2026-06-??

### 🚀 Erstes Release
- PowerShell-Block-Erkennung (`function`, `filter`, `workflow`, `configuration`, `class`, `enum`)
- Diff-Vorschau vor dem Ersetzen
- Kommentar-Erhalt (`<# .SYNOPSIS #>`, `#`-Zeilen)
- Automatische Einrückungsanpassung
- Auto-Backup (`.bak`-Datei)
- Farbige Markierung (Gelb = ersetzt, Grün = angehängt)
- Mehrfach-Modus (mehrere Blöcke auf einmal)
- Live-Überwachung der Zwischenablage
- Undo-fähig (ein Schritt)
