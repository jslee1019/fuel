import { getAutomaticComparison, resolvePlace, RoutingError } from './automatic-routing.mjs';

const allowedOrigin = 'https://jslee1019.github.io';
const maxBytes = 4096;

async function readInput(request) {
  if (Number(request.headers.get('Content-Length')) > maxBytes) throw new RoutingError('입력 내용이 너무 큽니다.', 413);
  const reader = request.body?.getReader();
  if (!reader) throw new RoutingError('입력 내용을 확인해 주세요.', 400);
  const decoder = new TextDecoder(); let text = '', size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) { await reader.cancel(); throw new RoutingError('입력 내용이 너무 큽니다.', 413); }
      text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode();
    const input = JSON.parse(text);
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('invalid input');
    return input;
  } catch (error) {
    if (error instanceof RoutingError) throw error;
    throw new RoutingError('입력 내용을 확인해 주세요.', 400);
  } finally { reader.releaseLock(); }
}

export async function handleMapRequest(request, env, fetcher = fetch) {
  const origin = request.headers.get('Origin');
  const headers = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'Vary': 'Origin', 'X-Content-Type-Options': 'nosniff' };
  const respond = (data, status = 200) => new Response(JSON.stringify(data), { status, headers });
  if (origin !== allowedOrigin) return respond({ message: '허용되지 않은 요청입니다.' }, 403);
  headers['Access-Control-Allow-Origin'] = allowedOrigin;
  headers['Access-Control-Allow-Methods'] = 'POST, OPTIONS';
  headers['Access-Control-Allow-Headers'] = 'Content-Type';
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
  if (request.method !== 'POST') return respond({ message: 'POST 요청만 지원합니다.' }, 405);
  if (!request.headers.get('Content-Type')?.toLowerCase().startsWith('application/json')) return respond({ message: 'JSON 요청이 필요합니다.' }, 415);
  try {
    if (!env.KAKAO_REST_API_KEY || !env.MAP_RATE_LIMITER || !env.MAP_SHARED_LIMITER) throw new RoutingError('지도 조회 연결을 확인 중입니다. 잠시 후 다시 시도해 주세요.', 503);
    const input = await readInput(request);
    const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
    const userLimit = await env.MAP_RATE_LIMITER.limit({ key: ip });
    if (!userLimit.success) { headers['Retry-After'] = '60'; return respond({ message: '조회가 많습니다. 1분 후 다시 확인해 주세요.' }, 429); }
    const sharedLimit = await env.MAP_SHARED_LIMITER.limit({ key: 'wakefuel-map' });
    if (!sharedLimit.success) { headers['Retry-After'] = '60'; return respond({ message: '지도 조회가 많습니다. 1분 후 다시 확인해 주세요.' }, 429); }
    const path = new URL(request.url).pathname;
    if (path === '/geocode') {
      if (typeof input.address !== 'string' || input.address.trim().length < 2 || input.address.length > 250) throw new RoutingError('주소를 확인해 주세요.', 400);
      const place = await resolvePlace(input.address.trim(), 'address', env.KAKAO_REST_API_KEY, fetcher);
      if (!Number.isFinite(place.x) || !Number.isFinite(place.y)) throw new RoutingError('주소 좌표를 확인하지 못했습니다.', 422);
      return respond({ lat: place.y, lng: place.x, address: place.label });
    }
    if (path !== '/taxi/compare') return respond({ message: '경로를 찾을 수 없습니다.' }, 404);
    return respond(await getAutomaticComparison(input, env, fetcher));
  } catch (error) {
    const known = error instanceof RoutingError;
    return respond({ message: known ? error.message : '지도 조회에 실패했습니다. 잠시 후 다시 시도해 주세요.', details: known ? error.details : undefined }, known ? error.status : 502);
  }
}
