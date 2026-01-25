// Types and definitions
export {
  TestFrameworkName,
  TestFramework,
  TestPatterns,
  TestPatternResult,
  FrameworkResult,
  SearchOutcome,
  DEFAULT_TEST_PATTERNS,
  testFrameworks,
} from './frameworkDefinitions';

// Cache management
export {
  testDetectionCache,
  vitestDetectionCache,
  clearTestDetectionCache,
  clearVitestDetectionCache,
} from './cache';

// Config parsing
export {
  viteConfigHasTestAttribute,
  packageJsonHasJestConfig,
  binaryExists,
  getConfigPath,
  getTestMatchFromJestConfig,
  getVitestConfig,
  getIncludeFromVitestConfig,
  resolveAndValidateCustomConfig,
} from './configParsing';

// Pattern matching
export {
  fileMatchesPatternsExplicit,
  fileMatchesPatterns,
  detectFrameworkByPatternMatch,
} from './patternMatching';

// Framework detection
export {
  isJestUsedIn,
  isVitestUsedIn,
  detectTestFramework,
  findTestFrameworkDirectory,
  findJestDirectory,
  findVitestDirectory,
  getParentDirectories,
} from './frameworkDetection';

// Test file detection
export {
  matchesTestFilePattern,
  isJestTestFile,
  isVitestTestFile,
  isTestFile,
  getTestFrameworkForFile,
  hasConflictingTestFramework,
} from './testFileDetection';

// ESM detection
export { isEsmProject } from './esmDetection';
