import { escapeHtml } from './business-commerce.service';

describe('escapeHtml', () => {
  it('escapes HTML metacharacters in primitive values', () => {
    expect(escapeHtml(`<a href="x">Tom & Jerry's</a>`)).toBe(
      '&lt;a href=&quot;x&quot;&gt;Tom &amp; Jerry&#39;s&lt;/a&gt;',
    );
    expect(escapeHtml(42)).toBe('42');
  });

  it('renders nullish and object values as empty strings', () => {
    expect(escapeHtml(null)).toBe('');
    expect(escapeHtml(undefined)).toBe('');
    expect(escapeHtml({ toString: () => '<script>' })).toBe('');
  });
});
