# Interactive Markdown

这是一个VS Code扩展，提供了交互式操作的Markdown Notebook。可用于创建工作流，保存工作进度，为笔记提供一定的自动化扩展。

![example](example/example.png)

## 功能

- 提供了四种脚本语言的执行：Python, Javascript(Node), PHP, Shell
- 可从Markdown文件中保存或读取执行结果
- 代码块的执行结果可共享
- 支持JSON格式的自动反序列化
- 支持在Docker或SSH远程连接中执行脚本

## 使用

- 下载扩展的[vsix](https://github.com/HSwift/interactive-markdown/actions)并安装（早期阶段未上架商店）
- 打开一个markdown，右键文件名打开菜单，选择`重新打开编辑器的方式`
- 选择使用`Interactive Markdown`打开

## 宏

在脚本的开头插入宏可以影响interactive-markdown的执行环境，格式为`#[macro args...]`或`//[macro args...]`，宏只能插入在文件开头，在文件中间的宏不起作用。

现在支持的宏：

- runat 指定运行的环境，支持ssh、docker、WSL和local。
ssh指令可以使用`$HOME/.ssh/config`内定义的host，或者使用url的形式创建连接，在远程环境中执行代码。如果没有指定密码或`$HOME/.ssh/id_rsa`私钥认证失败，则会弹出密码输入框要求再次输入密码。
docker指令可以指定容器的名称或者id，如果容器存在且正在运行，那么会在容器环境内执行代码。同时还可以指定执行时的用户。
local指令为默认的本地执行环境，可以省略。
wsl指令可以指定发行版，如果该发行版存在，那么代码会在对应的WSL环境内运行。如果WSL只有一个发行版，那么可以省略发行版参数。
```
#[runat ssh server]
#[runat ssh username:password@host:port]
#[runat docker container-id username]
#[runat docker container-name]
#[runat local]
#[runat wsl]
```

- command 覆盖配置的执行器路径和参数，%p可以省略，如果省略则会把脚本文件拼接到末尾。
```
#[command /bin/python]
```

## 原理

共享的代码执行结果会以常量定义（如果语言支持的话）的形式插入到生成的代码文件开头，并做一次base64解码，例如javascript的实现：
```js
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
```

常量名前缀由`interactive-markdown.resultLabel`设置，序号为代码块的编号。如果输出包含json和text两种格式，则优先保存json。如果多次输出json，则优先保存第一个。

## 配置

- interactive-markdown.executors
配置脚本语言的执行器路径和参数，`%p`代表生成的代码路径。

- interactive-markdown.resultLabel
共享执行结果的变量名前缀。

- interactive-markdown.sshPath
ssh配置目录，用于读取`ssh/config`和`ssh/id_rsa`，如果留空则使用默认的`$HOME/.ssh/`。

## 感谢

https://github.com/microsoft/vscode-markdown-notebook
