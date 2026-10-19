export const POLICY = Object.freeze({ minimumTransitMinutes: 60, minimumSavingMinutes: 30 });

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
