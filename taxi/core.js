export const POLICY = Object.freeze({ minimumTransitMinutes: 60, minimumSavingMinutes: 30, separateApprovalFare: 50000 });

export function validScheduledComparison(data, targetArrival, now = Date.now()) {
  if (data?.basis !== 'scheduled-arrival' || data.timeAware !== true || Date.parse(data.targetArrival) !== targetArrival || !Number.isFinite(Date.parse(data.checkedAt))) return false;
  return [data.transit, data.taxi].every(route => {
    const departure = Date.parse(route?.departureAt), arrival = Date.parse(route?.arrivalAt);
    return Number.isInteger(route?.durationSeconds) && route.durationSeconds > 0 && departure > now &&
      arrival === departure + route.durationSeconds * 1000 && arrival <= targetArrival;
  });
}

export function evaluateTaxiPolicy(transitSeconds, taxiSeconds, fare) {
  const transitMet = transitSeconds >= POLICY.minimumTransitMinutes * 60;
  const savingMet = transitSeconds - taxiSeconds >= POLICY.minimumSavingMinutes * 60;
  const eligible = transitMet && savingMet;
  const fareKnown = Number.isFinite(fare) && fare > 0;
  const separateApproval = fareKnown && fare >= POLICY.separateApprovalFare;
  const fareStatus = !fareKnown ? '예상 요금 확인 필요' : separateApproval ? '5만 원 이상 · 별도 승인 필요' : '5만 원 미만 · 기존 사전 승인 필요';
  const label = separateApproval
    ? `${eligible ? '시간 기준 충족' : '시간 기준 미충족'} · 5만 원 이상 별도 승인 필요`
    : !fareKnown
      ? `${eligible ? '시간 기준 충족' : '시간 기준 미충족'} · 요금 확인 필요`
      : eligible ? '시간 기준 충족 · 사전 승인 신청 가능' : '시간 기준 미충족';
  const guidance = separateApproval
    ? '편도 예상 택시요금이 50,000원 이상입니다. 대체 이동 방법과 비용, 전 구간 택시 이용이 필요한 사유를 기재하고 인사팀장 및 경영진의 별도 사전 승인을 받아 주세요.'
    : !fareKnown
      ? '예상 택시요금이 확인되지 않았습니다. 호출 전 요금을 확인하고, 편도 50,000원 이상이면 별도 사전 승인을 받아 주세요.'
      : '5만 원 미만이어도 기존 사전 승인이 필요합니다. 호출 전 예상 요금이 50,000원 이상으로 변경되면 별도 승인을 받아 주세요.';
  return { transitMet, savingMet, eligible, fareKnown, separateApproval, fareStatus, label, guidance,
    tone: separateApproval || !fareKnown ? 'review' : eligible ? 'eligible' : 'ineligible' };
}

export function approvalSummary(criteria) {
  return `판정: ${criteria.label}\n금액 기준: ${criteria.fareStatus}\n${criteria.guidance}${!criteria.eligible ? '\n시간 기준 미충족 시에는 다른 예외 사유의 해당 여부도 별도로 확인해야 합니다.' : ''}`;
}

export function parseKst(value) {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value || '')) return NaN;
  const timestamp = Date.parse(`${value}:00+09:00`);
  return Number.isFinite(timestamp) && kstInput(timestamp) === value ? timestamp : NaN;
}

export function kstInput(timestamp = Date.now()) {
  return new Date(timestamp + 9 * 60 * 60 * 1000).toISOString().slice(0, 16);
}

export function formatKst(timestamp) {
  if (!Number.isFinite(timestamp)) return '—';
  return new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
  }).format(new Date(timestamp));
}

export function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
}

export function formatDuration(minutes) {
  const seconds = Math.round(Math.abs(minutes) * 60);
  const sign = minutes < 0 ? '-' : '';
  return `${sign}${Math.floor(seconds / 60)}분${seconds % 60 ? ` ${seconds % 60}초` : ''}`;
}

export function routeSearchUrl(destination) {
  return `https://map.kakao.com/link/search/${encodeURIComponent(destination.trim())}`;
}
