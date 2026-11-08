import { describe, expect, it } from 'vitest';
import { TextParticle } from '../editor/core/draw/particle/TextParticle';
import type { Draw } from '../editor/core/draw/Draw';

describe('font basis metrics', () => {
  it('reuses measurements by computed font while retaining independent sizes and restoring the context', () => {
    let measurements = 0;
    let saves = 0;
    let previous = '';
    const ctx = {
      font: '16px Georgia',
      save: () => {
        saves++;
        previous = ctx.font;
      },
      restore: () => {
        ctx.font = previous;
      },
      measureText: () => {
        measurements++;
        return { actualBoundingBoxAscent: parseInt(ctx.font), width: 10 };
      },
    } as unknown as CanvasRenderingContext2D;
    const particle = new TextParticle({
      getOptions: () => ({}),
      getCtx: () => ctx,
    } as unknown as Draw);
    const first = particle.measureBasisWord(ctx, '16px Georgia');
    for (let i = 0; i < 100; i++)
      expect(particle.measureBasisWord(ctx, '16px Georgia')).toBe(first);
    const large = particle.measureBasisWord(ctx, '24px Georgia');
    expect(large.actualBoundingBoxAscent).toBe(24);
    expect(first.actualBoundingBoxAscent).toBe(16);
    expect(ctx.font).toBe('16px Georgia');
    expect(measurements).toBe(2);
    expect(saves).toBe(2);
  });
});
