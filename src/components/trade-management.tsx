'use client';
import { useState } from 'react';
import Link from 'next/link';
import { api, useApi, date, pretty } from '@/lib/client';
import { ActionButton, ErrorBox, Loading } from './ui';
import { TradeMessages, Wire } from './trade-portal';
import type { internalTrades } from '@/lib/trade-api';
type Data = Wire<Awaited<ReturnType<typeof internalTrades>>>;
export function TradeManagement({ projectId }: { projectId: string }) {
  const { data, error, refresh } = useApi<Data>(`trade-management/project?projectId=${projectId}`);
  const [contact, setContact] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [notes, setNotes] = useState('');
  const [kind, setKind] = useState('instruction');
  const [due, setDue] = useState('');
  const [location, setLocation] = useState('');
  const [attachments, setAttachments] = useState<string[]>([]);
  const [editing, setEditing] = useState<Data['instructions'][number] | null>(null);
  const [replaces, setReplaces] = useState('');
  const post = async (path: string, body: object) => {
    await api(`trade-management/${path}`, { projectId, ...body });
    await refresh();
  };
  if (!data && !error) return <Loading />;
  return (
    <section>
      <h2>Trades</h2>
      <p>
        Project association and portal access are separate. Grant access only to the intended
        Contact.
      </p>
      <ErrorBox message={error} />
      {data && (
        <>
          <p>
            <Link href={`/projects/${projectId}/purchase-orders`}>
              Manage Purchase Orders / Work Orders
            </Link>{' '}
            ·{' '}
            <Link href={`/projects/${projectId}/files`}>Upload and classify project documents</Link>
          </p>
          <div className="trade-grid">
            {data.contacts.map((c) => {
              const grant = c.tradeAccess[0];
              return (
                <article className="trade-card" key={c.id}>
                  <h3>
                    {c.firstName} {c.lastName}
                  </h3>
                  <p>{c.company?.name}</p>
                  <p>
                    {grant?.active ? 'Portal active' : grant ? 'Access revoked' : 'Not invited'}
                  </p>
                  {grant && (
                    <small>
                      Invited {date(grant.invitedAt)} ·{' '}
                      {grant.acceptedAt
                        ? `Signed in ${date(grant.acceptedAt)}`
                        : 'Awaiting sign in'}
                    </small>
                  )}
                  <ActionButton
                    action={() =>
                      post('access', {
                        contactId: c.id,
                        role: c.types.includes('SUBTRADE') ? 'SUBTRADE' : 'VENDOR',
                        action: 'invite',
                      })
                    }
                  >
                    {grant?.active
                      ? 'Resend invitation'
                      : grant
                        ? 'Reactivate access'
                        : 'Invite to portal'}
                  </ActionButton>
                  {grant?.active && (
                    <ActionButton
                      action={() =>
                        post('access', {
                          contactId: c.id,
                          role: c.types.includes('SUBTRADE') ? 'SUBTRADE' : 'VENDOR',
                          action: 'revoke',
                        })
                      }
                    >
                      Revoke access
                    </ActionButton>
                  )}
                </article>
              );
            })}
          </div>
          {!data.contacts.length && (
            <p>
              Add an existing subcontractor or vendor Contact to this project in Settings first.
            </p>
          )}
          <h3>Issued work / acknowledgement queue</h3>
          {data.work.map((w) => (
            <p key={w.id}>
              {w.document.number} Rev {w.revision} · {pretty(w.status)} ·{' '}
              {w.acknowledgedAt
                ? `Acknowledged ${date(w.acknowledgedAt)}`
                : 'Awaiting acknowledgement'}
            </p>
          ))}
          <div className="trade-card trade-form">
            <h3>
              {editing
                ? 'Edit draft instruction'
                : replaces
                  ? 'Replacement instruction'
                  : 'Create site instruction or deficiency'}
            </h3>
            <label>
              Record type
              <select
                aria-label="Record type"
                value={kind}
                disabled={!!editing || !!replaces}
                onChange={(e) => setKind(e.target.value)}
              >
                <option value="instruction">Site instruction</option>
                <option value="deficiency">Deficiency</option>
              </select>
            </label>
            <label>
              Assigned trade
              <select
                aria-label="Assigned trade"
                value={contact}
                onChange={(e) => setContact(e.target.value)}
              >
                <option value="">Choose trade</option>
                {data.contacts.map((c) => (
                  <option value={c.id} key={c.id}>
                    {c.firstName} {c.lastName} — {c.company?.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Title
              <input value={title} onChange={(e) => setTitle(e.target.value)} />
            </label>
            <label>
              Trade-visible description
              <textarea value={description} onChange={(e) => setDescription(e.target.value)} />
            </label>
            <label>
              Internal notes (never shared)
              <textarea value={notes} onChange={(e) => setNotes(e.target.value)} />
            </label>
            {kind === 'deficiency' && (
              <>
                <label>
                  Location
                  <input value={location} onChange={(e) => setLocation(e.target.value)} />
                </label>
                <label>
                  Due date
                  <input type="date" value={due} onChange={(e) => setDue(e.target.value)} />
                </label>
              </>
            )}
            <fieldset>
              <legend>Trade-visible attachments</legend>
              {data.files.map((f) => (
                <label key={f.id}>
                  <input
                    type="checkbox"
                    checked={attachments.includes(f.id)}
                    onChange={(e) =>
                      setAttachments(
                        e.target.checked
                          ? [...attachments, f.id]
                          : attachments.filter((id) => id !== f.id),
                      )
                    }
                  />
                  {f.originalFilename}
                </label>
              ))}
            </fieldset>
            <ActionButton
              disabled={!contact || !title || !description}
              action={async () => {
                await post(kind, {
                  title,
                  description,
                  internalNotes: notes,
                  attachmentIds: attachments,
                  ...(kind === 'instruction'
                    ? {
                        id: editing?.id,
                        expectedVersion: editing?.version,
                        contactIds: [contact],
                        replacesId: replaces || null,
                      }
                    : { assignedContactId: contact, dueDate: due, location }),
                });
                setTitle('');
                setDescription('');
                setNotes('');
                setAttachments([]);
                setEditing(null);
                setReplaces('');
              }}
            >
              {editing ? 'Save draft' : 'Create ' + kind}
            </ActionButton>
          </div>
          <h3>Site instructions</h3>
          {data.instructions.map((i) => (
            <article className="trade-card" key={i.id}>
              <h4>
                {i.number}: {i.title}
              </h4>
              <p>
                {pretty(i.status)} · {i.acknowledgements.length}/{i.recipients.length}{' '}
                acknowledgements
              </p>
              <p>{i.description}</p>
              {i.status === 'DRAFT' ? (
                <>
                  <button
                    className="button"
                    onClick={() => {
                      setEditing(i);
                      setKind('instruction');
                      setTitle(i.title);
                      setDescription(i.description);
                      setContact(i.recipients[0]?.contactId || '');
                      setNotes(i.internalNotes || '');
                      setAttachments(i.attachmentIds);
                    }}
                  >
                    Edit draft
                  </button>
                  <ActionButton
                    action={() =>
                      post('instruction-action', {
                        id: i.id,
                        expectedVersion: i.version,
                        action: 'issue',
                      })
                    }
                  >
                    Issue instruction
                  </ActionButton>
                </>
              ) : (
                <button
                  className="button"
                  onClick={() => {
                    setEditing(null);
                    setReplaces(i.id);
                    setKind('instruction');
                    setTitle(i.title);
                    setDescription(i.description);
                    setContact(i.recipients[0]?.contactId || '');
                    setAttachments(i.attachmentIds);
                  }}
                >
                  Create replacement
                </button>
              )}
              {['ISSUED', 'ACKNOWLEDGED'].includes(i.status) && (
                <ActionButton
                  action={() =>
                    post('instruction-action', {
                      id: i.id,
                      expectedVersion: i.version,
                      action: 'close',
                    })
                  }
                >
                  Close instruction
                </ActionButton>
              )}
              {['DRAFT', 'ISSUED', 'ACKNOWLEDGED'].includes(i.status) && (
                <ActionButton
                  action={() =>
                    post('instruction-action', {
                      id: i.id,
                      expectedVersion: i.version,
                      action: 'cancel',
                    })
                  }
                >
                  Cancel instruction
                </ActionButton>
              )}
            </article>
          ))}
          <h3>Deficiencies & verification</h3>
          {data.deficiencies.map((d) => (
            <InternalDeficiency key={d.id} item={d} post={post} />
          ))}
          <h3>Document sharing</h3>
          <p>TRADE classification alone does not share a file. Select its recipient explicitly.</p>
          {data.files.map((f) => (
            <FileShare key={f.id} file={f} contacts={data.contacts} post={post} />
          ))}
          <h3>Schedule release & responses</h3>
          {data.tasks.map((t) => (
            <TaskRelease key={t.id} task={t} contacts={data.contacts} post={post} />
          ))}
          <TradeMessages projectId={projectId} internal contacts={data.contacts} />
        </>
      )}
    </section>
  );
}
type Post = (path: string, body: object) => Promise<void>;
function InternalDeficiency({ item: d, post }: { item: Data['deficiencies'][number]; post: Post }) {
  const [comment, setComment] = useState('');
  return (
    <article className="trade-card">
      <h4>
        {d.number}: {d.title}
      </h4>
      <p>
        {pretty(d.status)} · {d.location}
      </p>
      <p>{d.description}</p>
      {d.updates.map((u) => (
        <p key={u.id}>
          {pretty(u.status)}: {u.comment}
        </p>
      ))}
      {d.files.map((f) => (
        <p key={f.id}>
          <a href={`/api/files/${f.id}`}>{f.originalFilename}</a>
        </p>
      ))}
      <label>
        Verification / reopening comment
        <textarea value={comment} onChange={(e) => setComment(e.target.value)} />
      </label>
      {(d.status === 'READY_FOR_REVIEW'
        ? ['close', 'reopen']
        : d.status === 'CLOSED'
          ? ['reopen']
          : d.status === 'CANCELLED'
            ? []
            : ['cancel']
      ).map((action) => (
        <ActionButton
          key={action}
          disabled={!comment.trim()}
          action={() =>
            post('deficiency-action', { id: d.id, expectedVersion: d.version, action, comment })
          }
        >
          {action === 'close' ? 'Verify and close' : pretty(action)}
        </ActionButton>
      ))}
    </article>
  );
}
function FileShare({
  file: f,
  contacts,
  post,
}: {
  file: Data['files'][number];
  contacts: Data['contacts'];
  post: Post;
}) {
  const [contact, setContact] = useState('');
  const [revision, setRevision] = useState(f.revisionLabel || '');
  return (
    <article className="trade-card">
      <h4>
        <a href={`/api/files/${f.id}`}>{f.originalFilename}</a>
      </h4>
      <small>{pretty(f.origin)}</small>
      <label>
        Revision label
        <input value={revision} onChange={(e) => setRevision(e.target.value)} />
      </label>
      <label>
        File recipient
        <select
          aria-label="File recipient"
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
      <ActionButton
        disabled={!contact}
        action={() =>
          post('share-file', {
            id: f.id,
            contactId: contact,
            shared: true,
            revisionLabel: revision,
          })
        }
      >
        Share document
      </ActionButton>
      {f.tradeShares.map((s) => (
        <p key={s.contactId}>
          {contacts.find((c) => c.id === s.contactId)?.firstName || 'Trade'} ·{' '}
          {s.lockedAt ? (
            'Retained as evidence'
          ) : (
            <ActionButton
              action={() => post('share-file', { id: f.id, contactId: s.contactId, shared: false })}
            >
              Remove share
            </ActionButton>
          )}
        </p>
      ))}
    </article>
  );
}
function TaskRelease({
  task: t,
  contacts,
  post,
}: {
  task: Data['tasks'][number];
  contacts: Data['contacts'];
  post: Post;
}) {
  const [contact, setContact] = useState('');
  const [title, setTitle] = useState(t.tradeTitle || t.name);
  const [description, setDescription] = useState(t.tradeDescription || '');
  const [resolution, setResolution] = useState('');
  return (
    <article className="trade-card">
      <h4>{t.name}</h4>
      <label>
        Trade schedule title
        <input value={title} onChange={(e) => setTitle(e.target.value)} />
      </label>
      <label>
        Trade schedule description
        <textarea value={description} onChange={(e) => setDescription(e.target.value)} />
      </label>
      <label>
        Schedule recipient
        <select
          aria-label="Schedule recipient"
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
      <ActionButton
        disabled={!contact}
        action={() =>
          post('schedule-release', {
            id: t.id,
            contactId: contact,
            released: true,
            title,
            description,
          })
        }
      >
        Release schedule item
      </ActionButton>
      {t.tradeReleases.map((r) => (
        <ActionButton
          key={r.contactId}
          action={() =>
            post('schedule-release', {
              id: t.id,
              contactId: r.contactId,
              released: false,
              title,
              description,
            })
          }
        >
          Remove release for {contacts.find((c) => c.id === r.contactId)?.firstName}
        </ActionButton>
      ))}
      {t.tradeResponses.map((r) => (
        <div key={r.id}>
          <p>
            {pretty(r.response)} · {r.comment}
          </p>
          {r.resolvedAt ? (
            <p>{r.resolution}</p>
          ) : (
            <>
              <label>
                PM response
                <input value={resolution} onChange={(e) => setResolution(e.target.value)} />
              </label>
              <ActionButton
                disabled={!resolution}
                action={() => post('resolve-schedule', { id: r.id, resolution })}
              >
                Resolve response
              </ActionButton>
            </>
          )}
        </div>
      ))}
    </article>
  );
}
