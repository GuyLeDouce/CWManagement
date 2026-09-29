import { currentUser } from '@/lib/auth';
import { requireClientPreview } from '@/lib/client-vision';
import { ClientPortal } from '@/components/client-portal';
import { redirect, notFound } from 'next/navigation';
export const dynamic = 'force-dynamic';
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ projectId: string; path?: string[] }>;
  searchParams: Promise<{ contactId?: string }>;
}) {
  const actor = await currentUser();
  if (!actor) redirect('/login');
  const { projectId, path = [] } = await params;
  if (
    path.length > 1 ||
    (path[0] &&
      ![
        'home',
        'schedule',
        'proposals',
        'selections',
        'change-orders',
        'updates',
        'photos',
        'documents',
        'messages',
      ].includes(path[0]))
  )
    notFound();
  try {
    await requireClientPreview(actor, projectId);
  } catch {
    notFound();
  }
  const { contactId } = await searchParams;
  return (
    <ClientPortal
      key={`${projectId}:${contactId || 'general'}`}
      projectId={projectId}
      section={path[0]}
      preview
      contactId={contactId}
    />
  );
}
