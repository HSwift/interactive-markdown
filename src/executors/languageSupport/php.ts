import * as vscode from 'vscode';
import { getConfig } from '../../utils';
import { LanguageSupport, SpawnOptions } from '.';

export const php: LanguageSupport = class {
    static generateContextCode(contextValue: Map<number, vscode.NotebookCellOutputItem>): string {
        const resultLabel = getConfig().get<string>('resultLabel');
        let code = '<?php\n';
        contextValue.forEach((v, k) => {
            const label = resultLabel + String(k);
            if (v.mime === 'text/plain') {
                const t = Buffer.from(v.data).toString('base64');
                code += `define('${label}',base64_decode('${t}'));\n`;
            } else if (v.mime === 'text/x-json') {
                const t = Buffer.from(v.data).toString('base64');
                code += `define('${label}',json_decode(base64_decode('${t}'),true));\n`;
            }
        });
        code += '?>';
        return code;
    }
    static generateSpawnOptions(): SpawnOptions {
        return {};
    }
};
