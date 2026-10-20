import { createHmac, randomInt, randomUUID, timingSafeEqual } from 'node:crypto';

export const REGISTRATION_RULES = Object.freeze({ codeLength: 6, expiresIn: 600, retryAfter: 60, maxAttempts: 5 });

export function createRegistration({ db, secret, sendCode, fail, now = Date.now }) {
  const hash = (email, nonce, code) => createHmac('sha256', secret).update(`${email}\0${nonce}\0${code}`).digest('hex');
  const find = email => db.prepare('SELECT * FROM registration_codes WHERE email = ?').get(email);
  const readCandidate = (email, code) => {
    if (typeof code !== 'string' || !/^\d{6}$/.test(code)) throw fail(400, '请输入邮箱收到的 6 位验证码');
    const record = find(email);
    if (!record || !record.delivered) throw fail(400, '请先发送邮箱验证码');
    if (record.expires_at <= now()) throw fail(400, '验证码已过期，请重新发送');
    if (record.attempts >= REGISTRATION_RULES.maxAttempts) throw fail(429, '验证码错误次数过多，请重新发送');
    const expected = Buffer.from(record.code_hash, 'hex');
    const actual = Buffer.from(hash(email, record.nonce, code), 'hex');
    if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
      db.prepare('UPDATE registration_codes SET attempts = attempts + 1 WHERE email = ? AND nonce = ?').run(email, record.nonce);
      throw fail(400, '验证码不正确');
    }
    return record;
  };
  return {
    config: { emailVerificationRequired: true, mailConfigured: Boolean(sendCode), ...REGISTRATION_RULES },
    async send(email) {
      if (!sendCode) throw fail(503, '站点尚未配置 SMTP 发信服务，请联系管理员');
      if (db.prepare('SELECT id FROM users WHERE email = ?').get(email)) throw fail(409, '这个邮箱已经注册，请直接登录');
      const timestamp = now(), nonce = randomUUID();
      const code = String(randomInt(1000000)).padStart(6, '0');
      db.prepare('DELETE FROM registration_codes WHERE expires_at <= ?').run(timestamp);
      const result = db.prepare(`INSERT INTO registration_codes (email, nonce, code_hash, expires_at, resend_at, attempts, delivered)
        VALUES (?, ?, ?, ?, ?, 0, 0)
        ON CONFLICT(email) DO UPDATE SET nonce = excluded.nonce, code_hash = excluded.code_hash,
        expires_at = excluded.expires_at, resend_at = excluded.resend_at, attempts = 0, delivered = 0
        WHERE registration_codes.resend_at <= ?`)
        .run(email, nonce, hash(email, nonce, code), timestamp + 600000, timestamp + 60000, timestamp);
      if (!result.changes) throw fail(429, '发送过于频繁，请稍后再试（每个邮箱至少间隔 60 秒）');
      try {
        await sendCode({ email, code });
      } catch (error) {
        db.prepare('DELETE FROM registration_codes WHERE email = ? AND nonce = ?').run(email, nonce);
        console.error('SMTP_SEND_FAILED', typeof error.code === 'string' ? error.code : 'DELIVERY_ERROR');
        throw fail(502, '验证码邮件发送失败，请检查发信配置或稍后重试');
      }
      const delivered = db.prepare('UPDATE registration_codes SET delivered = 1 WHERE email = ? AND nonce = ?').run(email, nonce);
      if (!delivered.changes) throw fail(409, '验证码已被更新，请使用最新邮件中的验证码');
      return { ok: true, message: '验证码已发送，请查收邮箱', expiresIn: 600, retryAfter: 60 };
    },
    check: readCandidate,
    consume(email, code, nonce) {
      const record = readCandidate(email, code);
      if (record.nonce !== nonce) throw fail(400, '验证码已更新，请使用最新邮件中的验证码');
      db.prepare('DELETE FROM registration_codes WHERE email = ? AND nonce = ?').run(email, nonce);
    },
  };
}
