# magpie 插件、扩展与自动同步

## 重新核对后的结论

**可以做真正执行检查和修改的插件，不限于设置页。** 原先把页面沙箱的限制推广到整个插件系统，范围过大。`magpie.page` 不能执行 CLI，但 OpenCode 兼容插件入口运行在 Bun 宿主中，可以使用 Node 文件和子进程 API。

本项目现在同时提供设置页和宿主扩展。宿主通过正式 `tool` hook 暴露管理工具，没有注册假的模型供应商，没有覆盖 magpie 内置的 `claude-desktop` agent。

## 已实现的能力

`claude_zh_manage` 工具接受以下 action：

- `detect`：只读确认指定配置是否为 3p Gateway。
- `status`：检查受管副本状态。
- `plan`：检查官方语言资源和补丁兼容性。
- `import-cache`：导入指定语言缓存。
- `prepare`：根据已保存路径创建独立中文副本。
- `switch`：切换副本语言。
- `restore`：恢复受管副本。

所有操作委托同一个 CLI，使用相同版本检查、锁和恢复逻辑。工具不接受任意 shell 命令或临时路径覆盖。写操作需要插件配置 `allowWrites: true`，并在调用中给出与 action 完全一致的 `confirm`；使用工具的 agent 仍需先取得用户对该具体操作的指示，布尔或字符串参数本身不等于人类授权。

## 安装和配置

项目目录保持可访问，Node 可执行文件位于 PATH，或用 `nodeExecutable` 指定绝对路径。

```sh
magpie plugin add ./integrations/magpie
```

通过 magpie 插件选项配置 JSON。`projectDirectory` 指向本项目根目录，不是 `integrations/magpie`。使用本机实际路径替换示例值：

```json
{
  "locale": "zh-Hans",
  "projectDirectory": "/path/to/claude-desktop-3p-zh",
  "sourceDirectory": "/path/to/claude/app",
  "managedRoot": "/path/to/chinese-copy",
  "profileDirectory": "/path/to/Claude-3p",
  "gatewayProfile": "/path/to/Claude-3p/configLibrary/profile.json",
  "catalogDirectory": "/path/to/local-catalogs",
  "cacheDirectory": "/path/to/Cache_Data",
  "allowWrites": false,
  "autoSync": false
}
```

CLI 形式为 `magpie plugin options '<插件路径或名称>' '<JSON>'`。Windows JSON 中的反斜杠需要转义，也可使用正斜杠。安装器和更新器始终是 CLI，插件没有独立的第二份补丁实现。macOS 写入限制也不会因插件调用而消失。

默认只读。启用写入后，可在支持插件工具的 agent 中明确请求操作，由其调用 `claude_zh_manage`。首次安装可能包含大文件复制，工具调用有时限，耗时较长的机器应直接运行 CLI；插件设置 45 秒子进程超时，超过后保留部分副本供检查，不能把超时称为安装完成。

## 自动切换可以做到什么

用户显式设置 `allowWrites: true` 和 `autoSync: true` 后，宿主每 15 秒检查一次：

1. 指定真实配置的 `deploymentMode` 是否为 `3p`，活动 profile 是否为 `gateway`。
2. 受管副本是否已安装、文件是否完整。
3. 副本的语言是否与保存的 `locale` 一致。
4. 需要切换时调用同一个 `switch`。副本正在运行或有其他安装操作时，CLI 拒绝，宿主将结果标为 deferred，稍后再试。

自动模式不会首次创建副本、停止 Claude 任务、修改系统默认快捷方式，也不会在当前商店版进程中注入中文。需要用户先明确创建受管副本；最终运行的仍是中文副本。

不能仅因“模型不是官方 Claude”就判断进程处于 3p。相同 magpie 账户还可供 Claude Code CLI、其他 agent 或兼容服务使用。检测应落到 Claude Desktop 的部署配置；配置本身也不证明旧进程已经重启切换。

没有找到正式的“Claude 开启网关”插件事件，因此目前是宿主存活期间轮询，不是可靠的系统常驻服务。插件宿主按需加载，CLI 结束、宿主重载或退出时监控会停止。页面保存 options 可能触发宿主重启，不能把 options 当作执行命令队列。当前也没有依赖未经确认的 `lifecycle.dispose` 调用保证。

## 官方能力与社区先例

本次重新检查了 GitHub [magpie-plugin topic](https://github.com/topics/magpie-plugin) 的相关项目，并区分了几类机制：

- **官方 tool hook**：[职责说明](https://github.com/yetone/magpie/blob/main/docs/subsystems/plugin-tools.md)、[宿主实现](https://github.com/yetone/magpie/blob/b03031738b041a1a3bcf1a3478c43b045fb0a62a/internal/plugin/host.js)、[官方样例](https://github.com/yetone/magpie/blob/main/internal/plugin/testdata/tools/index.js)。Bun 中执行，工具通过 magpie MCP 出口提供给 agent。
- **官方页面**：[page bridge](https://github.com/yetone/magpie/blob/main/internal/gui/pagebridge.js)。可保存自身 options，但 iframe 的网络与执行限制仍然存在。本项目页面不能直接调用上述宿主工具。
- **Skill Shelf**：[项目](https://github.com/voidrinz/skill-shelf-magpie-plugin)、[入口](https://github.com/voidrinz/skill-shelf-magpie-plugin/blob/main/src/plugin.mjs)。从插件启动独立 loopback 管理工作台，再通过 auth 入口打开，证明完整按钮管理界面可以作为外部 companion 实现。该项目明确有登录 UI 等入口限制，不能视为官方页面任意执行接口。
- **Our Free Model**：[入口](https://github.com/mu-zi-lee/magpie-our-free-model/blob/main/src/managed.mjs)、[进程管理](https://github.com/mu-zi-lee/magpie-our-free-model/blob/main/src/managed-runtime.mjs)。示范宿主如何管理本地子进程。其 lifecycle 返回值不能代替对宿主是否实际消费 hook 的核对。
- **Claude Science**：[项目](https://github.com/shiyang1026/magpie-claude-science)、[Agent 声明](https://github.com/shiyang1026/magpie-claude-science/blob/main/src/agent.js)。使用 Agent 插件配合显式安装的外部服务，其 README 说明仅在 magpie 中安装插件不足以完成系统集成。这是插件加独立 CLI 的现实先例。

## 本机实际验证

本机 magpie 可执行文件报告版本 `0.1.1234`。在独立 `XDG_CONFIG_HOME`、`XDG_CACHE_HOME` 下安装本项目插件，关闭账号发现，没有修改日常 magpie 配置。该版本能加载混合插件，但其打包的 `host.js` **没有 tool RPC**，因此不能说管理工具已在这个发行版可用。

随后使用该隔离安装下载的 Bun `1.4.2`，运行官方源码提交 `b03031738b041a1a3bcf1a3478c43b045fb0a62a` 的宿主：

- 宿主真实枚举出 `claude_zh_manage`、`claude_zh_sync_status`。
- 通过宿主 JSON RPC 调用工具，实际运行 CLI，检测到测试配置的 3p Gateway。
- 实际读到受管副本为 restored 状态。
- 默认关闭写入时，restore 请求被拒绝。

因此已验证“正式宿主 → 插件工具 → CLI”的只读调用链；新增写操作和自动同步分支通过隔离单元测试。没有声称旧版 magpie 支持新 API，也没有在日常 magpie 上测试自动写入。可用 `scripts/verify-magpie-host.mjs` 对指定官方宿主和 Bun 复查，参数见脚本开头。

## 后续按钮工作台

若要做到普通用户在插件中点按钮完成检测、安装和恢复，可参考 Skill Shelf 增加明确安装的 loopback companion。需要会话令牌、同源和 CSRF 检查、后台任务进度、停用清理及与 CLI 相同的目录锁。当前没有实现该工作台，也没有把 auth 登录入口包装成已经完成的安装按钮。
