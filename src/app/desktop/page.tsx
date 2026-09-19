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
  if (!(await currentUser()))
    redirect(`/login?next=${encodeURIComponent('/desktop?token=' + encodeURIComponent(token))}`);
  return <Desktop token={token} />;
}
