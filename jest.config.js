/** Pure logic only: the layout tree and the shell bindings. Everything that
 *  needs a browser is verified against a real one, not simulated here. */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['<rootDir>/tests/**/*.test.ts'],
  moduleNameMapper: { '^@/(.*)$': '<rootDir>/$1' },
};
