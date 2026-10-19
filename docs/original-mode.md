# 原位汉化与现有设置

原位模式只管理原程序的两个前端 JS 和简繁语言 JSON，不复制程序，不创建用户数据目录，不复制或改写 config.json、部署配置、登录态、聊天与项目会话。成功后用户通过原来的入口重新打开 Claude。

## 支持边界

目前仅支持 Windows 上可写、非 MSIX 的应用目录。此模式在隔离测试应用上验证了应用、简繁切换、恢复、重复恢复与再次应用；尚未证明任意官方非商店安装和全部桌面功能兼容。

对 WindowsApps 路径或附近存在 AppxManifest.xml 的安装，工具明确拒绝写入。不会接管所有权、修改 ACL、绕过包保护，也不会自动退回到副本。Mac 仍只有 inspect/plan。

2026-10-17 对本机商店版 2.42304.0 的只读研究：3p URL 固定为 app://localhost，静态资源固定指向 process.resourcesPath 下的 ion-dist。未找到受支持的外部语言资源覆盖配置。普通 Developer Mode 不等于远程调试授权，不能把调试参数当作已可用的自动汉化方案。这是对检查版本的结论，不是声称所有运行时方案都不可能。

## 独立脚本使用

先检查，保护目录会返回 eligible:false。已安装后查看计划使用 original-plan（会验证备份并从原文构建），不要对已补丁文件运行普通 plan：

```sh
node bin/claude-3p-zh.mjs original-check
```

对于符合条件的安装，先关闭目标 Claude，再导入语言资源并应用：

```sh
node bin/claude-3p-zh.mjs catalog cache --locale zh-Hans
node bin/claude-3p-zh.mjs original-install --locale zh-Hans
```

切换与恢复：

```sh
node bin/claude-3p-zh.mjs original-switch --locale zh-Hant
node bin/claude-3p-zh.mjs original-status
node bin/claude-3p-zh.mjs original-restore
```

可用 --source 指定应用、--catalog-dir 指定语言仓库、--state-dir 指定备份目录。CLI 默认语言仓库为当前目录 .catalogs；插件显式使用 LocalAppData 下的仓库。默认原位备份位于 `%LOCALAPPDATA%/claude-desktop-3p-zh/original`，不能放在应用内部。

## 恢复和更新

写入前检查目标进程已停止，并持有应用目录锁和 CLI 状态目录锁。强制终止或 45 秒超时可能留下两把锁；当前不会自动抢占。须先确认没有安装器/目标应用运行，再人工检查并处理 `<state-dir>.3p-zh-lock` 和 `<应用>/resources/.3p-zh-original-lock`。移除锁不是完成恢复，之后仍须检查状态并显式恢复。备份保存原文件哈希；切换从备份重新构建，恢复先检查全部目标、备份和 app.asar，再还原文件。备份前先记录 preparing；此阶段取消仅清理新备份，不写应用。若是切换中准备失败，第一次恢复会回到上次 installed 状态，再执行一次恢复才还原上次汉化。中断后的 applying 状态需要先恢复；版本已漂移则继续拒绝覆盖。

程序更新导致哈希变化时拒绝使用旧备份覆盖新版。当前没有自动跨版本迁移备份功能，不要删除状态文件后强行套用旧备份。界面显示兼容性结果并要求明确操作，不在插件加载时自动写入。

## 与副本模式的区别

副本仍作为显式实验选项保留（插件 options.mode="copy"，CLI prepare-copy）。它使用独立用户数据，因此不会继承现有设置。原位模式是插件默认模式，绝不会通过隐式创建副本解决权限不足。没有测试过让两份程序并发共用现有用户数据，也不提供该选项。
