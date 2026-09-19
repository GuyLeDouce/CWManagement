'use client';
import { Clock3, CheckCircle2 } from 'lucide-react';
import { useApi, time, pretty } from '@/lib/client';
import type { Hours } from '@/lib/client-types';
import { Modal, Loading, ErrorBox } from './ui';
export function HoursModal({ onClose }: { onClose: () => void }) {
  const { data, error } = useApi<Hours>('hours', 30000);
  return (
    <Modal title="My hours" onClose={onClose}>
      <ErrorBox message={error} />
      {!data ? (
        <Loading />
      ) : (
        <>
          <div className="hours-total">
            <span className="eyebrow">TODAY</span>
            <strong>
              {Number(data.todayHours).toFixed(2)}
              <small>hrs</small>
            </strong>
            <span>
              {data.current ? 'Your workday is in progress.' : 'Your recorded paid time.'}
            </span>
          </div>
          <dl className="detail-list">
            <div>
              <dt>Actual first scan</dt>
              <dd>{time(data.actualStart, data.timezone)}</dd>
            </div>
            <div>
              <dt>Paid start</dt>
              <dd>{time(data.paidStart, data.timezone)}</dd>
            </div>
            <div>
              <dt>Current project</dt>
              <dd>{data.current?.jobsite.name ?? 'Clocked out'}</dd>
            </div>
            <div>
              <dt>Activity</dt>
              <dd>
                {data.current?.task?.name ?? (data.current ? pretty(data.current.type) : '—')}
              </dd>
            </div>
            {data.current && (
              <div>
                <dt>Current segment</dt>
                <dd>{Number(data.currentHours).toFixed(2)} hrs</dd>
              </div>
            )}
          </dl>
          <section className="previous-week">
            <span className="eyebrow">PREVIOUS WEEK · PM APPROVED</span>
            <div className="week-total">
              <strong>
                {Number(data.approvedHours).toFixed(2)} <small>hrs</small>
              </strong>
              <span className="status-inline">
                {data.pending ? <Clock3 size={17} /> : <CheckCircle2 size={17} />}{' '}
                {data.pending ? 'Pending approval' : 'Approved'}
              </span>
            </div>
            <details>
              <summary>View hours by project and activity</summary>
              <p className="muted small">Includes approved and pending recorded time.</p>
              {data.groups.length ? (
                data.groups.map((g) => (
                  <div className="summary-row" key={g.label}>
                    <span>{g.label}</span>
                    <strong>{Number(g.hours).toFixed(2)} hrs</strong>
                  </div>
                ))
              ) : (
                <p>No hours recorded last week.</p>
              )}
            </details>
          </section>
        </>
      )}
    </Modal>
  );
}
