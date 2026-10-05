import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { PreviewBanner } from './site-chrome';

describe('PreviewBanner', () => {
  it('is hidden unless the build is a preview', () => {
    expect(renderToStaticMarkup(<PreviewBanner preview={false} mockPayments={false} />)).toBe('');
  });

  it('says a preview is a preview, and mentions test wallets only when they are on', () => {
    expect(renderToStaticMarkup(<PreviewBanner preview mockPayments />)).toContain('test wallets');
    const withoutMock = renderToStaticMarkup(<PreviewBanner preview mockPayments={false} />);
    expect(withoutMock).toContain('Preview build.');
    expect(withoutMock).not.toContain('test wallets');
  });
});
