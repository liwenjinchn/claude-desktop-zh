# claude-desktop-3p-zh

给 Claude Desktop 的第三方网关模式补上官方简体、繁体中文界面。

使用 magpie、CC Switch 或自己配置 Gateway 的用户都可以使用同一个 CLI。工具导入官方语言 JSON，按本地英文键集选择兼容资源，再补上本地前端的语言注册和资源加载逻辑。不是逐条替换界面文字，也不覆盖英文语言包。

当前是本地可审查的 `0.1.0` 原型，尚未发布 npm 或 GitHub。

## 支持范围

- Windows：独立程序副本安装、简繁切换、状态检查、启动、恢复。真实验证版本为 `2.42304.0`。其他版本必须通过补丁锚点检查，未知结构停止操作。
- macOS：资源目录识别、语言导入、兼容性检查和补丁计划。尚未在 Mac 实机测试，不自动改签或安装。
- magpie：提供可安装的设置页插件。保存语言偏好并显示 CLI 命令，不自动检测网关或修改 Claude。参见 [magpie 集成](docs/magpie.md)。
- 翻译资源：分别使用官方 `zh-Hans` 和 `zh-Hant`，不做简繁转换。缺失键和占位符不匹配的消息回退本地英文。

## Windows 使用

需要 Node.js 22 或更新版本。无需安装 npm 依赖。

下载或克隆本项目后，在项目目录执行。以下占位路径须替换成本机路径。

### 1. 找到应用目录

商店版通常是 `C:\Program Files\WindowsApps\Claude_<版本>_x64__pzs8sxrjxfjjc\app`，其他发行版选择包含 `claude.exe` 和 `resources` 的目录。

```powershell
node bin/claude-3p-zh.mjs inspect --source '<Claude应用目录>'
```

检查结果需要 `patchable: true`。本项目不获取 WindowsApps 所有权，也不修改其中的文件。

若要确认已有部署配置是否是 3p，可只读检查实际 `Claude-3p` 数据目录：

```powershell
node bin/claude-3p-zh.mjs detect-3p --profile-dir '<Claude-3p数据目录>'
```

输出活动 profile 路径，不输出密钥。配置为 3p 不代表当前进程已经切换；Claude 通常需要重启才读取部署变更。

### 2. 导入官方语言资源

在普通模式中选择一次需要的语言，等界面切换完成，再导入该应用的 HTTP 缓存：

```powershell
node bin/claude-3p-zh.mjs catalog cache --locale zh-Hans --cache '<Cache_Data目录>'
node bin/claude-3p-zh.mjs catalog cache --locale zh-Hant --cache '<Cache_Data目录>'
```

常见缓存目录为 `%APPDATA%\Claude\Cache\Cache_Data`，MSIX 安装也可能在 `%LOCALAPPDATA%\Packages\Claude_<publisher>\LocalCache\Roaming\Claude\Cache\Cache_Data`。缓存读取是只读操作，只提取官方中文基础和动态语言包，不导出其他缓存、Cookie、令牌或聊天数据。v0.1 支持 Chromium block cache，不支持所有 Simple Cache 或稀疏记录。

也可以直接获取官方资源：

```powershell
node bin/claude-3p-zh.mjs catalog fetch --locale zh-Hans --kind base
node bin/claude-3p-zh.mjs catalog fetch --locale zh-Hans --kind dynamic
```

`--url` 可指定带版本查询参数的对应官方 URL。返回 403 时使用缓存或手动导出的 JSON；工具不绕过登录、验证码或网站验证。

```powershell
node bin/claude-3p-zh.mjs catalog import --locale zh-Hant --kind base --file '<官方繁体JSON>'
node bin/claude-3p-zh.mjs catalog import --locale zh-Hant --kind dynamic --file '<官方繁体动态JSON>'
```

资源保存在当前目录的 `.catalogs/`。所有命令都可以用 `--catalog-dir` 指定固定位置。该目录不进入 Git 或 npm 包；每份资源单独保存来源、导入时间和 SHA256。候选资源按键匹配率选择，不按文件时间声称“最新兼容”。

### 3. 查看计划

```powershell
node bin/claude-3p-zh.mjs plan --source '<Claude应用目录>' --locale zh-Hans
```

`plan` 不修改应用。查看匹配率、缺失数量和占位符回退数量。基础语言包匹配率低于 95% 时，安装停止。

### 4. 创建独立中文副本

关闭已有的本项目副本。普通商店版可以继续运行。使用现有网关的 `configLibrary/<id>.json`：

```powershell
node bin/claude-3p-zh.mjs prepare-copy --source '<Claude应用目录>' --destination '<新的副本目录>' --gateway-profile '<网关profile.json>'
node bin/claude-3p-zh.mjs launch --root '<副本目录>'
```

默认简体。需要繁体时增加 `--locale zh-Hant`。只有已导入且兼容的语言才会注册。

也可指定 `--gateway-url` 和 `--gateway-key-file`。密钥文件只包含密钥文本，避免密钥出现在命令行参数中。工具只取网关地址、认证方案和密钥，不复制其他部署策略或授权信息。支持 `inferenceProvider=gateway`；Bedrock、Vertex 等专用部署尚未适配。

副本使用自己的 `local/Claude-3p` 和 `bootstrap` 目录，不复制聊天记录或官方账号登录。它不会自动跟踪原配置的网关密钥变更。**请通过 `launch` 启动，直接双击 exe 可能使用系统默认数据目录。**

### 5. 切换、更新和恢复

关闭副本后执行：

```powershell
node bin/claude-3p-zh.mjs switch --root '<副本目录>' --locale zh-Hant
node bin/claude-3p-zh.mjs launch --root '<副本目录>'
node bin/claude-3p-zh.mjs status --root '<副本目录>'
```

首版是固定语言的副本：页面加载时按 CLI 选定语言初始化。不要把应用内切换其他语言视为永久偏好。

更新语言资源后，再运行 `switch` 会从备份原文件重建补丁，不叠加字符串替换。Claude 本身更新后，用新版本创建另一个副本，不能用旧版备份覆盖新版。

```powershell
node bin/claude-3p-zh.mjs restore --root '<副本目录>'
```

恢复前核对 ASAR、所有受管文件及备份的哈希。恢复只还原副本的前端 JS，移除本工具新增的语言文件，保留副本和用户数据。手工编辑过的文件不会被覆盖。要回到原应用，退出副本并打开原商店版即可。

## magpie、macOS 和贡献

- [magpie 插件能力和设置页安装](docs/magpie.md)
- [macOS 适配边界和现有项目调研](docs/macos.md)
- [实现与恢复设计](docs/design.md)
- [验证记录](docs/validation.md)

```sh
npm test
node bin/claude-3p-zh.mjs help
```

项目代码使用 MIT 许可证。官方翻译、Claude 二进制不属于本项目的 MIT 授权范围，见 [NOTICE](NOTICE)。本项目不分发 Claude 安装包，不更改模型校验、执行权限、网关行为或系统安全设置。
