import { parseKst, kstInput } from '../taxi/core.js';

export class RoutingError extends Error {
  constructor(message, status = 502, details = undefined) { super(message); this.status = status; this.details = details; }
}

async function getJson(url, key, fetcher) {
  const response = await fetcher(url, { headers: { Authorization: `KakaoAK ${key}` }, signal: AbortSignal.timeout(12000) });
  if (!response.ok) throw new RoutingError(response.status === 429 ? '지도 조회가 많습니다. 잠시 후 다시 확인해 주세요.' : '지도 연결을 확인할 수 없습니다. 잠시 후 다시 시도해 주세요.', response.status === 429 ? 429 : 502);
  return response.json();
}

export async function resolvePlace(text, field, key, fetcher = fetch) {
  const address = await getJson(`https://dapi.kakao.com/v2/local/search/address.json?query=${encodeURIComponent(text)}`, key, fetcher);
  let matches = address.documents || [];
  if (matches.length === 1) return { x: Number(matches[0].x), y: Number(matches[0].y), label: matches[0].road_address?.address_name || matches[0].address_name };
  const places = await getJson(`https://dapi.kakao.com/v2/local/search/keyword.json?query=${encodeURIComponent(text)}`, key, fetcher);
  matches = places.documents || [];
  const exact = matches.filter(place => place.place_name.replace(/\s/g, '') === text.replace(/\s/g, ''));
  if (exact.length === 1) matches = exact;
  if (matches.length !== 1) {
    const candidates = matches.slice(0, 5).map(place => ({ name: place.place_name, address: place.road_address_name || place.address_name }));
    throw new RoutingError(candidates.length ? '같은 이름의 장소가 여러 곳 있습니다. 실제 이동할 주소를 선택해 주세요.' : '장소를 찾지 못했습니다. 도로명주소를 확인해 주세요.', 422, { field, candidates });
  }
  return { x: Number(matches[0].x), y: Number(matches[0].y), label: matches[0].road_address_name || matches[0].address_name || matches[0].place_name };
}

export async function getAutomaticComparison(input, env, fetcher = fetch, now = Date.now()) {
  const key = env.KAKAO_REST_API_KEY;
  if (!key) throw new RoutingError('자동 조회 연결 준비 중입니다. 연결 완료 후 이용해 주세요.', 503);
  for (const field of ['origin', 'destination']) {
    if (typeof input[field] !== 'string' || !input[field].trim() || input[field].length > 250) throw new RoutingError('출발지와 미팅 장소를 확인해 주세요.', 400);
  }
  const meeting = parseKst(input.meeting), buffer = Number(input.bufferMinutes);
  if (!Number.isFinite(meeting) || meeting <= now || !Number.isInteger(buffer) || buffer < 0 || buffer > 60) throw new RoutingError('미팅 날짜·시간과 도착 여유시간을 확인해 주세요.', 400);
  const [origin, destination] = await Promise.all([resolvePlace(input.origin, 'origin', key, fetcher), resolvePlace(input.destination, 'destination', key, fetcher)]);
  if (Math.abs(origin.x - destination.x) + Math.abs(origin.y - destination.y) < 0.00001) throw new RoutingError('출발지와 미팅 장소가 같습니다. 이동 경로를 확인해 주세요.', 422);
  const transitQuery = new URLSearchParams({ start_x: origin.x, start_y: origin.y, end_x: destination.x, end_y: destination.y });
  const carQuery = new URLSearchParams({ origin: `${origin.x},${origin.y}`, destination: `${destination.x},${destination.y}`, priority: 'TIME', summary: 'true', alternatives: 'true' });
  const [transit, car] = await Promise.all([
    getJson(`https://dapi.kakao.com/v2/routing/publictraffic?${transitQuery}`, key, fetcher),
    getJson(`https://apis-navi.kakaomobility.com/v1/directions?${carQuery}`, key, fetcher)
  ]);
  const transitRoutes = (transit.routes || []).filter(route => Number.isInteger(route.properties?.totalTime) && route.properties.totalTime > 0).sort((a, b) => a.properties.totalTime - b.properties.totalTime);
  if (transit.status !== 'OK' || !transitRoutes.length) throw new RoutingError('대중교통 경로를 확인하지 못했습니다. 이용 불가로 자동 판정하지 않으며, 기존 예외 기준에 따라 별도 확인이 필요합니다.', 422);
  const carRoutes = (car.routes || []).filter(route => route.result_code === 0 && Number.isInteger(route.summary?.duration) && route.summary.duration > 0).sort((a, b) => a.summary.duration - b.summary.duration);
  if (!carRoutes.length) throw new RoutingError('자동차 경로를 확인하지 못했습니다. 이동 경로를 확인해 주세요.', 422);
  const transitSeconds = transitRoutes[0].properties.totalTime, taxiSeconds = carRoutes[0].summary.duration;
  const arrival = meeting - buffer * 60000;
  const departureTransit = arrival - transitSeconds * 1000, departureTaxi = arrival - taxiSeconds * 1000;
  const eligible = transitSeconds >= 3600 && transitSeconds - taxiSeconds >= 1800;
  return {
    source: '다음지도 · 카카오 경로 API', basis: 'query-time-estimate', timeAware: false,
    checkedAt: new Date(now).toISOString(), meeting: input.meeting, bufferMinutes: buffer,
    origin: { input: input.origin, resolved: origin.label }, destination: { input: input.destination, resolved: destination.label },
    targetArrival: new Date(arrival).toISOString(),
    transit: { durationSeconds: transitSeconds, departureAt: new Date(departureTransit).toISOString(), fare: transitRoutes[0].properties.fare?.value ?? null, transfers: transitRoutes[0].properties.transfers ?? null },
    taxi: { durationSeconds: taxiSeconds, departureAt: new Date(departureTaxi).toISOString(), fare: carRoutes[0].summary.fare?.taxi ?? null, toll: carRoutes[0].summary.fare?.toll ?? null },
    criteria: { minimumTransitMinutes: 60, minimumSavingMinutes: 30, transitMet: transitSeconds >= 3600, savingMet: transitSeconds - taxiSeconds >= 1800, eligible },
    startsInPast: departureTransit < now || departureTaxi < now,
    needsRecheck: kstInput(now).slice(0, 10) !== input.meeting.slice(0, 10),
    note: '조회 시점의 예상 소요 시간을 바탕으로 역산한 출발 계획입니다. 미팅 날짜의 미래 대중교통 시간표·배차·교통 예측을 반영한 결과는 아닙니다. 출발 전에 다시 확인해 주세요.'
  };
}
