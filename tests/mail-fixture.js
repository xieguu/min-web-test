export function createTestMail() {
  const messages = new Map();
  return { messages, async sendRegistrationCode({ email, code }) { messages.set(email, code); } };
}
