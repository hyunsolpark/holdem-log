// 대회 손익, 뱅크롤, 통계 계산 (SPEC 4장)
import { data, ticketById, ticketsWonBy, venueName } from './store.js';
import { todayStr, addDays } from './utils.js';

/** 대회 한 건의 돈 흐름. 완료가 아니면 모두 0 */
export function sessionMoney(s) {
  if (s.status !== 'done') return { cost: 0, cashCost: 0, prize: 0, ticketValue: 0, winnings: 0, profit: 0, itm: false, ticketsWon: 0 };
  const entryTicket = s.entryTicketId ? ticketById(s.entryTicketId) : null;
  const firstEntry = entryTicket ? entryTicket.faceValue : s.buyIn;
  const reentryCost = s.buyIn * (s.reentries || 0);
  const cost = firstEntry + reentryCost;
  const cashCost = entryTicket ? reentryCost : cost;
  const won = ticketsWonBy(s.id);
  const ticketValue = won.reduce((a, t) => a + t.faceValue, 0);
  const prize = s.prize || 0;
  const winnings = prize + ticketValue;
  return { cost, cashCost, prize, ticketValue, winnings, profit: winnings - cost, itm: prize > 0 || won.length > 0, ticketsWon: won.length, paidWithTicket: !!entryTicket };
}

/** 예정 대회의 예상 비용 (티켓 참가면 0원 현금) */
export function plannedCost(s) {
  const t = s.entryTicketId ? ticketById(s.entryTicketId) : null;
  return { cost: t ? t.faceValue : s.buyIn, cash: t ? 0 : s.buyIn, ticket: t };
}

const inRange = (d, from, to) => (!from || d >= from) && (!to || d <= to);

export function bankroll() {
  const start = data.settings.bankrollStartDate || null;
  let cash = Number(data.settings.startingBankroll) || 0;
  for (const s of data.sessions) {
    if (s.status !== 'done' || (start && s.date < start)) continue;
    const m = sessionMoney(s);
    cash += m.prize - m.cashCost;
  }
  let deposits = 0, withdrawals = 0;
  for (const e of data.ledger) {
    if (start && e.date < start) continue;
    if (e.type === 'deposit') deposits += e.amount; else withdrawals += e.amount;
  }
  cash += deposits - withdrawals;
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
    total: cash + ticketValue, deposits, withdrawals, sold,
  };
}

/** 기간별 순손익(대회만) */
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
  const acc = { count: 0, cost: 0, winnings: 0, profit: 0, itm: 0, buyInSum: 0, best: null, entries: 0 };
  for (const s of list) {
    const m = sessionMoney(s);
    acc.count++;
    acc.cost += m.cost;
    acc.winnings += m.winnings;
    acc.profit += m.profit;
    acc.entries += 1 + (s.reentries || 0);
    acc.buyInSum += s.buyIn;
    if (m.itm) acc.itm++;
    if (!acc.best || m.profit > acc.best.profit) acc.best = { profit: m.profit, session: s };
  }
  acc.roi = acc.cost ? acc.profit / acc.cost : null;
  acc.itmRate = acc.count ? acc.itm / acc.count : null;
  acc.avgBuyIn = acc.count ? acc.buyInSum / acc.count : null;
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
    return [...m.entries()].map(([k, list]) => ({ key: k, label: labelFn(k), ...aggregate(list) }))
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
    costPerTicket: ticketsWon ? satAgg.cost / ticketsWon : null,
    profit: satAgg.profit,
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

  return { from, to, total, byVenue, byKind, satellite, series, tickets };
}
