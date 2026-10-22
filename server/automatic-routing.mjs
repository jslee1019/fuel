import { parseKst, kstInput, evaluateTaxiPolicy } from '../taxi/core.js';

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

// Every returned plan has been queried at its own departure time and arrives by deadline.
// Bounded iteration deliberately fails closed instead of substituting a current-time ETA.
export async function planArrival(deadline, now, query) {
  const minute = 60000;
  const earliest = Math.ceil(Math.max(now + minute, deadline - 12 * 3600000) / minute) * minute;
  let candidate = Math.max(earliest, Math.floor((deadline - 3600000) / minute) * minute);
  const seen = new Set();
  let best;
  for (let attempt = 0; attempt < 8 && candidate < deadline && candidate >= earliest; attempt++) {
    if (seen.has(candidate)) break;
    seen.add(candidate);
    const route = await query(candidate);
    if (!route) { candidate -= 15 * minute; continue; }
    if (!Number.isInteger(route.durationSeconds) || route.durationSeconds <= 0) throw new RoutingError('예정 시간대 경로 응답을 확인하지 못했습니다. 승인 판정을 중단합니다.', 502);
    const arrival = candidate + route.durationSeconds * 1000;
    if (arrival <= deadline) {
      if (!best || candidate > Date.parse(best.departureAt)) best = { ...route, departureAt: new Date(candidate).toISOString(), arrivalAt: new Date(arrival).toISOString() };
      if (deadline - arrival < minute) break;
    }
    // Round departure down: never round an arrival after the deadline into a pass.
    candidate = Math.floor((deadline - route.durationSeconds * 1000) / minute) * minute;
  }
  if (!best) throw new RoutingError('목표 도착 시각에 맞는 예정 시간대 경로를 확인하지 못했습니다. 승인 판정은 보류됩니다. 일정과 지도 경로를 확인해 주세요.', 422);
  return best;
}

async function scheduledJson(url, key, fetcher, provider, expires) {
  const remaining = expires - Date.now();
  if (remaining <= 0) throw new RoutingError('예정 시간대 조회가 지연되어 승인 판정을 보류했습니다. 다시 조회해 주세요.', 504);
  const response = await fetcher(url, { headers: { Authorization: `KakaoAK ${key}` }, signal: AbortSignal.timeout(Math.min(8000, remaining)) });
  if (!response.ok) {
    const denied = response.status === 401 || response.status === 403;
    throw new RoutingError(denied
      ? `${provider} 예정 시간대 조회 권한이 연결되지 않았습니다. 관리자 연결이 필요하며 승인 판정은 보류됩니다.`
      : `${provider} 예정 시간대 조회에 실패했습니다. 현재 시간대 값으로 대체하지 않으며 승인 판정은 보류됩니다.`,
      denied ? 503 : response.status === 429 ? 429 : 502,
      { code: denied ? 'SCHEDULED_PROVIDER_ACCESS_REQUIRED' : 'SCHEDULED_PROVIDER_FAILED', provider, upstreamStatus: response.status });
  }
  return response.json();
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
  const arrival = meeting - buffer * 60000;
  if (arrival <= now) throw new RoutingError('도착 목표 시각이 이미 지났습니다. 미팅 시간과 도착 여유시간을 확인해 주세요.', 400);
  const expires = Date.now() + 45000;
  const transitQuery = async at => {
    const kst = kstInput(at);
    const params = new URLSearchParams({ start: `${origin.x},${origin.y}`, goal: `${destination.x},${destination.y}`, date: kst.slice(0, 10).replaceAll('-', ''), hhmmss: kst.slice(11).replace(':', '') + '00', route_type: 'All' });
    const data = await scheduledJson(`https://apis-navi.kakaomobility.com/affiliate/publictransit/v1/multimodal/directions?${params}`, env.KAKAO_TRANSIT_AFFILIATE_KEY || key, fetcher, '대중교통', expires);
    if (data.result_code !== 0) throw new RoutingError('대중교통 예정 시간대 경로를 확인하지 못했습니다. 승인 판정은 보류됩니다.', 422);
    const routes = (data.journeys || []).filter(r => Number.isInteger(r.summary?.total_time) && r.summary.total_time > 0).sort((a,b) => a.summary.total_time - b.summary.total_time);
    return routes.length ? { durationSeconds: routes[0].summary.total_time, fare: null, transfers: routes[0].summary.transfer_count ?? null } : null;
  };
  const carQuery = async at => {
    const params = new URLSearchParams({ origin: `${origin.x},${origin.y}`, destination: `${destination.x},${destination.y}`, departure_time: kstInput(at).replace(/[-T:]/g, ''), priority: 'TIME', summary: 'true', alternatives: 'true' });
    const data = await scheduledJson(`https://apis-navi.kakaomobility.com/v1/future/directions?${params}`, key, fetcher, '택시', expires);
    const routes = (data.routes || []).filter(r => r.result_code === 0 && Number.isInteger(r.summary?.duration) && r.summary.duration > 0).sort((a,b) => a.summary.duration - b.summary.duration);
    return routes.length ? { durationSeconds: routes[0].summary.duration, fare: routes[0].summary.fare?.taxi ?? null, toll: routes[0].summary.fare?.toll ?? null } : null;
  };
  // Confirm transit access first; do not generate a partial approval from car-only data.
  const transit = await planArrival(arrival, now, transitQuery);
  const taxi = await planArrival(arrival, now, carQuery);
  return {
    source: '카카오모빌리티 예정 시간대 경로', basis: 'scheduled-arrival', timeAware: true,
    checkedAt: new Date(now).toISOString(), meeting: input.meeting, bufferMinutes: buffer,
    origin: { input: input.origin, resolved: origin.label }, destination: { input: input.destination, resolved: destination.label },
    targetArrival: new Date(arrival).toISOString(),
    transit, taxi,
    criteria: evaluateTaxiPolicy(transit.durationSeconds, taxi.durationSeconds, taxi.fare),
    startsInPast: false,
    needsRecheck: true,
    note: '각 수단의 출발 예정 날짜·시각으로 경로를 다시 조회해 목표 시각 이전 도착을 확인했습니다. 소요 시간은 예측값이며 시간표·교통 상황 변경 및 택시 배차 대기는 별도로 확인해 주세요.'
  };
}
