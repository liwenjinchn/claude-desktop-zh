# 插件设置与常见问题

在 magpie 中打开「Claude 中文」插件设置页。Windows 使用自动首次准备；macOS 在「语言资源维护」工作台中点击「立即加载中文」。

| 设置 | 用法 |
| --- | --- |
| 语言 | 默认简体，可选择繁体；保存后用于下次启动 |
| 启动时加载中文 | Windows：开启后自动为新打开的 Claude 加载中文；macOS 不依赖此项 |
| 保存设置 | 保存本页选择 |

使用时保持 magpie 运行，Claude 从原来的入口打开即可。

## macOS

1. 给 magpie 授予「辅助功能」权限，并保持 magpie 运行。
2. 打开 Claude 的第三方 Gateway 窗口。插件会监听新的 Claude 进程，自动加载中文；不需要每次运行命令。
3. 首次安装、自动加载失败或页面刷新（⌘R）后，可在「语言资源维护」工作台点击「立即加载中文」；点击「撤销中文注入」可移除本次运行时覆盖。

「启动时加载中文」开关控制 macOS 的后台监听；关闭后只保留手动按钮。加载通过 Claude 自己的开发者主进程调试器完成，不修改应用、签名或网关；结束后会关闭调试器。需要 Claude 已开启 `allowDevTools`，并给 magpie 授予辅助功能权限。没有权限时可手动打开 Developer → Enable Main Process Debugger，再使用 CLI 的 `mac-apply --manual`。

macOS 加载是每个窗口生效；退出 Claude 再打开会自动重新加载，页面刷新不会。应用菜单的调试器操作可能顺带打开 Chrome 的 `chrome://inspect`，关闭该标签即可。

## 查看插件版本

已安装版本在 magpie 的插件详情中查看，当前公开版本见 [npm](https://www.npmjs.com/package/magpie-claude-zh)，版本说明见 [GitHub Releases](https://github.com/polang233/claude-desktop-zh/releases)。反馈问题时，请附上插件版本、Claude 版本和加载状态。

## 没有出现准备完成通知

先确认 Claude 已通过「文件 → 退出」完全退出。关闭窗口可能只是缩到托盘。Windows 通知也可能被系统通知设置隐藏。

可在 magpie 中通过插件工具 claude_zh_sync_status 查看状态：waiting-for-normal-exit 表示仍在等待退出，watching 表示已准备好，Applied 表示本次中文已加载。

## 启动时弹出窗口

加载中文时会短暂打开调试窗口和文件选择框。请保持 Claude 在前台，等待它们自动收起。如果停住，保留现场并记录插件状态，便于排查。

## Claude 更新后没有加载中文

将插件关闭再启用，让它重新检查语言资源。资源暂不兼容时，请附上 Claude 版本和插件状态反馈。

## 调整或停用

Windows：语言选择和自动加载开关保存后从下次启动生效，当前窗口保持现状。macOS：保存后新宿主会接管后台监听；当前窗口如果还没有中文，可在工作台点击「立即加载中文」。

[安装步骤](first-install.md) · [返回 README](../README.md)
