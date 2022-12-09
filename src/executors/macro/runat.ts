/* eslint-disable @typescript-eslint/naming-convention */
import * as os from 'os';
import * as SSHConfig from 'ssh-config';
import * as fs from 'fs';
import { Config as SSHExportConfig } from 'node-ssh';
import { Directive } from '.';
import * as ChildProcess from 'child_process';
import { getConfig } from '../../utils';

interface SSHHostConfig extends Record<string, string | undefined> {
    HostName?: string;
    User?: string;
    Port?: string;
}

interface DockerConfig {
    containerName: string;
    user?: string;
}

interface RunatSSHConfig {
    type: 'ssh';
    sshConfig: SSHExportConfig;
}

interface RunatDockerConfig {
    type: 'docker';
    dockerConfig: DockerConfig;
}

interface RunatLocalConfig {
    type: 'local';
}

export type RunatConfig = RunatSSHConfig | RunatDockerConfig | RunatLocalConfig;

export const Runat: Directive = class {
    static loadSSHConfig(): Map<string, SSHHostConfig> {
        const customSSHPath = getConfig().get<string>('sshPath')!.replace(/[/\\]+$/,'');
        const sshConfigFile = customSSHPath === '' ? os.homedir() + '/.ssh/config' : customSSHPath + '/config';
        const sshConfigMap = new Map();
        const config = SSHConfig.parse(fs.readFileSync(sshConfigFile).toString());
        for (const line of config) {
            if (line.type === 1 && Object.prototype.hasOwnProperty.call(line, 'config')) {
                const section = line as SSHConfig.ConfigHostDirective;
                const hostConfig: SSHHostConfig = {};
                for (const t of section.config) {
                    if (t.type === 1) {
                        hostConfig[t.param] = t.value;
                    }
                }
                sshConfigMap.set(section.value, hostConfig);
            }
        }
        return sshConfigMap;
    }

    static makeSSH(input: string): SSHExportConfig {
        const sshConfigMap = this.loadSSHConfig();
        const exportConfig: SSHExportConfig = {};
        const customSSHPath = getConfig().get<string>('sshPath')!.replace(/[/\\]+$/,'');
        let privateKeyPath = customSSHPath === '' ? os.homedir + '/.ssh/id_rsa' : customSSHPath + '/id_rsa';
        if (!fs.existsSync(privateKeyPath)) {
            privateKeyPath = '';
        }
        if (sshConfigMap.has(input)) {
            const hostConfig = sshConfigMap.get(input)!;
            if (hostConfig.HostName === undefined) {
                throw new Error('must specify hostname');
            }
            exportConfig.host = hostConfig.HostName;
            exportConfig.username = hostConfig.User ?? 'root';
            exportConfig.port = parseInt(hostConfig.Port ?? '22');
            exportConfig.privateKeyPath = privateKeyPath;
        } else {
            if (!input.startsWith('ssh://')) {
                input = 'ssh://' + input;
            }
            const url = new URL(input);
            if (url.protocol !== 'ssh:') {
                throw new Error('connection url must use the ssh protocol');
            }
            exportConfig.host = url.host;
            exportConfig.port = url.port === '' ? 22 : parseInt(url.port);
            exportConfig.username = url.username === '' ? 'root' : url.username;
            exportConfig.password = url.password;
            exportConfig.privateKeyPath = privateKeyPath;
        }
        return exportConfig;
    }

    static makeDocker(container: string, user?: string): DockerConfig {
        if (!container.match(/^[a-zA-Z0-9][a-zA-Z0-9_.-]+$/)) {
            throw new Error('invalid container id or name');
        }
        if (user && !user.match(/^[a-z0-9_-]{1,30}$/)) {
            throw new Error('invalid username');
        }
        const runningState = ChildProcess.execSync(`docker inspect -f '{{.State.Running}}' '${container}'`).toString();
        if (!runningState.includes('true')) {
            throw new Error('invalid container or container not running');
        }
        return {
            containerName: container,
            user: user
        };
    }

    static parse(line: string): RunatConfig {
        // runat ssh url
        // runat ssh server
        // runat docker container-id [user]
        // runat docker container-name [user]
        const s = line.split(/ +/);
        if (s.length < 3) {
            throw new Error('runat need 3 arguments');
        }
        switch (s[1]) {
            case 'ssh':
                return {
                    type: 'ssh',
                    sshConfig: this.makeSSH(s[2])
                };
            case 'docker':
                return {
                    type: 'docker',
                    dockerConfig: this.makeDocker(s[2], s[3])
                };
            case 'local':
                return {
                    type: 'local'
                };
            default:
                throw new Error(`unknown runat verb ${s[1]}`);
        }
    }
};
