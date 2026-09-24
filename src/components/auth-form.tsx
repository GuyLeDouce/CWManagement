'use client';
import { FormEvent, useState } from 'react';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { api } from '@/lib/client';
import { Brand } from './brand';
import { ErrorBox, Success } from './ui';
export function AuthForm({
  kind,
  token = '',
  next = '/',
}: {
  kind: 'login' | 'forgot' | 'reset';
  token?: string;
  next?: string;
}) {
  const [error, setError] = useState(''),
    [message, setMessage] = useState(''),
    [busy, setBusy] = useState(false);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError('');
    const form = new FormData(e.currentTarget);
    try {
      const body =
        kind === 'login'
          ? { email: form.get('email'), password: form.get('password') }
          : kind === 'forgot'
            ? { email: form.get('email') }
            : { token, password: form.get('password') };
      const response = await api<{ message?: string }>(
        `auth/${kind === 'forgot' ? 'forgot' : kind === 'reset' ? 'reset' : 'login'}`,
        body,
      );
      if (kind === 'login')
        window.location.assign(
          next.startsWith('/') && !next.startsWith('//') && !next.includes('\\') ? next : '/',
        );
      else setMessage(response.message ?? 'Done.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Please try again.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="auth-page">
      <aside className="auth-story">
        <div className="eyebrow light">THE BETTER WAY TO BUILD</div>
        <h1>
          A good day
          <br />
          starts here.
        </h1>
        <p>
          Your project. Your team.
          <br />
          One place to stay connected.
        </p>
        <div className="auth-rule" />
        <small>CEDAR WINDS DESIGN~BUILD</small>
      </aside>
      <main className="auth-main">
        <div className="auth-box">
          <Brand />
          <div className="auth-heading">
            <span className="eyebrow">WELCOME TO CEDAR WINDS</span>
            <h1>
              {kind === 'login'
                ? 'Welcome back.'
                : kind === 'forgot'
                  ? 'Forgot your password?'
                  : 'Set your password.'}
            </h1>
            <p>
              {kind === 'login'
                ? 'Sign in to your Cedar Winds workspace.'
                : kind === 'forgot'
                  ? 'We’ll email you a link to reset it.'
                  : 'Use at least 12 characters.'}
            </p>
          </div>
          <form onSubmit={submit}>
            {kind !== 'reset' && (
              <label>
                Email address
                <input
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                  placeholder="you@cedarwinds.ca"
                />
              </label>
            )}
            {kind !== 'forgot' && (
              <label>
                Password
                <input
                  name="password"
                  type="password"
                  autoComplete={kind === 'login' ? 'current-password' : 'new-password'}
                  minLength={kind === 'reset' ? 12 : 1}
                  maxLength={128}
                  required
                />
              </label>
            )}
            <ErrorBox message={error} />
            <Success message={message} />
            <button className="primary full" disabled={busy || (kind === 'reset' && !!message)}>
              {busy
                ? 'Please wait…'
                : kind === 'login'
                  ? 'Sign in'
                  : kind === 'forgot'
                    ? 'Send reset link'
                    : 'Save password'}
              <ArrowRight size={20} />
            </button>
          </form>
          <Link className="auth-link" href={kind === 'login' ? '/forgot-password' : '/login'}>
            {kind === 'login' ? 'Forgot your password?' : 'Back to sign in'}
          </Link>
          <p className="auth-foot">Your time. Your projects. One place.</p>
        </div>
      </main>
    </div>
  );
}
