import { resolveTestNameStringInterpolation } from '../../util';

it('resolveTestNameStringInterpolation %i', () => {
  expect(resolveTestNameStringInterpolation('%i')).toBe('(.*?)');
});

it('resolveTestNameStringInterpolation $expected', () => {
  expect(resolveTestNameStringInterpolation('$expected')).toBe('(.*?)');
});

it('resolveTestNameStringInterpolation ${i}', () => {
  expect(resolveTestNameStringInterpolation('${i}')).toBe('(.*?)');
});

it('resolveTestNameStringInterpolation $a + $b returned value not be less than ${i}', () => {
  expect(resolveTestNameStringInterpolation('$a + $b returned value not be less than ${i}')).toBe(
    '(.*?) + (.*?) returned value not be less than (.*?)'
  );
});

it('resolveTestNameStringInterpolation returns $expected when $a is added $b', () => {
  expect(resolveTestNameStringInterpolation('returns $expected when $a is added $b')).toBe(
    'returns (.*?) when (.*?) is added (.*?)'
  );
});

it('resolveTestNameStringInterpolation .add(%i, %i) returns ${i}', () => {
  expect(resolveTestNameStringInterpolation('.add(%i, %i) returns ${i}')).toBe('.add((.*?), (.*?)) returns (.*?)');
});
