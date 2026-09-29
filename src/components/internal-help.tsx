'use client';
import Link from 'next/link';
import { CircleHelp } from 'lucide-react';
import { internalGuides } from '@/lib/help';
import { categories } from '@/lib/help/types';
import { articleHref, contextualArticles, projectContext } from '@/lib/help/navigation';
import { HelpCentre } from './help-centre';
export function InternalHelp({
  path,
  capabilities,
  roles,
}: {
  path: string[];
  capabilities: string[];
  roles: string[];
}) {
  return (
    <HelpCentre
      articles={internalGuides}
      categories={categories}
      base="/how-to"
      path={path}
      capabilities={capabilities}
      roles={roles}
    />
  );
}
export function ContextualHelp({ path }: { path: string[] }) {
  const view = path[0] || '';
  const id =
    view === 'projects' && path[1]
      ? projectContext[path[2] || 'overview']
      : (view === 'financials' || view === 'settings') && path[1] === 'quickbooks'
        ? 'qb-overview'
        : contextualArticles[view];
  const article = internalGuides.find((a) => a.id === id);
  return article ? (
    <div className="contextual-help">
      <Link href={articleHref('/how-to', article)}>
        <CircleHelp size={16} />
        How to: {article.title}
      </Link>
    </div>
  ) : null;
}
