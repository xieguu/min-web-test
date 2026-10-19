export async function mountComments(container, { articleId, user, api, escape, date, avatar, toast }) {
  container.innerHTML = `<div class="section-title-row"><h2>评论 <span id="comment-count" class="count">—</span></h2><span class="muted">交流，也是一种记录</span></div><p class="form-error" role="alert" hidden></p><div id="comments-list" aria-live="polite">正在加载评论…</div>${user ? `<form id="comment-form"><label class="field"><span>写下评论</span><textarea name="body" maxlength="2000" rows="3" required placeholder="说说你的想法，最多 2000 字"></textarea></label><div class="form-actions"><button class="button" type="submit">发表评论</button></div></form>` : `<p class="comment-login"><a href="/login?next=${encodeURIComponent('/articles/' + articleId)}">登录</a>后可以发表评论。</p>`}`;
  const error = container.querySelector('.form-error');
  const showError = problem => { error.textContent = problem.message; error.hidden = false; };
  const refresh = async () => {
    const { comments } = await api(`/articles/${encodeURIComponent(articleId)}/comments`);
    if (!container.isConnected) return;
    container.querySelector('#comment-count').textContent = comments.length;
    container.querySelector('#comments-list').innerHTML = comments.length ? comments.map(comment => `<div class="comment-item"><div class="comment-heading">${avatar(comment.author_name)}<strong>${escape(comment.author_name)}</strong><span>${date(comment.created_at)}</span>${comment.author_id === user?.id ? `<button class="button ghost small" data-comment-delete="${escape(comment.id)}">删除评论</button>` : ''}</div><p>${escape(comment.body)}</p></div>`).join('') : '<p class="quiet-empty">还没有评论，写下第一条吧。</p>';
  };
  container.querySelector('#comment-form')?.addEventListener('submit', async event => {
    event.preventDefault();
    const form = event.target, button = form.querySelector('button');
    button.disabled = true; error.hidden = true;
    try {
      await api(`/articles/${encodeURIComponent(articleId)}/comments`, { method: 'POST', body: { body: form.elements.body.value } });
      form.reset(); await refresh(); toast('评论已发布');
    } catch (problem) { showError(problem); }
    finally { button.disabled = false; }
  });
  container.addEventListener('click', async event => {
    const button = event.target.closest('[data-comment-delete]');
    if (!button) return;
    button.disabled = true; error.hidden = true;
    try { await api(`/comments/${button.dataset.commentDelete}`, { method: 'DELETE' }); await refresh(); toast('评论已删除'); }
    catch (problem) { showError(problem); }
    finally { button.disabled = false; }
  });
  await refresh().catch(showError);
}

export async function renderFilesPage(main, { api, escape, date, toast, isCurrent }) {
  const size = bytes => bytes < 1024 ? `${bytes} B` : bytes < 1048576 ? `${(bytes / 1024).toFixed(1)} KiB` : `${(bytes / 1048576).toFixed(2)} MiB`;
  const data = await api('/files');
  if (!isCurrent()) return;
  document.title = '我的文件 · MIN LAB';
  main.innerHTML = `<div class="page-header"><span class="eyebrow">FILES / MULTIPART</span><h1>我的文件</h1><p>上传、下载和管理附件。每个账号最多 20 个文件，单个不超过 2 MiB。</p></div><div class="file-layout"><form id="file-upload-form" class="form-card"><h2>上传一个文件</h2><p class="form-intro">文件仅对上传账号可见。</p><p class="form-error" role="alert" hidden></p><label class="field file-picker"><span>选择文件</span><input name="file" type="file" required><small>支持任意文件类型，以附件形式下载。</small></label><button class="button full-width" type="submit">上传文件</button></form><section class="file-panel"><div class="section-title-row"><h2>已上传 <span id="file-count" class="count">0</span></h2><span class="muted" id="file-total"></span></div><p id="file-action-error" class="form-error" role="alert" hidden></p><div id="file-list"></div></section></div><dialog id="file-delete-dialog"><form method="dialog"><span class="eyebrow">删除文件</span><h2>删除这个文件？</h2><p id="file-delete-name" class="muted"></p><div class="dialog-actions"><button class="button secondary" value="cancel">取消</button><button class="button danger" id="file-delete-confirm" type="button">确认删除</button></div></form></dialog>`;
  const list = main.querySelector('#file-list'), uploadForm = main.querySelector('#file-upload-form');
  const dialog = main.querySelector('#file-delete-dialog');
  let pendingId;
  const draw = files => {
    main.querySelector('#file-count').textContent = `${files.length} / 20`;
    main.querySelector('#file-total').textContent = `共 ${size(files.reduce((sum, file) => sum + file.size, 0))}`;
    list.innerHTML = files.length ? files.map(file => `<article class="file-row"><div class="file-icon" aria-hidden="true">↥</div><div class="file-info"><h3>${escape(file.name)}</h3><p>${size(file.size)} · ${date(file.created_at)}</p><code>${escape(file.id)}</code></div><div class="file-actions"><a class="button secondary small" href="/api/files/${file.id}/download" download>下载</a><button class="button ghost small" data-file-delete="${file.id}" data-file-name="${escape(file.name)}">删除</button></div></article>`).join('') : '<div class="empty-state"><h3>还没有文件</h3><p>上传一个文本或图片文件，开始测试。</p></div>';
  };
  const refresh = async () => { const result = await api('/files'); if (list.isConnected) draw(result.files); };
  draw(data.files);
  uploadForm.addEventListener('submit', async event => {
    event.preventDefault();
    const button = uploadForm.querySelector('button'), error = uploadForm.querySelector('.form-error');
    error.hidden = true; button.disabled = true;
    try {
      const file = uploadForm.elements.file.files[0];
      if (file.size > data.limits.bytes) throw new Error('单个文件不能超过 2 MiB');
      await api('/files', { method: 'POST', body: new FormData(uploadForm) });
      uploadForm.reset(); await refresh(); toast('文件已上传');
    } catch (problem) { error.textContent = problem.message; error.hidden = false; }
    finally { button.disabled = false; }
  });
  list.addEventListener('click', event => {
    const button = event.target.closest('[data-file-delete]');
    if (!button) return;
    pendingId = button.dataset.fileDelete;
    main.querySelector('#file-delete-name').textContent = button.dataset.fileName;
    dialog.showModal();
  });
  main.querySelector('#file-delete-confirm').addEventListener('click', async event => {
    const button = event.target, error = main.querySelector('#file-action-error');
    button.disabled = true; error.hidden = true;
    try { await api(`/files/${pendingId}`, { method: 'DELETE' }); dialog.close(); await refresh(); toast('文件已删除'); }
    catch (problem) { dialog.close(); error.textContent = problem.message; error.hidden = false; }
    finally { button.disabled = false; }
  });
}
