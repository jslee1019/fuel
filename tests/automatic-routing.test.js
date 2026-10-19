import test from 'node:test';
import assert from 'node:assert/strict';
import { getAutomaticComparison } from '../server/automatic-routing.mjs';

const now = Date.parse('2026-10-19T00:00:00Z');
const input = { origin:'출발 주소', destination:'도착 주소', meeting:'2026-10-20T15:00', bufferMinutes:10 };
function fixture(transitSeconds=3600, carSeconds=1800, transitStatus='OK') {
  const calls=[];
  const fetcher = async (url, options) => {
    calls.push({url,options});
    const parsed=new URL(url); let data;
    if(parsed.pathname.includes('address.json')) data={documents:[{x:parsed.searchParams.get('query')===input.origin?'127':'128',y:'37',address_name:parsed.searchParams.get('query')}]};
    else if(parsed.pathname.includes('publictraffic')) data={status:transitStatus,routes:[{properties:{totalTime:transitSeconds,fare:{value:2000}}},{properties:{totalTime:transitSeconds+300}}]};
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
  assert.equal(result.timeAware,false);
  assert.equal(calls.length,4);
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
