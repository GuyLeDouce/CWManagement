import { describe, it, expect } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { internalGuides } from '../src/lib/help';
import { categories } from '../src/lib/help/types';
import { clientGuides, tradeGuides } from '../src/lib/help/portals';
import {
  articleHref,
  helpDestination,
  recommendedHelp,
  searchHelp,
  contextualArticles,
  projectContext,
} from '../src/lib/help/navigation';
import { HelpCentre } from '../src/components/help-centre';
describe('versioned operating manual', () => {
  it('has unique, complete articles and valid related links in each audience', () => {
    for (const list of [internalGuides, clientGuides, tradeGuides]) {
      expect(new Set(list.map((a) => a.id)).size).toBe(list.length);
      for (const a of list) {
        expect(a.title.length).toBeGreaterThan(5);
        expect(a.sections.length).toBeGreaterThan(3);
        expect(a.updated).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        for (const id of a.related)
          expect(
            list.some((x) => x.id === id),
            `${a.id} → ${id}`,
          ).toBe(true);
      }
    }
    for (const c of categories)
      expect(
        internalGuides.some((a) => a.category === c.id),
        c.id,
      ).toBe(true);
  });
  it('searches partial titles, headings, terminology and body text', () => {
    expect(searchHelp(internalGuides, 'estim').some((a) => a.id === 'create-estimate')).toBe(true);
    expect(searchHelp(internalGuides, 'change order').some((a) => a.id === 'change-approval')).toBe(
      true,
    );
    expect(searchHelp(internalGuides, 'clock').some((a) => a.id === 'approve-time')).toBe(true);
    expect(
      searchHelp(internalGuides, 'markup margin').some((a) => a.id === 'estimate-pricing'),
    ).toBe(true);
    expect(searchHelp(internalGuides, 'quickbooks taxable').some((a) => a.id === 'qb-po')).toBe(
      true,
    );
    expect(searchHelp(internalGuides, 'notarealhelpterm')).toEqual([]);
    expect(searchHelp(internalGuides, '  ')).toHaveLength(internalGuides.length);
  });
  it('recommends relevant work without hiding the rest of the manual', () => {
    expect(recommendedHelp(internalGuides, ['FIELD'], ['TIME_CLOCK'])[0].id).toBe('clock-in');
    expect(
      recommendedHelp(internalGuides, ['FIELD'], ['TIME_CLOCK', 'PROJECT_VIEW_ASSIGNED'])[0].id,
    ).toBe('clock-in');
    expect(recommendedHelp(internalGuides, ['CONTROLLER'], ['QUICKBOOKS_VIEW'])[0].id).toBe(
      'qb-overview',
    );
    expect(recommendedHelp(internalGuides, ['OWNER'], [])[0].id).toBe('quick-start');
    expect(recommendedHelp(internalGuides, ['ESTIMATOR'], ['ESTIMATE_EDIT'])[0].id).toBe(
      'create-estimate',
    );
  });
  it('offers no restricted action destination without its effective capability', () => {
    expect(helpDestination('quickbooks', [])).toBeUndefined();
    expect(helpDestination('admin', ['TIME_CLOCK'])).toBeUndefined();
    expect(helpDestination('projects', ['TIME_CLOCK'])).toBeUndefined();
    expect(helpDestination('quickbooks', ['QUICKBOOKS_VIEW'])?.href).toBe('/financials/quickbooks');
    expect(helpDestination('templates', ['TEMPLATE_VIEW'])?.href).toBe('/templates');
  });
  it('resolves every contextual help target and deep link', () => {
    for (const id of [...Object.values(contextualArticles), ...Object.values(projectContext)])
      expect(internalGuides.some((a) => a.id === id)).toBe(true);
    const a = internalGuides.find((a) => a.id === 'create-project')!;
    expect(articleHref('/how-to', a)).toBe('/how-to/projects/create-project');
  });
  it('renders category, unknown, article and printable full-manual states', () => {
    const render = (path: string[]) =>
      renderToStaticMarkup(
        createElement(HelpCentre, { articles: internalGuides, categories, base: '/how-to', path }),
      );
    expect(render(['bad-category', 'missing'])).toContain('Guide not found');
    expect(render(['estimating'])).toContain('Creating an Estimate');
    expect(render(['estimating', 'create-estimate'])).toContain('Related guides');
    const manual = render(['manual']);
    for (const a of internalGuides)
      expect(manual).toContain(a.title.replaceAll('&', '&amp;').replaceAll("'", '&#x27;'));
    expect(manual).toContain('Print full manual');
    expect(render(['quickbooks', 'qb-po'])).not.toContain('href="/financials/quickbooks"');
  });
  it('external guides contain no internal action destinations or internal article links', () => {
    for (const list of [clientGuides, tradeGuides])
      for (const a of list) expect(a.destination).toBeUndefined();
    const html = renderToStaticMarkup(
      createElement(HelpCentre, {
        articles: clientGuides,
        categories: [{ id: 'using-portal', title: 'Using your portal', summary: '' }],
        base: '/client/help',
        audience: 'client',
        path: ['manual'],
      }),
    );
    expect(html).not.toContain('/how-to');
    expect(html).not.toContain('/financials');
    expect(html).toContain('Client Portal guide');
  });
});
