# macOS 运行时中文

2026-10-28 在 macOS 27.2、Claude Desktop 3.6556.2 第三方 Gateway 模式上实机验证：官方中文目录在运行中的窗口内存加载，主界面切换为简体中文。没有修改 `Claude.app` 或 `app.asar`，没有重新签名，没有改 Gateway，也没有改 SIP、Gatekeeper、entitlement 或 Keychain。

## 为什么不用改包

macOS 版本的应用包只带一部分官方语言目录，`ion-dist/i18n` 里没有 `zh-Hans`。应用本身提供了一个开发者功能：**Developer → Enable Main Process Debugger**（由 `developer_settings.json` 的 `allowDevTools` 控制）。打开后，主进程在 `127.0.0.1:9229` 暴露 Node inspector；我们通过它调用 Electron 的 `webContents.executeJavaScript`，把官方中文目录交给页面自己的语言 store。整个过程只在目标窗口的内存里发生。

应用会拒绝命令行上的调试/网络覆盖开关（例如 `--remote-debugging-port`、`--remote-debugging-pipe`），也有一套需要私钥的 `CLAUDE_CDP_AUTH` E2E 机制。本项目不使用、也不绕过这些校验；使用的是应用自己的开发者菜单。

## 前置条件

- macOS，Claude 已配置为第三方 Gateway 模式（与 Windows 插件相同的 3p 条件）。
- Node.js 22 或以上。
- Claude 的 `developer_settings.json` 中 `allowDevTools` 为 `true`。未开启时先正常退出 Claude，再运行 `runtime-setup`；不要在 Claude 运行时写这个文件。
- 运行命令的终端（或安装插件后的 magpie）已获得「辅助功能」权限。工具需要用 System Events 点击 Claude 的开发者菜单；没有权限时可用 `--manual` 手动打开菜单。
- 官方中文基础/动态目录。目录会按英文键集做覆盖率和占位符兼容检查，基础覆盖率低于 95% 时拒绝应用。
- 单实例：同时运行多个 Claude.app 实例时工具会安全拒绝。
- 自动加载依赖 magpie 保持运行，并且 magpie 已获得辅助功能权限；独立 CLI 不会在后台常驻。

## 获取官方目录

官方目录直接从 `claude.ai` 下载在部分网络会触发 Cloudflare 挑战（本机实测 `catalog fetch` 返回 403）。已导入的官方目录可以复用，也可以从浏览器或 Claude 的 Chromium 缓存导入：

```sh
# 已有官方 JSON 时
node bin/claude-3p-zh.mjs catalog import --locale zh-Hans --kind base --file zh-Hans.json
node bin/claude-3p-zh.mjs catalog import --locale zh-Hans --kind dynamic --file zh-Hans.dynamic.json

# 或从 Claude 的 Chromium block cache 读取
node bin/claude-3p-zh.mjs catalog cache --locale zh-Hans
```

当前 3.6556.2 的校验结果：基础目录 37,201 个英文键中命中 36,304 个（97.59%，3 个占位符不兼容回退英文），动态目录 49/49。官方资源不入 Git，默认保存在 `~/Library/Application Support/claude-desktop-zh/catalogs`（插件安装时）。

## 使用

```sh
node bin/claude-3p-zh.mjs mac-status
node bin/claude-3p-zh.mjs runtime-setup-status
node bin/claude-3p-zh.mjs mac-apply --locale zh-Hans
node bin/claude-3p-zh.mjs mac-restore
```

- `mac-apply` 在已经运行的 3p 窗口上加载中文。它会打开主进程调试器、连接、注入、等待页面回执，然后关闭调试器。Claude 未运行时默认报错；可以加 `--launch` 让工具先打开 Claude。重复应用时应用可能已持有同一语言，`catalogRequestsServed` 可以为 0；只要 `messagesLocale` 为 `zh-Hans` 且未撤销，就视为成功。
- `mac-restore` 调用页面运行时的 `restore()`，移除本次注入的 fetch/清单/语言覆盖并关闭调试器。它不保证把界面变回英文：如果 Claude 自己的配置已经是 `zh-Hans`，恢复后的界面可能仍显示中文；需要另外改应用语言设置。
- `mac-status` 只读显示应用、3p、`allowDevTools`、调试器端口和最近一次结果。
- `--manual`：跳过辅助功能自动化，要求你先在 Claude 中打开 Developer → Enable Main Process Debugger；工具仍会校验 inspector 的 PID 和可执行文件路径。
- `--keep-inspector`：仅调试用。Node inspector 没有认证，使用完应立即关闭；正常命令会自动关闭。

macOS 的加载是**每个窗口**的。从 magpie 安装并保持 magpie 运行时，后台监听会在每个新的 Claude 进程出现后自动调用 `mac-apply`，不需要每次手动运行；独立 CLI 不常驻。页面刷新（⌘R）不会自动重新加载，需要工作台按钮或 CLI 再次执行。

应用菜单里的 `Enable Main Process Debugger` 会顺带让 Claude 打开 Chrome 的 `chrome://inspect`。这是应用自身的行为；工具不会操作这个 Chrome 标签，看到时可以关闭。

## magpie 插件

插件的 macOS 路径启动一个轻量后台监听：保持 magpie 运行，打开 Claude 后会自动加载中文；「启动时加载中文」开关控制这个监听。监听只对新出现的 Claude 进程执行，不启动、不强杀 Claude。npm 上的 `magpie-claude-zh@0.1.1` 仍是 Windows 版本；要在 magpie 中使用 macOS 代码，先在插件页移除旧的 npm 条目，再从本仓库文件夹或 GitHub 仓库安装（同一插件只能保留一个启用条目）。首次、失败或刷新后，可在「语言资源维护」工作台点击「立即加载中文」或「撤销中文注入」。工作台和 CLI 调用同一套实现。

macOS 上需要给 magpie 授予辅助功能权限；如果没有，使用 `--manual` 的手动流程。设置页的「启动时加载中文」控制 macOS 后台监听；Windows 用它控制首次准备和自动加载。

## 安全边界

- 主进程调试器只监听 `127.0.0.1:9229`，但 Node inspector 本身没有认证；工具在注入后立即关闭它。不要在 `--keep-inspector` 状态下长期运行。
- 工具不读取、不输出聊天正文、会话标题或网关凭据；结果只包含 `app://localhost` 来源、页面 id 和语言状态。
- 不修改 `.app`、`app.asar`、签名、Keychain、SIP、Gatekeeper 或系统权限；不写 Claude 的 profile 配置。`allowDevTools` 的写入只在 Claude 正常退出后，由 `runtime-setup` 的事务完成。
- 只对 `app://localhost` 的 3p 前端注入；登录页等其他来源不会被执行。

## 限制与故障处理

- `RuntimeSetupRequired`：`allowDevTools` 未开启。正常退出 Claude 后运行 `runtime-setup`，再打开 Claude。
- `Accessibility permission is required`：到「系统设置 → 隐私与安全性 → 辅助功能」给终端或 magpie 授权；或使用 `--manual`。
- `Port 9229 is already used by another Node inspector`：先关闭占用端口/Claude 的旧调试器。工具不会对不匹配 PID 的 inspector 注入。
- 早期实现漏挂了 CDP WebSocket 的响应回调，导致所有 `Runtime.enable`/求值都报超时；现在已修复消息分发，并给页面激活和主进程求值都加了超时。如果仍遇到旧会话留下的无响应 inspector，正常退出并重新打开 Claude 即可清掉。
- 应用更新后语言运行时文件或 store 导出可能变化；`mac-apply` 每次重新构建并以 SHA-256 校验，漂移会停止而不是猜测。
- 菜单标签当前识别英文 `Enable Main Process Debugger` 和中文「启用主进程调试器」；其他界面语言需要补充标签。
- 繁体 `zh-Hant` 已有同一路径的代码支持，但本机只实测了简体。

## 历史说明：签名限制

旧版文档记录过 `.app` 内新增 JSON 或修改外置 JS 会破坏资源签名，且 `ElectronAsarIntegrity` 覆盖 ASAR header hash。这也是本项目不走「复制应用后改文件」的原因；现在的运行时路径不需要触碰这些内容。Apple TN2206 和 Electron ASAR integrity 的参考仍然有效。

## 参考项目

- [javaht/claude-desktop-zh-cn](https://github.com/javaht/claude-desktop-zh-cn)，语言注册结构参考；其 macOS 方案需要重签。
- [wangbigtiger33-boop/claude-desktop-chinese-localization](https://github.com/wangbigtiger33-boop/claude-desktop-chinese-localization)，JSON/ASAR 注入方案。
- [ooac/Claude-desk-cn](https://github.com/ooac/Claude-desk-cn)，JSON、菜单资源和重签方案。

本项目不复制这些项目的实现源码，也不继承模型校验修改、Frida 注入、更新接管或其他网关功能。
