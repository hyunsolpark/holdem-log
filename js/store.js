// 메모리 캐시 + 저장 동작. IndexedDB에 먼저 쓰고 캐시에 반영한다.
import { getAll, write } from './db.js';
import { uuid, DEFAULT_HAND_TAGS } from './utils.js';

export const data = {
  sessions: [], tickets: [], hands: [], venues: [], ledger: [],
  settings: { startingBankroll: 0, bankrollStartDate: null, handTags: [...DEFAULT_HAND_TAGS] },
};

export const ui = {
  tab: 'home',
  sessionsView: 'planned',
  sessionsVenue: null,
  sessionsKind: null,
  handsView: 'todo',
  handsTag: null,
  handsQuery: '',
  statsPeriod: 'all',
  ticketsView: 'held',
};

// app.js가 채워 넣는 전역 동작
export const actions = { refresh: () => {} };

const DEFAULT_VENUES = [
  { name: 'HPT', type: 'online' },
  { name: '피망', type: 'online' },
  { name: 'WPL', type: 'online' },
];

export async function loadAll() {
  const [sessions, tickets, hands, venues, ledger, settings] = await Promise.all(
    ['sessions', 'tickets', 'hands', 'venues', 'ledger', 'settings'].map(getAll),
  );
  Object.assign(data, { sessions, tickets, hands, ledger });
  data.venues = venues.sort((a, b) => a.order - b.order);
  data.settings = {
    startingBankroll: 0, bankrollStartDate: null, handTags: [...DEFAULT_HAND_TAGS],
    ...Object.fromEntries(settings.map((r) => [r.key, r.value])),
  };
}

/** 첫 실행: 기본 플랫폼 생성 */
export async function seedIfEmpty() {
  if (data.settings.initialized) return false;
  const venues = DEFAULT_VENUES.map((v, i) => ({ id: uuid(), ...v, order: i, deleted: false }));
  await write([
    { store: 'venues', put: venues },
    { store: 'settings', put: [{ key: 'initialized', value: true }, { key: 'handTags', value: data.settings.handTags }] },
  ]);
  data.venues = venues;
  data.settings.initialized = true;
  return true;
}

/* ---------- 조회 ---------- */
export const sessionById = (id) => data.sessions.find((s) => s.id === id);
export const ticketById = (id) => data.tickets.find((t) => t.id === id);
export const venueById = (id) => data.venues.find((v) => v.id === id);
export const venueName = (id) => venueById(id)?.name ?? '(알 수 없음)';
export const activeVenues = () => data.venues.filter((v) => !v.deleted);
export const ticketsWonBy = (sessionId) => data.tickets.filter((t) => t.sourceSessionId === sessionId);
export const handsOf = (sessionId) => data.hands.filter((h) => h.sessionId === sessionId)
  .sort((a, b) => b.createdAt - a.createdAt);

const replace = (arr, row) => {
  const i = arr.findIndex((x) => x.id === row.id);
  if (i >= 0) arr[i] = row; else arr.push(row);
};
const remove = (arr, id) => {
  const i = arr.findIndex((x) => x.id === id);
  if (i >= 0) arr.splice(i, 1);
};

/* ---------- 대회 ---------- */
/**
 * 대회 저장 + 티켓 연결을 한 트랜잭션으로.
 * wonTickets: 이 대회에서 획득한 티켓 목록 [{ id?, name, faceValue, expiresAt }] (완료가 아니면 무시)
 * 반환: 저장된 세션. 사용·판매된 획득 티켓을 지우려 하면 Error.
 */
export async function saveSession(session, { wonTickets = null } = {}) {
  const now = Date.now();
  const prev = sessionById(session.id);
  const row = { ...session, updatedAt: now, createdAt: prev?.createdAt ?? now };
  const ticketPuts = [];
  const ticketDels = [];

  // 불참이면 참가 티켓을 되돌린다
  if (row.status === 'skipped') row.entryTicketId = null;

  // 참가 티켓 변경
  const oldEntry = prev?.entryTicketId ?? null;
  if (oldEntry && oldEntry !== row.entryTicketId) {
    const t = ticketById(oldEntry);
    if (t && t.status === 'used') ticketPuts.push({ ...t, status: 'held', usedSessionId: null, updatedAt: now });
  }
  if (row.entryTicketId) {
    const t = ticketById(row.entryTicketId);
    if (!t) throw new Error('선택한 티켓을 찾을 수 없어요');
    if (t.status !== 'used' || t.usedSessionId !== row.id) {
      if (t.status !== 'held') throw new Error(`'${t.name}' 티켓은 이미 ${t.status === 'used' ? '사용' : '처리'}된 티켓이에요`);
      ticketPuts.push({ ...t, status: 'used', usedSessionId: row.id, updatedAt: now });
    }
  }

  // 획득 티켓
  if (wonTickets) {
    const existing = ticketsWonBy(row.id);
    const list = row.status === 'done' ? wonTickets : [];
    const keep = new Set(list.filter((t) => t.id).map((t) => t.id));
    for (const t of existing) {
      if (keep.has(t.id)) continue;
      if (t.status !== 'held') throw new Error(`획득 티켓 '${t.name}'은(는) 이미 ${t.status === 'used' ? '사용' : '판매·만료'} 처리돼서 뺄 수 없어요`);
      ticketDels.push(t.id);
    }
    for (const t of list) {
      const cur = t.id ? ticketById(t.id) : null;
      if (cur) {
        ticketPuts.push({ ...cur, name: t.name, faceValue: t.faceValue, expiresAt: t.expiresAt || null, acquiredAt: row.date, updatedAt: now });
      } else {
        ticketPuts.push({
          id: uuid(), name: t.name, faceValue: t.faceValue, acquiredAt: row.date, expiresAt: t.expiresAt || null,
          status: 'held', sourceSessionId: row.id, usedSessionId: null, soldAmount: null, soldAt: null, memo: '',
          createdAt: now, updatedAt: now,
        });
      }
    }
  }

  // 같은 티켓이 두 번 들어가지 않도록 마지막 값으로 정리
  const merged = new Map();
  ticketPuts.forEach((t) => merged.set(t.id, { ...(merged.get(t.id) ?? {}), ...t }));
  const puts = [...merged.values()];

  await write([
    { store: 'sessions', put: row },
    ...(puts.length ? [{ store: 'tickets', put: puts }] : []),
    ...(ticketDels.length ? [{ store: 'tickets', del: ticketDels }] : []),
  ]);
  replace(data.sessions, row);
  puts.forEach((t) => replace(data.tickets, t));
  ticketDels.forEach((id) => remove(data.tickets, id));
  return row;
}

export function canDeleteSession(id) {
  const blocked = ticketsWonBy(id).filter((t) => t.status !== 'held');
  return { ok: !blocked.length, blocked };
}

export async function deleteSession(id) {
  const s = sessionById(id);
  const now = Date.now();
  const { ok } = canDeleteSession(id);
  if (!ok) throw new Error('이 대회에서 획득한 티켓 중 이미 사용·판매·만료된 것이 있어요');
  const ops = [{ store: 'sessions', del: id }];
  const won = ticketsWonBy(id).map((t) => t.id);
  if (won.length) ops.push({ store: 'tickets', del: won });
  let entry = null;
  if (s.entryTicketId) {
    const t = ticketById(s.entryTicketId);
    if (t && t.usedSessionId === id) entry = { ...t, status: 'held', usedSessionId: null, updatedAt: now };
  }
  if (entry) ops.push({ store: 'tickets', put: entry });
  const hands = data.hands.filter((h) => h.sessionId === id).map((h) => ({ ...h, sessionId: null, updatedAt: now }));
  if (hands.length) ops.push({ store: 'hands', put: hands });
  await write(ops);
  remove(data.sessions, id);
  won.forEach((tid) => remove(data.tickets, tid));
  if (entry) replace(data.tickets, entry);
  hands.forEach((h) => replace(data.hands, h));
}

/* ---------- 티켓 ---------- */
export async function saveTicket(t) {
  const now = Date.now();
  const row = { ...t, updatedAt: now, createdAt: t.createdAt ?? now };
  await write([{ store: 'tickets', put: row }]);
  replace(data.tickets, row);
  return row;
}

export function newTicket(init = {}) {
  const now = Date.now();
  return {
    id: uuid(), name: '', faceValue: 0, acquiredAt: null, expiresAt: null, status: 'held',
    sourceSessionId: null, usedSessionId: null, soldAmount: null, soldAt: null, memo: '',
    createdAt: now, updatedAt: now, ...init,
  };
}

/** 티켓 삭제. 사용된 티켓이면 그 대회는 현금 참가로 바뀐다 */
export async function deleteTicket(id) {
  const t = ticketById(id);
  const ops = [{ store: 'tickets', del: id }];
  let s = null;
  if (t.usedSessionId) {
    const cur = sessionById(t.usedSessionId);
    if (cur && cur.entryTicketId === id) {
      s = { ...cur, entryTicketId: null, updatedAt: Date.now() };
      ops.push({ store: 'sessions', put: s });
    }
  }
  await write(ops);
  remove(data.tickets, id);
  if (s) replace(data.sessions, s);
}

/* ---------- 핸드 ---------- */
export async function saveHand(h) {
  const now = Date.now();
  const row = { ...h, updatedAt: now, createdAt: h.createdAt ?? now };
  await write([{ store: 'hands', put: row }]);
  replace(data.hands, row);
  const unknown = row.tags.filter((t) => !data.settings.handTags.includes(t));
  if (unknown.length) await setSetting('handTags', [...data.settings.handTags, ...unknown]);
  return row;
}
export async function deleteHand(id) {
  await write([{ store: 'hands', del: id }]);
  remove(data.hands, id);
}

export async function renameHandTag(from, to) {
  const hands = data.hands.filter((h) => h.tags.includes(from))
    .map((h) => ({ ...h, tags: [...new Set(h.tags.map((t) => (t === from ? to : t)))] }));
  const tags = [...new Set(data.settings.handTags.map((t) => (t === from ? to : t)))];
  await write([...(hands.length ? [{ store: 'hands', put: hands }] : []), { store: 'settings', put: { key: 'handTags', value: tags } }]);
  hands.forEach((h) => replace(data.hands, h));
  data.settings.handTags = tags;
}
export async function deleteHandTag(tag) {
  const hands = data.hands.filter((h) => h.tags.includes(tag)).map((h) => ({ ...h, tags: h.tags.filter((t) => t !== tag) }));
  const tags = data.settings.handTags.filter((t) => t !== tag);
  await write([...(hands.length ? [{ store: 'hands', put: hands }] : []), { store: 'settings', put: { key: 'handTags', value: tags } }]);
  hands.forEach((h) => replace(data.hands, h));
  data.settings.handTags = tags;
}

/* ---------- 입출금 ---------- */
export async function saveLedger(e) {
  const row = { ...e, createdAt: e.createdAt ?? Date.now() };
  await write([{ store: 'ledger', put: row }]);
  replace(data.ledger, row);
}
export async function deleteLedger(id) {
  await write([{ store: 'ledger', del: id }]);
  remove(data.ledger, id);
}

/* ---------- 플랫폼·장소 ---------- */
export async function addVenue(name, type) {
  const v = { id: uuid(), name, type, order: data.venues.length ? Math.max(...data.venues.map((x) => x.order)) + 1 : 0, deleted: false };
  await write([{ store: 'venues', put: v }]);
  data.venues.push(v);
  return v;
}
export async function updateVenue(v) {
  await write([{ store: 'venues', put: v }]);
  replace(data.venues, v);
}
export async function reorderVenues(ids) {
  const active = ids.map((id, i) => ({ ...venueById(id), order: i }));
  const rest = data.venues.filter((v) => !ids.includes(v.id)).map((v, i) => ({ ...v, order: ids.length + i }));
  await write([{ store: 'venues', put: [...active, ...rest] }]);
  data.venues = [...active, ...rest];
}

/* ---------- 설정 ---------- */
export async function setSetting(key, value) {
  await write([{ store: 'settings', put: { key, value } }]);
  data.settings[key] = value;
}
