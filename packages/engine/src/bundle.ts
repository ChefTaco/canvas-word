// Entry of the published bundles: the public API (`./index`) plus one internal
// binding that `dist/testing.js` (the `./testing` entry) reads, so fixtures use
// the main bundle's module instance. It is not declared in the public types and
// is not part of the API; import diagnostics from `./testing`.
export { default } from './index';
export * from './index';
import * as testing from './testing';
export const __canvasWordTesting = testing;
