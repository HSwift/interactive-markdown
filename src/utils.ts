import { dirname } from 'path';
import * as vscode from 'vscode';

export interface ExecutorConfiguration {
    path: string;
    args: string[];
}

export function getConfig(): vscode.WorkspaceConfiguration {
    return vscode.workspace.getConfiguration('interactive-markdown');
}

export function getExecutorsConfig(): Record<string, ExecutorConfiguration> {
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    return getConfig().get('executors')!;
}

export function getWorkFolder(document: vscode.NotebookDocument): string {
    if (vscode.workspace.workspaceFolders) {
        if (document) {
            const workspaceFolder = vscode.workspace.getWorkspaceFolder(document.uri);
            if (workspaceFolder) {
                return workspaceFolder.uri.fsPath;
            }
        }
        return vscode.workspace.workspaceFolders[0].uri.fsPath;
    } else {
        if (document.uri.scheme === 'file') {
            return dirname(document.uri.path);
        } else {
            return '/';
        }
    }
}
