import { Directive } from '.';

// eslint-disable-next-line @typescript-eslint/naming-convention
export const Command: Directive = class {
    static parse(input:string): string{
        // command overwrite-command-line
        const command = input.replace(/^command */,'');
        if(command === ''){
            throw new Error('command line must be specified');
        }
        return command;
    }
};