/**
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
  roots: ['<rootDir>/src', '<rootDir>/__tests__'],
  testMatch: ['**/__tests__/**/*.test.ts', '**/__tests__/**/*.test.tsx'],
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json'],
  collectCoverageFrom: [
    'src/**/*.{ts,tsx}',
    '!src/**/*.d.ts',
    '!src/theme/**/*.tsx', // Component tests would need jsdom environment
    '!src/utils/markdown.ts', // Browser-only utility (DOMPurify requires DOM)
    '!src/annotation-utils.ts', // Only used in theme components (UptimeChart)
    '!src/notifications/**/*.ts', // Notification system has separate test coverage
  ],
  coverageThreshold: {
    global: {
      branches: 70, // Temporarily lowered during active development of new features
      functions: 80,
      lines: 80,
      statements: 80,
    },
  },
  transform: {
    '^.+\\.tsx?$': ['ts-jest', {
      tsconfig: {
        jsx: 'react',
        esModuleInterop: true,
        allowSyntheticDefaultImports: true,
      },
    }],
  },
  moduleNameMapper: {
    // Mock CSS modules
    '\\.css$': '<rootDir>/__mocks__/styleMock.js',
    // Mock @theme modules
    '^@theme/Layout$': '<rootDir>/__mocks__/Layout.js',
    // Mock markdown utility (uses ESM modules marked/dompurify)
    '^@site/src/utils/markdown$': '<rootDir>/__mocks__/markdown.ts',
    '^\\.\\./\\.\\./utils/markdown$': '<rootDir>/__mocks__/markdown.ts',
    '^\\.\\./\\.\\./\\.\\./utils/markdown$': '<rootDir>/__mocks__/markdown.ts',
  },
};
