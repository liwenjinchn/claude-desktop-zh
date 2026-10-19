# 原版运行时中文自动加载

2026-10-19，本机原商店版 Claude 2.42304.0 已完成真实验收：magpie 插件空选项默认简体，以及保存简体偏好后，从原入口打开的新进程都自动中文。最终用户确认文件框一次、调试窗口和文件框自动收起；报告仅一次提交、一次 Applied，目录选择 SelectedNative。原窗口 Cowork 界面中文另有用户确认，未执行任务或逐项验收全部历史。

## 首次安装

无需提前开启开发者工具或运行命令。插件默认简体、自动中文开启。原 Claude 运行时只等待；通过「文件 → 退出」正常退出后，插件备份并自动合并 allowDevTools=true。看到 Windows「中文已准备好」通知，再从原入口打开即可。本机已从设置文件不存在的状态实测此流程，最终一次 Applied、文件框一次及辅助窗口收起。

详见 [首次安装](first-install.md)。需要 Windows、Node.js22+和第三方 Gateway 配置；官方目录从本地、缓存或官方URL自动准备并验证兼容。繁体首次安装、冷缓存联网获取及其他机器仍未实测。

保持 magpie 运行。保存语言偏好之前已经运行的 Claude 不重新加载，所选语言用于下一进程。停用插件后原窗口不被强行关闭，开发者设置也不在运行中回退。

## 实现

首次准备由 lib/runtime-setup.mjs 和 CLI runtime-setup 实现，监听绑定 profile、宿主身份及注册哈希。只在全部 Claude 进程退出并稳定观察后修改一项应用设置，原始字节/哈希及事务日志保存在外部产品状态目录；临提交核对进程与设置哈希，漂移拒绝。Windows通知由监听自己的 NotifyIcon显示，当前magpie的tui.showToast仅记日志，不能当作GUI通知通过。

- CLI runtime-export 复用官方目录兼容选择，生成 version2 manifest、单行小 Console 脚本及独立 JSON 数据。固定脚本和数据 SHA-256，页面再核对原语言模块及 JSON 哈希。不修改原安装资源，不外部共写原 profile，不放宽 CSP。
- 脚本只临时声明中文目录、接管两条精确 GET 目录请求并调用原语言状态接口。无关请求继续使用原 fetch。运行时对象提供 status/restore；它不管理外部监听，因此其 nextLaunchAutomatic=false 不表示 magpie 监听失效。
- Windows 适配器核对原 exe 完整路径、PID、创建时间、DevTools 的 app://localhost 来源、空输入、焦点及脚本全文。既有草稿拒绝，不使用剪贴板；定向向已验证的 DevTools HWND 提交，随机回执不以完整字面量出现在输入源码中。
- 仅处理本次执行后新出现的标准文件框，核对原主进程或同 exe 直接子进程、创建时间、窗口所有者及前台。填写本次生成的 JSON 完整路径并读回；不选择任意文件。
- 标准文件框优先通过原生 ID1 确认按钮定位，核对按钮为对话框子 HWND、Button 类、同进程、可见且可用，再定向发送 BM_CLICK。UIA 精确定位为后备。按钮消息返回不算成功，仍等待页面新的目录应用回执。
- 只有原主进程的短暂焦点回切可以重新激活已验证唯一文件框；切到其他应用立即停止。失败报告保留阶段与前台 PID/类，不包含会话、Console 全文或网关凭据。
- 已提交脚本的进程不重新执行整套流程，避免出现第二个文件框。打开调用后控件消失则等待原回执。成功后仅收起本次自行打开、身份和输入状态仍符合要求的 DevTools；用户预先打开的调试窗口保留。
- magpie 启动隐藏监听，绑定宿主 PID/创建时间/exe 及 plugins.json 哈希。PowerShell 与原生 UI 边界均检查宿主/配置仍有效，命名互斥量避免重复监听。使用自己的 stop 文件自然停止，不注册系统自启动，不启动或关闭 Claude，不恢复任务。

Windows Bun 1.4.3 在本机读取 WindowsApps 曾返回 EPERM，现由 Bun 宿主调用 PATH 中的 node.exe 执行同一 CLI，或使用显式 nodeExecutable。实际同版本 Bun 导出及最终 magpie 实机通过，没有更改系统权限。

## 独立脚本

独立模式请先正常退出 Claude，完成 runtime-setup 并准备兼容官方目录，在项目内导出到新文件。输出目录必须存在，已有同名文件不覆盖：

~~~powershell
node bin/claude-3p-zh.mjs runtime-setup
node bin/claude-3p-zh.mjs runtime-export --locale zh-Hans --output .handoff/language.js
& ./scripts/test-runtime-autoload.ps1 -Manifest .handoff/language.js.automation.json -Watch -WatchSeconds 600 -ActivateClaude
~~~

随后从原入口打开 Claude。保持原窗口及自动弹出的文件框前台，直到完成或60秒，不手动填写路径。独立监听十分钟后或检测到打印的 stop 文件自然结束，不要与 magpie 监听同时使用。

不带 Watch/ApplyOnce 时仅编译和自检。已有原窗口的单次验证可用：

~~~powershell
& ./scripts/test-runtime-autoload.ps1 -Manifest .handoff/language.js.automation.json -ApplyOnce -ActivateClaude
~~~

单次成功不等于下次启动自动加载；需要监听实际运行。激活仅选择完整路径匹配的唯一原进程，已有文件框、多实例或多个 DevTools 拒绝。识别/焦点/回执失败保留现场，不向其他应用输入，不自动清空草稿。

## 状态与证据

magpie 各宿主在 LocalAppData/claude-desktop-3p-zh/original/runtime/host-* 保存 status.json 及 bridge/*/result.json。watching 表示监听就绪；Applied 表示该次进程已取得新的目录回执。旧宿主结束后其状态文件可能停留在最后快照，须结合当前宿主及进程身份判断。工具 claude_zh_sync_status 只读取当前宿主状态。

失败历史保留在 HANDOFF、validation 及私人报告中：真实 DevTools 标题、UIA 发布延迟、空编辑器单 LF、大载荷截断、原文件框直接子进程身份、重复重试和拆分打开按钮。大载荷路线已由小脚本加 JSON 替代。仅加入 UIA SplitButton 未稳定解决；原生按钮路线最终通过单次及 magpie 新进程验收。

完整回归基线132项，131通过、0失败、1文件symlink夹具跳过；后续实际 Windows 编译、72项不操作 UI 的保护自检及相关定向回归通过。最后两次整仓复跑在执行前因自动审批审查超时停止，没有新的完整结果。Computer Use 运行时不可用，真实 UI 验收由用户操作，agent 根据回执及用户反馈记录，不声称 agent 独立看见最终窗口。

当前范围为本机简体默认/保存后的原版启动；繁体、全部设置/历史、Cowork任务执行、跨版本及其他机器尚未完成。当前原窗口及 magpie 监听保持运行；allowDevTools现在由首次准备事务管理，恢复须正常退出并使用对应journal核对哈希。

2026-10-19首次准备验收补充：全仓140项139通过、1跳过；之后Windows通知的9项定向回归及真实首次安装通知/自动准备/原入口首启通过。私人完整证据见 .handoff/first-install-20261019。
