# 独立 PowerShell profile 测试器

任务澄清：本工具是文件级辅助成果，不是用户最终要的实机验证。用户将交给外部独立 agent 直接操作原 Claude 的退出、测试副本启动及界面检查；下一步按 [外部 agent 任务](next-agent.md) 继续，不要求继续交付一个始终阻止启动的测试器。下文描述现有工具的限制，不是禁止后续实现真实测试的用户指示。

基于检查点 `a5fd286`。本版完成外部入口、预检、等待退出、只读快照、中文资源副本准备及数据迁移检查；**没有通过保留设置、会话列表和历史内容的真实界面验收**。迁移后的启动始终被阻止，正常完成准备仍返回 `3`。

已知原因：现有 [CLI 启动实现](../lib/install.mjs) 没有经过验证的边界，可以同时阻止自动恢复、计划、远程连接、CLI/绝对工作区访问和协议注册。用户主动退出解决并发前提，不能代替这些启动安全证明。详见 [历史实验](profile-reuse-validation.md)。本版没有强行启动、降级隔离或忽略该门槛的开关。

## 从外部终端运行

需要 Windows、Node.js 22+、Windows PowerShell 5.1 或更新版，以及本机已有的合法语言资源。运行器不依赖 Claude、magpie、DSH、浏览器页面或当前开发会话。保留完整仓库；没有新增 npm 运行时依赖。

在用户自己打开的独立 PowerShell 中进入仓库。显式指定当前应用目录和现有 `Claude-3p` 目录；不要直接复用历史版本安装路径。

```powershell
$sourceApp = 'C:\path\to\Claude\app'
$sourceProfile = 'C:\path\to\Claude-3p'

# 可以在原应用仍运行时演练；不读取 profile 内容，不制作快照。
.\scripts\test-profile-reuse.ps1 -Mode Preflight `
  -SourceApp $sourceApp -ProfileDirectory $sourceProfile
$LASTEXITCODE
```

准备进行文件迁移时，在同一个外部终端执行：

```powershell
.\scripts\test-profile-reuse.ps1 -Mode Snapshot `
  -SourceApp $sourceApp -ProfileDirectory $sourceProfile `
  -TimeoutSeconds 600 -StableSeconds 6 -PollSeconds 3
$LASTEXITCODE
```

`Snapshot` 先预检，然后等待。由用户主动退出原应用及其任务/后台 worker。工具不会关闭窗口、停止进程、清除源锁、启动原应用或重启机器。窗口消失不能作为全部退出的证据。测试器不会发送消息、续跑 Code、启动 Cowork 或操作项目。

不要点源应用的退出按钮来配合本版 UI 测试：本版即使成功准备了副本，也会停在启动前。退出与快照仅在用户希望完成文件级迁移检查时有意义。用户可在测试器结束后自行重新打开原应用。

可选参数：`-Locale zh-Hans|zh-Hant`、`-CatalogDirectory <目录>`、`-OutputParent <目录>`、`-NodePath <node.exe>`。默认资源是仓库 `.catalogs`，输出是 Git 忽略的 `.handoff/profile-tests`。每次创建唯一目录，不覆盖旧实验；仓库内的输出只允许放到 `.handoff`，也可选择仓库之外的新实验父目录。不会改变执行策略、系统权限、完整性级别或系统组件。

若使用 `powershell.exe -Command` 包装调用，需显式 `exit $LASTEXITCODE` 才能保留数字退出码；某些宿主会把脚本的任意非零值归一为 `1`。报告中的 `exitCode` 保留原始测试结果。

## 阶段与证据范围

| 检查 | 实际含义 |
| --- | --- |
| compatibility | 复用 CLI `plan`，语言资源和当前前端结构兼容；不是安装或启动成功 |
| processExit | 可见相关进程与保守 worker 候选连续静默；不是窗口关闭检测 |
| fileSnapshot | 纳入文件的集合、大小、SHA256 前后与副本一致 |
| dataStructure | 可识别 3p gateway 配置和活动配置关联；保留 JSON/JSONL 可解析、会话与历史记录计数；不是 UI/数据库引擎验收 |
| localizedCopy | CLI `prepare-copy` 和 `status` 校验资源副本；没有运行该程序 |
| migratedData | snapshot 与副本独立 profile 的纳入数据字节一致 |
| originalIncludedFilesUnchanged | 最终再次对比源中纳入快照的文件集合与哈希；不覆盖排除组 |
| registryUnchanged | 本次观察到的 HKCU claude 协议和整个 HKCU Run 值摘要一致；摘要变化时不归因于测试器 |
| excludedOriginalData / databaseIntegrity / signInState | 未验证 |
| launchSafety | 始终 blocked |
| window / settingsDisplayed / sessionsDisplayed / historyDisplayed | 始终 not_run；不能视为显示一致或历史可读 |
| taskResume | out_of_scope |

进程探针读取进程表，匹配 Claude/Cowork 名称、原安装/profile 路径、相关后代和此前观察到的进程身份（PID + 创建时间）。首次探测前已失去父进程的通用 worker 可能没有路径线索，因此 Node/Python、SSH、WSL/VM、常见 shell 等无法确认归属的候选也计为 unknown。这可能阻挡无关开发进程；**原应用退出后仍有候选时，本版会继续等待并超时，不能保证仅退出 Claude 就可完成快照**。本版不提供忽略 unknown 或自动处理候选进程的选项；枚举失败则立即失败。它也不宣称枚举出任意自定义可执行程序或远端主机上的所有任务。

快照在静默条件满足后才读取源内容，并在逐文件复制前后重新探测。文件用独占目标创建，校验源的逐文件哈希、最终文件/目录集合和全部副本哈希；发现变化、不可读文件、未知文件类型或复制失败就保留部分结果并失败。SQLite 数据库、`-wal`/`-shm`/`-journal` 以及 LevelDB 日志、表、manifest 一起保留；不对正在运行的数据库承诺事务快照，不运行 SQLite/LevelDB 修复或 checkpoint。磁盘空间不足时停止。

所有祖先与递归条目拒绝 symlink/junction，路径和目录身份用于拒绝源/目标重叠及短名/驱动器别名；无法验证身份就失败。没有启用系统组件或修改 ACL。

默认不复制四组内容，并只报告其文件数、目录数和字节数：

- 大型组件：VM、CLI 组件与 git-shadow。
- 可再生缓存、日志及崩溃缓存。
- 运行锁标记。
- worker 凭据目录与 host-creds 文件。

排除不等于删除或修改源文件，也不能证明被排除的数据未变化。发现被排除子树里的链接仍拒绝继续。

程序资源由现有 CLI 创建；准备时使用无私人凭据的占位 gateway 配置。随后把生成的 profile 留在本轮目录内另存，再复制完整 snapshot 作为候选数据。原设置和恢复字段保持原字节，不把切换网关地址或清理两项偏好当成隔离。原 locale 也保持不变，真正 UI 启动前的语言设置调整尚未执行。候选数据含真实配置与历史，**不能直接双击副本 exe 或改用普通 CLI launch 绕过测试器门槛**。

## 报告、退出码与私人数据

终端输出固定阶段、计数和报告路径。输出目录包含可分享前自行检查路径隐私的 `report.json` / `report.md`，以及含身份标记的 `owner.json`。报告包含顶层输入路径、计数、应用哈希、固定状态和错误码，不包含密钥、网关内容、账号、会话 ID/标题/正文、工作区路径、原始命令行、UI 树或注册表原始值。异常消息不直接写入报告。

`private` 子目录保存 snapshot、私密文件 manifest、候选 profile、程序副本和 CLI 过程文件。它们可能包含凭据和完整会话内容，不提交、不上传。报告先落盘；本版不自动清理快照或部分副本。后续清理须核对本轮唯一目录及拥有标记，不能清理输入 profile 或未知状态的旧目录。

| 退出码 | 意义 |
| --- | --- |
| 1 | 参数、权限/可读性、枚举、复制、哈希、数据结构或过程失败；具体看固定 error 码 |
| 2 | Preflight 发现活动/未知候选，或 Snapshot 等待超时；未完成迁移验证 |
| 3 | 预检或文件准备完成，但启动门槛未通过，真实 UI 仍未验证 |

本版不存在“全部验收通过”的 `0` 返回路径。结果文件是重新进入开发对话后的读取入口，不能把非零退出当成成功的端到端测试。

## 本轮验证

本机只执行 Preflight，没有为了验证而退出原应用。观察到资源兼容通过，活动/unknown 候选阻止后续阶段，协议/开机项摘要一致；没有真实 profile 快照、程序副本或应用启动。机器专属报告放在忽略的 `.handoff/profile-tests`。

自动化测试使用临时构造 profile、惰性应用、语言资源及进程表。真实 CLI 的 plan/prepare-copy/status 集成不执行 fixture exe。测试还覆盖静默计时重置、worker 回流、孤立候选、不可读进程、PID 重用、WAL/LevelDB 保留、源/副本变化、空间、链接/目录别名、坏 JSON/JSONL 和脱敏。文件符号链接 fixture 在本机缺少创建权限时跳过，目录 junction fixture 另行验证；没有为测试调整权限。

这不代替正式 Windows 应用的设置显示、会话列表和历史内容验收，也不证明 macOS、模型请求、Code/Cowork 执行或双实例共用数据安全。
