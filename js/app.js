// 앱 시작, 탭 전환, 서비스 워커
import { openDB } from './db.js';
import { ui, actions, loadAll, seedIfEmpty } from './store.js';
import { toast } from './ui.js';
import { renderHome, pendingSessions } from './views/home.js';
import { renderSessions } from './views/sessions.js';
import { renderHands } from './views/hands.js';
import { renderStats } from './views/stats.js';
import { refreshSessionPages } from './views/session-detail.js';
import { refreshTickets } from './views/sheets.js';
import { refreshPlatformPages } from './views/wallet.js';
import { refreshLedger, refreshSettings } from './views/settings.js';
import { openSessionForm } from './views/session-form.js';
import { openHandForm } from './views/hand-form.js';

const view = document.getElementById('view');
const fab = document.getElementById('fab');
const VIEWS = { home: renderHome, sessions: renderSessions, hands: renderHands, stats: renderStats };

let seq = 0;
async function renderTab({ scrollTop = false } = {}) {
  const my = ++seq;
  document.querySelectorAll('.tab').forEach((t) => {
    const on = t.dataset.tab === ui.tab;
    t.classList.toggle('on', on);
    if (on) t.setAttribute('aria-current', 'page'); else t.removeAttribute('aria-current');
  });
  const pending = pendingSessions().length;
  const dot = document.querySelector('.tab[data-tab="home"] .tab-dot');
  dot.textContent = pending ? String(pending) : '';
  dot.hidden = !pending;
  fab.hidden = ui.tab === 'stats';
  fab.setAttribute('aria-label', ui.tab === 'hands' ? '핸드 추가' : '대회 추가');

  const y = window.scrollY;
  await VIEWS[ui.tab](view);
  if (my !== seq) return;
  window.scrollTo(0, scrollTop ? 0 : y);
}

actions.refresh = () => {
  renderTab();
  refreshSessionPages();
  refreshTickets();
  refreshPlatformPages();
  refreshLedger();
  refreshSettings();
};
actions.switchTab = (tab) => { ui.tab = tab; renderTab({ scrollTop: true }); };

document.querySelectorAll('.tab').forEach((t) => t.addEventListener('click', () => {
  if (ui.tab === t.dataset.tab) { window.scrollTo({ top: 0, behavior: 'smooth' }); return; }
  actions.switchTab(t.dataset.tab);
}));
fab.addEventListener('click', () => (ui.tab === 'hands' ? openHandForm() : openSessionForm()));

let lastDay = new Date().toDateString();
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && new Date().toDateString() !== lastDay) {
    lastDay = new Date().toDateString();
    actions.refresh();
  }
});

async function init() {
  try {
    await openDB();
    await loadAll();
    if (await seedIfEmpty()) navigator.storage?.persist?.().catch(() => {});
    await renderTab();
  } catch (e) {
    view.innerHTML = `<div class="empty"><p>데이터를 열 수 없어요</p><p class="muted">${String(e.message || e)}</p>
      <p class="muted">시크릿 모드이거나 브라우저 저장공간이 막혀 있는지 확인해 주세요.</p></div>`;
  }
}

function registerSW() {
  if (!('serviceWorker' in navigator)) return;
  // 사용자가 '새로고침'을 눌렀을 때만 다시 불러온다 (첫 설치 때 불필요한 새로고침 방지)
  let updateRequested = false;
  let refreshing = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!updateRequested || refreshing) return;
    refreshing = true;
    location.reload();
  });
  const prompt = (worker) => toast('새 버전이 있어요', {
    action: '새로고침', duration: 0, onAction: () => { updateRequested = true; worker.postMessage({ type: 'SKIP_WAITING' }); },
  });
  navigator.serviceWorker.register('./sw.js').then((reg) => {
    if (reg.waiting && navigator.serviceWorker.controller) prompt(reg.waiting);
    reg.addEventListener('updatefound', () => {
      const nw = reg.installing;
      nw?.addEventListener('statechange', () => {
        if (nw.state === 'installed' && navigator.serviceWorker.controller) prompt(nw);
      });
    });
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') reg.update().catch(() => {});
    });
  }).catch(() => {});
}

init();
registerSW();
