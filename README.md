# pi-plugins

Pi 插件集合。

- [prompt-prefix](plugins/prompt-prefix) 给输入框加上青色 `❯` 前缀，需要设置 `editorPaddingX: 2`。
- [pstack](plugins/pstack) 将 [Cursor pstack](https://github.com/cursor/plugins/tree/main/pstack) 适配到 Pi，支持持续启用的工程工作模式和子代理。

## 安装

```sh
pi install git:github.com/luckfunc/pi-plugins
```

已有会话执行 `/reload`。输入 `/pstack` 启用 pstack，输入 `/pstack off` 关闭。
