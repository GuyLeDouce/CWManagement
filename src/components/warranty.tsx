'use client';
import { useState, useRef } from 'react';
import { api, useApi, pretty } from '@/lib/client';
import { ActionButton, ErrorBox } from './ui';
import { ReminderSettings } from './business-reports';
export type ServiceItem = {
  id: string;
  number: string;
  title: string;
  description?: string;
  tradeDescription?: string;
  location: string;
  category?: string;
  status: string;
  version: number;
  dueAt: string | null;
  appointmentAt: string | null;
  clientNotes?: string;
  internalNotes?: string;
  clientContactId?: string | null;
  project?: { name: string };
  updates: { id: string; body: string; createdAt: string; status: string }[];
  files: { id: string; originalFilename: string; mimeType: string }[];
};
export function ServiceRequests({
  items,
  projectId,
  audience,
  preview = false,
  contactId,
  refresh,
}: {
  items: ServiceItem[];
  projectId: string;
  audience: 'client' | 'trade' | 'business';
  preview?: boolean;
  contactId?: string;
  refresh: () => void;
}) {
  const [creating, setCreating] = useState(false),
    [filter, setFilter] = useState('');
  const createForm = useRef<HTMLFormElement>(null);
  const options = useApi<{
    contacts: { role: string; contact: { id: string; firstName: string; lastName: string } }[];
    users: { user: { id: string; firstName: string; lastName: string } }[];
  }>(audience === 'business' ? `business/warranty/options?projectId=${projectId}` : '');
  return (
    <section className="service-workspace">
      <div className="section-heading">
        <div>
          <h2>Warranty & service</h2>
          <p>Report an issue, follow its progress, and confirm completed work.</p>
        </div>
        {audience !== 'trade' && (
          <button className="button" disabled={preview} onClick={() => setCreating(!creating)}>
            {preview ? 'New request — Preview only' : 'New service request'}
          </button>
        )}
      </div>
      <label>
        Find a request
        <input
          placeholder="Search title, number or status"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
      </label>
      {creating && (
        <form ref={createForm} className="panel entity-form" onSubmit={(e) => e.preventDefault()}>
          <h3>Report a service issue</h3>
          <label>
            Title
            <input name="title" required />
          </label>
          <label>
            Description
            <textarea name="description" required />
          </label>
          <label>
            Room / location
            <input name="location" />
          </label>
          {audience === 'business' && (
            <label>
              Reporting client
              <select aria-label="Reporting client" name="clientContactId">
                <option value="">Internal request</option>
                {options.data?.contacts
                  .filter((c) => c.role === 'CLIENT')
                  .map((c) => (
                    <option key={c.contact.id} value={c.contact.id}>
                      {c.contact.firstName} {c.contact.lastName}
                    </option>
                  ))}
              </select>
            </label>
          )}
          <ActionButton
            action={async () => {
              const form = createForm.current;
              if (!form || !form.reportValidity()) return;
              const f = new FormData(form);
              await api(`${audience}/warranty`, {
                projectId,
                title: f.get('title'),
                description: f.get('description'),
                location: f.get('location'),
                ...(audience === 'business'
                  ? { clientContactId: f.get('clientContactId') || null }
                  : {}),
              });
              setCreating(false);
              refresh();
            }}
          >
            Submit request
          </ActionButton>
        </form>
      )}
      {items.length === 0 && (
        <div className="panel">
          <h3>No service requests yet</h3>
          <p>
            {preview
              ? 'Choose a project client to preview their requests.'
              : 'New requests and updates will appear here.'}
          </p>
        </div>
      )}
      {items
        .filter((r) =>
          `${r.number} ${r.title} ${r.status}`.toLowerCase().includes(filter.toLowerCase()),
        )
        .map((r) => (
          <ServiceCard
            key={`${r.id}:${r.version}`}
            r={r}
            audience={audience}
            preview={preview}
            projectId={projectId}
            contactId={contactId}
            refresh={refresh}
            options={options.data || undefined}
          />
        ))}
    </section>
  );
}
function ServiceCard({
  r,
  audience,
  preview,
  projectId,
  contactId,
  refresh,
  options,
}: {
  r: ServiceItem;
  audience: 'client' | 'trade' | 'business';
  preview: boolean;
  projectId: string;
  contactId?: string;
  refresh: () => void;
  options?: {
    contacts: { role: string; contact: { id: string; firstName: string; lastName: string } }[];
    users: { user: { id: string; firstName: string; lastName: string } }[];
  };
}) {
  const [body, setBody] = useState(''),
    [action, setAction] = useState('comment'),
    [visibility, setVisibility] = useState('INTERNAL'),
    [staff, setStaff] = useState(''),
    [trade, setTrade] = useState(''),
    [due, setDue] = useState(''),
    [appointment, setAppointment] = useState(''),
    [scope, setScope] = useState('');
  const actions =
    audience === 'client'
      ? ['comment', ...(r.status === 'READY_FOR_CLIENT' ? ['verify'] : [])]
      : audience === 'trade'
        ? [
            'comment',
            ...(['ASSIGNED', 'SCHEDULED', 'IN_PROGRESS'].includes(r.status)
              ? [
                  'acknowledge',
                  ...(['ASSIGNED', 'SCHEDULED'].includes(r.status) ? ['start'] : []),
                  'ready',
                ]
              : []),
          ]
        : [
            'comment',
            ...((
              {
                SUBMITTED: ['review', 'accept', 'reject'],
                REVIEWING: ['accept', 'reject'],
                ACCEPTED: ['assign', 'schedule', 'complete'],
                ASSIGNED: ['assign', 'schedule', 'start', 'complete'],
                SCHEDULED: ['start', 'complete'],
                IN_PROGRESS: ['ready', 'complete'],
                READY_FOR_REVIEW: ['complete', 'reopen'],
                READY_FOR_CLIENT: r.clientContactId ? ['reopen'] : ['close', 'reopen'],
                CLIENT_VERIFIED: ['close', 'reopen'],
                NOT_WARRANTY: ['close', 'reopen'],
                CLOSED: ['reopen'],
              } as Record<string, string[]>
            )[r.status] || []),
          ];
  return (
    <article className="panel service-card">
      <header>
        <small>
          {r.number} {r.project?.name}
        </small>
        <h3>{r.title}</h3>
        <span className="badge">{pretty(r.status)}</span>
      </header>
      <p>{r.description || r.tradeDescription}</p>
      <p className="muted">
        {r.location}
        {r.dueAt ? ` · Due ${new Date(r.dueAt).toLocaleDateString()}` : ''}
        {r.appointmentAt ? ` · Appointment ${new Date(r.appointmentAt).toLocaleString()}` : ''}
      </p>
      {r.clientNotes && <p>{r.clientNotes}</p>}
      {audience === 'business' && r.internalNotes && <p>Internal: {r.internalNotes}</p>}
      <ul>
        {r.files.map((f) => (
          <li key={f.id}>
            <a
              target="_blank"
              rel="noreferrer"
              href={`/api/files/${f.id}${preview ? `?clientPreview=${projectId}&contactId=${contactId || ''}` : ''}`}
            >
              {f.originalFilename}
            </a>
          </li>
        ))}
      </ul>
      <details>
        <summary>Updates ({r.updates.length})</summary>
        {r.updates.map((u) => (
          <p key={u.id}>
            <small>{new Date(u.createdAt).toLocaleString()}</small>
            <br />
            {u.body}
          </p>
        ))}
      </details>
      <div className="form-grid">
        <label>
          Action
          <select
            aria-label="Action"
            disabled={preview}
            value={action}
            onChange={(e) => setAction(e.target.value)}
          >
            {actions.map((a) => (
              <option key={a} value={a}>
                {pretty(a)}
              </option>
            ))}
          </select>
        </label>
        <label>
          Comment
          <textarea disabled={preview} value={body} onChange={(e) => setBody(e.target.value)} />
        </label>
      </div>
      {audience === 'business' && (
        <details>
          <summary>Assignment, appointment & sharing</summary>
          <div className="form-grid">
            <label>
              Update audience
              <select
                aria-label="Update audience"
                value={visibility}
                onChange={(e) => setVisibility(e.target.value)}
              >
                {['INTERNAL', 'CLIENT', 'TRADE'].map((v) => (
                  <option key={v}>{v}</option>
                ))}
              </select>
            </label>
            <label>
              Staff
              <select aria-label="Staff" value={staff} onChange={(e) => setStaff(e.target.value)}>
                <option value="">Keep current</option>
                {options?.users.map((u) => (
                  <option key={u.user.id} value={u.user.id}>
                    {u.user.firstName} {u.user.lastName}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Trade
              <select aria-label="Trade" value={trade} onChange={(e) => setTrade(e.target.value)}>
                <option value="">Keep current</option>
                {options?.contacts
                  .filter((c) => c.role !== 'CLIENT')
                  .map((c) => (
                    <option key={c.contact.id} value={c.contact.id}>
                      {c.contact.firstName} {c.contact.lastName}
                    </option>
                  ))}
              </select>
            </label>
            <label>
              Due
              <input type="datetime-local" value={due} onChange={(e) => setDue(e.target.value)} />
            </label>
            <label>
              Appointment (client/trade visible)
              <input
                type="datetime-local"
                value={appointment}
                onChange={(e) => setAppointment(e.target.value)}
              />
            </label>
            <label>
              Trade-safe scope
              <textarea value={scope} onChange={(e) => setScope(e.target.value)} />
            </label>
          </div>
        </details>
      )}
      {preview ? (
        <button disabled>Submit — Preview only</button>
      ) : (
        <>
          <ActionButton
            action={async () => {
              await api(`${audience}/warranty/action`, {
                id: r.id,
                version: r.version,
                action,
                body,
                ...(audience === 'business'
                  ? {
                      audience: visibility,
                      ...(staff ? { assignedUserId: staff } : {}),
                      ...(trade ? { assignedTradeId: trade } : {}),
                      ...(due ? { dueAt: new Date(due).toISOString() } : {}),
                      ...(appointment
                        ? { appointmentAt: new Date(appointment).toISOString() }
                        : {}),
                      ...(scope ? { tradeDescription: scope } : {}),
                    }
                  : {}),
              });
              refresh();
            }}
          >
            Save update
          </ActionButton>
          <label>
            Attach photo or PDF
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp,application/pdf"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                const f = new FormData();
                f.set('file', file);
                f.set('requestId', r.id);
                f.set('visibility', visibility);
                try {
                  const response = await fetch('/api/warranty/upload', { method: 'POST', body: f });
                  const result = await response.json();
                  if (!response.ok) throw new Error(result.error);
                  refresh();
                } catch (error) {
                  window.alert(error instanceof Error ? error.message : 'Upload failed.');
                }
              }}
            />
          </label>
        </>
      )}
    </article>
  );
}
export function WarrantyWorkspace({ projectId }: { projectId: string }) {
  const q = useApi<{ requests: ServiceItem[] }>(`business/warranty?projectId=${projectId}`);
  return (
    <>
      <ErrorBox message={q.error} />
      {q.data && (
        <>
          <ServiceRequests
            items={q.data.requests}
            projectId={projectId}
            audience="business"
            refresh={q.refresh}
          />
          <ReminderSettings projectId={projectId} />
        </>
      )}
    </>
  );
}
