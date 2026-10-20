import { resolve } from 'node:path';
import { createApp } from './app.js';
import { createSmtpMailer } from './mail.js';

const port = Number(process.env.PORT || 3000);
const host = process.env.HOST || '127.0.0.1';
const mailer = createSmtpMailer();
const { app, close } = createApp({
  dataDir: resolve(process.env.APP_DATA_DIR || 'data'),
  sessionSecret: process.env.SESSION_SECRET,
  secureCookie: process.env.SECURE_COOKIE === '1',
  sendRegistrationCode: mailer?.sendRegistrationCode,
});
const server = app.listen(port, host, () => console.log(`MIN 已启动：http://${host}:${port}`));
server.on('error', error => { console.error(error); mailer?.close(); close(); process.exit(1); });
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => server.close(() => { mailer?.close(); close(); process.exit(0); }));
}
