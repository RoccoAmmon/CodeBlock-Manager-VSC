import * as vscode from 'vscode';
import * as path from 'path';
import {
    getLanguageConfig,
    getLanguageForFile,
    getAlleBloecke,
    getBlockBereich,
    erweitereUmKommentare,
    passeEinzugAn,
    hatBlockInClipboard,
    LanguageConfig,
} from './blockPatterns';
import { BlockTreeProvider, BlockTreeItem } from './blockTreeProvider';

// =============================================================================
// CodeBlock-Manager fuer VS Code
// Tauscht Code-Bloecke (function, class, def, etc.) aus der Zwischenablage
// live im Editor aus. Sprachuebergreifend mit TreeView-Navigation.
// =============================================================================

// --- Dekorationen fuer farbige Hervorhebung ---------------------------------
let dekoErsetzt: vscode.TextEditorDecorationType;
let dekoAngehaengt: vscode.TextEditorDecorationType;

// --- Status fuer Live-Ueberwachung ------------------------------------------
let liveAktiv = false;
let letzteClipboard = '';
let liveTimer: ReturnType<typeof setInterval> | undefined;
let markierungTimer: ReturnType<typeof setTimeout> | undefined;
let statusBar: vscode.StatusBarItem;
let cooldownBis = 0; // Timestamp: kein neues Diff vor diesem Zeitpunkt
let globalTreeProvider: BlockTreeProvider | undefined;

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
    start: number;
    ende: number;
    neuerText: string;
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

    // === TreeView-Provider ===================================================
    globalTreeProvider = new BlockTreeProvider();
    const treeView = vscode.window.createTreeView('codeblockManager.blockNavigator', {
        treeDataProvider: globalTreeProvider,
        showCollapseAll: false,
    });
    context.subscriptions.push(treeView);

    // --- Befehl: Zu Block navigieren (aus TreeView) --------------------------
    context.subscriptions.push(
        vscode.commands.registerCommand('codeblockManager.navigiereZuBlock', async (uri: vscode.Uri, offset: number) => {
            try {
                const doc = await vscode.workspace.openTextDocument(uri);
                const editor = await vscode.window.showTextDocument(doc, { preview: false });
                const pos = doc.positionAt(offset);
                editor.selection = new vscode.Selection(pos, pos);
                editor.revealRange(new vscode.Range(pos, pos), vscode.TextEditorRevealType.InCenter);
            } catch (err) {
                vscode.window.showErrorMessage('Fehler beim Navigieren: ' + (err as Error).message);
            }
        })
    );

    // --- Befehl: Block aus TreeView durch Clipboard ersetzen ------------------
    context.subscriptions.push(
        vscode.commands.registerCommand('codeblockManager.ersetzteBlockAusTree', async (item: BlockTreeItem) => {
            if (!item.blockInfo || !item.fileUri) { return; }
            const clip = await vscode.env.clipboard.readText();
            if (!clip) {
                vscode.window.showWarningMessage('Zwischenablage ist leer.');
                return;
            }
            // Editor auf die Datei setzen
            try {
                const doc = await vscode.workspace.openTextDocument(item.fileUri);
                await vscode.window.showTextDocument(doc, { preview: false });
            } catch {
                vscode.window.showErrorMessage('Datei konnte nicht geoeffnet werden.');
                return;
            }
            await verarbeiteClipboard(clip, true);
        })
    );

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

    // Clipboard-Cache leeren bei Workspace-Wechsel
    context.subscriptions.push(
        vscode.workspace.onDidChangeWorkspaceFolders(() => {
            letzteClipboard = '';
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
    liveTimer = setInterval(async () => {
        if (Date.now() < cooldownBis) { return; }
        const clip = await vscode.env.clipboard.readText();
        if (!clip || clip === letzteClipboard) { return; }

        // Sprache anhand des aktiven Editors bestimmen
        const editor = vscode.window.activeTextEditor;
        if (!editor) { return; }
        const filename = editor.document.uri.fsPath || '';
        const lang = getLanguageForFile(filename) || getLanguageConfig('powershell');
        if (!lang) { return; }

        if (hatBlockInClipboard(clip, lang)) {
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
        if (Date.now() < cooldownBis) { return; }

        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            if (manuell) { vscode.window.showWarningMessage('Keine Datei geoeffnet.'); }
            return;
        }

        const dokument = editor.document;
        const filename = dokument.uri.fsPath || '';
        const lang = getLanguageForFile(filename) || getLanguageConfig('powershell');
        if (!lang) {
            if (manuell) { vscode.window.showInformationMessage('Sprache wird nicht unterstuetzt.'); }
            return;
        }

        const config = vscode.workspace.getConfiguration('codeblockManager');
        const anhaengen = config.get<boolean>('neueFunktionenAnhaengen', true);
        const kommentare = config.get<boolean>('kommentareEinbeziehen', true);
        const vorschau = config.get<boolean>('vorschauDiff', true);
        const backup = config.get<boolean>('autoBackup', true);

        // Blöcke im Clipboard mit der Ziel-Sprache parsen
        const bloecke = getAlleBloecke(clip, lang);
        if (bloecke.length === 0) {
            if (manuell) { vscode.window.showInformationMessage('Kein bekannter Block im Clipboard erkannt.'); }
            return;
        }

        const inhalt = dokument.getText();

        const aenderungen: Aenderung[] = [];
        const ersetztListe: string[] = [];
        const angehaengtListe: string[] = [];
        const uebersprungenListe: string[] = [];

        for (const blk of bloecke) {
            const bereich = getBlockBereich(inhalt, blk.name, lang);

            if (bereich) {
                const zeilenStart = inhalt.lastIndexOf('\n', bereich.start - 1) + 1;
                const start = (kommentare && blk.hatKommentar)
                    ? erweitereUmKommentare(inhalt, bereich.start, lang)
                    : zeilenStart;
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
                cooldownBis = Date.now() + 3000;
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

        letzteClipboard = clip;
        cooldownBis = 0;

        const sichtbar = await vscode.window.showTextDocument(dokument, { preview: false });

        const timeout = config.get<number>('markierungTimeoutSek', 5);
        await markiereUndZeige(sichtbar, ersetztListe, angehaengtListe, timeout, lang);

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

        // TreeView aktualisieren
        if (globalTreeProvider) {
            globalTreeProvider.updateForDocument(dokument);
        }

    } catch (err) {
        vscode.window.showErrorMessage('CodeBlock-Fehler: ' + (err as Error).message);
    }
}

// === Vorschlagstext (Endzustand) aus den Aenderungen bauen ===================
function baueVorschlagstext(inhalt: string, aenderungen: Aenderung[]): string {
    const ersetzungen = aenderungen
        .filter(a => a.art === 'ersetzt')
        .sort((a, b) => b.start - a.start);
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
    timeoutSek: number,
    lang: LanguageConfig
) {
    const dokument = editor.document;
    const inhalt = dokument.getText();

    const rangesErsetzt: vscode.Range[] = [];
    const rangesAngehaengt: vscode.Range[] = [];

    for (const name of ersetzt) {
        const r = findeRange(dokument, inhalt, name, lang);
        if (r) { rangesErsetzt.push(r); }
    }
    for (const name of angehaengt) {
        const r = findeRange(dokument, inhalt, name, lang);
        if (r) { rangesAngehaengt.push(r); }
    }

    editor.setDecorations(dekoErsetzt, rangesErsetzt);
    editor.setDecorations(dekoAngehaengt, rangesAngehaengt);

    const ziel = rangesErsetzt[0] || rangesAngehaengt[0];
    if (ziel) {
        editor.selection = new vscode.Selection(ziel.start, ziel.start);
        editor.revealRange(ziel, vscode.TextEditorRevealType.InCenter);
    }

    if (markierungTimer) { clearTimeout(markierungTimer); markierungTimer = undefined; }
    if (timeoutSek > 0) {
        markierungTimer = setTimeout(loescheMarkierungen, timeoutSek * 1000);
    }
}

function findeRange(dok: vscode.TextDocument, inhalt: string, name: string, lang: LanguageConfig): vscode.Range | undefined {
    const b = getBlockBereich(inhalt, name, lang);
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

// === Statusleiste aktualisieren ==============================================
function aktualisiereStatusBar() {
    statusBar.text = liveAktiv
        ? '$(eye) CodeBlock: Live AN'
        : '$(eye-closed) CodeBlock: Live AUS';
    statusBar.tooltip = 'Klicken, um Live-Ueberwachung umzuschalten';
}

function setzeStatus(text: string) {
    statusBar.text = '$(check) ' + text.substring(0, 40);
    setTimeout(aktualisiereStatusBar, 4000);
}

// === Deaktivierung ===========================================================
export function deactivate() {
    stoppeLiveTimer();
    if (markierungTimer) { clearTimeout(markierungTimer); }
}
