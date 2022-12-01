/* eslint-disable @typescript-eslint/no-non-null-assertion */
import { randomBytes } from 'crypto';
import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs/promises';
import * as child_process from 'child_process';
import * as vscode from 'vscode';
import treeKill = require('tree-kill');

import runPython from './python';
import runShell from './shell';
import runJavascript from './javascript';
import runPhp from './php';

export class RunnerOptions {
    public lang = '';
    public code = '';
    public cwd = '';
    public contextValue: Map<number, string | object> = new Map();
    public spawnOption?: child_process.SpawnOptionsWithoutStdio;
}

type Executor = {
    (filename: string, options: RunnerOptions): Promise<child_process.ChildProcessWithoutNullStreams>;
};

const executors = new Map<string, Executor>();
executors.set('python', runPython);
executors.set('shellscript', runShell);
executors.set('javascript', runJavascript);
executors.set('php', runPhp);

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
    private _process?: child_process.ChildProcessWithoutNullStreams;
    private _filename = '';
    private _isRunning = false;
    private _stdout?: vscode.NotebookCellOutput;
    private _stderr?: vscode.NotebookCellOutput;
    private readonly _cellExecutions: vscode.NotebookCellExecution;
    public readonly options: RunnerOptions;

    constructor(options: RunnerOptions, cellExecutions: vscode.NotebookCellExecution) {
        this.options = options;
        this.options.spawnOption = { cwd: options.cwd, shell: true };
        this._cellExecutions = cellExecutions;
        if (!executors.has(this.options.lang)) {
            throw new Error(`unsupported language '${this.options.lang}'`);
        }
    }

    runAndWait(process: child_process.ChildProcessWithoutNullStreams) {
        return new Promise<void>((resolve, reject) => {
            const endRunner = (success: boolean) => {
                this._isRunning = false;
                try {
                    fs.unlink(this._filename);
                } catch (error) {
                    console.error(`code executor temp file ${this._filename} not exists`);
                }
                success ? resolve() : reject();
            };

            const onStdout = (data: Buffer) => {
                // wired: appendOutputItems not flush its internal items,
                // so we manage the buffer by ourself.
                if (this._stdout === undefined) {
                    const items = [new vscode.NotebookCellOutputItem(data, 'text/plain')];
                    this._stdout = new vscode.NotebookCellOutput(items);
                    this._cellExecutions.replaceOutput(this._stdout);
                } else {
                    this._stdout.items[0].data = Buffer.concat([this._stdout.items[0].data, data]);
                    this._cellExecutions.replaceOutputItems(this._stdout.items[0], this._stdout);
                }
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

            process.on('close', (ret: number) => {
                if (this._isRunning) {
                    ret !== 0 && onError(`return with ${ret}`);
                    endRunner(ret === 0);
                }
            });
            process.on('error', () => {
                if (this._isRunning) {
                    endRunner(false);
                }
            });
            process.stdout.on('data', onStdout);
            process.stderr.on('data', onError);
        });
    }

    async run() {
        const onCellExecutionCancel = () => {
            if (this._process !== undefined && !this._process.killed) {
                treeKill(this._process.pid!);
            }
        };

        await this._cellExecutions.clearOutput();
        this._cellExecutions.token.onCancellationRequested(onCellExecutionCancel);
        this._filename = await genFilename();
        const executor = executors.get(this.options.lang)!;
        this._isRunning = true;
        this._process = await executor(this._filename, this.options);
        await this.runAndWait(this._process);
    }
}
