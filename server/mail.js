import nodemailer from 'nodemailer';
import isEmail from 'validator/lib/isEmail.js';

export function createSmtpMailer(env = process.env) {
  const required = ['SMTP_HOST', 'SMTP_USER', 'SMTP_PASS', 'SMTP_FROM'];
  const settings = [...required, 'SMTP_PORT', 'SMTP_SECURE', 'SMTP_REQUIRE_TLS'];
  if (!settings.some(name => env[name])) return null;
  const missing = required.filter(name => !env[name]);
  if (missing.length) throw new Error(`SMTP 配置不完整，缺少：${missing.join(', ')}`);
  if (!isEmail(env.SMTP_FROM, { allow_utf8_local_part: false })) throw new Error('SMTP_FROM 必须为单个有效邮箱地址');
  const port = Number(env.SMTP_PORT || 465);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('SMTP_PORT 必须为有效端口');
  for (const key of ['SMTP_SECURE', 'SMTP_REQUIRE_TLS']) {
    if (env[key] !== undefined && !['0', '1'].includes(env[key])) throw new Error(`${key} 必须为 0 或 1`);
  }
  const secure = env.SMTP_SECURE === undefined ? port === 465 : env.SMTP_SECURE === '1';
  const transporter = nodemailer.createTransport({
    host: env.SMTP_HOST, port, secure,
    requireTLS: env.SMTP_REQUIRE_TLS !== '0',
    auth: { user: env.SMTP_USER, pass: env.SMTP_PASS },
    connectionTimeout: 10000, greetingTimeout: 10000, socketTimeout: 20000, dnsTimeout: 10000,
    disableFileAccess: true, disableUrlAccess: true, logger: false, debug: false,
  });
  return {
    async sendRegistrationCode({ email, code }) {
      const info = await transporter.sendMail({
        from: { name: 'MIN LAB', address: env.SMTP_FROM },
        to: { address: email },
        envelope: { from: env.SMTP_FROM, to: [email] },
        subject: 'MIN LAB 注册邮箱验证码',
        text: `你的 MIN LAB 注册验证码为：\n\nRegistration code: ${code}\n\n验证码 10 分钟内有效，只能使用一次。\n如果不是你本人申请注册，请忽略此邮件。`,
      });
      if (!info.accepted?.some(address => address.toLowerCase() === email.toLowerCase())) throw new Error('SMTP 服务器未接受收件人');
    },
    verify: () => transporter.verify(),
    close: () => transporter.close(),
  };
}
