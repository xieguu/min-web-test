import { test, expect } from '@playwright/test';
import { testAdmin } from './fixtures.js';

test('管理员界面升降级、禁用与普通账号权限展示', async ({ page, playwright }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const email = `member-${Date.now()}@example.com`, password = 'Member-browser-2026';
  const member = await playwright.request.newContext({ baseURL: 'http://127.0.0.1:3107', extraHTTPHeaders: { 'X-Requested-With': 'min-web-test' } });
  try {
    expect((await member.post('/api/auth/register', { data: { email, password, name: '待授权用户' } })).status()).toBe(201);
    expect((await member.get('/api/lab')).status()).toBe(403);
    await page.goto('/login');
    await page.getByLabel('邮箱', { exact: true }).fill(testAdmin.email);
    await page.getByLabel('密码', { exact: true }).fill(testAdmin.password);
    await page.getByRole('button', { name: '登录', exact: true }).click();
    await expect(page.getByRole('link', { name: '账号管理', exact: true })).toBeVisible();
    await page.getByRole('link', { name: '账号管理', exact: true }).click();
    await page.getByRole('searchbox', { name: '搜索账号' }).fill(email);
    await expect(page.locator('#admin-users tr')).toHaveCount(1);
    await page.getByLabel(`账号等级：${email}`, { exact: true }).selectOption('2');
    await page.getByRole('button', { name: `保存 ${email}`, exact: true }).click();
    await expect(page.getByRole('status')).toHaveText('账号权限已更新');
    expect((await member.get('/api/lab')).status()).toBe(200);
    await page.getByLabel(`账号状态：${email}`, { exact: true }).selectOption('true');
    const disabled = page.waitForResponse(response => response.request().method() === 'PATCH' && response.url().includes('/api/admin/users/'));
    await page.getByRole('button', { name: `保存 ${email}`, exact: true }).click();
    expect((await disabled).status()).toBe(200);
    expect((await member.get('/api/session')).status()).toBe(200);
    expect((await (await member.get('/api/session')).json()).user).toBeNull();
    expect((await member.post('/api/auth/login', { data: { email, password } })).status()).toBe(403);
    await page.getByLabel(`账号状态：${email}`, { exact: true }).selectOption('false');
    await page.getByLabel(`账号等级：${email}`, { exact: true }).selectOption('1');
    const enabled = page.waitForResponse(response => response.request().method() === 'PATCH' && response.url().includes('/api/admin/users/'));
    await page.getByRole('button', { name: `保存 ${email}`, exact: true }).click();
    expect((await enabled).status()).toBe(200);
    expect((await member.post('/api/auth/login', { data: { email, password } })).status()).toBe(200);
    expect((await member.get('/api/lab')).status()).toBe(403);
    await page.screenshot({ path: 'test-results/admin-desktop.png', fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: 'test-results/admin-mobile.png', fullPage: true });
    await page.goto('/account');
    await expect(page.getByRole('heading', { name: '账号等级与权限' })).toBeVisible();
    await expect(page.locator('.level-card.current-level')).toContainText('LV3 管理员');
    expect(errors).toEqual([]);
  } finally { await member.dispose(); }
});
