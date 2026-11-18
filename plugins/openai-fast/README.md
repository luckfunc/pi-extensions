# OpenAI Fast

- `/fast`：为当前 OpenAI Codex 模型切换 Fast。开启后底栏显示 `⚡ Fast`，请求使用 `service_tier: "priority"`。不维护固定模型名单，实际是否支持由服务端决定。
- `/ultrafast`：切换 Ultrafast。开启后底栏显示 `⚡ Ultrafast`，请求使用 `service_tier: "ultrafast"`。只允许本地 Codex 模型缓存（`$CODEX_HOME/models_cache.json`，默认 `~/.codex/models_cache.json`）中明确声明支持的模型。缓存缺失或不可读时，普通 Fast 仍可用。

两档互斥，默认关闭，再输入当前档位的命令即可关闭。切到不支持当前档位的模型、新开会话或重载插件都会关闭。开启加速模式可能消耗更多额度。

单独安装：在仓库根目录运行 `pi install ./plugins/openai-fast`，然后重启 Pi 或执行 `/reload`。
