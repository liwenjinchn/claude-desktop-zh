# claude-desktop-3p-zh

为 Claude Desktop 的第三方网关模式启用官方简体、繁体中文。适用于 magpie、CC Switch 和手动 Gateway 配置。

工具导入官方语言 JSON，匹配本地版本后修补语言注册与加载入口。默认创建独立副本，保留原安装和聊天数据。需要 Node.js 22+，无 npm 依赖。

## 开始使用

在项目目录执行，替换尖括号内的路径：

```powershell
# 在普通模式加载一次所需语言，再导入官方缓存
node bin/claude-3p-zh.mjs catalog cache --locale zh-Hans --cache '<Cache_Data目录>'
# 繁体需要另外导入
node bin/claude-3p-zh.mjs catalog cache --locale zh-Hant --cache '<Cache_Data目录>'

node bin/claude-3p-zh.mjs plan --source '<Claude应用目录>'
node bin/claude-3p-zh.mjs prepare-copy --source '<Claude应用目录>' --destination '<新的副本目录>' --gateway-profile '<网关profile.json>'
node bin/claude-3p-zh.mjs launch --root '<副本目录>'
```

默认简体，创建副本时加 `--locale zh-Hant` 可选择繁体。副本关闭后，可用 `switch --root '<副本目录>' --locale zh-Hant` 切换，或用 `restore --root '<副本目录>'` 恢复。**通过 CLI 的 `launch` 启动，不要直接双击副本 exe。**

完整的路径说明、直接下载与手动导入、更新和恢复步骤见 [Windows 使用指南](docs/windows.md)。

## 当前状态

- **Windows**：在 `2.42304.0` 实测简繁主界面、独立副本启动、语言切换和恢复。未知前端结构停止修改。
- **magpie**：设置页、宿主管理工具与可选自动语言同步；受宿主版本限制，见 [magpie 集成](docs/magpie.md)。
- **macOS**：支持检测与补丁计划，尚未实测安装或签名，见 [macOS 边界](docs/macos.md)。

语言资源按匹配率和占位符兼容性选择，缺失消息回退英文。资源缓存在本地 `.catalogs/`，不随仓库分发 Claude 二进制或官方翻译。

## 文档与开发

- [实施过程、本机环境与测试总结](docs/implementation-summary.md)
- [详细验证记录](docs/validation.md)
- [实现与恢复设计](docs/design.md)

```sh
npm test
node bin/claude-3p-zh.mjs help
```

项目代码为 MIT，官方资源权利归属见 [NOTICE](NOTICE)。当前为 `0.1.0` 原型；Windows 已实测，macOS 安装仍待验证。npm 包尚未发布。
