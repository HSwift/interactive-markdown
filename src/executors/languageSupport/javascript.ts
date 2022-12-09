import * as vscode from 'vscode';
import { getConfig } from '../../utils';
import { LanguageSupport, SpawnOptions } from '.';

export const javascript: LanguageSupport = class {
    static generateContextCode(contextValue: Map<number, vscode.NotebookCellOutputItem>): string {
        const resultLabel = getConfig().get<string>('resultLabel');
        let code = '';
        contextValue.forEach((v, k) => {
            const label = resultLabel + String(k);
            if (v.mime === 'text/plain') {
                const t = Buffer.from(v.data).toString('base64');
                code += `const ${label} = Buffer.from('${t}', 'base64').toString();\n`;
            } else if (v.mime === 'text/x-json') {
                const t = Buffer.from(v.data).toString('base64');
                code += `const ${label} = JSON.parse(atob('${t}'));\n`;
            }
        });
        return code;
    }
    static generateSpawnOptions(): SpawnOptions {
        return {};
    }
};
