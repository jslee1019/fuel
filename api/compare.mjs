import { getAutomaticComparison, RoutingError } from '../server/automatic-routing.mjs';

const attempts = new Map();
export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Vary', 'Origin');
  const origin = req.headers.origin;
  const allowed = (process.env.ALLOWED_ORIGINS || 'https://jslee1019.github.io').split(',');
  if (origin && !allowed.includes(origin)) return res.status(403).json({ message: '허용되지 않은 요청입니다.' });
  if (origin) res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ message: 'POST 요청만 지원합니다.' });
  const ip = String(req.headers['x-vercel-forwarded-for'] || req.headers['x-forwarded-for'] || 'local').split(',')[0];
  const now = Date.now();
  for (const [id, record] of attempts) if (record.until < now) attempts.delete(id);
  const record = attempts.get(ip) || { count: 0, until: now + 60000 };
  if (++record.count > 15) return res.status(429).json({ message: '조회가 많습니다. 1분 후 다시 확인해 주세요.' });
  attempts.set(ip, record);
  try {
    const input = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    if (!input || JSON.stringify(input).length > 4000) return res.status(400).json({ message: '입력 내용을 확인해 주세요.' });
    const result = await getAutomaticComparison(input, process.env);
    return res.status(200).json(result);
  } catch (error) {
    return res.status(error instanceof RoutingError ? error.status : 502).json({ message: error instanceof RoutingError ? error.message : '경로를 조회하지 못했습니다. 잠시 후 다시 시도해 주세요.', details: error instanceof RoutingError ? error.details : undefined });
  }
}
