// ESM test file to test node --experimental-vm-modules

describe('ESM test', () => {
  it('should run with node flags', () => {
    expect(true).toBe(true);
  });

  it('another test', () => {
    expect(1 + 1).toBe(2);
  });
});
