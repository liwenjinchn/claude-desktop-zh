# macOS 运行时中文

当前源码候选 0.2.2 支持外部 `ion-dist` 目录和 Claude 4.29.0 的 `ion-dist.asar` 布局。官方语言目录只加载到运行中的第三方 Gateway 窗口内存，不修改 `Claude.app`、ASAR 或应用签名，不改变 Gateway。

## 首次准备

需要 Node.js 22+、Claude 第三方 Gateway 配置、单个 Claude 主进程，以及兼容的官方中文基础/动态目录。magpie 当前推荐安装 `github:liwenjinchn/claude-desktop-zh`，只保留一个同源记录；npm latest 0.1.1 尚不含本仓库的 macOS 实现。

以下源码命令必须在仓库根目录执行；从已安装插件运行时，可将 `node bin/claude-3p-zh.mjs` 换成 `node "$HOME/.config/magpie/plugins/node_modules/magpie-claude-zh/bin/claude-3p-zh.mjs"`。

```sh
cd /path/to/claude-desktop-zh
node bin/claude-3p-zh.mjs runtime-setup-status
# 等待当前任务结束，并通过 ⌘Q 正常退出 Claude 后执行：
node bin/claude-3p-zh.mjs runtime-setup
```

macOS 不会自动完成首次准备。`runtime-setup` 只在 Claude 完全退出后备份、校验并合并 `allowDevTools=true`；不会写入运行中的配置。watcher 遇到未准备状态会返回 `needs-setup`。

给 **magpie** 授予界面控制权限：系统设置 → 隐私与安全 → 辅助功能；macOS 27.2 的名称为「设备控制和数据访问」。如系统询问，另允许 magpie 自动化 **System Events**。独立 CLI 自动操作时，权限应授予其终端。授权修好后重新保存插件设置或正常退出并重开 Claude，以触发重试。旧 `UI elements enabled` 全局标志可能与实际授权不符，工具以真实菜单操作的结果判断权限。

## 获取官方目录

插件使用 `~/Library/Application Support/claude-desktop-zh/catalogs`。CLI 未指定路径时可能使用当前目录的 `.catalogs`；为避免两者分离，所有目录命令显式使用同一个 `--catalog-dir`：

```sh
CATALOG_DIR="$HOME/Library/Application Support/claude-desktop-zh/catalogs"

# 已有合法取得的官方 JSON：
node bin/claude-3p-zh.mjs catalog import --locale zh-Hans --kind base --file /path/to/zh-Hans.json --catalog-dir "$CATALOG_DIR"
node bin/claude-3p-zh.mjs catalog import --locale zh-Hans --kind dynamic --file /path/to/zh-Hans.dynamic.json --catalog-dir "$CATALOG_DIR"

# 或读取本机已有的 Claude Chromium 缓存：
node bin/claude-3p-zh.mjs catalog cache --locale zh-Hans --catalog-dir "$CATALOG_DIR"

# 或直接请求官方目录：
node bin/claude-3p-zh.mjs catalog fetch --kind base --locale zh-Hans --catalog-dir "$CATALOG_DIR"
node bin/claude-3p-zh.mjs catalog fetch --kind dynamic --locale zh-Hans --catalog-dir "$CATALOG_DIR"
```

官方下载在部分网络会遇到 Cloudflare 403；插件不会绕过挑战。失败时需导入已取得的官方文件或可读缓存。基础目录按当前英文键集检查，覆盖率低于 95% 时拒绝；占位符不兼容的条目回退英文。官方资源不入 Git 或 npm 包，旧版本覆盖率不能作为新 Claude 版本已兼容的证明。

## 日常使用

保持 magpie 运行、插件启用和「启动时加载中文」开启，从原入口启动 Claude。macOS 后台监听对新 Claude 进程调用同一 CLI，不启动或强杀 Claude。此开关控制 macOS watcher；独立 CLI 不常驻。

手动操作：

```sh
node bin/claude-3p-zh.mjs mac-status
node bin/claude-3p-zh.mjs mac-apply --locale zh-Hans --catalog-dir "$CATALOG_DIR"
node bin/claude-3p-zh.mjs mac-restore
```

`mac-apply` 使用 Claude 自带 Developer → Enable Main Process Debugger，核对 inspector 的 PID/可执行文件身份，给 `app://localhost` 页面加载语言。源码还会核对页面语言模块 SHA256；未知锚点或漂移会停止。正常完成会关闭本次打开的调试端口。页面刷新（⌘R）后的窗口需工作台「立即加载中文」或 CLI 再次应用，不等于新进程启动。

`mac-restore` 移除本次 fetch/清单/语言覆盖；Claude 自己保存的语言若为中文，撤销后未必变回英文。`--manual` 要求用户先手动打开主进程调试器，再执行命令；`--keep-inspector` 仅供诊断，本地 Node inspector 无认证，不应长期保留。应用菜单可能顺带打开 Chrome 的 `chrome://inspect`，该标签可关闭。

## 验证与边界

2026-10-28，本机 macOS 27.2、Claude 4.29.0、第三方 Gateway 已实测真实 magpie watcher：正常退出后原入口重新启动，无手动 apply 或切换页面，Code 主界面「新会话/新建/例程/自定义/选择环境」等显示中文，9229 端口关闭。此前 3.6556.2 的 CLI 注入、撤销再应用也有本机结果。

该证据限于本机/当前版本/简体；尚不代表从零冷安装、繁体、所有页面、其他机器或后续更新通过。0.2.2 尚未发布至 npm。当前插件只处理语言，不提供官方账号版整套页面替换，也不改变账号身份或服务权限。

工具只报告来源、页面 id 和语言状态，不输出聊天正文、标题或网关凭据。不改签名、Keychain、SIP、Gatekeeper 或系统权限；首次 `allowDevTools` 配置由用户正常退出后运行的事务处理。使用应用菜单，不使用命令行调试校验绕过。

## 故障处理

- `RuntimeSetupRequired` / `needs-setup`：正常退出 Claude，执行 `runtime-setup`，再打开。
- `needs-accessibility`：授权实际执行者 magpie/终端及其 System Events 自动化，之后重新保存设置或重开 Claude。
- `discovery-failed`：检查应用位置、Claude 版本和插件版本；0.2.1 不支持 4.29.0 的归档资源布局。
- 目录缺失/不兼容：确认 `--catalog-dir` 与插件一致，基础和动态目录均已导入，资源与当前英文键集兼容。
- 9229 被其他 inspector 占用：关闭冲突调试器再试；工具不会向其他 PID 注入。
- 状态成功但界面未更新：先核实可见页面；早期已打开的视图可能保留旧渲染，切换到其他页面后返回再检查。冷启动结果应单独验证。

[安装步骤](first-install.md) · [插件设置](magpie.md) · [反馈问题](https://github.com/liwenjinchn/claude-desktop-zh/issues)
