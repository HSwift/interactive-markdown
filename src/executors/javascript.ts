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
            code += `const ${label} = Buffer.from('${t}', 'base64').toString();\n`;
        }
    });
    return code;
}

export default async function runJavascript(filename: string, options: RunnerOptions): Promise<ChildProcessWithoutNullStreams> {
    const executors = getExecutorsConfig();
    if (executors.javascript === undefined) {
        throw new Error('javascript executor disabled');
    }
    const head = generateContextCode(options.contextValue);
    await fs.writeFile(filename, head + options.code);
    const path = executors.javascript.path;
    const args = executors.javascript.args.map((x) => (x === '%p' ? filename : x));
    return spawn(path, args, options.spawnOption);
}
