'use client';
import { useState } from 'react';
import { api, useApi } from '@/lib/client';
import { ActionButton, ErrorBox } from './ui';
import type { State } from '@/lib/client-types';
type Preferences = {
  clientTaxDisplayMode: string | null;
  clientFinancialSummaryEnabled: boolean | null;
  clientManagerVisible: boolean | null;
};
export function ClientViewSettings({ projectId }: { projectId?: string }) {
  const state = useApi<State>('state');
  const capability = projectId ? 'CLIENT_CONTENT_PUBLISH' : 'SETTINGS_MANAGE';
  return state.data?.capabilities.includes(capability) ? (
    <SettingsForm projectId={projectId} />
  ) : null;
}
function SettingsForm({ projectId }: { projectId?: string }) {
  const q = useApi<Preferences | { overrides: Preferences; effective: Preferences }>(
    `client-management/view-settings${projectId ? '?projectId=' + encodeURIComponent(projectId) : ''}`,
  );
  const [edit, setEdit] = useState<Preferences | null>(null),
    [saved, setSaved] = useState(false);
  const current = q.data && ('overrides' in q.data ? q.data.overrides : q.data);
  const data = edit || current;
  const update = (patch: Partial<Preferences>) => {
    setEdit({ ...data!, ...patch });
    setSaved(false);
  };
  return (
    <section className="panel">
      <h2>{projectId ? 'Client View' : 'Client Portal defaults'}</h2>
      <p>
        Control presentation of recorded client prices. These settings never change approved
        amounts, tax or accounting.
      </p>
      {projectId && (
        <p>
          Company defaults apply until you choose a project override. Contract totals appear only
          when an accepted proposal establishes the original tax and all included changes are
          visible to the selected client.
        </p>
      )}
      <ErrorBox message={q.error} />
      {data && (
        <div className="entity-form">
          <label>
            Client financial display
            <select
              value={data.clientTaxDisplayMode ?? ''}
              onChange={(e) => update({ clientTaxDisplayMode: e.target.value || null })}
            >
              {projectId && <option value="">Use company default</option>}
              <option value="FINAL_TOTAL_ONLY">Final Total Only</option>
              <option value="SHOW_TAX_BREAKDOWN">Show Tax Breakdown</option>
            </select>
          </label>
          {(['clientFinancialSummaryEnabled', 'clientManagerVisible'] as const).map((key) => (
            <label key={key}>
              {key === 'clientFinancialSummaryEnabled'
                ? 'Show client contract summary'
                : 'Show Project Manager name'}
              <select
                value={data[key] === null ? '' : String(data[key])}
                onChange={(e) =>
                  update({ [key]: e.target.value === '' ? null : e.target.value === 'true' })
                }
              >
                {projectId && <option value="">Use company default</option>}
                <option value="true">Yes</option>
                <option value="false">No</option>
              </select>
            </label>
          ))}
          <ActionButton
            action={async () => {
              await api('client-management/view-settings', {
                ...data,
                ...(projectId ? { projectId } : {}),
              });
              setEdit(null);
              setSaved(true);
              q.refresh();
            }}
          >
            Save Client View settings
          </ActionButton>
          {saved && <p role="status">Client View settings saved.</p>}
        </div>
      )}
    </section>
  );
}
