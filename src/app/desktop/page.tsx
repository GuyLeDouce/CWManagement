import { isExternal, portalPath } from '@/lib/external-identity';
import { redirect } from 'next/navigation';
import { currentUser } from '@/lib/auth';
import { Desktop } from '@/components/desktop';
export const dynamic = 'force-dynamic';
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token = '' } = await searchParams;
  const user = await currentUser();
  if (!user)
    redirect(`/login?next=${encodeURIComponent('/desktop?token=' + encodeURIComponent(token))}`);
  if (isExternal(user)) redirect(portalPath(user));
  return <Desktop token={token} />;
}
