import * as ChildProcess from 'child_process';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as vscode from 'vscode';
import { randomBytes } from 'crypto';
import * as os from 'os';
import { NodeSSH, Config as SSHConfig } from 'node-ssh';
import treeKill = require('tree-kill');
import { shellStringEscape } from '../utils';

export interface SpawnOptions {
    cwd?: string | URL | undefined;
    env?: NodeJS.ProcessEnv | undefined;
    shell?: boolean;
    onStdout: (...args: any[]) => void;
    onStderr: (...args: any[]) => void;
}

export interface DockerOptions {
    containerName: string;
    user?: string;
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

export abstract class ExecutorProxy {
    protected _tempFilepath: string;
    constructor() {
        this._tempFilepath = '';
    }
    formatCommand(command: string) {
        if (this._tempFilepath === '') {
            // it should not be here
            throw new Error('tempFilepath must be specified');
        }
        return command.replace('%p', this._tempFilepath);
    }
    abstract writeFile(data: string): Promise<void>;
    abstract spawnProcess(path: string, args: string[], options: SpawnOptions): Promise<number>;
    abstract killProcess(): Promise<void>;
    abstract cleanup(): Promise<void>;
}

export class LocalExecutorProxy extends ExecutorProxy {
    private _process?: ChildProcess.ChildProcessWithoutNullStreams;
    async writeFile(data: string): Promise<void> {
        this._tempFilepath = await genFilename();
        await fs.writeFile(this._tempFilepath, data);
    }
    spawnProcess(command: string, args: string[], options: SpawnOptions): Promise<number> {
        return new Promise((resolve, reject) => {
            this._process = ChildProcess.spawn(this.formatCommand(command), args, { env: options.env, cwd: options.cwd, shell: options.shell });
            this._process.stdout.on('data', (data) => options.onStdout(data));
            this._process.stderr.on('data', (data) => options.onStderr(data));
            this._process.on('close', function (code) {
                resolve(code ?? 0);
            });
            this._process.on('error', function (err) {
                reject(err);
            });
        });
    }
    killProcess(): Promise<void> {
        return new Promise((resolve, reject) => {
            if (this._process && !this._process.killed && this._process.pid) {
                treeKill(this._process.pid, function (err) {
                    err === undefined ? resolve() : reject(err);
                });
            }
        });
    }
    cleanup(): Promise<void> {
        return fs.unlink(this._tempFilepath);
    }
}

export class SSHExecutorProxy extends ExecutorProxy {
    private _localTempFile: string;
    private _sshConnection: NodeSSH;
    private _sshOptions: SSHConfig;
    constructor(sshOption: SSHConfig) {
        super();
        this._localTempFile = '';
        this._sshOptions = sshOption;
        this._sshConnection = new NodeSSH();
    }
    async connect() {
        if (!this._sshConnection.isConnected()) {
            try {
                await this._sshConnection.connect(this._sshOptions);
            } catch (e: any) {
                if (e.level === 'client-authentication') {
                    const passwordInput: string = (await vscode.window.showInputBox({ password: true, title: 'ssh password' })) ?? '';
                    if (passwordInput === '') {
                        throw new Error('ssh authentication failed');
                    }
                    this._sshOptions.password = passwordInput;
                    await this.connect();
                }
            }
        }
    }
    async writeFile(data: string): Promise<void> {
        this._localTempFile = await genFilename();
        // assuming that all remote systems use /tmp as a temporary directory
        this._tempFilepath = '/tmp/' + path.basename(this._localTempFile);
        await this.connect();
        await fs.writeFile(this._localTempFile, data);
        await this._sshConnection.putFile(this._localTempFile, this._tempFilepath);
    }
    async spawnProcess(command: string, args: string[], options: SpawnOptions): Promise<number> {
        await this.connect();
        const response = await this._sshConnection.exec(this.formatCommand(command), args, {
            stream: 'both',
            execOptions: {
                env: options.env,
                pty: true
            },
            onStdout(chunk) {
                options.onStdout(chunk);
            },
            onStderr(chunk) {
                options.onStderr(chunk);
            }
        });
        return response.code ?? 0;
    }
    async killProcess(): Promise<void> {
        if (this._sshConnection.isConnected()) {
            this._sshConnection.dispose();
        }
    }
    async cleanup(): Promise<void> {
        await fs.unlink(this._localTempFile);
        await this.connect();
        const remoteTempFile = this._tempFilepath;
        await this._sshConnection.withSFTP(function (sftp) {
            return new Promise((resolve) => {
                sftp.unlink(remoteTempFile, () => resolve());
            });
        });
        this._sshConnection.dispose();
    }
}

export class DockerExecutorProxy extends ExecutorProxy {
    private _localTempFile: string;
    private _process?: ChildProcess.ChildProcessWithoutNullStreams;
    private _dockerOptions: DockerOptions;
    constructor(dockerOptions: DockerOptions) {
        super();
        this._localTempFile = '';
        this._dockerOptions = dockerOptions;
    }
    async writeFile(data: string): Promise<void> {
        this._localTempFile = await genFilename();
        // assuming that all docker container use /tmp as a temporary directory
        this._tempFilepath = '/tmp/' + path.basename(this._localTempFile);
        await fs.writeFile(this._localTempFile, data);
        return new Promise((resolve, reject) => {
            ChildProcess.exec(`docker cp ${this._localTempFile} ${this._dockerOptions.containerName}:${this._tempFilepath}`, (err, stdout, stderr) => {
                if (err && err.code !== 0) {
                    reject(stderr);
                } else {
                    resolve();
                }
            });
        });
    }
    spawnProcess(command: string, args: string[], options: SpawnOptions): Promise<number> {
        let setEnv = '';
        if (options.env) {
            for (const key in options.env) {
                const value = options.env[key] ?? '';
                setEnv += `-e ${shellStringEscape(key)}=${shellStringEscape(value)} `;
            }
        }
        const setUser = this._dockerOptions.user ? `--user ${this._dockerOptions.user}` : '';
        //TODO: prevent command injection ?
        const dockerCommand = `docker exec -i ${setUser} ${setEnv} ${this._dockerOptions.containerName} ${this.formatCommand(command)}`;
        return new Promise((resolve, reject) => {
            this._process = ChildProcess.spawn(dockerCommand, [], { shell: true });
            this._process.stdout.on('data', (data) => options.onStdout(data));
            this._process.stderr.on('data', (data) => options.onStderr(data));
            this._process.on('close', function (code) {
                resolve(code ?? 0);
            });
            this._process.on('error', function (err) {
                reject(err);
            });
        });
    }
    killProcess(): Promise<void> {
        return new Promise((resolve, reject) => {
            if (this._process && !this._process.killed && this._process.pid) {
                treeKill(this._process.pid, function (err) {
                    err === undefined ? resolve() : reject(err);
                });
            }
        });
    }
    async cleanup(): Promise<void> {
        await fs.unlink(this._localTempFile);
        const dockerTempFile = this._tempFilepath;
        return new Promise((resolve, reject) => {
            ChildProcess.exec(`docker exec ${this._dockerOptions.containerName} rm ${dockerTempFile}`, (err, stdout, stderr) => {
                if (err && err.code !== 0) {
                    reject(stderr);
                } else {
                    resolve();
                }
            });
        });
    }
}
