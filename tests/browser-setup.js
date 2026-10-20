import { once } from 'node:events';
import { resolve } from 'node:path';
import { createApp } from '../server/app.js';
import bcrypt from 'bcryptjs';
import { randomUUID } from 'node:crypto';
import { testAdmin } from './browser/fixtures.js';
import { createTestMail } from './mail-fixture.js';
import { createServer } from 'node:http';

export default async function setup() {
  const mail = createTestMail();
  const runtime = createApp({ dataDir: resolve(`test-results/ui-data-${Date.now()}`), sendRegistrationCode: mail.sendRegistrationCode });
  // Test-only inbox lives in the test harness, never in the production app/router.
  const inbox = createServer((req, res) => {
    const email = new URL(req.url, 'http://localhost').searchParams.get('email');
    const code = mail.messages.get(email);
    res.writeHead(code ? 200 : 404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(code ? { code } : { error: 'No test message' }));
  });
  inbox.listen(0, '127.0.0.1');
  await once(inbox, 'listening');
  process.env.MIN_TEST_MAILBOX_URL = `http://127.0.0.1:${inbox.address().port}`;
  runtime.db.prepare('INSERT INTO users (id, name, email, password_hash, created_at, level) VALUES (?, ?, ?, ?, ?, 3)')
    .run(randomUUID(), '测试管理员', testAdmin.email, await bcrypt.hash(testAdmin.password, 12), new Date().toISOString());
  const server = runtime.app.listen(3107, '127.0.0.1');
  try {
    await once(server, 'listening');
  } catch (error) {
    inbox.closeAllConnections();
    await new Promise(resolve => inbox.close(resolve));
    runtime.close();
    throw error;
  }
  return async () => {
    server.closeAllConnections();
    await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    inbox.closeAllConnections();
    await new Promise(resolve => inbox.close(resolve));
    runtime.close();
  };
}
