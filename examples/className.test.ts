// Test file to verify describe(ClassName.name) support
// See: https://github.com/firsttris/vscode-jest-runner/issues/286

class Calculator {
  add(a: number, b: number): number {
    return a + b;
  }

  subtract(a: number, b: number): number {
    return a - b;
  }
}

class StringUtils {
  static capitalize(str: string): string {
    return str.charAt(0).toUpperCase() + str.slice(1);
  }
}

// Pattern 1: describe(ClassName.name)
describe(Calculator.name, () => {
  const calc = new Calculator();

  it('should add two numbers', () => {
    expect(calc.add(2, 3)).toBe(5);
  });

  it('should subtract two numbers', () => {
    expect(calc.subtract(5, 3)).toBe(2);
  });

  it(Calculator.name + ' method existence', () => {
    expect(typeof calc.add).toBe('function');
    expect(typeof calc.subtract).toBe('function');
  });
});

// Pattern 2: Nested describe with ClassName.name
describe(StringUtils.name, () => {
  describe('capitalize', () => {
    it('should capitalize first letter', () => {
      expect(StringUtils.capitalize('hello')).toBe('Hello');
    });
  });
});

// Pattern 3: Regular string literal (for comparison)
describe('RegularDescribe', () => {
  it('should work with string literal', () => {
    expect(true).toBe(true);
  });
});
