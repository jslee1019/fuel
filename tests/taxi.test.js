import test from 'node:test';
import assert from 'node:assert/strict';
import { parseKst, kstInput, formatKst, formatDuration, escapeHtml, routeSearchUrl } from '../taxi/core.js';
test('Korean timezone and date rollover',()=>{
 assert.equal(parseKst('2026-10-20T00:10'), Date.parse('2026-10-19T15:10:00Z'));
 assert.equal(kstInput(Date.parse('2026-10-19T15:10:00Z')), '2026-10-20T00:10');
 assert.ok(formatKst(parseKst('2026-10-20T00:10')).includes('00:10'));
 assert.ok(Number.isNaN(parseKst('2026-02-30T13:00')));
});
test('display preserves sub-minute boundary',()=>{assert.equal(formatDuration(1799/60),'29분 59초');});
test('rendered labels and map searches escape user text',()=>{
 assert.equal(escapeHtml('<script>'),'&lt;script&gt;');
 assert.equal(routeSearchUrl('서울 시청'),'https://map.kakao.com/link/search/%EC%84%9C%EC%9A%B8%20%EC%8B%9C%EC%B2%AD');
});
