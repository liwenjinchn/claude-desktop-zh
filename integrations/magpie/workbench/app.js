(async () => {
  const labels = { source: '应用位置', root: '独立副本', profile: '3p 数据', gateway: '网关配置', catalog: '语言资源', caches: '可用缓存', locale: '默认语言' };
  const names = { check: '检查兼容性', install: '写入语言资源', detect: '检查网关', status: '查看状态', plan: '查看计划', 'import-cache': '导入语言缓存', prepare: '创建独立副本', switch: '切换语言', launch: '启动独立副本', restore: '恢复原始语言文件' };
  const localeNames = { 'zh-Hans': '简体中文', 'zh-Hant': '繁體中文' };
  const log = document.getElementById('log');
  const selector = document.getElementById('locale-select');
  const buttons = [...document.querySelectorAll('button[data-action]')];
  const token = new URLSearchParams(location.hash.slice(1)).get('token');
  // Keep the capability only in this page's memory, not history or storage.
  history.replaceState(null, '', location.pathname);
  function show(value) { log.textContent = typeof value === 'string' ? value : JSON.stringify(value, null, 2); }
  if (!/^[a-f0-9]{64}$/.test(token || '')) { show('会话地址缺失。请从插件重新打开工作台。'); return; }
  async function api(url, init) {
    const response = await fetch(url, { ...init, credentials: 'omit', cache: 'no-store', headers: { authorization: 'Bearer ' + token, 'content-type': 'application/json' } });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error || '操作失败。');
    return body;
  }
  try {
    const state = await api('/api/state');
    const copyMode = state.paths.mode === 'copy';
    const list = document.createElement('dl');
    for (const [key, label] of Object.entries(labels)) {
      if (!copyMode && key === 'root') continue;
      const term = document.createElement('dt'); term.textContent = label;
      const value = document.createElement('dd');
      const raw = state.paths[key];
      value.textContent = key === 'locale' ? (localeNames[raw] || raw) : Array.isArray(raw) ? (raw.join('\n') || '未找到') : (raw || '未找到');
      list.append(term, value);
    }
    document.getElementById('paths').append(list);
    selector.value = state.paths.locale;
    document.getElementById('mode').textContent = copyMode ? '当前目标：独立测试副本。操作不会安装到日常应用。' : '当前目标：现有应用的语言文件。保留现有配置；受保护的商店安装会拒绝修改。';
    document.getElementById('guard').textContent = '每次写入和启动都会再次确认。请先关闭目标应用；发现文件版本变化或权限不足时会停止。';
    const issues = state.paths.issues;
    if (issues && Object.keys(issues).length) show({ message: '部分路径未能自动确定，请先检查兼容性或查看状态。', issues });
    function enable(enabled) {
      selector.disabled = !enabled;
      for (const button of buttons) button.disabled = !enabled || (button.dataset.write === 'true' && state.paths.allowWrites === false);
    }
    for (const button of buttons) {
      button.hidden = button.dataset.mode && button.dataset.mode !== (copyMode ? 'copy' : 'original');
      button.addEventListener('click', async () => {
        const action = button.dataset.action;
        const locale = selector.value;
        const confirmed = button.dataset.write === 'true' || action === 'launch';
        const target = copyMode ? '独立测试副本' : '现有应用';
        if (confirmed && !window.confirm(`确认对${target}执行「${names[action]}」？\n所选语言：${localeNames[locale]}\n目标：${(copyMode ? state.paths.root : state.paths.source) || '自动检测（不明确时会停止）'}`)) return;
        enable(false);
        show(names[action] + '进行中…');
        try {
          const started = await api('/api/run', { method: 'POST', body: JSON.stringify({ action, confirm: confirmed ? action : '', locale }) });
          let job;
          do {
            await new Promise(resolve => setTimeout(resolve, 700));
            job = await api('/api/jobs/' + started.id);
          } while (job.state === 'running');
          show(job.state === 'done' ? job.result : job.error);
        } catch (error) { show(error.message); }
        finally { enable(true); }
      });
    }
    enable(true);
  } catch (error) { show('无法打开工作台：' + error.message + '\n请从插件重新打开工作台后重试。'); }
})();
