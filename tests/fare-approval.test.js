import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateTaxiPolicy, approvalSummary } from '../taxi/core.js';

test('50,000 won inclusive threshold distinguishes ordinary and separate approval', () => {
  const below = evaluateTaxiPolicy(4800, 2700, 49999);
  const exact = evaluateTaxiPolicy(4800, 2700, 50000);
  const above = evaluateTaxiPolicy(4800, 2700, 50001);
  assert.equal(below.separateApproval, false);
  assert.equal(below.tone, 'eligible');
  for (const result of [exact, above]) {
    assert.equal(result.eligible, true);
    assert.equal(result.separateApproval, true);
    assert.equal(result.tone, 'review');
    assert.match(result.label, /별도 승인 필요/);
    assert.match(approvalSummary(result), /5만 원 이상/);
    assert.match(approvalSummary(result), /별도 사전 승인/);
  }
});
test('unknown or invalid fares cannot receive ordinary approval label', () => {
  for (const fare of [null, undefined, NaN, Infinity, -1, 0, '50000']) {
    const result = evaluateTaxiPolicy(4800, 2700, fare);
    assert.equal(result.fareKnown, false);
    assert.equal(result.tone, 'review');
    assert.match(result.label, /요금 확인 필요/);
  }
});
test('cost review never overrides failed time criteria', () => {
  for (const [transit, taxi] of [[3599, 1200], [5400, 3601]]) {
    const result = evaluateTaxiPolicy(transit, taxi, 50000);
    assert.equal(result.eligible, false);
    assert.equal(result.separateApproval, true);
    assert.match(result.label, /시간 기준 미충족/);
    assert.match(approvalSummary(result), /다른 예외 사유/);
  }
  assert.equal(evaluateTaxiPolicy(3600, 1800, 49000).eligible, true);
});
