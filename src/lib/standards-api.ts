import { z } from 'zod';
import { specifications, saveSpecification, specificationSchema } from './specifications';
import { Actor } from './permissions';
import { AppError } from './errors';
import {
  library,
  saveTemplate,
  catalog,
  saveCatalog,
  importCatalog,
  applyTemplate,
  applySchema,
  addCatalog,
  catalogAddSchema,
  catalogCsv,
  catalogFromLine,
  selectionsFromEstimate,
  previewTemplateCsv,
  bulkCatalog,
  catalogBulkSchema,
} from './standards';
import { templateSchema, catalogSchema } from './standards-schema';
import {
  setupProject,
  setupSchema,
  setupOptions,
  captureTemplate,
  companyDefaults,
  defaultsSchema,
} from './project-setup';
import { workQueue, globalSearch, updateSchedule, scheduleBulkSchema } from './productivity';
export async function dispatchStandards(
  actor: Actor,
  get: boolean,
  path: string,
  params: Record<string, string>,
  body: unknown,
) {
  if (get && path === 'specifications')
    return {
      specifications: await specifications(actor, z.string().min(1).parse(params.projectId)),
    };
  if (!get && path === 'specifications')
    return saveSpecification(actor, specificationSchema.parse(body));
  if (get && path === 'templates') return { templates: await library(actor, params.kind) };
  if (!get && path === 'templates') return saveTemplate(actor, templateSchema.parse(body));
  if (!get && path === 'templates/import')
    return previewTemplateCsv(
      actor,
      z
        .object({ kind: z.enum(['ESTIMATE', 'SCHEDULE', 'SELECTION']), csv: z.string() })
        .strict()
        .parse(body),
    );
  if (get && path === 'catalog')
    return { items: await catalog(actor, params.q), csvTemplate: catalogCsv };
  if (!get && path === 'catalog') return saveCatalog(actor, catalogSchema.parse(body));
  if (!get && path === 'catalog/bulk') return bulkCatalog(actor, catalogBulkSchema.parse(body));
  if (!get && path === 'catalog/import')
    return importCatalog(
      actor,
      z.object({ csv: z.string(), commit: z.boolean() }).strict().parse(body),
    );
  if (!get && path === 'catalog/add') return addCatalog(actor, catalogAddSchema.parse(body));
  if (!get && path === 'catalog/from-line')
    return catalogFromLine(actor, z.object({ id: z.string() }).strict().parse(body).id);
  if (!get && path === 'selections/from-estimate')
    return selectionsFromEstimate(
      actor,
      z.object({ projectId: z.string() }).strict().parse(body).projectId,
    );
  if (!get && path === 'apply') return applyTemplate(actor, applySchema.parse(body));
  if (!get && path === 'capture')
    return captureTemplate(
      actor,
      z
        .object({
          projectId: z.string(),
          name: z.string(),
          kind: z.enum(['PROJECT', 'ESTIMATE', 'SCHEDULE', 'SELECTION', 'PROPOSAL']),
        })
        .strict()
        .parse(body),
    );
  if (get && path === 'setup') return setupOptions(actor);
  if (!get && path === 'setup') return setupProject(actor, setupSchema.parse(body));
  if (path === 'defaults')
    return companyDefaults(actor, get ? undefined : defaultsSchema.parse(body));
  if (get && path === 'work') return workQueue(actor, params.mine === 'true', params.projectId);
  if (get && path === 'search') return globalSearch(actor, params.q || '');
  if (!get && path === 'schedule') return updateSchedule(actor, scheduleBulkSchema.parse(body));
  throw new AppError(404, 'This company-library action was not found.');
}
