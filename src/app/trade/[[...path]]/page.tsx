import { PortalHelp } from '@/components/portal-help';
import { redirect, notFound } from 'next/navigation';
import { currentUser } from '@/lib/auth';
import { isTrade, isExternal, portalPath } from '@/lib/external-identity';
import { requireTradeProjectAccess } from '@/lib/trade-access';
import { TradePortal } from '@/components/trade-portal';
export const dynamic = 'force-dynamic';
export default async function Page({ params }: { params: Promise<{ path?: string[] }> }) {
  const user = await currentUser();
  if (!user) redirect('/login?next=/trade');
  if (!isTrade(user)) redirect(isExternal(user) ? portalPath(user) : '/');
  const path = (await params).path || [];
  if (path[0] === 'help') return <PortalHelp audience="trade" path={path.slice(1)} />;
  if (path.length && (path[0] !== 'projects' || !path[1] || path.length > 3)) notFound();
  if (path[1]) {
    try {
      await requireTradeProjectAccess(user, path[1]);
    } catch {
      notFound();
    }
  }
  return <TradePortal projectId={path[1]} section={path[2]} />;
}
