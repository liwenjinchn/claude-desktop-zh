# 下一位 agent 交接：Claude Desktop 中文化与原数据保留

## 2026-10-19 npm 已发布

magpie-claude-zh@0.1.0已公开上线，latest=0.1.0。npm11.21.0此次网页验证成功，CLI退出0。registry元数据、图标及下载哈希与GitHub包一致；冷缓存按包名安装、CLI、默认简体及官方magpie源码宿主3个工具加载通过，零UI动作。私人结果见.handoff/release-20261019/npm-validation.json和host-validation-registry.json。以下npm等待和失败条目属于此前阶段，不再请求登录或重复发布0.1.0。

真实magpie列表显示及npm安装后的原Claude启动GUI尚待核对；当前日常文件夹安装和原数据保持。换包需用户在magpie移除旧条目再安装magpie-claude-zh，保留唯一注册。原分支、HEAD与未提交成果仍保留。完整发布结果见HANDOFF顶部。

## 2026-10-19 npm 发布接续

项目名claude-desktop-zh，npm magpie-claude-zh@0.1.0。根目录已可加载magpie插件，设置页和卡片采用默认“译”字卡通娘图标，三款原图在docs/images，完整提示词在docs/logo-prompts.json。当前代码的npm隔离安装、官方源码宿主加载、390/900px页面检查通过；全仓142项，141通过、0失败、1symlink跳过，check与diff检查通过。

用户已明确授权更名GitHub、将已验收代码发布到默认分支及发布npm。GitHub现为polang233/claude-desktop-zh，main已发布865eba7，v0.1.0 Release和安装包已上线，远端源码与资产哈希读回一致；topic搜索已命中本仓库。用户已完成npm登录，实际账号polang233；首轮publish返回E403，需先由用户完成npm网页发布验证，现已发起所需步骤问题，不能重复索要发布授权。npm尚未发布，真实magpie列表图标待用户确认。保留原目录、test/profile-reuse-real-app-20261018、HEAD89bb330及其未提交成果；发布提交位于独立检出.handoff/release-20261019/publish。私人产物与报告位于.handoff/release-20261019，最终tarball SHA256为30f603393160fc18169af5b45f2dccb6a0024a16bca38a5f9a60c40bca4d2264。发布后执行check-registry.mjs再以check-host.mjs验证registry-check目录，后者第6个实参为registry。不要将隔离宿主加载称作npm安装后Claude GUI全链路验收。详细包结构与收录规则见release.md，旧首次安装实机证据继续有效。

公开GitHub v0.1.0已由Bun实际下载、隔离安装并通过官方源码宿主加载。此证据也只涉及宿主层。日常文件夹安装换成npm时，先在magpie移除旧条目再安装新包；同源记录必须唯一，禁用但保留的旧条目仍会触发拒绝。不要直接改写日常plugins.json。

最新npm接续：用户已启用2FA，两次网页验证后CLI仍在done端点返回E404，没有成功回执，版本尚未发布，两进程均已退出。已隔离安装npm11.21.0，准备.handoff/release-20261019/publish-npm.ps1，由用户在自己的PowerShell直接执行以同时看到终端和网页；脚本固定核对原tarball哈希，未更改系统npm，已向用户发出执行问题。等待最终输出后查registry，不要再循环发送旧验证链接或重启日常应用。

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

接手时先读 HANDOFF 最新表及私人索引，发现当前原进程与宿主身份。当前没有待用户回复的验收问题，不再要求退出或手动运行旧命令。用户最终这轮已确认通过；保留运行中的监听及原窗口。

以下历史接手说明仅供追溯。

更新时间：2026-10-18 晚间（Asia/Taipei）。本文是本次整理后的接手入口。先读仓库根目录 [AGENTS.md](../AGENTS.md) 和 [HANDOFF.md](../HANDOFF.md)，再按本文推进。历史细节以 [实机验证记录](profile-reuse-validation.md) 为据；旧阶段“只完成预检、所有 UI 未验证”的结论不能覆盖后来的实机结果。

**最新续接覆盖下文等待退出状态：用户已正常退出，授权设置已执行并重开原版。** 零进程核对、6条会话无待发送/自动恢复标记、两份计划`scheduledTasks`为空后，23:56:55创建`developer_settings.json`，仅allowDevTools:true，原文件不存在的事实和新哈希已记录。经原身份重开主PID62412、窗口存在且响应，108行启动日志无恢复/发消息记录。当前等待用户Ctrl+Alt+I → Console执行已生成picker脚本并报告结果；原GUI中文尚未通过，不再重复要求退出或授权设置。原窗口当前打开，外部不能共写profile。结束后恢复开发者设置须等正常退出并核对哈希。路径见私人索引。

**晚间最新状态优先：原入口已恢复，不要再按下文历史状态当成未打开。** 用户要求恢复且不得续跑任务，22:48经原AppsFolder身份重新打开，原路径/窗口存在/响应已确认；启动前6条会话未见待发送/自动恢复标记、两份计划为空，未调用恢复或发消息，观察无Code worker或终端。没有原窗口内容GUI验收。

已实现另一条[原版运行时中文实验](runtime-language-experiment.md)，不是预检：生成可撤销脚本，经隔离Chromium实际加载原版未修改语言模块，接受简体中文并读到35,441条基础/49条动态消息，撤销和限定请求通过；不改原包。但原桌面中文、Cowork中文和每次启动自动加载均未验证/未实现，未接入magpie。全仓123项，122通过、0失败、1跳过，自检和差异检查通过。

**下一步已获用户授权**：等用户正常退出原Claude，备份并仅开启应用allowDevTools，重新通过原身份打开，由用户手动执行生成脚本做原版窗口验收。不要再次索要这项授权。当前检测仍运行，设置文件未创建，私人设置助手实际拒绝运行中写入；桌面控制运行时启动失败，已请用户File→Exit并等待其状态回复，不得强杀/共写/据等待当成退出。退出后重检会话及计划标记，不恢复任务。路径和一次性设置/恢复助手见.handoff/local-environment.md。自动启动入口继续研究，不能把一次性DevTools成功当成完整目标。

最新结果见 [MSIX资源修改包实验](msix-resource-experiment.md)。用户已授权临时信任并在结束后移除。探针成功安装、依赖登记，但真实包上下文仍读到原始资源，覆盖未通过。**移除探针时Windows部署关闭了原Claude，系统TerminateApplications事件已确认；不能称本轮未影响日常程序。** 探针、相关依赖及临时证书信任已清除。原包正常登记、核对的程序哈希一致，设置和当前5条Code/1条Cowork记录可读，但没有完整资料前后基线。为避免自动续跑，原Claude暂未重开，已询问用户恢复方式。新增集中MSIX部署脚本在原应用运行时拒绝安装/移除，进程拒绝夹具已通过。当前分支及全部未提交成果保留；GUI中文/Cowork/magpie链路仍未通过。

本轮先核对用户提出的直接验收目标：“magpie 安装插件后，选中文或默认中文，下次打开原 Claude 为中文”。目前不满足。偏好页只保存语言，插件启动不应用；还需工作台显式安装，而当前本机 MSIX 的只读检查仍为 `eligible:false`、`protectedInstall:true`。现有副本实测仍有效，但不能据此宣称该原入口体验已完成。本轮核对了既有私人报告和证据存在性，没有重新启动应用；117项回归116通过、0失败、1跳过，自检及差异检查通过。详见 HANDOFF 顶部和 validation 的本轮记录。

## 1. 一句话现状

**中文副本保留设置和 Code 会话/历史已有本机真实窗口验证，但完整目标仍未达成：Cowork 普通副本受 MSIX 身份限制，商店原程序无副本汉化尚不可用，迁移实验也尚未做成可重复的正式功能。**

此前文档整理轮只读取状态和记录；17:26轮做了MSIX构建和安装失败实验，17:31后用户授权的实装/资源视图/清理及退出副作用见顶部。下文设置/历史GUI结果仍来自此前实机记录，本轮未重启原Claude。

## 2. 用户最终要什么

最终体验是：在 magpie 安装插件、选择简体或繁体中文，尽量继续使用原 Claude Desktop，保留现有设置、会话列表和历史内容，日常数据及常用功能不受破坏；独立脚本入口继续保留。

必须区分两条路径：

- **原位路径**：在原应用上应用语言资源，沿用原 profile。优先研究可支持的安装形态；当前商店版明确拒绝写入，不能改 WindowsApps 权限来完成。
- **副本路径**：用户明确选择的迁移/实验路径。程序和数据都放在独立位置，验证保留设置、列表和历史。文件迁移不等于两份应用实时共写原 profile，也不等于完整功能兼容。

用户需要的是实际可用的结果和真实验收。预检工具只是辅助，固定返回 blocked 不能作为完整交付；单次机器实验也不能直接宣传为通用迁移功能。

## 3. 仓库和版本状态

| 项目 | 本次读取到的状态 |
| --- | --- |
| 仓库 | `F:\Code\Projects\claude-desktop-3p-zh` |
| 当前分支 | `test/profile-reuse-real-app-20261018` |
| 当前 HEAD | `89bb33069ed0bcc84cf9e5fb7fffeebec0301e35` |
| HEAD 内容 | 本地检查点：profile 快照工具与真实应用接手说明 |
| 历史基线 | `a5fd286`，原分支 `checkpoint/magpie-profile-handoff-20261017` |
| 未提交成果 | 接手时根交接/README及4份docs共6份文档继续保留；本轮新增MSIX实验说明、2个构建/资源视图脚本及1份测试文件，均未提交 |
| 发布 | 当前版本 0.1.0 原型；不要假定本地检查点已推送，未发布 npm 包 |
| 开发环境 | Node.js 22+，无 npm 运行时依赖 |

进入先运行：

```powershell
Set-Location 'F:\Code\Projects\claude-desktop-3p-zh'
git status --short --branch
git log -5 --oneline
```

以实际输出为准，保留新修改。**不要 reset/checkout 回 `a5fd286`，也不要覆盖未提交的实机验证文档。** 本次交接整理不提交、不推送；后续 Git 写入按用户明确授权范围处理。

## 4. 已有验证：哪些可以说通过

以下针对本机 Windows Claude Desktop `2.42304.0`，不是跨版本保证。证据细节见 [实机记录](profile-reuse-validation.md)。

| 验收项 | 已有结果 | 结论边界 |
| --- | --- | --- |
| 中文程序窗口 | 普通权限受管副本成功启动，简体界面实际显示 | 本次继承数据的实测为简体；繁体切换另有历史验证 |
| 设置保留 | 常规和 Code 设置实际打开；对照原版 17 个单选、8 个开关、输入值一致，8 个下拉值语义一致 | 未逐项验收全部设置 |
| Code 列表 | 原 4 个会话均实际显示 | 保留列表不证明任务可续跑 |
| Code 历史 | 4 个会话均实际打开并显示保存的正文 | 未发消息、未点击历史命令、未续跑原任务 |
| Cowork | 快照保留 1 条记录 | 普通副本入口灰色，列表/历史 GUI 未通过 |
| Gateway/登录 | 账号名称和 Gateway 模式保留 | 测试网关主动断开，未验证在线认证、模型请求或第一方登录迁移 |
| 收尾 | 测试副本正常退出，关联待机终端结束；原商店版重新打开，原 Cowork 入口及模型选择恢复 | 这是当时收尾记录，不是当前进程状态检测 |
| 原资料核对 | 恢复原版前，323 个纳入 profile 文件与 21 个源历史文件哈希一致；观察的协议/开机项摘要一致 | 不覆盖所有系统目录；原版重开后会自然更新状态 |

重要技术事实：**Code 历史正文不只在 Claude-3p profile 内。** 本轮停机快照为 323 文件、9,368,361 字节、117 目录；还按会话关联额外复制了 21 个 CLI 主历史/子 agent 伴随文件，共可解析 5,202 条 JSONL 记录。后续迁移工具必须显式处理这些外部历史，不能仅复制 profile 就声称正文完整。

原程序退出日志显示正常退出与 40 项清理完成，输入队列为零；现有记录明确该退出不是 agent 发出的退出命令，不能把退出归因于 agent 的菜单操作。

## 5. 当前没有解决的问题

### Cowork 的直接阻塞

该版本对普通 Windows 副本返回 `msix_required`：需要现代 MSIX 安装身份。真实入口不可用，不能用复制到磁盘的 1 条记录替代 GUI 验收，也不能把 Code 通过扩大为 Cowork 通过。

复制 VM 大文件不能解决安装身份。后续需要已有、合法、隔离的 Windows/MSIX 测试环境，或官方支持的只读历史入口。没有现成条件时给出具体最小需求；不要伪造 WindowsApps 路径、绕过能力检查或调整系统权限。

### 当前商店原程序仍不能原位汉化

原位资源事务已实现，构造应用回归通过；但当前受保护商店安装明确拒绝写入。还没有经验证的受支持资源覆盖方式，不能称“magpie 一装即可在原商店程序完整汉化”。正式非商店安装的桌面验收也未完成。

### 本机迁移方案尚不能直接产品化

当前实机流程主要依靠本机私有辅助脚本；公开的 [PowerShell 测试器说明](profile-tester.md) 对应旧文件准备流程，运行器仍没有 launch 分支。它的固定 blocked 与后续外部 agent 的真实启动是两个不同结果。

实验中有以下必须处理的局限：

- 隔离环境第一次启动报 `Failed to get 'appData' path`；补齐隔离 USERPROFILE 的标准 AppData/Roaming、AppData/Local 后才成功。不能退回使用真实用户 AppData 来解决。
- 候选计划文件一度写成 `{}`，触发 `scheduledTasks` 数组 schema 错误。下一次按真实 schema 正确准备或移除候选计划文件，不能依赖错误作为关闭计划的办法。
- Documents 原生已知文件夹查询曾回退真实用户 Documents；日志记录相应迁移 `skipped_root_absent`。下次需预建隔离标准目录并检查 Known Folder 行为，不能宣称所有系统路径均已隔离。
- 真实历史导航会自动创建 4 个隔离空工作区中的待机 PowerShell PTY；模型预热被 `workspace no longer trusted` 拒绝。没有发送消息或执行原任务，但不能宣传“零子进程执行”。
- 当前探针将所有通用 Node/Python/shell 等都视为 unknown，曾出现 168 个候选。不能把它们一概说成 Claude worker、批量终止，也不能无证据全部忽略；需依据路径、父子关系、PID+创建时间定位真正关联。
- 在线登录、模型请求、任务续用、数据库引擎完整性、完整 Cowork、双实例共写数据、跨版本兼容都没有验收。

## 6. 下一步怎么推进

按以下顺序做，先完成可审查的分析和实现，再安排必要实机操作：

1. **核对现有证据与环境。** 读本页和实机记录，检查分支/未提交成果、应用版本及本机证据是否仍在。不要立即重跑全套实机，也不要按旧 PID 操作进程。对用户说明已通过项、剩余阻塞和本轮准备解决的具体问题。
2. **先确定剩余目标的可行路径。** 对 Cowork 核实现有合法 MSIX 隔离环境或受支持历史入口；对原程序汉化研究受支持方式或正式可写非商店安装。若缺环境，报告最小条件及仍可独立推进的工作；不要自行启用组件、重启、重装日常应用或更改权限。
3. **把已验证的 Code 迁移整理为可重复实现。** 评估可复用的私有脚本，将历史关联复制、标准隔离目录、候选计划 schema、恢复/远程/MCP/工作区处理、精确进程识别、脱敏报告和收尾核对纳入正式流程。保留原始快照；补丁/锁/恢复/启动继续通过现有 CLI，避免第二套安装器。不要只移除 blocked 标记后直接运行。
4. **补有意义的回归。** 针对新实现验证 profile+外部历史完整性、未知 schema、路径/版本漂移、隔离目录、失败退出及收尾。运行 `npm test`、`npm run check`、`git diff --check`，将构造测试与真实桌面结果分开记录。
5. **条件满足才做目标明确的真实验收。** 由独立于 Claude Desktop 的 agent 持续负责；确认无未保存工作和活动任务，等待用户主动退出原应用。候选使用唯一独立目录；只读检查设置、列表和历史，不自动发消息、启动原任务或执行历史命令。若需扩大范围，先明确具体内容。
6. **验收后收尾与交接。** 正常退出自己启动的副本，核查相关进程，按已授权范围恢复原入口；对比纳入源资料、协议和启动项。先落脱敏报告，再处理明确属于本轮的临时文件。更新状态、验证与交接文档，逐项写清通过、失败和未测。

完成标准不能只是一条“全通过”：至少单列中文显示、常规/Code设置、Code列表、Code历史、Cowork列表、Cowork历史、登录态，以及原资料/入口恢复。功能或平台未测则保留未测；任务执行另行定义范围。

## 7. 安全与隐私约束

- 原 profile 只读；测试程序不能与日常程序共写原目录。安装、数据、工作区、CLI config、home、temp 均须明确到本轮目录。
- 严禁自动强杀用户进程或任务、批量结束 unknown、改 WindowsApps/ACL/完整性级别、签名或系统保护。不得自动发送消息、恢复 Code/Cowork 或执行原项目。
- 需要退出 Claude 的操作必须先确认 agent 宿主独立；在同一个 Claude Desktop 切模型、开新会话或子 agent 均不等于独立宿主。
- 不能以窗口关闭代替全部进程结束。确有活动任务/未保存内容时，说明具体对象，让用户处理该阻塞。
- 未知前端锚点、源文件/版本/哈希漂移和数据 schema 错误要停止；不能强制覆盖或套用旧备份。
- 报告只输出必要顶层路径、计数、哈希和结论。凭据、账号详情、标题、正文、会话 ID、原始命令行、完整 UI 树及截图不能提交或上传。JSON 解析异常也要脱敏。
- 官方语言资源、程序、profile 与私人证据保持在 Git 之外。没有明确归属和有效报告时保留快照，不清理原数据或旧实验。

## 8. 代码与证据入口

| 入口 | 用途 |
| --- | --- |
| [HANDOFF.md](../HANDOFF.md) | 仓库总交接；先看顶部最新实机结果 |
| [status.md](status.md) | 产品能力、限制和当前使用方式 |
| [profile-reuse-validation.md](profile-reuse-validation.md) | 本机真实 GUI 验收、失败项与收尾证据范围 |
| [validation.md](validation.md) | 各轮自动化及真实应用验证记录 |
| [profile-tester.md](profile-tester.md) | 旧独立测试器使用与限制，不代表新实机流程已自动化 |
| [CLI](../bin/claude-3p-zh.mjs) | 补丁/锁/副本/恢复/启动唯一命令入口 |
| [install.mjs](../lib/install.mjs) | 程序副本、数据初始化、完整性、启动 |
| [original.mjs](../lib/original.mjs) | 非保护安装资源事务及外部备份 |
| [profile-snapshot.mjs](../lib/profile-snapshot.mjs) | 只读快照、路径与目录身份、哈希校验 |
| [profile-test.mjs](../lib/profile-test.mjs) | 旧测试器编排与分层报告 |
| [profile-process-probe.ps1](../scripts/profile-process-probe.ps1) | 旧保守探针；需要改进关联识别，不能批量处理 unknown |
| [magpie 集成](../integrations/magpie) | 工作台、工具、插件入口；完整宿主链路仍待验收 |
| [.handoff/local-environment.md](../.handoff/local-environment.md) | 本机安装/profile路径和私人证据索引；忽略文件，不随远端分发 |
| [.handoff/real-app-20261018](../.handoff/real-app-20261018) | 最新私人实机证据、snapshot、额外历史和 managed 程序；谨慎读取，不上传 |

`.catalogs` 保存本机官方语言资源；`.handoff` 另有私有辅助脚本。旧归档实验可能带失效硬编码路径，禁止不审查就运行。若换机器，仅取得 Git 内容无法获得语言资源、应用与私人证据。

最新授权实验及部署检查轮回归结果为120项：119通过、0失败、1文件symlink fixture因创建权限跳过；目录junction和别名身份另有测试，未调整权限。`npm run check`、新增脚本语法检查及`git diff --check`通过。此前真实副本轮的117项结果保留在历史记录中。
