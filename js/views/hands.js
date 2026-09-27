// 핸드 탭
import { data, ui, sessionById } from '../store.js';
import { esc, dateLabel } from '../utils.js';
import { cardsText } from '../cards.js';
import { segmented, handCard } from './common.js';
import { icon, ICONS } from '../ui.js';

export function renderHands(root) {
  const q = ui.handsQuery.trim().toLowerCase();
  const todo = data.hands.filter((h) => h.review === 'todo').length;
  let list = data.hands.filter((h) => ui.handsView === 'all' || h.review === 'todo');
  if (ui.handsTag) list = list.filter((h) => h.tags.includes(ui.handsTag));
  if (q) {
    list = list.filter((h) => [h.notes, h.result, h.level, h.position, cardsText(h.hero), cardsText(h.board), sessionById(h.sessionId)?.name]
      .filter(Boolean).join(' ').toLowerCase().includes(q));
  }
  list.sort((a, b) => (a.date === b.date ? b.createdAt - a.createdAt : a.date < b.date ? 1 : -1));
  const usedTags = [...new Set(data.hands.flatMap((h) => h.tags))];
  const label = (h) => { const s = sessionById(h.sessionId); return s ? `${dateLabel(s.date, { short: true })} ${s.name}` : dateLabel(h.date, { short: true }); };

  root.innerHTML = `
    <header class="page-head"><h1>핸드</h1></header>
    ${segmented('hv', [{ value: 'todo', label: '복기 필요', count: todo }, { value: 'all', label: '전체', count: data.hands.length }], ui.handsView)}
    <div class="search-bar">
      <span class="search-ic">${icon(ICONS.search)}</span>
      <input id="h-search" class="field" type="search" placeholder="메모·카드(예: AsKd)·대회명 검색" value="${esc(ui.handsQuery)}" autocomplete="off">
    </div>
    ${usedTags.length ? `<div class="filter-row no-swipe">${usedTags.map((t) => `<button type="button" class="chip small ${ui.handsTag === t ? 'on' : ''}" aria-pressed="${ui.handsTag === t}" data-htag="${esc(t)}">#${esc(t)}</button>`).join('')}</div>` : ''}
    ${list.length ? `<div class="hand-list">${list.map((h) => handCard(h, { sessionLabel: label(h) })).join('')}</div>` : `
      <div class="empty">
        <p>${data.hands.length ? (ui.handsView === 'todo' && !q && !ui.handsTag ? '복기할 핸드가 없어요' : '조건에 맞는 핸드가 없어요') : '아직 핸드 메모가 없어요'}</p>
        <p class="muted">대회 중 기억나는 핸드를 카드 2장과 한 줄 메모로 빠르게 남겨 두고, 나중에 여기서 복기하세요.</p>
      </div>`}`;

  root.querySelectorAll('[data-hv]').forEach((b) => b.addEventListener('click', () => { ui.handsView = b.dataset.hv; renderHands(root); }));
  root.querySelectorAll('[data-htag]').forEach((b) => b.addEventListener('click', () => { ui.handsTag = ui.handsTag === b.dataset.htag ? null : b.dataset.htag; renderHands(root); }));
  const s = root.querySelector('#h-search');
  s.addEventListener('input', () => {
    ui.handsQuery = s.value;
    const pos = s.selectionStart;
    renderHands(root);
    const s2 = root.querySelector('#h-search'); s2.focus(); s2.setSelectionRange(pos, pos);
  });
  root.querySelectorAll('[data-hand]').forEach((b) => b.addEventListener('click', async () => (await import('./hand-form.js')).openHandForm(b.dataset.hand)));
}
