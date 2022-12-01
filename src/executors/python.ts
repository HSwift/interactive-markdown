import { ChildProcessWithoutNullStreams, spawn } from 'child_process';
import * as fs from 'fs/promises';
import { RunnerOptions } from '.';
import { getConfig, getExecutorsConfig } from '../utils';

function generateContextCode(contextValue: Map<number, string | object>): string {
    const resultLabel = getConfig().get<string>('resultLabel');
    let code = '';
    contextValue.forEach((v, k) => {
        const label = resultLabel + String(k);
        if (typeof v === 'string') {
            const t = Buffer.from(v).toString('base64');
            code += `${label} = __import__("base64").b64decode("${t}")\n`;
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
    return spawn(path, args, options.spawnOption);
}
