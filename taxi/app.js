import { parseKst, kstInput, formatKst, formatDuration, escapeHtml as esc, routeSearchUrl } from './core.js';

const $ = id => document.getElementById(id);
const form = $('check-form');
let generation = 0, controller, snapshot;
const read = () => Object.fromEntries(new FormData(form));
const duration = seconds => formatDuration(seconds / 60);
const date = value => formatKst(Date.parse(value));
const money = value => Number.isFinite(value) ? `${value.toLocaleString('ko-KR')}원` : '—';
function error(message = '') { $('form-error').textContent = message; $('form-error').hidden = !message; }
function toast(message) { $('toast').textContent = message; $('toast').hidden = false; setTimeout(() => $('toast').hidden = true, 2500); }
function idle() { $('calculate').disabled = false; $('calculate').textContent = '이동 시간 자동 조회 →'; }
function invalidate() {
  generation++; controller?.abort(); snapshot = null; idle();
  $('result').hidden = true; $('export-actions').hidden = true; $('empty-result').hidden = false;
  $('print-summary').hidden = true; $('print-summary').innerHTML = ''; $('place-candidates').hidden = true;
  document.body.classList.add('print-blocked'); error();
}
function summaryText(s) {
  const { input: i, data: d } = s;
  return `택시 이용 자가검증\n신청자: ${i.applicant} / ${i.department}\n업무 목적: ${i.purpose}\n출발지: ${i.origin}\n미팅 장소: ${i.destination}\n미팅: ${i.meeting.replace('T', ' ')} (한국 시간)\n도착 여유: ${i.buffer}분\n대중교통 60분 이상: ${d.criteria.transitMet ? '충족' : '미충족'}\n택시 30분 이상 단축: ${d.criteria.savingMet ? '충족' : '미충족'}\n조회 시각: ${date(d.checkedAt)} (한국 시간)\n조회 시점 예상값에 따른 자가검증이며 기존 사전 승인이 필요합니다. 미래 시간표·교통 예측을 반영한 출발 시각은 아닙니다.`;
}
function render(input, data, sample = false) {
  const t = data.transit.durationSeconds, c = data.taxi.durationSeconds;
  data.criteria = { transitMet: t >= 3600, savingMet: t - c >= 1800, eligible: t >= 3600 && t - c >= 1800 };
  const checks = data.criteria;
  snapshot = sample ? null : { input: { ...input }, data };
  $('empty-result').hidden = true; $('dirty-notice').hidden = true; $('result').hidden = false;
  $('result').innerHTML = `<div class="result-header"><h2>${sample ? '예시 결과' : '조회 결과'}</h2><span class="status-label ${checks.eligible ? 'eligible' : 'ineligible'}">${checks.eligible ? '기준 충족 · 사전 승인 신청 가능' : '기준 미충족'}</span><p class="result-note">${sample ? '기능 설명용 가상 데이터입니다.' : '조회 시점의 예상 소요 시간 기준입니다.'}</p></div>
    <p class="result-person">${esc(input.applicant)} · ${esc(input.department)}<br>${esc(input.purpose)}</p>
    <p>${esc(data.origin.resolved)}<br>→ ${esc(data.destination.resolved)}</p>
    <p class="meeting-target">도착 목표 · 미팅 ${esc(input.buffer)}분 전<strong>${date(data.targetArrival)}</strong></p>
    <table class="comparison"><thead><tr><th>비교 항목</th><th>대중교통</th><th>택시</th></tr></thead><tbody>
    <tr><td>예상 소요 시간</td><td><span class="big">${duration(t)}</span></td><td><span class="big">${duration(c)}</span></td></tr>
    <tr><td>출발 계획</td><td>${date(data.transit.departureAt)}</td><td>${date(data.taxi.departureAt)}</td></tr>
    <tr><td>예상 요금</td><td>${money(data.transit.fare)}</td><td>${money(data.taxi.fare)}<small>호출·통행료 등에 따라 달라질 수 있습니다.</small></td></tr></tbody></table>
    <div class="saving"><span>택시 이용 시 시간 단축</span><strong>${duration(t - c)}</strong></div>
    <div class="checks"><div class="check-line"><span>대중교통 편도 60분 이상</span><b class="${checks.transitMet ? 'pass' : 'fail'}">${checks.transitMet ? '충족' : '미충족'}</b></div><div class="check-line"><span>택시 이용 시 30분 이상 단축</span><b class="${checks.savingMet ? 'pass' : 'fail'}">${checks.savingMet ? '충족' : '미충족'}</b></div></div>
    ${data.startsInPast ? '<p class="message warning">현재 시각보다 이른 출발 계획이 포함되어 있습니다. 미팅 일정과 이동 가능 여부를 다시 확인해 주세요.</p>' : ''}
    <p class="result-note">${esc(data.note)}<br>기준 충족은 최종 승인이 아닙니다. 기존 사전 승인 절차를 따라 주세요.</p>
    <div class="result-meta">${esc(data.source)} · 조회 ${date(data.checkedAt)} · 한국 시간</div>`;
  $('export-actions').hidden = sample;
  $('export-hint').textContent = '신청 요약에는 입력한 일정과 기준 충족 여부가 포함됩니다.';
  if (snapshot) {
    $('print-summary').innerHTML = `<h1>택시 이용 자가검증</h1><pre>${esc(summaryText(snapshot))}</pre>`;
    $('print-summary').hidden = false; document.body.classList.remove('print-blocked');
  }
}
function showCandidates(details) {
  if (!['origin', 'destination'].includes(details?.field) || !Array.isArray(details.candidates)) return;
  const area = $('place-candidates'); area.replaceChildren();
  const heading = document.createElement('h2'); heading.textContent = `${details.field === 'origin' ? '출발지' : '미팅 장소'} 주소를 선택해 주세요`; area.append(heading);
  for (const place of details.candidates) {
    const button = document.createElement('button'); button.type = 'button'; button.className = 'button outline candidate';
    button.textContent = `${place.name} · ${place.address}`;
    button.addEventListener('click', () => { $(details.field).value = place.address; invalidate(); toast('주소를 선택했습니다. 다시 조회해 주세요.'); });
    area.append(button);
  }
  area.hidden = !details.candidates.length;
}
form.addEventListener('submit', async event => {
  event.preventDefault(); const input = read(); invalidate();
  for (const [key, label] of [['applicant','신청자명'],['department','소속'],['purpose','업무 목적'],['origin','출발지'],['destination','미팅 장소']]) {
    if (!input[key]?.trim()) { error(`${label}을(를) 입력해 주세요.`); $(key).focus(); return; }
  }
  if (!(parseKst(input.meeting) > Date.now())) { error('현재 이후의 미팅 날짜·시간을 입력해 주세요.'); return; }
  if (input.buffer === '' || !Number.isInteger(Number(input.buffer)) || Number(input.buffer) < 0 || Number(input.buffer) > 60) { error('도착 여유시간은 0~60분으로 입력해 주세요.'); return; }
  const endpoint = window.TAXI_CONFIG?.routingEndpoint;
  if (!endpoint) { error('자동 조회 서버 연결 준비 중입니다. 연결 완료 후 이용해 주세요.'); return; }
  const current = generation; controller = new AbortController();
  const timeout = setTimeout(() => controller?.abort(), 28000);
  $('calculate').disabled = true; $('calculate').textContent = '다음지도 이동 시간 조회 중…';
  try {
    const response = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ origin: input.origin.trim(), destination: input.destination.trim(), meeting: input.meeting, bufferMinutes: Number(input.buffer) }), signal: controller.signal });
    const data = await response.json(); if (current !== generation) return;
    if (!response.ok) { error(data.message || '이동 시간을 조회하지 못했습니다.'); showCandidates(data.details); return; }
    if (data.basis !== 'query-time-estimate' || ![data.transit?.durationSeconds, data.taxi?.durationSeconds].every(v => Number.isInteger(v) && v > 0) || ![data.checkedAt,data.targetArrival,data.transit?.departureAt,data.taxi?.departureAt].every(v => Number.isFinite(Date.parse(v)))) throw new Error('invalid-response');
    render(input, data);
  } catch (err) {
    if (current === generation) error(err.name === 'AbortError' ? '조회 시간이 길어지고 있습니다. 잠시 후 다시 시도해 주세요.' : '이동 시간을 조회하지 못했습니다. 연결 상태를 확인하고 다시 시도해 주세요.');
  } finally { clearTimeout(timeout); if (current === generation) idle(); }
});
form.addEventListener('input', invalidate);
$('reset').addEventListener('click', () => { HTMLFormElement.prototype.reset.call(form); invalidate(); });
$('open-map').addEventListener('click', () => {
  if (!$('destination').value.trim()) return error('미팅 장소를 입력해 주세요.');
  window.open(routeSearchUrl($('destination').value), '_blank', 'noopener,noreferrer');
});
async function copy(text) { try { await navigator.clipboard.writeText(text); toast('복사했습니다.'); } catch { error('복사 권한을 확인해 주세요.'); } }
$('copy-route').addEventListener('click', () => { const i = read(); copy(`${i.origin} → ${i.destination}\n미팅: ${i.meeting.replace('T',' ')} (한국 시간)`); });
$('copy-result').addEventListener('click', () => { if (snapshot) copy(summaryText(snapshot)); });
$('print').addEventListener('click', () => { if (snapshot) window.print(); });
document.querySelectorAll('.address-search').forEach(button => button.addEventListener('click', () => {
  if (!window.daum?.Postcode) return error('주소 검색을 불러오지 못했습니다. 도로명주소를 직접 입력해 주세요.');
  new window.daum.Postcode({ oncomplete: data => { $(button.dataset.for).value = data.roadAddress || data.address; invalidate(); } }).open();
}));
$('sample').addEventListener('click', () => {
  invalidate(); const meeting = kstInput(Date.now() + 86400000), arrival = parseKst(meeting) - 600000;
  const input = { applicant:'홍길동',department:'영업팀',purpose:'거래처 미팅',origin:'출발지 예시',destination:'미팅 장소 예시',meeting,buffer:'10' };
  for (const [key,value] of Object.entries(input)) $(key).value = value;
  render(input,{ source:'가상 예시',checkedAt:new Date().toISOString(),targetArrival:new Date(arrival).toISOString(),origin:{resolved:input.origin},destination:{resolved:input.destination},transit:{durationSeconds:4800,departureAt:new Date(arrival-4800000).toISOString(),fare:2500},taxi:{durationSeconds:2700,departureAt:new Date(arrival-2700000).toISOString(),fare:35000},note:'이 예시는 실제 지도 조회 결과가 아니며 신청에 사용할 수 없습니다.' },true);
});
invalidate();
