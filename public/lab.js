export async function renderLabPage(main, { api, escape, toast, user, isCurrent }) {
  const params = new URLSearchParams(location.search);
  let mode = params.get('mode') || 'vulnerable';
  const config = await api(`/lab?mode=${encodeURIComponent(mode)}`);
  if (!isCurrent()) return;
  let actor = config.actor, generation = 0;
  const formVersions = new Map();
  document.title = '自测靶场 · MIN LAB';
  const cases = Object.fromEntries(config.exercises.map(exercise => [exercise.id, exercise]));
  const heading = id => `<div class="exercise-heading"><span class="exercise-number">0${['sqli', 'idor', 'xss'].indexOf(id) + 1}</span><div><span class="eyebrow">${escape(cases[id].kind)}</span><h2>${escape(cases[id].name)}</h2></div></div><p class="exercise-goal">${escape(cases[id].goal)}</p>`;
  const output = id => `<div class="request-result" id="${id}-result" aria-live="polite"><div class="request-line"><span class="request-status">READY</span><code>提交请求后查看响应</code></div><pre>等待请求…</pre></div>`;
  main.innerHTML = `<section class="lab-hero"><div><span class="eyebrow"><i class="live-dot"></i>MIN LAB / PRACTICE LOCALLY</span><h1>动手试试，看见差异。</h1><p>发送请求，修改参数，再切换修复模式对照结果。</p></div><span class="lab-badge">3 个练习场景</span></section><section class="lab-controls" aria-label="练习设置"><label><span>运行模式</span><select id="lab-mode"><option value="vulnerable" ${mode === 'vulnerable' ? 'selected' : ''}>漏洞模式</option><option value="fixed" ${mode === 'fixed' ? 'selected' : ''}>修复模式</option></select></label><label><span>练习身份</span><select id="lab-actor"><option value="alice" ${actor === 'alice' ? 'selected' : ''}>Alice</option><option value="bob" ${actor === 'bob' ? 'selected' : ''}>Bob</option></select></label><p>身份仅作用于练习数据。<br><span id="mode-description"></span></p></section><p id="lab-error" class="form-error" role="alert" hidden></p>
    <div class="lab-grid"><section class="exercise-card">${heading('sqli')}<form id="lab-search-form"><label class="field"><span>商品关键词</span><input name="q" maxlength="200" placeholder="试试：笔记本"></label><button class="button secondary" type="submit">搜索商品 →</button></form><details class="lab-hint"><summary>查看测试提示</summary><p>正常搜索只显示 3 个已上架商品。尝试改变 WHERE 条件，观察是否出现未上架商品。</p><code>%' OR 1=1 --</code><p>修复对照：${escape(cases.sqli.fixed)}</p></details>${output('search')}</section>
    <section class="exercise-card">${heading('idor')}<form id="lab-note-form"><label class="field"><span>笔记编号</span><input name="id" type="number" min="1" max="99999999" value="1001" required></label><button class="button secondary" type="submit">读取笔记 →</button></form><details class="lab-hint"><summary>查看测试提示</summary><p>Alice 的笔记编号为 1001，Bob 的编号为 1002。保持 Alice 身份，修改请求路径中的编号。</p><p>修复对照：${escape(cases.idor.fixed)}</p></details>${output('note')}</section>
    <section class="exercise-card exercise-wide">${heading('xss')}<div class="xss-columns"><div><form id="lab-message-form"><label class="field"><span>留言内容</span><textarea name="body" maxlength="2000" rows="5" placeholder="写入留言，观察右侧预览" required></textarea></label><button class="button secondary" type="submit">保存留言 →</button></form><details class="lab-hint"><summary>查看测试提示</summary><p>留言会存入数据库。下面的输入会在预览页插入一个可见标记，刷新后仍可观察。</p><code>&lt;script&gt;document.body.append('XSS 已执行')&lt;/script&gt;</code><p>预览页在独立沙箱中运行，用页面文字变化验证脚本执行。修复模式将原文显示为文本。</p></details>${output('message')}</div><div><div class="preview-heading"><h3>留言预览</h3><button class="button ghost small" id="reload-preview" type="button">刷新预览</button></div><iframe id="xss-preview" title="留言预览" sandbox="allow-scripts"></iframe><code class="preview-path">GET /api/lab/messages/preview</code></div></div></section></div>
    <section class="lab-events"><div class="section-title-row"><div><span class="eyebrow">REQUEST HISTORY</span><h2>最近的练习请求</h2></div><button class="button secondary small" id="refresh-events">刷新记录</button></div><p class="muted">显示当前登录账号最近 30 条记录；不记录密码、Cookie 或请求正文。</p><div class="table-scroll"><table><thead><tr><th>时间</th><th>方法 / 路径</th><th>身份</th><th>模式</th><th>状态</th></tr></thead><tbody id="lab-events-list"></tbody></table></div></section>
    <details class="lab-reset"><summary>重置练习数据</summary><p>恢复示例商品、笔记、初始留言，清空练习记录。账号、文章、评论和个人文件会保留。</p><form id="lab-reset-form"><label class="field"><span>输入 RESET 确认</span><input name="confirmation" placeholder="RESET" pattern="RESET" required autocomplete="off"></label><button class="button danger" type="submit">重置练习数据</button></form></details>`;
  if (user.level < 3) {
    main.querySelector('#lab-reset-form').hidden = true;
    main.querySelector('.lab-reset > p').textContent = '共享练习数据由 LV3 管理员重置，请联系站点管理员。';
  }
  const error = main.querySelector('#lab-error');
  const showError = problem => { if (error.isConnected) { error.textContent = problem.message; error.hidden = false; } };
  const updatePreview = () => {
    const frame = main.querySelector('#xss-preview');
    if (frame) frame.src = `/api/lab/messages/preview?mode=${mode}&v=${Date.now()}`;
  };
  const updateDescription = () => {
    main.querySelector('#mode-description').textContent = mode === 'fixed' ? '当前验证参数绑定、输出转义和对象权限校验。' : '当前启用练习中的三个预置缺陷。';
    main.querySelector('#lab-mode').dataset.mode = mode;
  };
  const refreshEvents = async () => {
    const { events } = await api('/lab/events');
    if (!main.querySelector('#lab-events-list')) return;
    main.querySelector('#lab-events-list').innerHTML = events.length ? events.map(event => `<tr><td>${new Date(event.created_at).toLocaleTimeString('zh-CN', { hour12: false })}</td><td><code>${escape(event.method)} ${escape(event.path)}</code></td><td>${escape(event.actor)}</td><td>${event.mode === 'fixed' ? '修复' : '漏洞'}</td><td><span class="http-status ${event.status >= 400 ? 'status-error' : ''}">${event.status}</span></td></tr>`).join('') : '<tr><td colspan="5" class="quiet-empty">还没有练习请求</td></tr>';
  };
  const execute = async (form, id, path, options = {}) => {
    const currentGeneration = generation, requestVersion = (formVersions.get(id) || 0) + 1;
    formVersions.set(id, requestVersion);
    const button = form.querySelector('button');
    button.disabled = true;
    let response, status;
    try { response = await api(path, options); status = options.method === 'POST' ? 201 : 200; }
    catch (problem) { response = { error: problem.message }; status = problem.status || 'NETWORK'; }
    finally { button.disabled = false; }
    if (currentGeneration !== generation || formVersions.get(id) !== requestVersion || !form.isConnected) return;
    const result = main.querySelector(`#${id}-result`);
    result.innerHTML = `<div class="request-line"><span class="request-status ${status >= 400 ? 'status-error' : ''}">${escape(status)}</span><code>${options.method || 'GET'} /api${escape(path)}</code></div><pre>${escape(JSON.stringify(response, null, 2))}</pre>`;
    if (id === 'message' && status === 201) { form.reset(); updatePreview(); }
    await refreshEvents().catch(showError);
  };
  const searchForm = main.querySelector('#lab-search-form'), noteForm = main.querySelector('#lab-note-form');
  const search = () => execute(searchForm, 'search', `/lab/search?mode=${mode}&q=${encodeURIComponent(searchForm.elements.q.value)}`);
  const note = () => execute(noteForm, 'note', `/lab/notes/${encodeURIComponent(noteForm.elements.id.value)}?mode=${mode}`);
  searchForm.addEventListener('submit', event => { event.preventDefault(); search(); });
  noteForm.addEventListener('submit', event => { event.preventDefault(); note(); });
  main.querySelector('#lab-message-form').addEventListener('submit', event => {
    event.preventDefault();
    execute(event.target, 'message', `/lab/messages?mode=${mode}`, { method: 'POST', body: { body: event.target.elements.body.value } });
  });
  main.querySelector('#lab-mode').addEventListener('change', async event => {
    mode = event.target.value; generation++;
    history.replaceState({}, '', `/lab?mode=${mode}`);
    updateDescription(); updatePreview();
    await Promise.all([search(), note()]);
  });
  main.querySelector('#lab-actor').addEventListener('change', async event => {
    const select = event.target;
    select.disabled = true; error.hidden = true;
    try {
      const result = await api(`/lab/actor?mode=${mode}`, { method: 'POST', body: { actor: select.value } });
      actor = result.actor; generation++; await note();
    } catch (problem) { select.value = actor; showError(problem); }
    finally { select.disabled = false; }
  });
  main.querySelector('#reload-preview').addEventListener('click', updatePreview);
  main.querySelector('#refresh-events').addEventListener('click', () => refreshEvents().catch(showError));
  main.querySelector('#lab-reset-form').addEventListener('submit', async event => {
    event.preventDefault();
    const form = event.target, button = form.querySelector('button');
    button.disabled = true; error.hidden = true;
    try {
      await api(`/lab/reset?mode=${mode}`, { method: 'POST', body: { confirmation: form.elements.confirmation.value } });
      actor = 'alice'; generation++;
      main.querySelector('#lab-actor').value = actor;
      searchForm.reset(); noteForm.reset(); form.reset();
      main.querySelector('#lab-message-form').reset();
      main.querySelector('#message-result').innerHTML = '<div class="request-line"><span class="request-status">RESET</span><code>练习数据已重置</code></div><pre>等待请求…</pre>';
      updatePreview(); await Promise.all([search(), note()]); toast('练习数据已重置');
    } catch (problem) { showError(problem); }
    finally { button.disabled = false; }
  });
  updateDescription(); updatePreview();
  await Promise.all([search(), note()]);
}
