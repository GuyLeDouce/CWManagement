'use client';
import { WordingPicker } from './templates';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { api, useApi, date as formatDate } from '@/lib/client';
import { Brand } from './brand';
import { ActionButton, ErrorBox, Loading, Empty } from './ui';
import type { ClientProject } from '@/lib/client-projections';
import type { ClientTaxDisplayMode, Prisma } from '@prisma/client';

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
  'proposals',
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
  preview = false,
  contactId,
}: {
  projectId?: string;
  section?: string;
  preview?: boolean;
  contactId?: string;
}) {
  const router = useRouter();
  const [changingClient, startClientChange] = useTransition();
  const { data, error, refresh } = useApi<
    PortalData & { preview?: { clients: { id: string; name: string }[]; contactId: string | null } }
  >(
    projectId
      ? `${preview ? 'client-management/preview' : 'client/project'}?projectId=${encodeURIComponent(projectId)}${preview && contactId ? '&contactId=' + encodeURIComponent(contactId) : ''}`
      : '',
  );
  const projects = useApi<{
    projects: { id: string; name: string; number: string; stage: string | null }[];
  }>(preview ? '' : 'client/projects');
  const base = preview ? `/client-preview/projects/${projectId}` : `/client/projects/${projectId}`;
  const suffix = preview && contactId ? `?contactId=${encodeURIComponent(contactId)}` : '';
  const destinations: Record<string, string> = {
    home: 'clients',
    schedule: 'schedule',
    proposals: 'proposals',
    selections: 'selections',
    'change-orders': 'change-orders',
    updates: 'daily-logs',
    photos: 'photos',
    documents: 'files',
    messages: 'messages',
  };
  return (
    <div className="client-shell">
      {preview && (
        <aside className="client-preview-banner" aria-label="Client View Preview">
          <div>
            <strong>CLIENT VIEW PREVIEW</strong>
            <p>You are viewing this project as a client would see it.</p>
            <small>Preview only - client actions are disabled.</small>
          </div>
          <label>
            Viewing as
            <select
              disabled={changingClient}
              value={contactId || ''}
              onChange={(e) =>
                startClientChange(() =>
                  router.push(
                    `${base}/${section}${e.target.value ? '?contactId=' + encodeURIComponent(e.target.value) : ''}`,
                  ),
                )
              }
            >
              <option value="">General Client View</option>
              {data?.preview?.clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <div>
            <Link href={`/projects/${projectId}`} target="_blank" rel="noopener noreferrer">
              Return to Internal View
            </Link>
            <br />
            <Link
              href={`/projects/${projectId}/${destinations[section] || 'clients'}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              Manage Client Visibility
            </Link>
          </div>
          {!contactId && (
            <small>
              General view excludes individually addressed documents and discussions. Choose a
              client to preview their content.
            </small>
          )}
        </aside>
      )}
      <header className="client-header">
        <Link href={preview ? base + suffix : '/client'}>
          <Brand />
        </Link>
        <span>Your project, together.</span>
        <Link
          href={preview ? '/how-to/clients/client-vision' : '/client/help'}
          target={preview ? '_blank' : undefined}
          rel="noopener noreferrer"
        >
          Help
        </Link>
        {!preview && (
          <ActionButton
            action={async () => {
              await api('auth/logout', {});
              router.push('/login');
              router.refresh();
            }}
          >
            Sign out
          </ActionButton>
        )}
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
          <nav
            className="client-nav"
            aria-label="Client project navigation"
            aria-busy={changingClient}
            inert={changingClient}
          >
            {sections.map((s) => (
              <Link
                key={s}
                className={s === section ? 'active' : ''}
                href={`${base}/${s === 'home' ? '' : s}${suffix}`}
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
              data &&
              !error && (
                <PortalContent
                  data={data}
                  section={section}
                  refresh={refresh}
                  preview={preview}
                  base={base}
                  suffix={suffix}
                />
              )
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
  base,
  suffix = '',
}: {
  base?: string;
  suffix?: string;
  data: PortalData;
  section: string;
  refresh: () => void;
  preview?: boolean;
}) {
  const projectId = data.project.id;
  const path = base || `/client/projects/${projectId}`;
  const fileUrl = (id: string) =>
    `/api/files/${id}${preview ? '?clientPreview=' + encodeURIComponent(projectId) : ''}`;
  const pending = data.selections.filter((s) => s.status === 'PUBLISHED');
  const changes = data.changeOrders.filter((c) => c.status === 'ISSUED');
  return (
    <>
      <div className="client-heading">
        <span className="eyebrow">
          {data.project.number} · {data.project.stage || 'YOUR PROJECT'}
        </span>
        <h1>{data.project.name}</h1>
        <p>{data.project.address}</p>
        {data.managers.map((manager) => (
          <p key={manager.name}>Your Cedar Winds contact: {manager.name}</p>
        ))}
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
                  <Link key={s.id} href={`${path}/selections${suffix}`}>
                    {s.title}
                    <span>{deadline(s.deadline)}</span>
                  </Link>
                ))}
                {changes.map((c) => (
                  <Link key={c.id} href={`${path}/change-orders${suffix}`}>
                    {c.document.number} — {c.document.title}
                    <span>Approval requested</span>
                  </Link>
                ))}
              </>
            )}
            <Link href={`${path}/messages${suffix}`}>Messages from your team →</Link>
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
              <h2>Completed milestones</h2>
              {data.schedule
                .filter((t) => t.milestone && t.status === 'COMPLETE')
                .slice(-3)
                .map((t) => (
                  <p key={t.id}>
                    <strong>{t.clientTitle}</strong>
                    <br />
                    {date(t.endDate)}
                  </p>
                ))}
              {!data.schedule.some((t) => t.milestone && t.status === 'COMPLETE') && (
                <p>Completed milestones will appear here as your project progresses.</p>
              )}
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
          {data.financialSummary && (
            <section className="client-card client-contract">
              <h2>Your contract</h2>
              <div className="client-grid">
                <div>
                  <h3>Original contract</h3>
                  <ClientPrice value={data.financialSummary.original} />
                </div>
                <div>
                  <h3>Approved changes</h3>
                  <ClientPrice value={data.financialSummary.approvedChanges} />
                </div>
                <div>
                  <h3>Current contract</h3>
                  <ClientPrice value={data.financialSummary.current} />
                </div>
              </div>
            </section>
          )}
          <ClientInbox
            data={data}
            preview={preview}
            path={path}
            suffix={suffix}
            refresh={refresh}
          />
          <div className="client-grid">
            {data.files
              .filter(
                (f) =>
                  f.kind === 'PHOTO' &&
                  ['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(f.mimeType),
              )
              .slice(0, 3)
              .map((f) => (
                <a className="client-card" href={fileUrl(f.id)} key={f.id}>
                  <img
                    className="client-photo"
                    src={fileUrl(f.id)}
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
                  href={fileUrl(f.id)}
                  target="_blank"
                  rel="noreferrer"
                >
                  {section === 'photos' &&
                    ['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(f.mimeType) && (
                      <img
                        src={fileUrl(f.id)}
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
      {section === 'proposals' && (
        <>
          <h2>Your proposals</h2>
          {data.proposals.length === 0 && <p>No proposals have been shared with this view yet.</p>}
          {data.proposals.map((p) => (
            <article className="client-card" key={p.id}>
              <small>
                {p.number} | Rev {p.revision} | {p.status}
              </small>
              <h2>{p.title}</h2>
              <p>{p.introduction}</p>
              <p className="preserve-text">{p.scope}</p>
              {p.sections.map((section, i) => (
                <section key={i}>
                  <h3>{section.name}</h3>
                  <p>{section.description}</p>
                  <ul>
                    {section.lines.map((l, j) => (
                      <li key={j}>
                        {l.description} - {l.quantity} {l.unit}
                        {data.presentation.taxDisplayMode === 'SHOW_TAX_BREAKDOWN' && (
                          <> - {dollars(l.price)} before tax</>
                        )}
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
              <ClientPrice value={p.price} />
              <h3>Assumptions and exclusions</h3>
              <p className="preserve-text">{p.assumptions}</p>
              <p className="preserve-text">{p.exclusions}</p>
              <h3>Terms</h3>
              <p className="preserve-text">{p.terms}</p>
              {p.acceptedAt && <p>Accepted {date(p.acceptedAt)}</p>}
            </article>
          ))}
        </>
      )}
      {section === 'selections' && (
        <>
          <h2>Your selections</h2>
          {data.specifications.map((s) => (
            <section className="client-card" key={s.id}>
              <small>Specification · {s.category}</small>
              <h3>{s.title}</h3>
              <p>{s.description}</p>
            </section>
          ))}
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
              taxMode={c.document.taxDisplayMode}
            />
          ))}
        </>
      )}
      {section === 'messages' && (
        <ProjectMessages
          projectId={projectId}
          client
          preview={preview}
          previewThreads={data.conversations}
        />
      )}
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
export function ClientPrice({
  value,
}: {
  value: { total: string; subtotal?: string; tax?: string };
}) {
  return (
    <div className="client-price">
      {value.subtotal !== undefined && (
        <>
          <p>Subtotal: {dollars(value.subtotal)}</p>
          <p>HST: {dollars(value.tax || '0')}</p>
        </>
      )}
      <strong>Total: {dollars(value.total)}</strong>
    </div>
  );
}
function ClientInbox({
  data,
  preview,
  path,
  suffix,
  refresh,
}: {
  data: PortalData;
  preview: boolean;
  path: string;
  suffix: string;
  refresh: () => void;
}) {
  const notices = data.notifications.filter((n) => !n.readAt);
  const messages = data.conversations.filter((c) => c.unread);
  return (
    <section className="client-card">
      <h2>From your team</h2>
      {messages.map((c) => (
        <p key={c.id}>
          <Link href={`${path}/messages${suffix}`}>Unread message: {c.subject}</Link>
        </p>
      ))}
      {notices.map((n) => (
        <div className="client-message" key={n.id}>
          <strong>{n.title}</strong>
          <p>{n.message}</p>
          <ActionButton
            disabled={preview}
            action={async () => {
              if (preview) return;
              await api('client/notification-read', { projectId: data.project.id, id: n.id });
              refresh();
            }}
          >
            {preview ? 'Mark read - Preview only' : 'Mark read'}
          </ActionButton>
        </div>
      ))}
      {!notices.length && !messages.length && <p>No unread notices.</p>}
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
  const fileUrl = (id: string) =>
    `/api/files/${id}${preview ? '?clientPreview=' + encodeURIComponent(projectId) : ''}`;
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
                href={fileUrl(id)}
                target="_blank"
                rel="noreferrer"
                key={id}
              >
                {['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(
                  files.find((f) => f.id === id)?.mimeType || '',
                ) && (
                  <img
                    className="client-photo"
                    src={fileUrl(id)}
                    alt={files.find((f) => f.id === id)?.caption || o.name}
                  />
                )}
                {files.find((f) => f.id === id)?.originalFilename || 'Specification'}
              </a>
            ))}
          </label>
        ))}
      </div>
      {s.status === 'PUBLISHED' && preview && (
        <button disabled>Confirm selection - Preview only</button>
      )}
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
  taxMode,
}: {
  taxMode: ClientTaxDisplayMode;
  change: PortalData['changeOrders'][number];
  projectId: string;
  refresh: () => void;
  preview: boolean;
}) {
  const [name, setName] = useState(''),
    [ack, setAck] = useState(false),
    [printing, setPrinting] = useState(false);
  const d = c.document;
  const fileUrl = (id: string) =>
    `/api/files/${id}${preview ? '?clientPreview=' + encodeURIComponent(projectId) : ''}`;
  async function decide(action: 'APPROVE' | 'DECLINE') {
    if (preview) return;
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
            {taxMode === 'SHOW_TAX_BREAKDOWN' && <th>Client price before tax</th>}
          </tr>
        </thead>
        <tbody>
          {d.lines.map((l, i) => (
            <tr key={i}>
              <td>{l.description}</td>
              <td>
                {l.quantity} {l.unit}
              </td>
              {taxMode === 'SHOW_TAX_BREAKDOWN' && <td>{dollars(l.amount)}</td>}
            </tr>
          ))}
        </tbody>
      </table>
      <ClientPrice
        value={
          taxMode === 'SHOW_TAX_BREAKDOWN'
            ? { subtotal: d.subtotal, tax: d.tax, total: d.total }
            : { total: d.total }
        }
      />
      <p>
        Schedule impact: {d.scheduleDays} days · Issued {date(d.issuedAt)}
      </p>
      <p className="preserve-text">{d.terms}</p>
      {c.attachmentIds.map((id) => (
        <a className="client-file-link" href={fileUrl(id)} key={id}>
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
      {c.status === 'ISSUED' && preview && (
        <div className="button-row">
          <button disabled>Approve - Preview only</button>
          <button disabled>Decline - Preview only</button>
        </div>
      )}
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
  audience?: string;
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
  preview = false,
  previewThreads = [],
}: {
  projectId: string;
  client?: boolean;
  preview?: boolean;
  previewThreads?: Thread[];
}) {
  const prefix = client ? 'client' : 'client-management';
  const { data, error, refresh } = useApi<{ conversations: Thread[] }>(
    preview ? '' : `${prefix}/messages?projectId=${projectId}`,
  );
  const [subject, setSubject] = useState(''),
    [body, setBody] = useState(''),
    [thread, setThread] = useState(''),
    [audience, setAudience] = useState('CLIENT');
  return (
    <>
      <h2>Messages</h2>
      <ErrorBox message={error} />
      {(preview ? previewThreads : data?.conversations)?.map((t) => (
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
            disabled={preview}
            action={async () => {
              if (preview) return;
              setThread(t.id);
              setSubject(t.subject);
              await api(`${prefix}/read`, { projectId, id: t.id });
              refresh();
            }}
          >
            {preview ? 'Reply - Preview only' : 'Reply / mark read'}
          </ActionButton>
        </article>
      ))}
      {preview ? (
        <p>Client would be able to reply here.</p>
      ) : (
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
          {!client && (
            <WordingPicker
              kind="COMMUNICATION"
              onChoose={(content) => setBody(content.communication)}
            />
          )}
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
      )}
    </>
  );
}
