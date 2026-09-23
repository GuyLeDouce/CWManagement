'use client';
import { FormEvent, useRef, useState } from 'react';
import Link from 'next/link';
import { Plus, Printer } from 'lucide-react';
import { api, pretty, useApi } from '@/lib/client';
import { ActionButton, Badge, Empty, ErrorBox, Loading, Modal } from './ui';

const types = ['LABOUR', 'MATERIAL', 'SUBCONTRACT', 'EQUIPMENT', 'OTHER'];
type Code = {
  id: string;
  code: string;
  name: string;
  description?: string | null;
  type: string;
  active: boolean;
  sortOrder: number;
  parent?: { id: string; code: string; name: string } | null;
  _count: { children: number; estimateLines: number; budgetLines: number; actualCosts: number };
};
type Line = {
  amounts: { cost: string; markup: string; price: string };
  id: string;
  sectionId: string;
  costCodeId: string;
  costType: string;
  description: string;
  clientDescription?: string | null;
  quantity: string;
  unit: string;
  unitCost: string;
  markupMethod: string;
  markupValue: string;
  taxable: boolean;
  optional: boolean;
  allowance: boolean;
  included: boolean;
  sortOrder: number;
};
type Revision = {
  totals: {
    cost: string;
    price: string;
    tax: string;
    total: string;
    profit: string;
    marginPercent: string;
  };
  id: string;
  revision: number;
  status: string;
  taxRate: string;
  version: number;
  sections: Array<{ id: string; name: string; sortOrder: number }>;
  lines: Line[];
};
type Estimate = {
  id: string;
  estimateNumber: string;
  name: string;
  description?: string | null;
  revisions: Revision[];
};
type ProposalRevision = {
  id: string;
  revision: number;
  status: string;
  clientNameSnapshot: string;
  projectNameSnapshot: string;
  projectNumberSnapshot: string;
  companySnapshot: { legalName?: string; address?: string };
  sectionsSnapshot: Array<{
    name: string;
    description?: string;
    lines: Array<{ description: string; quantity: string; unit: string; price: string }>;
  }>;
  subtotal: string;
  taxAmount: string;
  total: string;
  issueDate?: string | null;
  expiryDate?: string | null;
  introduction?: string | null;
  scope?: string | null;
  exclusions?: string | null;
  assumptions?: string | null;
  terms?: string | null;
};
type Proposal = {
  id: string;
  proposalNumber: string;
  title: string;
  revisions: ProposalRevision[];
};
const dollars = (value: string | number) =>
  Number(value).toLocaleString('en-CA', { style: 'currency', currency: 'CAD' });

export function FinancialsScreen() {
  const [q, setQ] = useState(''),
    [edit, setEdit] = useState<Code | null | false>(false),
    [importing, setImporting] = useState(false);
  const { data, error, refresh } = useApi<{ costCodes: Code[] }>(
    `financial/cost-codes?q=${encodeURIComponent(q)}`,
  );
  return (
    <div className="management-page">
      <div className="page-heading management-heading">
        <div>
          <span className="eyebrow">Settings · Financial</span>
          <h1>Cost codes</h1>
          <p>Cedar Winds accounting and job-cost classifications.</p>
        </div>
        <div className="button-row">
          <button onClick={() => setImporting(true)}>Import CSV</button>
          <button className="primary" onClick={() => setEdit(null)}>
            <Plus size={17} /> Add code
          </button>
        </div>
      </div>
      <div className="filter-bar">
        <input placeholder="Search code or name" value={q} onChange={(e) => setQ(e.target.value)} />
        <Link className="button" href="/api/financial/cost-code-template">
          Template
        </Link>
      </div>
      <ErrorBox message={error} />
      <FinancialSettings />
      {!data ? (
        <Loading />
      ) : data.costCodes.length ? (
        <div className="schedule-list">
          <div className="schedule-head finance-code-head">
            <span>Code</span>
            <span>Name</span>
            <span>Type</span>
            <span>Parent</span>
            <span>Status</span>
          </div>
          {data.costCodes.map((code) => (
            <button
              className="schedule-row finance-code-row"
              key={code.id}
              onClick={() => setEdit(code)}
            >
              <strong>{code.code}</strong>
              <span>{code.name}</span>
              <span>{pretty(code.type)}</span>
              <span>{code.parent?.code || '—'}</span>
              <Badge value={code.active ? 'ACTIVE' : 'INACTIVE'} />
            </button>
          ))}
        </div>
      ) : (
        <Empty title="No cost codes">Import Cedar Winds codes or add the first code.</Empty>
      )}
      {edit !== false && (
        <CostCodeForm
          code={edit || undefined}
          codes={data?.costCodes || []}
          close={() => setEdit(false)}
          saved={() => {
            setEdit(false);
            void refresh();
          }}
        />
      )}
      {importing && (
        <CostCodeImport
          close={() => setImporting(false)}
          saved={() => {
            setImporting(false);
            void refresh();
          }}
        />
      )}
    </div>
  );
}
function FinancialSettings() {
  const query = useApi<{
      settings: {
        taxRate: string;
        estimatePrefix: string;
        proposalPrefix: string;
        legalName: string;
        companyAddress: string;
        proposalTerms: string;
      };
    }>('financial/settings'),
    [open, setOpen] = useState(false);
  if (!query.data) return null;
  const settings = query.data.settings;
  return (
    <section className="panel">
      <div className="section-actions">
        <div>
          <h2>Financial settings</h2>
          <p>
            {Number(settings.taxRate) * 100}% tax · {settings.estimatePrefix} /{' '}
            {settings.proposalPrefix} numbering
          </p>
        </div>
        <button onClick={() => setOpen(true)}>Edit</button>
      </div>
      {open && (
        <Modal title="Financial settings" onClose={() => setOpen(false)}>
          <form className="entity-form" onSubmit={(e) => e.preventDefault()}>
            <div className="form-grid">
              <label>
                HST / tax rate (%)
                <input
                  name="taxRatePercent"
                  type="number"
                  min="0"
                  max="100"
                  step=".0001"
                  defaultValue={Number(settings.taxRate) * 100}
                />
              </label>
              <label>
                Estimate prefix
                <input name="estimatePrefix" defaultValue={settings.estimatePrefix} />
              </label>
              <label>
                Proposal prefix
                <input name="proposalPrefix" defaultValue={settings.proposalPrefix} />
              </label>
              <label>
                Legal name
                <input name="legalName" defaultValue={settings.legalName} />
              </label>
            </div>
            <label>
              Company address
              <textarea name="companyAddress" defaultValue={settings.companyAddress} />
            </label>
            <label>
              Default proposal terms
              <textarea name="proposalTerms" defaultValue={settings.proposalTerms} />
            </label>
            <ActionButton
              className="primary full"
              action={async () => {
                const form = document.activeElement?.closest('form') as HTMLFormElement;
                return api('financial/settings', Object.fromEntries(new FormData(form)));
              }}
              onDone={() => {
                setOpen(false);
                void query.refresh();
              }}
            >
              Save settings
            </ActionButton>
          </form>
        </Modal>
      )}
    </section>
  );
}
function CostCodeForm({
  code,
  codes,
  close,
  saved,
}: {
  code?: Code;
  codes: Code[];
  close: () => void;
  saved: () => void;
}) {
  const ref = useRef<HTMLFormElement>(null);
  return (
    <Modal title={code ? 'Edit cost code' : 'Add cost code'} onClose={close}>
      <form ref={ref} className="entity-form" onSubmit={(e) => e.preventDefault()}>
        <div className="form-grid">
          <label>
            Code
            <input name="code" required defaultValue={code?.code} />
          </label>
          <label>
            Name
            <input name="name" required defaultValue={code?.name} />
          </label>
          <label>
            Cost type
            <select name="type" defaultValue={code?.type || 'OTHER'}>
              {types.map((x) => (
                <option key={x}>{x}</option>
              ))}
            </select>
          </label>
          <label>
            Parent
            <select name="parentId" defaultValue={code?.parent?.id || ''}>
              <option value="">None</option>
              {codes
                .filter((x) => x.id !== code?.id)
                .map((x) => (
                  <option value={x.id} key={x.id}>
                    {x.code} · {x.name}
                  </option>
                ))}
            </select>
          </label>
          <label>
            Sort order
            <input name="sortOrder" type="number" min="0" defaultValue={code?.sortOrder || 0} />
          </label>
          <label className="check-inline">
            <input name="active" type="checkbox" defaultChecked={code?.active ?? true} /> Active
          </label>
        </div>
        <label>
          Description
          <textarea name="description" defaultValue={code?.description || ''} />
        </label>
        <ActionButton
          className="primary full"
          action={() => {
            const f = new FormData(ref.current!);
            return api('financial/cost-codes', {
              id: code?.id,
              code: f.get('code'),
              name: f.get('name'),
              description: f.get('description'),
              parentId: f.get('parentId'),
              type: f.get('type'),
              active: f.has('active'),
              sortOrder: f.get('sortOrder'),
            });
          }}
          onDone={saved}
        >
          Save cost code
        </ActionButton>
      </form>
    </Modal>
  );
}
function CostCodeImport({ close, saved }: { close: () => void; saved: () => void }) {
  const [csv, setCsv] = useState(''),
    [preview, setPreview] = useState<{
      previewToken: string;
      errors: Array<{ row: number; message: string }>;
      count: number;
      creates: number;
      updates: number;
    } | null>(null);
  return (
    <Modal title="Import Cedar Winds cost codes" onClose={close}>
      <div className="entity-form">
        <p>
          Preview is required. Existing matching codes are updated; unrelated codes are untouched.
        </p>
        <textarea
          rows={10}
          value={csv}
          onChange={(e) => {
            setCsv(e.target.value);
            setPreview(null);
          }}
          placeholder="code,name,description,type,parentCode,active,sortOrder"
        />
        <ActionButton
          action={async () => {
            const value = await api<NonNullable<typeof preview>>('financial/cost-code-import', {
              csv,
              commit: false,
            });
            setPreview(value);
            return value;
          }}
        >
          Preview
        </ActionButton>
        {preview && (
          <>
            <p>
              <strong>{preview.count}</strong> rows · {preview.creates} new · {preview.updates}{' '}
              updates
            </p>
            {preview.errors.map((x) => (
              <p className="error" key={x.row}>
                Row {x.row}: {x.message}
              </p>
            ))}
            {!preview.errors.length && (
              <ActionButton
                className="primary"
                action={() =>
                  api('financial/cost-code-import', {
                    csv,
                    commit: true,
                    previewToken: preview.previewToken,
                  })
                }
                onDone={saved}
              >
                Confirm import
              </ActionButton>
            )}
          </>
        )}
      </div>
    </Modal>
  );
}

export function ProjectEstimate({ projectId }: { projectId: string }) {
  const [create, setCreate] = useState(false),
    [line, setLine] = useState(false),
    [selected, setSelected] = useState('');
  const estimatesQuery = useApi<{ estimates: Estimate[] }>(
      `financial/estimates?projectId=${projectId}`,
    ),
    codes = useApi<{ costCodes: Code[] }>('financial/cost-codes?active=true');
  const estimates = estimatesQuery.data?.estimates || [],
    estimate = estimates.find((x) => x.id === selected) || estimates[0],
    revision = estimate?.revisions[0];
  const totals = revision?.totals;
  return (
    <>
      <div className="section-actions">
        <div>
          <h2>Estimate</h2>
          <p>Internal cost, markup-on-cost, client pricing, and immutable revisions.</p>
        </div>
        <button className="primary" onClick={() => setCreate(true)}>
          <Plus size={17} /> New estimate
        </button>
      </div>
      <ErrorBox message={estimatesQuery.error} />
      {!estimatesQuery.data ? (
        <Loading />
      ) : !estimate || !totals ? (
        <Empty title="No estimates">Create the project’s first estimate.</Empty>
      ) : (
        <>
          <div className="filter-bar">
            <select value={estimate.id} onChange={(e) => setSelected(e.target.value)}>
              {estimates.map((x) => (
                <option value={x.id} key={x.id}>
                  {x.estimateNumber} · {x.name}
                </option>
              ))}
            </select>
            <Badge value={revision.status} />
            <span>Revision {revision.revision}</span>
            <ActionButton
              action={() => api('financial/estimate-revisions', { id: revision.id })}
              onDone={estimatesQuery.refresh}
            >
              New revision
            </ActionButton>
            <button
              className="primary"
              onClick={() => setLine(true)}
              disabled={!['DRAFT', 'INTERNAL_REVIEW'].includes(revision.status)}
            >
              Add line
            </button>
          </div>
          <div className="finance-summary">
            <Metric label="Estimated cost" value={dollars(totals.cost)} />
            <Metric label="Markup" value={dollars(totals.profit)} />
            <Metric label="Client subtotal" value={dollars(totals.price)} />
            <Metric label="HST" value={dollars(totals.tax)} />
            <Metric label="Client total" value={dollars(totals.total)} />
            <Metric label="Gross margin" value={`${Number(totals.marginPercent).toFixed(2)}%`} />
          </div>
          <div className="schedule-list">
            <div className="schedule-head estimate-head">
              <span>Description</span>
              <span>Cost code / type</span>
              <span>Qty · unit</span>
              <span>Cost</span>
              <span>Markup</span>
              <span>Price</span>
            </div>
            {revision.lines.map((x) => {
              return (
                <article className="schedule-row estimate-row" key={x.id}>
                  <strong>{x.description}</strong>
                  <span>
                    {codes.data?.costCodes.find((c) => c.id === x.costCodeId)?.code} ·{' '}
                    {pretty(x.costType)}
                  </span>
                  <span>
                    {x.quantity} {x.unit}
                  </span>
                  <span>{dollars(x.amounts.cost)}</span>
                  <span>{dollars(x.amounts.markup)}</span>
                  <span>{dollars(x.amounts.price)}</span>
                </article>
              );
            })}
          </div>
        </>
      )}
      {create && (
        <SimpleCreate
          title="New estimate"
          fields={[
            ['name', 'Estimate name'],
            ['description', 'Description'],
          ]}
          action={(values) => api('financial/estimates', { projectId, ...values })}
          close={() => setCreate(false)}
          saved={() => {
            setCreate(false);
            void estimatesQuery.refresh();
          }}
        />
      )}
      {line && revision && (
        <LineForm
          revision={revision}
          codes={codes.data?.costCodes || []}
          close={() => setLine(false)}
          saved={() => {
            setLine(false);
            void estimatesQuery.refresh();
          }}
        />
      )}
    </>
  );
}
function LineForm({
  revision,
  codes,
  close,
  saved,
}: {
  revision: Revision;
  codes: Code[];
  close: () => void;
  saved: () => void;
}) {
  const ref = useRef<HTMLFormElement>(null);
  return (
    <Modal title="Add estimate line" onClose={close}>
      <form ref={ref} className="entity-form" onSubmit={(e) => e.preventDefault()}>
        <label>
          Description
          <input name="description" required />
        </label>
        <label>
          Client description
          <input name="clientDescription" />
        </label>
        <div className="form-grid">
          <label>
            Section
            <select name="sectionId">
              {revision.sections.map((x) => (
                <option value={x.id} key={x.id}>
                  {x.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Cost code
            <select name="costCodeId" required>
              {codes.map((x) => (
                <option value={x.id} key={x.id}>
                  {x.code} · {x.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Cost type
            <select name="costType">
              {types.map((x) => (
                <option key={x}>{x}</option>
              ))}
            </select>
          </label>
          <label>
            Quantity
            <input name="quantity" type="number" step=".0001" min="0" defaultValue="1" />
          </label>
          <label>
            Unit
            <input name="unit" defaultValue="EA" />
          </label>
          <label>
            Unit cost
            <input name="unitCost" type="number" step=".0001" min="0" defaultValue="0" />
          </label>
          <label>
            Markup method
            <select name="markupMethod">
              <option>NONE</option>
              <option>PERCENT_ON_COST</option>
              <option>FIXED</option>
            </select>
          </label>
          <label>
            Markup value
            <input name="markupValue" type="number" step=".0001" min="0" defaultValue="0" />
          </label>
          <label>
            Order
            <input name="sortOrder" type="number" min="0" defaultValue="0" />
          </label>
        </div>
        <div className="button-row">
          <label className="check-inline">
            <input name="taxable" type="checkbox" defaultChecked /> Taxable
          </label>
          <label className="check-inline">
            <input name="included" type="checkbox" defaultChecked /> Included
          </label>
          <label className="check-inline">
            <input name="optional" type="checkbox" /> Optional
          </label>
          <label className="check-inline">
            <input name="allowance" type="checkbox" /> Allowance
          </label>
        </div>
        <ActionButton
          className="primary full"
          action={() => {
            const f = new FormData(ref.current!);
            return api('financial/estimate-lines', {
              revisionId: revision.id,
              sectionId: f.get('sectionId'),
              costCodeId: f.get('costCodeId'),
              costType: f.get('costType'),
              description: f.get('description'),
              clientDescription: f.get('clientDescription'),
              quantity: f.get('quantity'),
              unit: f.get('unit'),
              unitCost: f.get('unitCost'),
              markupMethod: f.get('markupMethod'),
              markupValue: f.get('markupValue'),
              taxable: f.has('taxable'),
              included: f.has('included'),
              optional: f.has('optional'),
              allowance: f.has('allowance'),
              sortOrder: f.get('sortOrder'),
              expectedVersion: revision.version,
            });
          }}
          onDone={saved}
        >
          Save line
        </ActionButton>
      </form>
    </Modal>
  );
}

export function ProjectProposals({
  projectId,
  contacts,
}: {
  projectId: string;
  contacts: Array<{ role: string; contact: Person }>;
}) {
  const query = useApi<{ proposals: Proposal[] }>(`financial/proposals?projectId=${projectId}`),
    estimates = useApi<{ estimates: Estimate[] }>(`financial/estimates?projectId=${projectId}`),
    [create, setCreate] = useState(false),
    [print, setPrint] = useState<ProposalRevision | null>(null);
  return (
    <>
      <div className="section-actions">
        <div>
          <h2>Proposals</h2>
          <p>Client-safe, snapshot-backed pricing documents.</p>
        </div>
        <button className="primary" onClick={() => setCreate(true)}>
          Create proposal
        </button>
      </div>
      {!query.data ? (
        <Loading />
      ) : query.data.proposals.length ? (
        query.data.proposals.map((p) => (
          <section className="panel" key={p.id}>
            <div className="section-actions">
              <div>
                <h3>
                  {p.proposalNumber} · {p.title}
                </h3>
                <Badge value={p.revisions[0].status} />
              </div>
              <div className="button-row">
                <button onClick={() => setPrint(p.revisions[0])}>
                  <Printer size={16} /> View / print
                </button>
                <ActionButton
                  action={() => api('financial/proposal-revisions', { id: p.revisions[0].id })}
                  onDone={query.refresh}
                >
                  New revision
                </ActionButton>
                {p.revisions[0].status === 'DRAFT' && (
                  <ActionButton
                    action={() =>
                      api('financial/proposal-action', { id: p.revisions[0].id, action: 'issue' })
                    }
                    onDone={query.refresh}
                  >
                    Issue
                  </ActionButton>
                )}
                {p.revisions[0].status === 'ISSUED' && (
                  <ActionButton
                    className="primary"
                    action={() =>
                      api('financial/proposal-action', { id: p.revisions[0].id, action: 'accept' })
                    }
                    onDone={query.refresh}
                  >
                    Mark accepted
                  </ActionButton>
                )}
                {p.revisions[0].status === 'ACCEPTED' && (
                  <ActionButton
                    action={() =>
                      api('financial/budgets', { proposalRevisionId: p.revisions[0].id })
                    }
                  >
                    Create budget
                  </ActionButton>
                )}
              </div>
            </div>
            <p>
              {p.revisions[0].clientNameSnapshot} · {dollars(p.revisions[0].total)}
            </p>
          </section>
        ))
      ) : (
        <Empty title="No proposals">
          Create a client-facing proposal from an estimate revision.
        </Empty>
      )}
      {create && (
        <ProposalForm
          estimates={estimates.data?.estimates || []}
          contacts={contacts}
          close={() => setCreate(false)}
          saved={() => {
            setCreate(false);
            void query.refresh();
          }}
        />
      )}
      {print && (
        <ProposalPrint
          proposal={query.data!.proposals.find((p) => p.revisions.some((r) => r.id === print.id))!}
          revision={print}
          close={() => setPrint(null)}
        />
      )}
    </>
  );
}
type Person = { id: string; firstName: string; lastName: string };
function ProposalForm({
  estimates,
  contacts,
  close,
  saved,
}: {
  estimates: Estimate[];
  contacts: Array<{ role: string; contact: Person }>;
  close: () => void;
  saved: () => void;
}) {
  const ref = useRef<HTMLFormElement>(null),
    revisions = estimates.flatMap((e) =>
      e.revisions.map((r) => ({ id: r.id, label: `${e.estimateNumber} Rev ${r.revision}` })),
    );
  return (
    <Modal title="Create proposal" onClose={close}>
      <form ref={ref} className="entity-form" onSubmit={(e) => e.preventDefault()}>
        <label>
          Estimate revision
          <select name="estimateRevisionId" required>
            {revisions.map((x) => (
              <option value={x.id} key={x.id}>
                {x.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Client
          <select name="clientId">
            <option value="">Client</option>
            {contacts
              .filter((x) => x.role === 'CLIENT')
              .map((x) => (
                <option value={x.contact.id} key={x.contact.id}>
                  {x.contact.firstName} {x.contact.lastName}
                </option>
              ))}
          </select>
        </label>
        <label>
          Title
          <input name="title" required defaultValue="Construction Proposal" />
        </label>
        {['introduction', 'scope', 'exclusions', 'assumptions', 'terms'].map((x) => (
          <label key={x}>
            {pretty(x)}
            <textarea name={x} />
          </label>
        ))}
        <label>
          Expiry date
          <input name="expiryDate" type="date" />
        </label>
        <ActionButton
          className="primary full"
          action={() => {
            const f = new FormData(ref.current!);
            return api('financial/proposals', Object.fromEntries(f));
          }}
          onDone={saved}
        >
          Create proposal snapshot
        </ActionButton>
      </form>
    </Modal>
  );
}
function ProposalPrint({
  proposal,
  revision,
  close,
}: {
  proposal: Proposal;
  revision: ProposalRevision;
  close: () => void;
}) {
  return (
    <Modal title="Proposal preview" onClose={close}>
      <article className="proposal-document">
        <h1>{revision.companySnapshot.legalName || 'Cedar Winds Design~Build'}</h1>
        <p>{revision.companySnapshot.address}</p>
        <hr />
        <h2>{proposal.title}</h2>
        <p>
          <strong>
            {proposal.proposalNumber} Rev {revision.revision}
          </strong>
        </p>
        <p>
          {revision.projectNumberSnapshot} · {revision.projectNameSnapshot}
          <br />
          {revision.clientNameSnapshot}
        </p>
        {revision.expiryDate && <p>Valid until {revision.expiryDate.slice(0, 10)}</p>}
        {(['introduction', 'scope', 'exclusions', 'assumptions'] as const).map((field) =>
          revision[field] ? (
            <section key={field}>
              <h3>{pretty(field)}</h3>
              <p style={{ whiteSpace: 'pre-wrap' }}>{revision[field]}</p>
            </section>
          ) : null,
        )}
        {revision.sectionsSnapshot.map((s, i) => (
          <section key={i}>
            <h3>{s.name}</h3>
            {s.description && <p>{s.description}</p>}
            {s.lines.map((x, j) => (
              <div className="proposal-line" key={j}>
                <span>
                  {x.description}
                  <small>
                    {x.quantity} {x.unit}
                  </small>
                </span>
                <strong>{dollars(x.price)}</strong>
              </div>
            ))}
          </section>
        ))}
        <div className="proposal-total">
          <span>Subtotal</span>
          <strong>{dollars(revision.subtotal)}</strong>
          <span>HST</span>
          <strong>{dollars(revision.taxAmount)}</strong>
          <span>Total</span>
          <strong>{dollars(revision.total)}</strong>
        </div>
        {revision.terms && (
          <>
            <h3>Terms</h3>
            <p style={{ whiteSpace: 'pre-wrap' }}>{revision.terms}</p>
          </>
        )}
      </article>
      <button className="primary full no-print" onClick={() => window.print()}>
        <Printer size={17} /> Print / Save as PDF
      </button>
    </Modal>
  );
}

export function ProjectBudget({ projectId }: { projectId: string }) {
  const query = useApi<{
      rows: Array<{
        costCodeId: string;
        code: string;
        name: string;
        type: string;
        original: string;
        current: string;
        committed: string;
        actual: string;
        forecast: string;
        variance: string;
      }>;
      totals: {
        original: string;
        current: string;
        committed: string;
        actual: string;
        forecast: string;
        variance: string;
      };
      summary: { contract: string; forecastProfit: string | null; forecastMargin: string | null };
    }>(`financial/job-cost?projectId=${projectId}`),
    [actual, setActual] = useState(false),
    codes = useApi<{ costCodes: Code[] }>('financial/cost-codes?active=true');
  if (!query.data && !query.error) return <Loading />;
  return (
    <>
      <div className="section-actions">
        <div>
          <h2>Budget & job cost</h2>
          <p>Original/current budget, remaining commitments, actuals, forecast, and variance.</p>
        </div>
        <button onClick={() => setActual(true)}>Manual actual</button>
      </div>
      <ErrorBox message={query.error} />
      {query.data && (
        <>
          <div className="finance-summary">
            <Metric label="Contract" value={dollars(query.data.summary.contract)} />
            <Metric label="Current budget" value={dollars(query.data.totals.current)} />
            <Metric label="Actual" value={dollars(query.data.totals.actual)} />
            <Metric label="Forecast" value={dollars(query.data.totals.forecast)} />
            {query.data.summary.forecastProfit != null && (
              <Metric label="Forecast profit" value={dollars(query.data.summary.forecastProfit)} />
            )}
            {query.data.summary.forecastMargin != null && (
              <Metric
                label="Forecast margin"
                value={`${Number(query.data.summary.forecastMargin).toFixed(2)}%`}
              />
            )}
          </div>
          <div className="finance-table">
            <div className="finance-row finance-header">
              <span>Cost code</span>
              <span>Type</span>
              <span>Original</span>
              <span>Current</span>
              <span>Committed</span>
              <span>Actual</span>
              <span>Forecast</span>
              <span>Variance</span>
            </div>
            {query.data.rows.map((x) => (
              <div className="finance-row" key={`${x.costCodeId}:${x.type}`}>
                <strong>
                  {x.code} · {x.name}
                </strong>
                <span>{pretty(x.type)}</span>
                <span>{dollars(x.original)}</span>
                <span>{dollars(x.current)}</span>
                <span>{dollars(x.committed)}</span>
                <span>{dollars(x.actual)}</span>
                <span>{dollars(x.forecast)}</span>
                <span>{dollars(x.variance)}</span>
              </div>
            ))}
          </div>
        </>
      )}
      {actual && (
        <ActualForm
          projectId={projectId}
          codes={codes.data?.costCodes || []}
          close={() => setActual(false)}
          saved={() => {
            setActual(false);
            void query.refresh();
          }}
        />
      )}
    </>
  );
}
function ActualForm({
  projectId,
  codes,
  close,
  saved,
}: {
  projectId: string;
  codes: Code[];
  close: () => void;
  saved: () => void;
}) {
  const ref = useRef<HTMLFormElement>(null);
  return (
    <Modal title="Record manual actual cost" onClose={close}>
      <form ref={ref} className="entity-form" onSubmit={(e: FormEvent) => e.preventDefault()}>
        <p className="warning">
          Manual accounting entries are audited and remain distinct from future QuickBooks imports.
        </p>
        <label>
          Cost code
          <select name="costCodeId">
            {codes.map((x) => (
              <option value={x.id} key={x.id}>
                {x.code} · {x.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Cost type
          <select name="costType">
            {types.map((x) => (
              <option key={x}>{x}</option>
            ))}
          </select>
        </label>
        <label>
          Amount
          <input name="amount" type="number" step=".01" required />
        </label>
        <label>
          Transaction date
          <input
            name="transactionDate"
            type="date"
            required
            defaultValue={new Date().toISOString().slice(0, 10)}
          />
        </label>
        <label>
          Description
          <input name="description" required />
        </label>
        <ActionButton
          className="primary full"
          action={() => {
            const f = new FormData(ref.current!);
            return api('financial/actual-costs', { projectId, ...Object.fromEntries(f) });
          }}
          onDone={saved}
        >
          Record actual cost
        </ActionButton>
      </form>
    </Modal>
  );
}
function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <small>{label}</small>
      <strong>{value}</strong>
    </div>
  );
}
function SimpleCreate({
  title,
  fields,
  action,
  close,
  saved,
}: {
  title: string;
  fields: string[][];
  action: (values: Record<string, string>) => Promise<unknown>;
  close: () => void;
  saved: () => void;
}) {
  const ref = useRef<HTMLFormElement>(null);
  return (
    <Modal title={title} onClose={close}>
      <form ref={ref} className="entity-form" onSubmit={(e) => e.preventDefault()}>
        {fields.map(([name, label]) => (
          <label key={name}>
            {label}
            <input name={name} required={name === 'name'} />
          </label>
        ))}
        <ActionButton
          className="primary full"
          action={() =>
            action(
              Object.fromEntries(new FormData(ref.current!).entries()) as Record<string, string>,
            )
          }
          onDone={saved}
        >
          Create
        </ActionButton>
      </form>
    </Modal>
  );
}
