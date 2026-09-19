'use client';
import { useState } from 'react';
import { DateTime } from 'luxon';
import { useApi, date, duration } from '@/lib/client';
import type { Info, Options } from '@/lib/client-types';
import { Loading, ErrorBox, Empty, Badge } from './ui';
export function InfoScreen({ zone }: { zone: string }) {
  const [period, setPeriod] = useState<'day' | 'week' | 'month' | 'year'>('week'),
    [employee, setEmployee] = useState('');
  const now = DateTime.now().setZone(zone);
  const [from, setFrom] = useState(now.startOf('week').toISODate()!),
    [to, setTo] = useState(now.toISODate()!);
  const { data: options } = useApi<Options>('options');
  const { data, error } = useApi<Info>(
    `info?${new URLSearchParams({ from, to, ...(employee ? { employee } : {}) })}`,
  );
  return (
    <>
      <div className="page-heading">
        <span className="eyebrow">THE BIG PICTURE</span>
        <h1>Hours at a glance.</h1>
        <p>Recorded time, with the detail one tap away.</p>
      </div>
      <section className="card filter-card">
        <div className="mode-picker">
          {(['day', 'week', 'month', 'year'] as const).map((p) => (
            <button
              key={p}
              className={period === p ? 'selected' : ''}
              onClick={() => {
                setPeriod(p);
                setFrom(now.startOf(p).toISODate()!);
                setTo(now.toISODate()!);
              }}
            >
              {p.toUpperCase()}
            </button>
          ))}
        </div>
        <div className="filters">
          <label>
            From
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </label>
          <label>
            To
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </label>
          <label>
            Employee
            <select value={employee} onChange={(e) => setEmployee(e.target.value)}>
              <option value="">Everyone</option>
              {options?.employees.map((u) => (
                <option value={u.id} key={u.id}>
                  {u.firstName} {u.lastName}
                </option>
              ))}
            </select>
          </label>
        </div>
      </section>
      <ErrorBox message={error} />
      {!data ? (
        <Loading />
      ) : !data.employees.length ? (
        <Empty title="No hours in this period" />
      ) : (
        data.employees.map((u) => (
          <details className="card hour-person" key={u.id}>
            <summary>
              <span>{u.name}</span>
              <strong>
                {Number(u.hours).toFixed(2)} <small>hrs</small>
              </strong>
            </summary>
            <p className="muted">
              {Number(u.approvedHours).toFixed(2)} hours approved in this period.
            </p>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Project</th>
                    <th>Activity</th>
                    <th>Full segment hours</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {u.records.map((r) => (
                    <tr key={r.id}>
                      <td>{date(r.effectiveStart, zone)}</td>
                      <td>{r.jobsite.name}</td>
                      <td>{r.task?.name ?? r.type}</td>
                      <td>{duration(r.effectiveStart, r.end)}</td>
                      <td>
                        <Badge value={r.status} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        ))
      )}
    </>
  );
}
