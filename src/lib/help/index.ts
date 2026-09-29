import { projectGuides } from './projects';
import { templateGuides } from './templates';
import { financialGuides } from './financial';
import { operationGuides } from './operations';
import { timeAdminGuides } from './time-admin';
import { quickbooksGuides } from './quickbooks';
import { workflowGuides, troubleshootingGuides, glossary } from './workflows';
export const internalGuides = [
  ...projectGuides,
  ...templateGuides,
  ...operationGuides,
  ...financialGuides,
  ...timeAdminGuides,
  ...quickbooksGuides,
  ...workflowGuides,
  ...troubleshootingGuides,
  glossary,
];
