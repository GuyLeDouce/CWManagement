import { Tx } from './db';
export const clientPreferencesSelect = {
  clientTaxDisplayMode: true,
  clientFinancialSummaryEnabled: true,
  clientManagerVisible: true,
} as const;
export async function clientPreferences(tx: Tx, projectId: string) {
  const [project, company] = await Promise.all([
    tx.project.findUniqueOrThrow({ where: { id: projectId }, select: clientPreferencesSelect }),
    tx.settings.findUnique({ where: { id: 'company' }, select: clientPreferencesSelect }),
  ]);
  const defaults = company ?? {
    clientTaxDisplayMode: 'FINAL_TOTAL_ONLY' as const,
    clientFinancialSummaryEnabled: true,
    clientManagerVisible: false,
  };
  return {
    overrides: project,
    defaults,
    effective: {
      clientTaxDisplayMode: project.clientTaxDisplayMode ?? defaults.clientTaxDisplayMode,
      clientFinancialSummaryEnabled:
        project.clientFinancialSummaryEnabled ?? defaults.clientFinancialSummaryEnabled,
      clientManagerVisible: project.clientManagerVisible ?? defaults.clientManagerVisible,
    },
  };
}
