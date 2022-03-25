const { sum, getRegularToday } = require('../src/utils/helpers');

describe('Helpers', () => {
  test('getRegularToday', () => {
    expect(getRegularToday()).toBe('');
  });
});
