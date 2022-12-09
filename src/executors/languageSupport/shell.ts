import * as vscode from 'vscode';
import { getConfig } from '../../utils';
import { LanguageSupport, SpawnOptions } from '.';

export const shellscript: LanguageSupport = class {
    static generateContextCode(contextValue: Map<number, vscode.NotebookCellOutputItem>): string {
        const resultLabel = getConfig().get<string>('resultLabel');
        let code = '';
        contextValue.forEach((v, k) => {
            const label = resultLabel + String(k);
            const t = Buffer.from(v.data).toString('base64');
            code += `${label}=$(echo '${t}' | base64 -d)\n`;
        });
        return code;
    }
    static generateSpawnOptions(): SpawnOptions {
        return {};
    }
};
