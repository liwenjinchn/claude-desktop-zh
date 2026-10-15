# macOS 与现有汉化项目

macOS 的应用资源通常在 `/Applications/Claude.app/Contents/Resources`，主界面同样可能有 `ion-dist/i18n` 和 `ion-dist/assets/v1`。CLI 可以对显式指定的 `.app` 运行 `inspect` 和 `plan`：

```sh
sh scripts/claude-3p-zh.sh inspect --source /Applications/Claude.app
sh scripts/claude-3p-zh.sh plan --source /Applications/Claude.app --locale zh-Hant
```

尚未在 Mac 实机验证这些路径、缓存格式、界面、Keychain、Code 或 Cowork。`prepare-copy` 和 `launch` 在 macOS 停止执行，不把生成计划称为安装成功。

## 签名限制

`.app` 内新增 JSON 或修改外置 JS 也会破坏资源签名，复制应用本身并不能消除这个问题。[Apple TN2206](https://developer.apple.com/library/archive/technotes/tn2206/_index.html) 说明签名封装应用资源。若修改 ASAR，还涉及 `ElectronAsarIntegrity` 的 header hash，而非整个归档的 SHA256；见 [Electron ASAR integrity](https://www.electronjs.org/docs/latest/tutorial/asar-integrity)。本项目不修改 ASAR。

尚未找到有证据的“保持原官方签名且持久增加缺失中文”的通用实现。首版不自动重签，不关闭 SIP 或 Gatekeeper，不修改 entitlement、Keychain access groups 或 Hardened Runtime。

## 参考项目

- [javaht/claude-desktop-zh-cn](https://github.com/javaht/claude-desktop-zh-cn)，审查提交 `b1330b9aaf2f85e6e4ba05606e70d785686cd588`。使用中文 JSON、bundle 白名单、硬编码词表及 DOM 翻译。其 [语言注册代码](https://github.com/javaht/claude-desktop-zh-cn/blob/b1330b9aaf2f85e6e4ba05606e70d785686cd588/scripts/patch_claude_zh_cn.py#L219) 提供结构参考；其 [macOS 重签](https://github.com/javaht/claude-desktop-zh-cn/blob/b1330b9aaf2f85e6e4ba05606e70d785686cd588/scripts/patch_claude_zh_cn.py#L2168) 需要改变签名相关属性。
- [wangbigtiger33-boop/claude-desktop-chinese-localization](https://github.com/wangbigtiger33-boop/claude-desktop-chinese-localization)，使用语言 JSON 和 ASAR 中的 DOM 翻译注入，并提示签名及权限影响。
- [ooac/Claude-desk-cn](https://github.com/ooac/Claude-desk-cn)，使用 JSON、菜单资源、文本补丁和应用备份，macOS 修改后重签。

我们的范围是官方简繁资源、语言注册和恢复。无需继承这些项目的模型校验修改、执行权限修改、Frida 注入、更新接管或其他网关功能。现有项目是调研参考，本项目没有复制它们的实现源码。
