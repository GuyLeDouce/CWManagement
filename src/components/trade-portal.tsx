'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { api, useApi, date, pretty } from '@/lib/client';
import { ActionButton, ErrorBox, Loading } from './ui';
import { Brand } from './brand';
import type { TradeProject } from '@/lib/trade-projections';
import type { tradeConversations } from '@/lib/trade-messages';
export type Wire<T> = T extends Date
  ? string
  : T extends (infer U)[]
    ? Wire<U>[]
    : T extends object
      ? { [K in keyof T]: Wire<T[K]> }
      : T;
type Data = Wire<TradeProject>;
type ContextChoice = {
  id: string;
  label: string;
  field: 'purchasingRevisionId' | 'siteInstructionId' | 'deficiencyId';
};
function recordChoices(data: Data): ContextChoice[] {
  return [
    ...data.work.map((w) => ({
      id: w.id,
      label: `${w.document.number} Rev ${w.document.revision}`,
      field: 'purchasingRevisionId' as const,
    })),
    ...data.instructions.map((i) => ({
      id: i.id,
      label: `${i.document.number}: ${i.document.title}`,
      field: 'siteInstructionId' as const,
    })),
    ...data.deficiencies.map((d) => ({
      id: d.id,
      label: `${d.number}: ${d.title}`,
      field: 'deficiencyId' as const,
    })),
  ];
}
function ContextSelect({
  choices,
  value,
  onChange,
}: {
  choices: ContextChoice[];
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label>
      Related work or site item
      <select
        aria-label="Related work or site item"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="">General project communication</option>
        {choices.map((c) => (
          <option key={c.id} value={c.id}>
            {c.label}
          </option>
        ))}
      </select>
    </label>
  );
}
const sections = [
  'home',
  'schedule',
  'work',
  'documents',
  'instructions',
  'deficiencies',
  'uploads',
  'messages',
];
const dollars = (s: string) =>
  new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD' }).format(Number(s));
const onDate = (s: string | null) => (s ? date(s, 'UTC') : 'Date to be confirmed');
function FileLinks({ files }: { files: { id: string; originalFilename: string }[] }) {
  return (
    <ul>
      {files.map((f) => (
        <li key={f.id}>
          <a href={`/api/files/${f.id}`} target="_blank" rel="noreferrer">
            {f.originalFilename}
          </a>
        </li>
      ))}
    </ul>
  );
}
export function TradePortal({
  projectId,
  section = 'home',
}: {
  projectId?: string;
  section?: string;
}) {
  const router = useRouter();
  const projects = useApi<{
    projects: { id: string; name: string; number: string; address: string | null }[];
  }>('trade/projects');
  const { data, error, refresh } = useApi<Data>(
    projectId ? `trade/project?projectId=${projectId}` : '',
  );
  const base = `/trade/projects/${projectId}`;
  const active = sections.includes(section) ? section : 'home';
  return (
    <div className="trade-shell">
      <header className="trade-header">
        <Link href="/trade">
          <Brand />
        </Link>
        <span>Trade workspace</span>
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
        <main className="trade-main">
          <p className="eyebrow">CEDAR WINDS DESIGN~BUILD</p>
          <h1>Your projects</h1>
          <p>Work, site information and the next steps for your team.</p>
          <ErrorBox message={projects.error} />
          <div className="trade-grid">
            {projects.data?.projects.map((p) => (
              <Link className="trade-card" href={`/trade/projects/${p.id}`} key={p.id}>
                <small>{p.number}</small>
                <h2>{p.name}</h2>
                <p>{p.address}</p>
                <strong>Open project →</strong>
              </Link>
            ))}
          </div>
          {projects.data && !projects.data.projects.length && (
            <p>No active projects. Contact Cedar Winds for access.</p>
          )}
        </main>
      ) : (
        <>
          <nav className="trade-nav" aria-label="Trade project navigation">
            {sections
              .filter(
                (s) =>
                  data?.role !== 'VENDOR' ||
                  !['instructions', 'deficiencies'].includes(s) ||
                  (s === 'instructions' && data.instructions.length > 0) ||
                  (s === 'deficiencies' && data.deficiencies.length > 0),
              )
              .map((s) => (
                <Link
                  aria-current={active === s ? 'page' : undefined}
                  key={s}
                  href={`${base}/${s}`}
                >
                  {pretty(s)}
                </Link>
              ))}
          </nav>
          <main className="trade-main">
            <ErrorBox message={error} />
            {!data && !error ? (
              <Loading />
            ) : (
              data && (
                <>
                  <p className="eyebrow">
                    {data.project.number} · {data.role === 'VENDOR' ? 'Supplier' : 'Subcontractor'}
                  </p>
                  <h1>{data.project.name}</h1>
                  {active === 'home' && (
                    <>
                      <p>
                        {[
                          data.project.address,
                          data.project.municipality,
                          data.project.province,
                          data.project.postalCode,
                        ]
                          .filter(Boolean)
                          .join(', ')}
                      </p>
                      {data.siteContacts.map((p, n) => (
                        <p key={n}>
                          Project manager:{' '}
                          <a href={`mailto:${p.email}`}>
                            {p.firstName} {p.lastName}
                          </a>
                        </p>
                      ))}
                      <section className="trade-attention">
                        <h2>Needs your attention</h2>
                        <ul>
                          {data.work
                            .filter(
                              (w) =>
                                !w.acknowledgement &&
                                ['ISSUED', 'PARTIALLY_FULFILLED', 'FULFILLED'].includes(w.status),
                            )
                            .map((w) => (
                              <li key={w.id}>
                                <Link href={`${base}/work`}>
                                  {w.document.number} Rev {w.document.revision} — acknowledge
                                  receipt
                                </Link>
                              </li>
                            ))}
                          {data.instructions
                            .filter(
                              (i) =>
                                !i.acknowledgement &&
                                i.document.acknowledgementRequired &&
                                i.status === 'ISSUED',
                            )
                            .map((i) => (
                              <li key={i.id}>
                                <Link href={`${base}/instructions`}>
                                  {i.document.number} — instruction to acknowledge
                                </Link>
                              </li>
                            ))}
                          {data.deficiencies
                            .filter((d) => !['CLOSED', 'CANCELLED'].includes(d.status))
                            .map((d) => (
                              <li key={d.id}>
                                <Link href={`${base}/deficiencies`}>
                                  {d.title} — {onDate(d.dueDate)}
                                </Link>
                              </li>
                            ))}
                        </ul>
                        <Link href={`${base}/messages`}>
                          {data.unreadConversations} unread conversations — open messages
                        </Link>
                      </section>
                      <h2>Upcoming work</h2>
                      {data.schedule
                        .filter((t) => !['COMPLETE', 'CANCELLED'].includes(t.status))
                        .slice(0, 5)
                        .map((t) => (
                          <p key={t.id}>
                            <Link href={`${base}/schedule`}>{t.title}</Link> · {onDate(t.startDate)}
                          </p>
                        ))}
                      <h2>Recent notices</h2>
                      {data.notifications.slice(0, 8).map((n) => (
                        <article className="trade-card" key={n.id}>
                          <p>{n.title}</p>
                          <small>{date(n.createdAt)}</small>
                          {!n.readAt && (
                            <ActionButton
                              action={async () => {
                                await api('trade/notification-read', { projectId, id: n.id });
                                await refresh();
                              }}
                            >
                              Mark read
                            </ActionButton>
                          )}
                        </article>
                      ))}
                    </>
                  )}
                  {active === 'schedule' && (
                    <>
                      <h2>Your schedule</h2>
                      <p>
                        Confirm your dates or send a conflict to Cedar Winds. Schedule changes
                        require project manager review.
                      </p>
                      <div className="trade-grid">
                        {data.schedule.map((t) => (
                          <ScheduleCard
                            key={t.id}
                            task={t}
                            projectId={projectId}
                            refresh={refresh}
                          />
                        ))}
                      </div>
                      {!data.schedule.length && (
                        <p>No work has been assigned or released to you.</p>
                      )}
                    </>
                  )}
                  {active === 'work' && (
                    <>
                      <h2>Issued work & purchase orders</h2>
                      <p>
                        These documents show your agreed scope and pricing. Acknowledgement records
                        receipt.
                      </p>
                      {data.work.map((w) => (
                        <article className="trade-card trade-document" key={w.id}>
                          <small>
                            {pretty(w.document.type)} · {pretty(w.status)}
                          </small>
                          <h2>
                            {w.document.number} Rev {w.document.revision}
                          </h2>
                          <h3>{w.document.title}</h3>
                          <p>
                            {w.document.project.name} · {w.document.project.address}
                          </p>
                          <p>
                            Issued {date(w.document.issuedAt)} · Expected{' '}
                            {w.document.expectedDate
                              ? date(w.document.expectedDate)
                              : 'To be confirmed'}
                          </p>
                          <p className="preserve-lines">{w.document.scope}</p>
                          <div className="trade-lines">
                            {w.document.lines.map((l, n) => (
                              <div key={n}>
                                <strong>{l.description}</strong>
                                <span>
                                  {l.quantity} {l.unit} × {dollars(l.unitPrice)}
                                </span>
                                <b>{dollars(l.amount)}</b>
                              </div>
                            ))}
                          </div>
                          <p>
                            Subtotal {dollars(w.document.subtotal)} · Tax {dollars(w.document.tax)}
                          </p>
                          <h3>Total {dollars(w.document.total)}</h3>
                          <p className="preserve-lines">{w.document.terms}</p>
                          <p className="preserve-lines">{w.document.notes}</p>
                          <FileLinks files={w.attachments} />
                          {w.acknowledgement ? (
                            <p className="trade-success">
                              Acknowledged by {w.acknowledgement.typedName} on{' '}
                              {date(w.acknowledgement.createdAt)}
                            </p>
                          ) : (
                            ['ISSUED', 'PARTIALLY_FULFILLED', 'FULFILLED'].includes(w.status) && (
                              <Acknowledge
                                projectId={projectId}
                                id={w.id}
                                kind="work"
                                refresh={refresh}
                              />
                            )
                          )}
                          <button className="button no-print" onClick={() => window.print()}>
                            Print
                          </button>
                        </article>
                      ))}
                      {!data.work.length && <p>No issued work is available.</p>}
                    </>
                  )}
                  {active === 'documents' && (
                    <>
                      <h2>Documents & drawings</h2>
                      <p>Check the revision label and upload date before starting work.</p>
                      <div className="trade-grid">
                        {data.files.map((f) => (
                          <article className="trade-card" key={f.id}>
                            <h3>
                              <a href={`/api/files/${f.id}`} target="_blank" rel="noreferrer">
                                {f.originalFilename}
                              </a>
                            </h3>
                            <p>
                              {f.revisionLabel || 'No revision label'} · {date(f.uploadedAt)}
                            </p>
                            <p>{f.description || f.caption}</p>
                            <small>{pretty(f.category)}</small>
                          </article>
                        ))}
                      </div>
                      {!data.files.length && <p>No documents have been shared with you.</p>}
                    </>
                  )}
                  {active === 'instructions' && (
                    <>
                      <h2>Site instructions</h2>
                      <p>
                        Instructions direct site work. Discuss any cost impact with Cedar Winds
                        before proceeding with additional work.
                      </p>
                      {data.instructions.map((i) => (
                        <article className="trade-card" key={i.id}>
                          <small>{pretty(i.status)}</small>
                          <h2>
                            {i.document.number}: {i.document.title}
                          </h2>
                          <p className="preserve-lines">{i.document.description}</p>
                          <FileLinks
                            files={i.document.attachments.map((f) => ({
                              id: f.id,
                              originalFilename: f.name,
                            }))}
                          />
                          {i.acknowledgement ? (
                            <p className="trade-success">
                              Acknowledged {date(i.acknowledgement.createdAt)}
                            </p>
                          ) : (
                            i.status === 'ISSUED' && (
                              <Acknowledge
                                projectId={projectId}
                                id={i.id}
                                kind="instruction"
                                refresh={refresh}
                              />
                            )
                          )}
                          <Link href={`${base}/messages`}>Discuss this instruction</Link>
                        </article>
                      ))}
                    </>
                  )}
                  {active === 'deficiencies' && (
                    <>
                      <h2>Items to complete</h2>
                      {data.deficiencies.map((d) => (
                        <DeficiencyCard
                          key={d.id}
                          item={d}
                          projectId={projectId}
                          refresh={refresh}
                        />
                      ))}
                    </>
                  )}
                  {active === 'uploads' && (
                    <>
                      <h2>Send a photo or document</h2>
                      <TradeUpload
                        projectId={projectId}
                        refresh={refresh}
                        contexts={recordChoices(data)}
                      />
                      <h2>Your submissions</h2>
                      <FileLinks files={data.files.filter((f) => f.origin === 'TRADE_UPLOAD')} />
                    </>
                  )}
                  {active === 'messages' && (
                    <TradeMessages
                      projectId={projectId}
                      contexts={recordChoices(data)}
                      files={data.files}
                    />
                  )}
                </>
              )
            )}
          </main>
        </>
      )}
    </div>
  );
}
function Acknowledge({
  projectId,
  id,
  kind,
  refresh,
}: {
  projectId: string;
  id: string;
  kind: 'work' | 'instruction';
  refresh: () => unknown;
}) {
  const [name, setName] = useState('');
  const [agree, setAgree] = useState(false);
  return (
    <div className="trade-form no-print">
      <p>
        I acknowledge receipt of this {kind === 'work' ? 'purchasing revision' : 'instruction'} and
        the shared documents shown above.
      </p>
      <label>
        Your full name
        <input value={name} onChange={(e) => setName(e.target.value)} />
      </label>
      <label>
        <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} /> I
        have reviewed this document
      </label>
      <ActionButton
        disabled={!agree || name.trim().length < 2}
        action={async () => {
          await api('trade/acknowledge', { projectId, id, kind, typedName: name });
          await refresh();
        }}
      >
        Acknowledge receipt
      </ActionButton>
    </div>
  );
}
function ScheduleCard({
  task,
  projectId,
  refresh,
}: {
  task: Data['schedule'][number];
  projectId: string;
  refresh: () => unknown;
}) {
  const [response, setResponse] = useState('CONFIRMED');
  const [comment, setComment] = useState('');
  const [requestId, setRequestId] = useState(() => crypto.randomUUID());
  return (
    <article className="trade-card">
      <h3>{task.title}</h3>
      <p>
        {onDate(task.startDate)} — {onDate(task.endDate)}
      </p>
      <p>
        {pretty(task.status)}
        {task.milestone ? ' · Milestone' : ''}
      </p>
      <p>{task.description}</p>
      <label>
        Schedule response
        <select value={response} onChange={(e) => setResponse(e.target.value)}>
          <option value="CONFIRMED">Confirm availability</option>
          <option value="CONFLICT">Report conflict</option>
          <option value="QUESTION">Ask a question</option>
        </select>
      </label>
      <label>
        Comment
        <textarea value={comment} onChange={(e) => setComment(e.target.value)} />
      </label>
      <ActionButton
        action={async () => {
          await api('trade/schedule-response', {
            projectId,
            taskId: task.id,
            requestId,
            response,
            comment,
          });
          setRequestId(crypto.randomUUID());
          await refresh();
        }}
      >
        Send schedule response
      </ActionButton>
      {task.responses.map((r) => (
        <p key={r.id}>
          {pretty(r.response)} · {r.comment} {r.resolvedAt && `— Cedar Winds: ${r.resolution}`}
        </p>
      ))}
    </article>
  );
}
function DeficiencyCard({
  item: d,
  projectId,
  refresh,
}: {
  item: Data['deficiencies'][number];
  projectId: string;
  refresh: () => unknown;
}) {
  const [comment, setComment] = useState('');
  return (
    <article className="trade-card">
      <small>
        {d.number} · {pretty(d.priority)} · {pretty(d.status)}
      </small>
      <h3>{d.title}</h3>
      <p>
        {d.location} · Due {onDate(d.dueDate)}
      </p>
      <p className="preserve-lines">{d.description}</p>
      <FileLinks files={d.attachments} />
      {d.updates.map((u, n) => (
        <p key={n}>
          {pretty(u.status)}: {u.comment}
        </p>
      ))}
      {['ASSIGNED', 'IN_PROGRESS', 'REOPENED'].includes(d.status) && (
        <>
          <TradeUpload projectId={projectId} deficiencyId={d.id} refresh={refresh} />
          <label>
            Completion / progress comment
            <textarea value={comment} onChange={(e) => setComment(e.target.value)} />
          </label>
          {['start', 'ready'].map((action) => (
            <ActionButton
              key={action}
              disabled={!comment.trim()}
              action={async () => {
                await api('trade/deficiency-action', {
                  projectId,
                  id: d.id,
                  expectedVersion: d.version,
                  action,
                  comment,
                });
                await refresh();
              }}
            >
              {action === 'start' ? 'Mark in progress' : 'Ready for review'}
            </ActionButton>
          ))}
        </>
      )}
      {d.status === 'READY_FOR_REVIEW' && <p>Cedar Winds will verify your completed work.</p>}
    </article>
  );
}
export function TradeUpload({
  projectId,
  deficiencyId,
  refresh,
  contexts = [],
}: {
  projectId: string;
  deficiencyId?: string;
  refresh: () => unknown;
  contexts?: ContextChoice[];
}) {
  const [file, setFile] = useState<File | null>(null);
  const [related, setRelated] = useState('');
  const [caption, setCaption] = useState('');
  return (
    <div className="trade-form">
      {contexts.length > 0 && (
        <ContextSelect choices={contexts} value={related} onChange={setRelated} />
      )}
      <label>
        {deficiencyId ? 'Completion photo or PDF' : 'Photo or PDF'}
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp,application/pdf"
          onChange={(e) => setFile(e.target.files?.[0] || null)}
        />
      </label>
      <label>
        Caption
        <input value={caption} onChange={(e) => setCaption(e.target.value)} />
      </label>
      <ActionButton
        disabled={!file}
        action={async () => {
          if (!navigator.onLine)
            throw new Error('Internet connection required. Nothing has been submitted.');
          const form = new FormData();
          form.set('projectId', projectId);
          form.set('caption', caption);
          if (deficiencyId) form.set('deficiencyId', deficiencyId);
          const context = contexts.find((c) => c.id === related);
          if (context) form.set(context.field, context.id);
          form.set('file', file!);
          const r = await fetch('/api/trade/upload', { method: 'POST', body: form });
          const result = await r.json();
          if (!r.ok) throw new Error(result.error || 'Upload failed. Please retry.');
          setFile(null);
          await refresh();
        }}
      >
        Upload
      </ActionButton>
      <small>
        JPEG, PNG, WebP or PDF. An upload is confirmed only after the server accepts it.
      </small>
    </div>
  );
}
export function TradeMessages({
  projectId,
  internal = false,
  contacts = [],
  contexts = [],
  files = [],
}: {
  projectId: string;
  internal?: boolean;
  contacts?: { id: string; firstName: string; lastName: string }[];
  contexts?: ContextChoice[];
  files?: { id: string; originalFilename: string }[];
}) {
  const prefix = internal ? 'trade-management' : 'trade';
  const { data, error, refresh } = useApi<{
    conversations: Wire<Awaited<ReturnType<typeof tradeConversations>>>;
  }>(`${prefix}/messages?projectId=${projectId}`);
  const [thread, setThread] = useState('');
  const [contact, setContact] = useState(contacts[0]?.id || '');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [related, setRelated] = useState('');
  const [attachmentIds, setAttachmentIds] = useState<string[]>([]);
  return (
    <section>
      <h2>Messages</h2>
      <ErrorBox message={error} />
      {data?.conversations.map((c) => (
        <article className="trade-card" key={c.id}>
          <h3>
            {c.subject} {c.unread && <small>Unread</small>}
          </h3>
          {c.messages.map((m) => (
            <div key={m.id}>
              <strong>
                {m.author.firstName} {m.author.lastName}
              </strong>
              <small> · {date(m.createdAt)}</small>
              <p className="preserve-lines">{m.body}</p>
              {m.attachmentIds.map((id) => (
                <p key={id}>
                  <a href={`/api/files/${id}`}>Attachment</a>
                </p>
              ))}
            </div>
          ))}
          <button
            className="button"
            onClick={() => {
              setThread(c.id);
              setSubject(c.subject);
            }}
          >
            Reply to {c.subject}
          </button>
          <ActionButton
            action={async () => {
              await api(`${prefix}/read`, { projectId, id: c.id });
              await refresh();
            }}
          >
            Mark read
          </ActionButton>
        </article>
      ))}
      <div className="trade-card trade-form">
        <h3>{thread ? 'Reply' : 'New conversation'}</h3>
        {thread && (
          <button
            className="button"
            onClick={() => {
              setThread('');
              setSubject('');
            }}
          >
            Start a new conversation
          </button>
        )}
        {internal && !thread && (
          <label>
            Trade recipient
            <select
              aria-label="Trade recipient"
              value={contact}
              onChange={(e) => setContact(e.target.value)}
            >
              <option value="">Choose trade</option>
              {contacts.map((c) => (
                <option value={c.id} key={c.id}>
                  {c.firstName} {c.lastName}
                </option>
              ))}
            </select>
          </label>
        )}
        {!thread && contexts.length > 0 && (
          <ContextSelect choices={contexts} value={related} onChange={setRelated} />
        )}
        <label>
          Subject
          <input value={subject} disabled={!!thread} onChange={(e) => setSubject(e.target.value)} />
        </label>
        <label>
          Message
          <textarea value={body} onChange={(e) => setBody(e.target.value)} />
        </label>
        {files.length > 0 && (
          <fieldset>
            <legend>Shared attachments</legend>
            {files.map((f) => (
              <label key={f.id}>
                <input
                  type="checkbox"
                  checked={attachmentIds.includes(f.id)}
                  onChange={(e) =>
                    setAttachmentIds(
                      e.target.checked
                        ? [...attachmentIds, f.id]
                        : attachmentIds.filter((id) => id !== f.id),
                    )
                  }
                />
                {f.originalFilename}
              </label>
            ))}
          </fieldset>
        )}
        <ActionButton
          disabled={!subject.trim() || !body.trim()}
          action={async () => {
            const context = contexts.find((c) => c.id === related);
            await api(`${prefix}/messages`, {
              projectId,
              conversationId: thread || null,
              contactId: internal ? contact : null,
              subject,
              body,
              attachmentIds,
              ...(!thread && context ? { [context.field]: context.id } : {}),
            });
            setBody('');
            setAttachmentIds([]);
            await refresh();
          }}
        >
          Send message
        </ActionButton>
      </div>
    </section>
  );
}
