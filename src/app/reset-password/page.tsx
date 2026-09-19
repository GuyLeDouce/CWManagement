import { AuthForm } from '@/components/auth-form';
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  return <AuthForm kind="reset" token={(await searchParams).token} />;
}
