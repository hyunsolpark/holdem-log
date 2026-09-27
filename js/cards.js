// 카드 표기('As', 'Td')와 카드 선택기
import { esc } from './utils.js';

export const RANKS = ['A', 'K', 'Q', 'J', 'T', '9', '8', '7', '6', '5', '4', '3', '2'];
export const SUITS = ['s', 'h', 'd', 'c'];
const SUIT_SYMBOL = { s: '♠', h: '♥', d: '♦', c: '♣' };
const SUIT_NAME = { s: '스페이드', h: '하트', d: '다이아', c: '클럽' };
const RANK_LABEL = { T: '10' };

export const isCard = (c) => typeof c === 'string' && c.length === 2 && RANKS.includes(c[0]) && SUITS.includes(c[1]);

export function cardHtml(c, { size = '' } = {}) {
  if (!isCard(c)) return `<span class="pcard blank ${size}" aria-hidden="true"></span>`;
  const r = RANK_LABEL[c[0]] ?? c[0];
  return `<span class="pcard ${size} suit-${c[1]}" aria-label="${SUIT_NAME[c[1]]} ${r}"><b>${r}</b><i>${SUIT_SYMBOL[c[1]]}</i></span>`;
}

export function cardsHtml(list, opts) {
  return `<span class="pcards">${(list ?? []).map((c) => cardHtml(c, opts)).join('')}</span>`;
}

/** 'AsKd' 같은 텍스트 표기 (검색·CSV용) */
export const cardsText = (list) => (list ?? []).filter(isCard).join('');

/**
 * 카드 선택기
 * state: { hero: [c,c], board: [c,c,c,c,c] } (빈 칸은 null)
 * 슬롯을 누르면 그 칸이 선택되고, 그리드에서 카드를 누르면 채운 뒤 다음 빈 칸으로 이동한다.
 */
export function mountCardPicker(root, state, onChange) {
  const slots = [
    ...[0, 1].map((i) => ({ group: 'hero', i })),
    ...[0, 1, 2, 3, 4].map((i) => ({ group: 'board', i })),
  ];
  let active = slots.findIndex((s) => !state[s.group][s.i]);
  if (active < 0) active = 0;

  const used = () => new Set([...state.hero, ...state.board].filter(Boolean));

  function render() {
    const u = used();
    const slotBtn = (s, idx) => {
      const c = state[s.group][s.i];
      return `<button type="button" class="slot ${idx === active ? 'active' : ''}" data-slot="${idx}" aria-label="${s.group === 'hero' ? `내 핸드 ${s.i + 1}` : ['플랍 1', '플랍 2', '플랍 3', '턴', '리버'][s.i]}${c ? '' : ' 비어 있음'}">${cardHtml(c)}</button>`;
    };
    root.innerHTML = `
      <div class="picker-slots">
        <div class="slot-group"><span class="slot-label">내 핸드</span>${slots.slice(0, 2).map((s, i) => slotBtn(s, i)).join('')}</div>
        <div class="slot-group"><span class="slot-label">보드</span>
          <span class="slot-sub">${slots.slice(2, 5).map((s, i) => slotBtn(s, i + 2)).join('')}</span>
          <span class="slot-sub">${slotBtn(slots[5], 5)}</span>
          <span class="slot-sub">${slotBtn(slots[6], 6)}</span>
        </div>
      </div>
      <div class="picker-grid" role="grid" aria-label="카드 선택">
        ${SUITS.map((su) => `<div class="pg-row" role="row">${RANKS.map((r) => {
    const c = r + su;
    const taken = u.has(c) && state[slots[active].group][slots[active].i] !== c;
    return `<button type="button" role="gridcell" class="pg-cell suit-${su}" data-card="${c}" ${taken ? 'disabled' : ''} aria-label="${SUIT_NAME[su]} ${RANK_LABEL[r] ?? r}">${RANK_LABEL[r] ?? r}<i>${SUIT_SYMBOL[su]}</i></button>`;
  }).join('')}</div>`).join('')}
      </div>
      <div class="picker-actions">
        <button type="button" class="link-btn" data-clear>이 칸 지우기</button>
        <button type="button" class="link-btn" data-clear-board>보드 전체 지우기</button>
      </div>`;
    root.querySelectorAll('[data-slot]').forEach((b) => b.addEventListener('click', () => { active = Number(b.dataset.slot); render(); }));
    root.querySelectorAll('[data-card]').forEach((b) => b.addEventListener('click', () => {
      const s = slots[active];
      state[s.group][s.i] = b.dataset.card;
      // 다음 빈 칸으로 (없으면 그대로)
      const next = slots.findIndex((x, idx) => idx > active && !state[x.group][x.i]);
      if (next >= 0) active = next;
      render();
      onChange?.(state);
    }));
    root.querySelector('[data-clear]').addEventListener('click', () => {
      const s = slots[active];
      state[s.group][s.i] = null;
      render();
      onChange?.(state);
    });
    root.querySelector('[data-clear-board]').addEventListener('click', () => {
      state.board = [null, null, null, null, null];
      active = 2;
      render();
      onChange?.(state);
    });
  }
  render();
}

/** 저장용: 빈 칸 제거. 보드는 앞에서부터 연속된 카드만 */
export function normalize(state) {
  const hero = state.hero.filter(Boolean);
  const board = [];
  for (const c of state.board) { if (!c) break; board.push(c); }
  return { hero, board };
}

export { esc };
