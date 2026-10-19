# 原版运行时中文实验

2026-10-19更新。用户已实机确认原商店版窗口及Cowork界面变成中文，并提供运行时状态：locale/messagesLocale均为zh-Hans、两条目录请求、restored:false。此结果来自原MSIX进程中手动执行脚本；没有改安装资源。每次启动自动加载尚未实现，状态明确为nextLaunchAutomatic:false，不能宣传为magpie设置后下次打开即中文。

## 已实现

`scripts/build-runtime-localization.mjs`复用现有`plan`的官方目录选择和占位符兼容检查，生成手动DevTools实验脚本、配套JSON及较小的文件选择脚本。生成器只读应用资源，不启动Claude，不读写profile，不安装附加包。输出文件已存在时拒绝覆盖；未知语言状态导出拒绝生成。

运行时先检查`app://localhost`来源及原语言模块SHA-256，再导入这个未修改的模块。临时在页面的`i18n-catalogs`清单中声明中文，只为两条中文目录GET请求提供数据，调用原应用的`setLocaleOverride`。其他网络请求仍交给原fetch。没有替换ASAR、可执行文件或包内JS，没有绕过远程调试授权。

语言选择由Claude自己的状态和React流程处理，实际应用运行时可能因此写入自己的语言偏好。撤销命令为：

```js
claudeChineseRuntime.restore()
```

它恢复fetch、临时清单及先前语言选择。尚未验证原版React完成重新渲染、所有文本或全部偏好的完整恢复。

生成方式：

```powershell
node scripts/build-runtime-localization.mjs SOURCE CATALOG_DIR zh-Hans OUTPUT.js
```

`OUTPUT.js`内嵌目录，可手动放入DevTools。较小的`OUTPUT.js.picker.js`通过浏览器文件选择器读取配套的`OUTPUT.js.spec.json`，先核对完整文件哈希，再解析为数据；不执行所选文件的代码，不要求放宽CSP。官方目录及生成文件留在忽略的本机实验目录，不提交Git。

## 验证范围

| 项目 | 结果 |
| --- | --- |
| 当前2.42304.0原版语言模块 | 未修改的实际模块在隔离Chromium中导入成功，SHA-256与原安装一致 |
| 原语言归一化和状态选择 | 临时清单加入后，原`setLocaleOverride`接受`zh-Hans`；撤销后仍归一到`en-US` |
| 官方目录读取 | 原目录路由函数生成中文URL，读取35,441条基础消息及49条动态消息；“设置”文本匹配 |
| 请求范围 | 无关API仍返回测试服务器的404，未被目录适配器接管 |
| 拒绝与撤销 | 其他来源、资源漂移、重复应用拒绝；撤销恢复fetch、清单及状态 |
| 日常资料和原任务 | 浏览器夹具没有Claude绑定、profile或任务桥；未用它运行日常任务 |
| 原Claude窗口中文 | 用户在原MSIX进程手动执行后确认，并提供messagesLocale:zh-Hans、catalogRequestsServed:2 |
| Cowork中文 | 用户确认“cowork没问题，而且也是中文的”；不包含VM任务执行或历史正文验收 |
| magpie设置后原入口下次启动中文 | 未实现；实验明确返回`automaticNextLaunch:false` |

本机浏览器证据和生成物索引在`.handoff/local-environment.md`。隔离浏览器验证不是原桌面窗口验收。

## 原版验收前置状态

最新续接：用户已执行picker并确认原窗口/Cowork中文，提供的实际状态为`{locale:'zh-Hans',messagesLocale:'zh-Hans',catalogRequestsServed:2,restored:false,nextLaunchAutomatic:false}`。证据为用户操作及文字回报，agent没有直接截图验收；私人user-confirmation.json保存范围。原窗口继续打开，没有要求退出或恢复任务。allowDevTools设置恢复助手需在正常退出后执行，哈希漂移时拒绝恢复。

用户已授权：正常退出Claude后，备份并仅开启应用自己的`developer_settings.json`中的`allowDevTools`，再重新打开原版，由用户手动运行脚本。该授权不包含强杀、操作系统权限/证书变更或绕过应用策略。原程序运行时不由外部进程写该设置；等待用户正常退出。组织禁用Developer Mode时不能绕过。

桌面控制运行时仍因CreateProcessSecurityEnvironment 0x80070020启动失败，本轮原版DevTools和窗口验收由用户手动完成。原进程存在/响应检查和用户窗口确认分别记录。

## 其他启动路径的核查

- 前端查询目录缓存位于内存，目录本体通过本地`app://`资源获取；单写`spa:locale`在本版本会被现有清单/语言列表归一回英语。
- 3p的`userContentRendererUrl`只配置Artifact预览iframe；bootstrap语言消息由包内代码生成。magpie的模型请求middleware没有接管这些包内请求的入口。
- Windows支持安装位置虚拟化，但需原包声明`windows.installedLocationVirtualization`；本机原包没有该声明。不能靠写AppData的VFS目录就当作资源覆盖成功。[微软扩展文档](https://learn.microsoft.com/en-us/uwp/schemas/appxpackage/uapmanifestschema/element-uap10-installedlocationvirtualization)。
- 原应用找到的扩展加载器只加载React DevTools。Electron要求应用在每次运行时显式加载扩展，不能把Chrome里安装翻译扩展等同于原Claude自动加载。[Electron文档](https://www.electronjs.org/docs/latest/tutorial/devtools-extension/)。
- 新核对：原应用`chromiumFlags`仅接受GPU/渲染开关，不能据此配置自动调试加载。Electron已经支持自定义协议的扩展，但需要应用声明`allowExtensions`；本机`app://`注册没有此项，不能仅靠安装普通扩展接管该页面。[Electron合并记录](https://github.com/electron/electron/pull/49951)。
- `app://`虽声明允许Service Worker，但未找到可供插件安装自有同源worker的入口，未伪造脚本缓存。`--custom-devtools-frontend`的Electron支持请求仍未解决，不能把Chromium开关直接当成可用实现。[Electron问题记录](https://github.com/electron/electron/issues/27336)。

原版运行时中文已由用户确认。下一步确定每次启动的加载方式；已询问用户是否接受magpie启动检测后短暂打开开发者工具、加载并收起这一候选交互，尚未实现或验收。没有这个入口前不接入magpie的“自动生效”提示。
