import { once } from 'node:events';
import { resolve } from 'node:path';
import { createApp } from '../server/app.js';

export default async function setup() {
  const runtime = createApp({ dataDir: resolve(`test-results/ui-data-${Date.now()}`) });
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
