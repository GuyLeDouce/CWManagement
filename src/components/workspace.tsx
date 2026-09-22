'use client';
import Link from 'next/link';
import { useState } from 'react';
import {
  Clock3,
  MapPin,
  CheckCheck,
  ChartNoAxesColumn,
  Send,
  Settings,
  HardHat,
  ArrowUpRight,
  LogOut,
  Monitor,
  Menu,
  Download,
  LayoutDashboard,
  FolderKanban,
  CalendarDays,
  Landmark,
  ContactRound,
  BarChart3,
  UserRoundSearch,
} from 'lucide-react';
import { useApi, api } from '@/lib/client';
import type { State } from '@/lib/client-types';
import { Brand } from './brand';
import { HoursModal } from './hours';
import { ClockScreen } from './clock';
import { LocateScreen } from './locations';
import { RecordsScreen } from './records';
import { InfoScreen } from './info';
import { AdminScreen } from './admin';
import { VisitsScreen } from './visits';
import { ErrorBox, Loading, ActionButton, Modal } from './ui';
import { ContactsScreen, DashboardScreen, PlaceholderScreen, ProjectsScreen, ProjectScreen } from './management';
const items = [
  { view: '', label: 'Dashboard', icon: LayoutDashboard },
  { view: 'leads', label: 'Leads', icon: UserRoundSearch },
  { view: 'projects', label: 'Projects', icon: FolderKanban },
  { view: 'schedule', label: 'Schedule', icon: CalendarDays },
  { view: 'financials', label: 'Financials', icon: Landmark },
  { view: 'time', label: 'Time', icon: Clock3 },
  { view: 'contacts', label: 'Contacts', icon: ContactRound },
  { view: 'reports', label: 'Reports', icon: BarChart3 },
  { view: 'locate', label: 'Locate', icon: MapPin },
  { view: 'verify', label: 'Verify', icon: CheckCheck },
  { view: 'info', label: 'Info', icon: ChartNoAxesColumn },
  { view: 'send', label: 'Send', icon: Send },
  { view: 'visits', label: 'Site visit', icon: HardHat },
  { view: 'admin', label: 'Settings', icon: Settings },
];
export function Workspace({ path }: { path: string[] }) {
  const token = path[0] === 'scan' ? path[1] : undefined,
    view = path[0] === 'scan' ? '' : (path[0] ?? '');
  const { data, error, refresh } = useApi<State>(
    `state${token ? `?qr=${encodeURIComponent(token)}` : ''}`,
  );
  const [hours, setHours] = useState(false),
    [menu, setMenu] = useState(false),
    [install, setInstall] = useState(false);
  const has = (...roles: string[]) => data?.user.roles.some((r) => roles.includes(r)) ?? false;
  const managementUser = has('OWNER', 'ADMIN', 'PM', 'PROJECT_MANAGER', 'CONTROLLER', 'OFFICE', 'ESTIMATOR', 'DESIGNER');
  const controllerLocked = has('CONTROLLER') && !has('OWNER', 'PM') && !data?.current;
  const visible = items.filter(
    (i) =>
      (['', 'leads', 'projects', 'schedule', 'time', 'reports'].includes(i.view) && managementUser) ||
      (i.view === 'financials' && has('OWNER', 'CONTROLLER')) ||
      (i.view === 'contacts' && has('OWNER', 'ADMIN', 'OFFICE')) ||
      (i.view === 'locate' && has('OWNER', 'PM', 'CONTROLLER')) ||
      (i.view === 'verify' && has('OWNER', 'PM')) ||
      (['info', 'send'].includes(i.view) && has('OWNER', 'CONTROLLER')) ||
      (i.view === 'visits' && has('OWNER')) ||
      (i.view === 'admin' && has('OWNER', 'ADMIN')),
  );
  if (!managementUser) visible.unshift({ view: 'time', label: 'Time', icon: Clock3 });
  const management = visible.length > 1;
  const permitted = visible.some((i) => i.view === view) || (!managementUser && view === '');
  return (
    <div className="app-shell">
      <header className="app-header">
        <button className="brand-button" aria-label="Open My Hours" onClick={() => setHours(true)}>
          <Brand />
          <span className="my-hours-label">
            My hours
            <ArrowUpRight size={13} />
          </span>
        </button>
        <div className="header-right">
          <span className="header-user">
            {data?.user.firstName} {data?.user.lastName}
          </span>
          <button className="icon-button" onClick={() => setInstall(true)} aria-label="Install app">
            <Download size={19} />
          </button>
          <button
            className="icon-button"
            aria-label="Sign out"
            onClick={async () => {
              try {
                await api('auth/logout', {});
                // A hard navigation clears all previously loaded private client state.
                // eslint-disable-next-line @next/next/no-location-assign-relative-destination
                window.location.assign('/login');
              } catch {
                window.alert('Unable to sign out. Check your connection and try again.');
              }
            }}
          >
            <LogOut size={19} />
          </button>
          {management && (
            <button
              className="icon-button mobile-menu"
              aria-label="Open menu"
              onClick={() => setMenu(!menu)}
            >
              <Menu size={22} />
            </button>
          )}
        </div>
      </header>
      <div className={`workspace-body ${management ? 'with-sidebar' : ''}`}>
        {management && (
          <aside className={`sidebar ${menu ? 'show' : ''}`}>
            <div className="sidebar-caption">CWMANAGEMENT</div>
            <nav>
              {visible.map((i) => (
                <Link
                  href={i.view ? `/${i.view}` : '/'}
                  key={i.view}
                  className={view === i.view ? 'active' : ''}
                  onClick={() => setMenu(false)}
                >
                  <i.icon size={19} />
                  {i.label}
                </Link>
              ))}
            </nav>
            <div className="sidebar-bottom">
              <span className="small">CEDAR WINDS</span>
              <p>
                Good work.
                <br />
                Well accounted for.
              </p>
            </div>
          </aside>
        )}
        <main className="workspace-main">
          {has('OWNER', 'PM', 'CONTROLLER') && (
            <div className="desktop-link">
              <ActionButton className="text-button" action={() => api('desktop/email', {})}>
                <Monitor size={17} /> OPEN ON DESKTOP
              </ActionButton>
            </div>
          )}
          <ErrorBox message={error} />
          {!data ? (
            <Loading />
          ) : !permitted ? (
            <div className="card">
              <h1>Page unavailable.</h1>
              <p>You do not have access to this workspace.</p>
              <Link href="/">Return to your workday</Link>
            </div>
          ) : controllerLocked && ['locate', 'info', 'send'].includes(view) ? (
            <div className="card">
              <h1>Clock in first.</h1>
              <p>Scan the shop QR and clock in before opening your controller tools.</p>
              <Link href="/">Return to your workday</Link>
            </div>
          ) : view === '' && managementUser && !token ? (
            <DashboardScreen />
          ) : view === 'projects' && path[1] ? (
            <ProjectScreen id={path[1]} />
          ) : view === 'projects' ? (
            <ProjectsScreen />
          ) : view === 'contacts' ? (
            <ContactsScreen />
          ) : ['leads', 'schedule', 'financials', 'reports'].includes(view) ? (
            <PlaceholderScreen title={visible.find((item) => item.view === view)?.label ?? 'Module'} />
          ) : view === 'locate' ? (
            <LocateScreen zone={data.companyTimezone} />
          ) : view === 'verify' || view === 'send' ? (
            <RecordsScreen kind={view} owner={has('OWNER')} />
          ) : view === 'info' ? (
            <InfoScreen zone={data.companyTimezone} />
          ) : view === 'admin' ? (
            <AdminScreen zone={data.companyTimezone} />
          ) : view === 'visits' ? (
            <VisitsScreen userId={data.user.id} zone={data.companyTimezone} />
          ) : view === 'time' || Boolean(token) || (!managementUser && view === '') ? (
            <>
              {!token && has('OWNER', 'PM') && !data.current && (
                <div className="management-home">
                  <div className="page-heading">
                    <span className="eyebrow">CEDAR WINDS WORKSPACE</span>
                    <h1>Good morning, {data.user.firstName}.</h1>
                    <p>Your team’s workday, all in one place.</p>
                  </div>
                  <div className="dashboard-grid">
                    {visible
                      .filter((i) => i.view)
                      .map((i) => (
                        <Link className="dashboard-tile" key={i.view} href={`/${i.view}`}>
                          <i.icon size={28} />
                          <h2>{i.label}</h2>
                          <ArrowUpRight size={20} />
                        </Link>
                      ))}
                  </div>
                </div>
              )}
              {(!has('OWNER', 'PM') || token || data.current || data.modes.length > 0) && (
                <ClockScreen data={data} token={token} refresh={refresh} />
              )}
            </>
          ) : (
            <div className="card"><h1>Page unavailable.</h1></div>
          )}
        </main>
      </div>
      {hours && <HoursModal onClose={() => setHours(false)} />}{' '}
      {install && (
        <Modal title="Keep Cedar Winds on your phone" onClose={() => setInstall(false)}>
          <h3>iPhone / iPad</h3>
          <p>
            Open this app in Safari, tap Share, then <strong>Add to Home Screen</strong>. Open the
            saved app and sign in.
          </p>
          <h3>Android</h3>
          <p>
            Open this app in Chrome, open the menu, and choose <strong>Install app</strong> or{' '}
            <strong>Add to Home screen</strong>.
          </p>
          <p className="muted small">
            QR scans may open your browser rather than the installed app, depending on your phone.
            Sign in there once as well if asked. Both connect to the same time records.
          </p>
          <p>Internet is required to record time.</p>
        </Modal>
      )}
    </div>
  );
}
