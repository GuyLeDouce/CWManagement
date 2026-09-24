'use client';
import { useState } from 'react';
import { api, useApi, pretty } from '@/lib/client';
import { ActionButton, ErrorBox, Loading } from './ui';
import { PortalContent, PortalData } from './client-portal';

type Option = {
  name: string;
  description: string | null;
  costCodeId: string;
  costType: string;
  quantity: string;
  unit: string | null;
  unitCost: string;
  markupMethod: string;
  markupValue: string;
  taxable: boolean;
  attachmentIds: string[];
  manufacturer?: string | null;
  model?: string | null;
  finish?: string | null;
  referenceUrl?: string | null;
  leadTime?: string | null;
  vendorContactId?: string | null;
  recommended?: boolean;
  sortOrder?: number;
};
type Selection = {
  id: string;
  version: number;
  title: string;
  category: string;
  description: string | null;
  internalNotes: string | null;
  allowanceId: string | null;
  deadline: string | null;
  required: boolean;
  status: string;
  options: Option[];
  decisions: {
    id: string;
    comments: string | null;
    snapshot: { option: { name: string }; variance: string };
    createdAt: string;
  }[];
  changeOrder?: { number: string } | null;
};
type Allowance = {
  id: string;
  name: string;
  amount: string;
  includedCost: string;
  costCodeId: string;
  costType: string;
  taxable: boolean;
};
const blankOption = (): Option => ({
  name: '',
  description: '',
  costCodeId: '',
  costType: 'MATERIAL',
  quantity: '1',
  unit: 'each',
  unitCost: '0',
  markupMethod: 'PERCENT_ON_COST',
  markupValue: '0',
  taxable: true,
  attachmentIds: [],
});
const costTypes = ['LABOUR', 'MATERIAL', 'SUBCONTRACT', 'EQUIPMENT', 'OTHER'];
export function SelectionWorkspace({ projectId }: { projectId: string }) {
  const { data, error, refresh } = useApi<{ allowances: Allowance[]; selections: Selection[] }>(
    `client-management/selections?projectId=${projectId}`,
  );
  const codes = useApi<{ costCodes: { id: string; code: string; name: string }[] }>(
    'financial/cost-codes?active=true',
  );
  const files = useApi<{ files: { id: string; originalFilename: string; visibility: string }[] }>(
    `management/files?projectId=${projectId}`,
  );
  const [edit, setEdit] = useState<Selection | null>(null),
    [title, setTitle] = useState(''),
    [category, setCategory] = useState(''),
    [description, setDescription] = useState(''),
    [notes, setNotes] = useState(''),
    [deadline, setDeadline] = useState(''),
    [allowanceId, setAllowance] = useState(''),
    [options, setOptions] = useState<Option[]>([blankOption()]);
  const sources = useApi<{
    estimateLines: { id: string; description: string; costCodeId: string; costType: string }[];
    budgetLines: { id: string; description: string; costCodeId: string; costType: string }[];
  }>(`client-management/allowance-sources?projectId=${projectId}`);
  const [aName, setAName] = useState(''),
    [aAmount, setAAmount] = useState('0'),
    [aCost, setACost] = useState('0'),
    [aCode, setACode] = useState(''),
    [aType, setAType] = useState('MATERIAL'),
    [source, setSource] = useState(''),
    [budgetSource, setBudgetSource] = useState('');
  function reset() {
    setEdit(null);
    setTitle('');
    setCategory('');
    setDescription('');
    setNotes('');
    setDeadline('');
    setAllowance('');
    setOptions([blankOption()]);
  }
  function patch(index: number, fields: Partial<Option>) {
    setOptions((old) => old.map((o, i) => (i === index ? { ...o, ...fields } : o)));
  }
  return (
    <>
      <ErrorBox message={error} />
      <h2>Allowances & selections</h2>
      <p>
        Contract allowance values are client prices before HST. Internal cost baselines remain
        private. One selection uses one allowance; split categories before publishing if separate
        decisions are needed.
      </p>
      <details className="panel">
        <summary>Record an included contract allowance</summary>
        <div className="form-grid">
          <label>
            Name
            <input value={aName} onChange={(e) => setAName(e.target.value)} />
          </label>
          <label>
            Included client allowance
            <input
              value={aAmount}
              onChange={(e) => setAAmount(e.target.value)}
              inputMode="decimal"
            />
          </label>
          <label>
            Internal included cost
            <input value={aCost} onChange={(e) => setACost(e.target.value)} inputMode="decimal" />
          </label>
          <label>
            Cost code
            <select aria-label="Cost code" value={aCode} onChange={(e) => setACode(e.target.value)}>
              <option value="">Choose code</option>
              {codes.data?.costCodes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.code} · {c.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Cost type
            <select aria-label="Cost type" value={aType} onChange={(e) => setAType(e.target.value)}>
              {costTypes.map((t) => (
                <option key={t}>{t}</option>
              ))}
            </select>
          </label>
          <label>
            Accepted estimate allowance (optional)
            <select
              aria-label="Accepted estimate allowance"
              value={source}
              onChange={(e) => {
                setSource(e.target.value);
                const line = sources.data?.estimateLines.find((l) => l.id === e.target.value);
                if (line) {
                  setACode(line.costCodeId);
                  setAType(line.costType);
                }
              }}
            >
              <option value="">Enter an existing contract allowance manually</option>
              {sources.data?.estimateLines.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.description}
                </option>
              ))}
            </select>
          </label>
          <label>
            Original budget allocation (optional)
            <select
              aria-label="Original budget allocation"
              value={budgetSource}
              onChange={(e) => setBudgetSource(e.target.value)}
            >
              <option value="">No source allocation linked</option>
              {sources.data?.budgetLines.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.description} · {l.costType}
                </option>
              ))}
            </select>
          </label>
        </div>
        <ActionButton
          action={async () => {
            await api('client-management/allowances', {
              projectId,
              name: aName,
              amount: aAmount,
              includedCost: aCost,
              costCodeId: aCode,
              costType: aType,
              estimateLineId: source || null,
              budgetLineId: budgetSource || null,
            });
            refresh();
          }}
        >
          Save allowance
        </ActionButton>
        <p>
          When an accepted estimate line is linked, the server derives both values from that line.
        </p>
      </details>
      <section className="panel">
        <h3>{edit ? 'Edit draft selection' : 'Create selection'}</h3>
        <div className="form-grid">
          <label>
            Selection title
            <input value={title} onChange={(e) => setTitle(e.target.value)} />
          </label>
          <label>
            Category
            <input value={category} onChange={(e) => setCategory(e.target.value)} />
          </label>
          <label>
            Included allowance
            <select
              aria-label="Included allowance"
              value={allowanceId}
              onChange={(e) => {
                setAllowance(e.target.value);
                const a = data?.allowances.find((a) => a.id === e.target.value);
                if (a)
                  setOptions((old) =>
                    old.map((o) => ({
                      ...o,
                      costCodeId: a.costCodeId,
                      costType: a.costType,
                      taxable: a.taxable,
                    })),
                  );
              }}
            >
              <option value="">No allowance — full price is an addition</option>
              {data?.allowances.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name} · ${a.amount}
                </option>
              ))}
            </select>
          </label>
          <label>
            Decision deadline
            <input type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} />
          </label>
          <label>
            Visible to client
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} />
          </label>
          <label>
            Internal notes
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} />
          </label>
        </div>
        {options.map((o, i) => (
          <fieldset key={i} className="client-card">
            <legend>Option {i + 1}</legend>
            <div className="form-grid">
              <label>
                Option name
                <input value={o.name} onChange={(e) => patch(i, { name: e.target.value })} />
              </label>
              <label>
                Client description
                <textarea
                  value={o.description || ''}
                  onChange={(e) => patch(i, { description: e.target.value })}
                />
              </label>
              <label>
                Cost code
                <select
                  value={o.costCodeId}
                  onChange={(e) => patch(i, { costCodeId: e.target.value })}
                >
                  <option value="">Choose code</option>
                  {codes.data?.costCodes.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.code} · {c.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Cost type
                <select value={o.costType} onChange={(e) => patch(i, { costType: e.target.value })}>
                  {costTypes.map((t) => (
                    <option key={t}>{t}</option>
                  ))}
                </select>
              </label>
              {(
                [
                  'quantity',
                  'unit',
                  'unitCost',
                  'markupValue',
                  'manufacturer',
                  'model',
                  'finish',
                  'leadTime',
                  'referenceUrl',
                ] as const
              ).map((key) => (
                <label key={key}>
                  {key === 'unitCost'
                    ? 'Internal unit cost'
                    : key === 'markupValue'
                      ? 'Internal markup'
                      : pretty(key)}
                  <input
                    value={o[key] || ''}
                    onChange={(e) => patch(i, { [key]: e.target.value })}
                  />
                </label>
              ))}
              <label>
                Markup method
                <select
                  aria-label="Markup method"
                  value={o.markupMethod}
                  onChange={(e) => patch(i, { markupMethod: e.target.value })}
                >
                  <option value="NONE">None</option>
                  <option value="PERCENT_ON_COST">Percent on cost</option>
                  <option value="FIXED">Fixed amount</option>
                </select>
              </label>
              <label className="check">
                <input
                  type="checkbox"
                  checked={o.taxable}
                  onChange={(e) => patch(i, { taxable: e.target.checked })}
                />
                HST applies
              </label>
            </div>
            <p>
              Client-safe attachments — upload through Project Files first. Supplier quotes should
              remain INTERNAL.
            </p>
            {files.data?.files
              .filter((f) => f.visibility === 'CLIENT')
              .map((f) => (
                <label className="check" key={f.id}>
                  <input
                    type="checkbox"
                    checked={o.attachmentIds.includes(f.id)}
                    onChange={(e) =>
                      patch(i, {
                        attachmentIds: e.target.checked
                          ? [...o.attachmentIds, f.id]
                          : o.attachmentIds.filter((id) => id !== f.id),
                      })
                    }
                  />
                  {f.originalFilename}
                </label>
              ))}
            <button onClick={() => setOptions((old) => old.filter((_, n) => n !== i))}>
              Remove option
            </button>
          </fieldset>
        ))}
        <button onClick={() => setOptions((old) => [...old, blankOption()])}>Add option</button>
        <ActionButton
          action={async () => {
            await api('client-management/selections', {
              id: edit?.id,
              expectedVersion: edit?.version,
              projectId,
              title,
              category,
              description,
              internalNotes: notes,
              deadline,
              allowanceId: allowanceId || null,
              options: options.map((o, i) => ({ ...o, sortOrder: i })),
            });
            reset();
            refresh();
          }}
        >
          Save draft selection
        </ActionButton>
        {edit && <button onClick={reset}>Cancel edit</button>}
      </section>
      {data?.selections.map((s) => (
        <article className="client-card" key={s.id}>
          <span className="eyebrow">{pretty(s.status)}</span>
          <h3>{s.title}</h3>
          <p>{s.description}</p>
          <p>
            {s.options.length} options · {s.deadline?.slice(0, 10) || 'No deadline'}
          </p>
          {s.status === 'DRAFT' && (
            <>
              <button
                onClick={() => {
                  setEdit(s);
                  setTitle(s.title);
                  setCategory(s.category);
                  setDescription(s.description || '');
                  setNotes(s.internalNotes || '');
                  setDeadline(s.deadline?.slice(0, 10) || '');
                  setAllowance(s.allowanceId || '');
                  setOptions(
                    s.options.map((o) => ({
                      name: o.name,
                      description: o.description,
                      costCodeId: o.costCodeId,
                      costType: o.costType,
                      quantity: o.quantity,
                      unit: o.unit,
                      unitCost: o.unitCost,
                      markupMethod: o.markupMethod,
                      markupValue: o.markupValue,
                      taxable: o.taxable,
                      attachmentIds: o.attachmentIds,
                      manufacturer: o.manufacturer,
                      model: o.model,
                      finish: o.finish,
                      referenceUrl: o.referenceUrl,
                      leadTime: o.leadTime,
                      vendorContactId: o.vendorContactId,
                      recommended: o.recommended,
                    })),
                  );
                }}
              >
                Edit draft
              </button>
              <ActionButton
                action={async () => {
                  await api('client-management/selection-action', {
                    id: s.id,
                    version: s.version,
                    action: 'publish',
                  });
                  refresh();
                }}
              >
                Publish to client
              </ActionButton>
            </>
          )}
          {s.status === 'PUBLISHED' && (
            <ActionButton
              action={async () => {
                await api('client-management/selection-action', {
                  id: s.id,
                  version: s.version,
                  action: 'unpublish',
                });
                refresh();
              }}
            >
              Unpublish for editing
            </ActionButton>
          )}
          {s.status === 'APPROVED' && (
            <ActionButton
              action={async () => {
                await api('client-management/selection-action', {
                  id: s.id,
                  version: s.version,
                  action: 'close',
                });
                refresh();
              }}
            >
              Close selection
            </ActionButton>
          )}
          {s.decisions.map((d) => (
            <div key={d.id}>
              <strong>Client selected {d.snapshot.option.name}</strong>
              <p>Allowance difference: ${d.snapshot.variance}</p>
              <p>{d.comments}</p>
            </div>
          ))}
          {s.changeOrder && (
            <a href={`/projects/${projectId}/change-orders`}>
              Review adjustment {s.changeOrder.number}
            </a>
          )}
        </article>
      ))}
    </>
  );
}
export function ClientManagement({ projectId }: { projectId: string }) {
  const { data, error, refresh } = useApi<{
    contacts: {
      contact: {
        id: string;
        firstName: string;
        lastName: string;
        email: string | null;
        portalAccess: { active: boolean; invitedAt: string; acceptedAt: string | null }[];
      };
    }[];
  }>(`client-management/access?projectId=${projectId}`);
  const [preview, setPreview] = useState(false);
  return (
    <>
      <h2>Client access & publishing</h2>
      <ErrorBox message={error} />
      <p>
        Add client contacts in Project Settings, then explicitly invite them here. Revoking access
        takes effect on every subsequent request.
      </p>
      {data?.contacts.map(({ contact: c }) => (
        <article className="client-card" key={c.id}>
          <h3>
            {c.firstName} {c.lastName}
          </h3>
          <p>
            {c.email} ·{' '}
            {c.portalAccess[0]?.active
              ? c.portalAccess[0].acceptedAt
                ? 'Active'
                : 'Invited'
              : 'No active access'}
          </p>
          <ActionButton
            action={async () => {
              const r = await api('client-management/access', {
                projectId,
                contactId: c.id,
                action: 'invite',
              });
              refresh();
              return r;
            }}
          >
            Invite / resend / reactivate
          </ActionButton>
          {c.portalAccess[0]?.active && (
            <ActionButton
              action={async () => {
                await api('client-management/access', {
                  projectId,
                  contactId: c.id,
                  action: 'revoke',
                });
                refresh();
              }}
            >
              Revoke project access
            </ActionButton>
          )}
        </article>
      ))}
      <PublicationEditor projectId={projectId} />
      <button onClick={() => setPreview(!preview)}>
        {preview ? 'Close preview' : 'Preview published client content'}
      </button>
      {preview && <ClientPreview projectId={projectId} />}
    </>
  );
}
function ClientPreview({ projectId }: { projectId: string }) {
  const { data, error } = useApi<PortalData>(`client-management/preview?projectId=${projectId}`);
  const [section, setSection] = useState('home');
  return (
    <section className="client-shell">
      <ErrorBox message={error} />
      <select
        aria-label="Preview section"
        value={section}
        onChange={(e) => setSection(e.target.value)}
      >
        {['home', 'schedule', 'selections', 'change-orders', 'updates', 'photos', 'documents'].map(
          (s) => (
            <option key={s}>{s}</option>
          ),
        )}
      </select>
      {data ? (
        <PortalContent data={data} section={section} refresh={() => {}} preview />
      ) : (
        <Loading />
      )}
    </section>
  );
}
function PublicationEditor({ projectId }: { projectId: string }) {
  const tasks = useApi<{ tasks: { id: string; name: string }[] }>(
      `management/schedule?projectId=${projectId}`,
    ),
    logs = useApi<{ logs: { id: string; date: string }[] }>(
      `management/daily-logs?projectId=${projectId}`,
    ),
    files = useApi<{ files: { id: string; originalFilename: string }[] }>(
      `management/files?projectId=${projectId}`,
    );
  const [kind, setKind] = useState('schedule'),
    [id, setId] = useState(''),
    [visible, setVisible] = useState(true),
    [title, setTitle] = useState(''),
    [description, setDescription] = useState(''),
    [target, setTarget] = useState('');
  const records =
    kind === 'schedule'
      ? tasks.data?.tasks.map((t) => ({ id: t.id, label: t.name }))
      : kind === 'update'
        ? logs.data?.logs.map((l) => ({ id: l.id, label: l.date.slice(0, 10) }))
        : files.data?.files.map((f) => ({ id: f.id, label: f.originalFilename }));
  return (
    <section className="panel">
      <h3>Publish project content</h3>
      <p>
        Write dedicated client-safe wording. Internal task descriptions and daily log fields are
        never used as fallbacks.
      </p>
      <div className="form-grid">
        <label>
          Content type
          <select
            value={kind}
            onChange={(e) => {
              setKind(e.target.value);
              setId('');
            }}
          >
            {['schedule', 'update', 'file', 'project'].map((k) => (
              <option key={k}>{k}</option>
            ))}
          </select>
        </label>
        {kind !== 'project' && (
          <label>
            Record
            <select value={id} onChange={(e) => setId(e.target.value)}>
              <option value="">Choose record</option>
              {records?.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.label}
                </option>
              ))}
            </select>
          </label>
        )}
        {kind === 'schedule' && (
          <label>
            Client-safe title
            <input value={title} onChange={(e) => setTitle(e.target.value)} />
          </label>
        )}
        {kind !== 'file' && (
          <label>
            Client-safe description / update
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} />
          </label>
        )}
        {kind === 'project' && (
          <label>
            Published target completion
            <input type="date" value={target} onChange={(e) => setTarget(e.target.value)} />
          </label>
        )}
        <label className="check">
          <input type="checkbox" checked={visible} onChange={(e) => setVisible(e.target.checked)} />
          Visible to authorized clients
        </label>
      </div>
      <ActionButton
        action={() =>
          api('client-management/publish', {
            projectId,
            id: kind === 'project' ? projectId : id,
            kind,
            visible,
            title,
            description,
            targetCompletion: target,
          })
        }
      >
        Save publication
      </ActionButton>
    </section>
  );
}
