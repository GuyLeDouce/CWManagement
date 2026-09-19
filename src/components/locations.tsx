'use client';
import { Truck, MapPin } from 'lucide-react';
import { useApi, time, date } from '@/lib/client';
import type { Locations } from '@/lib/client-types';
import { Loading, ErrorBox, Badge, Empty } from './ui';
export function LocateScreen({ zone }: { zone: string }) {
  const { data, error } = useApi<Locations>('locate', 30000);
  return (
    <>
      <div className="page-heading">
        <span className="eyebrow">PEOPLE & PROJECTS</span>
        <h1>Where the day is happening.</h1>
        <p>Current activity across your team.</p>
      </div>
      <ErrorBox message={error} />
      {!data ? (
        <Loading />
      ) : (
        <>
          <div className="notice">
            <MapPin size={20} />
            {data.notice}
          </div>
          <div className="section-title">
            <h2>The team</h2>
            <span>{data.employees.length} employees</span>
          </div>
          <div className="people-grid">
            {data.employees.map((u) => (
              <section className="card person" key={u.id}>
                <div className="person-heading">
                  <span className="avatar">
                    {u.firstName[0]}
                    {u.lastName[0]}
                  </span>
                  <div>
                    <h3>
                      {u.firstName} {u.lastName}
                    </h3>
                    <Badge value={u.state} />
                  </div>
                </div>
                <strong>{u.current?.jobsite.name ?? '—'}</strong>
                <p>
                  {u.current?.task?.name ??
                    (u.current?.type === 'TRAVEL' ? 'En route to jobsite' : 'No current activity')}
                </p>
                {u.current && (
                  <small>
                    Since {time(u.current.effectiveStart, zone)}
                    {u.current.truck ? ` · ${u.current.truck.name}` : ''}
                  </small>
                )}
              </section>
            ))}
          </div>
          {!data.employees.length && (
            <Empty title="No employees in view">
              Assign employees and projects to this PM in Admin.
            </Empty>
          )}
          <div className="section-title">
            <h2>Trucks</h2>
            <span>Inferred from QR activity</span>
          </div>
          <div className="people-grid">
            {data.trucks.map((t) => (
              <section className="card truck" key={t.id}>
                <Truck size={25} />
                <h3>{t.name}</h3>
                <strong>{t.inferredJobsite?.name ?? 'Shop'}</strong>
                <p className="small">
                  {t.lastScanAt
                    ? `Last reported ${date(t.lastScanAt, zone)} at ${time(t.lastScanAt, zone)}`
                    : 'Inferred: shop. No departure evidence yet.'}
                </p>
                <p className="small muted">
                  Recent activity:{' '}
                  {[
                    ...new Set(t.segments.map((s) => `${s.user.firstName} ${s.user.lastName}`)),
                  ].join(', ') || 'None'}
                </p>
              </section>
            ))}
          </div>
        </>
      )}
    </>
  );
}
