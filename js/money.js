// 대회 손익, 뱅크롤, 게임머니 잔고, 통계 계산 (SPEC 4장, 13장)
import { data, ticketById, ticketsWonBy, venueName, venueById } from './store.js';
import { todayStr, addDays } from './utils.js';

/* ---------- 게임머니 ---------- */

/** 플랫폼의 평균 충전 단가 (원 / 게임머니 1단위). 충전 기록이 없으면 null */
export function venueRate(venueId) {
  let krw = 0, gm = 0;
  for (const e of data.ledger) {
    if (e.type === 'topup' && e.venueId === venueId) { krw += e.amount; gm += e.gm; }
  }
  return gm > 0 ? krw / gm : null;
}

/** 대회가 게임머니 대회인지 (저장 당시 기준) */
export const isGm = (s) => !!s.gm;

/** 플랫폼별 게임머니 잔고 */
export function platformBalances() {
  const out = new Map();
  const get = (id) => {
    if (!out.has(id)) out.set(id, { venueId: id, balance: 0, topupKrw: 0, topupGm: 0, adjust: 0, sessionNet: 0, ticketValue: 0, count: 0 });
    return out.get(id);
  };
  data.venues.filter((v) => v.gameMoney).forEach((v) => get(v.id));
  for (const e of data.ledger) {
    if (e.type === 'topup') { const b = get(e.venueId); b.topupKrw += e.amount; b.topupGm += e.gm; b.balance += e.gm; }
    if (e.type === 'gmadjust') { const b = get(e.venueId); b.adjust += e.gm; b.balance += e.gm; }
  }
  for (const s of data.sessions) {
    if (!isGm(s) || s.status !== 'done') continue;
    const b = get(s.venueId);
    const net = (s.prize || 0) - s.buyIn * (1 + (s.reentries || 0));
    b.sessionNet += net;
    b.balance += net;
    b.count++;
    b.ticketValue += ticketsWonBy(s.id).reduce((a, t) => a + t.faceValue, 0);
  }
  for (const b of out.values()) {
    b.rate = b.topupGm > 0 ? b.topupKrw / b.topupGm : null;
    b.balanceKrw = b.rate != null ? b.balance * b.rate : null;
    b.recovery = b.topupKrw > 0 ? b.ticketValue / b.topupKrw : null; // 충전 대비 티켓 회수율
    b.venue = venueById(b.venueId);
  }
  return [...out.values()].filter((b) => b.venue && (!b.venue.deleted || b.count || b.topupGm));
}

/* ---------- 대회 한 건 ---------- */

const ZERO = { cost: 0, cashCost: 0, prize: 0, ticketValue: 0, winnings: 0, profit: 0, itm: false, ticketsWon: 0, gm: false };

/**
 * 대회 한 건의 돈 흐름. 완료가 아니면 모두 0.
 * 원화 대회: cost/prize/profit 모두 원.
 * 게임머니 대회: gmCost/gmPrize/gmProfit은 게임머니, cost/winnings/profit은 평균 충전 단가로 환산한 원(환산 불가면 unconverted).
 */
export function sessionMoney(s) {
  if (s.status !== 'done') return { ...ZERO, gm: isGm(s) };
  const won = ticketsWonBy(s.id);
  const ticketValue = won.reduce((a, t) => a + t.faceValue, 0);
  const itm = (s.prize || 0) > 0 || won.length > 0;

  if (isGm(s)) {
    const gmCost = s.buyIn * (1 + (s.reentries || 0));
    const gmPrize = s.prize || 0;
    const rate = venueRate(s.venueId);
    const base = { gm: true, gmCost, gmPrize, gmProfit: gmPrize - gmCost, ticketValue, ticketsWon: won.length, itm, cashCost: 0, prize: 0, rate };
    if (rate == null) {
      return { ...base, unconverted: true, cost: 0, winnings: ticketValue, profit: 0 };
    }
    const cost = gmCost * rate;
    const winnings = gmPrize * rate + ticketValue;
    return { ...base, cost, winnings, profit: winnings - cost };
  }

  const entryTicket = s.entryTicketId ? ticketById(s.entryTicketId) : null;
  const firstEntry = entryTicket ? entryTicket.faceValue : s.buyIn;
  const reentryCost = s.buyIn * (s.reentries || 0);
  const cost = firstEntry + reentryCost;
  const cashCost = entryTicket ? reentryCost : cost;
  const prize = s.prize || 0;
  const winnings = prize + ticketValue;
  return { gm: false, cost, cashCost, prize, ticketValue, winnings, profit: winnings - cost, itm, ticketsWon: won.length, paidWithTicket: !!entryTicket };
}

/** 예정 대회의 예상 비용 (티켓 참가면 0원 현금) */
export function plannedCost(s) {
  const t = s.entryTicketId ? ticketById(s.entryTicketId) : null;
  return { cost: t ? t.faceValue : s.buyIn, cash: t ? 0 : s.buyIn, ticket: t };
}

const inRange = (d, from, to) => (!from || d >= from) && (!to || d <= to);

/* ---------- 뱅크롤 (게임머니 잔고는 제외) ---------- */
export function bankroll() {
  const start = data.settings.bankrollStartDate || null;
  let cash = Number(data.settings.startingBankroll) || 0;
  for (const s of data.sessions) {
    if (s.status !== 'done' || isGm(s) || (start && s.date < start)) continue;
    const m = sessionMoney(s);
    cash += m.prize - m.cashCost;
  }
  let deposits = 0, withdrawals = 0, topups = 0;
  for (const e of data.ledger) {
    if (start && e.date < start) continue;
    if (e.type === 'deposit') deposits += e.amount;
    else if (e.type === 'withdraw') withdrawals += e.amount;
    else if (e.type === 'topup') topups += e.amount;
  }
  cash += deposits - withdrawals - topups;
  let sold = 0;
  for (const t of data.tickets) {
    if (t.status === 'sold' && t.soldAmount != null && (!start || !t.soldAt || t.soldAt >= start)) sold += t.soldAmount;
  }
  cash += sold;
  // 보유 티켓 + 예정 대회에 쓰기로 한 티켓(아직 참가 전이라 자산으로 남아 있음)
  const reserved = data.tickets.filter((t) => t.status === 'used' && t.usedSessionId
    && data.sessions.find((s) => s.id === t.usedSessionId)?.status === 'planned');
  const held = data.tickets.filter((t) => t.status === 'held');
  const ticketValue = [...held, ...reserved].reduce((a, t) => a + t.faceValue, 0);
  return {
    cash, ticketValue, ticketCount: held.length + reserved.length, reservedCount: reserved.length,
    total: cash + ticketValue, deposits, withdrawals, topups, sold,
  };
}

/** 기간별 순손익(대회만, 게임머니는 원화 환산) */
export function profitBetween(from, to) {
  return data.sessions
    .filter((s) => s.status === 'done' && inRange(s.date, from, to))
    .reduce((a, s) => a + sessionMoney(s).profit, 0);
}

export function periodRange(key) {
  const t = todayStr();
  if (key === 'year') return [`${t.slice(0, 4)}-01-01`, null];
  if (key === 'month') return [`${t.slice(0, 7)}-01`, null];
  if (key === '3m') return [addDays(t, -91), null];
  return [null, null];
}

function aggregate(list) {
  const acc = { count: 0, cost: 0, winnings: 0, profit: 0, itm: 0, buyInSum: 0, buyInCount: 0, best: null, entries: 0, unconverted: 0, gmCount: 0, gmProfit: 0, gmCost: 0 };
  for (const s of list) {
    const m = sessionMoney(s);
    acc.count++;
    if (m.itm) acc.itm++;
    acc.entries += 1 + (s.reentries || 0);
    if (m.gm) { acc.gmCount++; acc.gmProfit += m.gmProfit; acc.gmCost += m.gmCost; }
    if (m.unconverted) { acc.unconverted++; acc.winnings += m.ticketValue; acc.profit += m.ticketValue; continue; }
    acc.cost += m.cost;
    acc.winnings += m.winnings;
    acc.profit += m.profit;
    acc.buyInSum += m.gm ? m.gmCost / (1 + (s.reentries || 0)) * m.rate : s.buyIn;
    acc.buyInCount++;
    if (!acc.best || m.profit > acc.best.profit) acc.best = { profit: m.profit, session: s };
  }
  acc.roi = acc.cost ? acc.profit / acc.cost : null;
  acc.gmRoi = acc.gmCost ? acc.gmProfit / acc.gmCost : null;
  acc.itmRate = acc.count ? acc.itm / acc.count : null;
  acc.avgBuyIn = acc.buyInCount ? acc.buyInSum / acc.buyInCount : null;
  return acc;
}

export function stats(periodKey) {
  const [from, to] = periodRange(periodKey);
  const done = data.sessions.filter((s) => s.status === 'done' && inRange(s.date, from, to))
    .sort((a, b) => (a.date === b.date ? a.createdAt - b.createdAt : a.date < b.date ? -1 : 1));
  const total = aggregate(done);

  const group = (keyFn, labelFn) => {
    const m = new Map();
    done.forEach((s) => { const k = keyFn(s); m.set(k, [...(m.get(k) ?? []), s]); });
    return [...m.entries()].map(([k, list]) => ({ key: k, label: labelFn(k), gm: list.every(isGm), ...aggregate(list) }))
      .sort((a, b) => b.count - a.count || b.profit - a.profit);
  };
  const byVenue = group((s) => s.venueId, venueName);
  const byKind = group((s) => s.kind, (k) => k);

  const sats = done.filter((s) => s.kind === 'satellite');
  const satAgg = aggregate(sats);
  const ticketsWon = sats.reduce((a, s) => a + ticketsWonBy(s.id).length, 0);
  const satWins = sats.filter((s) => ticketsWonBy(s.id).length > 0).length;
  const satellite = {
    count: sats.length,
    cost: satAgg.cost,
    ticketsWon,
    successRate: sats.length ? satWins / sats.length : null,
    costPerTicket: ticketsWon && satAgg.cost ? satAgg.cost / ticketsWon : null,
    profit: satAgg.profit,
    unconverted: satAgg.unconverted,
  };

  let run = 0;
  const series = done.map((s) => {
    run += sessionMoney(s).profit;
    return { date: s.date, value: run, session: s };
  });

  const tickets = { held: [0, 0], used: [0, 0], expired: [0, 0], sold: [0, 0] };
  data.tickets.forEach((t) => {
    if (!inRange(t.acquiredAt ?? '', from, to) && from) return;
    tickets[t.status][0]++;
    tickets[t.status][1] += t.status === 'sold' ? (t.soldAmount ?? 0) : t.faceValue;
  });

  return { from, to, total, byVenue, byKind, satellite, series, tickets, platforms: platformBalances() };
}
