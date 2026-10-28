# 开发交接

## 0.2.2 候选：发布审查整改与布局调查

用户已授权修复后提交、推送至 liwenjinchn/claude-desktop-zh。保留当前原作者 origin；实际推送使用 mac 远端，不推上游。两份版本号为 0.2.2，元数据指向当前仓库，作者/许可保留。npm 当前 latest 0.1.1、公开写入者仅 polang233，本机未认证，不发布 npm，不移动历史 v0.2.1 标签。

发布审查整改：补齐 Mac 首次手动 runtime-setup 与相同 catalog-dir 指引、文档/安装来源/开关说明、Mac 必需打包文件与隔离安装后 watcher 烟测、当前 GitHub spec。CI 夹具统一物理临时目录，Windows 路径与 profile 身份模拟作平台适配，矩阵 fail-fast=false，生产符号链接保护未放宽。

Mac watcher 新增 registry 字节哈希及唯一启用记录校验，停用/设置变化后停止；CLI 绑定 watcher 实例令牌，并在宿主/主进程页面等待后再次复核，旧宿主不得在接管后发起新注入。补旧宿主忙碌、设置更改/停用、主进程状态等待中撤销的回归。消息语言未确认时不能跳过激活，恢复全部失败会记录 Failed 并报错，部分失败为 PartiallyRestored。

最终本机 npm test：181 项，160 通过、21 跳过、0 失败。当前候选 tarball 的 SHA256 为 eac4655c503ca4630f5133c0f1a9ec8a97060d59c21658fbc01a37241205ec34；包与同源安装文件在本机验收，产物/分析保留于忽略的 .handoff。真实 Magpie：自动加载关闭时重开 Claude，前端英文、last-apply 未更新；重新启用后自动注入成功，调试端口关闭。最终候选再次正常退出后原入口冷启动（新 PID61134），真实 watcher 返回 Applied；CUA 确认 coldLaunch=1 的导航与输入区中文，9229 无监听。远端 CI 以推送后实际结果为准。

布局需求澄清：保留第三方 API，加载官方账号版前端。当前调查没有可交付的整套资源替换路径：本地来源、导航限制及账号后端有独立分支。未修改部署身份、网关、会话或全部图标。详见 docs/layout-feasibility.md；不把语言修复当作布局完成。

## 2026-10-28 晚间最终结果：本机自动中文通过

以下“等待权限”状态已被此结果覆盖。用户明确授权为 Magpie 开启辅助功能并自行完成触控 ID。macOS 27.2 设置项名为“设备控制和数据访问”；已确认 magpie=on，自动化 → System Events 原本也为 on。正常重启 Magpie 后，旧 `System Events UI elements enabled` 仍返回 false，实际菜单操作却可成功。因此取消该旧全局标志的提前拒绝，改为执行真实菜单操作并将系统权限拒绝显式归为 Accessibility 错误；没有绕过系统授权。

最终实测正常退出 Claude、确认 watcher 等待，再从原入口重新打开（新 PID43239），全程没有手动 apply 或切换 Code/Cowork 页面。真实 Magpie watcher 自动应用，last-apply 时间 2026-10-28T15:34:03Z、inspectorOpened=true、2 次目录请求、zh-Hans；随后 CUA 确认 coldLaunch=1 的 Code 主界面「新会话/新建/例程/自定义/选择环境/开启自动模式/提示词」均为中文；9229 无监听。当前 Magpie watcher 保持 Applied，Claude 保持中文。新增实际菜单权限检查回归后全仓 173 项：152 通过、21 跳过、0 失败。仅限当前机器/版本/简体的实测，不代表其他版本、繁体或所有页面已验收。

本地源码修改和已安装插件修改已一致保留，依然未提交/推送/发布，插件升级会覆盖本地修复；公开 main 仍为 8b75df6。

## 2026-10-28 晚间：Claude 4.29.0 ASAR 布局修复（本地，未提交/推送）

用户报告已安装插件无法启动时自动中文。远端 liwenjinchn/claude-desktop-zh 只有 main，HEAD 8b75df6；现有 0.2.1 已含 Mac watcher，plugins.json 的 runtimeAutoLoad=true，宿主也存活。当前 Claude 已更新到 4.29.0，其前端从外部 ion-dist 目录改为 ion-dist.asar；findClaudeApp 因旧目录条件失败，watcher 将该错误吞成 waiting-for-claude。

新增 lib/asar-reader.mjs，按 Electron ASAR 格式只读 packed JS/英文目录，验证大小、范围、SHA256，拒绝链接/unpacked 前端文件，不解包或修改应用。runtimeSpec 对归档布局沿用官方目录覆盖率/占位符检查，并定位唯一运行时及语言 store 导出，页面仍校验模块 SHA256。macOS 发现接受归档布局，watcher 识别失败改为 discovery-failed。补归档与 watcher 回归；全仓 172 项，151 通过、21 跳过、0 失败；npm run check、git diff --check 通过。

实机：当前归档运行时 /assets/v1/shared-52-JcfRCCiW.js，导出 Kp；加载 39,482 基础/49 动态消息，messagesLocale=zh-Hans，2 次目录请求。初始 Code 页面尚保留英文，切换 Cowork/Code 后均看到中文；不能仅据 Applied 宣称已刷新全部界面。通过 CUA 正常退出测试 Claude，再从原入口重开，真实 Magpie watcher 识别新进程，但返回 needs-accessibility：Magpie 未具备菜单自动化权限。已向用户发出单独权限确认，尚不能宣称自动启动链路通过。

5 个运行源码文件已同步本机已安装插件；旧文件备份在 ~/Library/Application Support/claude-desktop-zh/backups/plugin-20261028-asar。通过 magpie plugin options 保存同样的 locale/runtimeAutoLoad 使宿主正常重载，未改其他插件。没有提交/推送/发布；不要执行 plugin update 覆盖本地修复。原 Claude.app、签名、Gateway/密钥与聊天配置未修改。


## 2026-10-28 macOS 运行时中文实机通过（一键命令已验收）

magpie 的 GitHub 发现查询为 `topic:magpie-plugin archived:false fork:false`，fork 会被排除；因此最终发布的是非 fork 仓库 https://github.com/liwenjinchn/claude-desktop-zh（v0.2.1，topics 已加 `magpie-plugin` 等）；原 fork 已改名为 https://github.com/liwenjinchn/claude-desktop-zh-fork，仅作镜像/历史，不作为发现入口。

本机 macOS 27.2、Claude Desktop 3.6556.2、第三方 Gateway 模式（`Claude-3p`，`allowDevTools=true`），magpie 0.1.1609；npm 插件 0.1.1 本身仍是 Windows-only。官方中文目录通过本机浏览器取得并导入（`catalog fetch` 被 Cloudflare 403 拦截）：基础 39,521 键中命中 36,304/37,201（97.59%，3 个占位符不兼容回退英文），动态 49/49；目录保存在忽略的 `.catalogs` 及 `~/Library/Application Support/claude-desktop-zh/catalogs`。

真机手动路径已通过：Claude 的 `Developer → Enable Main Process Debugger` 打开本地 Node inspector（127.0.0.1:9229），主进程调用 `webContents.executeJavaScript` 只向 `app://localhost` 页面注入官方目录，页面状态为 `locale/messagesLocale=zh-Hans`、`catalogRequestsServed=2`、`restored=false`；截图确认「新建/例程/自定义/更多/已置顶/环境/上下文/连接器」等界面已中文。未修改 `Claude.app`/`app.asar`、未重签、未改 Gateway、SIP、Gatekeeper、Keychain 或 profile 配置；inspector 用 `node:inspector.close()` 关闭。没有执行任何聊天/Cowork 任务，报告不含页面标题或正文。

新增 `lib/runtime-localization.mjs`（从 scripts 抽出，单一实现）、`lib/macos.mjs`（应用/进程/profile 发现、菜单自动化、CDP、注入/恢复、状态）、CLI `mac-apply`/`mac-restore`/`mac-status`、macOS discover/defaultLayout/runtime-setup 守卫、magpie controller/工具/workbench/设置页的 Mac 入口，以及 `test/macos.test.mjs` 11 项。新增 magpie 的 macOS 后台 watcher：每个新的 Claude 进程自动调用 `mac-apply`，已在同一 PID 上采用 `last-apply.json` 避免重复打开调试器；支持等待退出、重试、`needs-accessibility`、`needs-setup`、`watcher.lock` 多宿主接管。`test/macos-runtime-host.test.mjs` 6 项覆盖新进程、退出再启动、已有状态采用、权限失败、未开 devtools、禁用和双宿主接管。真机用 Node 宿主验证了已有 PID 采用和真实 `mac-apply` 路径（状态 Applied、端口关闭）。全仓在 macOS 下用 `TMPDIR=/private/var/...`（绕开系统 `/var` 符号链接）跑 `npm test`：168 项，147 通过、0 失败、21 跳过（Windows/符号链接夹具）；直接 `npm test` 时旧 `assertPlainDirectory` 用例会因 `/var` 是符号链接而失败，属于测试环境差异。

首次 CLI 尝试的诊断是错的：真正原因是 `InspectorClient` 只发送 CDP 请求、没有给 WebSocket 挂 `onmessage`，每个响应都被当成超时；inspector 本身没有卡死。已修复消息分发和 `Runtime.enable`，并给页面状态探测、页面激活和主进程求值加了超时/清理。用户正常退出并重开 Claude（PID 67626）后，`node bin/claude-3p-zh.mjs mac-apply --locale zh-Hans` 6.6 秒返回 Applied：`messagesLocale=zh-Hans`、`catalogRequestsServed=2`、inspector 端口已关闭；截图确认「新建会话/新建/例程/自定义/更多/选择环境/开启自动模式/描述任务或提出问题」等界面为中文。该窗口当前保持中文。另测 `mac-restore` 后再 `mac-apply`：恢复返回 Restored，重新应用返回 Applied，此时 `catalogRequestsServed` 可为 0（应用已持有同一语言），不能把它当成失败。magpie Bun 运行时执行 `mac-apply` 的跳过路径通过；Node 本地工作台验证了 Mac 按钮只显示 Mac 动作，`/api/run` 返回 Applied。in-app 浏览器的原生 `window.confirm` 会被自动处理，真实 magpie webview 的确认点击仍按 Windows 同一套页面逻辑，未单独截图验收。

未验证：繁体 zh-Hant、真实「退出 Claude 再打开」时 watcher 自动加载的完整 GUI 链路（watcher 逻辑与真实 apply 分别通过）、其他 Claude/macOS 版本、magpie 从本地文件夹/GitHub 安装后的 GUI 链路、全部设置/历史/Cowork 界面。不要把这些扩大为已通过；不要把 `--remote-debugging-port`、`CLAUDE_CDP_AUTH` 或任何签名/系统保护绕过写进实现。


## 2026-10-19 对外 README 展示

README新增npm动态版本徽章、Windows/Node/MIT信息、npm包链接、首版v0.1.0/全部版本/问题反馈入口。按npm包名安装为首步，说明默认简体、保持magpie运行及原入口打开；截图放在使用说明后，旧文件夹条目切换说明补入安装步骤。图片与用户文档均改完整GitHub地址，便于跨页面阅读。first-install与magpie常见问题同步包链接、版本查看和旧条目切换说明。

验证：npm registry读回0.1.0；GitHub官方Markdown接口渲染通过，差异格式检查通过。此轮仅调整用户文档，未重跑应用或修改包版本。GitHub展示随文档提交更新；npm站内README仍为0.1.0发布时快照，将随后续版本同步。原测试分支及未提交成果继续保留。

## 2026-10-19 npm 0.1.0 已上线并完成下载验收

最新发布结论：magpie-claude-zh@0.1.0已公开发布，latest=0.1.0，地址https://www.npmjs.com/package/magpie-claude-zh。使用独立npm11.21.0、browser=false发起发布，用户完成本次网页验证后，CLI退出0并返回+ magpie-claude-zh@0.1.0；registry短暂处理后版本可读。以下较早发布失败和等待记录为历史状态。

通过：从registry读回name/version、repository、main/exports、中文description、设置页及117092字节内嵌图标，与冻结产物一致；从registry重新下载762988字节tarball，SHA256=30f603393160fc18169af5b45f2dccb6a0024a16bca38a5f9a60c40bca4d2264，SHA512 integrity与GitHub已发布包一致。使用新缓存按npm包名隔离安装，CLI、包内文件检查、控制器路径和默认zh-Hans通过。官方magpie源码host.js+Bun加载registry安装目录，3个工具及状态调用通过；自动加载关闭、零UI动作，宿主关闭stdin自然退出。

私人证据：.handoff/release-20261019/npm-validation.json、host-validation-registry.json、registry-downloaded.tgz、registry-check。Node直接fetch遭遇本机TLS连接失败，验证脚本改用npm自身网络配置后完成；此为检查工具的联网问题，未改发布产物。原test/profile-reuse-real-app-20261018、HEAD89bb330及未提交成果继续保留，日常Claude和magpie配置未修改。

未验证：真实magpie非官方列表卡片显示、从npm安装后原Claude新启动的GUI链路；当前通过的是公开topic索引、npm下载/安装与源码宿主加载，既有文件夹安装的首次准备和原入口中文实机结果继续见下文。日常安装切换为npm时，在magpie移除旧文件夹条目后再安装magpie-claude-zh，保留唯一注册记录。

## 2026-10-19 claude-desktop-zh 命名、npm 包与图标

项目对外名称为 claude-desktop-zh，npm 包名 magpie-claude-zh，版本0.1.0。根目录现提供 magpie main/exports、设置页、简介、作者、repository、关键词和内嵌图标；原文件夹安装入口继续有效。控制器核对新包名，监听识别根目录、npm及该作者的GitHub安装，仍要求唯一启用记录、配置及注册哈希一致。现有状态目录、备份及provider标识沿用。项目当前目录、test/profile-reuse-real-app-20261018分支、HEAD89bb330及未提交内容保留。

三款透明卡通娘logo已保存docs/images/mascot-speech.png、mascot-beret.png、mascot-book.png，默认第一款，256px图标为assets/logo.png及设置页icon.png。两份package.json内嵌同一图标，解码117092字节；docs/branding.md及logo-prompts.json记录图稿和提示词。README加入logo，安装说明使用magpie发现页及npm包名，源码选择根目录。docs/release.md记录发布与收录步骤。

通过：全仓142项，141通过、0失败、1文件symlink夹具跳过；npm run check与git diff --check通过。新增真实tarball隔离安装回归，按npm包名导入、CLI、Windows适配器源码、页面路径及发布清单通过；npm安装和GitHub/root spec身份夹具通过。最终检查脚本输出调整后包回归再次通过。官方magpie源码host.js+Bun实际加载打包产物，3个工具、默认简体通过，自动加载关闭、零UI动作、宿主关闭stdin自然退出。Headless Edge 390/900px默认/保存、图标加载及无横向溢出通过，截图已检查；卡片为本地元数据预览。

GitHub发布后，另以Bun1.4.2从公开github:polang233/claude-desktop-zh#v0.1.0实际下载并隔离安装，再由官方源码宿主加载，3个工具及默认简体通过，自动加载关闭且零UI动作；证据host-validation-github.json。日常magpie当前仍为原文件夹安装；换为npm前应在GUI移除原条目，再安装新包。监听会拒绝多个同源注册记录，停用但保留旧条目也应先移除；此处保留既有严格校验行为。

发布进度：用户已明确授权GitHub仓库更名、默认分支发布和npm0.1.0发布。GitHub已更名为polang233/claude-desktop-zh，默认分支发布提交865eba7c40314c34f02b821d65954f74fa6b6194；远端提交、package.json、入口及图标blob哈希均读回一致。GitHub topic搜索返回本仓库1条，description与magpie-plugin topic正确。v0.1.0 Release已发布，包含tarball及SHA256SUMS；远端资产摘要与本地一致。用户随后确认npm已登录，实际whoami为polang233，冻结包哈希复核通过；首轮实际publish返回E403，发布验证未完成，已请用户按npm官方网页步骤完成账号验证后重试，同一版本尚未发布。不要重复请求发布授权或将“已登录”当作“已发布”。真实magpie列表图标已发起用户确认，不能将topic索引等同于窗口验收。

用户已启用npm 2FA并先后确认两次发布网页验证完成，但两次CLI的done端点均未收到成功回执，最终返回E404，registry确认版本尚不存在；第二次日志为91次202、0次200，不将用户操作归为发布成功。两个发布进程均已退出。浏览器控制工具两次启动失败，未查看或操作验证页。已在.handoff/release-20261019/npm-client隔离安装兼容当前Node的npm11.21.0，并准备publish-npm.ps1，先校验冻结包SHA256，再由用户本机终端直接触发网页验证；只做过语法检查，尚待用户执行结果。无需改系统npm或创建新令牌。之后运行同目录check-registry.mjs，验证registry元数据、下载字节哈希、冷缓存按包名隔离安装及CLI，再用check-host.mjs检查registry-check的官方源码宿主加载。实际发布状态记录在私人npm-publish-attempt.json。

独立发布检出位于.handoff/release-20261019/publish，分支release/magpie-claude-zh-0.1.0；78份文件从最新工作区逐字节复制并核对，凭据模式扫描0条发现。在无本机语言目录的独立检出再次全仓142项，141通过、0失败、1跳过。原工作区test/profile-reuse-real-app-20261018、HEAD89bb330及未提交成果保持，未切换或提交该分支。共用origin已更新为新仓库URL。

npm安装后原入口新启动未重做GUI验收，沿用此前文件夹安装的首次安装/自动简体实机证据；不扩大为npm端到端已通过。本轮没有操作日常Claude窗口或profile。

私人打包、宿主及页面证据在.handoff/release-20261019。最终安装包magpie-claude-zh-0.1.0.tgz为762988字节、36文件，SHA256=30f603393160fc18169af5b45f2dccb6a0024a16bca38a5f9a60c40bca4d2264；pack.json及final-package.json保存最终文件清单与完整性。线上版本：https://github.com/polang233/claude-desktop-zh/releases/tag/v0.1.0。

## 2026-10-19 使用文档与插件设置页

README 已按安装、使用、原理和说明编排，加入用户提供的中文设置截图 docs/images/claude-settings-zh.png，图片与来源字节一致。使用文档为 docs/first-install.md、docs/magpie.md；docs/README.md 提供导航，docs/status.md 汇总当前验收范围。文案说明 magpie需保持运行、官方资源在每次启动时由脚本加载至原窗口内存、首次准备备份并开启应用开发者工具选项、未匹配文字沿用英文。

插件设置页保留语言、启动时加载中文、保存设置和首次使用步骤，保存过程有进行中、成功及失败反馈，保留已有配置字段。页面脚本版本为 settings-4，重新打开设置页加载。Windows通知和资源维护入口文案同步更新，维护操作及确认机制沿用原实现。

验证：22项相关定向回归通过；Windows适配器编译/72项保护自检通过，npm run check、git diff --check通过。Headless Edge使用模拟magpie桥接，900px与390px下检查默认简体、保存语言、关闭自动加载、失败重试按钮可用和横向溢出，并检查截图。5份用户文档的本地链接和图片引用通过。私人浏览器脚本及截图在 .handoff/docs-settings-20261019。此轮为文档、设置页及提示调整，首次安装实机证据继续见下文。


## 2026-10-19 首次安装自动准备与原入口中文实机通过

本节覆盖此前“需要提前开启开发者工具”的前提。保留分支 test/profile-reuse-real-app-20261018、HEAD89bb330及全部未提交成果，没有提交或推送。

用户已明确授权首次安装自动准备。本机已从 developer_settings.json 不存在的状态实测：原 Claude 打开时在 magpie 删除并重新添加插件，选项为空、默认简体，不保存偏好；插件仅等待正常退出，设置文件保持不存在、没有原窗口脚本操作。正常退出后，插件自动备份/记账并创建只含 allowDevTools=true 的设置文件，RuntimeSetupReady/changed=true、哈希与事务日志一致；用户看到 Windows 准备完成通知。随后仅从原入口打开，不改设置、不运行命令，原新进程PID83576、ticks639279496571003399，报告恰好一次提交及一次 Applied、SelectedNative、身份位127。用户确认“自动简体中文，文件框一次，两个辅助窗口收起”。首次安装目标在本机当前版本通过，继续使用原安装及原 profile，没有副本迁移或任务恢复。

| 项目 | 结果 |
| --- | --- |
| 安装默认简体、原版运行中等待 | 通过；空插件选项，等待时开发者设置文件不存在 |
| 正常退出后自动准备 | 通过；beforeSha256=null，applied=true，新文件只有 allowDevTools=true |
| 无手动设置或命令，原入口新启动中文 | 通过；一次 Applied、文件框一次、辅助窗口收起，用户反馈与报告一致 |
| 首次准备通知 | 最初 magpie tui.showToast 只记日志，用户未看到；已补 Windows NotifyIcon，用户确认等待和准备完成两个通知 |
| 其他设置字段、精确备份和恢复 | 含原始字节/BOM/嵌套字段的夹具通过；真实本机首次设置原文件不存在。恢复要求正常退出及哈希一致，漂移拒绝 |
| 自动资源准备 | 本机复用兼容目录；本地/缓存缺失后自动下载官方基础及动态目录的后备路径回归通过，真实冷缓存在线下载未实测 |
| 回归 | 全仓140项：139通过、0失败、1文件symlink夹具跳过。之后Windows通知补充的9项、收尾15项定向回归及真实通知/首启通过；npm run check和git diff --check通过 |

新增 lib/runtime-setup.mjs，CLI runtime-setup-status/runtime-setup/runtime-setup-restore。监听传入绑定的 profile/CLI及宿主身份，安装原版运行时只读；所有 Claude 进程退出并稳定观察后才写，临提交再次核对进程/宿主/注册哈希和设置哈希。备份、日志及临时文件在产品自己的外部状态目录，设置合并仅 allowDevTools。不强杀、不改系统权限、WindowsApps或原入口，不调用恢复/发送消息。CLI仍是设置事务的单一实现。

当前原窗口中文、magpie监听正常运行，allowDevTools由新首次准备事务管理。无需再次退出或重复此验收。恢复应使用最新 setup journal，不再使用已撤销的旧实验恢复脚本。Windows通知可能受用户自身通知设置影响，插件不修改系统通知权限。Node.js22+及当前前端兼容的官方资源仍为运行条件，不将本机结果扩大为所有机器/版本保证。

私人证据位于 .handoff/first-install-20261019：reset-confirmation.json、waiting-first-report.json、waiting-first-confirmation.json、native-notice-confirmation.json、setup-ready-confirmation.json、setup-journal.json、final-report.json、final-confirmation.json。最终产品目录 host-jMH9gg，宿主和原PID仅为当次记录，后续重新发现。当前journal为原产品 runtime/setup-state/runtime-setup/setup-Fj6y2m/journal.json。

未验证：繁体首次安装、真实冷缓存联网下载、所有设置/历史逐项GUI、Cowork任务执行、其他机器/版本。旧数据迁移实验的通过/失败范围仍单列，不能将本路线说成副本迁移已完成。

以下为此前已开启开发者工具条件下的记录。

## 2026-10-19 最终实机验收：magpie 默认及保存简体后原版自动中文通过

本节为当前结论，覆盖下方历史等待/失败状态。分支 test/profile-reuse-real-app-20261018、HEAD 89bb330 保持，全部成果未提交、未推送。

| 验收项 | 结果与范围 |
| --- | --- |
| 原版手动运行时中文及 Cowork 界面 | 用户确认通过，状态 zh-Hans、两条目录请求；没有执行 Cowork 任务或逐项打开全部历史 |
| 独立监听、原入口新进程 | 通过；旧轮曾出现两次文件框，提交状态及不重复重试的修正已实测文件框一次 |
| magpie 空选项默认简体 | 通过；原 PID89148，报告仅一次 Applied，用户确认中文、文件框一次及辅助窗口收起 |
| magpie 保存简体后原入口新进程 | 最终通过；原 PID82360，创建时间 ticks 639279480578525145，报告仅一次提交及一次 Applied、SelectedNative、身份位127，用户确认自动中文、文件框一次、两个辅助窗口收起；没有运行独立命令 |
| 保存链路前三次尝试 | 失败；UIA 打开按钮识别及焦点边界停止，文件名为空，未得到回执。截图显示拆分打开按钮；仅补 SplitButton 仍不稳定。已改为标准对话框原生 ID1 按钮，核对父子 HWND、类、控件 ID、可用性、进程及前台后定向点击，页面随机回执才确认成功 |
| 宿主与配置变化 | 保存后新宿主监听就绪，旧宿主及旧监听进程消失；新监听不重新操作已打开的原 Claude。禁用开关和退出 magpie 的完整 GUI 链路尚未实测 |
| 回归 | 完整基线132项：131通过、0失败、1文件symlink夹具跳过；check、差异检查通过。后续Windows实际编译、72项无UI自检及相关定向回归通过。最后两次整仓复跑因自动审批审查超时而未启动，不算新整仓结果 |

真实 magpie 初次准备因 Bun 1.4.3 读取 WindowsApps 返回 EPERM。Windows Bun 宿主现调用 PATH 中 node.exe 执行同一 CLI，Node.js 22+ 为前提；实际 Bun 导出及最终宿主验收通过，没有修改系统权限。

实现入口为 integrations/magpie/runtime-host.mjs、controller.mjs、server.mjs、scripts/build-runtime-localization.mjs、scripts/test-runtime-autoload.ps1 和 integrations/windows-runtime/RuntimeConsoleBridge.cs。默认 locale=zh-Hans、runtimeAutoLoad=true；保存后由新宿主读取。监听同时绑定宿主PID/创建时间/exe和 plugins.json 哈希，UI边界也核对身份，停止使用 stop 文件，不强杀、不注册系统启动项、不改原入口、不恢复任务。不共写原 profile，原窗口继续沿用原设置和会话，无副本迁移。

当前保持原版中文窗口及 magpie 监听运行。需要 magpie 保持运行、Claude 已允许开发者工具、官方目录兼容。此前授权的 allowDevTools 设置仍保持；插件不会替新用户自动开启它，若恢复须用户正常退出后核对哈希。WindowsApps 资源写入路线仍拒绝，不能混同运行时路线。

未验证：繁体新启动、关闭自动中文开关/停用/退出宿主的完整 GUI 链路、所有设置/历史及 Cowork 任务执行、跨版本更新与其他机器。不应宣称零前提通用安装已完成。后续可补这些验收，不要重跑原任务或回退旧检查点。

私人证据索引见 .handoff/local-environment.md。最新报告为 runtime-autoload-20261019/magpie-saved-final-report.json 和 magpie-saved-final-confirmation.json；默认通过证据为 magpie-default-report.json / magpie-default-confirmation.json，前三次保存失败报告分别为 magpie-saved-first/second/third-report.json。原生按钮单次通过为 native-open-confirmation.json。

以下为历史阶段记录，不覆盖本节。

## 2026-10-18 晚间续接：已授权开启原版DevTools，待用户执行中文脚本

用户已回复“已正常退出”，重新检测Claude进程为零后继续已授权实验，没有再次索要权限。只读核对6条会话、两份计划文件的`scheduledTasks`空数组，无待发送/自动恢复标记，所选配置未禁用Developer Mode。注意计划JSON实际是含`scheduledTasks`等字段的对象，并非根数组；本机只读检查脚本最初拒绝根schema后已按实际结构修正，没有改计划文件。

23:56:55仅创建原profile的`developer_settings.json`，内容为`allowDevTools:true`，原文件此前不存在。私人变更日志确认applied:true、记录新文件哈希；撤销助手会在Claude退出且哈希不漂移时移除此新增文件。没有修改其他配置、系统信任或权限。之后经原AppsFolder身份重开，主PID62412路径正确、窗口存在且响应；启动108行日志未见resum或Sending message，没有调用恢复或发送消息。不要将其当成原窗口中文证明。

生成的picker脚本已请求在Codex右侧打开；已请用户在原Claude按Ctrl+Alt+I到Console，复制完整`original-zh-Hans.js.picker.js`执行，文件选择器选择配套`.spec.json`。这是本地读取经过哈希核对的官方目录数据，不请求放宽CSP或执行JSON。当前等待用户报告中文/错误/DevTools未打开；**尚未收到原窗口中文验收结果**。桌面控制工具本轮不可用，不能假装已操作Console。原窗口目前打开，勿共写profile、关闭或强杀。已授权的后续操作无需重复请求；实验结束恢复开发者设置也须等待正常退出。

一次性检查、启用、撤销、变更日志和原版重开报告均在`.handoff/runtime-localization-20261018`。此次没有新增公共实现变更，沿用上一轮123项回归结果；原版自动启动中文和magpie链路继续未实现。交接与私人索引已更新，分支/未提交成果继续保留。

## 2026-10-18 晚间最新：原入口已恢复，继续原版运行时中文实验

按用户要求，22:48:36经`AppsFolder\Claude_pzs8sxrjxfjjc!Claude`恢复原商店入口，主进程84184路径为原WindowsApps，窗口存在且响应。启动前只读核对6条会话记录，没有待发送/自动恢复标记，两份计划文件的`scheduledTasks`均为空数组；没有调用恢复、发送消息或导航历史，启动观察的后代仅Claude进程，没有Code worker或终端。原窗口内容未做GUI验收，不能据进程状态声称全部功能正常。之前“暂未重开”的条目属于历史状态。

没有把MSIX候选失败作为结束。新增`scripts/build-runtime-localization.mjs`，生成可撤销的原版内存中文实验：核对原语言模块哈希，临时声明中文目录，限定两条目录请求，并调用原语言状态接口。不改包内文件、系统信任或权限；生成器不读写profile。较小的picker脚本通过本地文件选择器读取带完整哈希的官方目录数据，不执行所选JSON代码。此路线保留原身份，但**每次启动自动加载入口尚未实现**，未接入magpie。详见docs/runtime-language-experiment.md。

通过：隔离Chromium实际导入原版未修改模块，接受zh-Hans并读到35,441条基础/49条动态消息；来源/漂移/重复应用拒绝，无关API不被拦截，撤销恢复fetch、清单及原状态。新增3项回归通过；全仓123项，122通过、0失败、1文件symlink fixture跳过；npm run check、git diff --check通过。该浏览器夹具没有Claude绑定、日常profile或任务桥，不能冒充原桌面中文验收。

用户随后明确允许：正常退出Claude后备份并仅开启`allowDevTools`应用设置，重开原版，由用户手动运行已生成脚本。**授权已取得，不要重复索要。当前仍在等用户正常退出；检测原Claude仍运行，尚未写设置。** 私人enable-devtools.ps1已实际验证运行中拒绝、无设置/日志落地；配置与恢复脚本语法通过。桌面控制工具启动失败，需要用户手动File→Exit及DevTools。已经发出“已正常退出/现在不能退出”的状态问题，不能把等待视为退出。不要强杀或擅自关闭当前窗口。进入下一步先重新检测，退出后才执行已授权设置、核对任务标记并通过原安装身份重新打开。

原入口恢复证据、浏览器结果、生成脚本/JSON和一次性设置/恢复助手均在忽略的.handoff，本机索引已补充。分支及全部未提交成果保留，没有提交或推送。

## 2026-10-18 17:39 已授权MSIX探针实装及清理

用户明确授权临时信任本次实验签名，结束后移除附加包和该证书。17:31临时信任及探针安装成功，原主包依赖中确认附加包。真实包上下文身份匹配，但目标JS仍为原始哈希，overlayVerified:false / 3，该候选资源覆盖方案未通过，没有安装中文载荷或接入magpie。

**发生了影响日常程序的副作用：17:32移除探针时，Windows部署触发原Claude退出。** 系统事件确认主包服务/禁用及TerminateApplications成功。没有显式强杀参数也不能保证可选包卸载不关闭主应用；本轮未防住该影响，已向用户说明并致歉。探针、主包相关依赖及临时证书信任均已确认清除。原包仍登记且状态正常，核对的ASAR/前端资源哈希一致；4份主要设置JSON、5条Code/1条Cowork记录可读且未见待发送输入，但没有操作前的完整profile哈希基线，不能宣称资料全部不变或完整正常退出。

为避免自动续跑原任务，当前未重开原Claude，已询问用户原入口恢复方式，未将等待视为同意。新增manage-msix-resource-probe.ps1集中实验部署，在Claude或包内辅助进程运行时拒绝安装及移除，新增实际PowerShell夹具测试通过。全仓回归结果见最新validation记录。后续禁止直接用Remove-AppxPackage清理仍在运行的日常主包的可选依赖；不得重复本次影响。完整结果见docs/msix-resource-experiment.md；私人authorized-result.json、信任清理日志与资料可读性摘要在本机索引中。当前分支及所有未提交成果保留，没有提交或推送。

## 2026-10-18 17:26 原MSIX资源修改包实现及实装尝试

用户要求继续实现和实机验收，不能仅做预检。本轮新增 `scripts/msix-resource-probe.mjs`，可生成无行为标记或真实官方中文补丁的独立MSIX修改包，复用现有plan/patch。新增 `scripts/read-msix-resource-view.ps1`，在真实已注册包上下文只读核实身份和资源哈希，不启动Claude或读写profile。完整过程见 [资源修改包实验](docs/msix-resource-experiment.md)。当前没有接入magpie，因为有效覆盖尚未通过。

- 通过：两份实验包构建、微软MakeAppx解包、实验签名附加；官方包上下文诊断返回真实Claude包身份及原始资源哈希。新增Windows ZIP/XML多块资源与路径边界测试通过；全仓119项，118通过、0失败、1跳过；自检、语法检查及差异检查通过。
- 失败：无签名修改包实际安装返回0x80073D2B，Windows要求无签名包必须是主包。改为签名包实际安装又返回0x800B0109，证书不受信任；没有成功安装残留。最初MainPackageDependency的MinVersion schema错误已修正。
- 未验证：修改包对Claude包根/VFS资源的实际覆盖；原入口中文重启、Cowork中文、magpie完整链路。当前验收返回overlayVerified:false / 3，不能说已解决。
- 当前需要用户明确授权的下一步：临时信任本次代码签名实验公钥证书，安装标记包检查有效资源视图，再移除包与该信任。微软文档要求本机TrustedPeople，涉及整机信任，超出用户此前禁止更改系统保护/权限的边界。尚未导入任何证书，不可据等待或构建成功视为授权。证书两天有效，签名后临时私钥和口令已删除。
- 原Claude主进程继续运行，核对资源哈希不变；没有关闭/强杀、共写日常资料、续跑任务、改ACL或系统信任，没有提交/推送。Computer Use运行时也因MXC安全环境创建失败不可用，未退回操作日常窗口。完整签名包、公钥和脱敏experiment.json在忽略的.handoff，本机索引已更新，保留此前实机证据。

## 2026-10-18 17:02 接手核查：magpie 设置后下次启动中文

本轮用户要求先验收“安装 magpie 插件后，选择中文或使用默认中文，下次从原入口打开 Claude 即为中文”。**当前不满足。** 默认 `zh-Hans` 只是偏好；设置页只调用 `magpie.options.set`，插件启动不安装、不轮询，仍需工作台显式“应用中文”。本机重新运行只读 `original-check`，2.42304.0 返回 `patchable:true`、`eligible:false`、`protectedInstall:true`，受保护 MSIX 原安装不能应用。此前中文副本成功不代表此体验通过。

- 通过：核对现有私人 report/settings-comparison 及证据文件仍在；设置页/控制器/插件启动代码与相关回归一致；`npm test` 117项，116通过、0失败、1文件symlink fixture跳过；`npm run check`、`git diff --check`通过。
- 未满足：仅安装或保存语言偏好即生效；本机商店原程序下次启动中文。
- 未验证：最新 magpie GUI 从安装、保存语言到应用的完整链路；保存偏好后已打开工作台/已创建控制器是否重新加载新值；正式可写非MSIX安装的原入口重启桌面验收。现有控制器捕获创建时options，不能把保存成功视作运行中已生效。
- 本轮只做源码、既有证据及只读兼容性核查，没有新做Claude GUI测试，没有启动/退出Claude或magpie、迁移日常资料、应用补丁、强杀、改权限或续跑任务。保留当前分支、6份既有未提交文档和私人证据，没有提交/推送。

下一步仍须先解决合法MSIX/原安装中文的可行路径，再把语言选择接入可重复应用流程并做真实宿主验收；不能只将“保存偏好”提示改为成功，或用更多预检替代该目标。Cowork及正式迁移要求继续按docs/next-agent.md推进。

**交给下一位 agent 时，使用 [统一接手文档](docs/next-agent.md)。** 该文档按当前工作区整理了最终目标、当前分支与未提交成果、最新实机通过项、Cowork/MSIX 阻塞、安全约束和下一步。以下保留历次实现与证据；其中旧测试器固定 blocked 的描述属于历史阶段，最新实机结果优先。

更新：2026-10-18。当前分支 `test/profile-reuse-real-app-20261018`，接手基线 `89bb330`，保留已有成果。独立 DeepSeek Harness 已实际执行停机快照、普通权限中文副本启动、设置/4个Code列表与历史的真实窗口验收、正常关闭副本并重新打开原商店版。Cowork副本入口因本版本 `msix_required` 不可用，只确认1条记录数据保留；在线登录、模型请求和任务续用未验收。完整证据范围见 [docs/profile-reuse-validation.md](docs/profile-reuse-validation.md)，当前状态见 [docs/status.md](docs/status.md)。真实程序、快照、截图及本机辅助脚本在忽略的 `.handoff/real-app-20261018` 和 `.handoff` 中，不进Git；旧固定禁止启动测试器不是本轮执行结果。其他历史研究见 docs/implementation-summary.md，本机路径见 .handoff/local-environment.md。

## 2026-10-18 本轮真实验收（优先）

- 宿主进程链确认与Claude独立；原列表4个Code为Idle、输入为空、Cowork无运行中任务。原程序01:50:20–23日志确认正常退出、40项清理完成、待输入队列为零；agent未发出原版退出命令，不把退出归因于菜单导航。按路径与后代关系定位进程，没有批量终止unknown；Cowork系统服务保留。
- 使用既有快照模块只读复制323文件/9,368,361字节及117目录；额外复制21个相关CLI历史/子agent伴随文件。原快照保留，在第二候选上隔离环境/工作区，关闭恢复/计划/远程入口并断开网关。
- 经CLI prepare-copy/launch运行真实2.42304.0简体副本。第一次Failed to get appData path，通过补齐隔离USERPROFILE下标准AppData目录修复，第二次成功；未改Windows权限、完整性或原安装。
- 实际打开4个Code历史均可读。常规与Code设置中文显示；恢复原版后17个单选、8个开关和输入值一致，下拉语义一致。账号Gateway名称保留，离线占位网关不能验证在线登录。Cowork灰色；源码能力检查为msix_required，复制VM无帮助，未绕过该检查。
- 真实导航自动启动4个隔离空目录的待机PowerShell，模型预热日志为workspace no longer trusted；没有发送消息、点击执行历史命令或续跑原任务，不能宣称零子进程执行。计划候选文件写成{}导致数组schema错误、Documents查找回退真实Documents均需记录；本轮方案不是可推广的严格隔离产品。
- 副本经真实文件/退出菜单正常结束，相关终端全部退出。原MSIX经安装身份重新打开并显示原Cowork入口、任务条目和模型选择。恢复前原profile323个纳入文件、21个源历史哈希一致；协议及整个HKCU Run的16个观察值在各阶段（含恢复后）一致。恢复原版后应用会自然更新状态。
- 本轮重跑npm test：117项，116通过、0失败、1文件symlink fixture跳过；npm run check、git diff --check通过。原安装app.asar及受管资源对照副本准备时基线哈希一致。只更新源码仓库的验证/交接文档；没有提交或推送，私人证据继续忽略。
- 完整Cowork中文列表/历史需要具备合法MSIX身份的独立Windows测试环境和隔离数据，或官方支持的历史入口。当前普通副本路径下不能完成。不要把Code通过扩大成Cowork通过，不要重新交付预检代替本轮实测。


## 最新任务纠正（优先）

用户明确：要切换到独立于 Claude Desktop 的另一个 agent，由它直接执行需要退出原 Claude 的实机测试，不是只开发外部测试器。先确认接手 agent 的宿主不随 Claude 退出；正常退出前确认没有未保存工作或必须保留的任务，不强杀。利用隔离快照启动真实中文副本，实际检查原设置、会话列表和历史，结束测试后恢复原 Claude。现有测试器可辅助，但预检/等待/launch固定blocked不是完成目标。详见 docs/next-agent.md 最新纠正；其他历史描述不应覆盖这项要求。

## 用户目标与当前结论

目标：magpie 安装插件、选择语言，尽量继续使用原程序和原设置；独立脚本保留。测试不得影响日常 Claude/magpie，不改系统保护，不停止任务。

插件默认 original；可写非 MSIX Windows 应用有资源原位事务实现，不创建用户数据。商店版明确拒绝。当前本机 2.42304.0 尚无已经验证的无副本汉化路径，不能宣传即装即用。copy 仅为显式测试模式，使用隔离数据、不继承全部现有设置。

## 架构

- lib/catalogs.mjs / cache.mjs：官方简繁 JSON、来源/哈希、兼容选择、只读 Chromium block cache。
- lib/patch.mjs：两个外置 JS 的唯一语言锚点、基础/动态资源，未知结构拒绝。
- lib/install.mjs：副本和隔离数据、事务与启动。
- lib/original.mjs：原安装资源事务、外部备份、保护包拒绝；不接触用户配置。
- lib/discover.mjs：按需发现、显式路径优先、部分结果及错误、多缓存。
- bin/claude-3p-zh.mjs：固定命令、锁、JSON；唯一操作入口。
- integrations/magpie：工具、只读偏好页和 loopback 工作台；直接选择本次简繁。

CLI 独立语言仓库默认 cwd/.catalogs；插件显式传入 LocalAppData 仓库。原位默认状态目录 LocalAppData/claude-desktop-3p-zh/original；副本默认 copy 子目录。

## 已验证与未验证

本轮审计修复后最终 npm test：63 通过，0 失败。增加 preparing 备份日志与取消/重试，源文件/ASAR 写入前复核，已安装原位计划和新语言导入回归。强杀后遗留锁不自动接管；需人工确认进程并处理。OAuth 启动入口仍会等待验证码，需取消提示，不能称无缝原生入口。原位事务是临时构造应用文件测试；不能称正式可写官方安装已完成桌面验收。

历史真实副本已验证 2.42304.0 简繁界面、关闭后切换、恢复哈希及重复恢复。未测试模型生成、Code 工具执行或 Cowork VM。

真实浏览器已打开修复工作台，并只读检查本机商店版：结构 patchable:true，原位 eligible:false。没有应用补丁。最新完整 magpie 发行版端到端调用仍需隔离验证；历史工具列出不能代替按钮执行。

只读程序研究未发现受支持的外部语言资源覆盖；调试开关受授权校验，Developer Mode 不等于可远程注入。不要为了自动化去绕过校验。

## 副本保留设置实验

用户要求不影响现有 Claude。只读快照了现有 3p 数据 322 文件约9MB，保留3条Code/1条Cowork记录，Cookie因被锁跳过。原数据没有作为测试启动目录。启动源码显示会自动恢复任务、尝试注册协议；没有直接用普通权限启动完整快照。制作禁用计划/恢复、断开网关的测试分支，只对临时目录标记低完整性并受限启动两次，无窗口，捕获0x80000003。没有降级隔离强行运行。

原Claude与worker持续运行，协议/开机项及6个配置文件哈希未变；活动会话/存储有自然变化，不能声称全profile静态不变。临时副本与私人快照已删除。结论：文件迁移可行，UI/续聊和共享同目录均未验证，不要实现为默认功能。详情 docs/profile-reuse-validation.md；本机脚本被忽略在.handoff。不改变WindowsSandbox功能、不安装组件、不重启。

## 2026-10-18 独立测试器

- scripts/test-profile-reuse.ps1 → scripts/test-profile-reuse.mjs，可从用户的独立 PowerShell 运行；仅允许 CLI plan/prepare-copy/status，代码中没有迁移 profile 的 launch 分支。
- Preflight 不读 profile 内容；Snapshot 等用户主动退出，持续探测 app/worker、保守处理孤立通用候选。无法识别的候选不视为已退出；PID 身份带创建时间，不自动 kill 或清源锁。
- lib/profile-snapshot.mjs：只读复制，唯一目录、空间检查、链接/目录身份/别名拒绝、SQLite sidecar/LevelDB 保留、源文件集合及副本哈希复核；私密 manifest 不进公开报告。lib/profile-test.mjs 验证可识别 3p 配置，报告只给固定错误、路径/计数/哈希。
- npm test 最终 117 项：116 通过、0 失败、1 跳过（文件 symlink fixture 无创建权限，未调整权限；目录 junction fixture 通过）。npm run check 通过。包含真实 CLI 与惰性构造应用的资源准备集成，未执行 fixture exe。
- 真实 Preflight 资源兼容通过；2 个相关进程与 168 个 unknown 候选阻止后续。真实 Snapshot 的 2 秒等待演练以 TESTER_WAIT_TIMEOUT/退出码 2 结束；没有读/复制真实 profile，没有生成真实应用副本。Preflight 的协议与整个 HKCU Run 摘要前后一致，不能扩大为全部日常数据静态不变。
- Snapshot 文件准备即使全部通过也返回 3：自动恢复、计划、远程/CLI/工作区、协议注册没有可证明的启动隔离。设置/列表/历史 UI 与登录态、数据库引擎完整性均未验证，任务续用不在范围内。不能把“退出原应用”或占位网关当作完整隔离。
- 默认 `.handoff/profile-tests` 被忽略；真实结果路径见本机交接。没有自动清理或系统权限修改，没有提交或推送本轮改动。下一步需要可验证的启动边界，不能直接用普通 CLI launch 绕过测试器。

## 插件维护重点

宿主入口只导出插件工厂；authorize 在 auth.methods[] 内。工作台 fragment 令牌、精确 Host/Origin、单操作与有限历史、空闲回收。不启动自动同步轮询，不假定 dispose 存在。verify-magpie-host.mjs 仅 detect/status，绝不以执行 restore 来证明只读。

超时不是成功：检查 applying/preparing 状态并恢复。版本漂移不允许旧备份覆盖新版本；自动跨版本升级尚未实现。

## Git 与发布

仓库：https://github.com/polang233/claude-desktop-3p-zh 。本轮归档到本地分支 checkpoint/magpie-profile-handoff-20261017，不推送；最终提交号见 git log 与忽略的 .handoff/checkpoint-20261017.md。勿据此假定远端已包含。进入先 git status；保留已有修改。官方资源、凭据、应用程序、测试 profile 不入 Git，.catalogs/.handoff 被忽略。没有发布 npm。

Node 22+，无运行时 npm 依赖。使用 npm test 和 npm run check。未经用户要求不提交、不推送、不修改日常插件配置。后续优先：修复审计确认问题、补原位异常恢复测试、隔离真实 magpie 宿主全链路验证，再研究商店版原程序可行路径；无结果时明确报告，不自动退回副本。
