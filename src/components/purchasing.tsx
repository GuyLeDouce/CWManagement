'use client';
import { useRef, useState } from 'react';
import Link from 'next/link';
import { api, pretty, useApi } from '@/lib/client';
import { ActionButton, Badge, Empty, ErrorBox, Loading, Modal } from './ui';

const root = 'financial/operations/';
const dollars = (v: string | number) =>
  Number(v).toLocaleString('en-CA', { style: 'currency', currency: 'CAD' });
const costTypes = ['LABOUR', 'MATERIAL', 'SUBCONTRACT', 'EQUIPMENT', 'OTHER'];
type Contact = {
  id: string;
  firstName: string;
  lastName: string;
  types: string[];
  company?: { name: string } | null;
};
type Options = {
  contacts: Contact[];
  codes: { id: string; code: string; name: string; type: string }[];
  files: { id: string; originalFilename: string }[];
  tasks: { id: string; name: string }[];
  changes: { id: string; title: string; revision: number; changeOrder: { number: string } }[];
};
type Line = {
  lineKey?: string;
  costCodeId: string;
  costType: string;
  description: string;
  clientDescription?: string | null;
  quantity: string;
  unit: string;
  unitCost: string;
  markupMethod?: string;
  markupValue?: string;
  taxable: boolean;
  sortOrder: number;
  internalNotes?: string | null;
};
type Snapshot = {
  number: string;
  revision: number;
  type: string;
  title: string;
  scope?: string;
  description?: string;
  terms?: string;
  notes?: string;
  scheduleDays?: number;
  expectedDate?: string;
  issuedAt: string;
  company: { name: string; address: string };
  project: { name: string; number: string; address: string };
  vendor?: { name: string; contactName: string; email: string; phone: string; address: string };
  client?: { name: string; contactName: string; email: string; phone: string; address: string };
  billing?: { name: string; email: string; phone: string; address: string };
  attachments: { id: string; name: string }[];
  lines: {
    description: string;
    quantity: string;
    unit: string;
    unitCost?: string;
    amount: string;
  }[];
  subtotal: string;
  tax: string;
  total: string;
  taxRate: string;
};
type Revision = {
  id: string;
  revision: number;
  version: number;
  status: string;
  title: string;
  scope?: string | null;
  description?: string | null;
  category?: string | null;
  terms?: string | null;
  internalNotes?: string | null;
  vendorNotes?: string | null;
  expectedDate?: string | null;
  vendorContactId?: string;
  billingContactId?: string | null;
  clientId?: string | null;
  changeOrderRevisionId?: string | null;
  scheduleTaskId?: string | null;
  attachmentIds: string[];
  scheduleDays?: number;
  subtotal: string;
  costTotal?: string;
  taxAmount: string;
  total: string;
  issuedAt?: string | null;
  lines: Line[];
  snapshot: Snapshot | null;
  vendorContact?: Contact;
  budgetVersion?: { version: number } | null;
};
type Document = {
  id: string;
  projectId: string;
  number: string;
  type?: string;
  cancelledAt?: string | null;
  revisions: Revision[];
  commitment?: {
    status: string;
    lines: { committedAmount: string; consumedAmount: string }[];
  } | null;
};
const contactLabel = (c: Contact) =>
  (c.company ? c.company.name + ' — ' : '') + c.firstName + ' ' + c.lastName;
function useGrants() {
  return useApi<{ capabilities: string[] }>('management/state').data?.capabilities || [];
}

export function PurchasingWorkspace({
  projectId,
  change = false,
}: {
  projectId: string;
  change?: boolean;
}) {
  const query = useApi<{ documents: Document[] }>(
    root + (change ? 'changes' : 'purchasing') + '?projectId=' + projectId,
  );
  const grants = useGrants(),
    [editing, setEditing] = useState<{ document?: Document; revision?: Revision } | null>(null),
    [search, setSearch] = useState(''),
    [status, setStatus] = useState('');
  const create = change
    ? grants.includes('CHANGE_ORDER_CREATE')
    : grants.some((x) => ['PURCHASE_ORDER_CREATE', 'WORK_ORDER_CREATE'].includes(x));
  const documents = (query.data?.documents || []).filter(
    (x) =>
      (!status || x.revisions[0].status === status) &&
      (
        x.number +
        ' ' +
        x.revisions[0].title +
        ' ' +
        (x.revisions[0].vendorContact ? contactLabel(x.revisions[0].vendorContact) : '')
      )
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
  return (
    <div className="purchasing-workspace">
      <div className="section-actions">
        <div>
          <h2>{change ? 'Change orders' : 'Purchase orders & work orders'}</h2>
          <p>
            {change
              ? 'Client price changes and internal budget costs are tracked separately.'
              : 'Only issued documents create committed cost. Drafts and internal approvals do not.'}
          </p>
        </div>
        {create && (
          <button className="primary" onClick={() => setEditing({})}>
            {change ? 'New change order' : 'New purchase / work order'}
          </button>
        )}
      </div>
      <div className="filter-bar">
        <label>
          Search documents
          <input value={search} onChange={(e) => setSearch(e.target.value)} />
        </label>
        <label>
          Status
          <select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">All statuses</option>
            {[
              'DRAFT',
              'INTERNAL_REVIEW',
              'APPROVED',
              'READY',
              'ISSUED',
              'PARTIALLY_FULFILLED',
              'FULFILLED',
              'ACCEPTED',
              'CANCELLED',
              'REJECTED',
              'VOID',
            ].map((x) => (
              <option key={x}>{x}</option>
            ))}
          </select>
        </label>
      </div>
      <ErrorBox message={query.error} />
      {!query.data && !query.error ? (
        <Loading />
      ) : !documents.length ? (
        <Empty title="No matching documents">Create a draft to get started.</Empty>
      ) : (
        documents.map((doc) => (
          <DocumentCard
            key={doc.id}
            doc={doc}
            change={change}
            grants={grants}
            refresh={query.refresh}
            edit={(revision) => setEditing({ document: doc, revision })}
          />
        ))
      )}
      {editing && (
        <DocumentEditor
          projectId={projectId}
          change={change}
          document={editing.document}
          revision={editing.revision}
          grants={grants}
          close={() => setEditing(null)}
          saved={() => {
            setEditing(null);
            void query.refresh();
          }}
        />
      )}
      {!change && grants.includes('COMMITMENT_VIEW') && (
        <CommitmentWorkspace
          key={query.data?.documents
            .map((x) => x.revisions[0].version + ':' + x.revisions[0].status)
            .join(',')}
          projectId={projectId}
          onChanged={query.refresh}
        />
      )}
    </div>
  );
}
function DocumentCard({
  doc,
  change,
  grants,
  refresh,
  edit,
}: {
  doc: Document;
  change: boolean;
  grants: string[];
  refresh: () => Promise<void>;
  edit: (r: Revision) => void;
}) {
  const [selected, setSelected] = useState(''),
    [print, setPrint] = useState(false),
    [action, setAction] = useState('');
  const ref = useRef<HTMLFormElement>(null);
  const revision = doc.revisions.find((x) => x.id === selected) || doc.revisions[0],
    latest = revision.id === doc.revisions[0].id;
  const prefix = change ? 'CHANGE_ORDER' : doc.type!;
  const allowed = (suffix: string) => grants.includes(prefix + '_' + suffix);
  const act = async (name: string, extra: Record<string, unknown> = {}) =>
    api(root + (change ? 'changes' : 'purchasing') + '/action', {
      id: revision.id,
      expectedVersion: revision.version,
      action: name,
      ...extra,
    });
  const done = () => {
    setAction('');
    setSelected('');
    void refresh();
  };
  const active = !doc.cancelledAt && latest;
  const remaining = doc.commitment?.lines.reduce(
    (a, x) => a + Number(x.committedAmount) - Number(x.consumedAmount),
    0,
  );
  return (
    <section className="panel purchasing-card">
      <div className="section-actions">
        <div>
          <h3>
            {doc.number} · {revision.title}
          </h3>
          <Badge value={revision.status} />
          <p>
            {change ? 'Change order' : pretty(doc.type!)} · Rev {revision.revision}
            {revision.vendorContact ? ' · ' + contactLabel(revision.vendorContact) : ''}
          </p>
        </div>
        <strong>{dollars(revision.total)} including tax</strong>
      </div>
      <p>
        Client / vendor subtotal: {dollars(revision.subtotal)}
        {change && revision.costTotal
          ? ` ? Internal expected cost: ${dollars(revision.costTotal)}`
          : ''}
      </p>
      <div className="detail-header">
        <label>
          Revision history
          <select value={revision.id} onChange={(e) => setSelected(e.target.value)}>
            {doc.revisions.map((r) => (
              <option value={r.id} key={r.id}>
                Rev {r.revision} — {pretty(r.status)}
              </option>
            ))}
          </select>
        </label>
        {revision.issuedAt && <span>Issued {revision.issuedAt.slice(0, 10)}</span>}
        {doc.commitment && (
          <span>
            {doc.commitment.status === 'CANCELLED'
              ? 'Commitment cancelled'
              : dollars(remaining || 0) + ' remaining committed'}
          </span>
        )}
        {revision.budgetVersion && <span>Budget version {revision.budgetVersion.version}</span>}
      </div>
      <div className="button-row">
        {active && revision.status === 'DRAFT' && allowed('EDIT') && (
          <>
            <button onClick={() => edit(revision)}>Edit draft</button>
            <ActionButton action={() => act('review')} onDone={done}>
              Submit for review
            </ActionButton>
          </>
        )}
        {active &&
          revision.status === 'INTERNAL_REVIEW' &&
          allowed(change ? 'APPROVE_INTERNAL' : 'APPROVE') && (
            <ActionButton action={() => act('approve')} onDone={done}>
              Approve internally
            </ActionButton>
          )}
        {active &&
          ['INTERNAL_REVIEW', 'APPROVED', 'READY'].includes(revision.status) &&
          allowed('EDIT') && (
            <ActionButton action={() => act('return')} onDone={done}>
              Return to draft
            </ActionButton>
          )}
        {active && ['APPROVED', 'READY'].includes(revision.status) && allowed('ISSUE') && (
          <ActionButton className="primary" action={() => act('issue')} onDone={done}>
            Issue
          </ActionButton>
        )}
        {active && change && revision.status === 'ISSUED' && allowed('ACCEPT') && (
          <button className="primary" onClick={() => setAction('accept')}>
            Record client acceptance
          </button>
        )}
        {active &&
          allowed('EDIT') &&
          (change
            ? ['READY', 'ISSUED', 'REJECTED']
            : ['APPROVED', 'ISSUED', 'PARTIALLY_FULFILLED', 'FULFILLED']
          ).includes(revision.status) && (
            <ActionButton action={() => act('revise')} onDone={done}>
              Create revision
            </ActionButton>
          )}
        {active &&
          !change &&
          allowed('APPROVE') &&
          (!doc.commitment || grants.includes('COMMITMENT_MANAGE')) && (
            <button onClick={() => setAction('cancel')}>Cancel document</button>
          )}
        {active &&
          change &&
          allowed('ISSUE') &&
          ['DRAFT', 'INTERNAL_REVIEW', 'READY', 'ISSUED', 'REJECTED'].includes(revision.status) && (
            <button onClick={() => setAction('void')}>Void</button>
          )}
        {active && change && allowed('ISSUE') && revision.status === 'ISSUED' && (
          <button onClick={() => setAction('reject')}>Record rejection</button>
        )}
        {revision.snapshot && <button onClick={() => setPrint(true)}>View / print document</button>}
      </div>
      {action && (
        <Modal
          title={action === 'accept' ? 'Record client acceptance' : pretty(action) + ' document'}
          onClose={() => setAction('')}
        >
          <form ref={ref} className="entity-form" onSubmit={(e) => e.preventDefault()}>
            {action === 'accept' ? (
              <>
                <p>This applies the contract adjustment and internal budget change exactly once.</p>
                <label>
                  Accepted by (client name)
                  <input name="acceptedByName" required />
                </label>
                <label>
                  Acceptance evidence / reference
                  <textarea name="acceptanceReference" required />
                </label>
              </>
            ) : (
              <>
                <p>
                  {change
                    ? 'This revision will no longer be available for acceptance.'
                    : 'This cancels the document family and releases its remaining commitment. Existing actual costs are retained.'}
                </p>
                <label>
                  Reason
                  <textarea name="reason" required />
                </label>
              </>
            )}
            <ActionButton
              action={async () => {
                if (!ref.current!.reportValidity())
                  throw new Error('Complete the required fields.');
                return act(action, Object.fromEntries(new FormData(ref.current!)));
              }}
              onDone={done}
            >
              Confirm {action}
            </ActionButton>
          </form>
        </Modal>
      )}
      {print && revision.snapshot && (
        <DocumentPrint
          snapshot={revision.snapshot}
          status={revision.status}
          close={() => setPrint(false)}
        />
      )}
    </section>
  );
}
function DocumentEditor({
  projectId,
  change,
  document,
  revision,
  grants,
  close,
  saved,
}: {
  projectId: string;
  change: boolean;
  document?: Document;
  revision?: Revision;
  grants: string[];
  close: () => void;
  saved: () => void;
}) {
  const options = useApi<Options>(root + 'options?projectId=' + projectId),
    ref = useRef<HTMLFormElement>(null);
  const [type, setType] = useState(
    document?.type || (grants.includes('PURCHASE_ORDER_CREATE') ? 'PURCHASE_ORDER' : 'WORK_ORDER'),
  );
  const [lines, setLines] = useState<Line[]>(revision?.lines.map((x) => ({ ...x })) || []);
  const [attachments, setAttachments] = useState(revision?.attachmentIds || []);
  const patch = (index: number, values: Partial<Line>) =>
    setLines((rows) => rows.map((x, i) => (i === index ? { ...x, ...values } : x)));
  const data = options.data;
  return (
    <Modal
      title={revision ? 'Edit draft' : change ? 'New change order' : 'New purchase / work order'}
      onClose={close}
    >
      <ErrorBox message={options.error} />
      {!data ? (
        <Loading />
      ) : (
        <form
          ref={ref}
          className="entity-form purchasing-editor"
          onSubmit={(e) => e.preventDefault()}
        >
          {!change && (
            <label>
              Document type
              <select value={type} disabled={!!document} onChange={(e) => setType(e.target.value)}>
                {['PURCHASE_ORDER', 'WORK_ORDER']
                  .filter((x) => !!document || grants.includes(x + '_CREATE'))
                  .map((x) => (
                    <option key={x} value={x}>
                      {x === 'WORK_ORDER' ? 'Work order / subcontract' : 'Purchase order'}
                    </option>
                  ))}
              </select>
            </label>
          )}
          <label>
            Title
            <input name="title" required defaultValue={revision?.title} />
          </label>
          <div className="form-grid">
            <label>
              {change ? 'Client contact' : 'Vendor / subcontractor'}
              <select
                aria-label={change ? 'Client contact' : 'Vendor / subcontractor'}
                name={change ? 'clientId' : 'vendorContactId'}
                required
                defaultValue={revision?.clientId || revision?.vendorContactId || ''}
              >
                <option value="">Select contact</option>
                {data.contacts
                  .filter((c) =>
                    change
                      ? c.types.includes('CLIENT')
                      : c.types.some((t) => ['VENDOR', 'SUBTRADE'].includes(t)),
                  )
                  .map((c) => (
                    <option value={c.id} key={c.id}>
                      {contactLabel(c)}
                    </option>
                  ))}
              </select>
            </label>
            {!change && (
              <>
                <label>
                  Billing contact
                  <select name="billingContactId" defaultValue={revision?.billingContactId || ''}>
                    <option value="">Same as vendor</option>
                    {data.contacts.map((c) => (
                      <option key={c.id} value={c.id}>
                        {contactLabel(c)}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Expected / delivery date
                  <input
                    name="expectedDate"
                    type="date"
                    defaultValue={revision?.expectedDate?.slice(0, 10)}
                  />
                </label>
                <label>
                  Schedule reference
                  <select name="scheduleTaskId" defaultValue={revision?.scheduleTaskId || ''}>
                    <option value="">None</option>
                    {data.tasks.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Related change order
                  <select
                    name="changeOrderRevisionId"
                    defaultValue={revision?.changeOrderRevisionId || ''}
                  >
                    <option value="">None</option>
                    {data.changes.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.changeOrder.number} Rev {c.revision} · {c.title}
                      </option>
                    ))}
                  </select>
                </label>
              </>
            )}
            {change && (
              <>
                <label>
                  Category / reason
                  <input name="category" defaultValue={revision?.category || ''} />
                </label>
                <label>
                  Schedule impact (days)
                  <input
                    name="scheduleDays"
                    type="number"
                    step="1"
                    min="-3650"
                    max="3650"
                    defaultValue={revision?.scheduleDays || 0}
                  />
                </label>
              </>
            )}
          </div>
          {(change
            ? ['description', 'scope', 'terms', 'internalNotes']
            : ['scope', 'terms', 'vendorNotes', 'internalNotes']
          ).map((name) => (
            <label key={name}>
              {pretty(name)}
              <textarea
                name={name}
                defaultValue={String(revision?.[name as keyof Revision] || '')}
              />
            </label>
          ))}
          <fieldset>
            <legend>Project attachments</legend>
            {data.files.length ? (
              data.files.map((f) => (
                <label className="checkbox" key={f.id}>
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
              ))
            ) : (
              <p>Upload supporting documents in Project → Files first.</p>
            )}
          </fieldset>
          <h3>Cost-code allocation</h3>
          <p>
            {change
              ? 'Internal cost and client markup remain separate.'
              : 'Vendor costs only; client markup is never applied.'}{' '}
            Amounts are calculated on the server when saved.
          </p>
          {lines.map((line, i) => (
            <fieldset key={i} className="purchasing-line-editor">
              <legend>Line {i + 1}</legend>
              <div className="form-grid">
                <label>
                  Description
                  <input
                    required
                    value={line.description}
                    onChange={(e) => patch(i, { description: e.target.value })}
                  />
                </label>
                {change && (
                  <label>
                    Client description
                    <input
                      value={line.clientDescription || ''}
                      onChange={(e) => patch(i, { clientDescription: e.target.value })}
                    />
                  </label>
                )}
                <label>
                  Cost code
                  <select
                    aria-label="Cost code"
                    required
                    value={line.costCodeId}
                    onChange={(e) =>
                      patch(i, {
                        costCodeId: e.target.value,
                        costType: data.codes.find((c) => c.id === e.target.value)?.type || 'OTHER',
                      })
                    }
                  >
                    <option value="">Select code</option>
                    {data.codes.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.code} · {c.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Cost type
                  <select
                    value={line.costType}
                    onChange={(e) => patch(i, { costType: e.target.value })}
                  >
                    {costTypes.map((x) => (
                      <option key={x}>{x}</option>
                    ))}
                  </select>
                </label>
                <label>
                  Quantity
                  <input
                    type="number"
                    required
                    min="0"
                    step=".0001"
                    value={line.quantity}
                    onChange={(e) => patch(i, { quantity: e.target.value })}
                  />
                </label>
                <label>
                  Unit
                  <input
                    required
                    value={line.unit}
                    onChange={(e) => patch(i, { unit: e.target.value })}
                  />
                </label>
                <label>
                  Unit cost
                  <input
                    type="number"
                    required
                    min={change ? undefined : '0'}
                    step=".0001"
                    value={line.unitCost}
                    onChange={(e) => patch(i, { unitCost: e.target.value })}
                  />
                </label>
                {change && (
                  <>
                    <label>
                      Markup method
                      <select
                        aria-label="Markup method"
                        value={line.markupMethod || 'NONE'}
                        onChange={(e) => patch(i, { markupMethod: e.target.value })}
                      >
                        {['NONE', 'PERCENT_ON_COST', 'FIXED'].map((x) => (
                          <option key={x}>{x}</option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Markup value
                      <input
                        type="number"
                        step=".0001"
                        value={line.markupValue || '0'}
                        onChange={(e) => patch(i, { markupValue: e.target.value })}
                      />
                    </label>
                  </>
                )}
                <label className="checkbox">
                  <input
                    type="checkbox"
                    checked={line.taxable}
                    onChange={(e) => patch(i, { taxable: e.target.checked })}
                  />
                  Taxable
                </label>
              </div>
              <button
                type="button"
                onClick={() => setLines((rows) => rows.filter((_, index) => index !== i))}
              >
                Remove line {i + 1}
              </button>
            </fieldset>
          ))}
          <button
            type="button"
            onClick={() =>
              setLines((rows) => [
                ...rows,
                {
                  costCodeId: '',
                  costType: change ? 'OTHER' : type === 'WORK_ORDER' ? 'SUBCONTRACT' : 'MATERIAL',
                  description: '',
                  quantity: '1',
                  unit: 'EA',
                  unitCost: '0',
                  markupMethod: 'NONE',
                  markupValue: '0',
                  taxable: true,
                  sortOrder: rows.length,
                },
              ])
            }
          >
            Add line
          </button>
          <ActionButton
            className="primary"
            action={async () => {
              if (!ref.current!.reportValidity()) throw new Error('Complete the required fields.');
              const values = Object.fromEntries(new FormData(ref.current!));
              const prepared = lines.map((line, i) => ({
                costCodeId: line.costCodeId,
                costType: line.costType,
                description: line.description,
                quantity: line.quantity,
                unit: line.unit,
                unitCost: line.unitCost,
                taxable: line.taxable,
                sortOrder: i,
                ...(change
                  ? {
                      clientDescription: line.clientDescription,
                      markupMethod: line.markupMethod || 'NONE',
                      markupValue: line.markupValue || '0',
                    }
                  : { lineKey: line.lineKey, internalNotes: line.internalNotes }),
              }));
              return api(root + (change ? 'changes' : 'purchasing'), {
                ...values,
                projectId,
                id: revision?.id,
                expectedVersion: revision?.version,
                attachmentIds: attachments,
                lines: prepared,
                ...(change ? { scheduleDays: Number(values.scheduleDays) } : { type }),
              });
            }}
            onDone={saved}
          >
            Save draft
          </ActionButton>
        </form>
      )}
    </Modal>
  );
}
export function DocumentPrint({
  snapshot: s,
  status,
  close,
}: {
  snapshot: Snapshot;
  status: string;
  close: () => void;
}) {
  const party = s.vendor || s.client;
  return (
    <Modal title="Document preview" onClose={close}>
      <article className="proposal-document purchasing-document">
        <h1>{s.company.name}</h1>
        <p>{s.company.address}</p>
        <hr />
        <h2>
          {pretty(s.type)} · {s.number} Rev {s.revision}
        </h2>
        <p>
          Status: {pretty(status)} · Issued {s.issuedAt.slice(0, 10)}
        </p>
        <h3>{s.title}</h3>
        <p>
          {s.project.number} · {s.project.name}
          <br />
          {s.project.address}
        </p>
        {party && (
          <address>
            {party.name}
            <br />
            {party.contactName}
            <br />
            {party.address}
            <br />
            {party.email} · {party.phone}
          </address>
        )}
        {s.billing && (
          <p>
            Billing: {s.billing.name} · {s.billing.email} · {s.billing.phone}
            <br />
            {s.billing.address}
          </p>
        )}
        {s.expectedDate && <p>Expected delivery: {s.expectedDate.slice(0, 10)}</p>}
        {s.scheduleDays !== undefined && <p>Schedule impact: {s.scheduleDays} days</p>}
        {s.description && <p>{s.description}</p>}
        {s.scope && (
          <section>
            <h3>Scope</h3>
            <p>{s.scope}</p>
          </section>
        )}
        <table>
          <thead>
            <tr>
              <th>Description</th>
              <th>Quantity</th>
              {s.type !== 'CHANGE_ORDER' && <th>Unit cost</th>}
              <th>Amount</th>
            </tr>
          </thead>
          <tbody>
            {s.lines.map((l, i) => (
              <tr key={i}>
                <td>{l.description}</td>
                <td>
                  {l.quantity} {l.unit}
                </td>
                {s.type !== 'CHANGE_ORDER' && <td>{dollars(l.unitCost || 0)}</td>}
                <td>{dollars(l.amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="proposal-total">
          <span>Subtotal</span>
          <strong>{dollars(s.subtotal)}</strong>
          <span>Tax ({Number(s.taxRate) * 100}%)</span>
          <strong>{dollars(s.tax)}</strong>
          <span>Total</span>
          <strong>{dollars(s.total)}</strong>
        </div>
        {s.notes && (
          <section>
            <h3>Notes</h3>
            <p>{s.notes}</p>
          </section>
        )}
        {s.terms && (
          <section>
            <h3>Terms</h3>
            <p>{s.terms}</p>
          </section>
        )}
        {!!s.attachments.length && (
          <section>
            <h3>Referenced attachments</h3>
            <ul>
              {s.attachments.map((f) => (
                <li key={f.id}>{f.name}</li>
              ))}
            </ul>
          </section>
        )}
      </article>
      <button className="primary no-print" onClick={() => window.print()}>
        Print / Save as PDF
      </button>
    </Modal>
  );
}
type Commitment = {
  id: string;
  reference: string;
  status: string;
  lines: {
    id: string;
    costCodeId: string;
    costType: string;
    description: string;
    committedAmount: string;
    consumedAmount: string;
  }[];
};
type Actual = {
  id: string;
  amount: string;
  description: string;
  transactionDate: string;
  costCodeId: string;
  costType: string;
  commitmentLineId?: string | null;
  reversedAt?: string | null;
  costCode: { code: string };
  commitmentLine?: { commitment: { reference: string } } | null;
};
export function CommitmentWorkspace({
  projectId,
  onChanged,
}: {
  projectId: string;
  onChanged?: () => Promise<void>;
}) {
  const query = useApi<{ commitments: Commitment[] }>(root + 'commitments?projectId=' + projectId),
    grants = useGrants();
  const actuals = useApi<{ actuals: Actual[] }>(
    grants.includes('ACTUAL_COST_VIEW')
      ? root + 'actuals?projectId=' + projectId
      : 'management/state',
  );
  const [modal, setModal] = useState<{
    kind: 'invoice' | 'reconcile' | 'reverse';
    line?: Commitment['lines'][number];
    actual?: Actual;
  } | null>(null);
  const ref = useRef<HTMLFormElement>(null);
  const refresh = () => {
    setModal(null);
    void query.refresh();
    void actuals.refresh();
    void onChanged?.();
  };
  return (
    <section className="panel">
      <h2>Commitments & actual costs</h2>
      <p>
        Remaining = committed minus consumed. Invoices and reversals update consumption in one
        transaction.
      </p>
      <ErrorBox message={query.error} />
      {query.data?.commitments.map((c) => (
        <section key={c.id}>
          <h3>
            {c.reference} <Badge value={c.status} />
          </h3>
          {c.lines.map((l) => (
            <div className="commitment-row" key={l.id}>
              <span>{l.description}</span>
              <span>Committed {dollars(l.committedAmount)}</span>
              <span>Consumed {dollars(l.consumedAmount)}</span>
              <strong>
                Remaining{' '}
                {dollars(
                  c.status === 'CANCELLED'
                    ? 0
                    : Number(l.committedAmount) - Number(l.consumedAmount),
                )}
              </strong>
              {grants.includes('ACTUAL_COST_MANAGE') &&
                grants.includes('ACTUAL_COST_RECONCILE') &&
                c.status !== 'CANCELLED' &&
                Number(l.committedAmount) > Number(l.consumedAmount) && (
                  <button onClick={() => setModal({ kind: 'invoice', line: l })}>
                    Record invoice
                  </button>
                )}
            </div>
          ))}
        </section>
      ))}
      {grants.includes('ACTUAL_COST_VIEW') && (
        <>
          <h3>Actual-cost register</h3>
          <ErrorBox message={actuals.error} />
          {actuals.data?.actuals?.map((a) => (
            <div className="commitment-row" key={a.id}>
              <span>
                {a.transactionDate.slice(0, 10)} · {a.description}
              </span>
              <span>
                {a.costCode.code} · {dollars(a.amount)}
              </span>
              <span>
                {a.reversedAt
                  ? 'Reversed'
                  : a.commitmentLine?.commitment.reference || 'Unreconciled'}
              </span>
              {!a.reversedAt && grants.includes('ACTUAL_COST_RECONCILE') && (
                <>
                  {!a.commitmentLineId && (
                    <button onClick={() => setModal({ kind: 'reconcile', actual: a })}>
                      Reconcile
                    </button>
                  )}
                  <button onClick={() => setModal({ kind: 'reverse', actual: a })}>Reverse</button>
                </>
              )}
            </div>
          ))}
        </>
      )}
      {modal && (
        <Modal
          title={
            modal.kind === 'invoice'
              ? 'Record commitment invoice'
              : modal.kind === 'reverse'
                ? 'Reverse actual cost'
                : 'Reconcile actual cost'
          }
          onClose={() => setModal(null)}
        >
          <form ref={ref} className="entity-form" onSubmit={(e) => e.preventDefault()}>
            {modal.kind === 'invoice' && (
              <>
                <label>
                  Amount (excluding recoverable tax)
                  <input name="amount" type="number" step=".01" min=".01" required />
                </label>
                <label>
                  Invoice date
                  <input
                    name="transactionDate"
                    type="date"
                    required
                    defaultValue={new Date().toISOString().slice(0, 10)}
                  />
                </label>
                <label>
                  Invoice reference / description
                  <input name="description" required minLength={3} />
                </label>
              </>
            )}
            {modal.kind === 'reconcile' && (
              <label>
                Commitment line
                <select name="commitmentLineId" required>
                  <option value="">Select matching commitment</option>
                  {query.data?.commitments
                    .filter((c) => c.status !== 'CANCELLED')
                    .flatMap((c) =>
                      c.lines
                        .filter(
                          (l) =>
                            l.costCodeId === modal.actual!.costCodeId &&
                            l.costType === modal.actual!.costType,
                        )
                        .map((l) => (
                          <option key={l.id} value={l.id}>
                            {c.reference} · {l.description} ·{' '}
                            {dollars(Number(l.committedAmount) - Number(l.consumedAmount))}{' '}
                            remaining
                          </option>
                        )),
                    )}
                </select>
              </label>
            )}
            {modal.kind === 'reverse' && (
              <label>
                Reversal reason
                <textarea name="reason" required minLength={3} />
              </label>
            )}
            <ActionButton
              action={async () => {
                if (!ref.current!.reportValidity())
                  throw new Error('Complete the required fields.');
                const values = Object.fromEntries(new FormData(ref.current!));
                return modal.kind === 'invoice'
                  ? api(root + 'actuals', {
                      ...values,
                      projectId,
                      commitmentLineId: modal.line!.id,
                      costCodeId: modal.line!.costCodeId,
                      costType: modal.line!.costType,
                    })
                  : api(root + 'actuals/' + modal.kind, { ...values, id: modal.actual!.id });
              }}
              onDone={refresh}
            >
              Save {modal.kind}
            </ActionButton>
          </form>
        </Modal>
      )}
    </section>
  );
}
type Overview = {
  purchases: {
    id: string;
    projectId: string;
    project: string;
    number: string;
    status: string;
    title: string;
    type: string;
  }[];
  changes: {
    id: string;
    projectId: string;
    project: string;
    number: string;
    status: string;
    title: string;
  }[];
  remainingCommitted: string | null;
  approvedChanges: string | null;
  unreconciled: number | null;
};
export function ProcurementOverview({
  projectId,
  compact = false,
}: {
  projectId?: string;
  compact?: boolean;
}) {
  const query = useApi<Overview>(root + 'overview' + (projectId ? '?projectId=' + projectId : ''));
  if (!query.data) return query.error ? <ErrorBox message={query.error} /> : null;
  const d = query.data,
    open = d.purchases.filter((x) => !['CANCELLED', 'FULFILLED', 'SUPERSEDED'].includes(x.status)),
    pending = d.changes.filter(
      (x) => !['ACCEPTED', 'VOID', 'REJECTED', 'SUPERSEDED'].includes(x.status),
    );
  if (compact && !open.length && !pending.length && d.remainingCommitted === null) return null;
  return (
    <section className="panel wide">
      <h2>{compact ? 'Purchasing & changes' : 'Financial work queue'}</h2>
      <div className="finance-summary">
        <div>
          <small>Open purchasing documents</small>
          <strong>{open.length}</strong>
        </div>
        <div>
          <small>Awaiting internal approval</small>
          <strong>
            {d.purchases.filter((x) => x.status === 'INTERNAL_REVIEW').length +
              d.changes.filter((x) => x.status === 'INTERNAL_REVIEW').length}
          </strong>
        </div>
        <div>
          <small>Pending change orders</small>
          <strong>{pending.length}</strong>
        </div>
        {d.remainingCommitted !== null && (
          <div>
            <small>Remaining committed</small>
            <strong>{dollars(d.remainingCommitted)}</strong>
          </div>
        )}
        {d.approvedChanges !== null && (
          <div>
            <small>Accepted change orders</small>
            <strong>{dollars(d.approvedChanges)}</strong>
          </div>
        )}
        {d.unreconciled !== null && (
          <div>
            <small>Unreconciled actuals</small>
            <strong>{d.unreconciled}</strong>
          </div>
        )}
      </div>
      {!compact && (
        <div className="management-grid">
          <section>
            <h3>Purchasing awaiting action</h3>
            {open.map((x) => (
              <p key={x.id}>
                <Link href={'/projects/' + x.projectId + '/purchase-orders'}>
                  {x.number} · {x.project}
                </Link>{' '}
                <Badge value={x.status} />
              </p>
            ))}
          </section>
          <section>
            <h3>Change orders awaiting action</h3>
            {pending.map((x) => (
              <p key={x.id}>
                <Link href={'/projects/' + x.projectId + '/change-orders'}>
                  {x.number} · {x.project}
                </Link>{' '}
                <Badge value={x.status} />
              </p>
            ))}
          </section>
        </div>
      )}
    </section>
  );
}
export function BudgetHistory({ projectId }: { projectId: string }) {
  const query = useApi<{
    budgets: {
      id: string;
      versions: {
        id: string;
        version: number;
        type: string;
        description: string;
        lines: { amount: string }[];
      }[];
    }[];
  }>(root + 'budget-history?projectId=' + projectId);
  return (
    <details className="panel">
      <summary>Budget version history</summary>
      <ErrorBox message={query.error} />
      {query.data?.budgets.flatMap((b) =>
        b.versions.map((v) => (
          <p key={v.id}>
            Version {v.version} · {pretty(v.type)} ·{' '}
            {dollars(v.lines.reduce((a, l) => a + Number(l.amount), 0))} · {v.description}
          </p>
        )),
      )}
    </details>
  );
}
export function VarianceAlerts() {
  const grants = useGrants();
  return grants.includes('JOB_COST_VIEW') ? <VarianceList /> : null;
}
function VarianceList() {
  const query = useApi<{ alerts: { project: { id: string; name: string }; variance: string }[] }>(
    root + 'variance',
  );
  return (
    <section className="panel">
      <h2>Budget variance alerts</h2>
      <ErrorBox message={query.error} />
      {query.data?.alerts.length ? (
        query.data.alerts.map((a) => (
          <p key={a.project.id}>
            <Link href={'/projects/' + a.project.id + '/budget'}>{a.project.name}</Link> ·{' '}
            {dollars(a.variance)}
          </p>
        ))
      ) : (
        <p>No forecast overruns reported.</p>
      )}
    </section>
  );
}
