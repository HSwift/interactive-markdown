import { Command } from './command';
import { Runat, RunatConfig } from './runat';

const macroFormat = /^(#|\/\/)\[([^\]]+)\]$/;
const directives = new Map<string, Directive>();
directives.set('runat', Runat);
directives.set('command', Command);
export interface Directive {
    parse(input: string, lastConfig?: object): object|string|number;
}

export interface Config extends Record<string, any> {
    macroLength: number;
    runat?: RunatConfig;
    command?: string;
}

export function macroProcess(code: string): Config {
    const lines = code.split('\n');
    const config: Config = {macroLength:0};
    let l = 0;
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        const extracted = macroFormat.exec(line);
        if (extracted !== null) {
            l += (lines[i].length + 1);
            directives.forEach((v, k) => {
                if (extracted[2].startsWith(k)) {
                    config[k] = v.parse(extracted[2]);
                }
            });
        } else {
            config.macroLength = l;
            break;
        }
    }
    return config;
}
