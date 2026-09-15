// A stylesheet import is resolved by the bundler, never by TypeScript. TS 7
// reports one it cannot resolve as TS2882, and next-env.d.ts, which declares
// them, exists only after a build, so the typecheck that runs first needs this.
declare module '*.css';
