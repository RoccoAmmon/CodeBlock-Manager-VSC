// =============================================================================
// blockPatterns.ts – Sprachdefinitionen & Block-Erkennung
// =============================================================================

// =============================================================================
// Typen
// =============================================================================

export interface BlockInfo {
    name: string;
    type: string;         // z. B. 'function', 'class', 'enum'
    start: number;        // Offset im Text
    ende: number;         // Offset exklusive
    code: string;         // Vollständiger Block-Text
    hatKommentar: boolean;
}

export interface LanguageConfig {
    id: string;                    // VS Code language id
    name: string;                  // Anzeigename
    extensions: string[];          // Datei-Endungen
    keywords: string[];            // Block-Schlüsselwörter
    usesBraces: boolean;           // {} oder Einrückung?
    lineComment: string;           // z. B. '#', '//'
    blockCommentStart: string;     // z. B. '<#', '/*'
    blockCommentEnd: string;       // z. B. '#>', '*/'
}

// =============================================================================
// Sprachdefinitionen
// =============================================================================

const ALL_LANGUAGES: LanguageConfig[] = [
    // --- PowerShell ----------------------------------------------------------
    {
        id: 'powershell',
        name: 'PowerShell',
        extensions: ['.ps1', '.psm1', '.psd1', '.pssc', '.psrc'],
        keywords: ['function', 'filter', 'workflow', 'configuration', 'class', 'enum'],
        usesBraces: true,
        lineComment: '#',
        blockCommentStart: '<#',
        blockCommentEnd: '#>',
    },
    // --- JavaScript / TypeScript ---------------------------------------------
    {
        id: 'javascript',
        name: 'JavaScript',
        extensions: ['.js', '.jsx', '.mjs', '.cjs'],
        keywords: ['function', 'class', 'async function'],
        usesBraces: true,
        lineComment: '//',
        blockCommentStart: '/*',
        blockCommentEnd: '*/',
    },
    {
        id: 'typescript',
        name: 'TypeScript',
        extensions: ['.ts', '.tsx', '.mts', '.cts'],
        keywords: ['function', 'class', 'async function'],
        usesBraces: true,
        lineComment: '//',
        blockCommentStart: '/*',
        blockCommentEnd: '*/',
    },
    // --- Python --------------------------------------------------------------
    {
        id: 'python',
        name: 'Python',
        extensions: ['.py', '.pyw'],
        keywords: ['def', 'class', 'async def'],
        usesBraces: false,
        lineComment: '#',
        blockCommentStart: "'''",
        blockCommentEnd: "'''",
    },
    // --- C# ------------------------------------------------------------------
    {
        id: 'csharp',
        name: 'C#',
        extensions: ['.cs'],
        keywords: ['class', 'struct', 'interface', 'enum', 'record'],
        usesBraces: true,
        lineComment: '//',
        blockCommentStart: '/*',
        blockCommentEnd: '*/',
    },
    // --- Java ----------------------------------------------------------------
    {
        id: 'java',
        name: 'Java',
        extensions: ['.java'],
        keywords: ['class', 'interface', 'enum', 'record'],
        usesBraces: true,
        lineComment: '//',
        blockCommentStart: '/*',
        blockCommentEnd: '*/',
    },
    // --- Go ------------------------------------------------------------------
    {
        id: 'go',
        name: 'Go',
        extensions: ['.go'],
        keywords: ['func', 'type'],
        usesBraces: true,
        lineComment: '//',
        blockCommentStart: '/*',
        blockCommentEnd: '*/',
    },
    // --- Ruby ----------------------------------------------------------------
    {
        id: 'ruby',
        name: 'Ruby',
        extensions: ['.rb', '.ruby'],
        keywords: ['def', 'class', 'module'],
        usesBraces: true,
        lineComment: '#',
        blockCommentStart: '=begin',
        blockCommentEnd: '=end',
    },
    // --- Rust ----------------------------------------------------------------
    {
        id: 'rust',
        name: 'Rust',
        extensions: ['.rs'],
        keywords: ['fn', 'struct', 'enum', 'trait', 'impl'],
        usesBraces: true,
        lineComment: '//',
        blockCommentStart: '/*',
        blockCommentEnd: '*/',
    },
    // --- PHP -----------------------------------------------------------------
    {
        id: 'php',
        name: 'PHP',
        extensions: ['.php'],
        keywords: ['function', 'class', 'interface', 'trait', 'enum'],
        usesBraces: true,
        lineComment: '//',
        blockCommentStart: '/*',
        blockCommentEnd: '*/',
    },
    // --- C/C++ ---------------------------------------------------------------
    {
        id: 'cpp',
        name: 'C++',
        extensions: ['.cpp', '.cxx', '.cc', '.c', '.h', '.hpp'],
        keywords: ['class', 'struct', 'enum'],
        usesBraces: true,
        lineComment: '//',
        blockCommentStart: '/*',
        blockCommentEnd: '*/',
    },
];

// =============================================================================
// Hilfsfunktionen
// =============================================================================

/** Gibt die LanguageConfig für eine VS Code language id zurück. */
export function getLanguageConfig(langId: string): LanguageConfig | undefined {
    // Exakte ID suchen
    let cfg = ALL_LANGUAGES.find(l => l.id === langId);
    if (cfg) return cfg;

    // Fallback: Shell-Sprachen erkennen
    if (langId === 'shellscript') {
        return ALL_LANGUAGES.find(l => l.id === 'powershell');
    }
    return undefined;
}

/** Gibt die LanguageConfig anhand des Dateipfads zurück. */
export function getLanguageForFile(filename: string): LanguageConfig | undefined {
    const lower = filename.toLowerCase();
    for (const lang of ALL_LANGUAGES) {
        if (lang.extensions.some(ext => lower.endsWith(ext))) {
            return lang;
        }
    }
    return undefined;
}

/** Erzeugt einen Regex, der den Kopf eines Blocks matcht. */
function buildBlockStartRegex(lang: LanguageConfig): RegExp {
    const joined = lang.keywords
        .sort((a, b) => b.length - a.length) // längere zuerst (async function vor function)
        .map(k => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
        .join('|');

    if (lang.usesBraces) {
        // Bracelanguages: function name ... {
        return new RegExp('^\\s*(?:' + joined + ')\\s+([A-Za-z_][\\w\\-]*)', 'gim');
    } else {
        // Python: def name(...):
        return new RegExp('^\\s*(?:' + joined + ')\\s+([A-Za-z_][\\w]*)\\s*\\(', 'gim');
    }
}

/** Baut einen Regex für einen bestimmten Block-Namen. */
function buildNameRegex(lang: LanguageConfig, name: string): RegExp {
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const joined = lang.keywords
        .sort((a, b) => b.length - a.length)
        .map(k => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
        .join('|');

    if (lang.usesBraces) {
        return new RegExp('(?:' + joined + ')\\s+' + escaped + '\\b', 'i');
    } else {
        return new RegExp('(?:' + joined + ')\\s+' + escaped + '\\b', 'i');
    }
}

// =============================================================================
// Kommentar-Erweiterung (sprachspezifisch)
// =============================================================================

/** Start-Offset inkl. vorangehender Kommentare ermitteln (sprachspezifisch). */
export function erweitereUmKommentare(inhalt: string, startIndex: number, lang: LanguageConfig): number {
    let pos = inhalt.lastIndexOf('\n', startIndex - 1) + 1;

    while (pos > 0) {
        const vorEnde = pos - 1;
        const vorStart = inhalt.lastIndexOf('\n', vorEnde - 1) + 1;
        const zeile = inhalt.substring(vorStart, vorEnde).trim();

        if (zeile === '') { break; }

        // --- Blockkommentar-Ende erkannt (z. B. #>, */, ''', """)
        if (lang.blockCommentEnd && zeile.endsWith(lang.blockCommentEnd)) {
            // Python-Docstring (''' / """) – gleicher Start/End-String
            if (lang.id === 'python' && (zeile.startsWith("'''") || zeile.startsWith('"""'))) {
                const q = zeile.substring(0, 3);
                const openIdx = inhalt.lastIndexOf(q, vorEnde - 1);
                if (openIdx >= 0 && openIdx < vorStart) {
                    pos = inhalt.lastIndexOf('\n', openIdx - 1) + 1;
                    continue;
                }
                break;
            }
            // Normale Blockkommentare (/*, <#)
            const openIdx = inhalt.lastIndexOf(lang.blockCommentStart, vorEnde);
            if (openIdx >= 0) {
                pos = inhalt.lastIndexOf('\n', openIdx - 1) + 1;
                continue;
            }
            break;
        }

        // --- Zeilenkommentar erkannt (#, //)
        if (lang.lineComment && zeile.startsWith(lang.lineComment)) {
            // Python-Docstrings (''' / """) – nicht als Zeilenkommentar behandeln
            if (lang.id === 'python' && (zeile.startsWith("'''") || zeile.startsWith('"""'))) {
                const q = zeile.substring(0, 3);
                const openIdx = inhalt.lastIndexOf(q, vorEnde - 1);
                if (openIdx >= 0 && openIdx < vorStart) {
                    pos = inhalt.lastIndexOf('\n', openIdx - 1) + 1;
                    continue;
                }
                break;
            }
            pos = vorStart;
            continue;
        }

        break;
    }
    return pos;
}

/** Einrückung anpassen (identisch zur bisherigen Version). */
export function passeEinzugAn(code: string, zielEinzug: string): string {
    const zeilen = code.split(/\r?\n/);

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

// =============================================================================
// String-sichere Klammerzählung für Brace-basierte Sprachen
// =============================================================================

function getBlockBereichBraces(
    inhalt: string,
    name: string,
    lang: LanguageConfig,
    abIndex: number
): { start: number; laenge: number } | null {

    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const joined = lang.keywords
        .sort((a, b) => b.length - a.length)
        .map(k => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
        .join('|');

    // function name ... {
    const regexKopf = new RegExp('(?:' + joined + ')\\s+' + escaped + '\\b[^{]*\\{', 'i');
    const suchText = abIndex > 0 ? inhalt.substring(abIndex) : inhalt;
    const kopf = regexKopf.exec(suchText);
    if (!kopf) { return null; }

    const basis = abIndex > 0 ? abIndex : 0;
    const startIndex = basis + kopf.index;
    const klammerStart = basis + kopf.index + kopf[0].length - 1;

    let tiefe = 0;
    let inSingle = false, inDouble = false, inComment = false, inBlock = false;
    const bcs = lang.blockCommentStart;
    const bce = lang.blockCommentEnd;

    for (let i = klammerStart; i < inhalt.length; i++) {
        const z = inhalt[i];
        const vp = i > 0 ? inhalt[i - 1] : '';
        const nz = i + 1 < inhalt.length ? inhalt[i + 1] : '';

        if (inBlock) {
            if (bce && z === bce[0] && (bce.length === 1 || inhalt.substring(i, i + bce.length) === bce)) {
                inBlock = false;
                i += bce.length - 1;
            }
            continue;
        }
        if (inComment) { if (z === '\n') { inComment = false; } continue; }
        if (inSingle)  { if (z === "'")  { inSingle = false; } continue; }
        if (inDouble)  {
            if (z === '"' && vp !== '\\') { inDouble = false; }
            continue;
        }

        // Blockkommentar öffnend
        if (bcs && z === bcs[0] && inhalt.substring(i, i + bcs.length) === bcs) {
            inBlock = true;
            i += bcs.length - 1;
            continue;
        }

        switch (z) {
            case "'": inSingle = true; continue;
            case '"': inDouble = true; continue;
            case '#':
                // PowerShell/cpp? Zeilenkommentar
                if (lang.lineComment === '#') { inComment = true; continue; }
                break;
            case '/':
                if (lang.lineComment === '//' && nz === '/') { inComment = true; i++; continue; }
                break;
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

// =============================================================================
// Indent-basierte Block-Suche (Python)
// =============================================================================

function getBlockBereichIndent(
    inhalt: string,
    name: string,
    lang: LanguageConfig,
    abIndex: number
): { start: number; laenge: number } | null {

    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const joined = lang.keywords
        .sort((a, b) => b.length - a.length)
        .map(k => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
        .join('|');

    // def name(...):   oder   class Name(...):
    const regexKopf = new RegExp('(?:' + joined + ')\\s+' + escaped + '\\b[^:]*:', 'i');
    const suchText = abIndex > 0 ? inhalt.substring(abIndex) : inhalt;
    const kopf = regexKopf.exec(suchText);
    if (!kopf) { return null; }

    const basis = abIndex > 0 ? abIndex : 0;
    const startIndex = basis + kopf.index;
    const kopfEnde = basis + kopf.index + kopf[0].length;

    // Einzug der nächsten Zeile bestimmen
    const nachKopf = inhalt.substring(kopfEnde);
    const zeilen = nachKopf.split('\n');
    let bodyEinzug = '';
    for (const z of zeilen) {
        if (z.trim() !== '' && !z.trim().startsWith('#')) {
            const m = z.match(/^(\s+)/);
            if (m) { bodyEinzug = m[1]; }
            break;
        }
    }

    // Leerer Body?
    if (!bodyEinzug) {
        // Nur die Deklarationszeile + ggf. 'pass' oder '...'
        const zeilenInhalt = inhalt.split('\n');
        let zeileIdx = inhalt.substring(0, startIndex).split('\n').length - 1; // 0-based
        if (zeileIdx < zeilenInhalt.length) {
            let endIdx = startIndex;
            // Nächste Zeile holen
            const nextStart = inhalt.indexOf('\n', startIndex);
            if (nextStart >= 0) {
                const nextLine = inhalt.substring(nextStart + 1).split('\n')[0];
                if (nextLine.trim() === '' || nextLine.trim() === 'pass' || nextLine.trim() === '...') {
                    endIdx = nextStart + 1 + nextLine.length;
                }
            }
            return { start: startIndex, laenge: endIdx - startIndex + 1 };
        }
        return { start: startIndex, laenge: kopfEnde - startIndex };
    }

    // Body bis zum Ende des Einzugs oder Dateiende
    let bodyEnde = kopfEnde;
    const alleZeilen = inhalt.split('\n');
    const startLineIdx = inhalt.substring(0, kopfEnde).split('\n').length; // Zeile des Kopfes (0-based)

    for (let i = startLineIdx; i < alleZeilen.length; i++) {
        const z = alleZeilen[i];
        if (z.trim() === '') continue;
        if (!z.startsWith(bodyEinzug) || z.trim().startsWith('#')) {
            // Block Ende
            break;
        }
        // Zeile gehört zum Body
        bodyEnde = inhalt.indexOf('\n', bodyEnde + 1);
        if (bodyEnde < 0) {
            bodyEnde = inhalt.length;
            break;
        }
    }

    if (bodyEnde < 0) bodyEnde = inhalt.length;

    return { start: startIndex, laenge: bodyEnde - startIndex };
}

// =============================================================================
// Öffentliche API
// =============================================================================

/**
 * Findet einen bestimmten Block anhand seines Namens im Text.
 */
export function getBlockBereich(
    inhalt: string,
    name: string,
    lang: LanguageConfig,
    abIndex: number = 0
): { start: number; laenge: number } | null {

    if (lang.usesBraces) {
        return getBlockBereichBraces(inhalt, name, lang, abIndex);
    } else {
        return getBlockBereichIndent(inhalt, name, lang, abIndex);
    }
}

/**
 * Extrahiert alle Blöcke aus einem Code-Text für die angegebene Sprache.
 */
export function getAlleBloecke(
    codeText: string,
    lang: LanguageConfig
): BlockInfo[] {

    const ergebnis: BlockInfo[] = [];
    const regexKopf = buildBlockStartRegex(lang);
    const typeMap = new Map<string, string>();

    // Keyword -> Type Mapping
    for (const kw of lang.keywords) {
        const simple = kw.split(' ').pop()!; // 'async function' -> 'function'
        typeMap.set(simple, simple);
    }

    let match: RegExpExecArray | null;
    while ((match = regexKopf.exec(codeText)) !== null) {
        const name = match[1];
        const bereich = getBlockBereich(codeText, name, lang, match.index);
        if (bereich) {
            const kommentarStart = erweitereUmKommentare(codeText, bereich.start, lang);
            const hatKommentar = kommentarStart < bereich.start;
            const start = kommentarStart;
            const code = codeText.substring(start, bereich.start + bereich.laenge).replace(/\s+$/, '');

            // Type bestimmen
            const declLine = codeText.substring(match.index, match.index + match[0].length);
            let type = 'block';
            for (const kw of lang.keywords) {
                const simple = kw.split(' ').pop()!;
                if (declLine.includes(kw)) {
                    type = simple;
                    break;
                }
            }

            ergebnis.push({ name, type, start, ende: bereich.start + bereich.laenge, code, hatKommentar });
        }
    }

    return ergebnis;
}

/**
 * Findet alle Blöcke für die zur Datei passende Sprache.
 * Falls keine passende Sprache, wird PowerShell als Fallback verwendet.
 */
export function getAlleBloeckeFromFile(inhalt: string, filename: string): {
    bloecke: BlockInfo[];
    language: LanguageConfig | undefined;
} {
    const lang = getLanguageForFile(filename) || getLanguageConfig('powershell');
    if (!lang) {
        return { bloecke: [], language: undefined };
    }
    return { bloecke: getAlleBloecke(inhalt, lang), language: lang };
}

/**
 * Prüft, ob der Text einen erkennbaren Block enthält (für Live-Trigger).
 */
export function hatBlockInClipboard(codeText: string, lang: LanguageConfig): boolean {
    const regex = buildBlockStartRegex(lang);
    return regex.test(codeText);
}
