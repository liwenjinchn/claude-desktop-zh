# 安装 Claude 中文插件

需要 magpie、Node.js 22+，以及已配置第三方 Gateway 模式的 Claude Desktop。

## magpie 安装来源

当前 macOS 代码从本仓库安装：在插件页添加 `github:liwenjinchn/claude-desktop-zh`，或选择仓库根目录。移除同源旧条目，只保留一种来源。npm `magpie-claude-zh` 的 latest 截至 2026-10-28 仍为原作者 Windows 版 0.1.1；本仓库 0.2.2 是源码候选，尚未发布至 npm。

## macOS 首次准备

1. 等待当前 Claude 任务结束，通过 **Claude → 退出 Claude（⌘Q）** 正常退出；只关闭窗口不一定退出进程。
2. 在终端定位源码根目录或已安装插件目录。GitHub 安装的常见位置如下；若 magpie 使用自定义配置目录，请替换路径：

```sh
PLUGIN_DIR="$HOME/.config/magpie/plugins/node_modules/magpie-claude-zh"
node "$PLUGIN_DIR/bin/claude-3p-zh.mjs" runtime-setup-status
node "$PLUGIN_DIR/bin/claude-3p-zh.mjs" runtime-setup
```

`runtime-setup` 只在 Claude 完全退出时备份并合并 `allowDevTools=true`；运行中会拒绝。macOS watcher 遇到未准备状态会提示 `needs-setup`，不会自行关闭应用或写入运行中的配置。

3. 在「系统设置 → 隐私与安全」给 **magpie** 开启「辅助功能」/「设备控制和数据访问」，如系统询问，允许 magpie 通过 **System Events** 自动化菜单。系统验证由用户本人完成。独立 CLI 自动操作菜单时，权限需授予运行命令的终端。
4. 按 [macOS 说明](macos.md#获取官方目录)准备官方目录。所有导入、缓存及加载命令显式使用同一个 `--catalog-dir`：

```sh
CATALOG_DIR="$HOME/Library/Application Support/claude-desktop-zh/catalogs"
node "$PLUGIN_DIR/bin/claude-3p-zh.mjs" catalog import --locale zh-Hans --kind base --file /path/to/zh-Hans.json --catalog-dir "$CATALOG_DIR"
node "$PLUGIN_DIR/bin/claude-3p-zh.mjs" catalog import --locale zh-Hans --kind dynamic --file /path/to/zh-Hans.dynamic.json --catalog-dir "$CATALOG_DIR"
```

5. 保持插件启用、简体中文及「启动时加载中文」开启，保存设置。保持 magpie 运行，从原入口打开 Claude。

若先前已报 `needs-setup` 或 `needs-accessibility`，修好条件后重新保存插件设置或正常退出、重开 Claude，以便重试。页面刷新后可用工作台「立即加载中文」。首次准备、资源下载及每次启动加载是不同步骤。

## Windows 首次准备

保持插件默认简体及「启动时加载中文」开启。通过 **File → Exit（文件 → 退出）** 正常退出 Claude，等待「中文已准备好」，再从原入口打开。插件在应用完全退出后备份设置并完成首次准备；加载时可能短暂出现调试窗口及文件选择框。

## 独立 CLI 安装

源码命令需从本仓库根目录执行，或使用上面的完整脚本路径：

```sh
cd /path/to/claude-desktop-zh
node bin/claude-3p-zh.mjs help
```

对于以后已验收的本地 tarball，可用 `npm install --global /path/to/magpie-claude-zh-0.2.2.tgz` 安装，再运行 `claude-desktop-zh help`。这不会启动常驻监听，也不等于该版本已发布 npm。

[插件设置](magpie.md) · [返回 README](../README.md)
