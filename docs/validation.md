# 验证记录

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

## 2026-10-18 晚间续接：已授权DevTools设置与原版重开

用户回复已正常退出，实际检测Claude进程为零。只读核对6条会话无待发送/自动恢复标记，两份计划对象的scheduledTasks数组为空，所选配置Developer Mode未禁用。私人检查最初按根数组拒绝计划schema，读取字段类型后改为真实scheduledTasks数组检查；没有改计划文件。23:56:55仅创建allowDevTools:true应用设置，原developer_settings.json不存在，记录applied:true及新哈希。经原AppsFolder入口重开主PID62412，原WindowsApps路径、窗口存在且响应，108行启动日志未见resum/Sending message，未调用任务恢复或发消息。当前等待用户手动在Console执行picker，原GUI中文/Cowork中文尚未验证。没有新公共代码变更，沿用123项回归结果。

## 2026-10-18 晚间：恢复原入口与运行时语言实验

用户要求先恢复原Claude且不得续跑任务。22:48:36通过原AppsFolder身份打开原WindowsApps程序，主进程84184、窗口存在且响应。之前只读核对6条会话没有待发送/自动恢复标记，两份计划文件为空；启动后未调用恢复或发送消息，观察的后代仅Claude进程，没有Code worker/终端。桌面控制运行时启动失败，没有原窗口内容GUI验证；私人恢复摘要记录guiVerified:false。

新增运行时中文生成器，复用现有官方目录兼容选择，不改安装资源或由生成器写profile。在隔离Chromium实际加载未修改的原版语言模块，SHA-256匹配；临时清单使原归一化/状态接口接受zh-Hans，原路由函数读取35,441条基础/49条动态消息，“设置”匹配。错误来源、资源漂移、重复应用拒绝，未拦截无关API；撤销恢复fetch、清单及原状态。夹具没有Claude绑定/profile/任务桥。原桌面中文、Cowork中文和下次启动自动加载尚未验证，不能扩大此结果。夹具服务器已正常关闭。

用户已授权正常退出后备份并仅开启应用allowDevTools，再重开原版手动验收。当前仍在等用户正常退出；运行中守卫实际拒绝写入，设置文件和变更日志均未创建。私人设置/恢复PowerShell语法通过。新增3项回归通过；全仓123项，122通过、0失败、1文件symlink fixture跳过；npm run check及git diff --check通过。分支和未提交成果保留，无提交或推送。说明见[runtime-language-experiment.md](runtime-language-experiment.md)。

## 2026-10-18 17:39 已授权探针实装、负向资源验收及副作用

用户明确允许临时信任本次代码签名实验并要求移除包和证书。管理员限时脚本17:31:16导入公钥，17:31:42无行为探针包登记成功，主包Dependencies中确认该包。通过官方Invoke-CommandInDesktopPackage启动的新诊断进程身份匹配，但目标JS为原始哈希，overlayVerified:false / 退出3。没有安装中文载荷包或重启原程序做GUI，故不能将该负向资源验收扩大为所有MSIX方案均不可能。

17:32:32移除可选包触发原Claude退出，17:32:34系统部署日志记录主包服务/禁用及TerminateApplications成功。虽无ForceApplicationShutdown参数，操作仍影响日常程序；完整正常退出未证明。17:32:35探针及依赖移除、临时证书信任清除完成，复核可选包0/相关依赖0/证书不存在。原包仍登记，核对的ASAR和前端JS哈希与先前基线一致；退出后4份主要设置JSON可解析，5条Code/1条Cowork记录可读，未读到待发送输入。缺少本次实验前完整profile哈希基线，不声称全部资料不变。暂未重开原Claude以免自动续跑，已询问用户恢复方式。

已增加集中部署脚本manage-msix-resource-probe.ps1，对安装和移除均强制检测运行中Claude及包内辅助进程；显式进程夹具验证运行中/不可读路径/包内helper均被拒绝，不结束任何进程。脚本使用PackageTypeFilter Optional查验可选包，默认Get-AppxPackage查询不作为残留清除证明。用户授权、清理日志、负向验收、系统事件摘要和资料可读性报告保留在.handoff/msix-resource-ISbuCn/authorized-result.json，不上传私人数据。

最新全仓回归120项，119通过、0失败、1文件symlink fixture跳过，未改权限。npm run check、新增PowerShell部署脚本语法及git diff --check通过。最终复核临时证书不存在、探针可选包0、相关依赖0、原Claude包1、Claude进程0、管理员信任辅助进程已退出；原入口恢复方式仍待用户选择。

## 2026-10-18 17:26 原MSIX资源修改包实验

新增独立MSIX资源构建及真实包上下文资源读取脚本，包含无行为标记与真实官方中文载荷两种构建。已实际调用Add-AppxPackage尝试安装：无签名版0x80073D2B失败，修正schema后确认是未签名包必须为主包；两份独立包经微软MakeAppx解包通过并成功签名后，标记包实装因0x800B0109未信任证书失败。没有改信任或成功安装残留。官方Invoke-CommandInDesktopPackage读取返回真实Claude包身份及原资源哈希，可重复验收脚本返回overlayVerified:false / 3。原主进程仍运行，无profile读写、任务续用、强杀、ACL或系统信任变更。中文包覆盖/原入口重启/完整Cowork及magpie链路均未验证，详见[实验记录](msix-resource-experiment.md)。

新增2项隔离测试验证Windows ZIP/XML读取多块载荷、拒绝执行文件及路径逃逸/别名。全仓119项，118通过、0失败、1文件symlink fixture跳过；`npm run check`、两个新增脚本语法检查、`git diff --check`通过。真实包、公钥和脱敏报告在忽略目录；签名后已删除本轮临时私钥与口令。继续信任证书需用户明确授权，未据等待视为同意。

## 2026-10-18 17:02 magpie 下次启动中文目标核查

保留 `test/profile-reuse-real-app-20261018` / `89bb330` 和已有6份未提交文档。核对 `.handoff/real-app-20261018` 中既有 report、settings-comparison 及证据文件存在；既有真实副本结果继续有效，本轮没有重做GUI或将历史结论当成新实测。

| 本轮核查项 | 结果与证据 |
| --- | --- |
| 默认简体选项 | 通过源码及现有测试核对。page/app.js 和 controller.mjs 默认 `zh-Hans`，仅代表偏好/动作参数 |
| 设置页保存即应用 | 未满足。page/app.js 仅 `magpie.options.set`，测试也明确保存不运行命令 |
| 插件安装/启动即应用 | 未满足。server.mjs 只注册工具和工作台入口，无启动安装或自动轮询调用 |
| 显式工作台“应用中文” | 已有实现，调用 controller 的 original-check、网关检测、计划/必要资源导入及 original-install。构造回归通过，正式可写安装桌面验收未验证 |
| 本机原Claude下次启动中文 | 当前路径不可用。实跑只读 original-check，2.42304.0为 patchable:true、eligible:false、protectedInstall:true，未执行安装 |
| 已打开控制器/工作台读取新保存偏好 | 未验证。controller 捕获创建时 options，工作台初始化读取一次；不能假定宿主保存后立即重载 |
| 最新magpie GUI完整链路 | 未验证。本轮没有改日常插件配置或运行宿主安装测试 |
| Cowork及迁移 | 既有普通副本Cowork受 msix_required 阻塞；本轮未重测，正式可重复迁移仍待实现 |

本轮 `npm test` 117项，116通过、0失败、1文件symlink fixture因权限跳过，未改权限；`npm run check` 和 `git diff --check`通过。这些回归不能证明上述未完成的产品体验通过。源码/文档核查之外没有启动、退出或强杀Claude/magpie，没有应用语言补丁、共写日常profile、续跑任务、修改系统权限、提交或推送。受限命令环境曾连续报安全环境创建失败，后续正常执行环境只用于本轮读取、隔离测试及仓库文档记录。

## 2026-10-18 原profile隔离副本真实GUI

在 `test/profile-reuse-real-app-20261018` / `89bb330` 基线保留成果后，独立 DeepSeek Harness 执行了原程序停机确认、323文件一致快照、21个相关CLI历史文件复制、CLI中文副本准备与普通权限启动、真实窗口只读检查、正常退出副本、原商店版恢复。常规/Code设置、4个Code会话列表和4个历史正文实际显示；恢复原版后17个单选、8个开关及输入值一致，下拉值语义一致。原数据与注册项核对、首次appData路径错误修复及隔离边界见 [完整实机记录](profile-reuse-validation.md)。Cowork副本入口因本版本 `msix_required` 不可用，只确认1条记录的数据保留，未完成中文Cowork列表/历史验收。未提交模型消息或执行原任务，历史导航自动产生隔离工作目录的待机PowerShell，不能宣称零子进程执行。私人证据不入Git。本轮重跑 `npm test`：117项，116通过、0失败、1文件符号链接fixture跳过（未改权限）；`npm run check` 与 `git diff --check` 通过。原安装app.asar及受管资源哈希与副本准备基线一致。

## 2026-10-18 独立 PowerShell 测试器（历史阶段）

基于分支 checkpoint/magpie-profile-handoff-20261017 的 a5fd286 开发；未提交或推送。入口及范围见 [测试器说明](profile-tester.md)。检查点基线先验收 npm test 63通过及 npm run check通过。

新增测试器后最终 npm test：117项，116通过、0失败、1跳过；npm run check通过。跳过项为无法创建文件symlink fixture，没有修改权限；目录junction、目录别名/身份拒绝另有测试。覆盖进程持续静默与回流、真实PowerShell的构造进程表分类（孤立generic worker、字段不可读、PID重用）、路径重叠/别名、唯一目录、WAL/LevelDB保留、空间、源与副本漂移、结构错误及脱敏。真实CLI plan/prepare-copy/status以惰性构造应用集成，通过资源补丁和profile迁移但没有执行fixture exe。该测试不是正式桌面验收。

本机真实演练：

- Preflight：当前原安装资源兼容通过，2个相关进程、168个unknown候选阻止后续；协议及整个HKCU Run值摘要前后一致。没有读取profile内容或制作快照。
- Snapshot短等待：使用2秒超时、2秒静默要求，原应用持续运行，返回TESTER_WAIT_TIMEOUT及原始退出码2。没有读取/复制真实profile，没有创建真实程序副本或启动Claude。
- 首次Preflight经宿主的PowerShell -Command包装时，外层将非零退出归一为1；报告记录原始2。后续显式exit $LASTEXITCODE已验证外层返回2，不能把首次宿主的1改称完整测试通过。
- 独立测试器没有kill、清源锁、改ACL/完整性标签/系统组件、启动原应用或任务的分支。注册表只在内存摘要，不落原始值。程序资源和迁移数据均只写唯一实验目录。

仍未通过：启动边界未获证明，因此launch固定blocked；真实窗口、设置显示一致、会话列表和历史内容可读均not_run。登录迁移与数据库引擎完整性未验证，任务续用out_of_scope。即使文件级Snapshot所有步骤通过，测试器也返回3；没有端到端成功的0。原profile排除组未作哈希不变结论。全部真实报告在忽略的.handoff/profile-tests，本机路径见.handoff/local-environment.md。

## 2026-10-17 审计整理结果

最终 npm test：63 项通过，0 失败。修复安装后计划读取原备份、已安装目标缺失新语言时导入并重试、discover 工具 schema 遗漏。新增故障测试验证备份准备先记日志、失败可取消/重试、准备和 applying 日志后再次检查源文件及 ASAR 漂移、Windows 路径大小写与可执行文件检查。计划使用实际补丁 JS 快照及哈希，新增文件以 null 记录未存在状态。

仍有明确限制：强杀可能留下状态目录锁与应用目录锁，需要确认进程后人工检查；没有自动跨版本更新。OAuth code 入口会留下等待验证码提示，需取消；没有完成最新 magpie GUI 全链路验收。上述测试都是测试应用/HTTP/模拟页面，不代表当前用户商店版原位安装成功。

只读 original-check 再次确认本机 2.42304.0：patchable:true、eligible:false、protectedInstall:true。没有修改用户应用、数据或日常 magpie。以下保留上一轮验证与历史，不将旧测试计数当成当前结果。

## 2026-10-17 上一轮验证

- npm test：54 项通过，0 失败。原位模式事务在临时构造的应用中测试，原设置及会话文件字节不变；这不是正式非商店安装的完整桌面验收。
- 真实浏览器打开修复后的工作台，自动找到本机安装和现有 3p 配置；点击兼容性检查返回 patchable:true、eligible:false、protectedInstall:true。目标为商店版 2.42304.0；没有应用补丁或改变权限。
- 修复了浏览器 GET 无 Origin、方法级 authorize、同一入口导出清理函数、路径发现及缓存选择等首次使用问题。HTTP 测试覆盖鉴权、跨站拒绝、繁体参数、并发和清理。
- 最新完整 magpie 发行版的安装到应用全过程、本机商店版无副本汉化、正式非商店安装的 Code/Cowork 均未验证。不可根据 54 项测试声称全部可用。
- 浏览器预览采用 allowWrites:false，完成后关闭服务。未改变用户日常 magpie、Claude 设置或会话。

以下为 2026-10-16 历史验证，Windows，本机 Claude Desktop `2.42304.0`。

## 真实应用验证

通过本项目的 CLI 执行以下完整路径，而非只检查文件是否生成：

1. 从普通模式 Chromium block cache 导入官方简体、繁体基础与动态 JSON。
2. `inspect` 对商店版识别出外部 `ion-dist` 和唯一补丁锚点。
3. `prepare-copy` 创建独立副本，只修改两个前端 JS，并新增简繁各两份 JSON。
4. `launch` 后确认进程的数据目录均位于测试根目录的 `local/Claude-3p`，页面为 `app://localhost/new`。
5. 实际界面出现简体侧栏、Gateway 提示、欢迎语和输入提示，模型列表显示本机网关模型。
6. 关闭副本，用 `switch --locale zh-Hant` 重新生成补丁并启动。实际界面出现“新增、自訂、推論設定、伺服器、連接器”等官方繁体翻译。
7. 副本运行时调用 `restore`，工具拒绝修改文件。
8. 关闭副本，执行 `restore`。所有原有受管文件恢复成原始 SHA256，新增语言文件被移除。再次恢复返回 `alreadyRestored: true`。

此前手工原型另验证了简体设置页、Code 首页及重启后中文保持。CLI 的繁体切换经过完整退出重开。未发送模型消息、未启动项目任务，未验证模型生成、Code 工具执行或 Cowork VM。

## 语言兼容统计

本地基础键总数为 35,441。新增占位符兼容检查后，简体采用 35,345 条官方中文，85 个缺失键及 11 个无法确认占位符兼容的消息回退英文；繁体采用 35,310 条官方中文，117 个缺失键及 14 个占位符消息回退英文。两种动态语言包均匹配 49/49。

“匹配”表示翻译键存在且通过占位符名称比较，不等于所有页面视觉验收，也不等于每条字符串都包含中文。产品名称、模型名称和官方资源本身的英文文案可能保留英文。

## 自动化测试

`node --test` 共 22 项通过，覆盖：HTML/非字符串/原型键拒绝、缺失和占位符回退、嵌套 ICU 参数识别、兼容资源选择、资源哈希校验、未知补丁锚点拒绝、运行时符号变化、缓存边界、目录逃逸、符号链接拒绝、网关配置裁剪、真实文件恢复、恢复前全量检查、应用版本漂移、中断后的恢复、启动与安装的互斥锁，以及 magpie 页面 bridge 选项保存、宿主工具导出、写入授权、3p 检测后的同步、非网关不写入和运行中延迟切换。

magpie 页面做了隔离 bridge 模拟；混合插件安装在隔离的 magpie 配置中，未改日常配置。本机 0.1.1234 缺少新版工具 RPC；另用官方源码宿主与 Bun 1.4.2 验证了工具枚举、实际 CLI 检测和只读状态返回，写入默认被拒绝。自动同步和写操作授权检查已通过单元测试，未在日常宿主上做自动写入。macOS 未做实机测试，CI 的 macOS Node 测试不能代替应用签名和运行验证。

## 仍需验证

- macOS 修改资源后的签名、Keychain、Code、Cowork 影响。
- 更多 Windows 安装形态和新版本 bundle 锚点。
- macOS 与新版 Chromium Simple Cache 导入。
- ICU 富文本标签及完整语法的兼容性，当前检查只保守比较参数名称。
- magpie 真实宿主中的插件页加载和选项持久化。
- 用户网关密钥、端口或模型列表更新后的明确同步操作。首版不会偷偷监控其他应用。
