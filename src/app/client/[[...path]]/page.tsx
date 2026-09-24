import { redirect, notFound } from 'next/navigation';
import { currentUser } from '@/lib/auth';
import { ClientPortal } from '@/components/client-portal';
import { requireClientProjectAccess } from '@/lib/client-access';
export const dynamic = 'force-dynamic';
export default async function Page({ params }: { params: Promise<{ path?: string[] }> }) {
  const user = await currentUser();
  if (!user) redirect('/login?next=/client');
  if (!user.roles.includes('CLIENT')) redirect('/');
  const path = (await params).path || [];
  if (path.length && (path[0] !== 'projects' || !path[1] || path.length > 3)) notFound();
  if (path[1]) {
    try {
      await requireClientProjectAccess(user, path[1]);
    } catch {
      notFound();
    }
  }
  return <ClientPortal projectId={path[1]} section={path[2]} />;
}
