import nodemailer from 'nodemailer';
export type Mail = {
  to: string;
  subject: string;
  text: string;
  attachments?: { filename: string; content: string }[];
};
export async function sendEmail(mail: Mail) {
  if (process.env.EMAIL_PROVIDER === 'console' && process.env.NODE_ENV !== 'production') {
    console.info('[development email]', JSON.stringify(mail));
    return;
  }
  if (process.env.EMAIL_PROVIDER !== 'smtp' || !process.env.SMTP_HOST || !process.env.EMAIL_FROM)
    throw new Error('Email is not configured.');
  const transport = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT ?? 587),
    secure: process.env.SMTP_SECURE === 'true',
    auth: process.env.SMTP_USER
      ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD }
      : undefined,
    connectionTimeout: 10000,
    socketTimeout: 15000,
  });
  await transport.sendMail({ from: process.env.EMAIL_FROM, ...mail });
}
export function appUrl() {
  const url = new URL(process.env.APP_URL ?? 'http://localhost:3000');
  if (process.env.NODE_ENV === 'production' && url.protocol !== 'https:')
    throw new Error('APP_URL must use HTTPS in production.');
  return url.origin;
}
