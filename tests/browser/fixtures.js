import { expect } from '@playwright/test';

export const testAdmin = { email: 'browser-admin@example.com', password: 'Browser-admin-2026' };

export async function testRegistrationCode(email) {
  if (!process.env.MIN_TEST_MAILBOX_URL) throw new Error('Test inbox is not running');
  const url = new URL(process.env.MIN_TEST_MAILBOX_URL);
  url.searchParams.set('email', email);
  const response = await fetch(url);
  expect(response.status).toBe(200);
  return (await response.json()).code;
}

export async function fillRegistrationCode(page, email) {
  await page.getByRole('button', { name: '发送验证码', exact: true }).click();
  await expect(page.locator('#email-code-hint')).toContainText('验证码已发往');
  await page.getByLabel('邮箱验证码', { exact: true }).fill(await testRegistrationCode(email));
}

export async function setTestUserLevel(playwright, email, level) {
  const context = await playwright.request.newContext({ baseURL: 'http://127.0.0.1:3107', extraHTTPHeaders: { 'X-Requested-With': 'min-web-test' } });
  try {
    expect((await context.post('/api/auth/login', { data: testAdmin })).status()).toBe(200);
    const { users } = await (await context.get('/api/admin/users')).json();
    const user = users.find(item => item.email === email);
    expect(user).toBeTruthy();
    expect((await context.patch(`/api/admin/users/${user.id}`, { data: { level } })).status()).toBe(200);
  } finally { await context.dispose(); }
}
