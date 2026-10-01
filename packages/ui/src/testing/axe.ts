import axe from 'axe-core';

/**
 * Runs axe on a rendered container and returns readable violations. Colour contrast is excluded because
 * jsdom does not compute styles; tokens.test.ts checks every colour pair with the WCAG formula instead.
 */
export async function axeViolations(container: Element): Promise<string[]> {
  const result = await axe.run(container, {
    rules: { 'color-contrast': { enabled: false }, region: { enabled: false } },
  });
  return result.violations.map(
    (violation) =>
      `${violation.id}: ${violation.help} (${violation.nodes.map((node) => node.html).join(', ')})`,
  );
}
