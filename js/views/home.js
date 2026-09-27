// 홈: 뱅크롤, 결과 입력 대기, 다가오는 일정, 만료 임박 티켓
import { data, ui, actions } from '../store.js';
import { bankroll, profitBetween } from '../money.js';
import { won, todayStr, addDays, esc } from '../utils.js';
import { icon, ICONS } from '../ui.js';
import { sessionCard, ticketRow, profitHtml } from './common.js';

export function pendingSessions() {
  const t = todayStr();
  return data.sessions.filter((s) => s.status === 'planned' && s.date < t).sort((a, b) => (a.date < b.date ? -1 : 1));
}

export function renderHome(root) {
  const t = todayStr();
  const br = bankroll();
  const monthProfit = profitBetween(`${t.slice(0, 7)}-01`, null);
  const pending = pendingSessions();
  const upcoming = data.sessions.filter((s) => s.status === 'planned' && s.date >= t)
    .sort((a, b) => (a.date === b.date ? (a.startTime ?? '') < (b.startTime ?? '') ? -1 : 1 : a.date < b.date ? -1 : 1));
  const limit = addDays(t, 30);
  const expiring = data.tickets.filter((x) => x.status === 'held' && x.expiresAt && x.expiresAt <= limit)
    .sort((a, b) => (a.expiresAt < b.expiresAt ? -1 : 1));
  const empty = !data.sessions.length && !data.tickets.length && !data.ledger.length && !data.settings.startingBankroll;

  root.innerHTML = `
    <header class="page-head">
      <h1>홀덤 로그</h1>
      <div class="head-actions">
        <button type="button" class="icon-btn" data-act="tickets" aria-label="티켓">${icon(ICONS.ticket)}</button>
        <button type="button" class="icon-btn" data-act="settings" aria-label="설정">${icon(ICONS.gear)}</button>
      </div>
    </header>

    <section class="card bankroll">
      <div class="br-total"><span class="k">총 뱅크롤</span><span class="br-big">${won(br.total)}</span></div>
      <div class="br-grid">
        <button type="button" class="br-item" data-act="ledger"><span class="k">현금</span><span class="v">${won(br.cash)}</span></button>
        <button type="button" class="br-item" data-act="tickets"><span class="k">티켓 ${br.ticketCount}장</span><span class="v">${won(br.ticketValue)}</span></button>
        <div class="br-item"><span class="k">이번 달 손익</span><span class="v">${profitHtml(monthProfit)}</span></div>
      </div>
      ${empty ? '<button type="button" class="link-btn" data-act="settings">시작 뱅크롤 설정하기 →</button>' : ''}
    </section>

    ${pending.length ? `
      <section class="home-sec">
        <h2 class="sec-title">결과 입력 대기 <span class="count warn">${pending.length}</span></h2>
        <div class="session-list">${pending.map(sessionCard).join('')}</div>
      </section>` : ''}

    <section class="home-sec">
      <h2 class="sec-title">다가오는 일정 ${upcoming.length ? `<span class="count">${upcoming.length}</span>` : ''}</h2>
      ${upcoming.length ? `<div class="session-list">${upcoming.slice(0, 5).map(sessionCard).join('')}</div>
        ${upcoming.length > 5 ? '<button type="button" class="link-btn" data-act="all-planned">전체 일정 보기 →</button>' : ''}`
    : `<p class="muted empty-line">예정된 대회가 없어요. ＋ 버튼으로 다음 대회를 등록해 두세요.</p>`}
    </section>

    ${expiring.length ? `
      <section class="home-sec">
        <h2 class="sec-title">${expiring.some((x) => x.expiresAt < t) ? '유효기간 확인할 티켓' : '만료 임박 티켓'}</h2>
        <div class="ticket-list card">${expiring.map(ticketRow).join('')}</div>
      </section>` : ''}
  `;

  const on = (a, fn) => root.querySelectorAll(`[data-act="${a}"]`).forEach((b) => b.addEventListener('click', fn));
  on('settings', async () => (await import('./settings.js')).openSettings());
  on('ledger', async () => (await import('./settings.js')).openLedger());
  on('tickets', async () => (await import('./sheets.js')).openTickets('held'));
  on('all-planned', () => { ui.tab = 'sessions'; ui.sessionsView = 'planned'; actions.switchTab('sessions'); });
  root.querySelectorAll('[data-session]').forEach((b) => b.addEventListener('click', async () => {
    const s = data.sessions.find((x) => x.id === b.dataset.session);
    if (s.status === 'planned' && s.date < todayStr()) (await import('./session-form.js')).openSessionForm(s.id, { status: 'done', focusResult: true });
    else (await import('./session-detail.js')).openSessionDetail(s.id);
  }));
  root.querySelectorAll('[data-ticket]').forEach((b) => b.addEventListener('click', async () => (await import('./sheets.js')).openTicket(b.dataset.ticket)));
}

export { esc };
