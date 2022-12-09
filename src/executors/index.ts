/* eslint-disable @typescript-eslint/no-non-null-assertion */
import { randomBytes } from 'crypto';
import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs/promises';
import * as vscode from 'vscode';
import { languages, LanguageSupport } from './languageSupport';
import { getExecutorsConfig } from '../utils';
import { DockerExecutorProxy, ExecutorProxy, LocalExecutorProxy, SSHExecutorProxy } from './executorProxy';
import { macroProcess, Config as MacroConfig } from './macro';

export class RunnerOptions {
    public command = '';
    public lang = '';
    public code = '';
    public cwd = '';
    public shell = true;
    public env?: NodeJS.ProcessEnv | undefined;
    public contextValue: Map<number, vscode.NotebookCellOutputItem> = new Map();
}

async function genFilename() {
    for (let i = 0; i < 25; i++) {
        const t = path.join(os.tmpdir(), 'code-runner-' + randomBytes(6).toString('hex'));
        try {
            await fs.access(t);
        } catch (e: any) {
            if (e.code === 'ENOENT') {
                return t;
            } else {
                throw e;
            }
        }
    }
    throw new Error('can not generate temp filename');
}

export class CodeExecutor {
    private _stdout?: vscode.NotebookCellOutput;
    private _stderr?: vscode.NotebookCellOutput;
    private _languageSupport: LanguageSupport;
    private _macroProvidedConfig: MacroConfig;
    private _filename?: string;
    private readonly _cellExecutions: vscode.NotebookCellExecution;
    public readonly options: RunnerOptions;

    constructor(options: RunnerOptions, cellExecutions: vscode.NotebookCellExecution) {
        this.options = options;
        this._cellExecutions = cellExecutions;
        if (!languages.has(this.options.lang)) {
            throw new Error(`unsupported language '${this.options.lang}'`);
        }
        const executors = getExecutorsConfig();
        if (Object.prototype.hasOwnProperty.call(executors, this.options.lang) === false) {
            throw new Error(`${this.options.lang} executor has been disabled`);
        }
        this._languageSupport = languages.get(this.options.lang)!;
        this.options.command = executors[this.options.lang].command;
        this.options = Object.assign(this.options, this._languageSupport.generateSpawnOptions());
        this._macroProvidedConfig = macroProcess(this.options.code);
        this.mergeOptions();
    }

    mergeOptions() {
        this.options.code = this.options.code.substring(this._macroProvidedConfig.macroLength);
        if (this._macroProvidedConfig.command) {
            this.options.command = this._macroProvidedConfig.command;
        }
        if (!this.options.command.includes('%p')) {
            this.options.command += ' %p';
        }
    }

    outputAsJSON(data: Buffer): boolean {
        const json = data.toString().trim();
        try {
            if (json[0] === '{' && json[json.length - 1] === '}') {
                JSON.parse(json);
                const item = new vscode.NotebookCellOutputItem(data, 'text/x-json');
                const existedItems = this._stdout!.items.filter((x) => x.mime === 'text/x-json');
                if (existedItems.length === 0) {
                    this._stdout!.items.push(item);
                    this._cellExecutions.replaceOutputItems(this._stdout!.items, this._stdout!);
                } else {
                    vscode.window.showWarningMessage('JSON was printed multiple times, only the first output can be accepted.');
                }
                return true;
            }
        } catch (e) {
            /* empty */
        }
        return false;
    }

    outputAsText(data: Buffer) {
        const item = new vscode.NotebookCellOutputItem(data, 'text/plain');
        const existedItems = this._stdout!.items.filter((x) => x.mime === 'text/plain');
        if (existedItems.length === 0) {
            this._stdout!.items.push(item);
            this._cellExecutions.replaceOutputItems(this._stdout!.items, this._stdout!);
        } else {
            for (const key in this._stdout!.items) {
                if (this._stdout!.items[key].mime === 'text/plain') {
                    this._stdout!.items[key].data = Buffer.concat([this._stdout!.items[key].data, data]);
                    this._cellExecutions.replaceOutputItems(this._stdout!.items, this._stdout!);
                }
            }
        }
    }

    chooseExecutorProxy(): ExecutorProxy {
        const filename = this._filename!;
        if (this._macroProvidedConfig.runat) {
            const runat = this._macroProvidedConfig.runat;
            switch (runat.type) {
                case 'ssh':
                    return new SSHExecutorProxy(filename, runat.sshConfig);
                case 'docker':
                    return new DockerExecutorProxy(filename, runat.dockerConfig);
                default:
                    return new LocalExecutorProxy(filename);
            }
        } else {
            return new LocalExecutorProxy(filename);
        }
    }

    async run() {
        const onStdout = (data: Buffer) => {
            if (this._stdout === undefined) {
                this._stdout = new vscode.NotebookCellOutput([]);
                this._cellExecutions.replaceOutput(this._stdout);
            }
            // wired: appendOutputItems not flush its internal items,
            // so we manage the buffer by ourself.
            if (data[0] === '{'.charCodeAt(0)) {
                if (this.outputAsJSON(data)) {
                    return;
                }
            }
            this.outputAsText(data);
        };

        const onError = (data: Buffer | string) => {
            const item = vscode.NotebookCellOutputItem.stderr(data.toString());
            if (this._stderr === undefined) {
                this._stderr = new vscode.NotebookCellOutput([item]);
                this._cellExecutions.appendOutput(this._stderr);
            } else {
                this._cellExecutions.appendOutputItems(item, this._stderr);
            }
        };

        this._filename = await genFilename();
        this.options.command = this.options.command.replace('%p', this._filename);
        const spawnOptions = {
            cwd: this.options.cwd,
            env: this.options.env,
            shell: true,
            onStdout: onStdout,
            onStderr: onError
        };
        const executor = this.chooseExecutorProxy();
        const code = this._languageSupport.generateContextCode(this.options.contextValue) + this.options.code;
        this._cellExecutions.token.onCancellationRequested(executor.killProcess.bind(executor));

        await this._cellExecutions.clearOutput();
        await executor.writeFile(code);
        try {
            const ret = await executor.spawnProcess(this.options.command, [], spawnOptions);
            ret !== 0 && onError(`return with ${ret}`);
        } finally {
            await executor.cleanup();
        }
    }
}
