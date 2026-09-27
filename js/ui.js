// 오버레이(뒤로가기 연동), 시트, 대화상자, 토스트, 입력 보조
import { esc, formatTyping, parseNum } from './utils.js';
import { renderMarkdown } from './markdown.js';

/* ---------- 오버레이 스택 + 안드로이드 뒤로가기 ----------
 * 오버레이를 열 때 history 항목을 하나 넣고, popstate가 오면 맨 위를 닫는다.
 * UI에서 닫을 때도 history.back()을 거치므로 연속으로 닫아도 순서가 꼬이지 않는다.
 * isDirty가 true를 돌려주면 닫기 전에 "버릴까요?"를 묻는다.
 */
const stack = [];

export function pushOverlay(onClose, { isDirty } = {}) {
  const entry = { onClose, isDirty, force: false };
  stack.push(entry);
  history.pushState({ overlay: stack.length }, '');
  return entry;
}

export function closeTopOverlay({ force = false } = {}) {
  if (!stack.length) return;
  if (force) stack[stack.length - 1].force = true;
  history.back();
}

window.addEventListener('popstate', () => {
  const entry = stack.pop();
  if (!entry) return;
  if (!entry.force && entry.isDirty?.()) {
    // 닫지 않고 되돌린 뒤 확인
    stack.push(entry);
    history.pushState({ overlay: stack.length }, '');
    confirmDialog({ title: '작성 중인 내용을 버릴까요?', message: '저장하지 않은 내용은 사라져요.', confirmText: '버리기', danger: true })
      .then((ok) => { if (ok) closeTopOverlay({ force: true }); });
    return;
  }
  entry.onClose();
});

export const overlayDepth = () => stack.length;

/* ---------- 토스트 ---------- */
let toastTimer;
export function toast(message, { action, onAction, duration = 2400 } = {}) {
  const el = document.getElementById('toast');
  const hide = () => el.classList.remove('show');
  el.innerHTML = `<span>${esc(message)}</span>${action ? `<button type="button">${esc(action)}</button>` : ''}`;
  if (action) el.querySelector('button').addEventListener('click', () => { hide(); onAction?.(); });
  el.classList.add('show');
  clearTimeout(toastTimer);
  if (duration > 0) toastTimer = setTimeout(hide, action ? Math.max(duration, 4500) : duration);
}

/* ---------- 대화상자 ---------- */
export function dialog({ title, message = '', html = '', buttons, input, onOpen } = {}) {
  return new Promise((resolve) => {
    const root = document.getElementById('overlay-root');
    const wrap = document.createElement('div');
    wrap.className = 'dialog-backdrop';
    wrap.innerHTML = `
      <div class="dialog" role="dialog" aria-modal="true" aria-labelledby="dlg-title">
        <h2 id="dlg-title">${esc(title)}</h2>
        ${message ? `<p class="dialog-msg">${esc(message)}</p>` : ''}
        ${html}
        ${input ? `<input class="field" type="text" value="${esc(input.value ?? '')}" placeholder="${esc(input.placeholder ?? '')}" maxlength="${input.maxlength ?? 30}">` : ''}
        <div class="dialog-actions ${buttons.length > 2 ? 'stack' : ''}">
          ${buttons.map((b, i) => `<button type="button" class="btn ${b.kind ?? 'ghost'}" data-i="${i}">${esc(b.label)}</button>`).join('')}
        </div>
      </div>`;
    root.appendChild(wrap);
    requestAnimationFrame(() => wrap.classList.add('open'));

    let result = { button: null, value: null, choice: null };
    const inputEl = wrap.querySelector('input.field');
    if (inputEl) {
      setTimeout(() => { inputEl.focus(); inputEl.select(); }, 50);
      inputEl.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') wrap.querySelector('.btn.primary, .btn.danger')?.click();
      });
    }
    onOpen?.(wrap);
    pushOverlay(() => {
      wrap.classList.remove('open');
      setTimeout(() => wrap.remove(), 180);
      resolve(result);
    });
    wrap.addEventListener('click', (e) => {
      const btn = e.target.closest('button[data-i]');
      if (btn) {
        result = {
          button: buttons[Number(btn.dataset.i)].value,
          value: inputEl ? inputEl.value.trim() : null,
          choice: wrap.querySelector('input[type="radio"]:checked')?.value ?? null,
          checked: [...wrap.querySelectorAll('input[type="checkbox"]')].map((c) => c.checked),
          fields: Object.fromEntries([...wrap.querySelectorAll('input[id], select[id], textarea[id]')].map((el) => [el.id, el.value])),
        };
        closeTopOverlay({ force: true });
      } else if (e.target === wrap) {
        closeTopOverlay({ force: true });
      }
    });
  });
}

export async function confirmDialog({ title, message, confirmText = '확인', danger = false }) {
  const r = await dialog({
    title, message,
    buttons: [{ label: '취소', value: false }, { label: confirmText, value: true, kind: danger ? 'danger' : 'primary' }],
  });
  return r.button === true;
}

export async function promptDialog({ title, value = '', placeholder = '', confirmText = '저장' }) {
  const r = await dialog({
    title, input: { value, placeholder },
    buttons: [{ label: '취소', value: false }, { label: confirmText, value: true, kind: 'primary' }],
  });
  return r.button === true ? r.value : null;
}

export const alertDialog = (title, message) => dialog({ title, message, buttons: [{ label: '확인', value: true, kind: 'primary' }] });

/* ---------- 전체 화면 시트 ----------
 * openSheet({ title, className, headerRight, render(body), footer, isDirty, onClose })
 * render: 본문을 그리는 함수. 반환된 객체의 close()로 닫는다.
 */
export function openSheet({ title, className = '', headerRight = '', isDirty, onClose, page = false }) {
  const root = document.getElementById('overlay-root');
  const el = document.createElement('div');
  el.className = `sheet ${page ? 'page' : ''} ${className}`;
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-modal', 'true');
  el.setAttribute('aria-label', title);
  el.innerHTML = `
    <header class="sheet-head">
      <button type="button" class="icon-btn" data-sheet-close aria-label="${page ? '뒤로' : '닫기'}">
        ${page
    ? '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 18l-6-6 6-6"/></svg>'
    : '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 6L6 18M6 6l12 12"/></svg>'}
      </button>
      <h2 class="sheet-title">${esc(title)}</h2>
      <div class="sheet-head-right">${headerRight || '<span class="icon-btn-spacer"></span>'}</div>
    </header>
    <div class="sheet-body"></div>
    <footer class="sheet-foot" hidden></footer>`;
  root.appendChild(el);
  el.querySelector('[data-sheet-close]').addEventListener('click', () => closeTopOverlay());

  const api = {
    el,
    body: el.querySelector('.sheet-body'),
    foot: el.querySelector('.sheet-foot'),
    setTitle: (t) => { el.querySelector('.sheet-title').textContent = t; },
    close: (opts = { force: true }) => closeTopOverlay(opts),
  };
  pushOverlay(() => {
    el.classList.remove('open');
    setTimeout(() => el.remove(), 220);
    onClose?.();
  }, { isDirty });
  requestAnimationFrame(() => el.classList.add('open'));
  return api;
}

/* ---------- 입력 보조 ---------- */

/** textarea 높이 자동 조절 */
export function autosize(ta) {
  const fit = () => { ta.style.height = 'auto'; ta.style.height = `${ta.scrollHeight + 2}px`; };
  ta.addEventListener('input', fit);
  requestAnimationFrame(fit);
}

/** 마크다운 입력 필드 HTML */
export function mdField({ id, label, value = '', placeholder = '', rows = 4 }) {
  return `
    <div class="md-field" data-md="${id}">
      <div class="md-head">
        <label class="field-label" for="${id}">${esc(label)}</label>
        <div class="md-tabs" role="tablist">
          <button type="button" role="tab" class="on" data-mdtab="write" aria-selected="true">작성</button>
          <button type="button" role="tab" data-mdtab="preview" aria-selected="false">미리보기</button>
        </div>
      </div>
      <textarea id="${id}" class="field md-input" rows="${rows}" placeholder="${esc(placeholder)}">${esc(value)}</textarea>
      <div class="md-preview markdown" hidden></div>
    </div>`;
}

export function bindMdFields(root) {
  root.querySelectorAll('.md-field').forEach((f) => {
    const ta = f.querySelector('textarea');
    const pv = f.querySelector('.md-preview');
    autosize(ta);
    f.querySelectorAll('[data-mdtab]').forEach((b) => b.addEventListener('click', () => {
      const preview = b.dataset.mdtab === 'preview';
      f.querySelectorAll('[data-mdtab]').forEach((x) => {
        const on = x === b;
        x.classList.toggle('on', on);
        x.setAttribute('aria-selected', String(on));
      });
      if (preview) pv.innerHTML = ta.value.trim() ? renderMarkdown(ta.value) : '<p class="muted">내용이 없어요</p>';
      pv.hidden = !preview;
      ta.hidden = preview;
    }));
  });
}

/** 숫자 입력칸: 입력 중 천 단위 콤마. getValue()로 숫자(null=빈 값, NaN=잘못된 값) */
export function bindNumber(input, { decimals = 6 } = {}) {
  const apply = () => {
    const before = input.value;
    const after = formatTyping(before, input.dataset.decimals != null ? Number(input.dataset.decimals) : decimals);
    if (before !== after) {
      input.value = after;
      input.setSelectionRange(after.length, after.length);
    }
  };
  input.addEventListener('input', apply);
  return { get: () => parseNum(input.value) };
}

/** 칩 단일 선택 그룹 */
export function bindChoice(root, selector, onChange) {
  const items = root.querySelectorAll(selector);
  items.forEach((b) => b.addEventListener('click', () => {
    items.forEach((x) => {
      const on = x === b;
      x.classList.toggle('on', on);
      x.setAttribute('aria-checked', String(on));
    });
    onChange(b.dataset.value, b);
  }));
}

export const icon = (paths, cls = '') => `<svg class="ic ${cls}" viewBox="0 0 24 24" aria-hidden="true">${paths}</svg>`;
export const ICONS = {
  plus: '<path d="M12 5v14M5 12h14"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/>',
  more: '<circle cx="12" cy="5" r="1.2"/><circle cx="12" cy="12" r="1.2"/><circle cx="12" cy="19" r="1.2"/>',
  check: '<path d="M4 12l5 5L20 6"/>',
  cal: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
  review: '<path d="M9 11l3 3 8-8"/><path d="M20 12v7a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h9"/>',
  trade: '<path d="M7 17L17 7M17 7H9M17 7v8"/>',
  note: '<path d="M4 4h16v12H8l-4 4z"/>',
  edit: '<path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>',
  del: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3"/>',
  up: '<path d="M18 15l-6-6-6 6"/>',
  down: '<path d="M6 9l6 6 6-6"/>',
  history: '<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5M12 7v5l3 2"/>',
  export: '<path d="M12 3v12M7 8l5-5 5 5M5 21h14"/>',
  status: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 3"/>',
  alert: '<circle cx="12" cy="12" r="9"/><path d="M12 7.5v5M12 16v.5"/>',
  x: '<path d="M18 6L6 18M6 6l12 12"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
  ticket: '<path d="M3 8a2 2 0 0 0 2-2h14a2 2 0 0 0 2 2v2a2 2 0 0 0 0 4v2a2 2 0 0 0-2 2H5a2 2 0 0 0-2-2v-2a2 2 0 0 0 0-4z"/><path d="M14 6v12" stroke-dasharray="2 2"/>',
  cash: '<rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="2.5"/><path d="M6 12h.01M18 12h.01"/>',
  chevron: '<path d="M9 18l6-6-6-6"/>',
  trophy: '<path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0z"/><path d="M17 5h3v2a3 3 0 0 1-3 3M7 5H4v2a3 3 0 0 0 3 3"/>',
};
