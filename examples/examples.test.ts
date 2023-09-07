describe('Example tests', () => {
  it('test with ', () => {
    expect(true);
  });

  it("test with ' single quote", () => {
    expect(true);
  });

  it('test with " double quote', () => {
    expect(true);
  });

  it('test with () parenthesis', () => {
    expect(true);
  });

  it('test with [ square bracket', () => {
    expect(true);
  });

  it(`test with 
lf`, () => {
    expect(true);
  });

  it(`test with \nmanual lf`, () => {
    expect(true);
  });

  it(`test with \r\nmanual crlf`, () => {
    expect(true);
  });

  it('test with %var%', () => {
    expect(true);
  });

  const v = 'interpolated string';
  it(`test with ${v}`, () => {
    expect(true);
  });

  it('test with $var', () => {
    expect(true);
  });

  it('test with `backticks`', () => {
    expect(true);
  });

  it('test with regex .*$^|[]', () => {
    expect(true);
  });
});

// #311
it.each([1, 2])('test with generated %i', (id) => {
  expect(true);
});

describe('nested', () => {
  describe('a', () => {
    it('b', () => {
      expect(true);
    });
  });
});

// #299
class TestClass {
  myFunction() {
    // nothing
  }
}
it(TestClass.prototype.myFunction.name, () => {
  expect(true).toBe(true);
});
