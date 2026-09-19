'use client';
import { useState } from 'react';
import { MapPin } from 'lucide-react';
import { api, useApi, date, time, duration } from '@/lib/client';
import type { Visits } from '@/lib/client-types';
import { ErrorBox, Loading, ActionButton, Empty } from './ui';
export function VisitsScreen({ userId, zone }: { userId: string; zone: string }) {
  const { data, error, refresh } = useApi<Visits>('visits');
  const [job, setJob] = useState(''),
    [notes, setNotes] = useState('');
  const current = data?.visits.find((v) => v.userId === userId && !v.end);
  return (
    <>
      <div className="page-heading">
        <span className="eyebrow">OWNER</span>
        <h1>Time on site.</h1>
        <p>Site visits are recorded separately from employee payroll.</p>
      </div>
      <ErrorBox message={error} />
      {!data ? (
        <Loading />
      ) : (
        <>
          <section className="card visit-form">
            {current ? (
              <>
                <BadgeVisit name={current.jobsite.name} />
                <p>
                  Started {time(current.start, zone)} · {duration(current.start)} hrs
                </p>
                <ActionButton
                  className="primary punch"
                  action={() => api('visits', { action: 'END' })}
                  onDone={refresh}
                >
                  RETURNED / END SITE VISIT
                </ActionButton>
              </>
            ) : (
              <>
                <label>
                  Jobsite
                  <select value={job} onChange={(e) => setJob(e.target.value)}>
                    <option value="">Select a project</option>
                    {data.jobs.map((j) => (
                      <option value={j.id} key={j.id}>
                        {j.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Notes <span className="optional">Optional</span>
                  <textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    maxLength={2000}
                  />
                </label>
                {job && (
                  <ActionButton
                    className="primary punch"
                    action={() => api('visits', { action: 'START', jobsiteId: job, notes })}
                    onDone={refresh}
                  >
                    START SITE VISIT
                    <MapPin size={20} />
                  </ActionButton>
                )}
              </>
            )}
          </section>
          <div className="section-title">
            <h2>Visit history</h2>
            <span>Separate from payroll</span>
          </div>
          {!data.visits.length ? (
            <Empty title="Your next visit starts here" />
          ) : (
            <div className="card table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Owner</th>
                    <th>Project</th>
                    <th>Date</th>
                    <th>Start</th>
                    <th>End</th>
                    <th>Hours</th>
                    <th>Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {data.visits.map((v) => (
                    <tr key={v.id}>
                      <td>
                        {v.user.firstName} {v.user.lastName}
                      </td>
                      <td>{v.jobsite.name}</td>
                      <td>{date(v.start, zone)}</td>
                      <td>{time(v.start, zone)}</td>
                      <td>{time(v.end, zone)}</td>
                      <td>{duration(v.start, v.end)}</td>
                      <td>{v.notes}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </>
  );
}
function BadgeVisit({ name }: { name: string }) {
  return (
    <>
      <span className="badge green">SITE VISIT IN PROGRESS</span>
      <h2>{name}</h2>
    </>
  );
}
