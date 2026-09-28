import { z } from 'zod';
import { db, transaction } from './db';
import { Actor, requireCapability, requireProjectAccess } from './permissions';
import { ensure } from './errors';
import { publishProjectEvent } from './activity';
export const specificationSchema = z
  .object({
    id: z.string().optional(),
    version: z.number().int().positive().optional(),
    projectId: z.string(),
    title: z.string().trim().min(1).max(200),
    category: z.string().trim().min(1).max(200),
    description: z.string().max(10000),
    clientVisible: z.boolean().default(false),
  })
  .strict();
export async function specifications(actor: Actor, projectId: string) {
  await requireCapability(actor, 'SELECTION_VIEW');
  await requireProjectAccess(actor, projectId);
  return db.projectSpecification.findMany({
    where: { projectId },
    orderBy: [{ category: 'asc' }, { title: 'asc' }],
  });
}
export async function saveSpecification(actor: Actor, input: z.infer<typeof specificationSchema>) {
  return transaction(async (tx) => {
    await requireCapability(actor, input.id ? 'SELECTION_EDIT' : 'SELECTION_CREATE', tx);
    await requireProjectAccess(actor, input.projectId, tx);
    const before = input.id
      ? await tx.projectSpecification.findFirst({
          where: { id: input.id, projectId: input.projectId },
        })
      : null;
    if (input.id)
      ensure(
        before && before.version === input.version,
        'Specification changed. Refresh before saving.',
        409,
      );
    if (input.clientVisible || before?.clientVisible)
      await requireCapability(actor, 'CLIENT_CONTENT_PUBLISH', tx);
    const { id, version, ...data } = input;
    void version;
    const saved = id
      ? await tx.projectSpecification.update({
          where: { id },
          data: { ...data, version: { increment: 1 } },
        })
      : await tx.projectSpecification.create({ data });
    await publishProjectEvent(tx, {
      projectId: input.projectId,
      actorId: actor.id,
      entity: 'ProjectSpecification',
      entityId: saved.id,
      action: 'SPECIFICATION_UPDATED',
      description: `${saved.clientVisible ? 'Published' : 'Saved'} specification ${saved.title}.`,
      before,
      after: saved,
    });
    return saved;
  });
}
