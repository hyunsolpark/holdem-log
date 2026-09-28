// 대회 일정·티켓 만료일을 폰 캘린더에 추가 (Google 캘린더 링크 / .ics)
import { addDays, download, safeFileName, won, gm } from './utils.js';
import { venueName, venueById } from './store.js';
import { plannedCost } from './money.js';

const appUrl = () => location.origin + location.pathname.replace(/index\.html$/, '');
const compact = (d) => d.replace(/-/g, '');
const tz = () => Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Seoul';

function addHours(date, time, h) {
  const [y, m, d] = date.split('-').map(Number);
  const [hh, mm] = time.split(':').map(Number);
  const dt = new Date(y, m - 1, d, hh + h, mm);
  const p = (n) => String(n).padStart(2, '0');
  return { date: `${dt.getFullYear()}-${p(dt.getMonth() + 1)}-${p(dt.getDate())}`, time: `${p(dt.getHours())}:${p(dt.getMinutes())}` };
}

/** 이벤트 정의: { uid, title, date, start?, end?, details, alarm } */
export function sessionEvent(s) {
  const pc = plannedCost(s);
  const start = s.startTime || null;
  let end = null;
  if (start) end = s.endTime && s.endTime > start ? { date: s.date, time: s.endTime } : addHours(s.date, start, 4);
  return {
    uid: `session-${s.id}`,
    title: `[홀덤] ${s.name}`,
    date: s.date, start, end,
    details: [`${venueName(s.venueId)} · 바이인 ${s.gm ? gm(s.buyIn, venueById(s.venueId)?.gmUnit) : won(s.buyIn)}${pc.ticket ? ` (티켓: ${pc.ticket.name})` : ''}`, s.memo, `홀덤 로그: ${appUrl()}`].filter(Boolean).join('\n'),
    alarm: start ? '-PT1H' : 'PT9H',
  };
}

export function ticketEvent(t) {
  return {
    uid: `ticket-${t.id}`,
    title: `[티켓 만료] ${t.name}`,
    date: t.expiresAt, start: null, end: null,
    details: `액면가 ${won(t.faceValue)} · 오늘 만료돼요\n홀덤 로그: ${appUrl()}`,
    alarm: '-P7D',
  };
}

export function googleUrl(ev) {
  const dates = ev.start
    ? `${compact(ev.date)}T${ev.start.replace(':', '')}00/${compact(ev.end.date)}T${ev.end.time.replace(':', '')}00`
    : `${compact(ev.date)}/${compact(addDays(ev.date, 1))}`;
  const p = new URLSearchParams({ action: 'TEMPLATE', text: ev.title, dates, details: ev.details });
  if (ev.start) p.set('ctz', tz());
  return `https://calendar.google.com/calendar/render?${p.toString()}`;
}

const icsEscape = (s) => String(s).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
function fold(line) {
  const enc = new TextEncoder();
  if (enc.encode(line).length <= 75) return line;
  const out = []; let cur = ''; let len = 0;
  for (const ch of line) {
    const l = enc.encode(ch).length;
    if (len + l > (out.length ? 74 : 75)) { out.push(cur); cur = ''; len = 0; }
    cur += ch; len += l;
  }
  out.push(cur);
  return out.join('\r\n ');
}

export function buildIcs(ev) {
  const stampNow = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const when = ev.start
    ? [`DTSTART:${compact(ev.date)}T${ev.start.replace(':', '')}00`, `DTEND:${compact(ev.end.date)}T${ev.end.time.replace(':', '')}00`]
    : [`DTSTART;VALUE=DATE:${compact(ev.date)}`, `DTEND;VALUE=DATE:${compact(addDays(ev.date, 1))}`];
  const lines = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//holdem-log//KO', 'CALSCALE:GREGORIAN',
    'BEGIN:VEVENT', `UID:${ev.uid}@holdem-log`, `DTSTAMP:${stampNow}`, ...when,
    `SUMMARY:${icsEscape(ev.title)}`, `DESCRIPTION:${icsEscape(ev.details)}`,
    'BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${icsEscape(ev.title)}`, `TRIGGER;RELATED=START:${ev.alarm}`, 'END:VALARM',
    'END:VEVENT', 'END:VCALENDAR',
  ];
  return lines.map(fold).join('\r\n') + '\r\n';
}

export function downloadIcs(ev) {
  download(`${safeFileName(ev.title.replace(/^\[[^\]]+\]\s*/, ''))}-${compact(ev.date)}.ics`, buildIcs(ev), 'text/calendar;charset=utf-8');
}
