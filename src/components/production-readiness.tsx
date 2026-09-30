'use client';
import { useState } from 'react';
import { api, useApi, pretty } from '@/lib/client';
import { ActionButton, ErrorBox } from './ui';
type Evidence = {
  state: string;
  date: string;
  requestId: string;
  message: string;
  checks?: Record<string, boolean>;
};
type Readiness = {
  application: {
    deployment: string;
    database: boolean;
    migrations: number;
    pendingOrFailed: number;
    latestMigration: string;
  };
  storage: { state: string; lastTest: Evidence | null; pendingCleanup: string[] };
  email: { state: string; lastTest: Evidence | null; inboxConfirmed: boolean };
  automation: {
    automationEnabled: boolean;
    automationEmailEnabled: boolean;
    rolloutStage: number;
    secretConfigured: boolean;
    lastRun: { status: string; startedAt: string } | null;
    lastTest: { startedAt: string } | null;
    failures: number;
  };
  quickBooks: { id: string; name: string; mode: string; lastConnectedAt: string | null }[];
};
export function ProductionReadiness() {
  const q = useApi<Readiness>('business/readiness');
  const [testId, setTestId] = useState(''),
    [result, setResult] = useState('');
  const run = async (kind: string, id = crypto.randomUUID()) => {
    const r = await api<{ state?: string; generated?: number }>('business/readiness/' + kind, {
      id,
    });
    setResult(r.state || `Scheduler test: ${r.generated || 0} new notification(s).`);
    q.refresh();
  };
  return (
    <section className="panel">
      <h2>Production readiness</h2>
      <p>
        Configuration is not live validation. Tests below are deliberate, limited operator actions.
        QuickBooks and scheduled email remain separately controlled.
      </p>
      <ErrorBox message={q.error} />
      {result && <p role="status">{pretty(result)}</p>}
      {q.data && (
        <>
          <div className="summary-grid">
            <section className="panel">
              <h3>Application</h3>
              <p>Database reachable · {q.data.application.migrations} migration records</p>
              <p>Unfinished migrations: {q.data.application.pendingOrFailed}</p>
              <p>Build: {q.data.application.deployment}</p>
            </section>
            <section className="panel">
              <h3>Storage — {pretty(q.data.storage.state)}</h3>
              <p>
                Tests use temporary passwordless identities, three small files and an archived
                diagnostic project. File bytes and temporary access are removed; audit evidence
                remains.
              </p>
              <ActionButton action={() => run('storage')}>
                Test private storage and access
              </ActionButton>
              {q.data.storage.pendingCleanup.map((id) => (
                <div key={id}>
                  <p>Diagnostic cleanup pending: {id}</p>
                  <ActionButton action={() => run('cleanup-storage', id)}>
                    Retry cleanup
                  </ActionButton>
                </div>
              ))}
              {q.data.storage.lastTest && (
                <>
                  <p>{q.data.storage.lastTest.message}</p>
                  <ul>
                    {Object.entries(q.data.storage.lastTest.checks || {}).map(([k, v]) => (
                      <li key={k}>
                        {pretty(k)}: {v ? 'Passed' : 'Failed'}
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </section>
            <section className="panel">
              <h3>Email — {pretty(q.data.email.state)}</h3>
              <p>
                Sends one message to your signed-in account. SMTP acceptance does not prove inbox
                delivery. Review uncertain outcomes before another test.
              </p>
              <ActionButton action={() => run('email')}>Send my test email</ActionButton>
              {q.data.email.lastTest && <p>{q.data.email.lastTest.message}</p>}
              {q.data.email.lastTest?.state === 'LIVE_TESTED' && !q.data.email.inboxConfirmed && (
                <ActionButton
                  action={() => run('confirm-email', q.data!.email.lastTest!.requestId)}
                >
                  I received the test email
                </ActionButton>
              )}
              {q.data.email.inboxConfirmed && <p>Operator confirmed inbox receipt.</p>}
            </section>
            <section className="panel">
              <h3>Automation</h3>
              <p>
                {q.data.automation.automationEnabled ? 'Enabled' : 'Disabled'} · rollout stage{' '}
                {q.data.automation.rolloutStage} · email{' '}
                {q.data.automation.automationEmailEnabled ? 'enabled' : 'disabled'}
              </p>
              <p>
                Scheduler credential:{' '}
                {q.data.automation.secretConfigured ? 'Configured' : 'Missing'}. Delivery
                failures/reviews: {q.data.automation.failures}
              </p>
              <p>
                Last run:{' '}
                {q.data.automation.lastRun
                  ? `${q.data.automation.lastRun.status} — ${q.data.automation.lastRun.startedAt}`
                  : 'None'}
              </p>
              <ActionButton
                action={async () => {
                  const id = testId || crypto.randomUUID();
                  setTestId(id);
                  await run('scheduler', id);
                }}
              >
                Run / repeat internal test
              </ActionButton>
              <p>
                Creates one in-app notification using the durable lease. Repeat creates no
                duplicate. Does not enable automation or send email.
              </p>
            </section>
            <section className="panel">
              <h3>QuickBooks</h3>
              {q.data.quickBooks.map((c) => (
                <p key={c.id}>
                  {c.name}: {c.mode}. Last contact: {c.lastConnectedAt || 'Never'}
                </p>
              ))}
              <p>
                Live accounting validation remains separate. Do not activate unrestricted sync from
                this check.
              </p>
            </section>
          </div>
        </>
      )}
    </section>
  );
}
