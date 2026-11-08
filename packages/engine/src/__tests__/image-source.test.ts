import { describe, expect, it } from 'vitest';
import { imageSourceAllowed } from '../editor/utils/imageSource';

describe('document image source policy', () => {
  it('preserves standalone behavior and fails closed for client policies', () => {
    const element = { value: 'https://external.invalid/image.png' };
    expect(imageSourceAllowed({}, element)).toBe(true);
    expect(imageSourceAllowed({ imageSourceAllowed: () => false }, element)).toBe(false);
    expect(
      imageSourceAllowed(
        {
          imageSourceAllowed: () => {
            throw new Error('invalid');
          },
        },
        element,
      ),
    ).toBe(false);
    expect(
      imageSourceAllowed(
        { imageSourceAllowed: (candidate) => candidate.value === '/owned.png' },
        { value: '/owned.png' },
      ),
    ).toBe(true);
  });
});
