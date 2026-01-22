module.exports = {
    collectCoverageFrom: ['src/**/*.{js,jsx,ts,tsx}'],
    coverageDirectory: './coverage',
    coverageReporters: ['json-summary', 'text'],
    moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx'],
    passWithNoTests: true,
    resetMocks: true,
    restoreMocks: true,
    testEnvironment: 'jsdom',
    testRegex: 'src/.*\\.spec\\.[tj]sx?',
    rootDir: '.',
};
