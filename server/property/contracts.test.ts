import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as calc from './calc.ts';

test('contract prices retain precise positive decimal values', () => {
  assert.equal(typeof (calc as Record<string, unknown>).validUtilityPrice, 'function');
  const valid = (calc as unknown as { validUtilityPrice: (value: string) => boolean }).validUtilityPrice;
  assert.equal(valid('0.123456'), true);
  assert.equal(valid('0'), false);
  assert.equal(valid('0.1234567'), false);
  assert.equal(valid('-1'), false);
});
