# 0.2.2 发布候选检查

当前源码候选：`magpie-claude-zh@0.2.2`。规范仓库：`liwenjinchn/claude-desktop-zh`，原作者署名及 MIT 许可保留。

## 分发状态与身份

截至 2026-10-28，独立仓库已有 [v0.2.1 GitHub Release](https://github.com/liwenjinchn/claude-desktop-zh/releases/tag/v0.2.1)，其历史标签保持不变，资产列表为空。当前源码候选与历史标签不是同一产物。

npm registry 的 latest 为 `0.1.1`，已发布版本为 `0.0.0-stage`、`0.1.0`、`0.1.1`；该包当前公开维护者/写入者为 `polang233`。本机 `npm whoami` 返回 `ENEEDAUTH`，尚不能确认当前操作者有该包发布权。GitHub 仓库所有权不等于 npm 包发布权。保留现有包名以维持安装身份兼容；如改名，必须另行同步两份清单、控制器、registry 识别、测试及文档。

**本轮准备及 GitHub 代码提交不等于 npm 发布。** 未经实际发布及 registry 读回，不把 0.2.2 描述为 npm 已上线。发布权限未确认时，继续使用 GitHub 安装路径，不复用旧 0.1.0 发布命令。

## 检查并冻结 tarball

从仓库根目录执行，创建新的输出目录；不要使用历史 tarball：

```sh
npm test
npm run check
node scripts/check-package.mjs
mkdir -p .handoff/release-0.2.2
npm pack --pack-destination .handoff/release-0.2.2
shasum -a 256 .handoff/release-0.2.2/magpie-claude-zh-0.2.2.tgz
```

保留 tarball、版本/提交号、文件清单、SHA256 及对应检查结果。根及 `integrations/magpie` 版本必须一致，repository/homepage/bugs 均指向当前仓库。旧 v0.2.1 标签不移动，不以重打包内容替换原标签。

包应含 macOS 实现、ASAR 只读适配、运行时本地化、watcher、CLI、工作台、Windows 适配器及 `docs/macos.md`。官方语言目录、凭据、应用程序、测试 profile、交接和本机证据继续排除。无需新增 macOS 二进制包或把全部 docs 打包。

## 验收门槛

- 当前候选提交的 macOS/Windows/Ubuntu CI 全部通过；本机通过不能替代其他平台。
- 隔离安装**同一份 tarball**，检查包入口、CLI、必需文件、当前 GitHub spec 识别和 Mac watcher 的隔离宿主烟测。夹具烟测不代表真实应用成功。
- 在真实 magpie/Bun 中分别验证首次准备、资源获取、启动自动加载、关闭开关、停用插件、保存设置后旧宿主停止、正常退出/重开、页面刷新后手动加载及恢复。现有本机 4.29.0 简体自动加载证据只覆盖其中部分。
- 未验证繁体、其他版本或冷安装时，发布说明必须保留限制，不能宣传为无前提安装即用。

## 后续发布流程

先确认包权限和目标版本，再发布已冻结且验收的 tarball；发布命令中的路径必须与冻结记录相符。发布 npm 需要单独授权及账号验证，本文件不替代该步骤。

npm 成功后读回版本、repository、main/exports、文件清单和下载字节/校验值；GitHub Release 应对应同一提交及产物，附 tarball 与校验值。最后验证 magpie 发现卡片和实际安装来源。topic/非 fork 条件只证明可发现，npm repository 对应关系及缓存会影响最终安装来源。

只有这些步骤实际完成后，才把 macOS 推荐安装路径切换为 npm；之前使用 `github:liwenjinchn/claude-desktop-zh`。当前用户仅授权修复后提交 GitHub 代码，未授权本轮 npm 发布。
