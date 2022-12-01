import { ChildProcessWithoutNullStreams, spawn } from 'child_process';
import * as fs from 'fs/promises';
import { RunnerOptions } from '.';
import { getConfig, getExecutorsConfig } from '../utils';

function generateContextCode(contextValue: Map<number, string | object>): string {
    const resultLabel = getConfig().get<string>('resultLabel');
    let code = '<?php\n';
    contextValue.forEach((v, k) => {
        const label = resultLabel + String(k);
        if (typeof v === 'string') {
            const t = Buffer.from(v).toString('base64');
            code += `define('${label}',base64_decode('${t}'));\n`;
        }
    });
    code += '?>';
    return code;
}

export default async function runPhp(filename: string, options: RunnerOptions): Promise<ChildProcessWithoutNullStreams> {
    const executors = getExecutorsConfig();
    if (executors.php === undefined) {
        throw new Error('php executor disabled');
    }
    const head = generateContextCode(options.contextValue);
    await fs.writeFile(filename, head + options.code);
    const path = executors.php.path;
    const args = executors.php.args.map((x) => (x === '%p' ? filename : x));
    return spawn(path, args, options.spawnOption);
}
