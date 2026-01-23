export interface JestAssertionResult {
  ancestorTitles: string[];
  title: string;
  fullName?: string;
  status: 'passed' | 'failed' | 'skipped' | 'pending' | 'todo';
  duration?: number;
  failureMessages?: string[];
  location?: { line: number; column: number } | null;
}

export interface JestFileResult {
  assertionResults: JestAssertionResult[];
  name: string;
  status: string;
  message: string;
  startTime: number;
  endTime: number;
  summary?: string;
}

export interface JestResults {
  numFailedTestSuites: number;
  numFailedTests: number;
  numPassedTestSuites: number;
  numPassedTests: number;
  numPendingTestSuites: number;
  numPendingTests: number;
  numTotalTestSuites: number;
  numTotalTests: number;
  success: boolean;
  testResults: JestFileResult[];
}
