# MSIX 资源修改包实验

记录时间：2026-10-18 17:39，Asia/Taipei。目标仍是 magpie 选择中文后，下次从原入口启动原 Claude 显示中文并保留数据。用户已明确授权临时信任本次实验签名，并要求结束后移除附加包和该证书。探针安装成功，但在真实包上下文中未覆盖目标资源，没有接入插件自动安装。

## 已授权实验及副作用

17:31:16经UAC管理员脚本导入精确指纹的公钥到本机TrustedPeople，17:31:42探针包登记成功，原主包Dependencies中也确认该可选包。新启动的官方包上下文诊断进程返回真实Claude包身份；读到的目标JS仍为原始SHA256，未读到探针版本，验收返回overlayVerified:false / 3。没有安装中文载荷包，没有重启原程序作GUI验收。因此结论限于该候选方案未通过资源视图验收，不能声称已在原Claude GUI验证失败或证明所有MSIX覆盖方式均不可行。

17:32:32开始移除探针时，Windows部署触发原Claude退出。系统事件在17:32:34记录主包服务/禁用及TerminateApplications成功；即使没有ForceApplicationShutdown参数，卸载可选包仍会影响主应用进程。本轮操作没有防住这一副作用，不能称日常程序未受影响或正常退出已完整验证。17:32:35探针及其主包依赖清理完成；管理员信任脚本同时移除本次证书，复核可选包0、相关依赖0、该证书信任不存在。

原Claude包仍登记且状态正常，核对的原ASAR及前端JS哈希与先前基线一致。退出后只读检查4份主要设置文件可解析、5条Code和1条Cowork记录可读取，未读到待发送输入；没有本次操作前的完整profile哈希基线，不能证明全部资料未变化。为避免自动续跑原任务，原Claude尚未重开，已向用户确认原入口恢复方式。

## 本轮新增实现

- `scripts/msix-resource-probe.mjs` 构建独立、无执行权限的 MSIX 修改包，不安装。默认载荷只是给现有语言运行时追加无行为注释；指定语言时复用 `lib/install.mjs` 的 `plan` 生成真实中文补丁和官方简繁资源。没有另写补丁算法，没有打包 EXE/DLL 或 profile。
- 候选资源分别放在包内相对位置和对应真实安装位置的 ProgramFilesX64 VFS 映射下。两种位置能否覆盖主包资源均未验证，不能把包构建成功当成覆盖成功。
- `scripts/read-msix-resource-view.ps1` 使用微软 `Invoke-CommandInDesktopPackage` 启动隐藏、只读的独立诊断进程。通过 `GetCurrentPackageFullName` 核实真实包身份，比较该环境中资源的 SHA256，不启动 Claude 或读取会话。覆盖未通过时退出码为3。
- `scripts/manage-msix-resource-probe.ps1` 集中实验包安装/移除，两个操作均先检测原应用及包内辅助进程，运行中直接拒绝；安装还核对明确指定的包哈希和可信签名指纹。没有自动退出或终止应用的入口，不修改证书信任。可选包的查询与清理必须使用PackageTypeFilter Optional，默认Get-AppxPackage查询不能证明可选包已不存在。该脚本仅为后续明确授权的实验准备，未接入产品默认路径。

构建标记探针：

```powershell
node scripts/msix-resource-probe.mjs '<installed-package>\app' .handoff
```

构建真实中文载荷，证书主题须与之后签名匹配：

```powershell
node scripts/msix-resource-probe.mjs '<installed-package>\app' .handoff --publisher 'CN=ClaudeChineseResourceProbe' --locale zh-Hans --catalog-dir .catalogs
```

读取实际包视图：

```powershell
powershell.exe -NoProfile -NonInteractive -File scripts/read-msix-resource-view.ps1 -BuildReport '<generated-directory>\build.json'
```

## 本机真实结果

目标为 Claude 2.42304.0、Windows build 26300。下表是本轮真实执行，不是构造测试推断。

| 项目 | 结果 |
| --- | --- |
| 初次清单验证 | 失败。MainPackageDependency 不支持 MinVersion；修正后不再出现该错误 |
| 无签名资源修改包安装 | 失败，0x80073D2B。Windows 明确要求无签名包必须是主包，当前附加包不满足 |
| 微软 SDK 便携工具 | 官方 NuGet BuildTools 10.0.26100.7175，MakeAppx/SignTool 的微软签名有效；未安装系统 SDK |
| 标记包和官方中文载荷包 | 构建完成，MakeAppx 解包通过，两份包成功附加实验签名 |
| 实验签名包安装 | 17:26未信任时0x800B0109失败；17:31用户授权临时信任后探针包成功登记并出现在主包依赖中 |
| 主包上下文只读读取 | 通过。返回真实已注册 Claude 包身份，资源仍为原始哈希 |
| 有效资源覆盖 | 未通过；安装成功且确认依赖后，官方包上下文仍读到原资源哈希，验收脚本返回overlayVerified:false / 3 |
| 原入口中文、原 Cowork 中文、magpie 安装应用链路 | 未验证；不因已生成中文包而标为通过 |
| 日常环境 | 失败项。卸载探针触发Windows关闭原Claude；原包仍在、ASAR/前端JS哈希一致，完整退出/资料完整性未证明；尚未重开 |
| 收尾 | 探针0、主包相关依赖0、临时证书信任不存在；没有执行原任务 |

两份包的签名证书为代码签名用途，两天有效，2026-10-20 17:17:54到期。签名后已删除本轮临时PFX和口令文件，保留公钥文件与已签名包。用户授权后曾临时导入本机TrustedPeople，实验结束已从存储移除。实际包名、完整SHA256、证书指纹、私有路径和结果记录在本机.handoff，不提交或上传。

## 继续实验的边界

微软说明无签名内容包适用于测试；本机实测又进一步限定不能用于本次附加修改包。自签名修改包安装需要可信签名，微软包签名文档要求将实验公钥证书加入本机 TrustedPeople，这会改变整机证书信任。本机没有现成可用的用户代码签名证书。

用户已对本次临时信任及探针实验明确授权，清理也已完成。不得将此扩大为日常自动信任、任意系统保护修改或原任务恢复。该标记方案未通过有效资源覆盖，不继续安装中文包。今后任何可选包部署都必须在原Claude已停止时通过集中脚本执行；清理也有停止要求。用户先前关于不强杀、不同实例共写日常资料、不续跑任务的限制继续有效。

最新回归为120项，119通过、0失败、1文件符号链接fixture跳过。新增测试通过Windows ZIP/XML读取器验证多块资源，覆盖可执行文件、路径逃逸和Windows路径别名拒绝，并实际运行PowerShell进程检查夹具，证明活动主程序、不可读Claude路径及包内helper均会阻止部署。`npm run check`、脚本语法检查和 `git diff --check` 通过。

来源：[微软修改包说明](https://learn.microsoft.com/en-us/windows/msix/modification-packages)、[无签名包限制](https://learn.microsoft.com/en-us/windows/msix/package/unsigned-package)、[包上下文诊断命令](https://learn.microsoft.com/en-us/powershell/module/appx/invoke-commandindesktoppackage)、[实验签名证书信任](https://learn.microsoft.com/en-us/windows/uwp/packaging/create-certificate-package-signing)。
