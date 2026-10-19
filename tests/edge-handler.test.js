import test from 'node:test';
import assert from 'node:assert/strict';
import { handleMapRequest } from '../server/edge-handler.mjs';
import worker from '../worker.mjs';

const origin = 'https://jslee1019.github.io';
const env = () => ({ KAKAO_REST_API_KEY:'test-secret', MAP_RATE_LIMITER:{limit:async()=>({success:true})}, MAP_SHARED_LIMITER:{limit:async()=>({success:true})} });
function req(path='/geocode', body={address:'서울특별시 중구 을지로 264'}, extra={}) {
  return new Request(`https://wakefuel.example${path}`,{method:'POST',headers:{Origin:origin,'Content-Type':'application/json','CF-Connecting-IP':'192.0.2.1'},body:JSON.stringify(body),...extra});
}
test('allowed preflight and denied origins never call provider',async()=>{
  const preflight=await handleMapRequest(req('/taxi/compare',null,{method:'OPTIONS',body:undefined}),{},()=>assert.fail());
  assert.equal(preflight.status,204); assert.equal(preflight.headers.get('Access-Control-Allow-Origin'),origin);
  const blocked=await handleMapRequest(req('/geocode',{}, {headers:{Origin:'https://unrelated.example'}}),env(),()=>assert.fail());
  assert.equal(blocked.status,403); assert.equal(blocked.headers.get('Access-Control-Allow-Origin'),null);
});
test('invalid JSON and oversized body fail before geocoding',async()=>{
  assert.equal((await handleMapRequest(req('/geocode',{}, {body:'{'}),env(),()=>assert.fail())).status,400);
  assert.equal((await handleMapRequest(req('/geocode',{address:'x'.repeat(5000)}),env(),()=>assert.fail())).status,413);
});
test('rate limit stops provider calls and returns retry advice',async()=>{
  const e=env();e.MAP_RATE_LIMITER.limit=async()=>({success:false});
  const r=await handleMapRequest(req(),e,()=>assert.fail()); assert.equal(r.status,429);assert.equal(r.headers.get('Retry-After'),'60');
});
test('geocode supports existing fuel client shape without exposing key',async()=>{
  const r=await handleMapRequest(req(),env(),async(url,options)=>{
    assert.equal(options.headers.Authorization,'KakaoAK test-secret');
    return {ok:true,json:async()=>({documents:[{x:'127.009',y:'37.566',address_name:'서울특별시 중구 을지로 264'}]})};
  });
  assert.equal(r.status,200);const body=await r.json();assert.equal(body.lat,37.566);assert.equal(body.lng,127.009);assert.ok(!JSON.stringify(body).includes('test-secret'));
});
test('missing bindings fail closed',async()=>{
  assert.equal((await handleMapRequest(req(),{},()=>assert.fail())).status,503);
});
test('existing oil route retains all four products with secret binding',async(t)=>{
  t.mock.method(globalThis,'fetch',async url=>{
    assert.equal(new URL(url).searchParams.get('certkey'),'oil-test-key');
    return {ok:true,json:async()=>({RESULT:{OIL:[{PRODCD:'B027',PRICE:'1856.20',TRADE_DT:'20261019'},{PRODCD:'B034',PRICE:'2395'},{PRODCD:'D047',PRICE:'1843'},{PRODCD:'K015',PRICE:'1144'}]}})};
  });
  const r=await worker.fetch(new Request('https://wakefuel.example/opinet'),{OPINET_API_KEY:'oil-test-key'},{});
  const body=await r.json();assert.equal(body.success,true);assert.deepEqual(body.prices,{gasoline:1856,premiumGasoline:2395,diesel:1843,lpg:1144});assert.ok(!JSON.stringify(body).includes('oil-test-key'));
});
