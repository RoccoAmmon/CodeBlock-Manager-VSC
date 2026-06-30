import * as vscode from 'vscode';
import * as path from 'path';

// =============================================================================
// CodeBlock-Manager fuer VS Code
// Tauscht PowerShell-Bloecke (function, filter, workflow, configuration,
// class, enum) aus der Zwischenablage live im Editor aus.
// =============================================================================

// --- Konstanten --------------------------------------------------------------
// Unterstuetzte Block-Schluesselwoerter (Robustheit: mehr Block-Typen)
const BLOCK_KEYWORDS = ['function', 'filter', 'workflow', 'configuration', 'class', 'enum'];
const KEYWORD_REGEX_TEIL = BLOCK_KEYWORDS.join('|');

// --- Dekorationen fuer farbige Hervorhebung ---------------------------------
let dekoErsetzt: vscode.TextEditorDecorationType;   // gelb
let dekoAngehaengt: vscode.TextEditorDecorationType; // gruen

// --- Status fuer Live-Ueberwachung ------------------------------------------
let liveAktiv = false;
let letzteClipboard = '';
let liveTimer: ReturnType<typeof setInterval> | undefined;
let markierungTimer: ReturnType<typeof setTimeout> | undefined;
let statusBar: vscode.StatusBarItem;
let cooldownBis = 0; // Timestamp: kein neues Diff vor diesem Zeitpunkt

// --- Vorschau-Inhalte fuer das Diff-Fenster ---------------------------------
const vorschauInhalte = new Map<string, string>();
const vorschauProvider: vscode.TextDocumentContentProvider = {
    provideTextDocumentContent(uri: vscode.Uri): string {
        return vorschauInhalte.get(uri.path) ?? '';
    }
};

// --- Typen -------------------------------------------------------------------
interface Aenderung {
    name: string;
    art: 'ersetzt' | 'angehaengt';
    start: number;       // Offset im Originaltext
    ende: number;        // Offset im Originaltext (exklusiv)
    neuerText: string;   // einzufuegender Text
}

// === Aktivierung der Extension ===============================================
export function activate(context: vscode.ExtensionContext) {

    dekoErsetzt = vscode.window.createTextEditorDecorationType({
        backgroundColor: 'rgba(220, 220, 60, 0.25)',
        isWholeLine: true
    });
    dekoAngehaengt = vscode.window.createTextEditorDecorationType({
        backgroundColor: 'rgba(80, 220, 90, 0.25)',
        isWholeLine: true
    });

    // Vorschau-Provider fuer das Diff-Fenster registrieren
    context.subscriptions.push(
        vscode.workspace.registerTextDocumentContentProvider('codeblock-preview', vorschauProvider)
    );

    // --- Statusleisten-Eintrag -----------------------------------------------
    statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    statusBar.command = 'codeblockManager.liveToggle';
    aktualisiereStatusBar();
    statusBar.show();
    context.subscriptions.push(statusBar);

    // --- Befehl: Block aus Zwischenablage einfuegen --------------------------
    context.subscriptions.push(
        vscode.commands.registerCommand('codeblockManager.funktionErsetzen', async () => {
            if (Date.now() < cooldownBis) { return; }
            const clip = await vscode.env.clipboard.readText();
            await verarbeiteClipboard(clip, true);
        })
    );

    // --- Befehl: Live-Ueberwachung umschalten --------------------------------
    context.subscriptions.push(
        vscode.commands.registerCommand('codeblockManager.liveToggle', () => {
            liveAktiv = !liveAktiv;
            aktualisiereStatusBar();
            if (liveAktiv) {
                starteLiveTimer();
                vscode.window.showInformationMessage('CodeBlock: Live-Ueberwachung AN.');
            } else {
                stoppeLiveTimer();
                vscode.window.showInformationMessage('CodeBlock: Live-Ueberwachung AUS.');
            }
        })
    );

    // --- Befehl: Markierungen loeschen ---------------------------------------
    context.subscriptions.push(
        vscode.commands.registerCommand('codeblockManager.markierungenLoeschen', () => {
            loescheMarkierungen();
            setzeStatus('Markierungen entfernt.');
        })
    );

    // Markierungen bei Tippeingabe ausblenden
    context.subscriptions.push(
        vscode.workspace.onDidChangeTextDocument((e) => {
            const editor = vscode.window.activeTextEditor;
            if (editor && e.document === editor.document) {
                loescheMarkierungen();
            }
        })
    );

    // Falls in den Einstellungen Live aktiviert ist, direkt starten
    const config = vscode.workspace.getConfiguration('codeblockManager');
    if (config.get<boolean>('liveUeberwachung')) {
        liveAktiv = true;
        aktualisiereStatusBar();
        starteLiveTimer();
    }
}

// === Live-Timer steuern ======================================================
function starteLiveTimer() {
    stoppeLiveTimer();
    const triggerRegex = new RegExp('^\\s*(?:' + KEYWORD_REGEX_TEIL + ')\\s+', 'im');
    liveTimer = setInterval(async () => {
        if (Date.now() < cooldownBis) { return; }
        const clip = await vscode.env.clipboard.readText();
        if (clip && clip !== letzteClipboard && triggerRegex.test(clip)) {
            letzteClipboard = clip;
            await verarbeiteClipboard(clip, false);
        }
    }, 1000);
}

function stoppeLiveTimer() {
    if (liveTimer) {
        clearInterval(liveTimer);
        liveTimer = undefined;
    }
}

// === Hauptlogik: Clipboard verarbeiten =======================================
async function verarbeiteClipboard(clip: string, manuell: boolean) {
    try {
        // Cooldown: nach Verwerfen 3 s keine neuen Diffs
        if (Date.now() < cooldownBis) { return; }

        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            if (manuell) { vscode.window.showWarningMessage('Keine Datei geoeffnet.'); }
            return;
        }

        const config = vscode.workspace.getConfiguration('codeblockManager');
        const anhaengen = config.get<boolean>('neueFunktionenAnhaengen', true);
        const kommentare = config.get<boolean>('kommentareEinbeziehen', true);
        const vorschau = config.get<boolean>('vorschauDiff', true);
        const backup = config.get<boolean>('autoBackup', true);

        const bloecke = getAlleBloecke(clip, kommentare);
        if (bloecke.length === 0) {
            if (manuell) { vscode.window.showInformationMessage('Kein bekannter Block im Clipboard erkannt.'); }
            return;
        }

        const dokument = editor.document;
        const inhalt = dokument.getText();

        const aenderungen: Aenderung[] = [];
        const ersetztListe: string[] = [];
        const angehaengtListe: string[] = [];
        const uebersprungenListe: string[] = [];

        for (const blk of bloecke) {
            const bereich = getBlockBereich(inhalt, blk.name);

            if (bereich) {
                // Zeilenanfang + optionale Kommentarzeilen darueber einbeziehen
                const zeilenStart = inhalt.lastIndexOf('\n', bereich.start - 1) + 1;
                const start = kommentare ? erweitereUmKommentare(inhalt, bereich.start) : zeilenStart;
                const zielEinzug = (inhalt.substring(zeilenStart, bereich.start).match(/^[\t ]*/) || [''])[0];
                const neuerText = passeEinzugAn(blk.code, zielEinzug);
                aenderungen.push({
                    name: blk.name, art: 'ersetzt',
                    start, ende: bereich.start + bereich.laenge, neuerText
                });
                ersetztListe.push(blk.name);
            } else if (anhaengen) {
                const neuerText = '\n\n' + passeEinzugAn(blk.code, '') + '\n';
                aenderungen.push({
                    name: blk.name, art: 'angehaengt',
                    start: inhalt.length, ende: inhalt.length, neuerText
                });
                angehaengtListe.push(blk.name);
            } else {
                uebersprungenListe.push(blk.name);
            }
        }

        if (aenderungen.length === 0) {
            if (manuell) { vscode.window.showInformationMessage('CodeBlock: Nichts zu aendern.'); }
            return;
        }

        // --- Vorschau / Diff vor dem Ersetzen --------------------------------
        if (vorschau) {
            const vorschlag = baueVorschlagstext(inhalt, aenderungen);
            const ok = await zeigeDiffUndBestaetige(dokument, vorschlag);
            if (!ok) {
                setzeStatus('Verworfen.');
                cooldownBis = Date.now() + 3000; // 3 s Pause
                return;
            }
        }

        // --- Auto-Backup direkt vor der Aenderung ----------------------------
        if (backup) {
            await erstelleBackup(dokument);
        }

        // --- Aenderungen anwenden (ein Undo-Schritt) -------------------------
        const edit = new vscode.WorkspaceEdit();
        for (const a of aenderungen) {
            if (a.art === 'ersetzt') {
                edit.replace(
                    dokument.uri,
                    new vscode.Range(dokument.positionAt(a.start), dokument.positionAt(a.ende)),
                    a.neuerText
                );
            } else {
                edit.insert(dokument.uri, dokument.positionAt(a.start), a.neuerText);
            }
        }

        const erfolg = await vscode.workspace.applyEdit(edit);
        if (!erfolg) {
            vscode.window.showErrorMessage('Aenderung konnte nicht angewendet werden.');
            return;
        }

        // Clipboard-Cache aktualisieren (Live-Timer und Manual in Sync halten)
        letzteClipboard = clip;
        cooldownBis = 0; // Cooldown zurücksetzen

        // Dokument wieder in den Vordergrund holen (nach evtl. Diff-Ansicht)
        const sichtbar = await vscode.window.showTextDocument(dokument, { preview: false });

        // Bereiche markieren + zur ersten Aenderung springen
        const timeout = config.get<number>('markierungTimeoutSek', 5);
        await markiereUndZeige(sichtbar, ersetztListe, angehaengtListe, timeout);

        // Statusmeldung
        const teile: string[] = [];
        if (ersetztListe.length > 0)       { teile.push(`Ersetzt: ${ersetztListe.join(', ')}`); }
        if (angehaengtListe.length > 0)    { teile.push(`Angehaengt: ${angehaengtListe.join(', ')}`); }
        if (uebersprungenListe.length > 0) { teile.push(`Uebersprungen: ${uebersprungenListe.join(', ')}`); }
        const meldung = teile.join('  |  ');

        if (uebersprungenListe.length > 0) {
            vscode.window.showWarningMessage('CodeBlock: ' + meldung);
        } else {
            vscode.window.showInformationMessage('CodeBlock: ' + meldung);
        }
        setzeStatus(meldung);

    } catch (err) {
        vscode.window.showErrorMessage('CodeBlock-Fehler: ' + (err as Error).message);
    }
}

// === Vorschlagstext (Endzustand) aus den Aenderungen bauen ===================
function baueVorschlagstext(inhalt: string, aenderungen: Aenderung[]): string {
    const ersetzungen = aenderungen
        .filter(a => a.art === 'ersetzt')
        .sort((a, b) => b.start - a.start); // von hinten nach vorne
    const anhaenge = aenderungen.filter(a => a.art === 'angehaengt');

    let neu = inhalt;
    for (const a of ersetzungen) {
        neu = neu.substring(0, a.start) + a.neuerText + neu.substring(a.ende);
    }
    for (const a of anhaenge) {
        neu += a.neuerText;
    }
    return neu;
}

// === Diff-Fenster anzeigen und Bestaetigung einholen =========================
async function zeigeDiffUndBestaetige(dok: vscode.TextDocument, vorschlag: string): Promise<boolean> {
    const key = '/' + Date.now() + '-' + path.basename(dok.uri.fsPath || 'datei');
    vorschauInhalte.set(key, vorschlag);
    const rechts = vscode.Uri.parse('codeblock-preview:' + key);

    try {
        await vscode.commands.executeCommand(
            'vscode.diff', dok.uri, rechts,
            'CodeBlock: Vorschau (alt \u2194 neu)',
            { preview: true }
        );

        const wahl = await vscode.window.showInformationMessage(
            'CodeBlock: Aenderungen uebernehmen?',
            { modal: true },
            'Uebernehmen', 'Verwerfen'
        );

        // Diff-Ansicht schliessen und zurueck zum Original springen
        await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
        await vscode.window.showTextDocument(dok, { preview: false });
        return wahl === 'Uebernehmen';
    } finally {
        vorschauInhalte.delete(key);
    }
}

// === Auto-Backup als .bak-Datei neben dem Dokument ===========================
async function erstelleBackup(dok: vscode.TextDocument) {
    try {
        if (dok.uri.scheme !== 'file') { return; }
        const bakUri = vscode.Uri.file(dok.uri.fsPath + '.bak');
        await vscode.workspace.fs.writeFile(bakUri, Buffer.from(dok.getText(), 'utf8'));
    } catch {
        // Backup-Fehler nicht blockierend behandeln
    }
}

// === Bereiche markieren, erste Aenderung anzeigen, Auto-Ausblenden ===========
async function markiereUndZeige(
    editor: vscode.TextEditor,
    ersetzt: string[],
    angehaengt: string[],
    timeoutSek: number
) {
    const dokument = editor.document;
    const inhalt = dokument.getText();

    const rangesErsetzt: vscode.Range[] = [];
    const rangesAngehaengt: vscode.Range[] = [];

    for (const name of ersetzt) {
        const r = findeRange(dokument, inhalt, name);
        if (r) { rangesErsetzt.push(r); }
    }
    for (const name of angehaengt) {
        const r = findeRange(dokument, inhalt, name);
        if (r) { rangesAngehaengt.push(r); }
    }

    editor.setDecorations(dekoErsetzt, rangesErsetzt);
    editor.setDecorations(dekoAngehaengt, rangesAngehaengt);

    // Zur ersten geaenderten Stelle springen
    const ziel = rangesErsetzt[0] || rangesAngehaengt[0];
    if (ziel) {
        editor.selection = new vscode.Selection(ziel.start, ziel.start);
        editor.revealRange(ziel, vscode.TextEditorRevealType.InCenter);
    }

    // Markierung nach X Sekunden automatisch ausblenden
    if (markierungTimer) { clearTimeout(markierungTimer); markierungTimer = undefined; }
    if (timeoutSek > 0) {
        markierungTimer = setTimeout(loescheMarkierungen, timeoutSek * 1000);
    }
}

function findeRange(dok: vscode.TextDocument, inhalt: string, name: string): vscode.Range | undefined {
    const b = getBlockBereich(inhalt, name);
    if (!b) { return undefined; }
    return new vscode.Range(dok.positionAt(b.start), dok.positionAt(b.start + b.laenge));
}

function loescheMarkierungen() {
    const editor = vscode.window.activeTextEditor;
    if (editor) {
        editor.setDecorations(dekoErsetzt, []);
        editor.setDecorations(dekoAngehaengt, []);
    }
    if (markierungTimer) { clearTimeout(markierungTimer); markierungTimer = undefined; }
}

// === Kommentarblock oberhalb in den Bereich einbeziehen ======================
// Liefert den Startoffset inkl. vorangehender Kommentarzeilen bzw. <# #>-Block.
function erweitereUmKommentare(inhalt: string, startIndex: number): number {
    let pos = inhalt.lastIndexOf('\n', startIndex - 1) + 1; // Zeilenanfang des Blocks

    while (pos > 0) {
        const vorEnde = pos - 1;                                  // Newline der Zeile darueber
        const vorStart = inhalt.lastIndexOf('\n', vorEnde - 1) + 1;
        const zeile = inhalt.substring(vorStart, vorEnde).trim();

        if (zeile === '') {
            break; // Leerzeile trennt -> Abbruch
        }
        if (zeile.endsWith('#>')) {
            // Blockkommentar -> rueckwaerts bis zum <#
            const openIdx = inhalt.lastIndexOf('<#', vorEnde);
            if (openIdx >= 0) {
                pos = inhalt.lastIndexOf('\n', openIdx - 1) + 1;
                continue;
            }
            break;
        }
        if (zeile.startsWith('#')) {
            pos = vorStart;
            continue;
        }
        break;
    }
    return pos;
}

// === Einrueckung des Codes an die Zieltiefe anpassen =========================
function passeEinzugAn(code: string, zielEinzug: string): string {
    const zeilen = code.split(/\r?\n/);

    // Basiseinzug = Einzug der ersten nicht-leeren Zeile
    let basis = '';
    for (const z of zeilen) {
        if (z.trim() !== '') {
            basis = (z.match(/^[\t ]*/) || [''])[0];
            break;
        }
    }

    return zeilen.map(z => {
        if (z.trim() === '') { return ''; }
        const rest = z.startsWith(basis) ? z.substring(basis.length) : z.replace(/^[\t ]*/, '');
        return zielEinzug + rest;
    }).join('\n');
}

// === Alle Bloecke aus einem Code-Text ermitteln ==============================
function getAlleBloecke(codeText: string, mitKommentaren: boolean): { name: string; code: string }[] {
    const ergebnis: { name: string; code: string }[] = [];
    const regexKopf = new RegExp('^\\s*(?:' + KEYWORD_REGEX_TEIL + ')\\s+([A-Za-z_][\\w-]*)', 'gim');
    let match: RegExpExecArray | null;

    while ((match = regexKopf.exec(codeText)) !== null) {
        const name = match[1];
        const bereich = getBlockBereich(codeText, name, match.index);
        if (bereich) {
            const start = mitKommentaren ? erweitereUmKommentare(codeText, bereich.start) : bereich.start;
            const code = codeText.substring(start, bereich.start + bereich.laenge).replace(/\s+$/, '');
            ergebnis.push({ name, code });
        }
    }
    return ergebnis;
}

// === String-/Kommentar-sichere Klammer-Zaehlung ==============================
function getBlockBereich(
    inhalt: string,
    name: string,
    abIndex: number = 0
): { start: number; laenge: number } | null {

    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regexKopf = new RegExp(
        '(?:' + KEYWORD_REGEX_TEIL + ')\\s+' + escaped + '\\b[^{]*\\{', 'i'
    );

    const suchText = abIndex > 0 ? inhalt.substring(abIndex) : inhalt;
    const kopf = regexKopf.exec(suchText);
    if (!kopf) { return null; }

    const basis = abIndex > 0 ? abIndex : 0;
    const startIndex = basis + kopf.index;
    const klammerStart = basis + kopf.index + kopf[0].length - 1;

    let tiefe = 0;
    let inSingle = false, inDouble = false, inComment = false, inBlock = false;

    for (let i = klammerStart; i < inhalt.length; i++) {
        const z = inhalt[i];
        const vp = i > 0 ? inhalt[i - 1] : '';
        const nz = i + 1 < inhalt.length ? inhalt[i + 1] : '';

        if (inBlock)   { if (z === '#' && nz === '>') { inBlock = false; i++; } continue; }
        if (inComment) { if (z === '\n') { inComment = false; } continue; }
        if (inSingle)  { if (z === "'")  { inSingle = false; } continue; }
        if (inDouble)  { if (z === '"' && vp !== '`') { inDouble = false; } continue; }

        if (z === '<' && nz === '#') { inBlock = true; i++; continue; }

        switch (z) {
            case "'": inSingle = true; continue;
            case '"': inDouble = true; continue;
            case '#': inComment = true; continue;
            case '{': tiefe++; break;
            case '}':
                tiefe--;
                if (tiefe === 0) {
                    return { start: startIndex, laenge: (i - startIndex) + 1 };
                }
                break;
        }
    }
    return null;
}

// === Statusleiste aktualisieren ==============================================
function aktualisiereStatusBar() {
    statusBar.text = liveAktiv
        ? '$(eye) CodeBlock: Live AN'
        : '$(eye-closed) CodeBlock: Live AUS';
    statusBar.tooltip = 'Klicken, um Live-Ueberwachung umzuschalten';
}

function setzeStatus(text: string) {
    statusBar.text = '$(check) ' + text.substring(0, 40);
    // Nach 4 Sekunden zurueck auf den Live-Status
    setTimeout(aktualisiereStatusBar, 4000);
}

// === Deaktivierung ===========================================================
export function deactivate() {
    stoppeLiveTimer();
    if (markierungTimer) { clearTimeout(markierungTimer); }
}
