// 날짜·숫자·금액 포맷 등 공용 유틸

export function uuid() {
  if (crypto.randomUUID) return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

const pad = (n) => String(n).padStart(2, '0');

/* ---------- 날짜 ---------- */
export function toDateStr(d = new Date()) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
export const todayStr = () => toDateStr(new Date());

export function parseDate(s) {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(dateStr, n) {
  const d = parseDate(dateStr);
  d.setDate(d.getDate() + n);
  return toDateStr(d);
}

/** b - a (일) */
export function diffDays(a, b) {
  return Math.round((parseDate(b) - parseDate(a)) / 86400000);
}

export function isValidDateStr(s) {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [y, m, d] = s.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  return dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d;
}

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

/** '2026-09-26' → '2026. 9. 26.(토)' / short: '9/26' */
export function dateLabel(s, { short = false, weekday = false } = {}) {
  if (!s) return '';
  const d = parseDate(s);
  if (short) {
    const sameYear = d.getFullYear() === new Date().getFullYear();
    return sameYear ? `${d.getMonth() + 1}/${d.getDate()}` : `${String(d.getFullYear()).slice(2)}.${d.getMonth() + 1}/${d.getDate()}`;
  }
  return `${d.getFullYear()}. ${d.getMonth() + 1}. ${d.getDate()}.${weekday ? `(${WEEKDAYS[d.getDay()]})` : ''}`;
}

export function monthKey(s) {
  const d = parseDate(s);
  return `${d.getFullYear()}년 ${d.getMonth() + 1}월`;
}

/** epoch ms → 'YYYY-MM-DD' (로컬) */
export const msToDate = (ms) => toDateStr(new Date(ms));

/** 점검일 배지 정보 */
export function dueInfo(dateStr) {
  if (!dateStr) return null;
  const n = diffDays(todayStr(), dateStr);
  if (n < 0) return { n, label: `${-n}일 지남`, level: 'overdue' };
  if (n === 0) return { n, label: '오늘', level: 'today' };
  return { n, label: `D-${n}`, level: n <= 7 ? 'soon' : 'later' };
}

/* ---------- 숫자·통화 ---------- */
const DECIMALS = { KRW: 0, USD: 2 };

export function round(n, digits = 0) {
  const f = 10 ** digits;
  return Math.round((n + Number.EPSILON) * f) / f;
}

/** 통화 표시: KRW 1,234원 / USD $1,234.56 */
export function money(n, currency = 'KRW', { sign = false } = {}) {
  if (n == null || Number.isNaN(n)) return '-';
  const d = DECIMALS[currency] ?? 2;
  const abs = Math.abs(round(n, d));
  const body = abs.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
  const s = n < 0 && abs !== 0 ? '−' : sign && abs !== 0 ? '+' : '';
  return currency === 'KRW' ? `${s}${body}원` : `${s}$${body}`;
}

/** 단가 표시 (통화 기호 없이) */
export function num(n, currency = 'KRW') {
  const d = DECIMALS[currency] ?? 2;
  return round(n, d).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
}

/** 수량: 불필요한 0 제거, 최대 6자리 */
export function qty(n) {
  return round(n, 6).toLocaleString('en-US', { maximumFractionDigits: 6 });
}

/** '1,234.5' → 1234.5, 빈 값은 null */
export function parseNum(str) {
  const s = String(str ?? '').replace(/,/g, '').trim();
  if (!s) return null;
  if (!/^\d*\.?\d*$/.test(s) || s === '.') return NaN;
  return Number(s);
}

/** 입력 중 표시용: 정수부 콤마, 소수부는 입력 그대로(최대 maxDec 자리) */
export function formatTyping(str, maxDec = 6) {
  let s = String(str ?? '').replace(/[^\d.]/g, '');
  const i = s.indexOf('.');
  if (i >= 0) s = s.slice(0, i + 1) + s.slice(i + 1).replace(/\./g, '');
  let [int, dec] = s.split('.');
  int = int.replace(/^0+(?=\d)/, '');
  const intFmt = int ? Number(int).toLocaleString('en-US') : (dec !== undefined ? '0' : '');
  if (dec === undefined || maxDec === 0) return intFmt;
  return `${intFmt}.${dec.slice(0, maxDec)}`;
}

export const currencyDecimals = (c) => DECIMALS[c] ?? 2;

/* ---------- 문자열 ---------- */
export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

export function stamp(withTime = true) {
  const d = new Date();
  const base = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;
  return withTime ? `${base}-${pad(d.getHours())}${pad(d.getMinutes())}` : base;
}

export function isoLocal(d = new Date()) {
  const off = -d.getTimezoneOffset();
  const sign = off >= 0 ? '+' : '-';
  return `${toDateStr(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}${sign}${pad(Math.floor(Math.abs(off) / 60))}:${pad(Math.abs(off) % 60)}`;
}

/** 파일명에 쓸 수 없는 문자 제거 */
export const safeFileName = (s) => String(s).replace(/[\\/:*?"<>|\s]+/g, '_').slice(0, 60);

export function download(filename, content, mime) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  }
}

/** 원화: 1,234,000원 (sign: +/− 표시) */
export function won(n, { sign = false } = {}) {
  return money(n, 'KRW', { sign });
}

/** 큰 금액 축약: 1,250,000 → 125만 */
export function wonShort(n) {
  const a = Math.abs(n);
  const s = n < 0 ? '−' : '';
  if (a >= 1e8) return `${s}${+(a / 1e8).toFixed(1)}억`;
  if (a >= 1e4) return `${s}${+(a / 1e4).toFixed(a >= 1e6 ? 0 : 1)}만`;
  return `${s}${Math.round(a).toLocaleString('en-US')}`;
}

export const pct = (v, d = 1) => (v == null || !Number.isFinite(v) ? '-' : `${v >= 0 ? '+' : '−'}${Math.abs(v * 100).toFixed(d)}%`);
export const plainPct = (v, d = 1) => (v == null || !Number.isFinite(v) ? '-' : `${(v * 100).toFixed(d)}%`);

/* ---------- 라벨 ---------- */
export const SESSION_STATUS = {
  planned: { label: '예정', cls: 'st-planned' },
  done: { label: '완료', cls: 'st-done' },
  skipped: { label: '불참', cls: 'st-skipped' },
};
export const KIND = {
  satellite: '새틀라이트',
  mtt: '토너먼트',
  other: '기타',
};
export const TICKET_STATUS = {
  held: '보유',
  used: '사용',
  expired: '만료',
  sold: '판매',
};
export const POSITIONS = ['UTG', 'UTG+1', 'MP', 'LJ', 'HJ', 'CO', 'BTN', 'SB', 'BB'];
export const DEFAULT_HAND_TAGS = ['버블', 'ICM', '블러프캐치', '쿨러', '3벳팟', '멀티웨이', '실수', '좋은 플레이'];
