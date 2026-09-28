'use client';
import { useState } from 'react';
import { api, useApi } from '@/lib/client';
import { ActionButton, ErrorBox, Modal } from './ui';
type Spec = {
  id?: string;
  version?: number;
  projectId: string;
  title: string;
  category: string;
  description: string;
  clientVisible: boolean;
};
export function Specifications({ projectId }: { projectId: string }) {
  const query = useApi<{ specifications: Spec[] }>(
      `standards/specifications?projectId=${projectId}`,
    ),
    [edit, setEdit] = useState<Spec | null>(null);
  return (
    <section className="panel">
      <div className="section-actions">
        <div>
          <h2>Specifications</h2>
          <p>
            Record agreed products and construction details. Publish deliberately; no client
            decision or financial approval is implied.
          </p>
        </div>
        <button
          onClick={() =>
            setEdit({
              projectId,
              title: '',
              category: 'General',
              description: '',
              clientVisible: false,
            })
          }
        >
          Add specification
        </button>
      </div>
      <ErrorBox message={query.error} />
      {query.data?.specifications.map((s) => (
        <div className="data-row" key={s.id}>
          <span>
            <strong>{s.title}</strong>
            <small>
              {s.category} · {s.clientVisible ? 'Visible to client' : 'Internal draft'}
            </small>
            <p>{s.description}</p>
          </span>
          <button
            onClick={() =>
              setEdit({
                id: s.id,
                version: s.version,
                projectId,
                title: s.title,
                category: s.category,
                description: s.description,
                clientVisible: s.clientVisible,
              })
            }
          >
            Edit
          </button>
        </div>
      ))}
      {edit && (
        <Modal title="Project specification" onClose={() => setEdit(null)}>
          <div className="entity-form">
            {(['title', 'category'] as const).map((k) => (
              <label key={k}>
                {k}
                <input
                  value={edit[k]}
                  onChange={(e) => setEdit({ ...edit, [k]: e.target.value })}
                />
              </label>
            ))}
            <label>
              Description
              <textarea
                value={edit.description}
                onChange={(e) => setEdit({ ...edit, description: e.target.value })}
              />
            </label>
            <label className="check-inline">
              <input
                type="checkbox"
                checked={edit.clientVisible}
                onChange={(e) => setEdit({ ...edit, clientVisible: e.target.checked })}
              />
              Publish to client
            </label>
            <ActionButton
              className="primary"
              action={() => api('standards/specifications', edit)}
              onDone={() => {
                setEdit(null);
                void query.refresh();
              }}
            >
              Save specification
            </ActionButton>
          </div>
        </Modal>
      )}
    </section>
  );
}
