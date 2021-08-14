describe('testSuiteA', () => {
    describe('test1()', () => {
      it('should run this test', () => {
        expect(true).toBe(true);
      });
    });
  
    it('should run this test', () => {
      expect(true).toBe(true);
    });
  
    describe('test2', () => {
      it('should run this test', () => {
        expect(true).toBe(true);
      });
  
      describe('test3', () => {
        it('should run this test 3', () => {
          expect(true).toBe(true);
        });
      });
    });
  });
  
  describe('testSuiteB', () => {
    it('lol', () => {
      expect(true).toBe(true);
    });
  });
  
  describe.each`
    a    | b    | expected
    ${1} | ${1} | ${2}
  `('$a + $b', ({ a, b, expected }) => {
    test(`returned value not be less than ${expected}`, () => {
      expect(a + b).not.toBeLessThan(expected);
    });
  });
  
  test.each`
    a    | b    | expected
    ${1} | ${1} | ${2}
  `('returns $expected when $a is added $b', ({ a, b, expected }) => {
    expect(a + b).toBe(expected); // will not be ran
  });
  
  describe.each([[1, 1, 2]])('.add(%i, %i)', (a, b, expected) => {
    test(`returns ${expected}`, () => {
      expect(a + b).toBe(expected);
    });
  });
  