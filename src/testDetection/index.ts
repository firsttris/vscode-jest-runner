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

export {
  testDetectionCache,
  vitestDetectionCache,
  clearTestDetectionCache,
  clearVitestDetectionCache,
} from './cache';

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

export {
  fileMatchesPatternsExplicit,
  fileMatchesPatterns,
  detectFrameworkByPatternMatch,
} from './patternMatching';

export {
  isJestUsedIn,
  isVitestUsedIn,
  detectTestFramework,
  findTestFrameworkDirectory,
  findJestDirectory,
  findVitestDirectory,
  getParentDirectories,
} from './frameworkDetection';

export {
  matchesTestFilePattern,
  isJestTestFile,
  isVitestTestFile,
  isTestFile,
  getTestFrameworkForFile,
  hasConflictingTestFramework,
} from './testFileDetection';

export { isEsmProject } from './esmDetection';
