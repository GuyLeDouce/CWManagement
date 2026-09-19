import { AuthForm } from '@/components/auth-form';
export default async function Page({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  return <AuthForm kind="login" next={(await searchParams).next} />;
}
