// =============================================================================
// blockTreeProvider.ts – TreeView für Block-Navigation in der Sidebar
// =============================================================================

import * as vscode from 'vscode';
import { getAlleBloeckeFromFile, getLanguageForFile, LanguageConfig, BlockInfo } from './blockPatterns';

// =============================================================================
// TreeItem-Definition
// =============================================================================

export class BlockTreeItem extends vscode.TreeItem {
    constructor(
        public readonly label: string,
        public readonly type: string,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState,
        public readonly blockInfo?: BlockInfo,
        public readonly fileUri?: vscode.Uri
    ) {
        super(label, collapsibleState);

        // Icon pro Block-Typ
        const iconMap: Record<string, string> = {
            'function': 'symbol-method',
            'filter': 'symbol-method',
            'workflow': 'symbol-method',
            'configuration': 'symbol-parameter',
            'class': 'symbol-class',
            'struct': 'symbol-structure',
            'interface': 'symbol-interface',
            'enum': 'symbol-enumerator',
            'record': 'symbol-structure',
            'def': 'symbol-method',
            'fn': 'symbol-method',
            'func': 'symbol-method',
            'block': 'symbol-field',
        };

        this.iconPath = new vscode.ThemeIcon(iconMap[type] || 'symbol-misc');

        if (blockInfo && fileUri) {
            this.tooltip = `${type} ${label} (Zeile ${getLineFromOffset(fileUri, blockInfo.start)})`;
            this.command = {
                command: 'codeblockManager.navigiereZuBlock',
                title: 'Zu Block springen',
                arguments: [fileUri, blockInfo.start]
            };
            this.contextValue = 'blockItem';
        }
    }
}

// =============================================================================
// TreeDataProvider
// =============================================================================

export class BlockTreeProvider implements vscode.TreeDataProvider<BlockTreeItem> {
    private _onDidChangeTreeData: vscode.EventEmitter<BlockTreeItem | undefined | void> =
        new vscode.EventEmitter<BlockTreeItem | undefined | void>();
    readonly onDidChangeTreeData: vscode.Event<BlockTreeItem | undefined | void> =
        this._onDidChangeTreeData.event;

    private currentDocument?: vscode.TextDocument;
    private currentLanguage?: LanguageConfig;
    private currentBlocks: BlockInfo[] = [];

    constructor() {
        // Auf Editor-Wechsel reagieren
        vscode.window.onDidChangeActiveTextEditor((editor) => {
            if (editor) {
                this.updateForDocument(editor.document);
            }
        });

        // Auf Dokument-Änderungen reagieren (verzögert, nicht bei jedem Tastendruck)
        let debounceTimer: ReturnType<typeof setTimeout> | undefined;
        vscode.workspace.onDidChangeTextDocument((e) => {
            if (this.currentDocument && e.document === this.currentDocument) {
                if (debounceTimer) { clearTimeout(debounceTimer); }
                debounceTimer = setTimeout(() => {
                    this.updateForDocument(e.document);
                }, 500);
            }
        });

        // Aktiven Editor initial auswerten
        if (vscode.window.activeTextEditor) {
            this.updateForDocument(vscode.window.activeTextEditor.document);
        }
    }

    // =========================================================================
    // Öffentliche Methoden
    // =========================================================================

    getTreeItem(element: BlockTreeItem): vscode.TreeItem {
        return element;
    }

    getChildren(element?: BlockTreeItem): BlockTreeItem[] {
        if (element) {
            return []; // Keine Unterknoten
        }

        if (!this.currentDocument || this.currentBlocks.length === 0) {
            return [
                new BlockTreeItem(
                    'Keine Blöcke gefunden',
                    'block',
                    vscode.TreeItemCollapsibleState.None
                )
            ];
        }

        const items = this.currentBlocks.map(b => {
            return new BlockTreeItem(
                b.name,
                b.type,
                vscode.TreeItemCollapsibleState.None,
                b,
                this.currentDocument!.uri
            );
        });

        // Zusammenfassung als erstes Item
        const summary = new BlockTreeItem(
            `${this.currentBlocks.length} Blöcke in ${this.currentLanguage?.name || '?'}`,
            'block',
            vscode.TreeItemCollapsibleState.None
        );
        summary.iconPath = new vscode.ThemeIcon('list-tree');
        summary.command = undefined;
        summary.contextValue = undefined;

        return [summary, ...items];
    }

    // =========================================================================
    // Dokument auswerten
    // =========================================================================

    public updateForDocument(document: vscode.TextDocument) {
        this.currentDocument = document;

        const filename = document.uri.fsPath || '';
        const lang = getLanguageForFile(filename);
        this.currentLanguage = lang;

        if (lang) {
            const inhalt = document.getText();
            this.currentBlocks = getAlleBloeckeFromFile(inhalt, filename).bloecke;
        } else {
            this.currentBlocks = [];
        }

        this.refresh();
    }

    /** Aktuelle Blöcke zurückgeben (für Extension-Zugriff). */
    public getBlocks(): BlockInfo[] {
        return this.currentBlocks;
    }

    /** Aktuelle LanguageConfig zurückgeben. */
    public getLanguage(): LanguageConfig | undefined {
        return this.currentLanguage;
    }

    /** Erzwungene Aktualisierung. */
    public refresh(): void {
        this._onDidChangeTreeData.fire();
    }
}

// =============================================================================
// Hilfsfunktionen
// =============================================================================

function getLineFromOffset(uri: vscode.Uri, offset: number): number {
    try {
        const doc = vscode.workspace.textDocuments.find(d => d.uri.toString() === uri.toString());
        if (doc) {
            return doc.positionAt(offset).line + 1;
        }
    } catch {
        // Ignorieren
    }
    return 0;
}
