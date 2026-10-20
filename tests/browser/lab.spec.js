import { test, expect } from '@playwright/test';
import { setTestUserLevel } from './fixtures.js';

test('评论、文件与三种漏洞的浏览器对照测试', async ({ page, playwright }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/register');
  await page.getByLabel('昵称', { exact: true }).fill('靶场测试');
  const email = `lab-${Date.now()}@example.com`;
  await page.getByLabel('邮箱', { exact: true }).fill(email);
  await page.getByLabel('密码', { exact: true }).fill('Practice-browser-2026');
  await page.getByRole('button', { name: '创建账号', exact: true }).click();
  await expect(page.getByRole('link', { name: '我的内容', exact: true })).toBeVisible();
  await page.getByRole('link', { name: '自测靶场', exact: true }).click();
  await expect(page.getByRole('heading', { name: '需要 LV2 测试员权限' })).toBeVisible();
  expect((await page.request.get('/api/lab')).status()).toBe(403);
  await setTestUserLevel(playwright, email, 3);

  await page.goto('/articles/welcome');
  await page.getByLabel('写下评论').fill('<b>评论按文本显示</b>');
  await page.getByRole('button', { name: '发表评论' }).click();
  await expect(page.locator('.comment-item p')).toHaveText('<b>评论按文本显示</b>');
  await expect(page.locator('.comment-item p b')).toHaveCount(0);
  await page.getByRole('button', { name: '删除评论' }).click();
  await expect(page.locator('.comment-item')).toHaveCount(0);

  await page.getByRole('link', { name: '我的文件', exact: true }).click();
  await page.getByLabel('选择文件').setInputFiles({ name: '浏览器测试.txt', mimeType: 'text/plain', buffer: Buffer.from('上传与下载测试') });
  await page.getByRole('button', { name: '上传文件', exact: true }).click();
  await expect(page.getByRole('heading', { name: '浏览器测试.txt' })).toBeVisible();
  const downloadEvent = page.waitForEvent('download');
  await page.getByRole('link', { name: '下载', exact: true }).click();
  expect((await downloadEvent).suggestedFilename()).toBe('浏览器测试.txt');
  await page.getByRole('button', { name: '删除', exact: true }).click();
  await page.getByRole('button', { name: '确认删除', exact: true }).click();
  await expect(page.getByRole('heading', { name: '还没有文件' })).toBeVisible();

  await page.getByRole('link', { name: '自测靶场', exact: true }).click();
  await expect(page.getByRole('heading', { name: '动手试试，看见差异。' })).toBeVisible();
  await expect(page.locator('#search-result pre')).toContainText('帆布笔记本');
  await page.getByLabel('商品关键词').fill("%' OR 1=1 --");
  await page.getByRole('button', { name: '搜索商品' }).click();
  await expect(page.locator('#search-result pre')).toContainText('LAB_SQLI_FOUND');
  await page.getByLabel('笔记编号').fill('1002');
  await page.getByRole('button', { name: '读取笔记' }).click();
  await expect(page.locator('#note-result pre')).toContainText('LAB_IDOR_FOUND');
  await page.getByLabel('留言内容').fill('<script>const marker=document.createElement("strong");marker.id="xss-proof";marker.textContent="XSS 已执行";document.body.append(marker)</script>');
  await page.getByRole('button', { name: '保存留言' }).click();
  await expect(page.frameLocator('#xss-preview').locator('#xss-proof')).toHaveText('XSS 已执行');
  await page.getByRole('button', { name: '刷新预览', exact: true }).click();
  await expect(page.frameLocator('#xss-preview').locator('#xss-proof')).toBeVisible();
  await expect(page.locator('#toast')).toBeHidden();
  await page.locator('#xss-preview').scrollIntoViewIfNeeded();
  await page.screenshot({ path: 'test-results/lab-desktop.png', fullPage: true });

  await page.getByLabel('运行模式').selectOption('fixed');
  await expect(page.locator('#search-result pre')).toContainText('"products": []');
  await expect(page.locator('#note-result .request-status')).toHaveText('403');
  await expect(page.frameLocator('#xss-preview').getByRole('heading', { name: '留言板 · 修复模式' })).toBeVisible();
  await expect(page.frameLocator('#xss-preview').locator('#xss-proof')).toHaveCount(0);
  await expect(page.frameLocator('#xss-preview').locator('body')).toContainText('<script>');
  await page.getByLabel('练习身份').selectOption('bob');
  await expect(page.locator('#note-result .request-status')).toHaveText('200');

  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.locator('#xss-preview').scrollIntoViewIfNeeded();
  await page.screenshot({ path: 'test-results/lab-mobile.png', fullPage: true });
  await page.getByText('重置练习数据', { exact: true }).first().click();
  await page.getByLabel('输入 RESET 确认').fill('RESET');
  await page.getByRole('button', { name: '重置练习数据', exact: true }).click();
  await expect(page.locator('#message-result')).toContainText('练习数据已重置');
  await expect(page.frameLocator('#xss-preview').locator('article')).toHaveCount(1);
  await page.reload();
  await expect(page.getByLabel('运行模式')).toHaveValue('fixed');
  await expect(page.getByLabel('练习身份')).toHaveValue('alice');
  expect(errors).toEqual([]);
});
