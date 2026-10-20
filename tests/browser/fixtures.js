import { expect } from '@playwright/test';

export const testAdmin = { email: 'browser-admin@example.com', password: 'Browser-admin-2026' };

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
