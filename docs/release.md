# npm 发布与插件收录

项目：`claude-desktop-zh`。npm：`magpie-claude-zh`。首版：`0.1.0`。

## 发布内容

根目录 `package.json` 提供 magpie 入口、设置页、简介和内嵌图标。npm 包包含 CLI、运行时脚本、Windows 适配器源码及使用文档。官方语言文件由插件在本机获取。

原有数据与备份路径继续使用当前目录标识。项目目录保持原位置，已有文件夹安装可继续使用。

## 检查与打包

```sh
npm test
npm run check
npm pack --pack-destination .handoff/release-20261019
```

包回归会把 tarball 安装到隔离目录，实际导入插件、调用 CLI，并核对页面、Windows 源码及发布文件清单。

## 发布

确认 GitHub 仓库名为 `polang233/claude-desktop-zh`，根目录及入口文件已进入默认分支。仓库简介与 npm 描述使用：

> 为原版 Claude Desktop 的第三方模式加载官方中文界面，保留原来的设置、会话和历史。默认简体中文。

仓库保留 `magpie-plugin` topic。magpie 会在“发现 → 非官方插件 · GitHub”中读取仓库、简介及根目录图标；npm 的 repository 与仓库一致时，安装来源切换为 npm。

在 npm 登录后发布已验收的 tarball：

```sh
npm login --registry=https://registry.npmjs.org/
npm publish .handoff/release-20261019/magpie-claude-zh-0.1.0.tgz --access public
```

发布后核对 npm 的版本、repository、main、magpie.icon，并在真实 magpie 中刷新列表、安装、确认默认简体。首次准备及下次原入口启动按[安装步骤](first-install.md)验收。

magpie 对 GitHub 列表有约十分钟缓存；仓库被索引及实际卡片可见需要另行核对。

规则来源：[magpie 插件文档](https://usemagpie.ai/docs/plugins)。
