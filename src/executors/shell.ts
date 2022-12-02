import { ChildProcessWithoutNullStreams, spawn } from 'child_process';
import * as fs from 'fs/promises';
import * as vscode from 'vscode';
import { RunnerOptions } from '.';
import { getConfig, getExecutorsConfig } from '../utils';

function generateContextCode(contextValue: Map<number, vscode.NotebookCellOutputItem>): string {
    const resultLabel = getConfig().get<string>('resultLabel');
    let code = '';
    contextValue.forEach((v, k) => {
        const label = resultLabel + String(k);
        const t = Buffer.from(v.data).toString('base64');
        code += `${label}=$(echo '${t}' | base64 -d)\n`;
    });
    return code;
}

export default async function runShell(filename: string, options: RunnerOptions): Promise<ChildProcessWithoutNullStreams> {
    const executors = getExecutorsConfig();
    if (executors.shellscript === undefined) {
        throw new Error('shellscript executor disabled');
    }
    const head = generateContextCode(options.contextValue);
    await fs.writeFile(filename, head + options.code);
    const path = executors.shellscript.path;
    const args = executors.shellscript.args.map((x) => (x === '%p' ? filename : x));
    return spawn(path, args, options.spawnOption);
}
