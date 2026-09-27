// 핸드 메모 추가·편집
import { data, sessionById, saveHand, deleteHand, actions } from '../store.js';
import { openSheet, bindNumber, mdField, bindMdFields, confirmDialog, promptDialog, toast, icon, ICONS } from '../ui.js';
import { esc, uuid, todayStr, isValidDateStr, POSITIONS, dateLabel } from '../utils.js';
import { mountCardPicker, normalize } from '../cards.js';

export function openHandForm(id = null, { sessionId = null } = {}) {
  const orig = id ? data.hands.find((h) => h.id === id) : null;
  const sess = sessionById(orig?.sessionId ?? sessionId);
  const f = {
    sessionId: orig?.sessionId ?? sessionId ?? null,
    date: orig?.date ?? sess?.date ?? todayStr(),
    cards: {
      hero: [orig?.hero?.[0] ?? null, orig?.hero?.[1] ?? null],
      board: [0, 1, 2, 3, 4].map((i) => orig?.board?.[i] ?? null),
    },
    position: orig?.position ?? null,
    stackBb: orig?.stackBb ?? null,
    level: orig?.level ?? '',
    playersLeft: orig?.playersLeft ?? null,
    notes: orig?.notes ?? '',
    result: orig?.result ?? '',
    tags: [...(orig?.tags ?? [])],
    review: orig?.review ?? 'todo',
  };
  let initial = '';
  let nums = {};
  let more = !!orig; // 새 핸드는 빠른 입력(카드 + 메모)부터

  const sheet = openSheet({
    title: orig ? '핸드 메모' : '핸드 추가',
    headerRight: orig ? `<button type="button" class="icon-btn danger-text" data-del aria-label="삭제">${icon(ICONS.del)}</button>` : '',
    isDirty: () => snap() !== initial,
  });

  function read() {
    const b = sheet.body;
    if (!b.querySelector('#h-notes')) return;
    f.notes = b.querySelector('#h-notes').value;
    if (b.querySelector('#h-date')) {
      f.date = b.querySelector('#h-date').value;
      f.stackBb = nums.stack.get();
      f.playersLeft = nums.left.get();
      f.level = b.querySelector('#h-level').value.trim();
      f.result = b.querySelector('#h-result').value.trim();
      f.sessionId = b.querySelector('#h-session').value || null;
    }
  }
  const snap = () => { read(); return JSON.stringify(f); };

  function sessionOptions() {
    const list = [...data.sessions].filter((s) => s.status !== 'skipped')
      .sort((a, b) => (a.date === b.date ? 0 : a.date < b.date ? 1 : -1)).slice(0, 40);
    if (f.sessionId && !list.some((s) => s.id === f.sessionId) && sessionById(f.sessionId)) list.unshift(sessionById(f.sessionId));
    return `<option value="">연결 안 함</option>${list.map((s) => `<option value="${esc(s.id)}" ${s.id === f.sessionId ? 'selected' : ''}>${dateLabel(s.date, { short: true })} ${esc(s.name)}</option>`).join('')}`;
  }

  function render() {
    const b = sheet.body;
    const allTags = [...new Set([...data.settings.handTags, ...f.tags])];
    b.innerHTML = `
      ${sess && !more ? `<p class="muted small-line">${esc(sess.name)} · ${dateLabel(sess.date, { short: true })}</p>` : ''}
      <div id="picker" class="picker"></div>

      <div class="field-label">포지션</div>
      <div class="chip-row pos-row">
        ${POSITIONS.map((p) => `<button type="button" class="chip small ${f.position === p ? 'on' : ''}" aria-pressed="${f.position === p}" data-pos="${p}">${p}</button>`).join('')}
      </div>

      ${mdField({ id: 'h-notes', label: '액션·생각', value: f.notes, placeholder: '예: UTG 2.2x 오픈, 나 BTN 3벳 → 콜. 플랍에서 체크-레이즈 당함… 폴드가 맞았나?', rows: 3 })}

      <div class="field-label">태그</div>
      <div class="chip-row">
        ${allTags.map((t) => `<button type="button" class="chip small ${f.tags.includes(t) ? 'on' : ''}" aria-pressed="${f.tags.includes(t)}" data-tag="${esc(t)}">#${esc(t)}</button>`).join('')}
        <button type="button" class="chip small ghost-chip" id="tag-new">＋</button>
      </div>

      <div class="field-label">복기</div>
      <div class="segmented small" role="radiogroup">
        <button type="button" role="radio" data-review="todo" class="${f.review === 'todo' ? 'on' : ''}" aria-checked="${f.review === 'todo'}">복기 필요</button>
        <button type="button" role="radio" data-review="done" class="${f.review === 'done' ? 'on' : ''}" aria-checked="${f.review === 'done'}">복기 완료</button>
      </div>

      ${more ? `
        <div class="row-3">
          <div><label class="field-label" for="h-stack">스택</label><div class="unit-input"><input id="h-stack" class="field" type="text" inputmode="decimal" data-decimals="1" value="${f.stackBb ?? ''}" placeholder="-"><span>bb</span></div></div>
          <div><label class="field-label" for="h-left">남은 인원</label><div class="unit-input"><input id="h-left" class="field" type="text" inputmode="numeric" data-decimals="0" value="${f.playersLeft ?? ''}" placeholder="-"><span>명</span></div></div>
          <div><label class="field-label" for="h-date">날짜</label><input id="h-date" class="field" type="date" value="${esc(f.date)}"></div>
        </div>
        <label class="field-label" for="h-level">블라인드 레벨</label>
        <input id="h-level" class="field" type="text" maxlength="40" value="${esc(f.level)}" placeholder="예: 1000/2000/2000">
        <label class="field-label" for="h-result">결과</label>
        <input id="h-result" class="field" type="text" maxlength="60" value="${esc(f.result)}" placeholder="예: +18bb, 탈락, 더블업">
        <label class="field-label" for="h-session">대회</label>
        <select id="h-session" class="field">${sessionOptions()}</select>`
    : '<button type="button" class="more-btn" id="h-more">스택 · 레벨 · 결과 · 대회 연결 <span aria-hidden="true">▾</span></button>'}
      <p class="form-hint" aria-live="polite"></p>`;
    sheet.foot.hidden = false;
    sheet.foot.innerHTML = '<button type="button" class="btn primary block big" id="h-save">저장</button>';
    bind();
  }

  function bind() {
    const b = sheet.body;
    mountCardPicker(b.querySelector('#picker'), f.cards);
    bindMdFields(b);
    if (b.querySelector('#h-stack')) nums = { stack: bindNumber(b.querySelector('#h-stack')), left: bindNumber(b.querySelector('#h-left')) };
    b.querySelectorAll('[data-pos]').forEach((el) => el.addEventListener('click', () => {
      f.position = f.position === el.dataset.pos ? null : el.dataset.pos;
      b.querySelectorAll('[data-pos]').forEach((x) => { const on = x.dataset.pos === f.position; x.classList.toggle('on', on); x.setAttribute('aria-pressed', String(on)); });
    }));
    b.querySelectorAll('[data-tag]').forEach((el) => el.addEventListener('click', () => {
      const t = el.dataset.tag;
      f.tags = f.tags.includes(t) ? f.tags.filter((x) => x !== t) : [...f.tags, t];
      el.classList.toggle('on'); el.setAttribute('aria-pressed', String(f.tags.includes(t)));
    }));
    b.querySelector('#tag-new').addEventListener('click', async () => {
      read();
      const t = (await promptDialog({ title: '새 태그', placeholder: '예: 스퀴즈', confirmText: '추가' }))?.replace(/^#/, '').trim();
      if (!t) return;
      if (!f.tags.includes(t)) f.tags.push(t);
      render();
    });
    b.querySelectorAll('[data-review]').forEach((el) => el.addEventListener('click', () => {
      f.review = el.dataset.review;
      b.querySelectorAll('[data-review]').forEach((x) => { const on = x === el; x.classList.toggle('on', on); x.setAttribute('aria-checked', String(on)); });
    }));
    b.querySelector('#h-more')?.addEventListener('click', () => { read(); more = true; render(); });
    sheet.foot.querySelector('#h-save').addEventListener('click', save);
  }

  async function save() {
    read();
    const hint = sheet.body.querySelector('.form-hint');
    const { hero, board } = normalize(f.cards);
    if (hero.length === 1) { hint.textContent = '내 핸드는 2장을 모두 골라 주세요'; return; }
    if (!hero.length && !f.notes.trim()) { hint.textContent = '카드나 메모 중 하나는 입력해 주세요'; return; }
    if (!isValidDateStr(f.date)) { hint.textContent = '날짜를 확인해 주세요'; return; }
    if ([f.stackBb, f.playersLeft].some((v) => Number.isNaN(v))) { hint.textContent = '숫자를 확인해 주세요'; return; }
    await saveHand({
      id: orig?.id ?? uuid(), sessionId: f.sessionId, date: f.date, hero, board,
      position: f.position, stackBb: f.stackBb ?? null, level: f.level, playersLeft: f.playersLeft ?? null,
      notes: f.notes.trim(), result: f.result, tags: f.tags, review: f.review, createdAt: orig?.createdAt,
    });
    sheet.close();
    toast(orig ? '저장했어요' : '핸드를 저장했어요');
    actions.refresh();
  }

  sheet.el.querySelector('[data-del]')?.addEventListener('click', async () => {
    if (!await confirmDialog({ title: '이 핸드 메모를 삭제할까요?', confirmText: '삭제', danger: true })) return;
    await deleteHand(id);
    sheet.close();
    toast('삭제했어요');
    actions.refresh();
  });

  render();
  initial = snap();
}
