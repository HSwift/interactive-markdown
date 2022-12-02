import * as vscode from 'vscode';
import { CodeExecutor, RunnerOptions } from './executors';
import { getWorkFolder } from './utils';

export class NotebookKernel {
    public id = 'interactive-markdown-kernel';
    public notebookType = 'interactive-markdown';
    public label = 'Interactive Markdown';

    private readonly _controller: vscode.NotebookController;

    constructor() {
        this._controller = vscode.notebooks.createNotebookController(this.id, this.notebookType, this.label);

        this._controller.supportedLanguages = [];
        this._controller.supportsExecutionOrder = true;
        this._controller.description = 'An interactive markdown notebook';
        this._controller.executeHandler = this._executeAll.bind(this);
    }

    dispose(): void {
        this._controller.dispose();
    }

    private extractResultsFromCells(cells: vscode.NotebookCell[]): Map<number, vscode.NotebookCellOutputItem> {
        const results: Map<number, vscode.NotebookCellOutputItem> = new Map();
        for (const cell of cells) {
            if (cell.kind === vscode.NotebookCellKind.Code && cell.outputs.length > 0) {
                const items = cell.outputs[0].items;
                const mimePriority = ['text/x-json', 'text/plain'];
                for (const mime of mimePriority) {
                    const item = items.filter((x) => x.mime === mime);
                    if (item.length > 0) {
                        results.set(cell.index, item[0]);
                        break;
                    }
                }
            }
        }
        return results;
    }

    private _executeAll(cells: vscode.NotebookCell[], _notebook: vscode.NotebookDocument, _controller: vscode.NotebookController): void {
        for (const cell of cells) {
            this._doExecution(cell, _notebook, _controller);
        }
    }

    private async _doExecution(cell: vscode.NotebookCell, _notebook: vscode.NotebookDocument, _controller: vscode.NotebookController): Promise<void> {
        const cellExecution = _controller.createNotebookCellExecution(cell);
        cellExecution.executionOrder = cell.index;
        cellExecution.start(Date.now());
        const runnerOptions = new RunnerOptions();
        runnerOptions.lang = cell.document.languageId;
        runnerOptions.code = cell.document.getText();
        runnerOptions.cwd = getWorkFolder(_notebook);
        runnerOptions.contextValue = this.extractResultsFromCells(_notebook.getCells());
        try {
            const codeExecutor = new CodeExecutor(runnerOptions, cellExecution);
            await codeExecutor.run();
            cellExecution.end(true, Date.now());
        } catch (e) {
            if (e) {
                console.error(e);
                vscode.window.showWarningMessage(e.toString());
            }
            cellExecution.end(false, Date.now());
        }
    }
}
