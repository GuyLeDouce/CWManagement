import { projectGuides } from './projects';
import { businessGuides } from './business';
import { templateGuides } from './templates';
import { financialGuides } from './financial';
import { operationGuides } from './operations';
import { timeAdminGuides } from './time-admin';
import { quickbooksGuides } from './quickbooks';
import { workflowGuides, troubleshootingGuides, glossary } from './workflows';
export const internalGuides = [
  ...businessGuides,
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
