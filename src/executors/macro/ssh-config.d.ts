// from https://github.com/ionic-team/ionic-cli/blob/8f67ccf849b62714bc3218bb0ab644396c42e1d6/types/ssh-config.d.ts

declare module 'ssh-config' {
    namespace SSHConfig {
        var DIRECTIVE: 1;
        var COMMENT: 2;

        interface SSHConfigFindOptions {
            Host?: string;
            Match?: string;
        }

        interface ConfigComment {
            type: typeof COMMENT;
            content: string;
            before: string;
            after: string;
        }

        interface ConfigDirective {
            type: typeof DIRECTIVE;
            before: string;
            after: string;
            param: string;
            value: string;
            separator: string;
        }

        interface ConfigHostDirective extends ConfigDirective {
            config: SSHConfig;
        }

        type ConfigMatchDirective = ConfigHostDirective;

        type Config = ConfigComment | ConfigDirective | ConfigHostDirective | ConfigMatchDirective;

        interface SSHConfig extends Array<Config> {
            find(arg: any): any; // https://github.com/dotnil/ssh-config/blob/40b55c0e31790dd78a0d4364b0e8a0a358293385/index.js#L61
        }

        // function find(config: SSHConfig, options?: SSHConfigFindOptions): ;
        function parse(str: string): SSHConfig;
        function stringify(config: SSHConfig): string;
    }

    export = SSHConfig;
}
