'use client';
import { useState } from 'react';
import { api, pretty } from '@/lib/client';
import { ActionButton } from './ui';
type Task = {
  id: string;
  name: string;
  startDate?: string | null;
  endDate?: string | null;
  status: string;
  milestone: boolean;
};
export function ScheduleTools({
  tasks,
  projectId,
  refresh,
}: {
  tasks: Task[];
  projectId: string;
  refresh: () => void;
}) {
  const [view, setView] = useState('list'),
    [selected, setSelected] = useState<string[]>([]),
    [shift, setShift] = useState('0'),
    [status, setStatus] = useState('IN_PROGRESS');
  const starts = tasks.flatMap((t) => (t.startDate ? [+new Date(t.startDate)] : [])),
    ends = tasks.flatMap((t) => (t.endDate ? [+new Date(t.endDate)] : []));
  const min = Math.min(...starts),
    max = Math.max(...ends, min + 86400000),
    span = max - min;
  return (
    <section className="schedule-tools">
      <div className="filter-bar">
        <label>
          View
          <select value={view} onChange={(e) => setView(e.target.value)}>
            <option value="list">List</option>
            <option value="timeline">Timeline</option>
            <option value="bulk">Select / update tasks</option>
          </select>
        </label>
      </div>
      {view === 'timeline' && (
        <>
          <p>
            Planned dates ·{' '}
            {Number.isFinite(min) ? new Date(min).toISOString().slice(0, 10) : 'No dated tasks'} —{' '}
            {Number.isFinite(max) ? new Date(max).toISOString().slice(0, 10) : ''}
          </p>
          <div className="schedule-timeline">
            {tasks
              .filter((t) => t.startDate && t.endDate)
              .map((t) => (
                <div className="timeline-row" key={t.id}>
                  <span>{t.name}</span>
                  <div>
                    <i
                      title={`${t.startDate?.slice(0, 10)} — ${t.endDate?.slice(0, 10)}`}
                      style={{
                        marginLeft: `${((+new Date(t.startDate!) - min) / span) * 100}%`,
                        width: `${Math.max(1, ((+new Date(t.endDate!) - +new Date(t.startDate!)) / span) * 100)}%`,
                      }}
                    />
                  </div>
                </div>
              ))}
          </div>
        </>
      )}
      {view === 'bulk' && (
        <div className="panel">
          <button onClick={() => setSelected(tasks.map((t) => t.id))}>
            Select all visible tasks
          </button>
          {tasks.map((t) => (
            <label className="check-inline" key={t.id}>
              <input
                type="checkbox"
                checked={selected.includes(t.id)}
                onChange={(e) =>
                  setSelected(
                    e.target.checked ? [...selected, t.id] : selected.filter((id) => id !== t.id),
                  )
                }
              />
              {t.name} · {t.endDate?.slice(0, 10) || 'No date'}
            </label>
          ))}
          <div className="filter-bar">
            <label>
              Shift planned dates by days
              <input
                type="number"
                min="-365"
                max="365"
                value={shift}
                onChange={(e) => setShift(e.target.value)}
              />
            </label>
            <ActionButton
              disabled={!selected.length}
              action={() =>
                api('standards/schedule', { projectId, ids: selected, shiftDays: Number(shift) })
              }
              onDone={refresh}
            >
              Move selected dates
            </ActionButton>
            <label>
              Set status
              <select value={status} onChange={(e) => setStatus(e.target.value)}>
                {['NOT_STARTED', 'READY', 'IN_PROGRESS', 'BLOCKED', 'COMPLETE', 'CANCELLED'].map(
                  (s) => (
                    <option value={s} key={s}>
                      {pretty(s)}
                    </option>
                  ),
                )}
              </select>
            </label>
            <ActionButton
              disabled={!selected.length}
              action={() => api('standards/schedule', { projectId, ids: selected, status })}
              onDone={refresh}
            >
              Update selected status
            </ActionButton>
          </div>
          <p>
            Only selected dates move. Dependencies are retained; review neighboring tasks after a
            date change.
          </p>
        </div>
      )}
    </section>
  );
}
