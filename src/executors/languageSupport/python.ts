import * as vscode from 'vscode';
import { getConfig } from '../../utils';
import { LanguageSupport, SpawnOptions } from '.';

export const python: LanguageSupport = class {
    public static generateContextCode(contextValue: Map<number, vscode.NotebookCellOutputItem>): string {
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
    static generateSpawnOptions(): SpawnOptions {
        return { env: { PYTHONIOENCODING: 'utf8' } };
    }
};
