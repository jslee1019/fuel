import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Script } from 'node:vm';

test('fuel inline scripts parse and browser source uses protected geocoding',()=>{
  const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
  for(const match of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)) {
    if(match[1].trim()) assert.doesNotThrow(()=>new Script(match[1]));
  }
  assert.ok(html.includes('서울특별시 중구 을지로 264'));
  assert.ok(html.includes('https://wakefuel.jslee-43a.workers.dev/geocode'));
  assert.ok(!html.includes('kakaoApiKey'));
  assert.ok(!html.includes('KakaoAK'));
});
