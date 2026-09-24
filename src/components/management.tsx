'use client';
import Link from 'next/link';
import { FormEvent, useState } from 'react';
import { BriefcaseBusiness, Clock3, FolderKanban, Plus, Search } from 'lucide-react';
import { api, date, pretty, useApi } from '@/lib/client';
import { ActionButton, Badge, Empty, ErrorBox, Loading, Modal } from './ui';
import { ProjectWorkspace } from './project-operations';

type Project = {
  id: string;
  number: string;
  name: string;
  description?: string | null;
  projectType?: string | null;
  status: string;
  stage?: string | null;
  address?: string | null;
  municipality?: string | null;
  province?: string | null;
  postalCode?: string | null;
  startDate?: string | null;
  targetCompletion?: string | null;
  actualCompletion?: string | null;
  internalNotes?: string | null;
  clientVisibleNotes?: string | null;
  contacts: Array<{
    role: string;
    primary: boolean;
    contact: { id: string; firstName: string; lastName: string; company?: { name: string } | null };
  }>;
  assignments: Array<{
    role: string;
    primary: boolean;
    user: { id: string; firstName: string; lastName: string };
  }>;
  segments?: Array<{ effectiveStart: string; end?: string | null }>;
  _count?: { segments: number };
};
type Options = {
  users: Array<{ id: string; firstName: string; lastName: string }>;
  contacts: Array<{ id: string; firstName: string; lastName: string }>;
  companies: Array<{ id: string; name: string }>;
};
const statuses = [
  'LEAD',
  'PRECONSTRUCTION',
  'DESIGN',
  'ESTIMATING',
  'CONTRACT_PENDING',
  'ACTIVE',
  'ON_HOLD',
  'SUBSTANTIALLY_COMPLETE',
  'WARRANTY',
  'COMPLETE',
  'ARCHIVED',
];

export function DashboardScreen() {
  const { data, error } = useApi<{
    activeProjects: number;
    clockedIn: number;
    pendingApprovals: number;
    byStage: Array<{ stage: string | null; _count: number }>;
    upcoming: Array<{ id: string; number: string; name: string; targetCompletion: string }>;
    activity: Array<{
      id: string;
      action: string;
      description?: string | null;
      entityId: string;
      createdAt: string;
      project?: { id: string; name: string } | null;
      actor?: { firstName: string; lastName: string } | null;
    }>;
  }>('management/dashboard');
  if (!data && !error) return <Loading />;
  return (
    <ManagementPage
      eyebrow="Management"
      title="Dashboard"
      intro="Live operational information from CWManagement."
    >
      <ErrorBox message={error} />
      {data && (
        <>
          <div className="metric-grid">
            <Metric label="Active projects" value={data.activeProjects} icon={FolderKanban} />
            <Metric label="Clocked in now" value={data.clockedIn} icon={Clock3} />
            <Metric
              label="Pending approvals"
              value={data.pendingApprovals}
              icon={BriefcaseBusiness}
            />
          </div>
          <div className="management-grid">
            <section className="panel">
              <h2>Projects by stage</h2>
              {data.byStage.length ? (
                data.byStage.map((x) => (
                  <div className="data-row" key={x.stage ?? 'Unassigned'}>
                    <span>{x.stage || 'Stage not set'}</span>
                    <strong>{x._count}</strong>
                  </div>
                ))
              ) : (
                <Empty title="No active projects">Create your first project to begin.</Empty>
              )}
            </section>
            <section className="panel">
              <h2>Upcoming target dates</h2>
              {data.upcoming.length ? (
                data.upcoming.map((x) => (
                  <Link className="data-row" href={`/projects/${x.id}`} key={x.id}>
                    <span>
                      <strong>{x.number}</strong> · {x.name}
                    </span>
                    <span>{date(x.targetCompletion)}</span>
                  </Link>
                ))
              ) : (
                <Empty title="No targets in the next 30 days">
                  Upcoming project dates will appear here.
                </Empty>
              )}
            </section>
            <section className="panel wide">
              <h2>Recent project activity</h2>
              {data.activity.length ? (
                data.activity.map((x) => (
                  <Link
                    className="data-row"
                    href={x.project ? `/projects/${x.project.id}` : '#'}
                    key={x.id}
                  >
                    <span>
                      <strong>{x.project?.name}</strong>
                      <small>
                        {x.actor ? `${x.actor.firstName} ${x.actor.lastName} ` : 'System '}
                        {x.description || pretty(x.action)}
                      </small>
                    </span>
                    <span>{date(x.createdAt)}</span>
                  </Link>
                ))
              ) : (
                <Empty title="No recent activity">Audited project changes will appear here.</Empty>
              )}
            </section>
          </div>
        </>
      )}
    </ManagementPage>
  );
}

function Metric({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: number;
  icon: typeof Clock3;
}) {
  return (
    <div className="metric">
      <Icon />
      <div>
        <strong>{value}</strong>
        <span>{label}</span>
      </div>
    </div>
  );
}
function ManagementPage({
  eyebrow,
  title,
  intro,
  actions,
  children,
}: {
  eyebrow: string;
  title: string;
  intro?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="management-page">
      <div className="page-heading management-heading">
        <div>
          <span className="eyebrow">{eyebrow}</span>
          <h1>{title}</h1>
          {intro && <p>{intro}</p>}
        </div>
        {actions}
      </div>
      {children}
    </div>
  );
}

export function ProjectsScreen() {
  const [query, setQuery] = useState(''),
    [status, setStatus] = useState(''),
    [archived, setArchived] = useState(false),
    [create, setCreate] = useState(false);
  const path = `management/projects?q=${encodeURIComponent(query)}&status=${encodeURIComponent(status)}&archived=${archived}`;
  const { data, error, refresh } = useApi<{ projects: Project[] }>(path);
  return (
    <ManagementPage
      eyebrow="Portfolio"
      title="Projects"
      intro="Current, upcoming, and archived Cedar Winds work."
      actions={
        <button className="primary" onClick={() => setCreate(true)}>
          <Plus size={18} /> New project
        </button>
      }
    >
      <div className="filter-bar">
        <label className="search-field">
          <Search size={17} />
          <input
            aria-label="Search projects"
            placeholder="Search number, name, or location"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
        <select
          aria-label="Project status"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
        >
          <option value="">All statuses</option>
          {statuses.map((x) => (
            <option key={x} value={x}>
              {pretty(x)}
            </option>
          ))}
        </select>
        <label className="check-inline">
          <input
            type="checkbox"
            checked={archived}
            onChange={(e) => setArchived(e.target.checked)}
          />{' '}
          Archived
        </label>
      </div>
      <ErrorBox message={error} />
      {!data ? (
        <Loading />
      ) : data.projects.length ? (
        <div className="project-table">
          <div className="project-table-head">
            <span>Project</span>
            <span>Client</span>
            <span>PM</span>
            <span>Status / stage</span>
            <span>Dates</span>
            <span>Location</span>
          </div>
          {data.projects.map((p) => (
            <Link href={`/projects/${p.id}`} className="project-table-row" key={p.id}>
              <span>
                <strong>{p.number}</strong>
                <b>{p.name}</b>
              </span>
              <span>
                {p.contacts.find((c) => c.role === 'CLIENT')?.contact.firstName}{' '}
                {p.contacts.find((c) => c.role === 'CLIENT')?.contact.lastName || '—'}
              </span>
              <span>
                {p.assignments.find((a) => a.role.includes('PROJECT_MANAGER'))?.user.firstName ||
                  '—'}{' '}
                {p.assignments.find((a) => a.role.includes('PROJECT_MANAGER'))?.user.lastName}
              </span>
              <span>
                <Badge value={p.status} />
                <small>{p.stage || 'Stage not set'}</small>
              </span>
              <span>
                {p.startDate ? date(p.startDate) : '—'}
                <small>Target {p.targetCompletion ? date(p.targetCompletion) : 'not set'}</small>
              </span>
              <span>{[p.municipality, p.province].filter(Boolean).join(', ') || '—'}</span>
            </Link>
          ))}
        </div>
      ) : (
        <Empty title="No projects found">Adjust the filters or create a project.</Empty>
      )}
      {create && (
        <ProjectForm
          onClose={() => setCreate(false)}
          onSaved={() => {
            setCreate(false);
            void refresh();
          }}
        />
      )}
    </ManagementPage>
  );
}

function ProjectForm({
  project,
  onClose,
  onSaved,
}: {
  project?: Project;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { data } = useApi<Options>('management/options');
  const submit = (form: HTMLFormElement) => {
    const f = new FormData(form);
    return api('management/projects', {
      id: project?.id,
      number: f.get('number'),
      name: f.get('name'),
      description: f.get('description'),
      projectType: f.get('projectType'),
      status: f.get('status'),
      stage: f.get('stage'),
      address: f.get('address'),
      municipality: f.get('municipality'),
      province: f.get('province'),
      postalCode: f.get('postalCode'),
      startDate: f.get('startDate'),
      targetCompletion: f.get('targetCompletion'),
      actualCompletion: f.get('actualCompletion'),
      contractAmount: f.get('contractAmount'),
      internalNotes: f.get('internalNotes'),
      clientVisibleNotes: f.get('clientVisibleNotes'),
      assignmentUserId: f.get('assignmentUserId') || null,
      assignmentRole: f.get('assignmentUserId') ? 'PRIMARY_PROJECT_MANAGER' : undefined,
      contactId: f.get('contactId') || null,
      contactRole: f.get('contactId') ? 'CLIENT' : undefined,
    });
  };
  return (
    <Modal title={project ? 'Edit project' : 'Create project'} onClose={onClose}>
      <form
        className="entity-form"
        onSubmit={(e: FormEvent<HTMLFormElement>) => e.preventDefault()}
      >
        <div className="form-grid">
          <label>
            Project number
            <input name="number" required defaultValue={project?.number} />
          </label>
          <label>
            Project name
            <input name="name" required defaultValue={project?.name} />
          </label>
          <label>
            Status
            <select name="status" defaultValue={project?.status || 'ACTIVE'}>
              {statuses.map((x) => (
                <option key={x} value={x}>
                  {pretty(x)}
                </option>
              ))}
            </select>
          </label>
          <label>
            Stage
            <input name="stage" defaultValue={project?.stage || ''} />
          </label>
          <label>
            Project type
            <input name="projectType" defaultValue={project?.projectType || ''} />
          </label>
          <label>
            Primary PM
            <select name="assignmentUserId" defaultValue="">
              <option value="">Not assigned</option>
              {data?.users.map((x) => (
                <option value={x.id} key={x.id}>
                  {x.firstName} {x.lastName}
                </option>
              ))}
            </select>
          </label>
          <label>
            Primary client
            <select name="contactId" defaultValue="">
              <option value="">Not assigned</option>
              {data?.contacts.map((x) => (
                <option value={x.id} key={x.id}>
                  {x.firstName} {x.lastName}
                </option>
              ))}
            </select>
          </label>
          <label>
            Address
            <input name="address" defaultValue={project?.address || ''} />
          </label>
          <label>
            Municipality
            <input name="municipality" defaultValue={project?.municipality || ''} />
          </label>
          <label>
            Province
            <input name="province" defaultValue={project?.province || 'ON'} />
          </label>
          <label>
            Postal code
            <input name="postalCode" defaultValue={project?.postalCode || ''} />
          </label>
          <label>
            Start date
            <input name="startDate" type="date" defaultValue={project?.startDate?.slice(0, 10)} />
          </label>
          <label>
            Target completion
            <input
              name="targetCompletion"
              type="date"
              defaultValue={project?.targetCompletion?.slice(0, 10)}
            />
          </label>
          <label>
            Actual completion
            <input
              name="actualCompletion"
              type="date"
              defaultValue={project?.actualCompletion?.slice(0, 10)}
            />
          </label>
          <label>
            Contract amount
            <input name="contractAmount" type="number" min="0" step="0.01" />
          </label>
        </div>
        <label>
          Description
          <textarea name="description" defaultValue={project?.description || ''} />
        </label>
        <label>
          Internal notes
          <textarea name="internalNotes" defaultValue={project?.internalNotes || ''} />
        </label>
        <label>
          Client-visible notes
          <textarea name="clientVisibleNotes" defaultValue={project?.clientVisibleNotes || ''} />
        </label>
        <ActionButton
          className="primary full"
          action={() => submit(document.activeElement?.closest('form') as HTMLFormElement)}
          onDone={onSaved}
        >
          Save project
        </ActionButton>
      </form>
    </Modal>
  );
}

export function ProjectScreen({ id, tab }: { id: string; tab?: string }) {
  return <ProjectWorkspace id={id} tab={tab} />;
}

export { ContactsScreen } from './contacts';

export function PlaceholderScreen({ title }: { title: string }) {
  return (
    <ManagementPage eyebrow="Coming in a later phase" title={title}>
      <div className="panel placeholder-panel">
        <BriefcaseBusiness size={32} />
        <h2>Architecture ready</h2>
        <p>
          This module has a place in the application shell and domain roadmap, but no fake workflow
          has been added.
        </p>
      </div>
    </ManagementPage>
  );
}
