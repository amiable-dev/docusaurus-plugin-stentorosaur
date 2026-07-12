module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src', '<rootDir>/__tests__'],
  testMatch: ['**/__tests__/**/*.test.ts'],
  moduleFileExtensions: ['ts', 'js', 'json'],
  // 30s default: the git-writer integration tests spawn real git processes
  testTimeout: 30000,
  moduleNameMapper: {
    // Resolve workspace-sibling core from source; marked v17 is ESM-only
    // so jest's CJS runtime uses the UMD build (same as core's own config).
    '^@stentorosaur/core$': '<rootDir>/../core/src',
    '^@stentorosaur/core/server$': '<rootDir>/../core/src/server',
    '^marked$': '<rootDir>/../../node_modules/marked/lib/marked.umd.js',
  },
};
