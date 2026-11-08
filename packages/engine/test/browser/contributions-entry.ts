import { BackendType } from '../../src/editor/dataset/enum/Editor';
import { reviewParagraphLayoutInBrowser } from '../upstream/browser/paragraphLayout';
import { reviewTableLayoutInBrowser } from '../upstream/browser/tableCellLayout';
import { reviewTableLayoutEdgesInBrowser } from '../upstream/browser/tableLayoutReview';
import { reviewParagraphFlowInBrowser } from '../upstream/browser/paragraphFlow';
import { reviewParagraphFlowEdgesInBrowser } from '../upstream/browser/paragraphFlowReview';

export function runContributionChecks() {
  const results: unknown[] = [];
  for (const backend of [BackendType.CANVAS, BackendType.SVG]) {
    results.push(...reviewParagraphLayoutInBrowser(backend));
    results.push(...reviewTableLayoutInBrowser(backend));
    results.push(...reviewParagraphFlowInBrowser(backend));
    const tables = reviewTableLayoutEdgesInBrowser(backend);
    if (!tables.passed) throw new Error(JSON.stringify(tables));
    results.push(...tables.results);
    for (const scale of [0.5, 1, 2]) {
      const flow = reviewParagraphFlowEdgesInBrowser(scale, backend);
      if (flow.some(result => !result.passed)) throw new Error(JSON.stringify(flow));
      results.push(...flow);
    }
  }
  return results.length;
}
