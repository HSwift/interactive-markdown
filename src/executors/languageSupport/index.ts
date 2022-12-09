import * as vscode from 'vscode';
import { javascript } from './javascript';
import { php } from './php';
import { python } from './python';
import { shellscript } from './shell';

export interface SpawnOptions {
    cwd?: string | URL | undefined;
    env?: NodeJS.ProcessEnv | undefined;
    shell?: boolean;
}

export interface LanguageSupport {
    generateContextCode(contextValue: Map<number, vscode.NotebookCellOutputItem>): string;
    generateSpawnOptions(): SpawnOptions;
}

export const languages = new Map<string, LanguageSupport>();
languages.set('python', python);
languages.set('javascript', javascript);
languages.set('php', php);
languages.set('shellscript', shellscript);
