import { describe, expect, it } from 'vitest';
import { safeHyperlink } from '../editor/utils/hyperlink';
describe('native hyperlink navigation guard', () => {
  it('rejects active schemes and control-character obfuscation before popup navigation', () => {
    for (const value of [
      'javascript:alert(1)',
      'JaVaScRiPt:alert(1)',
      'data:text/html,<script>x</script>',
      'blob:https://app.example/id',
      'file:///etc/passwd',
      'java\nscript:alert(1)',
      'javascript:\talert(1)',
      'vbscript:msgbox(1)',
    ])
      expect(safeHyperlink(value, 'https://app.example/')).toBeUndefined();
  });
  it('permits safe absolute and relative links without changing their source text', () => {
    expect(safeHyperlink('https://example.org/path?q=a%20b', 'https://app.example/')).toBe(
      'https://example.org/path?q=a%20b',
    );
    expect(safeHyperlink('mailto:writer@example.org')).toBe('mailto:writer@example.org');
    expect(safeHyperlink('/read#chapter', 'https://app.example/')).toBe(
      'https://app.example/read#chapter',
    );
  });
});
