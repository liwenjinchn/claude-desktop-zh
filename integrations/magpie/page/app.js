(async () => {
  await magpie.ready;
  const options = await magpie.options.get();
  const valid = value => ['zh-Hans', 'zh-Hant'].includes(value);
  const current = valid(options.locale) ? options.locale : 'zh-Hans';
  const inputs = [...document.querySelectorAll('input[name="locale"]')];
  function render(value) {
    for (const input of inputs) input.checked = input.value === value;
    document.getElementById('command').textContent = `node bin/claude-3p-zh.mjs switch --root "<managed-directory>" --locale ${value}`;
  }
  render(current);
  for (const input of inputs) input.addEventListener('change', () => render(input.value));
  document.getElementById('save').addEventListener('click', async () => {
    const locale = inputs.find(input => input.checked)?.value;
    if (!valid(locale)) return;
    await magpie.options.set({ ...options, locale });
    options.locale = locale;
    document.getElementById('status').textContent = '偏好已保存。运行上面的命令才会应用到独立副本。';
  });
})();
