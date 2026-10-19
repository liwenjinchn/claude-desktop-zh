import { createController } from './controller.mjs';
import { createWorkbench } from './workbench.mjs';
import { createRuntimeHost } from './runtime-host.mjs';

// Only plugin factories may be exported here: the host invokes every export.
export const ClaudeChinesePlugin = async (_input, options = {}) => {
  const controller = createController(options);
  const runtime = createRuntimeHost(_input, options, controller);
  void runtime.start();
  let workbench, opening;
  async function opened() {
    if (!opening) {
      opening = (async () => {
        if (!workbench?.address()) {
          workbench = createWorkbench(options, undefined, controller);
          await workbench.listen();
        }
        return { url: workbench.url(), note: 'Local buttons call the same CLI. Keep this session address private; it expires after 15 minutes without authenticated activity.' };
      })().finally(() => { opening = undefined; });
    }
    return opening;
  }
  return {
    tool: {
      claude_zh_manage: {
        description: 'Inspect or manage Chinese language resources in the selected Claude installation. Ask the human before install/prepare/switch/restore/import-cache/launch, then pass the exact action as confirm. Optional locale selects Simplified or Traditional Chinese for this action. prepare explicitly creates an isolated copy. No shell commands accepted.',
        args: { type: 'object', properties: { action: { type: 'string', enum: ['check', 'install', 'discover', 'detect', 'status', 'plan', 'import-cache', 'prepare', 'switch', 'restore', 'launch'] }, confirm: { type: 'string' }, locale: { type: 'string', enum: ['zh-Hans', 'zh-Hant'] } }, required: ['action'], additionalProperties: false },
        execute: async ({ action, confirm, locale }) => JSON.stringify(await controller.execute(action, confirm, { locale }), null, 2)
      },
      claude_zh_sync_status: {
        description: '查看 Claude 中文准备和加载状态。',
        args: { type: 'object', properties: {}, additionalProperties: false },
        execute: async () => JSON.stringify({ ...controller.state(), automaticPolling: runtime.state().automaticNextLaunch, runtime: runtime.state() })
      },
      claude_zh_workbench: {
        description: '打开本机语言资源维护页面，返回本次会话地址。',
        args: { type: 'object', properties: {}, additionalProperties: false },
        execute: async () => JSON.stringify(await opened())
      }
    },
    auth: {
      provider: 'claude-desktop-3p-zh',
      methods: [{
        type: 'oauth',
        label: '语言资源维护',
        async authorize() {
          const page = await opened();
          return { url: page.url, method: 'code', instructions: '请在打开的页面管理语言资源，完成后关闭此窗口。', callback: async () => ({ type: 'failed' }) };
        }
      }],
      async loader() { return {}; }
    }
  };
};
