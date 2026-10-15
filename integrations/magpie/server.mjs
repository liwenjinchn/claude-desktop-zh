import { createController } from './controller.mjs';

export const ClaudeChinesePlugin = async (_input, options = {}) => {
  const controller = createController(options);
  if (options.autoSync === true && options.allowWrites === true) {
    const timer = setInterval(() => { void controller.sync(); }, 15_000);
    timer.unref?.();
  }
  return {
    tool: {
      claude_zh_manage: {
        description: 'Inspect or manage an explicitly configured Claude Chinese copy. Writes are opt-in. Ask the human before prepare/switch/restore/import-cache, then pass the exact action as confirm. No shell commands accepted.',
        args: { type: 'object', properties: { action: { type: 'string', enum: ['detect', 'status', 'plan', 'import-cache', 'prepare', 'switch', 'restore'] }, confirm: { type: 'string' } }, required: ['action'], additionalProperties: false },
        execute: async ({ action, confirm }) => JSON.stringify(await controller.execute(action, confirm), null, 2)
      },
      claude_zh_sync_status: {
        description: 'Read the last opt-in language synchronization result. Does not start a synchronization.',
        args: { type: 'object', properties: {}, additionalProperties: false },
        execute: async () => JSON.stringify(controller.state())
      }
    }
  };
};
