// 대회 탭: 예정 / 완료 / 전체
import { data, ui, activeVenues, sessionById } from '../store.js';
import { sessionMoney } from '../money.js';
import { esc, monthKey, KIND, todayStr } from '../utils.js';
import { segmented, sessionCard, profitHtml } from './common.js';

export function renderSessions(root) {
  const counts = {
    planned: data.sessions.filter((s) => s.status === 'planned').length,
    done: data.sessions.filter((s) => s.status === 'done').length,
    all: data.sessions.length,
  };
  let list = data.sessions.filter((s) => ui.sessionsView === 'all' || s.status === ui.sessionsView);
  if (ui.sessionsVenue) list = list.filter((s) => s.venueId === ui.sessionsVenue);
  if (ui.sessionsKind) list = list.filter((s) => s.kind === ui.sessionsKind);
  const asc = ui.sessionsView === 'planned';
  list.sort((a, b) => {
    if (a.date !== b.date) return (a.date < b.date ? -1 : 1) * (asc ? 1 : -1);
    return ((a.startTime ?? '') < (b.startTime ?? '') ? -1 : 1) * (asc ? 1 : -1);
  });

  // 월별 묶음 (완료·전체)
  let body = '';
  if (!list.length) {
    body = `<div class="empty"><p>${ui.sessionsView === 'planned' ? '예정된 대회가 없어요' : '기록한 대회가 없어요'}</p><p class="muted">＋ 버튼으로 대회를 추가하세요. 날짜가 지난 대회는 바로 결과까지 입력할 수 있어요.</p></div>`;
  } else if (ui.sessionsView === 'planned') {
    body = `<div class="session-list">${list.map(sessionCard).join('')}</div>`;
  } else {
    const groups = [];
    for (const s of list) {
      const k = monthKey(s.date);
      const g = groups[groups.length - 1];
      if (g && g.key === k) g.items.push(s); else groups.push({ key: k, items: [s] });
    }
    body = groups.map((g) => {
      const profit = g.items.filter((s) => s.status === 'done').reduce((a, s) => a + sessionMoney(s).profit, 0);
      return `<section class="month-group">
        <h3 class="month-head"><span>${g.key}</span><span>${profitHtml(profit)}</span></h3>
        <div class="session-list">${g.items.map(sessionCard).join('')}</div>
      </section>`;
    }).join('');
  }

  const venues = activeVenues();
  root.innerHTML = `
    <header class="page-head"><h1>대회</h1></header>
    ${segmented('sv', [
    { value: 'planned', label: '예정', count: counts.planned },
    { value: 'done', label: '완료', count: counts.done },
    { value: 'all', label: '전체', count: counts.all },
  ], ui.sessionsView)}
    <div class="filter-row no-swipe">
      ${Object.entries(KIND).map(([k, v]) => `<button type="button" class="chip small ${ui.sessionsKind === k ? 'on' : ''}" aria-pressed="${ui.sessionsKind === k}" data-fkind="${k}">${v}</button>`).join('')}
      <span class="filter-sep"></span>
      ${venues.map((v) => `<button type="button" class="chip small ${ui.sessionsVenue === v.id ? 'on' : ''}" aria-pressed="${ui.sessionsVenue === v.id}" data-fvenue="${esc(v.id)}">${esc(v.name)}</button>`).join('')}
    </div>
    ${body}`;

  root.querySelectorAll('[data-sv]').forEach((b) => b.addEventListener('click', () => { ui.sessionsView = b.dataset.sv; renderSessions(root); }));
  root.querySelectorAll('[data-fkind]').forEach((b) => b.addEventListener('click', () => {
    ui.sessionsKind = ui.sessionsKind === b.dataset.fkind ? null : b.dataset.fkind;
    const x = root.querySelector('.filter-row').scrollLeft; renderSessions(root); root.querySelector('.filter-row').scrollLeft = x;
  }));
  root.querySelectorAll('[data-fvenue]').forEach((b) => b.addEventListener('click', () => {
    ui.sessionsVenue = ui.sessionsVenue === b.dataset.fvenue ? null : b.dataset.fvenue;
    const x = root.querySelector('.filter-row').scrollLeft; renderSessions(root); root.querySelector('.filter-row').scrollLeft = x;
  }));
  root.querySelectorAll('[data-session]').forEach((b) => b.addEventListener('click', async () => {
    const s = sessionById(b.dataset.session);
    if (s.status === 'planned' && s.date < todayStr()) (await import('./session-form.js')).openSessionForm(s.id, { status: 'done', focusResult: true });
    else (await import('./session-detail.js')).openSessionDetail(s.id);
  }));
}

/** 같은 대회를 새 예정으로 등록 (정기 새틀라이트 등) — 저장은 폼에서 */
export async function openSessionCopy(id) {
  const { openSessionForm } = await import('./session-form.js');
  openSessionForm(null, { prefill: sessionById(id), status: 'planned' });
}
