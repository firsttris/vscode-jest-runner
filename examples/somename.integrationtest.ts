// Example integration test file to demonstrate the bug fix
// With the pattern: **/*.{test,spec,integrationtest}.{js,jsx,ts,tsx}
// This file should now show CodeLens actions

describe('Integration Test Example', () => {
  it('should run this integration test', () => {
    expect(true).toBe(true);
  });

  it('should also run this test', () => {
    expect(1 + 1).toBe(2);
  });
});
