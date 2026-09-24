'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { api, useApi, date as formatDate } from '@/lib/client';
import { Brand } from './brand';
import { ActionButton, ErrorBox, Loading, Empty } from './ui';
import type { ClientProject } from '@/lib/client-projections';
import type { Prisma } from '@prisma/client';

type Wire<T> = T extends Date
  ? string
  : T extends Prisma.Decimal
    ? string
    : T extends (infer U)[]
      ? Wire<U>[]
      : T extends object
        ? { [K in keyof T]: Wire<T[K]> }
        : T;
export type PortalData = Wire<ClientProject>;
const date = (v: string | null | undefined) =>
  v ? formatDate(v, v.endsWith('T00:00:00.000Z') ? 'UTC' : 'America/Toronto') : '—';
const dollars = (value: string | number) =>
  new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD' }).format(Number(value));
const sections = [
  'home',
  'schedule',
  'selections',
  'change-orders',
  'updates',
  'photos',
  'documents',
  'messages',
];
export function ClientPortal({
  projectId,
  section = 'home',
}: {
  projectId?: string;
  section?: string;
}) {
  const router = useRouter();
  const { data, error, refresh } = useApi<PortalData>(
    projectId ? `client/project?projectId=${encodeURIComponent(projectId)}` : '',
  );
  const projects = useApi<{
    projects: { id: string; name: string; number: string; stage: string | null }[];
  }>('client/projects');
  return (
    <div className="client-shell">
      <header className="client-header">
        <Link href="/client">
          <Brand />
        </Link>
        <span>Your project, together.</span>
        <ActionButton
          action={async () => {
            await api('auth/logout', {});
            router.push('/login');
            router.refresh();
          }}
        >
          Sign out
        </ActionButton>
      </header>
      {!projectId ? (
        <main className="client-main">
          <p className="eyebrow">CEDAR WINDS DESIGN~BUILD</p>
          <h1>Welcome home.</h1>
          <p>Follow your project and make your next decisions here.</p>
          <ErrorBox message={projects.error} />
          <div className="client-grid">
            {projects.data?.projects.map((p) => (
              <Link className="client-card" key={p.id} href={`/client/projects/${p.id}`}>
                <small>{p.number}</small>
                <h2>{p.name}</h2>
                <p>{p.stage || 'Your project'}</p>
                <strong>Open project →</strong>
              </Link>
            ))}
          </div>
          {projects.data?.projects.length === 0 && (
            <Empty title="Your invitation is on its way">
              Your project team will grant access here. Contact Cedar Winds if you were expecting a
              project.
            </Empty>
          )}
        </main>
      ) : (
        <>
          <nav className="client-nav" aria-label="Client project navigation">
            {sections.map((s) => (
              <Link
                key={s}
                className={s === section ? 'active' : ''}
                href={`/client/projects/${projectId}/${s === 'home' ? '' : s}`}
              >
                {s.replace('-', ' ')}
              </Link>
            ))}
          </nav>
          <main className="client-main">
            <ErrorBox message={error} />
            {!data && !error ? (
              <Loading />
            ) : (
              data && <PortalContent data={data} section={section} refresh={refresh} />
            )}
          </main>
        </>
      )}
      <footer className="client-footer">
        Cedar Winds Design~Build · Thoughtfully built, together.
      </footer>
    </div>
  );
}
export function PortalContent({
  data,
  section,
  refresh,
  preview = false,
}: {
  data: PortalData;
  section: string;
  refresh: () => void;
  preview?: boolean;
}) {
  const projectId = data.project.id;
  const pending = data.selections.filter((s) => s.status === 'PUBLISHED');
  const changes = data.changeOrders.filter((c) => c.status === 'ISSUED');
  return (
    <>
      <div className="client-heading">
        <span className="eyebrow">
          {data.project.number} · {data.project.stage || 'YOUR PROJECT'}
        </span>
        <h1>{data.project.name}</h1>
        {preview && <strong>Client preview — actions disabled</strong>}
      </div>
      {section === 'home' && (
        <>
          <p className="client-intro">
            {data.project.clientVisibleNotes ||
              'Welcome to your project. Find updates, review decisions, and stay in touch with your team.'}
          </p>
          {data.project.clientTargetCompletion && (
            <p>Target completion: {date(data.project.clientTargetCompletion)}</p>
          )}
          <section className="client-attention">
            <h2>Needs your attention</h2>
            {pending.length + changes.length === 0 ? (
              <p>You’re all caught up on decisions.</p>
            ) : (
              <>
                {pending.map((s) => (
                  <Link key={s.id} href={`/client/projects/${projectId}/selections`}>
                    {s.title}
                    <span>{deadline(s.deadline)}</span>
                  </Link>
                ))}
                {changes.map((c) => (
                  <Link key={c.id} href={`/client/projects/${projectId}/change-orders`}>
                    {c.document.number} — {c.document.title}
                    <span>Approval requested</span>
                  </Link>
                ))}
              </>
            )}
            <Link href={`/client/projects/${projectId}/messages`}>Messages from your team →</Link>
          </section>
          <div className="client-grid">
            <section className="client-card">
              <h2>Coming up</h2>
              {data.schedule
                .filter((t) => t.status !== 'COMPLETE')
                .slice(0, 3)
                .map((t) => (
                  <p key={t.id}>
                    <strong>{t.clientTitle}</strong>
                    <br />
                    {date(t.startDate)} – {date(t.endDate)}
                  </p>
                ))}
            </section>
            <section className="client-card">
              <h2>Latest update</h2>
              {data.updates.slice(0, 1).map((u) => (
                <div key={u.id}>
                  <small>{date(u.date)}</small>
                  <p className="preserve-text">{u.clientSummary}</p>
                </div>
              ))}
            </section>
          </div>
          {!preview && <ClientInbox projectId={projectId} />}
          <div className="client-grid">
            {data.files
              .filter(
                (f) =>
                  f.kind === 'PHOTO' &&
                  ['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(f.mimeType),
              )
              .slice(0, 3)
              .map((f) => (
                <a className="client-card" href={`/api/files/${f.id}`} key={f.id}>
                  <img
                    className="client-photo"
                    src={`/api/files/${f.id}`}
                    alt={f.caption || f.originalFilename}
                  />
                  <p>{f.caption || f.originalFilename}</p>
                </a>
              ))}
          </div>
        </>
      )}
      {section === 'schedule' && (
        <>
          <h2>Your project schedule</h2>
          <p>Dates and milestones shared by your project team.</p>
          {data.schedule.map((t) => (
            <article className="client-card" key={t.id}>
              <small>
                {t.milestone ? 'Milestone · ' : ''}
                {t.status.replaceAll('_', ' ')}
              </small>
              <h3>{t.clientTitle}</h3>
              <p>{t.clientDescription}</p>
              <p>
                {date(t.startDate)} – {date(t.endDate)}
              </p>
            </article>
          ))}
        </>
      )}
      {section === 'updates' && (
        <>
          <h2>Project updates</h2>
          {data.updates.map((u) => (
            <article className="client-card" key={u.id}>
              <small>{date(u.date)}</small>
              <p className="preserve-text">{u.clientSummary}</p>
            </article>
          ))}
        </>
      )}
      {['photos', 'documents'].includes(section) && (
        <>
          <h2>{section === 'photos' ? 'From your project' : 'Your documents'}</h2>
          <div className="client-grid">
            {data.files
              .filter((f) => f.kind === (section === 'photos' ? 'PHOTO' : 'DOCUMENT'))
              .map((f) => (
                <a
                  className="client-card"
                  key={f.id}
                  href={`/api/files/${f.id}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  {section === 'photos' &&
                    ['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(f.mimeType) && (
                      <img
                        src={`/api/files/${f.id}`}
                        alt={f.caption || f.originalFilename}
                        className="client-photo"
                      />
                    )}
                  <h3>{f.caption || f.originalFilename}</h3>
                  <p>{f.description}</p>
                  <small>
                    {date(f.uploadedAt)} · Open {section === 'photos' ? 'photo' : 'document'}
                  </small>
                </a>
              ))}
          </div>
        </>
      )}
      {section === 'selections' && (
        <>
          <h2>Your selections</h2>
          <p>
            Choose the details that make this project yours. Prices are before HST; any contract
            adjustment will be issued separately for your approval.
          </p>
          {data.selections.map((s) => (
            <SelectionCard
              key={s.id}
              selection={s}
              projectId={projectId}
              files={data.files}
              refresh={refresh}
              preview={preview}
            />
          ))}
        </>
      )}
      {section === 'change-orders' && (
        <>
          <h2>Change orders</h2>
          <p>Review the scope and price before recording your decision.</p>
          {data.changeOrders.map((c) => (
            <ChangeCard
              key={c.id}
              change={c}
              projectId={projectId}
              refresh={refresh}
              preview={preview}
            />
          ))}
        </>
      )}
      {section === 'messages' && !preview && <ProjectMessages projectId={projectId} client />}
    </>
  );
}
function deadline(value: string | null) {
  if (!value) return 'No deadline';
  const today = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Toronto',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
  const days = Math.round(
    (new Date(value.slice(0, 10) + 'T00:00:00Z').getTime() -
      new Date(today + 'T00:00:00Z').getTime()) /
      86400000,
  );
  return days < 0
    ? 'Overdue'
    : days === 0
      ? 'Due today'
      : days === 1
        ? 'Due tomorrow'
        : `Due ${date(value)}`;
}
function ClientInbox({ projectId }: { projectId: string }) {
  const { data, error, refresh } = useApi<{
    notifications: {
      id: string;
      title: string;
      message: string;
      readAt: string | null;
      createdAt: string;
    }[];
  }>(`client/notifications?projectId=${projectId}`);
  const messages = useApi<{ conversations: { id: string; subject: string; unread: boolean }[] }>(
    `client/messages?projectId=${projectId}`,
  );
  return (
    <section className="client-card">
      <h2>From your team</h2>
      <ErrorBox message={error} />
      {messages.data?.conversations
        .filter((c) => c.unread)
        .map((c) => (
          <p key={c.id}>
            <Link href={`/client/projects/${projectId}/messages`}>Unread message: {c.subject}</Link>
          </p>
        ))}
      {data?.notifications
        .filter((n) => !n.readAt)
        .map((n) => (
          <div className="client-message" key={n.id}>
            <strong>{n.title}</strong>
            <p>{n.message}</p>
            <ActionButton
              action={async () => {
                await api('client/notification-read', { projectId, id: n.id });
                refresh();
              }}
            >
              Mark read
            </ActionButton>
          </div>
        ))}
      {data?.notifications.every((n) => n.readAt) && <p>No unread notices.</p>}
    </section>
  );
}
function SelectionCard({
  selection: s,
  projectId,
  files,
  refresh,
  preview,
}: {
  selection: PortalData['selections'][number];
  projectId: string;
  files: PortalData['files'];
  refresh: () => void;
  preview: boolean;
}) {
  const [chosen, setChosen] = useState(''),
    [comments, setComments] = useState(''),
    [confirm, setConfirm] = useState(false);
  return (
    <article className="client-card">
      <span className="eyebrow">
        {s.category} · {s.status.replaceAll('_', ' ')}
      </span>
      <h3>{s.title}</h3>
      <p>{s.description}</p>
      <p>
        {deadline(s.deadline)} · Included allowance:{' '}
        <strong>{dollars(s.allowance?.amount || '0')}</strong>
      </p>
      <div className="client-grid">
        {s.options.map((o) => (
          <label className={`client-option ${chosen === o.id ? 'selected' : ''}`} key={o.id}>
            {s.status === 'PUBLISHED' && (
              <input
                type="radio"
                name={s.id}
                value={o.id}
                checked={chosen === o.id}
                onChange={() => {
                  setChosen(o.id);
                  setConfirm(false);
                }}
                disabled={preview}
              />
            )}
            <strong>
              {o.name}
              {o.recommended ? ' · Recommended' : ''}
            </strong>
            <p>{o.description}</p>
            <small>{[o.manufacturer, o.model, o.finish].filter(Boolean).join(' · ')}</small>
            <p>
              Selected value: {dollars(o.clientPrice)}
              <br />
              Difference:{' '}
              <strong>
                {Number(o.variance) > 0 ? '+' : ''}
                {dollars(o.variance)}
              </strong>
            </p>
            {o.leadTime && <p>{o.leadTime}</p>}
            {o.referenceUrl && (
              <a href={o.referenceUrl} target="_blank" rel="noreferrer">
                Product details
              </a>
            )}
            {o.attachmentIds.map((id) => (
              <a
                className="client-file-link"
                href={`/api/files/${id}`}
                target="_blank"
                rel="noreferrer"
                key={id}
              >
                {['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(
                  files.find((f) => f.id === id)?.mimeType || '',
                ) && (
                  <img
                    className="client-photo"
                    src={`/api/files/${id}`}
                    alt={files.find((f) => f.id === id)?.caption || o.name}
                  />
                )}
                {files.find((f) => f.id === id)?.originalFilename || 'Specification'}
              </a>
            ))}
          </label>
        ))}
      </div>
      {s.status === 'PUBLISHED' && !preview && (
        <>
          <label>
            Comments (optional)
            <textarea
              value={comments}
              onChange={(e) => setComments(e.target.value)}
              maxLength={10000}
            />
          </label>
          <label className="check">
            <input
              type="checkbox"
              checked={confirm}
              onChange={(e) => setConfirm(e.target.checked)}
            />
            I confirm this choice. Any additional cost or credit requires a separate Change Order
            approval.
          </label>
          <ActionButton
            disabled={!chosen || !confirm}
            action={async () => {
              await api('client/selection-decision', {
                projectId,
                selectionId: s.id,
                optionId: chosen,
                expectedVersion: s.version,
                comments,
              });
              refresh();
            }}
          >
            Confirm selection
          </ActionButton>
        </>
      )}
      {s.decisions.map((d) => (
        <div className="client-receipt" key={d.id}>
          <strong>Decision recorded {date(d.createdAt)}</strong>
          <p>{s.options.find((o) => o.id === d.optionId)?.name}</p>
          <p>
            {s.status === 'APPROVAL_REQUIRED'
              ? 'Your project team is preparing the contract adjustment for review.'
              : 'Your selection is approved.'}
          </p>
          {d.comments && <p>{d.comments}</p>}
        </div>
      ))}
      {!preview && <DiscussionButton projectId={projectId} subject={s.title} selectionId={s.id} />}
    </article>
  );
}
function ChangeCard({
  change: c,
  projectId,
  refresh,
  preview,
}: {
  change: PortalData['changeOrders'][number];
  projectId: string;
  refresh: () => void;
  preview: boolean;
}) {
  const [name, setName] = useState(''),
    [ack, setAck] = useState(false),
    [printing, setPrinting] = useState(false);
  const d = c.document;
  async function decide(action: 'APPROVE' | 'DECLINE') {
    await api('client/change-order-approval', {
      projectId,
      revisionId: c.id,
      documentHash: c.documentHash,
      action,
      typedName: name,
    });
    refresh();
  }
  return (
    <article className={`client-card ${printing ? 'client-print-document' : ''}`}>
      <span className="eyebrow">
        {d.number} · Rev {d.revision} · {c.status}
      </span>
      <h3>{d.title}</h3>
      <p className="preserve-text">{d.scope}</p>
      <p>{d.description}</p>
      <table>
        <thead>
          <tr>
            <th>Scope</th>
            <th>Quantity</th>
            <th>Amount</th>
          </tr>
        </thead>
        <tbody>
          {d.lines.map((l, i) => (
            <tr key={i}>
              <td>{l.description}</td>
              <td>
                {l.quantity} {l.unit}
              </td>
              <td>{dollars(l.amount)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p>
        Subtotal: {dollars(d.subtotal)} · HST: {dollars(d.tax)}
        <br />
        <strong>Total: {dollars(d.total)}</strong>
      </p>
      <p>
        Schedule impact: {d.scheduleDays} days · Issued {date(d.issuedAt)}
      </p>
      <p className="preserve-text">{d.terms}</p>
      {c.attachmentIds.map((id) => (
        <a className="client-file-link" href={`/api/files/${id}`} key={id}>
          Supporting document
        </a>
      ))}
      <div className="no-print">
        <button
          onClick={() => {
            setPrinting(true);
            setTimeout(() => {
              window.print();
              setPrinting(false);
            }, 100);
          }}
        >
          Print change order
        </button>
      </div>
      {c.status === 'ISSUED' && !preview && (
        <div className="no-print">
          <label>
            Your full name
            <input value={name} onChange={(e) => setName(e.target.value)} maxLength={200} />
          </label>
          <label className="check">
            <input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} />I have
            reviewed this revision, including its scope, price, HST and schedule impact. My decision
            will be recorded with my authenticated account.
          </label>
          <div className="button-row">
            <ActionButton
              disabled={name.trim().length < 2 || !ack}
              action={() => decide('APPROVE')}
            >
              Approve change order
            </ActionButton>
            <ActionButton
              disabled={name.trim().length < 2 || !ack}
              action={() => decide('DECLINE')}
            >
              Decline
            </ActionButton>
          </div>
        </div>
      )}
      {c.acceptedAt && <p className="client-receipt">Accepted {date(c.acceptedAt)}</p>}
      {!preview && (
        <DiscussionButton projectId={projectId} subject={d.number} changeOrderRevisionId={c.id} />
      )}
    </article>
  );
}
function DiscussionButton({
  projectId,
  subject,
  selectionId,
  changeOrderRevisionId,
}: {
  projectId: string;
  subject: string;
  selectionId?: string;
  changeOrderRevisionId?: string;
}) {
  const [body, setBody] = useState('');
  return (
    <details className="no-print">
      <summary>Ask your project team a question</summary>
      <label>
        Message
        <textarea value={body} onChange={(e) => setBody(e.target.value)} />
      </label>
      <ActionButton
        disabled={!body.trim()}
        action={async () => {
          await api('client/messages', {
            projectId,
            subject,
            selectionId,
            changeOrderRevisionId,
            body,
          });
          setBody('');
        }}
      >
        Send question
      </ActionButton>
    </details>
  );
}
type Thread = {
  id: string;
  subject: string;
  audience: string;
  unread: boolean;
  messages: {
    id: string;
    body: string;
    createdAt: string;
    author: { firstName: string; lastName: string };
  }[];
};
export function ProjectMessages({
  projectId,
  client = false,
}: {
  projectId: string;
  client?: boolean;
}) {
  const prefix = client ? 'client' : 'client-management';
  const { data, error, refresh } = useApi<{ conversations: Thread[] }>(
    `${prefix}/messages?projectId=${projectId}`,
  );
  const [subject, setSubject] = useState(''),
    [body, setBody] = useState(''),
    [thread, setThread] = useState(''),
    [audience, setAudience] = useState('CLIENT');
  return (
    <>
      <h2>Messages</h2>
      <ErrorBox message={error} />
      {data?.conversations.map((t) => (
        <article className="client-card" key={t.id}>
          <h3>
            {t.subject} {t.unread ? '· New' : ''}
          </h3>
          {!client && <small>{t.audience}</small>}
          {t.messages.map((m) => (
            <div className="client-message" key={m.id}>
              <strong>
                {m.author.firstName} {m.author.lastName}
              </strong>
              <small> · {date(m.createdAt)}</small>
              <p className="preserve-text">{m.body}</p>
            </div>
          ))}
          <ActionButton
            action={async () => {
              setThread(t.id);
              setSubject(t.subject);
              await api(`${prefix}/read`, { projectId, id: t.id });
              refresh();
            }}
          >
            Reply / mark read
          </ActionButton>
        </article>
      ))}
      <section className="client-card">
        <h3>{thread ? 'Reply' : 'Start a conversation'}</h3>
        <label>
          Subject
          <input
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            maxLength={200}
            disabled={!!thread}
          />
        </label>
        {!client && !thread && (
          <label>
            Audience
            <select value={audience} onChange={(e) => setAudience(e.target.value)}>
              <option value="CLIENT">Visible to authorized project clients</option>
              <option value="INTERNAL">Internal team only</option>
            </select>
          </label>
        )}
        <label>
          Your message
          <textarea value={body} onChange={(e) => setBody(e.target.value)} maxLength={10000} />
        </label>
        <ActionButton
          disabled={!body.trim() || !subject.trim()}
          action={async () => {
            await api(`${prefix}/messages`, {
              projectId,
              conversationId: thread || null,
              subject,
              body,
              audience,
            });
            setBody('');
            setSubject('');
            setThread('');
            refresh();
          }}
        >
          Send message
        </ActionButton>
        {thread && (
          <button
            onClick={() => {
              setThread('');
              setSubject('');
            }}
          >
            New conversation
          </button>
        )}
      </section>
    </>
  );
}
