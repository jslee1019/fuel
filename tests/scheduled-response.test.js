import test from 'node:test';
import assert from 'node:assert/strict';
import { validScheduledComparison } from '../taxi/core.js';

const now = Date.parse('2026-10-22T00:00:00Z');
const deadline = Date.parse('2026-10-23T01:50:00Z');
function fixture() {
  const plan = seconds => ({ durationSeconds: seconds, departureAt: new Date(deadline-seconds*1000).toISOString(), arrivalAt: new Date(deadline).toISOString() });
  return { basis:'scheduled-arrival', timeAware:true, checkedAt:new Date(now).toISOString(), targetArrival:new Date(deadline).toISOString(), transit:plan(4800), taxi:plan(2700) };
}
test('only verified scheduled responses can reach approval rendering',()=>{
  assert.equal(validScheduledComparison(fixture(),deadline,now),true);
  for(const mutate of [
    d=>{d.basis='query-time-estimate';},
    d=>{d.timeAware=false;},
    d=>{d.taxi.arrivalAt=new Date(deadline+1000).toISOString();},
    d=>{d.transit.durationSeconds+=1;},
    d=>{d.targetArrival=new Date(deadline+600000).toISOString();},
    d=>{d.transit.departureAt=new Date(now-1000).toISOString();}
  ]) { const d=fixture(); mutate(d); assert.equal(validScheduledComparison(d,deadline,now),false); }
});
