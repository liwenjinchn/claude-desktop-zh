# 开发交接

## 2026-10-19 claude-desktop-zh 命名、npm 包与图标

项目对外名称为 claude-desktop-zh，npm 包名 magpie-claude-zh，版本0.1.0。根目录现提供 magpie main/exports、设置页、简介、作者、repository、关键词和内嵌图标；原文件夹安装入口继续有效。控制器核对新包名，监听识别根目录、npm及该作者的GitHub安装，仍要求唯一启用记录、配置及注册哈希一致。现有状态目录、备份及provider标识沿用。项目当前目录、test/profile-reuse-real-app-20261018分支、HEAD89bb330及未提交内容保留。

三款透明卡通娘logo已保存docs/images/mascot-speech.png、mascot-beret.png、mascot-book.png，默认第一款，256px图标为assets/logo.png及设置页icon.png。两份package.json内嵌同一图标，解码117092字节；docs/branding.md及logo-prompts.json记录图稿和提示词。README加入logo，安装说明使用magpie发现页及npm包名，源码选择根目录。docs/release.md记录发布与收录步骤。

通过：全仓142项，141通过、0失败、1文件symlink夹具跳过；npm run check与git diff --check通过。新增真实tarball隔离安装回归，按npm包名导入、CLI、Windows适配器源码、页面路径及发布清单通过；npm安装和GitHub/root spec身份夹具通过。最终检查脚本输出调整后包回归再次通过。官方magpie源码host.js+Bun实际加载打包产物，3个工具、默认简体通过，自动加载关闭、零UI动作、宿主关闭stdin自然退出。Headless Edge 390/900px默认/保存、图标加载及无横向溢出通过，截图已检查；卡片为本地元数据预览。

发布进度：用户已明确授权GitHub仓库更名、默认分支发布和npm0.1.0发布，并将自行完成npm登录。现有公开仓库polang233/claude-desktop-3p-zh已有magpie-plugin topic。正在准备独立发布检出，原工作区保留未提交状态。GitHub更名/推送、npm发布及列表可见性须以其后读回结果为准。npm安装后原入口新启动未重做GUI验收，沿用此前文件夹安装的首次安装/自动简体实机证据；不扩大为npm端到端已通过。本轮没有操作日常Claude窗口或profile。

私人打包、宿主及页面证据在.handoff/release-20261019。安装包为magpie-claude-zh-0.1.0.tgz，pack.json保存实际文件清单和完整性；发布时使用最终重打包报告。

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
