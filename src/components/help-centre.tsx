'use client';
import Link from 'next/link';
import { useState } from 'react';
import {
  BookOpen,
  Search,
  Printer,
  ChevronRight,
  CircleHelp,
  Info,
  ShieldCheck,
} from 'lucide-react';
import type { HelpArticle, HelpAudience, HelpSection } from '@/lib/help/types';
import { articleHref, helpDestination, recommendedHelp, searchHelp } from '@/lib/help/navigation';

type Category = { id: string; title: string; summary: string };
const calloutLabels = {
  tip: 'Tip',
  important: 'Important',
  financial: 'Financial impact',
  client: 'Client visible',
  trade: 'Trade visible',
  locked: 'Locked after issue',
};
function Section({
  section,
  index,
  prefix,
}: {
  section: HelpSection;
  index: number;
  prefix: string;
}) {
  return (
    <section
      id={`${prefix}-section-${index}`}
      className={`help-section ${section.kind ? `help-callout help-${section.kind}` : ''}`}
    >
      {section.kind && (
        <span className="help-callout-label">
          <Info size={16} />
          {calloutLabels[section.kind]}
        </span>
      )}
      <h2>{section.heading}</h2>
      {section.paragraphs?.map((p, i) => (
        <p key={i}>{p}</p>
      ))}
      {section.steps && (
        <ol className="help-steps">
          {section.steps.map((p, i) => (
            <li key={i}>{p}</li>
          ))}
        </ol>
      )}
    </section>
  );
}
function ArticleBody({ article }: { article: HelpArticle }) {
  return (
    <>
      {article.sections.map((section, index) => (
        <Section key={index} section={section} index={index} prefix={article.id} />
      ))}
    </>
  );
}
export function HelpCentre({
  articles,
  categories,
  base,
  path = [],
  audience = 'internal',
  capabilities = [],
  roles = [],
}: {
  articles: HelpArticle[];
  categories: Category[];
  base: string;
  path?: string[];
  audience?: HelpAudience;
  capabilities?: string[];
  roles?: string[];
}) {
  const [query, setQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const category = categories.find((c) => c.id === path[0]);
  const article =
    path.length === 2
      ? articles.find((a) => a.category === path[0] && a.id === path[1])
      : undefined;
  const manual = path.length === 1 && path[0] === 'manual';
  const unknown =
    path.length > 2 || (path.length > 0 && !manual && !category) || (path.length === 2 && !article);
  const filtered = searchHelp(
    articles.filter((a) => !categoryFilter || a.category === categoryFilter),
    query,
  );
  const recommended =
    audience === 'internal' ? recommendedHelp(articles, roles, capabilities) : articles.slice(0, 3);
  const currentList = articles.filter((a) => a.category === category?.id),
    currentIndex = currentList.findIndex((a) => a.id === article?.id);
  const destination =
    audience === 'internal' ? helpDestination(article?.destination, capabilities) : undefined;
  const date = (s: string) =>
    new Intl.DateTimeFormat('en-CA', { dateStyle: 'long', timeZone: 'UTC' }).format(
      new Date(`${s}T00:00:00Z`),
    );
  const card = (a: HelpArticle) => (
    <Link className="help-result" key={a.id} href={articleHref(base, a)}>
      <span>{categories.find((c) => c.id === a.category)?.title}</span>
      <h3>
        {a.title}
        <ChevronRight size={17} />
      </h3>
      <p>{a.summary}</p>
    </Link>
  );
  return (
    <div className={`help-centre ${manual ? 'help-manual' : ''}`}>
      <div className="help-topbar help-no-print">
        <Link href={base}>
          <BookOpen size={18} />
          {audience === 'internal' ? 'HOW TO' : 'Help'}
        </Link>
        <Link href={`${base}/manual`}>
          <Printer size={16} />
          Full manual
        </Link>
      </div>
      {unknown ? (
        <div className="help-empty">
          <CircleHelp size={32} />
          <h1>Guide not found</h1>
          <p>
            This link does not match a current guide. Search the help centre for the topic you need.
          </p>
          <Link href={base}>Return to Help</Link>
        </div>
      ) : manual ? (
        <>
          <header className="help-manual-title">
            <p className="eyebrow">CEDAR WINDS DESIGN~BUILD</p>
            <h1>
              {audience === 'internal'
                ? 'CWManagement operating manual'
                : `${audience === 'client' ? 'Client' : 'Trade'} Portal guide`}
            </h1>
            <p>Current supported workflows • September 28, 2026</p>
            <button className="help-no-print" onClick={() => window.print()}>
              <Printer size={17} />
              Print full manual
            </button>
          </header>
          {categories.map((c) => (
            <section key={c.id} className="help-manual-category">
              <h2>{c.title}</h2>
              {articles
                .filter((a) => a.category === c.id)
                .map((a) => (
                  <article key={a.id} className="help-manual-article">
                    <h1>{a.title}</h1>
                    <p className="help-lead">{a.summary}</p>
                    <ArticleBody article={a} />
                  </article>
                ))}
            </section>
          ))}
        </>
      ) : article ? (
        <>
          <nav className="help-breadcrumb help-no-print" aria-label="Help breadcrumbs">
            <Link href={base}>Help centre</Link>
            <ChevronRight size={14} />
            <Link href={`${base}/${category!.id}`}>{category!.title}</Link>
            <ChevronRight size={14} />
            <span>{article.title}</span>
          </nav>
          <div className="help-reading-layout">
            <aside className="help-toc help-no-print">
              <strong>In this guide</strong>
              <nav aria-label="Article contents">
                {article.sections.map((s, i) => (
                  <a key={i} href={`#${article.id}-section-${i}`}>
                    {s.heading}
                  </a>
                ))}
              </nav>
              <Link href={`${base}/${category!.id}`}>All {category!.title} guides</Link>
            </aside>
            <article className="help-article">
              <header>
                <p className="eyebrow">{category!.title}</p>
                <h1>{article.title}</h1>
                <p className="help-lead">{article.summary}</p>
                <div className="help-article-meta">
                  <span>Updated {date(article.updated)}</span>
                  <button className="text-button help-no-print" onClick={() => window.print()}>
                    <Printer size={16} />
                    Print guide
                  </button>
                </div>
              </header>
              <ArticleBody article={article} />
              <div className="help-no-print">
                {destination && (
                  <section className="help-go">
                    <h2>Go there</h2>
                    <Link className="button primary" href={destination.href}>
                      {destination.label}
                      <ChevronRight size={16} />
                    </Link>
                    {destination.href === '/projects' && (
                      <p>Choose your project, then open the tab described in this guide.</p>
                    )}
                  </section>
                )}
                {article.related.length > 0 && (
                  <section className="help-related">
                    <h2>Related guides</h2>
                    {article.related
                      .map((id) => articles.find((a) => a.id === id))
                      .filter((a): a is HelpArticle => !!a)
                      .map(card)}
                  </section>
                )}
                <nav className="help-pagination" aria-label="Previous and next guide">
                  {currentIndex > 0 && (
                    <Link href={articleHref(base, currentList[currentIndex - 1])}>
                      ← Previous: {currentList[currentIndex - 1].title}
                    </Link>
                  )}
                  {currentIndex >= 0 && currentIndex < currentList.length - 1 && (
                    <Link href={articleHref(base, currentList[currentIndex + 1])}>
                      Next: {currentList[currentIndex + 1].title} →
                    </Link>
                  )}
                </nav>
              </div>
            </article>
          </div>
        </>
      ) : category ? (
        <>
          <nav className="help-breadcrumb">
            <Link href={base}>Help centre</Link>
            <ChevronRight size={14} />
            <span>{category.title}</span>
          </nav>
          <header className="help-category-heading">
            <h1>{category.title}</h1>
            <p className="help-lead">{category.summary}</p>
          </header>
          <div className="help-results">{currentList.map(card)}</div>
        </>
      ) : (
        <>
          <header className="help-hero">
            <span className="eyebrow">
              CEDAR WINDS •{' '}
              {audience === 'internal' ? 'OPERATING MANUAL' : `${audience.toUpperCase()} HELP`}
            </span>
            <h1>How can we help?</h1>
            <p>Clear steps for the work you need to do.</p>
            <label className="help-search">
              <Search size={23} />
              <span className="sr-only">Search CWManagement help</span>
              <input
                type="search"
                placeholder="Search CWManagement help..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </label>
          </header>
          <div className="help-home-layout">
            <aside className="help-category-nav help-no-print">
              <label>
                Browse by category
                <select
                  aria-label="Help category"
                  value={categoryFilter}
                  onChange={(e) => setCategoryFilter(e.target.value)}
                >
                  <option value="">All categories</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.title}
                    </option>
                  ))}
                </select>
              </label>
              <nav aria-label="Help categories">
                {categories.map((c) => (
                  <Link key={c.id} href={`${base}/${c.id}`}>
                    {c.title}
                  </Link>
                ))}
              </nav>
            </aside>
            <div>
              {query.trim() || categoryFilter ? (
                <>
                  <div className="help-result-heading">
                    <h2>Search results</h2>
                    <span role="status">{filtered.length} guides</span>
                  </div>
                  {filtered.length ? (
                    <div className="help-results">{filtered.map(card)}</div>
                  ) : (
                    <div className="help-empty">
                      <h3>No matching guides</h3>
                      <p>
                        Try a shorter word such as “clock”, “estimate” or “template”, or choose All
                        categories.
                      </p>
                      <button
                        onClick={() => {
                          setQuery('');
                          setCategoryFilter('');
                        }}
                      >
                        Clear search
                      </button>
                    </div>
                  )}
                </>
              ) : (
                <>
                  {audience === 'internal' && (
                    <Link href={`${base}/getting-started/quick-start`} className="help-start">
                      <BookOpen size={29} />
                      <div>
                        <h2>New to CWManagement?</h2>
                        <p>Follow a project from first contact to active work and closeout.</p>
                      </div>
                      <ChevronRight size={24} />
                    </Link>
                  )}
                  <section>
                    <h2>{audience === 'internal' ? 'A useful place to start' : 'Start here'}</h2>
                    <div className="help-recommended">{recommended.map(card)}</div>
                  </section>
                  <section>
                    <h2>Explore the guides</h2>
                    <div className="help-category-cards">
                      {categories.map((c) => (
                        <Link key={c.id} href={`${base}/${c.id}`}>
                          <BookOpen size={21} />
                          <h3>{c.title}</h3>
                          <p>{c.summary}</p>
                          <small>
                            {articles.filter((a) => a.category === c.id).length} guides →
                          </small>
                        </Link>
                      ))}
                    </div>
                  </section>
                  <p className="help-boundary">
                    <ShieldCheck size={18} />
                    {audience === 'internal'
                      ? 'Guides explain the work. Your account permissions still control the actions and projects available to you.'
                      : 'Your help stays in this portal. If expected work is missing, ask Cedar Winds to check what has been shared with you.'}
                  </p>
                </>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
