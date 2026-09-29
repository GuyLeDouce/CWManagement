'use client';
import Link from 'next/link';
import { clientGuides, tradeGuides } from '@/lib/help/portals';
import { HelpCentre } from './help-centre';
import { Brand } from './brand';
export function PortalHelp({ audience, path }: { audience: 'client' | 'trade'; path: string[] }) {
  const articles = audience === 'client' ? clientGuides : tradeGuides;
  const categories = [
    {
      id: 'using-portal',
      title: 'Using your portal',
      summary: 'Find your project, shared information and team conversations.',
    },
    ...(audience === 'client'
      ? [
          {
            id: 'decisions',
            title: 'Your decisions',
            summary: 'Review selections and proposed changes with confidence.',
          },
        ]
      : [
          {
            id: 'work',
            title: 'Your work on site',
            summary: 'Acknowledge work, confirm dates and submit completion evidence.',
          },
        ]),
  ];
  return (
    <div className={`${audience}-shell portal-help-shell`}>
      <header className={`${audience}-header help-no-print`}>
        <Link href={`/${audience}`}>
          <Brand />
        </Link>
        <Link href={`/${audience}`}>Back to my projects</Link>
      </header>
      <main className="portal-help-main">
        <HelpCentre
          audience={audience}
          articles={articles}
          categories={categories}
          base={`/${audience}/help`}
          path={path}
        />
      </main>
    </div>
  );
}
