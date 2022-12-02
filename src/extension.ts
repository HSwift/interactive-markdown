/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { parseMarkdown, writeCellsToMarkdown, RawNotebookCell } from './markdownParser';
import { NotebookKernel } from './notebookKernel';

const providerOptions = {
    transientMetadata: {
        runnable: true,
        editable: true,
        custom: true
    },
    transientOutputs: false
};

export function activate(context: vscode.ExtensionContext) {
    context.subscriptions.push(vscode.workspace.registerNotebookSerializer('interactive-markdown', new MarkdownProvider(), providerOptions));
    context.subscriptions.push(new NotebookKernel());
}

// there are globals in workers and nodejs
declare class TextDecoder {
    decode(data: Uint8Array): string;
}
declare class TextEncoder {
    encode(data: string): Uint8Array;
}

export function rawToNotebookCellData(data: RawNotebookCell): vscode.NotebookCellData {
    return {
        kind: data.kind,
        languageId: data.language,
        metadata: { leadingWhitespace: data.leadingWhitespace, trailingWhitespace: data.trailingWhitespace, indentation: data.indentation },
        outputs: data.outputs,
        value: data.content,
        executionSummary: { executionOrder: data.executionOrder, success: true }
    } as vscode.NotebookCellData;
}

class MarkdownProvider implements vscode.NotebookSerializer {
    private readonly decoder = new TextDecoder();
    private readonly encoder = new TextEncoder();

    deserializeNotebook(data: Uint8Array, _token: vscode.CancellationToken): vscode.NotebookData | Thenable<vscode.NotebookData> {
        const content = this.decoder.decode(data);

        const cellRawData = parseMarkdown(content);
        // ignore the last empty block
        if (cellRawData.length > 1 && cellRawData[cellRawData.length - 1].content === '') {
            cellRawData.pop();
        }
        const cells = cellRawData.map(rawToNotebookCellData);

        return { cells };
    }

    serializeNotebook(data: vscode.NotebookData, _token: vscode.CancellationToken): Uint8Array | Thenable<Uint8Array> {
        const stringOutput = writeCellsToMarkdown(data.cells);
        return this.encoder.encode(stringOutput);
    }
}
