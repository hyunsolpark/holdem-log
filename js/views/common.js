// 여러 화면이 함께 쓰는 조각
import { venueName, venueById, ticketById } from '../store.js';
import { sessionMoney, plannedCost } from '../money.js';
import { esc, won, gm, dateLabel, dueInfo, KIND, SESSION_STATUS, todayStr } from '../utils.js';
import { cardsHtml } from '../cards.js';
import { icon, ICONS } from '../ui.js';

export const profitClass = (v) => (v > 0 ? 'gain' : v < 0 ? 'loss' : '');
export const profitHtml = (v) => `<span class="${profitClass(v)}">${won(v, { sign: true })}</span>`;

export function kindBadge(kind) {
  return `<span class="badge k-${kind}">${KIND[kind]}</span>`;
}

export function segmented(name, options, value, { small = false } = {}) {
  return `<div class="segmented ${small ? 'small' : ''}" role="radiogroup">
    ${options.map((o) => `<button type="button" role="radio" data-${name}="${esc(o.value)}" class="${o.value === value ? 'on' : ''}" aria-checked="${o.value === value}">${esc(o.label)}${o.count != null ? ` <span class="seg-count">${o.count}</span>` : ''}</button>`).join('')}
  </div>`;
}

export function dueBadge(dateStr) {
  const d = dueInfo(dateStr);
  if (!d) return '';
  const warn = d.level === 'overdue' || d.level === 'today';
  return `<span class="due ${d.level}">${warn ? icon(ICONS.alert) : ''}${d.label}</span>`;
}

/** 대회 카드 (목록용) */
export function sessionCard(s) {
  const m = sessionMoney(s);
  const pc = plannedCost(s);
  const pending = s.status === 'planned' && s.date < todayStr();
  const unit = venueById(s.venueId)?.gmUnit ?? '억';
  let result = '';
  if (s.status === 'done') {
    const parts = [];
    if (s.place) parts.push(`${s.place}위${s.entrants ? `/${s.entrants}` : ''}`);
    if (m.gm ? m.gmPrize : m.prize) parts.push(`상금 ${m.gm ? gm(m.gmPrize, unit) : won(m.prize)}`);
    if (m.ticketsWon) parts.push(`${icon(ICONS.ticket)}티켓 ${m.ticketsWon}장`);
    const profit = m.gm
      ? `${m.gmProfit ? `<span class="${profitClass(m.gmProfit)}">${gm(m.gmProfit, unit, { sign: true })}</span>` : ''}${m.ticketValue ? `${m.gmProfit ? ' ' : ''}<span class="gain">+${won(m.ticketValue)}</span>` : ''}${!m.gmProfit && !m.ticketValue ? gm(0, unit) : ''}`
      : profitHtml(m.profit);
    result = `<span class="sc-result">${parts.join(' · ') || '입상 못 함'}</span><span class="sc-profit">${profit}</span>`;
  } else if (s.status === 'planned') {
    result = `<span class="sc-result">${pc.ticket ? `${icon(ICONS.ticket)}티켓 참가` : `바이인 ${s.gm ? gm(s.buyIn, unit) : won(s.buyIn)}`}</span>
      ${pending ? '<span class="pending-badge">결과 입력</span>' : dueBadge(s.date)}`;
  } else {
    result = '<span class="sc-result muted">불참</span>';
  }
  return `
    <button type="button" class="session-card card ${s.status}" data-session="${esc(s.id)}">
      <span class="sc-top">
        <span class="sc-date">${dateLabel(s.date, { short: true })}${s.startTime ? ` ${s.startTime}` : ''}</span>
        <span class="sc-venue">${esc(venueName(s.venueId))}</span>
        ${s.gm ? '<span class="badge gm-badge">게임머니</span>' : ''}${kindBadge(s.kind)}
      </span>
      <span class="sc-name">${esc(s.name)}</span>
      <span class="sc-bottom">${result}</span>
    </button>`;
}

export function statusBadge(status) {
  return `<span class="badge ${SESSION_STATUS[status].cls}">${SESSION_STATUS[status].label}</span>`;
}

/** 핸드 카드 (목록용) */
export function handCard(h, { showSession = true, sessionLabel = '' } = {}) {
  const meta = [h.position, h.stackBb != null ? `${h.stackBb}bb` : '', h.level].filter(Boolean).map(esc).join(' · ');
  const firstLine = (h.notes || '').split('\n').find((l) => l.trim()) ?? '';
  return `
    <button type="button" class="hand-card card" data-hand="${esc(h.id)}">
      <span class="hc-cards">${cardsHtml(h.hero, { size: 'md' })}${h.board.length ? `<span class="hc-board">${cardsHtml(h.board, { size: 'sm' })}</span>` : ''}</span>
      <span class="hc-main">
        ${meta ? `<span class="hc-meta">${meta}</span>` : ''}
        ${firstLine ? `<span class="hc-note">${esc(firstLine.replace(/[#>*`]/g, ''))}</span>` : ''}
        <span class="hc-foot">
          ${h.review === 'todo' ? '<span class="review-badge">복기 필요</span>' : '<span class="review-badge done">복기 완료</span>'}
          ${h.tags.map((t) => `<span class="tag">#${esc(t)}</span>`).join('')}
          ${showSession && sessionLabel ? `<span class="hc-session">${esc(sessionLabel)}</span>` : ''}
        </span>
      </span>
    </button>`;
}

export function ticketRow(t) {
  const exp = t.status === 'held' && t.expiresAt ? dueInfo(t.expiresAt) : null;
  return `
    <button type="button" class="ticket-row" data-ticket="${esc(t.id)}">
      <span class="tk-icon">${icon(ICONS.ticket)}</span>
      <span class="tk-main">
        <span class="tk-name">${esc(t.name)}</span>
        <span class="tk-sub">${t.status === 'sold' ? `판매 ${won(t.soldAmount ?? 0)}` : `액면가 ${won(t.faceValue)}`}${t.expiresAt ? ` · ~${dateLabel(t.expiresAt, { short: true })}` : ''}</span>
      </span>
      ${exp ? `<span class="due ${exp.n < 0 ? 'overdue' : exp.n <= 30 ? 'soon' : 'later'}">${exp.n < 0 ? '기간 지남' : exp.label}</span>` : ''}
    </button>`;
}

export { ticketById };
