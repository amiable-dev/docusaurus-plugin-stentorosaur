module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src', '<rootDir>/__tests__'],
  testMatch: ['**/__tests__/**/*.test.ts'],
  moduleFileExtensions: ['ts', 'js', 'json'],
  moduleNameMapper: {
    // marked v17 ships ESM-only via its exports map; jest's CJS runtime
    // needs the UMD build. At runtime the compiled lib relies on Node's
    // require(esm) support (hence engines >= 20.19).
    '^marked$': '<rootDir>/../../node_modules/marked/lib/marked.umd.js',
  },
};
