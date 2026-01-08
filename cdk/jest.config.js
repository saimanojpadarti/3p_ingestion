module.exports = {
  roots: ['<rootDir>/test'],
  testMatch: ['**/*.test.ts'],
  transform: {
    '^.+\\.tsx?$': 'ts-jest'
  },
  coverageReporters: ['cobertura'],
  reporters: [
    "default",
    "jest-junit",
  ]
};
