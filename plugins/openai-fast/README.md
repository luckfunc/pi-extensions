# OpenAI Fast

- `/fast`：为当前 OpenAI Codex 模型切换 Fast。开启后底栏显示 `⚡ Fast`，请求使用 `service_tier: "priority"`。不维护固定模型名单，实际是否支持由服务端决定。
- `/ultrafast`：切换 Ultrafast。开启后底栏显示 `⚡ Ultrafast`，请求使用 `service_tier: "ultrafast"`。只允许本地 Codex 模型缓存（`$CODEX_HOME/models_cache.json`，默认 `~/.codex/models_cache.json`）中明确声明支持的模型。缓存缺失或不可读时，普通 Fast 仍可用。

两档互斥，首次使用时默认关闭。选中的档位保存在 Pi 的用户配置目录（默认 `~/.pi/agent/openai-fast.json`），下次启动、新开会话或 `/reload` 时自动恢复。切到不支持当前档位的模型时暂停加速，切回兼容模型会恢复；再输入已保存档位的命令即可关闭并清除记录。非交互模式不自动启用加速，也不会读取或修改 Codex 的 `config.toml`。开启加速模式可能消耗更多额度。

单独安装：在仓库根目录运行 `pi install ./plugins/openai-fast`，然后重启 Pi 或执行 `/reload`。
