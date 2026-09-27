// 설정 페이지 (홈 오른쪽 위), 입출금 기록
import {
  data, actions, loadAll, setSetting, saveLedger, deleteLedger, activeVenues, addVenue, updateVenue, reorderVenues,
  renameHandTag, deleteHandTag,
} from '../store.js';
import { importData } from '../db.js';
import { bankroll } from '../money.js';
import { exportJSON, exportSessionsCSV, parseBackup } from '../export.js';
import {
  openSheet, dialog, confirmDialog, promptDialog, alertDialog, toast, bindNumber, icon, ICONS,
} from '../ui.js';
import { esc, won, num, uuid, todayStr, isValidDateStr, dateLabel, parseNum } from '../utils.js';
import { APP_VERSION } from '../version.js';
import { segmented } from './common.js';

let settingsSheet = null;
export const refreshSettings = () => settingsSheet?.render();

export function openSettings() {
  const sheet = openSheet({ title: '설정', page: true, onClose: () => { settingsSheet = null; } });
  settingsSheet = { render };
  async function render() {
    let persisted = null, usage = null;
    try { persisted = await navigator.storage?.persisted?.(); } catch { /* */ }
    try { usage = (await navigator.storage?.estimate?.())?.usage ?? null; } catch { /* */ }
    const venues = activeVenues();
    const br = bankroll();
    sheet.body.innerHTML = `
      <section class="card settings-sec">
        <h2 class="card-title">뱅크롤</h2>
        <div class="kv"><span>시작 금액</span><b>${won(data.settings.startingBankroll || 0)}</b></div>
        <div class="kv"><span>시작일</span><b>${data.settings.bankrollStartDate ? dateLabel(data.settings.bankrollStartDate) : '처음부터'}</b></div>
        <p class="help">시작일을 정하면 그 이전 대회·입출금은 뱅크롤 계산에서 빠져요 (통계에는 남아요).</p>
        <div class="btn-row"><button type="button" class="btn ghost" data-act="start">시작 금액·날짜 변경</button><button type="button" class="btn ghost" data-act="ledger">${icon(ICONS.cash)}입출금 기록</button></div>
        <div class="kv muted"><span>현금 뱅크롤</span><b>${won(br.cash)}</b></div>
      </section>

      <section class="card settings-sec">
        <h2 class="card-title">플랫폼·장소</h2>
        <ul class="manage-list">
          ${venues.map((v, i) => `<li class="manage-row" data-id="${esc(v.id)}">
            <span class="manage-name">${esc(v.name)} <span class="muted small">${v.type === 'online' ? '온라인' : '오프라인'}</span></span>
            <button type="button" class="icon-btn sm" data-op="up" aria-label="위로" ${i === 0 ? 'disabled' : ''}>${icon(ICONS.up)}</button>
            <button type="button" class="icon-btn sm" data-op="down" aria-label="아래로" ${i === venues.length - 1 ? 'disabled' : ''}>${icon(ICONS.down)}</button>
            <button type="button" class="icon-btn sm" data-op="rename" aria-label="이름 변경">${icon(ICONS.edit)}</button>
            <button type="button" class="icon-btn sm danger-text" data-op="delete" aria-label="삭제">${icon(ICONS.del)}</button>
          </li>`).join('')}
        </ul>
        <button type="button" class="btn ghost block" data-act="venue-add">＋ 추가</button>
      </section>

      <section class="card settings-sec">
        <h2 class="card-title">핸드 태그</h2>
        <div class="chip-row">${data.settings.handTags.map((t) => `<button type="button" class="chip small" data-htag="${esc(t)}">#${esc(t)}</button>`).join('')}</div>
        <p class="help">태그를 누르면 이름을 바꾸거나 지울 수 있어요. 새 태그는 핸드를 입력할 때 추가돼요.</p>
      </section>

      <section class="card settings-sec">
        <h2 class="card-title">백업</h2>
        <p class="help">데이터는 이 기기의 브라우저에만 저장돼요. 크롬 사이트 데이터를 지우거나 앱을 삭제하면 함께 지워지니 가끔 백업해 두세요. 대회 ${data.sessions.length}건 · 티켓 ${data.tickets.length}장 · 핸드 ${data.hands.length}개.</p>
        <div class="btn-stack">
          <button type="button" class="btn primary block" data-act="export">JSON으로 백업하기</button>
          <button type="button" class="btn ghost block" data-act="import">JSON 백업 가져오기</button>
          <button type="button" class="btn ghost block" data-act="csv">대회 기록 CSV (엑셀용)</button>
        </div>
        <input type="file" id="import-file" accept=".json,application/json" hidden>
      </section>

      <section class="card settings-sec">
        <h2 class="card-title">정보</h2>
        <dl class="info-list">
          <div><dt>버전</dt><dd>${APP_VERSION}</dd></div>
          <div><dt>저장공간 보호</dt><dd>${persisted === true ? '켜짐' : persisted === false ? '꺼짐 (설치하면 보통 켜져요)' : '확인 불가'}</dd></div>
          ${usage != null ? `<div><dt>사용 중</dt><dd>${(usage / 1024 / 1024).toFixed(1)} MB</dd></div>` : ''}
        </dl>
      </section>`;
    bind();
  }

  function bind() {
    const b = sheet.body;
    const on = (a, fn) => b.querySelector(`[data-act="${a}"]`)?.addEventListener('click', fn);
    on('start', editStart);
    on('ledger', openLedger);
    on('venue-add', async () => {
      const r = await dialog({
        title: '플랫폼·장소 추가', input: { placeholder: '이름', maxlength: 30 },
        html: `<div class="chip-row radio-row">
          <label class="mode-opt compact"><input type="radio" name="vt" value="offline" checked><span><b>오프라인</b></span></label>
          <label class="mode-opt compact"><input type="radio" name="vt" value="online"><span><b>온라인</b></span></label></div>`,
        buttons: [{ label: '취소', value: false }, { label: '추가', value: true, kind: 'primary' }],
      });
      if (!r.button || !r.value) return;
      if (activeVenues().some((v) => v.name === r.value)) { toast('같은 이름이 있어요'); return; }
      await addVenue(r.value, r.choice || 'offline');
      render(); actions.refresh();
    });
    b.querySelectorAll('.manage-row [data-op]').forEach((el) => el.addEventListener('click', async () => {
      const id = el.closest('.manage-row').dataset.id;
      const ids = activeVenues().map((v) => v.id);
      const i = ids.indexOf(id);
      const v = data.venues.find((x) => x.id === id);
      const op = el.dataset.op;
      if (op === 'up' || op === 'down') {
        const j = op === 'up' ? i - 1 : i + 1;
        [ids[i], ids[j]] = [ids[j], ids[i]];
        await reorderVenues(ids);
      } else if (op === 'rename') {
        const name = await promptDialog({ title: '이름 변경', value: v.name });
        if (!name || name === v.name) return;
        if (activeVenues().some((x) => x.name === name)) { toast('같은 이름이 있어요'); return; }
        await updateVenue({ ...v, name });
      } else if (op === 'delete') {
        const n = data.sessions.filter((s) => s.venueId === id).length;
        if (!await confirmDialog({ title: `'${v.name}' 삭제`, message: n ? `선택 목록에서만 사라지고, 기록된 대회 ${n}건에는 그대로 남아요.` : '선택 목록에서 사라져요.', confirmText: '삭제', danger: true })) return;
        await updateVenue({ ...v, deleted: true });
      }
      render(); actions.refresh();
    }));
    b.querySelectorAll('[data-htag]').forEach((el) => el.addEventListener('click', async () => {
      const t = el.dataset.htag;
      const n = data.hands.filter((h) => h.tags.includes(t)).length;
      const r = await dialog({
        title: `#${t}`, message: `핸드 ${n}개에 붙어 있어요.`, input: { value: t },
        buttons: [{ label: '삭제', value: 'del', kind: 'danger-ghost' }, { label: '취소', value: null }, { label: '이름 변경', value: 'rename', kind: 'primary' }],
      });
      if (r.button === 'rename' && r.value && r.value !== t) await renameHandTag(t, r.value.replace(/^#/, ''));
      if (r.button === 'del') {
        if (!await confirmDialog({ title: `#${t} 태그를 지울까요?`, message: n ? `핸드 ${n}개에서 이 태그가 빠져요.` : '', confirmText: '삭제', danger: true })) return;
        await deleteHandTag(t);
      }
      render(); actions.refresh();
    }));
    on('export', async () => { await exportJSON(); toast('백업 파일을 저장했어요'); });
    on('csv', () => { const n = exportSessionsCSV(); toast(`CSV 파일을 저장했어요 (${n}건)`); });
    const file = b.querySelector('#import-file');
    on('import', () => file.click());
    file.addEventListener('change', async () => {
      const fl = file.files?.[0];
      file.value = '';
      if (fl) await runImport(fl);
    });
  }

  async function editStart() {
    const r = await dialog({
      title: '시작 뱅크롤',
      html: `<label class="field-label no-top" for="sb-amt">시작 금액</label>
        <div class="unit-input"><input id="sb-amt" class="field" type="text" inputmode="numeric" data-decimals="0" value="${data.settings.startingBankroll ? num(data.settings.startingBankroll) : ''}" placeholder="0"><span>원</span></div>
        <label class="field-label" for="sb-date">시작일 (비우면 처음부터)</label>
        <input id="sb-date" class="field" type="date" value="${esc(data.settings.bankrollStartDate ?? '')}">`,
      buttons: [{ label: '취소', value: false }, { label: '저장', value: true, kind: 'primary' }],
      onOpen: (w) => bindNumber(w.querySelector('#sb-amt')),
    });
    if (!r.button) return;
    const amt = parseNum(r.fields['sb-amt']);
    const date = r.fields['sb-date'] || null;
    if (Number.isNaN(amt) || (amt != null && amt < 0) || (date && !isValidDateStr(date))) { toast('값을 확인해 주세요'); return; }
    await setSetting('startingBankroll', amt || 0);
    await setSetting('bankrollStartDate', date || null);
    toast('저장했어요');
    render(); actions.refresh();
  }

  render();
}

/* ---------- 입출금 ---------- */
export function openLedger() {
  const sheet = openSheet({ title: '입출금 기록', page: true });
  function render() {
    const br = bankroll();
    const list = [...data.ledger].sort((a, b) => (a.date === b.date ? b.createdAt - a.createdAt : a.date < b.date ? 1 : -1));
    sheet.body.innerHTML = `
      <section class="card block">
        <div class="kv"><span>현금 뱅크롤</span><b>${won(br.cash)}</b></div>
        <div class="kv"><span>총 입금</span><b>${won(br.deposits)}</b></div>
        <div class="kv"><span>총 출금</span><b>${won(br.withdrawals)}</b></div>
      </section>
      <p class="help">뱅크롤에 돈을 넣거나 생활비로 빼 쓴 금액을 기록하세요. 대회 바이인·상금은 대회 기록에서 자동 반영돼요.</p>
      <div class="btn-row"><button type="button" class="btn primary" data-new="deposit">＋ 입금</button><button type="button" class="btn ghost" data-new="withdraw">− 출금</button></div>
      ${list.length ? `<ul class="ledger-list card">${list.map((e) => `
        <li><button type="button" class="ledger-row" data-id="${esc(e.id)}">
          <span class="lg-type ${e.type}">${e.type === 'deposit' ? '입금' : '출금'}</span>
          <span class="lg-main"><span>${dateLabel(e.date)}</span>${e.memo ? `<span class="muted small">${esc(e.memo)}</span>` : ''}</span>
          <b class="${e.type === 'deposit' ? 'gain' : 'loss'}">${e.type === 'deposit' ? '+' : '−'}${won(e.amount)}</b>
        </button></li>`).join('')}</ul>` : '<p class="muted empty-line center">기록이 없어요</p>'}`;
    sheet.body.querySelectorAll('[data-new]').forEach((b) => b.addEventListener('click', () => edit(null, b.dataset.new)));
    sheet.body.querySelectorAll('.ledger-row').forEach((b) => b.addEventListener('click', () => edit(b.dataset.id)));
  }
  function edit(id, type) {
    const orig = id ? data.ledger.find((e) => e.id === id) : null;
    const f = { type: orig?.type ?? type, date: orig?.date ?? todayStr(), amount: orig?.amount ?? null, memo: orig?.memo ?? '' };
    const s = openSheet({
      title: orig ? '입출금 수정' : f.type === 'deposit' ? '입금' : '출금',
      headerRight: orig ? `<button type="button" class="icon-btn danger-text" data-del aria-label="삭제">${icon(ICONS.del)}</button>` : '',
    });
    s.body.innerHTML = `
      ${segmented('lt', [{ value: 'deposit', label: '입금' }, { value: 'withdraw', label: '출금' }], f.type)}
      <label class="field-label" for="l-amt">금액</label>
      <div class="unit-input"><input id="l-amt" class="field big-num" type="text" inputmode="numeric" data-decimals="0" value="${f.amount ? num(f.amount) : ''}" placeholder="0"><span>원</span></div>
      <label class="field-label" for="l-date">날짜</label>
      <input id="l-date" class="field" type="date" value="${esc(f.date)}">
      <label class="field-label" for="l-memo">메모</label>
      <input id="l-memo" class="field" type="text" maxlength="60" value="${esc(f.memo)}" placeholder="예: 월급에서 충전, 생활비 인출">
      <p class="form-hint"></p>`;
    s.foot.hidden = false;
    s.foot.innerHTML = '<button type="button" class="btn primary block big" id="l-save">저장</button>';
    const amt = bindNumber(s.body.querySelector('#l-amt'));
    s.body.querySelector('#l-amt').focus({ preventScroll: true });
    s.body.querySelectorAll('[data-lt]').forEach((b) => b.addEventListener('click', () => {
      f.type = b.dataset.lt;
      s.body.querySelectorAll('[data-lt]').forEach((x) => { x.classList.toggle('on', x === b); x.setAttribute('aria-checked', String(x === b)); });
    }));
    s.foot.querySelector('#l-save').addEventListener('click', async () => {
      const a = amt.get();
      const d = s.body.querySelector('#l-date').value;
      if (!(a > 0)) { s.body.querySelector('.form-hint').textContent = '금액을 입력해 주세요'; return; }
      if (!isValidDateStr(d)) { s.body.querySelector('.form-hint').textContent = '날짜를 확인해 주세요'; return; }
      await saveLedger({ id: orig?.id ?? uuid(), type: f.type, date: d, amount: a, memo: s.body.querySelector('#l-memo').value.trim(), createdAt: orig?.createdAt });
      s.close(); toast('저장했어요'); render(); actions.refresh(); refreshSettings();
    });
    s.el.querySelector('[data-del]')?.addEventListener('click', async () => {
      if (!await confirmDialog({ title: '이 기록을 삭제할까요?', confirmText: '삭제', danger: true })) return;
      await deleteLedger(id);
      s.close(); toast('삭제했어요'); render(); actions.refresh(); refreshSettings();
    });
  }
  render();
}

/* ---------- 가져오기 ---------- */
async function runImport(file) {
  let d;
  try { d = parseBackup(await file.text()); } catch (e) { await alertDialog('가져올 수 없어요', e.message); return; }
  const when = d.exportedAt ? String(d.exportedAt).slice(0, 16).replace('T', ' ') : '날짜 정보 없음';
  const r = await dialog({
    title: '백업 가져오기',
    html: `<p class="dialog-msg">${esc(file.name)}<br>${esc(when)} · 대회 ${d.sessions.length}건 · 티켓 ${d.tickets.length}장 · 핸드 ${d.hands.length}개</p>
      <div class="mode-list">
        <label class="mode-opt"><input type="radio" name="mode" value="overwrite" checked><span><b>덮어쓰기</b><small>지금 데이터를 모두 지우고 백업으로 바꿔요. 기기 이전·복원용.</small></span></label>
        <label class="mode-opt"><input type="radio" name="mode" value="merge"><span><b>병합</b><small>지금 데이터에 추가해요. 이미 있는 기록은 건너뛰어요.</small></span></label>
      </div>`,
    buttons: [{ label: '취소', value: null }, { label: '다음', value: 'next', kind: 'primary' }],
  });
  if (r.button !== 'next') return;
  if (r.choice === 'overwrite' && !await confirmDialog({
    title: '기존 데이터를 덮어쓸까요?',
    message: `지금 있는 대회 ${data.sessions.length}건, 티켓 ${data.tickets.length}장, 핸드 ${data.hands.length}개와 입출금·설정이 모두 삭제되고 백업 내용으로 바뀝니다.`,
    confirmText: '덮어쓰기', danger: true,
  })) return;
  try {
    const res = await importData(d, r.choice);
    await loadAll();
    actions.refresh(); refreshSettings();
    const added = `대회 ${res.sessions}건, 티켓 ${res.tickets}장, 핸드 ${res.hands}개, 입출금 ${res.ledger}건`;
    await alertDialog('가져오기 완료', r.choice === 'overwrite' ? `${added}을(를) 복원했어요.` : `${added} 추가 · ${res.skipped}건 건너뜀`);
  } catch (e) {
    await alertDialog('가져오기 실패', `데이터는 변경되지 않았어요. (${e.message})`);
  }
}
