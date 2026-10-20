export function levelBadge(level, levels, escape) {
  const definition = levels.find(item => item.level === level);
  return `<span class="level-badge level-${level}">LV${level} ${escape(definition.name)}</span>`;
}

export function accountPermissions(user, levels, escape) {
  return `<section class="account-permissions"><div class="section-title-row"><h2>账号等级与权限</h2>${levelBadge(user.level, levels, escape)}</div><div class="level-cards">${levels.map(item => `<article class="level-card ${item.level === user.level ? 'current-level' : ''}"><div>${levelBadge(item.level, levels, escape)}${item.level === user.level ? '<span class="current-label">当前等级</span>' : ''}</div><p>${escape(item.description)}</p></article>`).join('')}</div><p class="permission-help">新注册账号为 LV1。需要使用更高等级的功能时，请联系站点管理员调整等级。</p></section>`;
}

export function accessPage(main, { user, required, levels, escape }) {
  document.title = '访问权限 · MIN LAB';
  const definition = levels.find(item => item.level === required);
  main.innerHTML = `<section class="access-panel"><span class="eyebrow">ACCOUNT ACCESS / LV${required}</span><h1>需要 LV${required} ${escape(definition.name)}权限</h1><p>你的当前等级是 ${levelBadge(user.level, levels, escape)}。</p><p class="muted">请联系站点管理员升级后使用此功能。</p><a class="button secondary" href="/account">查看我的权限</a></section>`;
}

export async function renderAdminPage(main, { api, user, escape, date, toast, isCurrent }) {
  const data = await api('/admin/users');
  if (!isCurrent()) return;
  let users = data.users;
  document.title = '账号管理 · MIN LAB';
  main.innerHTML = `<div class="page-header"><span class="eyebrow">LV3 / ACCOUNT MANAGEMENT</span><h1>账号管理</h1><p>调整账号等级，控制功能访问，启用或禁用账号。</p></div><div class="admin-summary"><span>共 <strong id="admin-user-count">${users.length}</strong> 个账号</span><span>新账号默认 <strong>LV1 普通用户</strong></span><a href="/account">查看等级说明 →</a></div><section class="admin-panel"><div class="section-title-row"><h2>站点账号</h2><label class="admin-search"><span class="sr-only">搜索账号</span><input type="search" id="admin-search" placeholder="搜索昵称或邮箱" maxlength="254"></label></div><p class="form-error" role="alert" id="admin-error" hidden></p><div class="admin-table-scroll"><table class="admin-table"><thead><tr><th>账号</th><th>邮箱</th><th>等级</th><th>状态</th><th>注册日期</th><th>操作</th></tr></thead><tbody id="admin-users"></tbody></table></div><p class="permission-help">等级变更在下一次请求生效。禁用会使原有登录会话失效；重新启用后需要再次登录。当前管理员不能降级或禁用自己。</p></section>`;
  const target = main.querySelector('#admin-users'), search = main.querySelector('#admin-search');
  const error = main.querySelector('#admin-error');
  const draw = () => {
    const query = search.value.trim().toLowerCase();
    const filtered = users.filter(account => account.name.toLowerCase().includes(query) || account.email.toLowerCase().includes(query));
    target.innerHTML = filtered.length ? filtered.map(account => {
      const self = account.id === user.id;
      return `<tr data-user-id="${account.id}"><td><strong>${escape(account.name)}</strong>${self ? '<span class="self-label">当前账号</span>' : ''}</td><td class="admin-email">${escape(account.email)}</td><td><select aria-label="账号等级：${escape(account.email)}" data-level ${self ? 'disabled' : ''}>${data.levels.map(item => `<option value="${item.level}" ${item.level === account.level ? 'selected' : ''}>LV${item.level} ${escape(item.name)}</option>`).join('')}</select></td><td><select aria-label="账号状态：${escape(account.email)}" data-disabled ${self ? 'disabled' : ''}><option value="false" ${!account.disabled ? 'selected' : ''}>正常</option><option value="true" ${account.disabled ? 'selected' : ''}>禁用</option></select></td><td>${date(account.created_at)}</td><td><button class="button secondary small" data-save-user aria-label="保存 ${escape(account.email)}" ${self ? 'disabled' : ''}>保存</button></td></tr>`;
    }).join('') : '<tr><td colspan="6" class="quiet-empty">没有找到相关账号</td></tr>';
  };
  search.addEventListener('input', draw);
  target.addEventListener('click', async event => {
    const button = event.target.closest('[data-save-user]');
    if (!button) return;
    const row = button.closest('[data-user-id]');
    button.disabled = true; error.hidden = true;
    try {
      const result = await api(`/admin/users/${row.dataset.userId}`, { method: 'PATCH', body: {
        level: Number(row.querySelector('[data-level]').value), disabled: row.querySelector('[data-disabled]').value === 'true',
      } });
      users = users.map(account => account.id === result.user.id ? result.user : account);
      draw(); toast('账号权限已更新');
    } catch (problem) { error.textContent = problem.message; error.hidden = false; }
    finally { button.disabled = false; }
  });
  draw();
}
