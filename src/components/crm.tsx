'use client';
import { useState } from 'react';
import Link from 'next/link';
import { api, useApi, pretty } from '@/lib/client';
import { ActionButton, ErrorBox, Modal } from './ui';
import { ProjectWizard } from './project-setup';
type Opportunity = {
  id: string;
  version: number;
  title: string;
  contactId: string;
  stageId: string;
  sourceId: string | null;
  ownerId: string;
  status: string;
  projectType: string;
  address: string;
  municipality: string;
  referralSource: string;
  estimatedValue: string;
  probability: number;
  expectedCloseDate: string | null;
  consultationDate: string | null;
  nextFollowUp: string | null;
  notes: string;
  lostReason: string | null;
  projectId: string | null;
  createdAt: string;
  contact: { firstName: string; lastName: string; email: string | null; phone: string | null };
  activities: {
    id: string;
    title: string;
    category: string;
    notes: string;
    dueAt: string;
    ownerId: string;
    completedAt: string | null;
  }[];
};
type Directory = {
  opportunities: Opportunity[];
  stages: { id: string; name: string; active: boolean; sortOrder: number }[];
  sources: { id: string; name: string; active: boolean }[];
  contacts: { id: string; firstName: string; lastName: string }[];
  users: { id: string; firstName: string; lastName: string }[];
};
const blank = {
  title: '',
  contactId: '',
  stageId: '',
  sourceId: '',
  ownerId: '',
  status: 'OPEN',
  projectType: '',
  address: '',
  municipality: '',
  referralSource: '',
  estimatedValue: '0',
  probability: 0,
  expectedCloseDate: null as string | null,
  consultationDate: null as string | null,
  nextFollowUp: null as string | null,
  notes: '',
  lostReason: '',
};
function editable(o: Opportunity) {
  return Object.fromEntries(
    Object.keys(blank).map((k) => [k, o[k as keyof Opportunity]]),
  ) as typeof blank;
}
export function CrmWorkspace() {
  const q = useApi<Directory>('business/crm'),
    [view, setView] = useState('pipeline'),
    [search, setSearch] = useState(''),
    [status, setStatus] = useState('OPEN'),
    [selected, setSelected] = useState<Opportunity | null>(null),
    [editing, setEditing] = useState(false),
    [draft, setDraft] = useState(blank),
    [configuration, setConfiguration] = useState(false),
    [kind, setKind] = useState('stage'),
    [name, setName] = useState(''),
    [conversion, setConversion] = useState<Opportunity | null>(null);
  const [filters, setFilters] = useState({
    stage: '',
    owner: '',
    source: '',
    type: '',
    from: '',
    to: '',
    sort: 'title',
  });
  const records =
    q.data?.opportunities.filter(
      (o) =>
        (!status || o.status === status) &&
        (!filters.stage || o.stageId === filters.stage) &&
        (!filters.owner || o.ownerId === filters.owner) &&
        (!filters.source || o.sourceId === filters.source) &&
        (!filters.type || o.projectType === filters.type) &&
        (!filters.from || o.createdAt.slice(0, 10) >= filters.from) &&
        (!filters.to || o.createdAt.slice(0, 10) <= filters.to) &&
        `${o.title} ${o.contact.firstName} ${o.contact.lastName} ${o.projectType}`
          .toLowerCase()
          .includes(search.toLowerCase()),
    ) || [];
  records.sort((a, b) =>
    filters.sort === 'value'
      ? Number(b.estimatedValue) - Number(a.estimatedValue)
      : filters.sort === 'follow-up'
        ? (a.nextFollowUp || '9999').localeCompare(b.nextFollowUp || '9999')
        : a.title.localeCompare(b.title),
  );
  const open = (o: Opportunity) => {
    setSelected(o);
    setDraft(editable(o));
    setEditing(true);
  };
  const field = (k: keyof typeof blank, label: string, type = 'text') => (
    <label>
      {label}
      <input
        type={type}
        value={draft[k] ?? ''}
        onChange={(e) =>
          setDraft({ ...draft, [k]: k === 'probability' ? Number(e.target.value) : e.target.value })
        }
      />
    </label>
  );
  return (
    <div className="management-page">
      <header className="page-heading">
        <span className="eyebrow">CEDAR WINDS SALES</span>
        <h1>Leads & opportunities</h1>
        <p>Follow the potential job from first conversation to project setup.</p>
        <Link href="/how-to/business/leads">CRM help</Link>
      </header>
      <ErrorBox message={q.error} />
      <div className="toolbar">
        <button
          className="button"
          onClick={() => {
            setSelected(null);
            setDraft(blank);
            setEditing(true);
          }}
        >
          New opportunity
        </button>
        <button onClick={() => setConfiguration(!configuration)}>Stages & sources</button>
        <select aria-label="Pipeline view" value={view} onChange={(e) => setView(e.target.value)}>
          <option value="pipeline">Pipeline</option>
          <option value="list">List</option>
        </select>
        <select
          aria-label="Opportunity status"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
        >
          <option value="">All statuses</option>
          {['OPEN', 'WON', 'LOST'].map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
        <input
          aria-label="Search opportunities"
          placeholder="Search opportunities"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>
      <details className="panel">
        <summary>Filter and sort opportunities</summary>
        <div className="form-grid">
          <label>
            Stage
            <select
              aria-label="Filter stage"
              value={filters.stage}
              onChange={(e) => setFilters({ ...filters, stage: e.target.value })}
            >
              <option value="">All stages</option>
              {q.data?.stages.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Owner
            <select
              aria-label="Filter owner"
              value={filters.owner}
              onChange={(e) => setFilters({ ...filters, owner: e.target.value })}
            >
              <option value="">All visible owners</option>
              {q.data?.users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.firstName} {u.lastName}
                </option>
              ))}
            </select>
          </label>
          <label>
            Source
            <select
              aria-label="Filter source"
              value={filters.source}
              onChange={(e) => setFilters({ ...filters, source: e.target.value })}
            >
              <option value="">All sources</option>
              {q.data?.sources.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Project type
            <select
              aria-label="Filter project type"
              value={filters.type}
              onChange={(e) => setFilters({ ...filters, type: e.target.value })}
            >
              <option value="">All types</option>
              {[...new Set(q.data?.opportunities.map((o) => o.projectType).filter(Boolean))].map(
                (t) => (
                  <option key={t}>{t}</option>
                ),
              )}
            </select>
          </label>
          <label>
            Opened from
            <input
              type="date"
              value={filters.from}
              onChange={(e) => setFilters({ ...filters, from: e.target.value })}
            />
          </label>
          <label>
            Opened through
            <input
              type="date"
              value={filters.to}
              onChange={(e) => setFilters({ ...filters, to: e.target.value })}
            />
          </label>
          <label>
            Sort
            <select
              aria-label="Sort opportunities"
              value={filters.sort}
              onChange={(e) => setFilters({ ...filters, sort: e.target.value })}
            >
              <option value="title">Opportunity</option>
              <option value="value">Value, highest first</option>
              <option value="follow-up">Next follow-up</option>
            </select>
          </label>
        </div>
      </details>
      {configuration && (
        <section className="panel">
          <h2>Company pipeline standards</h2>
          <p>Create your stages and sources. Existing records retain inactive values.</p>
          <select value={kind} onChange={(e) => setKind(e.target.value)}>
            <option value="stage">Stage</option>
            <option value="source">Lead source</option>
          </select>
          <input
            aria-label="Configuration name"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <ActionButton
            action={async () => {
              await api('business/crm/configure', {
                kind,
                name,
                sortOrder: q.data?.stages.length || 0,
              });
              setName('');
              q.refresh();
            }}
          >
            Add
          </ActionButton>
          {(kind === 'stage' ? q.data?.stages : q.data?.sources)?.map((c) => (
            <div key={c.id}>
              {c.name} · {c.active ? 'Active' : 'Inactive'}{' '}
              <ActionButton
                className="text-button"
                action={async () => {
                  await api('business/crm/configure', {
                    kind,
                    id: c.id,
                    name: c.name,
                    active: !c.active,
                    ...('sortOrder' in c ? { sortOrder: c.sortOrder } : {}),
                  });
                  q.refresh();
                }}
              >
                {c.active ? 'Deactivate' : 'Activate'}
              </ActionButton>
            </div>
          ))}
        </section>
      )}
      <div className="summary-grid">
        <div className="panel">
          <strong>{records.length}</strong>
          <p>Matching opportunities</p>
        </div>
        <div className="panel">
          <strong>
            {records
              .reduce((sum, o) => sum + Number(o.estimatedValue), 0)
              .toLocaleString('en-CA', { style: 'currency', currency: 'CAD' })}
          </strong>
          <p>Entered pipeline value · not booked revenue</p>
        </div>
        <div className="panel">
          <strong>
            {
              records
                .flatMap((o) => o.activities)
                .filter((a) => !a.completedAt && new Date(a.dueAt) < new Date()).length
            }
          </strong>
          <p>Overdue follow-ups</p>
        </div>
      </div>
      {!q.data?.stages.length && (
        <div className="panel">
          <h2>Define your sales pipeline</h2>
          <p>
            Add company stages and lead sources, then create your first opportunity. No sample leads
            have been added.
          </p>
        </div>
      )}
      {view === 'pipeline' ? (
        <div className="crm-pipeline">
          {q.data?.stages.map((s) => (
            <section key={s.id}>
              <h2>{s.name}</h2>
              {records
                .filter((o) => o.stageId === s.id)
                .map((o) => (
                  <button className="panel crm-card" key={o.id} onClick={() => open(o)}>
                    <strong>{o.title}</strong>
                    <small>
                      Owner:{' '}
                      {q.data?.users
                        .filter((u) => u.id === o.ownerId)
                        .map((u) => `${u.firstName} ${u.lastName}`)
                        .join('')}
                    </small>
                    <span>
                      {o.contact.firstName} {o.contact.lastName}
                    </span>
                    <span>
                      {Number(o.estimatedValue).toLocaleString('en-CA', {
                        style: 'currency',
                        currency: 'CAD',
                      })}
                    </span>
                    <small>
                      {o.projectType} ·{' '}
                      {Math.floor((Date.now() - +new Date(o.createdAt)) / 86400000)} days old
                    </small>
                    <small>
                      {o.nextFollowUp
                        ? `Follow up ${new Date(o.nextFollowUp).toLocaleDateString()}`
                        : 'Set a next follow-up'}
                    </small>
                  </button>
                ))}
            </section>
          ))}
        </div>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Opportunity</th>
                <th>Client</th>
                <th>Stage</th>
                <th>Value</th>
                <th>Next follow-up</th>
              </tr>
            </thead>
            <tbody>
              {records.map((o) => (
                <tr key={o.id}>
                  <td>
                    <button className="text-button" onClick={() => open(o)}>
                      {o.title}
                    </button>
                  </td>
                  <td>
                    {o.contact.firstName} {o.contact.lastName}
                  </td>
                  <td>{q.data?.stages.find((s) => s.id === o.stageId)?.name}</td>
                  <td>{o.estimatedValue}</td>
                  <td>{o.nextFollowUp?.slice(0, 10)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {editing && (
        <Modal
          title={selected ? 'Opportunity detail' : 'New opportunity'}
          onClose={() => setEditing(false)}
        >
          <div className="entity-form">
            <div className="form-grid">
              {field('title', 'Opportunity title')}
              {field('projectType', 'Project type')}
              <label>
                Contact
                <select
                  aria-label="Contact"
                  value={draft.contactId}
                  onChange={(e) => setDraft({ ...draft, contactId: e.target.value })}
                >
                  <option value="">Choose client or prospect</option>
                  {q.data?.contacts.map((c) => (
                    <option value={c.id} key={c.id}>
                      {c.firstName} {c.lastName}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Owner
                <select
                  aria-label="Owner"
                  value={draft.ownerId}
                  onChange={(e) => setDraft({ ...draft, ownerId: e.target.value })}
                >
                  <option value="">Choose owner</option>
                  {q.data?.users.map((c) => (
                    <option value={c.id} key={c.id}>
                      {c.firstName} {c.lastName}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Stage
                <select
                  aria-label="Stage"
                  value={draft.stageId}
                  onChange={(e) => setDraft({ ...draft, stageId: e.target.value })}
                >
                  <option value="">Choose stage</option>
                  {q.data?.stages
                    .filter((s) => s.active)
                    .map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                </select>
              </label>
              <label>
                Source
                <select
                  aria-label="Source"
                  value={draft.sourceId || ''}
                  onChange={(e) => setDraft({ ...draft, sourceId: e.target.value })}
                >
                  <option value="">Not recorded</option>
                  {q.data?.sources
                    .filter((s) => s.active)
                    .map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                </select>
              </label>
              {field('address', 'Property address')}
              {field('municipality', 'Municipality')}
              {field('referralSource', 'Referral')}
              {field('estimatedValue', 'Estimated value')}
              {field('probability', 'Probability (%)', 'number')}
              <label>
                Status
                <select
                  aria-label="Status"
                  value={draft.status}
                  onChange={(e) => setDraft({ ...draft, status: e.target.value })}
                >
                  {['OPEN', 'WON', 'LOST'].map((s) => (
                    <option key={s}>{s}</option>
                  ))}
                </select>
              </label>
              {['expectedCloseDate', 'consultationDate', 'nextFollowUp'].map((k) => (
                <label key={k}>
                  {pretty(k)}
                  <input
                    type="datetime-local"
                    value={((draft[k as keyof typeof draft] as string) || '').slice(0, 16)}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        [k]: e.target.value ? new Date(e.target.value).toISOString() : null,
                      })
                    }
                  />
                </label>
              ))}
              {draft.status === 'LOST' && field('lostReason', 'Lost reason')}
            </div>
            <label>
              Internal sales notes
              <textarea
                value={draft.notes}
                onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
              />
            </label>
            {!selected?.projectId && (
              <ActionButton
                action={async () => {
                  await api('business/crm', {
                    ...draft,
                    sourceId: draft.sourceId || null,
                    ...(selected ? { id: selected.id, version: selected.version } : {}),
                  });
                  setEditing(false);
                  q.refresh();
                }}
              >
                Save opportunity
              </ActionButton>
            )}
            {selected && (
              <>
                <p>
                  {selected.contact.email} {selected.contact.phone}
                </p>
                {selected.projectId ? (
                  <Link href={`/projects/${selected.projectId}`}>Open converted project</Link>
                ) : (
                  selected.status === 'WON' && (
                    <button
                      onClick={() => {
                        setConversion(selected);
                        setEditing(false);
                      }}
                    >
                      Convert to project
                    </button>
                  )
                )}
                <FollowUps
                  opportunity={selected}
                  refresh={() => {
                    setEditing(false);
                    q.refresh();
                  }}
                  users={q.data?.users || []}
                />
              </>
            )}
          </div>
        </Modal>
      )}
      {conversion && (
        <ProjectWizard
          close={() => {
            setConversion(null);
            q.refresh();
          }}
          opportunity={conversion}
        />
      )}
    </div>
  );
}
function FollowUps({
  opportunity: o,
  users,
  refresh,
}: {
  opportunity: Opportunity;
  users: Directory['users'];
  refresh: () => void;
}) {
  const [title, setTitle] = useState(''),
    [due, setDue] = useState(''),
    [owner, setOwner] = useState(o.ownerId),
    [notes, setNotes] = useState('');
  return (
    <section>
      <h3>Activities & follow-ups</h3>
      {o.activities.map((a) => (
        <div key={a.id}>
          <strong>{a.title}</strong> · {new Date(a.dueAt).toLocaleString()}
          <p>{a.notes}</p>
          {a.completedAt ? (
            'Completed'
          ) : (
            <ActionButton
              action={async () => {
                const { completedAt, ...data } = a;
                void completedAt;
                await api('business/crm/activity', {
                  ...data,
                  opportunityId: o.id,
                  complete: true,
                });
                refresh();
              }}
            >
              Complete follow-up
            </ActionButton>
          )}
        </div>
      ))}
      <div className="form-grid">
        <label>
          Next action
          <input value={title} onChange={(e) => setTitle(e.target.value)} />
        </label>
        <label>
          Due
          <input type="datetime-local" value={due} onChange={(e) => setDue(e.target.value)} />
        </label>
        <label>
          Owner
          <select aria-label="Owner" value={owner} onChange={(e) => setOwner(e.target.value)}>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.firstName} {u.lastName}
              </option>
            ))}
          </select>
        </label>
        <label>
          Communication notes
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} />
        </label>
      </div>
      <ActionButton
        action={async () => {
          await api('business/crm/activity', {
            opportunityId: o.id,
            title,
            category: 'Follow-up',
            ownerId: owner,
            dueAt: new Date(due).toISOString(),
            notes,
          });
          refresh();
        }}
      >
        Add follow-up
      </ActionButton>
    </section>
  );
}
