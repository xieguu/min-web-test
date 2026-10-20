import { once } from 'node:events';
import { resolve } from 'node:path';
import { createApp } from '../server/app.js';
import bcrypt from 'bcryptjs';
import { randomUUID } from 'node:crypto';
import { testAdmin } from './browser/fixtures.js';

export default async function setup() {
  const runtime = createApp({ dataDir: resolve(`test-results/ui-data-${Date.now()}`) });
  runtime.db.prepare('INSERT INTO users (id, name, email, password_hash, created_at, level) VALUES (?, ?, ?, ?, ?, 3)')
    .run(randomUUID(), '测试管理员', testAdmin.email, await bcrypt.hash(testAdmin.password, 12), new Date().toISOString());
  const server = runtime.app.listen(3107, '127.0.0.1');
  try {
    await once(server, 'listening');
  } catch (error) {
    runtime.close();
    throw error;
  }
  return async () => {
    server.closeAllConnections();
    await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    runtime.close();
  };
}
