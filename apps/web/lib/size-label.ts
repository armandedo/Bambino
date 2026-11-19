/** Keep the public size wording while omitting an internal development-catalogue annotation. */
export function displaySizeLabel(label: string): string {
  return label.replace(/\s*\(seed chart\)/gi, '').trim();
}
