<img src="https://raw.githubusercontent.com/polang233/claude-desktop-zh/main/assets/logo.png" width="128" alt="Claude 中文插件图标">

# claude-desktop-zh

[![npm](https://img.shields.io/npm/v/magpie-claude-zh)](https://www.npmjs.com/package/magpie-claude-zh)
[![npm 下载量](https://img.shields.io/npm/dt/magpie-claude-zh?label=npm%20downloads)](https://www.npmjs.com/package/magpie-claude-zh)
[![Node.js](https://img.shields.io/badge/Node.js-%E2%89%A522-43853d)](https://nodejs.org/)
[![Windows](https://img.shields.io/badge/platform-Windows-0078d4)](https://github.com/polang233/claude-desktop-zh#%E5%AE%89%E8%A3%85)
[![macOS](https://img.shields.io/badge/platform-macOS-000000)](https://github.com/polang233/claude-desktop-zh/blob/main/docs/macos.md)
[![MIT](https://img.shields.io/badge/license-MIT-blue)](https://github.com/polang233/claude-desktop-zh/blob/main/LICENSE)

在 magpie 中安装（Windows），或从源码使用（macOS），让原版 Claude Desktop 的第三方 Gateway 模式使用官方中文界面，继续使用原来的设置、会话和历史。

默认简体中文。使用时保持 magpie 运行，从原来的 Claude 入口打开即可。

**npm 包：[`magpie-claude-zh`](https://www.npmjs.com/package/magpie-claude-zh)** · [v0.1.1](https://github.com/polang233/claude-desktop-zh/releases/tag/v0.1.1) · [全部版本](https://github.com/polang233/claude-desktop-zh/releases) · [反馈问题](https://github.com/polang233/claude-desktop-zh/issues)

## 安装

准备好 Windows、magpie 和 Node.js 22 或以上版本，Claude 已配置为第三方 Gateway 模式。

1. 在 magpie 的插件页按 npm 包名 **`magpie-claude-zh`** 添加。也可在「发现 → 非官方插件 · GitHub」中搜索 **claude-desktop-zh**。
2. 保持插件启用，使用默认简体中文和「启动时加载中文」选项。
3. 如果 Claude 正在运行，通过 **File → Exit（文件 → 退出）** 正常退出。看到 Windows 的「中文已准备好」通知后，从原来的入口打开 Claude。

首次准备由插件自动完成。已通过文件夹安装过插件的用户，先在 magpie 中移除旧条目，再安装 npm 包，保留一个安装条目。

源码安装见[安装步骤](https://github.com/polang233/claude-desktop-zh/blob/main/docs/first-install.md)。

## macOS 使用

macOS 通过同一套运行时注入工作：使用 Claude 自己的开发者主进程调试器，把官方中文目录加载到运行中的 3p 窗口内存。不修改 `Claude.app`、不重新签名、不改 Gateway。

在 magpie 中移除旧的 npm 条目，按 `github:liwenjinchn/claude-desktop-zh` 或仓库地址添加本仓库，保持插件启用；首次给 magpie 授予辅助功能权限。保持 magpie 运行，打开 Claude 后会后台自动加载。

要求 Claude 3p Gateway、Node.js 22+、`allowDevTools` 已开启，并给终端或 magpie 授予辅助功能权限。官方目录需先导入；当前版本的基础覆盖率为 97.59%。

```sh
node bin/claude-3p-zh.mjs runtime-setup-status
node bin/claude-3p-zh.mjs mac-apply --locale zh-Hans
node bin/claude-3p-zh.mjs mac-restore
node bin/claude-3p-zh.mjs mac-status
```

从 magpie 安装并保持 magpie 运行时，打开 Claude 会自动加载中文，不需要每次运行命令；独立 CLI 不常驻，页面刷新后需要手动再次执行。详见 [macOS 说明](docs/macos.md)。

npm 上的 `magpie-claude-zh@0.1.1` 仍是 Windows 版本；macOS 代码在当前源码中，尚未发布新版本。

## 使用

使用时保持 magpie 运行。每次打开 Claude，插件会自动加载中文；过程中可能短暂出现调试窗口和文件选择框，完成后自动收起。

在插件设置页选择语言并保存，下次打开 Claude 时生效。「启动时加载中文」开关控制后续启动是否加载。

![Claude 第三方模式的中文设置界面](https://raw.githubusercontent.com/polang233/claude-desktop-zh/main/docs/images/claude-settings-zh.png)

## 原理

翻译来自 Claude 官方中文语言文件。Windows 插件在每次 Claude 启动后运行本地脚本；macOS 通过 Claude 自己的开发者主进程调试器，把中文资源加载到当前窗口内存，并调用应用自己的语言 store。两条路径都不改核心应用文件。

首次准备会备份应用设置，再开启自动加载所需的开发者工具选项。语言资源保存在本机，Claude 继续使用原来的数据目录。少量未匹配的文字沿用英文。

## 说明

已在 Windows 商店版 Claude 3.1623.1.0 与 magpie 0.1.1340 实测原入口启动后自动加载简体中文；首次安装流程此前已在 Claude 2.42304.0 通过。2026-10-28 在 macOS 27.2、Claude 3.6556.2 第三方 Gateway 模式实测 `mac-apply` 运行时加载简体中文。Claude 更新后需要重新检查语言资源是否兼容。

- [安装步骤](https://github.com/polang233/claude-desktop-zh/blob/main/docs/first-install.md)
- [插件设置与常见问题](https://github.com/polang233/claude-desktop-zh/blob/main/docs/magpie.md)
- [macOS 说明](https://github.com/polang233/claude-desktop-zh/blob/main/docs/macos.md)
- [开发与验证](https://github.com/polang233/claude-desktop-zh/blob/main/docs/README.md)

项目代码采用 MIT 许可，官方语言资源的权利归其所有者，见 [NOTICE](https://github.com/polang233/claude-desktop-zh/blob/main/NOTICE)。
