'use client';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/client';
import { ActionButton } from './ui';
import { Brand } from './brand';
import { HoursModal } from './hours';
import { useState } from 'react';
export function Desktop({ token }: { token: string }) {
  const router = useRouter();
  const [hours, setHours] = useState(false);
  return (
    <>
      <header className="app-header">
        <button className="brand-button" aria-label="Open My Hours" onClick={() => setHours(true)}>
          <Brand />
        </button>
      </header>
      <main className="standalone-message">
        <h1>Your desktop workspace.</h1>
        <p>Continue with your signed-in account. This one-time link expires after 15 minutes.</p>
        <ActionButton
          className="primary"
          action={async () => {
            await api('desktop/open', { token });
            router.replace('/');
          }}
        >
          Open workspace
        </ActionButton>
      </main>
      {hours && <HoursModal onClose={() => setHours(false)} />}
    </>
  );
}
