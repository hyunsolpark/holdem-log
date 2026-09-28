// 온라인 플랫폼 게임머니: 충전, 잔고 맞추기, 플랫폼 상세
import { data, venueById, saveLedger, deleteLedger, actions } from '../store.js';
import { platformBalances, sessionMoney, venueRate } from '../money.js';
import { openSheet, bindNumber, confirmDialog, toast, icon, ICONS } from '../ui.js';
import { esc, won, gm, num, uuid, todayStr, isValidDateStr, dateLabel, plainPct } from '../utils.js';
import { sessionCard } from './common.js';

export const gmVenues = () => data.venues.filter((v) => v.gameMoney && !v.deleted);

const pages = new Set();
export const refreshPlatformPages = () => pages.forEach((p) => p.render());

/** 1단위당 원 → 사람이 읽기 좋은 문장 */
export function rateText(rate, unit) {
  if (rate == null) return '충전 기록 없음';
  return `1${unit}당 ${rate >= 100 ? won(Math.round(rate)) : `${num(rate, 'USD')}원`}`;
}

/* ---------- 충전 ---------- */
export function openTopup(venueId = null, entryId = null) {
  const orig = entryId ? data.ledger.find((e) => e.id === entryId) : null;
  const venues = gmVenues();
  let vid = orig?.venueId ?? venueId ?? venues[0]?.id;
  if (!vid) { toast('설정에서 게임머니 플랫폼을 먼저 지정해 주세요'); return; }
  let initial = '';
  const sheet = openSheet({
    title: orig ? '충전 수정' : '게임머니 충전',
    headerRight: orig ? `<button type="button" class="icon-btn danger-text" data-del aria-label="삭제">${icon(ICONS.del)}</button>` : '',
    isDirty: () => snap() !== initial,
  });
  const last = [...data.ledger].filter((e) => e.type === 'topup' && e.venueId === vid).sort((a, b) => b.createdAt - a.createdAt)[0];

  sheet.body.innerHTML = `
    <div class="field-label no-top">플랫폼</div>
    <div class="chip-row">${venues.map((v) => `<button type="button" class="chip small ${v.id === vid ? 'on' : ''}" aria-pressed="${v.id === vid}" data-v="${esc(v.id)}">${esc(v.name)}</button>`).join('')}</div>
    <label class="field-label" for="tp-krw">결제 금액 <span class="req">필수</span></label>
    <div class="unit-input"><input id="tp-krw" class="field big-num" type="text" inputmode="numeric" data-decimals="0" value="${orig ? num(orig.amount) : ''}" placeholder="${last ? num(last.amount) : '30,000'}"><span>원</span></div>
    <label class="field-label" for="tp-gm">받은 게임머니 <span class="req">필수</span></label>
    <div class="unit-input"><input id="tp-gm" class="field big-num" type="text" inputmode="decimal" data-decimals="2" value="${orig ? orig.gm : ''}" placeholder="${last ? last.gm : '200'}"><span class="gm-unit">${esc(venueById(vid).gmUnit)}</span></div>
    <p class="muted small-line rate-line"></p>
    <label class="field-label" for="tp-date">날짜</label>
    <input id="tp-date" class="field" type="date" value="${esc(orig?.date ?? todayStr())}">
    <label class="field-label" for="tp-memo">메모</label>
    <input id="tp-memo" class="field" type="text" maxlength="60" value="${esc(orig?.memo ?? '')}" placeholder="예: 보너스 패키지">
    <p class="help">결제 금액은 현금 뱅크롤에서 빠지고, 게임머니는 이 플랫폼 잔고에 더해져요. 보너스가 붙은 패키지라면 실제로 받은 양을 그대로 적으세요.</p>
    <p class="form-hint"></p>`;
  sheet.foot.hidden = false;
  sheet.foot.innerHTML = '<button type="button" class="btn primary block big" id="tp-save">저장</button>';
  const krw = bindNumber(sheet.body.querySelector('#tp-krw'));
  const g = bindNumber(sheet.body.querySelector('#tp-gm'));
  const unit = () => venueById(vid).gmUnit;
  const update = () => {
    const a = krw.get(), b = g.get();
    sheet.body.querySelector('.rate-line').textContent = a > 0 && b > 0 ? `이번 충전 단가: ${rateText(a / b, unit())}` : '';
  };
  sheet.body.querySelectorAll('input').forEach((el) => el.addEventListener('input', update));
  sheet.body.querySelectorAll('[data-v]').forEach((b) => b.addEventListener('click', () => {
    vid = b.dataset.v;
    sheet.body.querySelectorAll('[data-v]').forEach((x) => { x.classList.toggle('on', x === b); x.setAttribute('aria-pressed', String(x === b)); });
    sheet.body.querySelector('.gm-unit').textContent = unit();
    update();
  }));
  const snap = () => JSON.stringify([vid, ...[...sheet.body.querySelectorAll('input')].map((e) => e.value)]);
  initial = snap();
  update();
  if (!orig) sheet.body.querySelector('#tp-krw').focus({ preventScroll: true });

  sheet.foot.querySelector('#tp-save').addEventListener('click', async () => {
    const a = krw.get(), b = g.get();
    const d = sheet.body.querySelector('#tp-date').value;
    const hint = sheet.body.querySelector('.form-hint');
    if (!(a > 0)) { hint.textContent = '결제 금액을 입력해 주세요'; return; }
    if (!(b > 0)) { hint.textContent = '받은 게임머니를 입력해 주세요'; return; }
    if (!isValidDateStr(d)) { hint.textContent = '날짜를 확인해 주세요'; return; }
    await saveLedger({ id: orig?.id ?? uuid(), type: 'topup', venueId: vid, date: d, amount: a, gm: b, memo: sheet.body.querySelector('#tp-memo').value.trim(), createdAt: orig?.createdAt });
    sheet.close();
    toast(`${venueById(vid).name}에 ${gm(b, unit())} 충전을 기록했어요`);
    actions.refresh();
  });
  sheet.el.querySelector('[data-del]')?.addEventListener('click', async () => {
    if (!await confirmDialog({ title: '충전 기록을 삭제할까요?', message: '현금 뱅크롤과 플랫폼 잔고, 평균 충전 단가가 다시 계산돼요.', confirmText: '삭제', danger: true })) return;
    await deleteLedger(entryId);
    sheet.close(); toast('삭제했어요'); actions.refresh();
  });
}

/* ---------- 잔고 맞추기 ---------- */
export function openAdjust(venueId, entryId = null) {
  const orig = entryId ? data.ledger.find((e) => e.id === entryId) : null;
  const v = venueById(orig?.venueId ?? venueId);
  const bal = platformBalances().find((b) => b.venueId === v.id)?.balance ?? 0;
  const sheet = openSheet({
    title: orig ? '잔고 조정 수정' : `${v.name} 잔고 맞추기`,
    headerRight: orig ? `<button type="button" class="icon-btn danger-text" data-del aria-label="삭제">${icon(ICONS.del)}</button>` : '',
  });
  sheet.body.innerHTML = orig ? `
      <label class="field-label no-top" for="ad-gm">조정량 (+/−)</label>
      <div class="unit-input"><input id="ad-gm" class="field big-num" type="text" inputmode="text" value="${orig.gm}"><span>${esc(v.gmUnit)}</span></div>
      <label class="field-label" for="ad-memo">메모</label>
      <input id="ad-memo" class="field" type="text" maxlength="60" value="${esc(orig.memo)}">
      <p class="form-hint"></p>` : `
      <p class="info-line">앱 기준 잔고는 <b>${gm(bal, v.gmUnit)}</b>이에요. 플랫폼에 보이는 실제 잔고를 입력하면 차이만큼 조정 기록이 남아요. (출석 보상, 무료 머니, 기록 안 한 게임 등)</p>
      <label class="field-label" for="ad-real">실제 잔고</label>
      <div class="unit-input"><input id="ad-real" class="field big-num" type="text" inputmode="decimal" data-decimals="2" placeholder="${num(Math.max(bal, 0), 'USD').replace(/\.00$/, '')}"><span>${esc(v.gmUnit)}</span></div>
      <p class="muted small-line diff-line"></p>
      <label class="field-label" for="ad-memo">메모</label>
      <input id="ad-memo" class="field" type="text" maxlength="60" placeholder="예: 출석 보상, 기록 누락">
      <p class="form-hint"></p>`;
  sheet.foot.hidden = false;
  sheet.foot.innerHTML = '<button type="button" class="btn primary block big" id="ad-save">저장</button>';
  const real = sheet.body.querySelector('#ad-real');
  const realNum = real ? bindNumber(real) : null;
  real?.addEventListener('input', () => {
    const r = realNum.get();
    sheet.body.querySelector('.diff-line').textContent = r != null && !Number.isNaN(r) ? `조정: ${gm(r - bal, v.gmUnit, { sign: true })}` : '';
  });
  real?.focus({ preventScroll: true });
  sheet.foot.querySelector('#ad-save').addEventListener('click', async () => {
    const hint = sheet.body.querySelector('.form-hint');
    let delta;
    if (orig) {
      delta = Number(String(sheet.body.querySelector('#ad-gm').value).replace(/[,\s]/g, '').replace('−', '-'));
    } else {
      const r = realNum.get();
      if (r == null || Number.isNaN(r)) { hint.textContent = '실제 잔고를 입력해 주세요'; return; }
      delta = r - bal;
    }
    if (!Number.isFinite(delta) || delta === 0) { hint.textContent = orig ? '조정량을 확인해 주세요' : '앱 잔고와 같아서 조정할 게 없어요'; return; }
    await saveLedger({ id: orig?.id ?? uuid(), type: 'gmadjust', venueId: v.id, date: orig?.date ?? todayStr(), amount: 0, gm: Math.round(delta * 100) / 100, memo: sheet.body.querySelector('#ad-memo').value.trim(), createdAt: orig?.createdAt });
    sheet.close(); toast('잔고를 맞췄어요'); actions.refresh();
  });
  sheet.el.querySelector('[data-del]')?.addEventListener('click', async () => {
    if (!await confirmDialog({ title: '조정 기록을 삭제할까요?', confirmText: '삭제', danger: true })) return;
    await deleteLedger(entryId);
    sheet.close(); toast('삭제했어요'); actions.refresh();
  });
}

/* ---------- 플랫폼 상세 ---------- */
export function openPlatform(venueId) {
  const v = venueById(venueId);
  const sheet = openSheet({ title: v.name, page: true, onClose: () => pages.delete(page) });
  const page = { render };
  pages.add(page);
  function render() {
    const b = platformBalances().find((x) => x.venueId === venueId) ?? { balance: 0, topupKrw: 0, topupGm: 0, ticketValue: 0, count: 0, rate: null, balanceKrw: null, recovery: null, sessionNet: 0, adjust: 0 };
    const unit = v.gmUnit;
    const entries = data.ledger.filter((e) => (e.type === 'topup' || e.type === 'gmadjust') && e.venueId === venueId)
      .sort((a, c) => (a.date === c.date ? c.createdAt - a.createdAt : a.date < c.date ? 1 : -1));
    const sessions = data.sessions.filter((s) => s.venueId === venueId && s.gm && s.status !== 'skipped')
      .sort((a, c) => (a.date < c.date ? 1 : -1)).slice(0, 10);
    const y = sheet.body.scrollTop;
    sheet.body.innerHTML = `
      <section class="card bankroll">
        <div class="br-total"><span class="k">게임머니 잔고</span><span class="br-big">${gm(b.balance, unit)}</span>
          <span class="muted small">${b.balanceKrw != null ? `≈ ${won(Math.round(b.balanceKrw))} (평균 충전 단가 환산, 현금화 불가)` : '충전 기록이 없어 환산할 수 없어요'}</span></div>
        <div class="br-grid">
          <div class="br-item"><span class="k">총 충전</span><span class="v">${won(b.topupKrw)}</span></div>
          <div class="br-item"><span class="k">딴 티켓</span><span class="v">${won(b.ticketValue)}</span></div>
          <div class="br-item"><span class="k">회수율</span><span class="v">${b.recovery != null ? plainPct(b.recovery, 0) : '-'}</span></div>
        </div>
        <p class="muted small-line">${rateText(b.rate, unit)} · 대회 ${b.count}건 게임머니 ${gm(b.sessionNet, unit, { sign: true })}${b.adjust ? ` · 조정 ${gm(b.adjust, unit, { sign: true })}` : ''}</p>
      </section>
      <div class="btn-row">
        <button type="button" class="btn primary" data-act="topup">${icon(ICONS.cash)}충전</button>
        <button type="button" class="btn ghost" data-act="adjust">잔고 맞추기</button>
      </div>
      <h3 class="sec-title">충전·조정 기록</h3>
      ${entries.length ? `<ul class="ledger-list card">${entries.map((e) => `
        <li><button type="button" class="ledger-row" data-entry="${esc(e.id)}" data-type="${e.type}">
          <span class="lg-type ${e.type}">${e.type === 'topup' ? '충전' : '조정'}</span>
          <span class="lg-main"><span>${dateLabel(e.date)}</span><span class="muted small">${e.type === 'topup' ? `${won(e.amount)} · ${rateText(e.amount / e.gm, unit)}` : ''}${e.memo ? `${e.type === 'topup' ? ' · ' : ''}${esc(e.memo)}` : ''}</span></span>
          <b class="${e.gm >= 0 ? 'gain' : 'loss'}">${gm(e.gm, unit, { sign: true })}</b>
        </button></li>`).join('')}</ul>` : '<p class="muted empty-line">충전 기록이 없어요. 충전 기록이 있어야 원화 환산과 회수율이 계산돼요.</p>'}
      <h3 class="sec-title">최근 대회</h3>
      ${sessions.length ? `<div class="session-list">${sessions.map(sessionCard).join('')}</div>` : '<p class="muted empty-line">게임머니 대회 기록이 없어요.</p>'}`;
    sheet.body.scrollTop = y;
    sheet.body.querySelector('[data-act=topup]').addEventListener('click', () => openTopup(venueId));
    sheet.body.querySelector('[data-act=adjust]').addEventListener('click', () => openAdjust(venueId));
    sheet.body.querySelectorAll('[data-entry]').forEach((el) => el.addEventListener('click', () => (el.dataset.type === 'topup' ? openTopup(null, el.dataset.entry) : openAdjust(null, el.dataset.entry))));
    sheet.body.querySelectorAll('[data-session]').forEach((el) => el.addEventListener('click', async () => (await import('./session-detail.js')).openSessionDetail(el.dataset.session)));
  }
  render();
}

export { sessionMoney, venueRate };
