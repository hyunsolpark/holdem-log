// JSON 백업/검증, 대회 기록 CSV
import { dumpAll } from './db.js';
import { data, venueName, ticketById } from './store.js';
import { sessionMoney } from './money.js';
import { stamp, isoLocal, isValidDateStr, download, SESSION_STATUS, KIND, TICKET_STATUS, DEFAULT_HAND_TAGS } from './utils.js';
import { isCard } from './cards.js';

export const SCHEMA_VERSION = 1;
const APP = 'holdem-log';

export async function exportJSON() {
  const d = await dumpAll();
  delete d.settings.initialized;
  const payload = { app: APP, schemaVersion: SCHEMA_VERSION, exportedAt: isoLocal(), data: d };
  const name = `holdem-log-backup-${stamp(true)}.json`;
  download(name, JSON.stringify(payload, null, 2), 'application/json');
  return name;
}

const isStr = (v) => typeof v === 'string';
const has = (obj, k) => Object.prototype.hasOwnProperty.call(obj, k);
const int0 = (v) => (Number.isFinite(Number(v)) && Number(v) >= 0 ? Math.round(Number(v)) : 0);
const intOrNull = (v) => (v == null || v === '' || !Number.isFinite(Number(v)) ? null : Math.round(Number(v)));
const timeOrNull = (v) => (isStr(v) && /^\d{2}:\d{2}$/.test(v) ? v : null);

export function parseBackup(text) {
  let json;
  try { json = JSON.parse(text); } catch { throw new Error('JSON 파일을 읽을 수 없습니다.'); }
  if (!json || json.app !== APP) throw new Error('이 앱(홀덤 로그)의 백업 파일이 아닙니다.');
  if (typeof json.schemaVersion !== 'number' || json.schemaVersion > SCHEMA_VERSION) throw new Error('지원하지 않는 백업 버전입니다.');
  const d = json.data;
  const lists = ['sessions', 'tickets', 'hands', 'venues', 'ledger'];
  if (!d || lists.some((k) => !Array.isArray(d[k]))) throw new Error('백업 파일에 필요한 항목이 없습니다.');
  const bad = (what, i) => new Error(`${what} ${i + 1}번째 항목의 형식이 올바르지 않습니다.`);
  const now = Date.now();

  const venues = d.venues.map((v, i) => {
    if (!isStr(v?.id) || !isStr(v.name)) throw bad('플랫폼·장소', i);
    return { id: v.id, name: v.name, type: v.type === 'offline' ? 'offline' : 'online', order: Number(v.order) || 0, deleted: !!v.deleted };
  });
  const sessions = d.sessions.map((s, i) => {
    if (!isStr(s?.id) || !has(SESSION_STATUS, s.status) || !isValidDateStr(s.date) || !isStr(s.venueId) || !isStr(s.name) || !has(KIND, s.kind)) throw bad('대회', i);
    return {
      id: s.id, status: s.status, date: s.date, startTime: timeOrNull(s.startTime), endTime: timeOrNull(s.endTime),
      venueId: s.venueId, name: s.name, kind: s.kind, buyIn: int0(s.buyIn), entryTicketId: isStr(s.entryTicketId) ? s.entryTicketId : null,
      reentries: int0(s.reentries), place: intOrNull(s.place), entrants: intOrNull(s.entrants), prize: int0(s.prize),
      memo: isStr(s.memo) ? s.memo : '', createdAt: Number(s.createdAt) || now, updatedAt: Number(s.updatedAt) || now,
    };
  });
  const tickets = d.tickets.map((t, i) => {
    if (!isStr(t?.id) || !isStr(t.name) || !has(TICKET_STATUS, t.status)) throw bad('티켓', i);
    return {
      id: t.id, name: t.name, faceValue: int0(t.faceValue), acquiredAt: isValidDateStr(t.acquiredAt) ? t.acquiredAt : null,
      expiresAt: isValidDateStr(t.expiresAt) ? t.expiresAt : null, status: t.status,
      sourceSessionId: isStr(t.sourceSessionId) ? t.sourceSessionId : null, usedSessionId: isStr(t.usedSessionId) ? t.usedSessionId : null,
      soldAmount: intOrNull(t.soldAmount), soldAt: isValidDateStr(t.soldAt) ? t.soldAt : null, memo: isStr(t.memo) ? t.memo : '',
      createdAt: Number(t.createdAt) || now, updatedAt: Number(t.updatedAt) || now,
    };
  });
  const hands = d.hands.map((h, i) => {
    if (!isStr(h?.id) || !isValidDateStr(h.date)) throw bad('핸드', i);
    return {
      id: h.id, sessionId: isStr(h.sessionId) ? h.sessionId : null, date: h.date,
      hero: Array.isArray(h.hero) ? h.hero.filter(isCard).slice(0, 2) : [], board: Array.isArray(h.board) ? h.board.filter(isCard).slice(0, 5) : [],
      position: isStr(h.position) ? h.position : null, stackBb: Number.isFinite(Number(h.stackBb)) && h.stackBb != null ? Number(h.stackBb) : null,
      level: isStr(h.level) ? h.level : '', playersLeft: intOrNull(h.playersLeft), notes: isStr(h.notes) ? h.notes : '',
      result: isStr(h.result) ? h.result : '', tags: Array.isArray(h.tags) ? h.tags.filter(isStr) : [], review: h.review === 'done' ? 'done' : 'todo',
      createdAt: Number(h.createdAt) || now, updatedAt: Number(h.updatedAt) || now,
    };
  });
  const ledger = d.ledger.map((e, i) => {
    if (!isStr(e?.id) || !isValidDateStr(e.date) || !['deposit', 'withdraw'].includes(e.type) || !(Number(e.amount) > 0)) throw bad('입출금', i);
    return { id: e.id, date: e.date, type: e.type, amount: Math.round(Number(e.amount)), memo: isStr(e.memo) ? e.memo : '', createdAt: Number(e.createdAt) || now };
  });
  const s = d.settings ?? {};
  const settings = {
    startingBankroll: int0(s.startingBankroll),
    bankrollStartDate: isValidDateStr(s.bankrollStartDate) ? s.bankrollStartDate : null,
    handTags: Array.isArray(s.handTags) ? s.handTags.filter(isStr) : [...DEFAULT_HAND_TAGS],
    initialized: true,
  };
  return { sessions, tickets, hands, venues, ledger, settings, exportedAt: json.exportedAt };
}

/* ---------- CSV ---------- */
const csvCell = (v) => {
  const s = String(v ?? '');
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export function exportSessionsCSV() {
  const rows = [['날짜', '상태', '플랫폼·장소', '대회명', '종류', '참가 방식', '바이인', '리엔트리', '비용', '순위', '참가자', '상금', '획득 티켓 액면가', '손익', '메모']];
  const list = [...data.sessions].sort((a, b) => (a.date === b.date ? a.createdAt - b.createdAt : a.date < b.date ? -1 : 1));
  for (const s of list) {
    const m = sessionMoney(s);
    const t = s.entryTicketId ? ticketById(s.entryTicketId) : null;
    rows.push([
      s.date, SESSION_STATUS[s.status].label, venueName(s.venueId), s.name, KIND[s.kind], t ? `티켓(${t.name})` : '현금',
      s.buyIn, s.reentries || 0, s.status === 'done' ? m.cost : '', s.place ?? '', s.entrants ?? '',
      s.status === 'done' ? m.prize : '', s.status === 'done' ? m.ticketValue : '', s.status === 'done' ? m.profit : '', s.memo,
    ]);
  }
  const csv = '﻿' + rows.map((r) => r.map(csvCell).join(',')).join('\r\n') + '\r\n';
  const name = `holdem-log-sessions-${stamp(false)}.csv`;
  download(name, csv, 'text/csv;charset=utf-8');
  return rows.length - 1;
}
