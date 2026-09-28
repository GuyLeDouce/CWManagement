'use client';
import { useState } from 'react';
import Link from 'next/link';
import { api, useApi, pretty } from '@/lib/client';
import { ActionButton, ErrorBox, Modal, Empty } from './ui';

export type StandardLine = {
  description: string;
  section: string;
  costCodeId: string;
  costType: string;
  quantity: string;
  unit: string;
  unitCost: string;
  markupMethod: string;
  markupValue: string;
  taxable: boolean;
  allowance: boolean;
  optional: boolean;
  clientDescription: string;
};
type StandardTask = {
  key: string;
  name: string;
  phase: string;
  description: string;
  offsetDays: number;
  durationDays: number;
  predecessor: string;
  lagDays: number;
  milestone: boolean;
  assigneeRole: string;
};
type StandardSelection = {
  title: string;
  category: string;
  description: string;
  deadlineOffset: number;
  required: boolean;
  options: StandardLine[];
};
export type Content = {
  teamRoles: string[];
  specifications: { title: string; category: string; description: string }[];
  lines: StandardLine[];
  tasks: StandardTask[];
  selections: StandardSelection[];
  introduction: string;
  scope: string;
  exclusions: string;
  assumptions: string;
  terms: string;
  folders: string[];
  stage: string;
  dailyLog: string;
  communication: string;
  references: string[];
};
export type Template = {
  id?: string;
  version?: number;
  kind: string;
  name: string;
  description: string;
  active: boolean;
  content: Content;
};
const kinds = [
  'PROJECT',
  'ESTIMATE',
  'SCHEDULE',
  'SELECTION',
  'PROPOSAL',
  'SCOPE',
  'ASSEMBLY',
  'DAILY_LOG',
  'COMMUNICATION',
];
const labels: Record<string, string> = {
  PROJECT: 'Project templates',
  ESTIMATE: 'Estimate templates',
  SCHEDULE: 'Schedule templates',
  SELECTION: 'Specs & selections',
  PROPOSAL: 'Proposal templates',
  SCOPE: 'Scope library',
  ASSEMBLY: 'Assemblies',
  DAILY_LOG: 'Daily log defaults',
  COMMUNICATION: 'Communication',
};
export const blankContent = (): Content => ({
  teamRoles: [],
  specifications: [],
  lines: [],
  tasks: [],
  selections: [],
  introduction: '',
  scope: '',
  exclusions: '',
  assumptions: '',
  terms: '',
  folders: [],
  stage: '',
  dailyLog: '',
  communication: '',
  references: [],
});
const blankLine = (): StandardLine => ({
  description: '',
  section: 'General',
  costCodeId: '',
  costType: 'MATERIAL',
  quantity: '1',
  unit: 'ea',
  unitCost: '0',
  markupMethod: 'NONE',
  markupValue: '0',
  taxable: true,
  allowance: false,
  optional: false,
  clientDescription: '',
});
export function TemplatesScreen() {
  const [kind, setKind] = useState('PROJECT'),
    [search, setSearch] = useState(''),
    [edit, setEdit] = useState<Template | null>(null);
  const query = useApi<{ templates: Template[] }>('standards/templates');
  const state = useApi<{ capabilities: string[] }>('management/state');
  const manage = state.data?.capabilities.includes('TEMPLATE_MANAGE');
  return (
    <div className="management-page">
      <div className="page-heading">
        <span className="eyebrow">Company knowledge</span>
        <h1>Templates</h1>
        <p>Build your standards once. Start each project with the work already organized.</p>
      </div>
      <nav className="library-tabs" aria-label="Company library">
        {kinds.map((k) => (
          <button key={k} className={kind === k ? 'active' : ''} onClick={() => setKind(k)}>
            {labels[k]}
          </button>
        ))}
        <button className={kind === 'CATALOG' ? 'active' : ''} onClick={() => setKind('CATALOG')}>
          Cost catalog
        </button>
      </nav>
      {kind === 'CATALOG' ? (
        <CatalogScreen />
      ) : (
        <>
          <div className="section-actions">
            <h2>{labels[kind]}</h2>
            {manage && (
              <button
                className="primary"
                onClick={() =>
                  setEdit({
                    kind,
                    name: '',
                    description: '',
                    active: true,
                    content: blankContent(),
                  })
                }
              >
                Create template
              </button>
            )}
          </div>
          <input
            className="library-search"
            placeholder="Find a company standard…"
            aria-label="Find template"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <ErrorBox message={query.error} />
          <div className="library-grid">
            {query.data?.templates
              .filter(
                (t) =>
                  t.kind === kind &&
                  `${t.name} ${t.description}`.toLowerCase().includes(search.toLowerCase()),
              )
              .map((t) => (
                <article className="panel library-card" key={t.id}>
                  <small>
                    {t.active ? 'Available' : 'Archived'} · Version {t.version}
                  </small>
                  <h3>{t.name}</h3>
                  <p>{t.description || 'Company standard'}</p>
                  <p className="muted">
                    {t.content.tasks.length} tasks · {t.content.lines.length} estimate items ·{' '}
                    {t.content.selections.length} selections
                  </p>
                  <button onClick={() => setEdit(t)}>
                    {manage ? 'Review / edit' : 'View standard'}
                  </button>
                </article>
              ))}
          </div>
          {!query.data?.templates.some((t) => t.kind === kind) && (
            <Empty title="Your best work can become your next starting point">
              Create a standard here, or open a project and choose “Save as template”. No sample
              company data has been added.
            </Empty>
          )}
        </>
      )}
      {edit && (
        <TemplateEditor
          initial={edit}
          templates={query.data?.templates || []}
          readOnly={!manage}
          close={() => setEdit(null)}
          saved={() => {
            setEdit(null);
            void query.refresh();
          }}
        />
      )}
    </div>
  );
}
function Field({
  label,
  value,
  onChange,
  type = 'text',
}: {
  label: string;
  value: string | number;
  onChange: (v: string) => void;
  type?: string;
}) {
  return (
    <label>
      {label}
      <input type={type} value={value} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}
export function TemplateEditor({
  initial,
  templates = [],
  readOnly = false,
  close,
  saved,
}: {
  initial: Template;
  templates?: Template[];
  readOnly?: boolean;
  close: () => void;
  saved: () => void;
}) {
  const [t, setT] = useState({ ...initial, content: { ...blankContent(), ...initial.content } });
  const [csv, setCsv] = useState(''),
    [csvPreview, setCsvPreview] = useState<{
      content: Content;
      errors: { row: number; message: string }[];
    } | null>(null);
  const c = t.content;
  const set = (patch: Partial<Content>) => setT({ ...t, content: { ...c, ...patch } });
  const codes = useApi<{ costCodes: { id: string; code: string; name: string }[] }>(
    'financial/cost-codes?active=true',
  );
  return (
    <Modal title={initial.id ? 'Company standard' : 'Create company standard'} onClose={close}>
      <div className="entity-form template-editor">
        <fieldset disabled={readOnly}>
          <div className="form-grid">
            <Field label="Template name" value={t.name} onChange={(name) => setT({ ...t, name })} />
            <Field
              label="Description / when to use"
              value={t.description}
              onChange={(description) => setT({ ...t, description })}
            />
          </div>
          <label className="check-inline">
            <input
              type="checkbox"
              checked={t.active}
              onChange={(e) => setT({ ...t, active: e.target.checked })}
            />{' '}
            Available for new work
          </label>
          {['ESTIMATE', 'SCHEDULE', 'SELECTION'].includes(t.kind) && (
            <details>
              <summary>Import template items from CSV</summary>
              <p>
                Preview rows, then add them to this editor. Nothing is saved until you save the
                company standard.
              </p>
              <a
                download={`${t.kind.toLowerCase()}-template.csv`}
                href={`data:text/csv;charset=utf-8,${encodeURIComponent(t.kind === 'ESTIMATE' ? 'section,description,costCode,costType,quantity,unit,unitCost,markupMethod,markupValue,taxable,allowance,optional\n' : t.kind === 'SCHEDULE' ? 'key,name,phase,offsetDays,durationDays,predecessor,lagDays,milestone,assigneeRole\n' : 'category,title,description,deadlineOffset,required\n')}`}
              >
                Download headings
              </a>
              <input
                type="file"
                accept=".csv"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (file) {
                    setCsv(await file.text());
                    setCsvPreview(null);
                  }
                }}
              />
              <textarea
                aria-label="Template CSV"
                value={csv}
                onChange={(e) => {
                  setCsv(e.target.value);
                  setCsvPreview(null);
                }}
              />
              <ActionButton
                action={async () =>
                  setCsvPreview(await api('standards/templates/import', { kind: t.kind, csv }))
                }
              >
                Validate template import
              </ActionButton>
              {csvPreview && (
                <>
                  {csvPreview.errors.map((e, i) => (
                    <p className="notice error" key={i}>
                      Row {e.row}: {e.message}
                    </p>
                  ))}
                  <p>
                    {csvPreview.content.lines.length} items · {csvPreview.content.tasks.length}{' '}
                    tasks · {csvPreview.content.selections.length} selections
                  </p>
                  <button
                    disabled={!!csvPreview.errors.length}
                    onClick={() => {
                      set({
                        lines: [...c.lines, ...csvPreview.content.lines],
                        tasks: [...c.tasks, ...csvPreview.content.tasks],
                        selections: [...c.selections, ...csvPreview.content.selections],
                      });
                      setCsvPreview(null);
                      setCsv('');
                    }}
                  >
                    Add reviewed rows to editor
                  </button>
                </>
              )}
            </details>
          )}
          {t.kind === 'PROJECT' && (
            <>
              <Field label="Starting stage" value={c.stage} onChange={(stage) => set({ stage })} />
              <h3>Required team roles</h3>
              {[
                'ESTIMATOR',
                'DESIGNER',
                'CONTROLLER',
                'SECONDARY_PROJECT_MANAGER',
                'FIELD_STAFF',
              ].map((role) => (
                <label className="check-inline" key={role}>
                  <input
                    type="checkbox"
                    checked={c.teamRoles.includes(role)}
                    onChange={(e) =>
                      set({
                        teamRoles: e.target.checked
                          ? [...c.teamRoles, role]
                          : c.teamRoles.filter((r) => r !== role),
                      })
                    }
                  />
                  {pretty(role)}
                </label>
              ))}
              <label>
                Folder checklist (one per line)
                <textarea
                  value={c.folders.join('\n')}
                  onChange={(e) => set({ folders: e.target.value.split('\n').filter(Boolean) })}
                />
              </label>
              <h3>Include existing company standards</h3>
              <p>Selected standards will be copied into this template when saved.</p>
              {templates
                .filter((x) => x.active && x.kind !== 'PROJECT')
                .map((x) => (
                  <label className="check-inline" key={x.id}>
                    <input
                      type="checkbox"
                      checked={c.references.includes(x.id!)}
                      onChange={(e) =>
                        set({
                          references: e.target.checked
                            ? [...c.references, x.id!]
                            : c.references.filter((id) => id !== x.id),
                        })
                      }
                    />
                    {x.name} · {labels[x.kind]}
                  </label>
                ))}
            </>
          )}
          {['PROJECT', 'ESTIMATE', 'ASSEMBLY'].includes(t.kind) && (
            <>
              <h3>
                {t.kind === 'ASSEMBLY'
                  ? 'Components — quantity is the factor per base unit'
                  : 'Estimate sections and items'}
              </h3>
              <LineEditor
                lines={c.lines}
                setLines={(lines) => set({ lines })}
                codes={codes.data?.costCodes || []}
              />
            </>
          )}
          {['PROJECT', 'SCHEDULE'].includes(t.kind) && (
            <>
              <h3>Relative schedule</h3>
              <p>
                Calendar-day offsets from project start. A predecessor overrides the offset; lag is
                measured from its finish.
              </p>
              {c.tasks.map((task, i) => (
                <div className="standard-row" key={i}>
                  <div className="form-grid">
                    {(['name', 'phase'] as const).map((k) => (
                      <Field
                        key={k}
                        label={pretty(k)}
                        value={task[k]}
                        onChange={(v) =>
                          set({ tasks: c.tasks.map((x, n) => (n === i ? { ...x, [k]: v } : x)) })
                        }
                      />
                    ))}
                    {(['offsetDays', 'durationDays', 'lagDays'] as const).map((k) => (
                      <Field
                        key={k}
                        type="number"
                        label={pretty(k)}
                        value={task[k]}
                        onChange={(v) =>
                          set({
                            tasks: c.tasks.map((x, n) => (n === i ? { ...x, [k]: Number(v) } : x)),
                          })
                        }
                      />
                    ))}
                    <label>
                      After task
                      <select
                        value={task.predecessor}
                        onChange={(e) =>
                          set({
                            tasks: c.tasks.map((x, n) =>
                              n === i ? { ...x, predecessor: e.target.value } : x,
                            ),
                          })
                        }
                      >
                        <option value="">Project start</option>
                        {c.tasks
                          .filter((x) => x.key !== task.key)
                          .map((x) => (
                            <option key={x.key} value={x.key}>
                              {x.name || 'Untitled task'}
                            </option>
                          ))}
                      </select>
                    </label>
                  </div>
                  <label>
                    Default assignee role
                    <select
                      value={task.assigneeRole}
                      onChange={(e) =>
                        set({
                          tasks: c.tasks.map((x, n) =>
                            n === i ? { ...x, assigneeRole: e.target.value } : x,
                          ),
                        })
                      }
                    >
                      <option value="">Assign later</option>
                      {[
                        'PRIMARY_PROJECT_MANAGER',
                        'SECONDARY_PROJECT_MANAGER',
                        'ESTIMATOR',
                        'DESIGNER',
                        'CONTROLLER',
                        'FIELD_STAFF',
                        'OTHER',
                      ].map((r) => (
                        <option key={r} value={r}>
                          {pretty(r)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="check-inline">
                    <input
                      type="checkbox"
                      checked={task.milestone}
                      onChange={(e) =>
                        set({
                          tasks: c.tasks.map((x, n) =>
                            n === i ? { ...x, milestone: e.target.checked } : x,
                          ),
                        })
                      }
                    />
                    Milestone
                  </label>
                  <button
                    className="text-button danger"
                    onClick={() => set({ tasks: c.tasks.filter((_, n) => n !== i) })}
                  >
                    Remove task
                  </button>
                </div>
              ))}
              <button
                onClick={() =>
                  set({
                    tasks: [
                      ...c.tasks,
                      {
                        key: crypto.randomUUID(),
                        name: '',
                        phase: '',
                        description: '',
                        offsetDays: 0,
                        durationDays: 1,
                        predecessor: '',
                        lagDays: 0,
                        milestone: false,
                        assigneeRole: '',
                      },
                    ],
                  })
                }
              >
                Add task
              </button>
            </>
          )}
          {['PROJECT', 'SELECTION'].includes(t.kind) && (
            <>
              <h3>Specifications — information, not a client decision</h3>
              {c.specifications.map((s, i) => (
                <div className="standard-row" key={i}>
                  <Field
                    label="Specification title"
                    value={s.title}
                    onChange={(title) =>
                      set({
                        specifications: c.specifications.map((x, n) =>
                          n === i ? { ...x, title } : x,
                        ),
                      })
                    }
                  />
                  <Field
                    label="Specification category"
                    value={s.category}
                    onChange={(category) =>
                      set({
                        specifications: c.specifications.map((x, n) =>
                          n === i ? { ...x, category } : x,
                        ),
                      })
                    }
                  />
                  <label>
                    Description
                    <textarea
                      value={s.description}
                      onChange={(e) =>
                        set({
                          specifications: c.specifications.map((x, n) =>
                            n === i ? { ...x, description: e.target.value } : x,
                          ),
                        })
                      }
                    />
                  </label>
                  <button
                    onClick={() =>
                      set({ specifications: c.specifications.filter((_, n) => n !== i) })
                    }
                  >
                    Remove specification
                  </button>
                </div>
              ))}
              <button
                onClick={() =>
                  set({
                    specifications: [
                      ...c.specifications,
                      { title: '', category: 'General', description: '' },
                    ],
                  })
                }
              >
                Add specification
              </button>
              <h3>Selection sheet</h3>
              <p>
                New selections remain private drafts. Contract allowances are linked after the
                proposal is accepted.
              </p>
              {c.selections.map((s, i) => (
                <div className="standard-row" key={i}>
                  <div className="form-grid">
                    <Field
                      label="Selection title"
                      value={s.title}
                      onChange={(title) =>
                        set({
                          selections: c.selections.map((x, n) => (n === i ? { ...x, title } : x)),
                        })
                      }
                    />
                    <Field
                      label="Category"
                      value={s.category}
                      onChange={(category) =>
                        set({
                          selections: c.selections.map((x, n) =>
                            n === i ? { ...x, category } : x,
                          ),
                        })
                      }
                    />
                    <Field
                      label="Deadline: days after project start"
                      type="number"
                      value={s.deadlineOffset}
                      onChange={(v) =>
                        set({
                          selections: c.selections.map((x, n) =>
                            n === i ? { ...x, deadlineOffset: Number(v) } : x,
                          ),
                        })
                      }
                    />
                  </div>
                  <LineEditor
                    lines={s.options}
                    setLines={(options) =>
                      set({
                        selections: c.selections.map((x, n) => (n === i ? { ...x, options } : x)),
                      })
                    }
                    codes={codes.data?.costCodes || []}
                  />
                  <button
                    className="text-button danger"
                    onClick={() => set({ selections: c.selections.filter((_, n) => n !== i) })}
                  >
                    Remove selection
                  </button>
                </div>
              ))}
              <button
                onClick={() =>
                  set({
                    selections: [
                      ...c.selections,
                      {
                        title: '',
                        category: 'General',
                        description: '',
                        deadlineOffset: 0,
                        required: true,
                        options: [],
                      },
                    ],
                  })
                }
              >
                Add selection
              </button>
            </>
          )}
          {(['PROJECT', 'PROPOSAL'].includes(t.kind)
            ? ['introduction', 'scope', 'exclusions', 'assumptions', 'terms']
            : t.kind === 'SCOPE'
              ? ['scope', 'terms']
              : t.kind === 'DAILY_LOG'
                ? ['dailyLog']
                : t.kind === 'COMMUNICATION'
                  ? ['communication']
                  : []
          ).map((k) => (
            <label key={k}>
              {pretty(k)}
              <textarea
                rows={4}
                value={String(c[k as keyof Content])}
                onChange={(e) => set({ [k]: e.target.value })}
              />
            </label>
          ))}
          {!readOnly && (
            <ActionButton
              className="primary"
              action={() =>
                api('standards/templates', {
                  ...(t.id ? { id: t.id, expectedVersion: t.version } : {}),
                  kind: t.kind,
                  name: t.name,
                  description: t.description,
                  active: t.active,
                  content: t.content,
                })
              }
              onDone={saved}
            >
              Save company standard
            </ActionButton>
          )}
        </fieldset>
      </div>
    </Modal>
  );
}
function LineEditor({
  lines,
  setLines,
  codes,
}: {
  lines: StandardLine[];
  setLines: (l: StandardLine[]) => void;
  codes: { id: string; code: string; name: string }[];
}) {
  return (
    <>
      <div className="grid-scroll">
        <table className="product-grid">
          <thead>
            <tr>
              {[
                'Section',
                'Description',
                'Cost code',
                'Type',
                'Qty / factor',
                'Unit',
                'Unit cost',
                'Markup method',
                'Markup',
                'Tax',
                'Allowance',
                '',
              ].map((x, i) => (
                <th key={i}>{x}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {lines.map((l, i) => {
              const update = (patch: Partial<StandardLine>) =>
                setLines(lines.map((x, n) => (n === i ? { ...x, ...patch } : x)));
              return (
                <tr key={i}>
                  <td>
                    <input
                      aria-label="Section"
                      value={l.section}
                      onChange={(e) => update({ section: e.target.value })}
                    />
                  </td>
                  <td>
                    <input
                      aria-label="Item description"
                      value={l.description}
                      onChange={(e) => update({ description: e.target.value })}
                    />
                  </td>
                  <td>
                    <select
                      aria-label="Item cost code"
                      value={l.costCodeId}
                      onChange={(e) => update({ costCodeId: e.target.value })}
                    >
                      <option value="">Choose…</option>
                      {codes.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.code} · {c.name}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <select
                      value={l.costType}
                      aria-label="Cost type"
                      onChange={(e) => update({ costType: e.target.value })}
                    >
                      {['LABOUR', 'MATERIAL', 'SUBCONTRACT', 'EQUIPMENT', 'OTHER'].map((t) => (
                        <option key={t}>{t}</option>
                      ))}
                    </select>
                  </td>
                  {(['quantity', 'unit', 'unitCost'] as const).map((k) => (
                    <td key={k}>
                      <input
                        aria-label={k}
                        value={l[k]}
                        onChange={(e) => update({ [k]: e.target.value })}
                      />
                    </td>
                  ))}
                  <td>
                    <select
                      aria-label="Markup method"
                      value={l.markupMethod}
                      onChange={(e) => update({ markupMethod: e.target.value })}
                    >
                      {['NONE', 'PERCENT_ON_COST', 'FIXED'].map((m) => (
                        <option key={m}>{m}</option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <input
                      aria-label="Markup value"
                      value={l.markupValue}
                      onChange={(e) => update({ markupValue: e.target.value })}
                    />
                  </td>
                  <td>
                    <input
                      aria-label="Taxable"
                      type="checkbox"
                      checked={l.taxable}
                      onChange={(e) => update({ taxable: e.target.checked })}
                    />
                  </td>
                  <td>
                    <input
                      aria-label="Allowance"
                      type="checkbox"
                      checked={l.allowance}
                      onChange={(e) => update({ allowance: e.target.checked })}
                    />
                  </td>
                  <td>
                    <button
                      aria-label="Remove item"
                      onClick={() => setLines(lines.filter((_, n) => n !== i))}
                    >
                      ×
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <button onClick={() => setLines([...lines, blankLine()])}>Add item</button>
    </>
  );
}
type CatalogItem = {
  id?: string;
  version?: number;
  name: string;
  description: string;
  costCodeId: string;
  costType: string;
  unit: string;
  unitCost: string;
  markupMethod: string;
  markupValue: string;
  taxable: boolean;
  category: string;
  notes: string;
  source: string;
  active: boolean;
  vendorContactId?: string | null;
  costCode?: { code: string; name: string };
  createdAt?: string;
  updatedAt?: string;
};
export function CatalogScreen() {
  const [selectedIds, setSelectedIds] = useState<string[]>([]),
    [factor, setFactor] = useState('1');
  const [q, setQ] = useState(''),
    [edit, setEdit] = useState<CatalogItem | null>(null),
    [csv, setCsv] = useState(''),
    [preview, setPreview] = useState<{
      items: CatalogItem[];
      errors: { row: number; message: string }[];
    } | null>(null),
    [importing, setImporting] = useState(false);
  const query = useApi<{ items: CatalogItem[]; csvTemplate: string }>(
    `standards/catalog?q=${encodeURIComponent(q)}`,
  );
  const codes = useApi<{ costCodes: { id: string; code: string; name: string }[] }>(
    'financial/cost-codes?active=true',
  );
  return (
    <>
      <div className="section-actions">
        <div>
          <h2>Cost catalog</h2>
          <p>
            Standard costs and pricing defaults. Updating a catalog item never changes an estimate
            already created.
          </p>
        </div>
        <button onClick={() => setImporting(true)}>Import CSV</button>
        <button
          className="primary"
          onClick={() =>
            setEdit({
              name: '',
              description: '',
              costCodeId: '',
              costType: 'MATERIAL',
              unit: 'ea',
              unitCost: '0',
              markupMethod: 'NONE',
              markupValue: '0',
              taxable: true,
              category: '',
              notes: '',
              source: '',
              active: true,
            })
          }
        >
          New catalog item
        </button>
      </div>
      <input
        aria-label="Search catalog"
        placeholder="Search name, description or category"
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />
      <ErrorBox message={query.error} />
      {!!selectedIds.length && (
        <div className="filter-bar">
          <strong>{selectedIds.length} items selected</strong>
          <label>
            Multiply standard unit costs by
            <input
              aria-label="Catalog price multiplier"
              value={factor}
              onChange={(e) => setFactor(e.target.value)}
            />
          </label>
          <ActionButton
            action={() =>
              api('standards/catalog/bulk', {
                items: query.data?.items
                  .filter((i) => selectedIds.includes(i.id!))
                  .map((i) => ({ id: i.id, version: i.version })),
                factor,
              })
            }
            onDone={() => {
              setSelectedIds([]);
              void query.refresh();
            }}
          >
            Update selected catalog prices
          </ActionButton>
          <button onClick={() => setSelectedIds([])}>Clear selection</button>
        </div>
      )}
      <div className="grid-scroll">
        <table className="product-grid">
          <thead>
            <tr>
              <th>Select</th>
              <th>Item</th>
              <th>Category</th>
              <th>Cost code</th>
              <th>Unit</th>
              <th>Standard cost</th>
              <th>Updated</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {query.data?.items.map((x) => (
              <tr key={x.id}>
                <td>
                  <input
                    aria-label={`Select ${x.name}`}
                    type="checkbox"
                    checked={selectedIds.includes(x.id!)}
                    onChange={(e) =>
                      setSelectedIds(
                        e.target.checked
                          ? [...selectedIds, x.id!]
                          : selectedIds.filter((id) => id !== x.id),
                      )
                    }
                  />
                </td>
                <td>
                  <button className="link-button" onClick={() => setEdit(x)}>
                    {x.name}
                  </button>
                </td>
                <td>{x.category}</td>
                <td>{x.costCode?.code}</td>
                <td>{x.unit}</td>
                <td>${x.unitCost}</td>
                <td>{x.updatedAt?.slice(0, 10)}</td>
                <td>{x.active ? 'Active' : 'Inactive'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {query.data && !query.data.items.length && (
        <Empty title="Build your cost catalog">
          Add your real company costs or import a reviewed CSV. Cost codes classify work; catalog
          items describe the things you estimate.
        </Empty>
      )}
      {edit && (
        <Modal title="Cost catalog item" onClose={() => setEdit(null)}>
          <div className="entity-form">
            <div className="form-grid">
              {(
                [
                  'name',
                  'description',
                  'unit',
                  'unitCost',
                  'markupValue',
                  'category',
                  'source',
                  'notes',
                ] as const
              ).map((k) => (
                <Field
                  key={k}
                  label={pretty(k)}
                  value={edit[k]}
                  onChange={(v) => setEdit({ ...edit, [k]: v })}
                />
              ))}
              <label>
                Cost code
                <select
                  value={edit.costCodeId}
                  onChange={(e) => setEdit({ ...edit, costCodeId: e.target.value })}
                >
                  <option value="">Choose…</option>
                  {codes.data?.costCodes.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.code} · {c.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Cost type
                <select
                  value={edit.costType}
                  onChange={(e) => setEdit({ ...edit, costType: e.target.value })}
                >
                  {['LABOUR', 'MATERIAL', 'SUBCONTRACT', 'EQUIPMENT', 'OTHER'].map((x) => (
                    <option key={x}>{x}</option>
                  ))}
                </select>
              </label>
              <label>
                Markup method
                <select
                  value={edit.markupMethod}
                  onChange={(e) => setEdit({ ...edit, markupMethod: e.target.value })}
                >
                  {['NONE', 'PERCENT_ON_COST', 'FIXED'].map((x) => (
                    <option key={x}>{x}</option>
                  ))}
                </select>
              </label>
            </div>
            <label className="check-inline">
              <input
                type="checkbox"
                checked={edit.active}
                onChange={(e) => setEdit({ ...edit, active: e.target.checked })}
              />
              Active
            </label>
            <label className="check-inline">
              <input
                type="checkbox"
                checked={edit.taxable}
                onChange={(e) => setEdit({ ...edit, taxable: e.target.checked })}
              />
              Taxable
            </label>
            <ActionButton
              className="primary"
              action={() => {
                const { version, costCode, createdAt, updatedAt, ...fields } = edit;
                void costCode;
                void createdAt;
                void updatedAt;
                return api('standards/catalog', {
                  ...fields,
                  ...(edit.id ? { expectedVersion: version } : {}),
                });
              }}
              onDone={() => {
                setEdit(null);
                void query.refresh();
              }}
            >
              Save item
            </ActionButton>
          </div>
        </Modal>
      )}
      {importing && (
        <Modal title="Import company costs" onClose={() => setImporting(false)}>
          <p>
            Use exact existing cost codes. Preview validates all rows before saving; importing
            creates new items.
          </p>
          <a
            download="cost-catalog.csv"
            href={`data:text/csv;charset=utf-8,${encodeURIComponent(query.data?.csvTemplate || '')}`}
          >
            Download CSV headings
          </a>
          <input
            type="file"
            accept=".csv,text/csv"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              if (f) {
                setCsv(await f.text());
                setPreview(null);
              }
            }}
          />
          <textarea
            aria-label="Catalog CSV"
            rows={8}
            value={csv}
            onChange={(e) => {
              setCsv(e.target.value);
              setPreview(null);
            }}
          />
          <ActionButton
            action={async () =>
              setPreview(await api('standards/catalog/import', { csv, commit: false }))
            }
          >
            Preview import
          </ActionButton>
          {preview && (
            <>
              <p>{preview.items.length} valid rows</p>
              {preview.errors.map((e) => (
                <p className="notice error" key={e.row}>
                  Row {e.row}: {e.message}
                </p>
              ))}
              <div className="grid-scroll">
                <table className="product-grid">
                  <tbody>
                    {preview.items.map((x, i) => (
                      <tr key={i}>
                        <td>{x.name}</td>
                        <td>{x.costType}</td>
                        <td>{x.unit}</td>
                        <td>${x.unitCost}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <ActionButton
                disabled={!!preview.errors.length || !preview.items.length}
                className="primary"
                action={() => api('standards/catalog/import', { csv, commit: true })}
                onDone={() => {
                  setImporting(false);
                  void query.refresh();
                }}
              >
                Import reviewed rows
              </ActionButton>
            </>
          )}
        </Modal>
      )}
    </>
  );
}
export function TemplateTools({
  projectId,
  kind,
  revisionId,
  revisionVersion,
  refresh,
}: {
  projectId: string;
  kind: string;
  revisionId?: string;
  revisionVersion?: number;
  refresh: () => void;
}) {
  const [assemblyOnly, setAssemblyOnly] = useState(false);
  const [open, setOpen] = useState(false),
    [choice, setChoice] = useState(''),
    [start, setStart] = useState(new Date().toISOString().slice(0, 10)),
    [quantity, setQuantity] = useState('1'),
    [indexes, setIndexes] = useState<number[]>([]),
    [draft, setDraft] = useState<Template | null>(null),
    [requestKey, setRequestKey] = useState('');
  const state = useApi<{ capabilities: string[] }>('management/state');
  const templates = useApi<{ templates: Template[] }>('standards/templates');
  const selected = templates.data?.templates.find((t) => t.id === choice);
  return (
    <div className="template-tools">
      {kind !== 'PROPOSAL' && state.data?.capabilities.includes('TEMPLATE_VIEW') && (
        <button
          onClick={() => {
            setOpen(true);
            setAssemblyOnly(false);
            setRequestKey(crypto.randomUUID());
          }}
        >
          Use template
        </button>
      )}
      {kind === 'ESTIMATE' && state.data?.capabilities.includes('TEMPLATE_VIEW') && (
        <button
          onClick={() => {
            setChoice('');
            setAssemblyOnly(true);
            setOpen(true);
            setRequestKey(crypto.randomUUID());
          }}
        >
          Add assembly
        </button>
      )}
      {state.data?.capabilities.includes('TEMPLATE_MANAGE') && (
        <ActionButton
          action={async () =>
            setDraft(await api('standards/capture', { projectId, kind, name: '' }))
          }
        >
          Save as template
        </ActionButton>
      )}
      {open && (
        <Modal title="Start with a company standard" onClose={() => setOpen(false)}>
          <div className="entity-form">
            <label>
              Template
              <select
                aria-label="Template"
                value={choice}
                onChange={(e) => {
                  setChoice(e.target.value);
                  const t = templates.data?.templates.find((x) => x.id === e.target.value);
                  setIndexes(t?.content.lines.map((_, i) => i) || []);
                }}
              >
                <option value="">Choose a template…</option>
                {templates.data?.templates
                  .filter(
                    (t) =>
                      t.active &&
                      (assemblyOnly
                        ? t.kind === 'ASSEMBLY'
                        : t.kind === kind || (kind === 'ESTIMATE' && t.kind === 'ASSEMBLY')),
                  )
                  .map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name} · Version {t.version}
                    </option>
                  ))}
              </select>
            </label>
            {!templates.data?.templates.some((t) => t.kind === kind) && (
              <p>
                No saved standards yet. <Link href="/templates">Build your library</Link> or save
                this project’s structure.
              </p>
            )}
            {selected && (
              <>
                <p>{selected.description}</p>
                {['SCHEDULE', 'SELECTION', 'PROJECT'].includes(kind) && (
                  <Field type="date" label="Starting date" value={start} onChange={setStart} />
                )}{' '}
                {selected.kind === 'ASSEMBLY' && (
                  <Field label="Base quantity" value={quantity} onChange={setQuantity} />
                )}{' '}
                {!!selected.content.lines.length && (
                  <>
                    <button onClick={() => setIndexes(selected.content.lines.map((_, i) => i))}>
                      Select all items
                    </button>
                    {selected.content.lines.map((l, i) => (
                      <label className="check-inline" key={i}>
                        <input
                          type="checkbox"
                          checked={indexes.includes(i)}
                          onChange={(e) =>
                            setIndexes(
                              e.target.checked ? [...indexes, i] : indexes.filter((x) => x !== i),
                            )
                          }
                        />
                        {l.section} · {l.description} · {l.quantity} {l.unit}
                      </label>
                    ))}
                  </>
                )}
                <p>
                  {selected.content.tasks.length} tasks · {selected.content.selections.length}{' '}
                  selections. New content stays in draft and private.
                </p>
                <ActionButton
                  className="primary"
                  action={() =>
                    api('standards/apply', {
                      projectId,
                      templateId: choice,
                      expectedVersion: selected.version,
                      requestKey,
                      startDate: start,
                      ...(revisionId ? { revisionId, revisionVersion } : {}),
                      lineIndexes: indexes,
                      baseQuantity: quantity,
                    })
                  }
                  onDone={() => {
                    setOpen(false);
                    refresh();
                  }}
                >
                  Add selected content
                </ActionButton>
              </>
            )}
          </div>
        </Modal>
      )}
      {draft && (
        <TemplateEditor
          initial={draft}
          close={() => setDraft(null)}
          saved={() => {
            setDraft(null);
            void templates.refresh();
          }}
        />
      )}
    </div>
  );
}
export function CatalogQuickAdd({
  projectId,
  revisionId,
  revisionVersion,
  refresh,
}: {
  projectId: string;
  revisionId: string;
  revisionVersion: number;
  refresh: () => void;
}) {
  const [open, setOpen] = useState(false),
    [q, setQ] = useState('');
  const items = useApi<{ items: CatalogItem[] }>(`standards/catalog?q=${encodeURIComponent(q)}`);
  return (
    <>
      <button onClick={() => setOpen(true)}>Add from cost catalog</button>
      {open && (
        <Modal title="Find a standard item" onClose={() => setOpen(false)}>
          <input
            autoFocus
            aria-label="Find catalog item"
            placeholder="Search framing, concrete, fixtures…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <ErrorBox message={items.error} />
          {items.data?.items
            .filter(
              (x) =>
                x.active &&
                `${x.name} ${x.description} ${x.category}`.toLowerCase().includes(q.toLowerCase()),
            )
            .map((x) => (
              <div className="data-row" key={x.id}>
                <span>
                  <strong>{x.name}</strong>
                  <small>
                    {x.category} · ${x.unitCost} / {x.unit}
                  </small>
                </span>
                <ActionButton
                  action={() =>
                    api('standards/catalog/add', {
                      projectId,
                      revisionId,
                      revisionVersion,
                      catalogId: x.id,
                      quantity: '1',
                    })
                  }
                  onDone={() => {
                    setOpen(false);
                    refresh();
                  }}
                >
                  Add item
                </ActionButton>
              </div>
            ))}
        </Modal>
      )}
    </>
  );
}
export function WordingPicker({
  kind,
  onChoose,
}: {
  kind: 'PROPOSAL' | 'SCOPE' | 'DAILY_LOG' | 'COMMUNICATION';
  onChoose: (content: Content) => void;
}) {
  const templates = useApi<{ templates: Template[] }>(`standards/templates?kind=${kind}`);
  return (
    <label>
      Use saved company wording
      <select
        defaultValue=""
        onChange={(e) => {
          const t = templates.data?.templates.find((t) => t.id === e.target.value);
          if (t) onChoose(t.content);
        }}
      >
        <option value="">Choose company standard…</option>
        {templates.data?.templates
          .filter((t) => t.active)
          .map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
      </select>
    </label>
  );
}
