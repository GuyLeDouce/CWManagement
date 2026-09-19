import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import nodemailer from 'nodemailer';
import { checkEmailConfiguration, sendEmail } from '../src/lib/email';
import { AppError } from '../src/lib/errors';

const mail = { to: 'recipient@example.test', subject: 'Test link', text: 'private-test-content' };
describe('email delivery errors', () => {
  beforeEach(() => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('EMAIL_PROVIDER', 'smtp');
    vi.stubEnv('EMAIL_FROM', 'Cedar Winds <sender@example.test>');
    vi.stubEnv('SMTP_HOST', 'smtp.example.test');
    vi.stubEnv('SMTP_PORT', '587');
    vi.stubEnv('SMTP_SECURE', 'false');
    vi.stubEnv('SMTP_USER', 'test-user');
    vi.stubEnv('SMTP_PASSWORD', 'private-test-password');
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'info').mockImplementation(() => {});
    vi.spyOn(nodemailer, 'createTransport').mockReturnValue({
      sendMail: vi.fn().mockResolvedValue({}),
    } as unknown as ReturnType<typeof nodemailer.createTransport>);
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it.each(['EMAIL_PROVIDER', 'SMTP_HOST', 'EMAIL_FROM'])(
    'reports missing %s before creating a transport',
    async (name) => {
      vi.stubEnv(name, '');
      await expect(sendEmail(mail)).rejects.toMatchObject({
        status: 503,
        message: expect.stringContaining('not configured'),
      });
      expect(nodemailer.createTransport).not.toHaveBeenCalled();
      expect(console.error).toHaveBeenCalledWith('Email delivery failed', {
        code: 'EMAIL_NOT_CONFIGURED',
      });
    },
  );
  it('does not pretend to send console email in production', async () => {
    vi.stubEnv('EMAIL_PROVIDER', 'console');
    await expect(sendEmail(mail)).rejects.toBeInstanceOf(AppError);
    expect(console.info).not.toHaveBeenCalled();
  });
  it('allows the development email provider', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('EMAIL_PROVIDER', 'console');
    await expect(sendEmail(mail)).resolves.toBeUndefined();
    expect(nodemailer.createTransport).not.toHaveBeenCalled();
  });
  it.each([
    ['SMTP_PORT', 'not-a-port'],
    ['SMTP_PORT', '0'],
    ['SMTP_PORT', '65536'],
    ['SMTP_PASSWORD', ''],
    ['SMTP_SECURE', 'yes'],
  ])('rejects invalid %s=%s', (name, value) => {
    vi.stubEnv(name, value);
    expect(() => checkEmailConfiguration()).toThrow('incomplete or invalid');
  });
  it.each([
    ['EAUTH', 'EMAIL_AUTH_FAILED', 'SMTP login'],
    ['ETIMEDOUT', 'EMAIL_CONNECTION_FAILED', 'could not connect'],
    ['ESOCKET', 'EMAIL_CONNECTION_FAILED', 'could not connect'],
    ['ETLS', 'EMAIL_TLS_FAILED', 'secure connection'],
    ['EENVELOPE', 'EMAIL_REJECTED', 'rejected this message'],
    [undefined, 'EMAIL_SEND_FAILED', 'could not be sent'],
  ])('reports %s without leaking provider responses', async (code, expected, message) => {
    const error = Object.assign(
      new Error('private-test-password recipient@example.test private-test-content'),
      { code },
    );
    vi.mocked(nodemailer.createTransport).mockReturnValue({
      sendMail: vi.fn().mockRejectedValue(error),
    } as unknown as ReturnType<typeof nodemailer.createTransport>);
    await expect(sendEmail(mail)).rejects.toMatchObject({
      status: 503,
      message: expect.stringContaining(message),
    });
    expect(console.error).toHaveBeenCalledWith('Email delivery failed', { code: expected });
    const output = JSON.stringify(vi.mocked(console.error).mock.calls);
    expect(output).not.toContain('private-test');
    expect(output).not.toContain(mail.to);
  });
  it('sends through the configured SMTP transport', async () => {
    const send = vi.fn().mockResolvedValue({ accepted: [mail.to] });
    vi.mocked(nodemailer.createTransport).mockReturnValue({
      sendMail: send,
    } as unknown as ReturnType<typeof nodemailer.createTransport>);
    await sendEmail(mail);
    expect(nodemailer.createTransport).toHaveBeenCalledWith(
      expect.objectContaining({ host: 'smtp.example.test', port: 587, secure: false }),
    );
    expect(send).toHaveBeenCalledWith({ ...mail, from: 'Cedar Winds <sender@example.test>' });
    expect(console.error).not.toHaveBeenCalled();
  });
});
