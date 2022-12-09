/* eslint-disable quotes */
import { dirname } from 'path';
import * as vscode from 'vscode';

export interface ExecutorConfiguration {
    command: string;
}

export function getConfig(): vscode.WorkspaceConfiguration {
    return vscode.workspace.getConfiguration('interactive-markdown');
}

export function getExecutorsConfig(): Record<string, ExecutorConfiguration> {
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    return getConfig().get('executors')!;
}

export function windowsPathConverter(path: string) {
    if (process.platform === 'win32') {
        return path.replace(/^\/*([A-Za-z]:)/g, '$1');
    }
    return path;
}

export function getWorkFolder(document: vscode.NotebookDocument): string {
    if (vscode.workspace.workspaceFolders) {
        if (document) {
            const workspaceFolder = vscode.workspace.getWorkspaceFolder(document.uri);
            if (workspaceFolder) {
                return windowsPathConverter(workspaceFolder.uri.fsPath);
            }
        }
        return windowsPathConverter(vscode.workspace.workspaceFolders[0].uri.fsPath);
    } else {
        if (document.uri.scheme === 'file') {
            return windowsPathConverter(dirname(document.uri.path));
        } else {
            // use user's home dir as fallback
            return process.env.HOME || process.env.USERPROFILE || '/';
        }
    }
}

export function shellStringEscape(value: string) {
    value = "'" + value.replace(/\\/g, '\\\\').replace(/'/g, "'\\''") + "'";
    value = value.replace(/^(?:'')+/g, '').replace(/\\'''/g, "\\'");
    return value;
}
