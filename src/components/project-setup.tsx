'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, useApi } from '@/lib/client';
import { Modal, ActionButton, ErrorBox } from './ui';
import type { Template } from './templates';
export function ProjectWizard({ close }: { close: () => void }) {
  const [team, setTeam] = useState<Record<string, string>>({});
  const router = useRouter();
  const [step, setStep] = useState(0),
    [draft, setDraft] = useState({
      name: '',
      number: '',
      projectType: '',
      address: '',
      municipality: '',
      contactId: '',
      managerId: '',
      startDate: new Date().toISOString().slice(0, 10),
      targetCompletion: '',
      templateId: '',
      sourceProjectId: '',
    }),
    [newClient, setNewClient] = useState(false),
    [client, setClient] = useState({ firstName: '', lastName: '', email: '' }),
    [copy, setCopy] = useState(['SCHEDULE', 'ESTIMATE', 'SELECTION']);
  const options = useApi<{
    users: { id: string; firstName: string; lastName: string }[];
    clients: { id: string; firstName: string; lastName: string }[];
    templates: Template[];
  }>('standards/setup');
  const projects = useApi<{ projects: { id: string; name: string; number: string }[] }>(
    'management/projects',
  );
  const template = options.data?.templates.find((t) => t.id === draft.templateId);
  const steps = ['Project & client', 'Details & team', 'Starting structure', 'Review & create'];
  const field = (key: keyof typeof draft, label: string, type = 'text') => (
    <label>
      {label}
      <input
        type={type}
        value={draft[key]}
        onChange={(e) => setDraft({ ...draft, [key]: e.target.value })}
      />
    </label>
  );
  return (
    <Modal title="Start a project" onClose={close}>
      <ol className="wizard-steps">
        {steps.map((s, i) => (
          <li key={s} aria-current={step === i ? 'step' : undefined}>
            <span>{i + 1}</span>
            {s}
          </li>
        ))}
      </ol>
      <ErrorBox message={options.error} />
      <div className="entity-form">
        {step === 0 && (
          <>
            <h3>What are we building, and for whom?</h3>
            {field('projectType', 'Project type')}
            <p className="muted">
              Use your own project type, such as cottage, renovation or addition.
            </p>
            <label className="check-inline">
              <input
                type="checkbox"
                checked={newClient}
                onChange={(e) => setNewClient(e.target.checked)}
              />
              Create a new client contact
            </label>
            {newClient ? (
              <div className="form-grid">
                {(['firstName', 'lastName', 'email'] as const).map((k) => (
                  <label key={k}>
                    {k === 'firstName' ? 'First name' : k === 'lastName' ? 'Last name' : 'Email'}
                    <input
                      value={client[k]}
                      onChange={(e) => setClient({ ...client, [k]: e.target.value })}
                    />
                  </label>
                ))}
              </div>
            ) : (
              <label>
                Client
                <select
                  aria-label="Client"
                  value={draft.contactId}
                  onChange={(e) => setDraft({ ...draft, contactId: e.target.value })}
                >
                  <option value="">Choose existing client…</option>
                  {options.data?.clients.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.firstName} {c.lastName}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </>
        )}
        {step === 1 && (
          <>
            <div className="form-grid">
              {field('name', 'Project name')}
              {field('number', 'Project number')}
              {field('address', 'Site address')}
              {field('municipality', 'Municipality')}
              {field('startDate', 'Approximate start', 'date')}
              {field('targetCompletion', 'Target completion', 'date')}
            </div>
            <label>
              Project manager
              <select
                aria-label="Project manager"
                value={draft.managerId}
                onChange={(e) => setDraft({ ...draft, managerId: e.target.value })}
              >
                <option value="">Choose a team member…</option>
                {options.data?.users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.firstName} {u.lastName}
                  </option>
                ))}
              </select>
            </label>
          </>
        )}
        {step === 2 && (
          <>
            <h3>Start with company standards</h3>
            <label>
              Project template
              <select
                aria-label="Project template"
                value={draft.templateId}
                onChange={(e) =>
                  setDraft({ ...draft, templateId: e.target.value, sourceProjectId: '' })
                }
              >
                <option value="">Blank project</option>
                {options.data?.templates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </label>
            {template && (
              <p>
                {template.content.tasks.length} schedule tasks · {template.content.lines.length}{' '}
                estimate items · {template.content.selections.length} selections
              </p>
            )}
            <label>
              Or start from an existing project
              <select
                value={draft.sourceProjectId}
                onChange={(e) =>
                  setDraft({ ...draft, sourceProjectId: e.target.value, templateId: '' })
                }
              >
                <option value="">Do not copy a project</option>
                {projects.data?.projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.number} · {p.name}
                  </option>
                ))}
              </select>
            </label>
            {draft.sourceProjectId && (
              <>
                {['SCHEDULE', 'ESTIMATE', 'SELECTION', 'PROPOSAL'].map((k) => (
                  <label className="check-inline" key={k}>
                    <input
                      type="checkbox"
                      checked={copy.includes(k)}
                      onChange={(e) =>
                        setCopy(e.target.checked ? [...copy, k] : copy.filter((x) => x !== k))
                      }
                    />
                    {k.toLowerCase()} structure
                  </label>
                ))}
                <p>
                  Copies become new private drafts. Approvals, messages, actual costs, commitments,
                  time and accounting records are not copied.
                </p>
              </>
            )}
          </>
        )}
        {step === 3 && (
          <>
            {(template?.content.teamRoles || [])
              .filter((r) => r !== 'PRIMARY_PROJECT_MANAGER')
              .map((role) => (
                <label key={role}>
                  {role.toLowerCase().replaceAll('_', ' ')}
                  <select
                    value={team[role] || ''}
                    onChange={(e) => setTeam({ ...team, [role]: e.target.value })}
                  >
                    <option value="">Assign team member…</option>
                    {options.data?.users.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.firstName} {u.lastName}
                      </option>
                    ))}
                  </select>
                </label>
              ))}
            <h3>
              {draft.number} · {draft.name}
            </h3>
            <p>
              {draft.address}, {draft.municipality}
            </p>
            <p>
              Start: {draft.startDate} · Target: {draft.targetCompletion || 'Not set'}
            </p>
            <p>
              Starting structure:{' '}
              {template?.name ||
                (draft.sourceProjectId ? 'Selected existing project content' : 'Blank project')}
            </p>
            <p>
              The project manager and creator will have project assignments. Publishing and
              financial approvals remain deliberate next steps.
            </p>
            <ActionButton
              className="primary"
              action={async () => {
                const result = await api<{ id: string }>('standards/setup', {
                  team: Object.entries(team)
                    .filter(([, userId]) => !!userId)
                    .map(([role, userId]) => ({ role, userId })),
                  ...draft,
                  contactId: newClient ? undefined : draft.contactId || undefined,
                  newClient: newClient ? client : undefined,
                  targetCompletion: draft.targetCompletion || undefined,
                  templateId: draft.templateId || undefined,
                  templateVersion: template?.version,
                  sourceProjectId: draft.sourceProjectId || undefined,
                  copy,
                });
                router.push(`/projects/${result.id}`);
                close();
              }}
            >
              Create project
            </ActionButton>
          </>
        )}
        <div className="section-actions">
          <button disabled={step === 0} onClick={() => setStep(step - 1)}>
            Back
          </button>
          {step < 3 && (
            <button
              className="primary"
              disabled={
                step === 1 && (!draft.name || !draft.number || !draft.managerId || !draft.startDate)
              }
              onClick={() => setStep(step + 1)}
            >
              Continue
            </button>
          )}
        </div>
      </div>
    </Modal>
  );
}
