# pi-prompt-prefix

一个很小的 Pi extension：给 Pi 输入框第一行加一个青色 `❯ ` 前缀。

## 内容

```txt
extensions/prompt-prefix.js
```

## 本地安装

```bash
pi install ./plugins/prompt-prefix
```

或者手动在 `~/.pi/agent/settings.json` 里使用 package：

```json
{
  "packages": ["/absolute/path/to/pi-extensions/plugins/prompt-prefix"],
  "editorPaddingX": 2
}
```

如果还保留了旧配置：

```json
"extensions": ["~/.pi/agent/extensions/prompt-prefix.js"]
```

建议迁移后删掉这一项，避免同一个 editor extension 被加载两次。

## 临时试用

```bash
pi -e ./plugins/prompt-prefix
```

## 注意

这个 extension 当前假设 `editorPaddingX` 为 `2`，会把输入框开头两个空格替换成 `❯ `。
