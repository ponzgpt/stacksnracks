import { test } from 'node:test';
import assert from 'node:assert/strict';
import { estimateTps, tpsPerK, largestFit, MODELS } from './estimate.js';
import { validEmail, rateLimiter } from './subscribe.js';

const [m8, m32, m70] = MODELS;
const rtx3090 = { memGb: 24, bwGbs: 936, price: { low: 1000, high: 1300 } };
const dual3090 = { memGb: 48, bwGbs: 936, price: { low: 2000, high: 2600 } };

test('decode estimate is bandwidth-bound and null when the model does not fit', () => {
  assert.equal(estimateTps(rtx3090, m8), 115);
  assert.equal(estimateTps(rtx3090, m70), null);
  // a second GPU adds capacity, not decode speed
  assert.equal(estimateTps(dual3090, m70), estimateTps({ ...rtx3090, memGb: 48 }, m70));
  assert.equal(largestFit(rtx3090), m32);
  assert.equal(largestFit(dual3090), m70);
  assert.equal(tpsPerK(rtx3090, m8), 100);
});

test('email validation', () => {
  assert.ok(validEmail('dev@example.com'));
  for (const bad of ['', 'nope', 'a@b', 'a b@c.com', '<x>@y.com', 'x'.repeat(300) + '@y.com']) assert.ok(!validEmail(bad), bad);
});

test('rate limiter allows max per window per key', () => {
  let t = 0;
  const allow = rateLimiter({ max: 2, windowMs: 1000, now: () => t });
  assert.deepEqual([allow('a'), allow('a'), allow('a'), allow('b')], [true, true, false, true]);
  t = 1000;
  assert.ok(allow('a'));
});
