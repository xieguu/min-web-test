import { mountComments, renderFilesPage } from './features.js';
import { renderLabPage } from './lab.js';
import { levelBadge, accountPermissions, accessPage, renderAdminPage } from './admin.js';

const main = document.querySelector('#main');
const state = { user: null, levels: [], registration: null, categories: ['入门指南', '使用说明', '更新记录', '随手记录'] };
const codeCooldowns = new Map();
let routeVersion = 0, searchVersion = 0, searchTimer, toastTimer, codeTimer, deleteId;
const icons = {
  plus: '<path d="M12 5v14M5 12h14"/>',
  arrow: '<path d="M5 12h14m-6-6 6 6-6 6"/>',
  back: '<path d="M19 12H5m6-6-6 6 6 6"/>',
  search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 4.5 4.5"/>',
  document: '<path d="M14 3H5v18h14V8zM14 3v5h5M8 12h8M8 16h6"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7h.01"/>',
};
const icon = name => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name]}</svg>`;
const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const date = value => new Intl.DateTimeFormat('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(value)).replaceAll('/', '.');
const avatar = (name, extra = '') => `<span class="avatar ${extra}" aria-hidden="true">${escape([...name][0]?.toUpperCase() || 'M')}</span>`;
const tag = category => `<span class="tag tag-${escape(category)}">${escape(category)}</span>`;
const errorBox = () => '<p class="form-error" role="alert" hidden></p>';

async function api(path, options = {}) {
  const multipart = options.body instanceof FormData;
  const response = await fetch(`/api${path}`, {
    credentials: 'same-origin', ...options,
    headers: { ...(multipart ? {} : { 'Content-Type': 'application/json' }), 'X-Requested-With': 'min-web-test', ...options.headers },
    ...(options.body !== undefined ? { body: multipart ? options.body : JSON.stringify(options.body) } : {}),
  });
  const data = await response.json();
  if (!response.ok) {
    if (response.status === 401 && !path.startsWith('/auth/login')) { state.user = null; renderHeader(); }
    throw Object.assign(new Error(data.error), { status: response.status });
  }
  return data;
}
function toast(message) {
  const element = document.querySelector('#toast');
  clearTimeout(toastTimer);
  element.textContent = message;
  element.hidden = false;
  toastTimer = setTimeout(() => { element.hidden = true; }, 3500);
}
function renderHeader() {
  document.querySelector('#nav').innerHTML = `<a href="/" class="${location.pathname === '/' && !location.search.includes('mine=1') ? 'active' : ''}">内容首页</a>${state.user ? `<a href="/?mine=1" class="${location.pathname === '/' && location.search.includes('mine=1') ? 'active' : ''}">我的内容</a>` : ''}<a href="/files" class="${location.pathname === '/files' ? 'active' : ''}">我的文件</a><a href="/lab" class="${location.pathname === '/lab' ? 'active' : ''}">自测靶场</a>`;
  if (state.user?.level === 3) document.querySelector('#nav').insertAdjacentHTML('beforeend', `<a href="/admin" class="${location.pathname === '/admin' ? 'active' : ''}">账号管理</a>`);
  document.querySelector('#header-actions').innerHTML = state.user
    ? `<a class="account-link" href="/account">${avatar(state.user.name)}<span class="account-name">${escape(state.user.name)}</span><span class="text-link">我的账号</span></a>`
    : '<a class="text-link" href="/login">登录</a><a class="button small" href="/register">创建账号</a>';
}
function navigate(path, replace = false) {
  history[replace ? 'replaceState' : 'pushState']({}, '', path);
  renderRoute();
  window.scrollTo({ top: 0, behavior: 'instant' });
}
function safeNext() {
  const next = new URLSearchParams(location.search).get('next');
  return next && /^\/(?:write|account|files|lab|admin|articles\/[a-zA-Z0-9-]+(?:\/edit)?)$/.test(next) ? next : '/';
}
function emptyState(title, description, action = '') {
  return `<div class="empty-state">${icon('document')}<h3>${title}</h3><p>${description}</p>${action}</div>`;
}
function articleCards(articles) {
  return `<div class="article-list">${articles.map(article => `<a href="/articles/${encodeURIComponent(article.id)}" class="article-card">
    <div class="article-top">${tag(article.category)}<time class="article-date" datetime="${escape(article.created_at)}">${date(article.created_at)}</time></div>
    <h3>${escape(article.title)}</h3><p>${escape(article.summary)}</p>
    <div class="article-bottom">${avatar(article.author_name)}<span>${escape(article.author_name)}</span><span class="separator">·</span><span>${article.reading_minutes} 分钟阅读</span><span class="article-arrow">${icon('arrow')}</span></div>
    </a>`).join('')}</div><p class="list-end">— 已经到底了，刚刚好 —</p>`;
}
function sidebar() {
  return `<aside class="sidebar"><section class="side-card welcome"><span class="side-glyph">${icon('document')}</span>
    <h2>${state.user ? '留下一点新想法。' : '欢迎来到 MIN。'}</h2><p>${state.user ? '一段记录，一个灵感。<br>让值得留下的想法，有个地方。' : '一个简单、轻量的测试空间。<br>浏览内容，也可以留下你的想法。'}</p>
    <a class="button secondary" href="${state.user ? '/write' : '/register'}">${state.user ? '写一篇内容' : '创建你的账号'} ${icon('arrow')}</a></section>
    <section class="side-card"><h2>自用测试靶场</h2><p>从账号、评论、文件开始，练习输入处理和权限测试。切换漏洞与修复模式，观察同一请求的差异。</p><a class="button secondary" href="/lab">进入自测靶场 ${icon('arrow')}</a><div class="mini-divider"></div><div class="about-line"><span>访问等级</span><span>LV2 测试员起</span></div><div class="about-line"><span>练习</span><span>SQLi / XSS / 越权</span></div><div class="about-line"><span>版本</span><span><i class="live-dot"></i>1.3.0</span></div></section>
    <div class="side-note">${icon('info')}<span>这里的内容公开可见。<br>登录后可以发布和管理自己的内容。</span></div></aside>`;
}
async function loadArticles() {
  const current = ++searchVersion;
  const route = routeVersion;
  const params = new URLSearchParams(location.search);
  const data = await api(`/articles?${params}`);
  if (current !== searchVersion || route !== routeVersion) return;
  const target = document.querySelector('#article-results');
  if (!target) return;
  document.querySelector('#article-count').textContent = data.articles.length;
  const filtered = params.get('q') || params.get('category');
  target.innerHTML = data.articles.length ? articleCards(data.articles)
    : filtered ? emptyState('没有找到相关内容', '换个关键词，或者试试其他分类。', '<button class="button secondary" data-action="clear-filters">清除筛选</button>')
      : emptyState('第一篇内容，等你来写。', '把想法写下来，从这里开始。', '<a href="/write" class="button">发布内容</a>');
}
function updateFilter(key, value) {
  const params = new URLSearchParams(location.search);
  if (value) params.set(key, value); else params.delete(key);
  history.replaceState({}, '', `/${params.size ? '?' + params : ''}`);
  for (const button of document.querySelectorAll('[data-category]')) {
    const active = button.dataset.category === (params.get('category') || '');
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', String(active));
  }
  loadArticles().catch(showListError);
}
function showListError(error) {
  const target = document.querySelector('#article-results');
  if (target) target.innerHTML = emptyState('内容加载失败', escape(error.message), '<button class="button secondary" data-action="retry-list">重新加载</button>');
}
async function homePage() {
  const params = new URLSearchParams(location.search), mine = params.get('mine') === '1';
  document.title = `${mine ? '我的内容' : '少一点，刚刚好'} · MIN`;
  main.innerHTML = `<section class="home-hero"><div><span class="eyebrow"><i class="live-dot"></i>A LITTLE SPACE, A SIMPLE START</span><h1>${mine ? '你的想法，都在这里。' : '少一点，刚刚好。'}</h1><p>${mine ? '记录、分享，管理你发布的每一篇内容。' : '一个简单的空间，用来记录、分享，以及开始。'}</p></div><div class="hero-action"><a class="button" href="/write">${icon('plus')}发布内容</a><span>让每一个想法，有处安放</span></div></section>
    <div class="home-grid"><section aria-label="内容列表"><div class="content-toolbar"><h2 class="section-heading">${mine ? '我的内容' : '最新内容'}<span class="count" id="article-count">—</span></h2><form id="search-form" role="search" class="search-box">${icon('search')}<input type="search" aria-label="搜索内容" name="q" maxlength="100" placeholder="搜索你感兴趣的内容…" value="${escape(params.get('q') || '')}"></form></div>
    <div class="filters" aria-label="内容分类">${['', ...state.categories].map(category => `<button class="filter ${category === (params.get('category') || '') ? 'active' : ''}" data-category="${category}" aria-pressed="${category === (params.get('category') || '')}">${category || '全部内容'}</button>`).join('')}</div>
    <div id="article-results" aria-live="polite"><div class="loading">正在加载内容…</div></div></section>${sidebar()}</div>`;
  document.querySelector('#search-form').addEventListener('submit', event => { event.preventDefault(); clearTimeout(searchTimer); updateFilter('q', event.target.q.value.trim()); });
  document.querySelector('#search-form input').addEventListener('input', event => {
    clearTimeout(searchTimer);
    const value = event.target.value.trim();
    searchTimer = setTimeout(() => updateFilter('q', value), 250);
  });
  await loadArticles();
}
function authPage(register) {
  document.title = `${register ? '创建账号' : '登录'} · MIN`;
  const next = safeNext();
  const suffix = next === '/' ? '' : `?next=${encodeURIComponent(next)}`;
  main.innerHTML = `<div class="auth-layout"><section class="auth-copy"><span class="eyebrow">A SPACE FOR YOUR IDEAS</span><span class="auth-mark" aria-hidden="true">“</span><h1>简单的开始，<br>也可以很有意思。</h1><p>一个账号，连接你的每一个想法。<br>记录一点，分享一点，慢慢来就好。</p><div class="auth-feature">${icon('check')}干净的阅读空间</div><div class="auth-feature">${icon('check')}属于你的内容</div></section>
    <div><form id="auth-form" class="form-card" data-mode="${register ? 'register' : 'login'}"><h2>${register ? '创建你的账号' : '欢迎回来。'}</h2><p class="form-intro">${register ? '花一点时间，开启你的小小空间。' : '登录账号，继续你的记录。'}</p>${errorBox()}
    ${register ? '<label class="field"><span>昵称</span><input name="name" autocomplete="nickname" placeholder="怎么称呼你？" minlength="2" maxlength="24" required></label>' : ''}
    <label class="field"><span>邮箱</span><input type="email" name="email" autocomplete="email" maxlength="254" placeholder="you@example.com" required></label>
    <div class="field"><label for="password">密码</label><div class="password-wrap"><input type="password" id="password" name="password" autocomplete="${register ? 'new-password' : 'current-password'}" minlength="8" maxlength="64" placeholder="${register ? '设置至少 8 位密码' : '输入你的密码'}" required><button type="button" class="password-toggle" data-action="toggle-password" aria-label="显示密码" aria-pressed="false">显示</button></div>${register ? '<small>8–64 个字符，最多 72 字节</small>' : ''}</div>
    <button type="submit" class="button full-width">${register ? '创建账号' : '登录'} ${icon('arrow')}</button><p class="form-footer">${register ? '已经有账号？' : '第一次来这里？'}<a href="${register ? '/login' : '/register'}${suffix}">${register ? '去登录' : '创建账号'}</a></p></form><p class="auth-note">少一点复杂，多一点专注。</p></div></div>`;
  if (register) {
    const form = document.querySelector('#auth-form');
    form.querySelector('.form-intro').textContent = '验证邮箱后创建 LV1 普通用户账号。';
    form.querySelector('.field:has(input[name="email"])').insertAdjacentHTML('afterend', `<div class="field"><label for="email-code">邮箱验证码</label><div class="email-code-row"><input name="code" id="email-code" type="text" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{6}" minlength="6" maxlength="6" placeholder="6 位数字" required><button id="send-email-code" class="button secondary" type="button">发送验证码</button></div><small id="email-code-hint">验证码 10 分钟有效，每 60 秒可重发一次。</small></div>`);
    if (!state.registration.mailConfigured) {
      form.querySelector('.form-intro').insertAdjacentHTML('afterend', '<p class="mail-config-note">站点尚未配置发信服务，暂时不能注册。请联系站点管理员配置 SMTP；已有账号可以正常登录。</p>');
    }
    const button = form.querySelector('#send-email-code'), emailInput = form.elements.email;
    let sending = false;
    const updateButton = () => {
      clearTimeout(codeTimer);
      if (!form.isConnected) return;
      const email = emailInput.value.trim().toLowerCase();
      const remaining = Math.max(0, Math.ceil(((codeCooldowns.get(email) || 0) - Date.now()) / 1000));
      button.disabled = sending || remaining > 0 || !state.registration.mailConfigured;
      button.textContent = sending ? '正在发送…' : remaining ? `${remaining}s 后重发` : '发送验证码';
      if (remaining > 0) codeTimer = setTimeout(updateButton, 1000);
    };
    emailInput.addEventListener('input', () => { form.elements.code.value = ''; updateButton(); });
    button.addEventListener('click', async () => {
      emailInput.value = emailInput.value.trim();
      if (!emailInput.reportValidity()) return;
      const email = emailInput.value.toLowerCase();
      const error = form.querySelector('.form-error');
      error.hidden = true; sending = true; updateButton();
      try {
        const response = await api('/auth/send-code', { method: 'POST', body: { email } });
        codeCooldowns.set(email, Date.now() + response.retryAfter * 1000);
        if (!form.isConnected) return;
        if (emailInput.value.trim().toLowerCase() === email) {
          form.querySelector('#email-code-hint').textContent = `验证码已发往 ${email}，请在 10 分钟内填写。`;
          form.elements.code.focus();
        }
        toast('验证码已发送，请查收邮箱');
      } catch (problem) { if (form.isConnected) { error.textContent = problem.message; error.hidden = false; } }
      finally { sending = false; updateButton(); }
    });
    updateButton();
  }
}
async function articlePage(id, version) {
  const { article } = await api(`/articles/${encodeURIComponent(id)}`);
  if (version !== routeVersion) return;
  document.title = `${article.title} · MIN`;
  const owned = state.user?.id === article.author_id;
  main.innerHTML = `<article class="article-detail"><a href="/" class="back-link">${icon('back')}返回内容首页</a><div>${tag(article.category)}</div><h1>${escape(article.title)}</h1><div class="detail-meta">${avatar(article.author_name)}<span>${escape(article.author_name)}</span><span>·</span><time datetime="${escape(article.created_at)}">${date(article.created_at)}</time><span>·</span><span>${Math.max(1, Math.ceil(article.body.length / 400))} 分钟阅读</span></div><p class="detail-summary">${escape(article.summary)}</p><div class="article-body">${escape(article.body)}</div><div class="detail-actions">${owned ? `<a href="/articles/${encodeURIComponent(article.id)}/edit" class="button secondary">编辑内容</a><button class="button ghost" data-action="delete" data-id="${escape(article.id)}">删除内容</button>` : '<a href="/" class="button secondary">浏览更多内容</a>'}<span class="updated">更新于 ${date(article.updated_at)}</span></div></article>`;
  const comments = document.createElement('section');
  comments.className = 'comments-section';
  main.querySelector('article').append(comments);
  await mountComments(comments, { articleId: id, user: state.user, api, escape, date, avatar, toast });
}
async function editorPage(id, version) {
  let article = { title: '', summary: '', category: '随手记录', body: '' };
  if (id) {
    ({ article } = await api(`/articles/${encodeURIComponent(id)}`));
    if (version !== routeVersion) return;
    if (article.author_id !== state.user.id) throw new Error('只能编辑自己发布的内容');
  }
  document.title = `${id ? '编辑内容' : '发布内容'} · MIN`;
  const back = id ? `/articles/${encodeURIComponent(id)}` : '/';
  main.innerHTML = `<div class="editor-wrap"><div class="page-header"><a href="${back}" class="back-link">${icon('back')}${id ? '返回文章' : '返回内容首页'}</a><h1>${id ? '继续打磨你的想法。' : '写下一点新想法。'}</h1><p>一个标题，一段文字。简单记录，自在分享。</p></div><form id="editor-form" class="form-card editor-form" data-id="${escape(id || '')}">${errorBox()}<label class="field"><span>标题</span><input name="title" placeholder="给你的内容起个名字" maxlength="100" value="${escape(article.title)}" required></label><label class="field"><span>分类</span><select name="category">${state.categories.map(category => `<option ${category === article.category ? 'selected' : ''}>${category}</option>`).join('')}</select></label><label class="field"><span>摘要 <small>选填</small></span><textarea name="summary" rows="2" maxlength="200" placeholder="用一句话介绍这篇内容，留空则从正文中提取">${escape(article.summary)}</textarea></label><label class="field"><span class="field-title"><span>正文</span><small id="character-count">${article.body.length} / 20000</small></span><textarea class="body-input" name="body" rows="12" maxlength="20000" placeholder="从这里开始写…" required>${escape(article.body)}</textarea><small>支持纯文本与换行，发布后所有人都可以阅读。</small></label><div class="form-actions"><a class="button secondary" href="${back}">取消</a><button type="submit" class="button">${id ? '保存修改' : '发布内容'} ${icon('arrow')}</button></div></form></div>`;
  document.querySelector('[name="body"]').addEventListener('input', event => { document.querySelector('#character-count').textContent = `${event.target.value.length} / 20000`; });
}
async function accountPage(version) {
  const { articles } = await api('/articles?mine=1');
  if (version !== routeVersion) return;
  const user = state.user;
  document.title = '我的账号 · MIN';
  main.innerHTML = `<div class="page-header"><span class="eyebrow">YOUR LITTLE SPACE</span><h1>我的账号</h1><p>管理个人资料，找到你留下的每一篇内容。</p></div><div class="account-grid"><section class="form-card profile-card">${avatar(user.name, 'profile-avatar')}<h2>${escape(user.name)}</h2><p class="profile-email">${escape(user.email)}</p><div class="mini-divider"></div><form id="profile-form">${errorBox()}<label class="field"><span>昵称</span><input name="name" autocomplete="nickname" minlength="2" maxlength="24" value="${escape(user.name)}" required></label><label class="field"><span>邮箱</span><input type="email" value="${escape(user.email)}" disabled><small>邮箱作为登录账号，不支持修改。</small></label><button class="button secondary full-width" type="submit">保存资料</button></form><p class="account-created">加入于 ${date(user.created_at)}</p><button class="button ghost logout-button" data-action="logout">退出登录</button><p id="logout-error" class="form-error" role="alert" hidden></p></section><section class="account-content"><div class="content-toolbar"><h2 class="section-heading">我的内容 <span class="count">${articles.length}</span></h2><a href="/write" class="button small">${icon('plus')}发布内容</a></div>${articles.length ? articleCards(articles) : emptyState('还没有发布内容', '给这个小小的空间，留下你的第一篇记录。', '<a class="button secondary" href="/write">开始记录 →</a>')}</section></div>`;
  main.querySelector('.account-grid').insertAdjacentHTML('beforebegin', accountPermissions(user, state.levels, escape));
  main.querySelector('.profile-email').insertAdjacentHTML('afterend', levelBadge(user.level, state.levels, escape));
  main.querySelector('.profile-email').insertAdjacentHTML('afterend', `<p class="email-verification-status">${user.email_verified_at ? '邮箱已验证' : '历史账号：注册时尚未启用邮箱验证'}</p>`);
}
async function renderRoute() {
  const version = ++routeVersion;
  clearTimeout(searchTimer);
  clearTimeout(codeTimer);
  renderHeader();
  const path = location.pathname;
  const mine = new URLSearchParams(location.search).get('mine') === '1';
  const needsAuth = ['/account', '/write', '/files', '/lab', '/admin'].includes(path) || /^\/articles\/[^/]+\/edit$/.test(path) || (path === '/' && mine);
  main.innerHTML = '<div class="loading" role="status">正在加载…</div>';
  try {
    if (state.user && needsAuth) {
      const session = await api('/session');
      if (version !== routeVersion) return;
      state.user = session.user; state.levels = session.levels; renderHeader();
    }
    if (needsAuth && !state.user) return navigate(`/login?next=${encodeURIComponent(path === '/' ? '/account' : path)}`, true);
    if (state.user && (path === '/login' || path === '/register')) return navigate('/account', true);
    const required = path === '/admin' ? 3 : ['/files', '/lab'].includes(path) ? 2 : 0;
    if (required && state.user.level < required) return accessPage(main, { user: state.user, required, levels: state.levels, escape });
    if (path === '/') await homePage();
    else if (path === '/login' || path === '/register') authPage(path === '/register');
    else if (path === '/account') await accountPage(version);
    else if (path === '/write') await editorPage(null, version);
    else if (path === '/files') await renderFilesPage(main, { api, escape, date, toast, isCurrent: () => version === routeVersion });
    else if (path === '/lab') await renderLabPage(main, { api, escape, toast, user: state.user, isCurrent: () => version === routeVersion });
    else if (path === '/admin') await renderAdminPage(main, { api, escape, date, toast, user: state.user, isCurrent: () => version === routeVersion });
    else {
      const match = path.match(/^\/articles\/([^/]+)(\/edit)?$/);
      if (!match) throw new Error('这个页面不存在');
      if (match[2]) await editorPage(decodeURIComponent(match[1]), version);
      else await articlePage(decodeURIComponent(match[1]), version);
    }
  } catch (error) {
    if (version !== routeVersion) return;
    main.innerHTML = `<div class="error-page"><span class="eyebrow">MIN / ${error.status || 'ERROR'}</span><h1>页面暂时无法显示。</h1><p class="muted">${escape(error.message)}</p><a class="button secondary" href="/">返回首页</a></div>`;
  }
}
async function submitForm(form) {
  const error = form.querySelector('.form-error'), button = form.querySelector('[type="submit"]');
  error.hidden = true;
  const label = button.innerHTML;
  button.disabled = true;
  button.textContent = '正在保存…';
  const body = Object.fromEntries(new FormData(form));
  try {
    if (form.id === 'auth-form') {
      button.textContent = form.dataset.mode === 'login' ? '正在登录…' : '正在创建…';
      const next = safeNext();
      const result = await api(`/auth/${form.dataset.mode}`, { method: 'POST', body });
      state.user = result.user;
      toast(form.dataset.mode === 'login' ? '欢迎回来，' + state.user.name : '账号已创建，欢迎来到 MIN');
      navigate(next);
    } else if (form.id === 'editor-form') {
      const id = form.dataset.id;
      const { article } = await api(`/articles${id ? '/' + encodeURIComponent(id) : ''}`, { method: id ? 'PATCH' : 'POST', body });
      toast(id ? '修改已保存' : '内容已发布');
      navigate(`/articles/${encodeURIComponent(article.id)}`);
    } else if (form.id === 'profile-form') {
      const result = await api('/account', { method: 'PATCH', body });
      state.user = result.user;
      toast('个人资料已更新');
      renderRoute();
    }
  } catch (problem) {
    error.textContent = problem.message;
    error.hidden = false;
  } finally {
    button.disabled = false;
    button.innerHTML = label;
  }
}
document.addEventListener('submit', event => {
  if (['auth-form', 'editor-form', 'profile-form'].includes(event.target.id)) {
    event.preventDefault();
    submitForm(event.target);
  }
});
document.addEventListener('click', async event => {
  const link = event.target.closest('a[href]');
  if (link && link.origin === location.origin && !link.pathname.startsWith('/api/') && !link.hasAttribute('download') && !link.hash && !event.ctrlKey && !event.metaKey && !event.shiftKey && !event.altKey && event.button === 0 && !link.target) {
    event.preventDefault();
    navigate(link.pathname + link.search);
    return;
  }
  const category = event.target.closest('[data-category]');
  if (category) { updateFilter('category', category.dataset.category); return; }
  const button = event.target.closest('[data-action]');
  if (!button) return;
  const action = button.dataset.action;
  if (action === 'toggle-password') {
    const input = document.querySelector('#password'), visible = input.type === 'password';
    input.type = visible ? 'text' : 'password';
    button.textContent = visible ? '隐藏' : '显示';
    button.setAttribute('aria-label', visible ? '隐藏密码' : '显示密码');
    button.setAttribute('aria-pressed', String(visible));
  } else if (action === 'clear-filters') {
    navigate(new URLSearchParams(location.search).get('mine') === '1' ? '/?mine=1' : '/', true);
  } else if (action === 'retry-list') {
    loadArticles().catch(showListError);
  } else if (action === 'logout') {
    button.disabled = true;
    try { await api('/auth/logout', { method: 'POST' }); state.user = null; toast('已退出登录'); navigate('/'); }
    catch (error) { const target = document.querySelector('#logout-error'); target.textContent = error.message; target.hidden = false; }
    finally { button.disabled = false; }
  } else if (action === 'delete') {
    deleteId = button.dataset.id;
    document.querySelector('#delete-error').hidden = true;
    document.querySelector('#delete-dialog').showModal();
  }
});
document.querySelector('#confirm-delete').addEventListener('click', async event => {
  const button = event.target;
  button.disabled = true;
  try {
    await api(`/articles/${encodeURIComponent(deleteId)}`, { method: 'DELETE' });
    document.querySelector('#delete-dialog').close();
    toast('内容已删除');
    navigate('/?mine=1');
  } catch (error) {
    const target = document.querySelector('#delete-error');
    target.textContent = error.message;
    target.hidden = false;
  } finally { button.disabled = false; }
});
window.addEventListener('popstate', renderRoute);
try {
  const { user, levels, registration } = await api('/session');
  state.user = user;
  state.levels = levels;
  state.registration = registration;
  await renderRoute();
} catch (error) {
  renderHeader();
  main.innerHTML = `<div class="error-page"><h1>连接暂时出了点问题。</h1><p class="muted">${escape(error.message)}</p><button class="button" id="reload-page">重新连接</button></div>`;
  document.querySelector('#reload-page').addEventListener('click', () => location.reload());
}
