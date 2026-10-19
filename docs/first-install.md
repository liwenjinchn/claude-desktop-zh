# 安装 Claude 中文插件

需要 Windows、magpie、Node.js 22 或以上版本，以及已配置第三方 Gateway 模式的 Claude Desktop。

1. 在 magpie 插件页按 npm 包名 [`magpie-claude-zh`](https://www.npmjs.com/package/magpie-claude-zh) 添加，也可在「发现 → 非官方插件 · GitHub」中搜索 **claude-desktop-zh**。npm 页面列出当前发布版本。
2. 保持默认简体和「启动时加载中文」开启。如果 Claude 已打开，通过 **File → Exit（文件 → 退出）** 正常退出。
3. 等待 Windows 显示「中文已准备好」，再从原来的 Claude 入口打开。

插件会在 Claude 完全退出后备份应用设置，完成首次准备。启动 Claude 时，调试窗口和文件选择框可能短暂出现，加载完成后自动收起。

使用时保持 magpie 运行。源码安装可在插件页添加项目根目录，并保留文件夹所在位置。后续语言调整在[插件设置](magpie.md)中保存，下次打开 Claude 生效。

此前通过文件夹安装的用户，先在 magpie 移除旧条目，再添加 npm 包，保留一个安装条目。原有状态和备份继续使用。

[返回 README](../README.md)
