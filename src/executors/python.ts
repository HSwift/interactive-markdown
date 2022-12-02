import { ChildProcessWithoutNullStreams, spawn } from 'child_process';
import * as fs from 'fs/promises';
import * as vscode from 'vscode';
import { RunnerOptions } from '.';
import { getConfig, getExecutorsConfig } from '../utils';

function generateContextCode(contextValue: Map<number, vscode.NotebookCellOutputItem>): string {
    const resultLabel = getConfig().get<string>('resultLabel');
    let code = '# coding:utf-8\n';
    contextValue.forEach((v, k) => {
        const label = resultLabel + String(k);
        if (v.mime === 'text/plain') {
            const t = Buffer.from(v.data).toString('base64');
            code += `${label} = __import__("base64").b64decode("${t}")\n`;
        } else if (v.mime === 'text/x-json') {
            const t = Buffer.from(v.data).toString('base64');
            code += `${label} = __import__("json").loads(__import__("base64").b64decode("${t}"))\n`;
        }
    });
    return code;
}

export default async function runPython(filename: string, options: RunnerOptions): Promise<ChildProcessWithoutNullStreams> {
    const executors = getExecutorsConfig();
    if (executors.python === undefined) {
        throw new Error('python executor disabled');
    }
    const head = generateContextCode(options.contextValue);
    await fs.writeFile(filename, head + options.code);
    const path = executors.python.path;
    const args = executors.python.args.map((x) => (x === '%p' ? filename : x));
    const pythonOption = { env: { PYTHONIOENCODING: 'utf8' } };
    return spawn(path, args, Object.assign(pythonOption, options.spawnOption));
}
