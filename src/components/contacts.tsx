'use client';
import { useRef, useState } from 'react';
import { api, pretty, useApi } from '@/lib/client';
import { ActionButton, Badge, ErrorBox, Modal } from './ui';
type Company = {
  id: string;
  name: string;
  legalName?: string | null;
  email?: string | null;
  phone?: string | null;
  website?: string | null;
  address?: string | null;
  municipality?: string | null;
  province?: string | null;
  postalCode?: string | null;
  notes?: string | null;
  active: boolean;
};
type Contact = {
  id: string;
  firstName: string;
  lastName: string;
  companyId?: string | null;
  company?: Company | null;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  municipality?: string | null;
  province?: string | null;
  postalCode?: string | null;
  notes?: string | null;
  active: boolean;
  types: string[];
};
export function ContactsScreen() {
  const [q, setQ] = useState(''),
    [edit, setEdit] = useState<Contact | null | false>(false),
    [company, setCompany] = useState<Company | null | false>(false);
  const query = useApi<{ contacts: Contact[] }>('management/contacts?q=' + encodeURIComponent(q)),
    companies = useApi<{ companies: Company[] }>('management/companies');
  const done = () => {
    setEdit(false);
    setCompany(false);
    void query.refresh();
    void companies.refresh();
  };
  return (
    <div className="management-page">
      <div className="page-heading">
        <div>
          <h1>Contacts & companies</h1>
          <p>Clients, suppliers, subcontractors, and the people who represent them.</p>
        </div>
        <div className="button-row">
          <button onClick={() => setCompany(null)}>New company</button>
          <button className="primary" onClick={() => setEdit(null)}>
            New contact
          </button>
        </div>
      </div>
      <label>
        Search contacts
        <input value={q} onChange={(e) => setQ(e.target.value)} />
      </label>
      <ErrorBox message={query.error} />
      <div className="contact-grid">
        {query.data?.contacts.map((c) => (
          <article className="panel" key={c.id}>
            <h2>
              {c.firstName} {c.lastName}
            </h2>
            <p>{c.company?.name || 'Independent contractor / contact'}</p>
            <p>
              {c.email} · {c.phone}
            </p>
            <div className="tag-row">
              {c.types.map((t) => (
                <Badge key={t} value={t} />
              ))}
              {!c.active && <Badge value="INACTIVE" />}
            </div>
            <button onClick={() => setEdit(c)}>Edit contact</button>
          </article>
        ))}
      </div>
      <details className="panel">
        <summary>Company directory</summary>
        <ErrorBox message={companies.error} />
        {companies.data?.companies.map((c) => (
          <div className="data-row" key={c.id}>
            <span>
              {c.name} {!c.active && '(Inactive)'}
            </span>
            <button onClick={() => setCompany(c)}>Edit company</button>
          </div>
        ))}
      </details>
      {edit !== false && (
        <ContactEditor
          contact={edit}
          companies={companies.data?.companies || []}
          close={() => setEdit(false)}
          saved={done}
        />
      )}
      {company !== false && (
        <CompanyEditor company={company} close={() => setCompany(false)} saved={done} />
      )}
    </div>
  );
}
function ContactEditor({
  contact,
  companies,
  close,
  saved,
}: {
  contact: Contact | null;
  companies: Company[];
  close: () => void;
  saved: () => void;
}) {
  const ref = useRef<HTMLFormElement>(null),
    [types, setTypes] = useState(contact?.types || ['VENDOR']);
  return (
    <Modal title={contact ? 'Edit contact' : 'New contact'} onClose={close}>
      <form className="entity-form" ref={ref} onSubmit={(e) => e.preventDefault()}>
        <div className="form-grid">
          {(
            [
              'firstName',
              'lastName',
              'email',
              'phone',
              'address',
              'municipality',
              'province',
              'postalCode',
            ] as const
          ).map((name) => (
            <label key={name}>
              {pretty(name)}
              <input
                name={name}
                required={name === 'firstName' || name === 'lastName'}
                type={name === 'email' ? 'email' : 'text'}
                defaultValue={contact?.[name] || ''}
              />
            </label>
          ))}
          <label>
            Company
            <select name="companyId" defaultValue={contact?.companyId || ''}>
              <option value="">Independent / none</option>
              {companies.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
        </div>
        <fieldset>
          <legend>Contact types</legend>
          {[
            'CLIENT',
            'PROSPECT',
            'SUBTRADE',
            'VENDOR',
            'CONSULTANT',
            'ENGINEER',
            'ARCHITECT',
            'DESIGNER',
            'OTHER',
          ].map((t) => (
            <label className="checkbox" key={t}>
              <input
                type="checkbox"
                checked={types.includes(t)}
                onChange={(e) =>
                  setTypes(e.target.checked ? [...types, t] : types.filter((x) => x !== t))
                }
              />
              {pretty(t)}
            </label>
          ))}
        </fieldset>
        <label>
          Notes / contact responsibilities
          <textarea name="notes" defaultValue={contact?.notes || ''} />
        </label>
        <label className="checkbox">
          <input type="checkbox" name="active" defaultChecked={contact?.active ?? true} />
          Active
        </label>
        <ActionButton
          action={async () => {
            if (!ref.current!.reportValidity()) throw new Error('Complete required fields.');
            const f = new FormData(ref.current!);
            return api('management/contacts', {
              ...Object.fromEntries(f),
              id: contact?.id,
              types,
              active: f.has('active'),
            });
          }}
          onDone={saved}
        >
          Save contact
        </ActionButton>
      </form>
    </Modal>
  );
}
function CompanyEditor({
  company,
  close,
  saved,
}: {
  company: Company | null;
  close: () => void;
  saved: () => void;
}) {
  const ref = useRef<HTMLFormElement>(null);
  return (
    <Modal title={company ? 'Edit company' : 'New company'} onClose={close}>
      <form className="entity-form" ref={ref} onSubmit={(e) => e.preventDefault()}>
        <div className="form-grid">
          {(
            [
              'name',
              'legalName',
              'email',
              'phone',
              'website',
              'address',
              'municipality',
              'province',
              'postalCode',
            ] as const
          ).map((name) => (
            <label key={name}>
              {pretty(name)}
              <input
                name={name}
                required={name === 'name'}
                type={name === 'email' ? 'email' : 'text'}
                defaultValue={company?.[name] || ''}
              />
            </label>
          ))}
        </div>
        <label>
          Notes
          <textarea name="notes" defaultValue={company?.notes || ''} />
        </label>
        <label className="checkbox">
          <input name="active" type="checkbox" defaultChecked={company?.active ?? true} />
          Active
        </label>
        <ActionButton
          action={async () => {
            if (!ref.current!.reportValidity()) throw new Error('Complete required fields.');
            const f = new FormData(ref.current!);
            return api('management/companies', {
              ...Object.fromEntries(f),
              id: company?.id,
              active: f.has('active'),
            });
          }}
          onDone={saved}
        >
          Save company
        </ActionButton>
      </form>
    </Modal>
  );
}
