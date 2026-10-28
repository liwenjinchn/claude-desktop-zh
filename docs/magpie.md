# 插件设置与常见问题

当前安装路径为 `github:liwenjinchn/claude-desktop-zh` 或本仓库目录；同源插件只保留一个安装记录。macOS 首次准备见[安装步骤](first-install.md)。

| 设置 | 用法 |
| --- | --- |
| 语言 | 默认简体，也可选择繁体；繁体尚未完成本机实机验收 |
| 启动时加载中文 | macOS：控制后台监听；Windows：控制首次准备及自动加载 |
| 保存设置 | 将偏好交给新插件宿主；当前窗口不会因此自动撤销已有语言 |

保持 magpie 运行，从原来的 Claude 入口打开。macOS watcher 处理新 Claude 进程，不启动或强杀应用；页面刷新后，通过「语言资源维护 → 立即加载中文」或 CLI 再次加载。「撤销中文注入」移除本次内存覆盖。

## macOS 前置条件

- Claude 使用第三方 Gateway，已在完全退出时运行 `runtime-setup` 开启 `allowDevTools`。
- 给 magpie 授予界面控制及 System Events 自动化权限；只给终端授权不会替 magpie 授权。
- 官方目录与插件使用相同的 `~/Library/Application Support/claude-desktop-zh/catalogs`，导入命令显式加 `--catalog-dir`。

没有自动化权限时，可以手动打开 Developer → Enable Main Process Debugger，再从源码目录执行 `node bin/claude-3p-zh.mjs mac-apply --manual --catalog-dir "$HOME/Library/Application Support/claude-desktop-zh/catalogs"`。插件使用应用自带菜单，正常完成后关闭调试端口，不修改应用或签名。

## 查看状态与重试

可通过插件工具 `claude_zh_sync_status` 查看状态：

| 状态 | 含义及处理 |
| --- | --- |
| waiting-for-normal-exit | Windows 等待用户正常退出应用 |
| waiting-for-claude | 等待 Claude 进程或窗口就绪 |
| needs-setup | 正常退出后运行 `runtime-setup`，再打开 |
| needs-accessibility | 为实际运行插件的 magpie 授予权限 |
| discovery-failed | 安装资源无法识别；检查 Claude 版本兼容性 |
| Applied | 已收到语言加载回执；仍应核实可见页面 |

修复条件后重新保存插件设置，或正常退出后重开 Claude。若停在失败状态，附上插件版本、Claude 版本和状态反馈；不要提供网关密钥或聊天内容。

## 更新、关闭与版本

macOS 保存设置后由新宿主接管监听；关闭自动加载或停用插件影响后续加载，当前窗口已有的中文需通过工作台撤销或随应用退出清除。Windows 设置从下次启动生效。

Claude 更新可能改变资源目录、语言模块或导出；校验失败会停止。4.29.0 的 `ion-dist.asar` 支持从源码 0.2.2 开始提供，旧 v0.2.1 不含此修复。

已安装版本以 magpie 插件详情为准。[GitHub Releases](https://github.com/liwenjinchn/claude-desktop-zh/releases) 与 [npm](https://www.npmjs.com/package/magpie-claude-zh) 是独立分发来源；截至 2026-10-28 npm latest 为原作者 Windows 版 0.1.1。应用自带调试器可能打开 Chrome 的 `chrome://inspect`，该标签可关闭。

[macOS 说明](macos.md) · [反馈问题](https://github.com/liwenjinchn/claude-desktop-zh/issues) · [返回 README](../README.md)
