<img src="assets/logo.png" width="128" alt="橘发翻译员，手持译字气泡">

# claude-desktop-zh

在 magpie 中安装插件，让 Claude Desktop 的第三方 Gateway 模式使用官方中文界面，继续使用原来的设置、会话和历史。

![Claude 第三方模式的中文设置界面](docs/images/claude-settings-zh.png)

## 安装

准备好 Windows、magpie 和 Node.js 22 或以上版本，Claude 已配置为第三方 Gateway 模式。

1. 在 magpie 的插件页「发现 → 非官方插件 · GitHub」中搜索 **claude-desktop-zh**，点击安装。也可按 npm 包名 **magpie-claude-zh** 添加。
2. 保持插件启用。默认简体中文。
3. 如果 Claude 正在运行，通过 **File → Exit（文件 → 退出）** 正常退出。看到 Windows 的「中文已准备好」通知后，从原来的入口打开 Claude。

首次准备由插件自动完成。源码安装时，下载本项目并在 magpie 中添加项目根目录，保留文件夹所在位置。

## 使用

使用时保持 magpie 运行。每次打开 Claude，插件会自动加载中文；过程中可能短暂出现调试窗口和文件选择框，完成后自动收起。

在插件设置页选择语言并保存，下次打开 Claude 时生效。「启动时加载中文」开关控制后续启动是否加载。

## 原理

翻译来自 Claude 官方中文语言文件。插件在每次 Claude 启动后运行本地脚本，将对应版本的中文资源加载到当前窗口内存，并切换语言。

首次准备会备份应用设置，再开启自动加载所需的开发者工具选项。语言资源保存在本机，Claude 继续使用原来的数据目录。少量未匹配的文字沿用英文。

## 说明

已在 Windows 商店版 Claude 2.42304.0 实测首次安装和简体自动加载。Claude 更新后需要重新检查语言资源是否兼容。

- [安装步骤](docs/first-install.md)
- [插件设置与常见问题](docs/magpie.md)
- [开发与验证](https://github.com/polang233/claude-desktop-zh/blob/main/docs/README.md)

项目代码采用 MIT 许可，官方语言资源的权利归其所有者，见 [NOTICE](NOTICE)。
