import { createSmtpMailer } from './mail.js';

let mailer;
try {
  mailer = createSmtpMailer();
  if (!mailer) throw new Error('请先配置 SMTP_HOST、SMTP_USER、SMTP_PASS、SMTP_FROM');
  await mailer.verify();
  console.log('SMTP 连接与身份验证成功。可在注册页面发送验证码测试实际投递。');
} catch (error) {
  console.error('SMTP 检查失败：', error.code || error.message);
  process.exitCode = 1;
} finally { mailer?.close(); }
