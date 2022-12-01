/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';

export interface RawNotebookCell {
    indentation?: string;
    leadingWhitespace: string;
    trailingWhitespace: string;
    language: string;
    content: string;
    kind: vscode.NotebookCellKind;
    outputs?: vscode.NotebookCellOutput[];
    executionOrder?: number;
}

const LANG_IDS = new Map([
    ['bat', 'batch'],
    ['c++', 'cpp'],
    ['js', 'javascript'],
    ['ts', 'typescript'],
    ['cs', 'csharp'],
    ['py', 'python'],
    ['py2', 'python'],
    ['py3', 'python'],
    ['sh', 'shellscript'],
    ['bash', 'shellscript']
]);
const LANG_ABBREVS = new Map(Array.from(LANG_IDS.keys()).map((k) => [LANG_IDS.get(k), k]));

interface ICodeBlockStart {
    langId: string;
    indentation: string;
}

interface IResultBlockStart {
    indentation: string;
    cellId: number;
    mime: string;
}

/**
 * Note - the indented code block parsing is basic. It should only be applied inside lists, indentation should be consistent across lines and
 * between the start and end blocks, etc. This is good enough for typical use cases.
 */
function parseCodeBlockStart(line: string): ICodeBlockStart | null {
    const match = line.match(/( {4}|\t)?```(\S*)/);
    return (
        match && {
            indentation: match[1],
            langId: match[2]
        }
    );
}

function parseResultBlockStart(line: string): IResultBlockStart | null {
    const match = line.match(/( {4}|\t)?```result_(\d*): (\S*)/);
    return (
        match && {
            indentation: match[1],
            cellId: parseInt(match[2]),
            mime: match[3]
        }
    );
}

function isCodeBlockStart(line: string): boolean {
    return !!parseCodeBlockStart(line);
}

function isCodeBlockEndLine(line: string): boolean {
    return !!line.match(/^\s*```/);
}

export function parseMarkdown(content: string): RawNotebookCell[] {
    const lines = content.split(/\r?\n/g);
    const cells: RawNotebookCell[] = [];
    let i = 0;

    // Each parse function starts with line i, leaves i on the line after the last line parsed
    for (; i < lines.length; ) {
        const leadingWhitespace = i === 0 ? parseWhitespaceLines(true) : '';
        if (i >= lines.length) {
            break;
        }
        const codeBlockMatch = parseCodeBlockStart(lines[i]);
        if (codeBlockMatch) {
            const resultBlockMatch = parseResultBlockStart(lines[i]);
            if (resultBlockMatch) {
                parseResultBlock(resultBlockMatch);
            } else {
                parseCodeBlock(leadingWhitespace, codeBlockMatch);
            }
        } else {
            parseMarkdownParagraph(leadingWhitespace);
        }
    }

    function parseResultBlock(resultBlockMatch: IResultBlockStart) {
        const startSourceIdx = ++i;
        for (;;) {
            const currLine = lines[i];
            if (i >= lines.length) {
                break;
            } else if (isCodeBlockEndLine(currLine)) {
                i++; // consume block end marker
                break;
            }

            i++;
        }

        const content = lines
            .slice(startSourceIdx, i - 1)
            .map((line) => line.replace(new RegExp('^' + resultBlockMatch.indentation), ''))
            .join('\n');

        const cellId = resultBlockMatch.cellId;

        if (cells[cellId] && cells[cellId].kind === vscode.NotebookCellKind.Code) {
            const items = [new vscode.NotebookCellOutputItem(Buffer.from(content), resultBlockMatch.mime)];
            cells[cellId].outputs = [new vscode.NotebookCellOutput(items)];
            cells[cellId].executionOrder = cellId;
        }
    }

    function parseWhitespaceLines(isFirst: boolean): string {
        const start = i;
        const nextNonWhitespaceLineOffset = lines.slice(start).findIndex((l) => l !== '');
        let end: number; // will be next line or overflow
        let isLast = false;
        if (nextNonWhitespaceLineOffset < 0) {
            end = lines.length;
            isLast = true;
        } else {
            end = start + nextNonWhitespaceLineOffset;
        }

        i = end;
        const numWhitespaceLines = end - start + (isFirst || isLast ? 0 : 1);
        return '\n'.repeat(numWhitespaceLines);
    }

    function parseCodeBlock(leadingWhitespace: string, codeBlockStart: ICodeBlockStart): void {
        const language = LANG_IDS.get(codeBlockStart.langId) || codeBlockStart.langId;
        const startSourceIdx = ++i;
        for (;;) {
            const currLine = lines[i];
            if (i >= lines.length) {
                break;
            } else if (isCodeBlockEndLine(currLine)) {
                i++; // consume block end marker
                break;
            }

            i++;
        }

        const content = lines
            .slice(startSourceIdx, i - 1)
            .map((line) => line.replace(new RegExp('^' + codeBlockStart.indentation), ''))
            .join('\n');
        const trailingWhitespace = parseWhitespaceLines(false);
        cells.push({
            language,
            content,
            kind: vscode.NotebookCellKind.Code,
            leadingWhitespace: leadingWhitespace,
            trailingWhitespace: trailingWhitespace,
            indentation: codeBlockStart.indentation,
            outputs: []
        });
    }

    function parseMarkdownParagraph(leadingWhitespace: string): void {
        const startSourceIdx = i;
        for (;;) {
            if (i >= lines.length) {
                break;
            }

            const currLine = lines[i];
            if (currLine === '' || isCodeBlockStart(currLine)) {
                break;
            }

            i++;
        }

        const content = lines.slice(startSourceIdx, i).join('\n');

        const trailingWhitespace = parseWhitespaceLines(false);
        cells.push({
            language: 'markdown',
            content,
            kind: vscode.NotebookCellKind.Markup,
            leadingWhitespace: leadingWhitespace,
            trailingWhitespace: trailingWhitespace
        });
    }

    return cells;
}

export function writeCellsToMarkdown(cells: ReadonlyArray<vscode.NotebookCellData>): string {
    let result = '';
    for (let i = 0; i < cells.length; i++) {
        const cell = cells[i];
        if (i === 0) {
            result += cell.metadata?.leadingWhitespace ?? '';
        }

        if (cell.kind === vscode.NotebookCellKind.Code) {
            const indentation = cell.metadata?.indentation || '';
            const languageAbbrev = LANG_ABBREVS.get(cell.languageId) ?? cell.languageId;
            const codePrefix = indentation + '```' + languageAbbrev + '\n';
            const contents = cell.value
                .split(/\r?\n/g)
                .map((line) => indentation + line)
                .join('\n');
            const codeSuffix = '\n' + indentation + '```';

            result += codePrefix + contents + codeSuffix;

            if (cell.outputs && cell.outputs.length > 0 && cell.outputs[0].items.length > 0) {
                const outputMime = cell.outputs[0].items[0].mime;
                const outputData = cell.outputs[0].items[0].data.toString().trim();
                const codePrefix = indentation + '\n```' + `result_${i}: ${outputMime}` + '\n';
                const contents = outputData
                    .split(/\r?\n/g)
                    .map((line) => indentation + line)
                    .join('\n');
                const codeSuffix = '\n' + indentation + '```';

                result += codePrefix + contents + codeSuffix;
            }
        } else {
            result += cell.value;
        }

        result += getBetweenCellsWhitespace(cells, i);
    }
    return result;
}

function getBetweenCellsWhitespace(cells: ReadonlyArray<vscode.NotebookCellData>, idx: number): string {
    const thisCell = cells[idx];
    const nextCell = cells[idx + 1];

    if (!nextCell) {
        return thisCell.metadata?.trailingWhitespace ?? '\n';
    }

    const trailing = thisCell.metadata?.trailingWhitespace;
    const leading = nextCell.metadata?.leadingWhitespace;

    if (typeof trailing === 'string' && typeof leading === 'string') {
        return trailing + leading;
    }

    // One of the cells is new
    const combined = (trailing ?? '') + (leading ?? '');
    if (!combined || combined === '\n') {
        return '\n\n';
    }

    return combined;
}
