import test from 'node:test';
import assert from 'node:assert/strict';
import { getAutomaticComparison, planArrival } from '../server/automatic-routing.mjs';

const now = Date.parse('2026-10-19T00:00:00Z');
const input = { origin:'출발 주소', destination:'도착 주소', meeting:'2026-10-20T15:00', bufferMinutes:10 };
function fixture(transitSeconds=3600, carSeconds=1800, transitStatus='OK') {
  const calls=[];
  const fetcher = async (url, options) => {
    calls.push({url,options});
    const parsed=new URL(url); let data;
    if(parsed.pathname.includes('address.json')) data={documents:[{x:parsed.searchParams.get('query')===input.origin?'127':'128',y:'37',address_name:parsed.searchParams.get('query')}]};
    else if(parsed.pathname.includes('publictransit')) data={result_code:transitStatus==='OK'?0:1,journeys:[{summary:{total_time:transitSeconds}},{summary:{total_time:transitSeconds+300}}]};
    else data={routes:[{result_code:0,summary:{duration:carSeconds,fare:{taxi:25000}}}]};
    return {ok:true,json:async()=>data};
  };
  return {calls,fetcher};
}
test('automatic exact 60/30 thresholds and common arrival buffer',async()=>{
  const {fetcher,calls}=fixture();
  const result=await getAutomaticComparison(input,{KAKAO_REST_API_KEY:'test-key'},fetcher,now);
  assert.equal(result.criteria.eligible,true);
  assert.equal(result.targetArrival,'2026-10-20T05:50:00.000Z');
  assert.equal(result.transit.departureAt,'2026-10-20T04:50:00.000Z');
  assert.equal(result.taxi.departureAt,'2026-10-20T05:20:00.000Z');
  assert.equal(result.timeAware,true);
  assert.equal(result.basis,'scheduled-arrival');
  assert.ok(calls.length >= 4);
  const transitCalls=calls.filter(c=>c.url.includes('publictransit'));
  assert.ok(transitCalls.every(c=>new URL(c.url).searchParams.get('date')==='20261020'));
  assert.ok(transitCalls.some(c=>new URL(c.url).searchParams.get('hhmmss')==='135000'));
  assert.ok(calls.some(c=>new URL(c.url).searchParams.get('departure_time')==='202610201420'));
  assert.equal(result.transit.arrivalAt,result.targetArrival);
  assert.equal(result.taxi.arrivalAt,result.targetArrival);
  assert.ok(calls.every(c=>new URL(c.url).searchParams.get('meeting')===null));
  assert.ok(!JSON.stringify(result).includes('test-key'));
});
test('29m59s saving cannot round up to a pass',async()=>{
  const {fetcher}=fixture(3600,1801);
  const result=await getAutomaticComparison(input,{KAKAO_REST_API_KEY:'test-key'},fetcher,now);
  assert.equal(result.criteria.eligible,false);
});
test('short transit cannot qualify even with large saving',async()=>{
  const {fetcher}=fixture(2700,600);
  const result=await getAutomaticComparison(input,{KAKAO_REST_API_KEY:'test-key'},fetcher,now);
  assert.equal(result.criteria.eligible,false);
});
test('no transit route does not automatically approve exception',async()=>{
  const {fetcher}=fixture(3600,1800,'NO_ROUTE');
  await assert.rejects(getAutomaticComparison(input,{KAKAO_REST_API_KEY:'test-key'},fetcher,now),e=>e.status===422);
});
test('missing server key fails without making provider calls',async()=>{
  await assert.rejects(getAutomaticComparison(input,{},()=>assert.fail(),now),e=>e.status===503);
});
test('ambiguous place must be selected, not silently first result',async()=>{
  const fetcher=async url=>({ok:true,json:async()=>({documents:url.includes('address.json')?[]:[{place_name:'시청 A',address_name:'A'},{place_name:'시청 B',address_name:'B'}]})});
  await assert.rejects(getAutomaticComparison(input,{KAKAO_REST_API_KEY:'test-key'},fetcher,now),e=>e.status===422&&e.details.candidates.length===2);
});


test('scheduled access denied never falls back to current routing or yields approval',async()=>{
  const {fetcher,calls}=fixture();
  const denied=async (url,options)=>url.includes('publictransit')?{ok:false,status:403}:fetcher(url,options);
  await assert.rejects(getAutomaticComparison(input,{KAKAO_REST_API_KEY:'test-key'},denied,now),e=>e.status===503&&e.details.code==='SCHEDULED_PROVIDER_ACCESS_REQUIRED');
  assert.ok(calls.every(c=>!c.url.includes('/v1/directions')&&!c.url.includes('publictraffic')));
});
test('deadline in the past is rejected even when meeting is still future',async()=>{
  const {fetcher}=fixture();
  await assert.rejects(getAutomaticComparison({...input,meeting:'2026-10-19T09:05'},{KAKAO_REST_API_KEY:'test-key'},fetcher,now),e=>e.status===400);
});
test('requeries changed congestion and only returns a verified on-time departure',async()=>{
  const deadline=Date.parse('2026-10-23T01:50:00Z');
  const calls=[];
  const result=await planArrival(deadline,now,async at=>{calls.push(at);return {durationSeconds:at>=deadline-3600000?5100:4800};});
  assert.ok(calls.length>1);
  assert.ok(calls.includes(Date.parse(result.departureAt)));
  assert.ok(Date.parse(result.arrivalAt)<=deadline);
});
test('oscillating prediction returns only a previously verified feasible plan',async()=>{
  const deadline=Date.parse('2026-10-23T01:50:00Z');
  const result=await planArrival(deadline,now,async at=>({durationSeconds:at>=deadline-3600000?7200:3600}));
  assert.ok(Date.parse(result.arrivalAt)<=deadline);
});
test('no routes or impossible journey must not produce a plan',async()=>{
  const deadline=now+3600000;
  await assert.rejects(planArrival(deadline,now,async()=>null));
  await assert.rejects(planArrival(deadline,now,async()=>({durationSeconds:7200})));
});
