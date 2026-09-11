/** Pure logic only: the layout tree and the shell bindings. Everything that
 *  needs a browser is verified against a real one, not simulated here.
 *
 *  Transformed by next/jest, which uses the SWC that `next` already ships — so
 *  there is no second toolchain to install and no native binary behind an
 *  install script this repo's supply-chain policy blocks.
 *
 *  It replaced ts-jest, which reads the TypeScript compiler's JavaScript API.
 *  TypeScript 7 does not expose that API, so with `typescript` pinned to 7.0.2
 *  every suite here failed to LOAD and `jest` reported zero tests rather than a
 *  failure. ts-jest states the limit itself — `typescript: >=4.3 <7` — and its
 *  newest release is still 29.
 *
 *  Types are checked by `tsc --noEmit`, which is the job the type checker has.
 *  A test run that also type-checks ties what the tests can do to which
 *  compiler is pinned, and that is exactly how a version bump silenced them. */
const nextJest = require('next/jest');

module.exports = nextJest({ dir: __dirname })({
  testEnvironment: 'node',
  testMatch: ['<rootDir>/tests/**/*.test.ts'],
  moduleNameMapper: { '^@/(.*)$': '<rootDir>/$1' },
});
