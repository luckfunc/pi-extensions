# pi-plugins

个人 Pi 插件集合。原仓库名为 `pi-prompt-prefix`，原提交历史保留。

## 插件

| 插件 | 作用 | 文档 |
| --- | --- | --- |
| prompt-prefix | 在输入框第一行显示青色 `❯ ` 前缀，需要 `editorPaddingX: 2`。 | [使用说明](plugins/prompt-prefix/README.md) |
| pstack | 工程工作流和技能，提供持续启用的 `/pstack` 模式、绿色状态点及 `task` 子代理工具。 | [使用说明](plugins/pstack/README.md) |

## 安装两个插件

```sh
pi install git:github.com/luckfunc/pi-plugins
```

在 `~/.pi/agent/settings.json` 中设置 `"editorPaddingX": 2`。已有会话执行 `/reload`。

使用 pstack 时，运行 `/pstack`。之后每轮持续启用，状态栏显示绿色 `● pstack`。运行 `/pstack off` 关闭。

## 只安装其中一个

克隆仓库后，安装对应子目录。

```sh
git clone https://github.com/luckfunc/pi-plugins.git
cd pi-plugins
pi install ./plugins/prompt-prefix
# 或者
pi install ./plugins/pstack
```

不要同时安装仓库根目录和子目录，否则会重复加载。

## 本地开发

```sh
pi install ./
```

修改后在 Pi 中执行 `/reload`。

如果以前将 `prompt-prefix.js` 放在 `~/.pi/agent/extensions/`，请先将旧文件移出该目录，避免重复加载。

## 同步 pstack 上游

pstack 来源于 [cursor/plugins](https://github.com/cursor/plugins/tree/main/pstack)，上游采用 MIT 许可证。许可证位于 [plugins/pstack/LICENSE](plugins/pstack/LICENSE)。Pi 适配说明见 [PORTING.md](plugins/pstack/PORTING.md)。

更新时，先检查上游差异，再保留 Pi 专用适配。当前同步脚本会覆盖角色简报，且其目录清理会删除 Pi 专用的 `setup-pstack`，不要直接运行它。同步版本记录在 `plugins/pstack/.upstream-rev`。
