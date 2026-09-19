import { redirect } from 'next/navigation';
import { currentUser } from '@/lib/auth';
import { Workspace } from '@/components/workspace';
export const dynamic = 'force-dynamic';
export default async function Page({ params }: { params: Promise<{ path?: string[] }> }) {
  const path = (await params).path ?? [];
  const user = await currentUser();
  if (!user)
    redirect(`/login?next=${encodeURIComponent('/' + path.map(encodeURIComponent).join('/'))}`);
  return <Workspace path={path} />;
}
