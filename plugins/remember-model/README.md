# Remember Model

自动把通过 `/model` 或 `Ctrl+P` 选中的模型保存为 Pi 的全局默认模型。下次新建空白会话时会继续使用最后选择的模型，不需要再按 `Ctrl+S`。

恢复旧会话不会改写全局默认模型，SDK 等无交互模式也不会写入设置。

单独安装：

```sh
pi install ./plugins/remember-model
```

安装后重启 Pi，或在已有会话中执行 `/reload`。
