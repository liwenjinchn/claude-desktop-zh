# magpie 集成

已核对 magpie 源码提交 `a61a6f954695e65e7a55dbf4148eb4b2617bd51c`。插件页面可以保存选项，但不能执行本工具或读取 Claude 网关状态。本文描述源码能力，不代表用户安装的旧版本也有此 API。

## 安装设置页

在项目根目录执行：

```sh
magpie plugin add ./integrations/magpie
```

插件只有 `magpie.page`，不声明 `main` 或 `exports`，不启动 Bun host、不申请数据读取权限、不使用 postinstall。页面默认简体，支持繁体，并生成相应的 `switch` 命令。保存设置只影响插件自己的选项，运行 CLI 才会修改独立副本。

当前能力通过源码和隔离 bridge 模拟验证；尚未安装进本机 magpie 的真实宿主测试。

## 为什么没有自动汉化

官方插件页在 `allow-scripts` iframe 中运行，CSP 限制 `connect-src 'none'`。页面通过 bridge 调用 `options.get`、`options.set`，公开只读权限只有 `usage:summary` 和 `providers:list`。没有 `agents:read`、执行进程、文件写入或自定义 action。

Gateway middleware 运行于 moejs，没有 Node 文件 API、fetch 或 timers。Agent 插件用于增加新 agent，不能覆盖已内置的 `claude-desktop`。OpenCode tool hook 虽能在 Bun host 中执行工具，但它是模型工具接口，不是网关开启或应用启动事件；本项目不把文件修改伪装成模型 provider。

将来适合向上游建议：用户点击后调用的插件 action、最小的 agent 状态读取，以及网关配置变更事件。得到这些正式接口后，适配器仍调用当前 CLI，并使用同一套安装和恢复检查。

## 证据

- [页面声明和权限](https://github.com/yetone/magpie/blob/a61a6f954695e65e7a55dbf4148eb4b2617bd51c/internal/plugin/page.go)
- [页面 bridge](https://github.com/yetone/magpie/blob/a61a6f954695e65e7a55dbf4148eb4b2617bd51c/internal/gui/pagebridge.js)
- [插件页面沙箱](https://github.com/yetone/magpie/blob/a61a6f954695e65e7a55dbf4148eb4b2617bd51c/internal/gui/pluginpage.go)
- [Claude 网关接入逻辑](https://github.com/yetone/magpie/blob/a61a6f954695e65e7a55dbf4148eb4b2617bd51c/internal/agent/claudedesktop.go)
- [官方插件说明](https://github.com/yetone/magpie/blob/a61a6f954695e65e7a55dbf4148eb4b2617bd51c/docs/reference.md)
