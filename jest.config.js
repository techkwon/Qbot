// jest.config.js
const nextJest = require('next/jest')({
  // Provide the path to your Next.js app to load next.config.js and .env files in your test environment
  dir: './',
});

// Add any custom config to be passed to Jest
/** @type {import('jest').Config} */
const customJestConfig = {
  // Add more setup options before each test is run
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'], 

  // If using TypeScript with a baseUrl set to the root directory then you need the below for alias' to work
  moduleDirectories: ['node_modules', '<rootDir>/'],
  testEnvironment: 'node', // Use node environment for API tests
  moduleNameMapper: {
    // Handle module aliases (manually configure for Jest)
    '^@/(.*)$': '<rootDir>/src/$1',
    // Handle module aliases (this will be automatically configured by next/jest)
    // Example: '^@/components/(.*)$': '<rootDir>/src/components/$1',
    // We can let next/jest handle this based on tsconfig.json paths
  },
  // Automatically clear mock calls and instances between every test
  clearMocks: true,
  // The directory where Jest should output its coverage files
  coverageDirectory: "coverage",
  // Indicates which provider should be used to instrument code for coverage
  coverageProvider: "v8",
};

// createJestConfig is exported this way to ensure that next/jest can load the Next.js config which is async
module.exports = nextJest(customJestConfig);
