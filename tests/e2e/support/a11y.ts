import AxeBuilder from '@axe-core/playwright';
import { type Page, expect } from '@playwright/test';

/** WCAG 2.2 A and AA rules on the rendered page in a real browser (colour contrast included). */
export async function expectNoA11yViolations(page: Page) {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze();
  const summary = results.violations.map(
    (v) =>
      `${v.id} (${v.impact}): ${v.help}\n  ${v.nodes
        .map((n) => n.target.join(' '))
        .slice(0, 3)
        .join('\n  ')}`,
  );
  expect(summary, summary.join('\n')).toEqual([]);
}
