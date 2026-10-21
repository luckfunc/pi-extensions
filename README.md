# pi-extensions

Pi 插件集合。

- [prompt-prefix](plugins/prompt-prefix) 给输入框加上青色 `❯` 前缀，需要设置 `editorPaddingX: 2`。
- [pstack](plugins/pstack) 将 [Cursor pstack](https://github.com/cursor/plugins/tree/main/pstack) 适配到 Pi，支持持续启用的工程工作模式和子代理。

## 安装全部

```sh
pi install git:github.com/luckfunc/pi-extensions
```

## 单独安装

先克隆仓库。

```sh
git clone https://github.com/luckfunc/pi-extensions.git
cd pi-extensions
```

只安装输入框前缀。

```sh
pi install ./plugins/prompt-prefix
```

或者，只安装 pstack。

```sh
pi install ./plugins/pstack
```

全量安装和单独安装二选一，避免重复加载。单独安装后请保留克隆的目录，Pi 直接从该目录加载插件。

已有会话执行 `/reload`。输入 `/pstack` 切换 pstack 开关，输入 `/pstack on` 启用，输入 `/pstack off` 关闭。
