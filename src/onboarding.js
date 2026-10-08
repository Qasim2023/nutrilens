import {ONBOARDING_KEY} from './onboarding-store.js';

export function initOnboarding({store, getSettings, onModeChange, openSettings, cancelRequests}) {
  const $ = selector => document.querySelector(selector);
  const welcome = $('#onboarding-welcome');
  const guide = $('#api-setup-guide');
  let guideReturnFocus = null;
  function refresh() {
    const snapshot = store.snapshot();
    const demo = snapshot.status === 'demo';
    $('#demo-banner').hidden = !demo;
    $('#diary-demo-note').hidden = !demo;
    $('#set-demo').setAttribute('aria-checked', String(demo));
    $('#set-demo').disabled = snapshot.demoFinished;
  }
  function syncMode() {
    const demo = store.snapshot().status === 'demo';
    if (getSettings().demoMode !== demo) onModeChange(demo);
    refresh();
  }
  function showGuide(reason = 'help') {
    if (guide.open) return;
    guideReturnFocus = document.activeElement;
    $('#api-guide-demo-message').hidden = !['feature', 'finished'].includes(reason);
    $('#api-guide-demo-message').textContent = reason === 'feature' ? 'This part of the demo is complete — try the other demo features or connect your own provider' : 'You have finished the demo — connect your own provider to start using your own food and requests';
    guide.showModal();
    guide.scrollTop = 0;
    $('#api-guide-close').focus({preventScroll: true});
  }
  function dismissGuide() { if (guide.open) guide.close(); }
  function finishDemo(showHelp = true) {
    cancelRequests();
    store.finishDemo(); syncMode();
    if (showHelp) showGuide('finished');
  }
  function startDemo() {
    if (welcome.open) welcome.close();
    if (!store.startDemo()) { showGuide(); return; }
    cancelRequests(); syncMode(); $('#input').focus({preventScroll: true});
  }
  function jumpToSetting(id) {
    guideReturnFocus = null;
    if (store.snapshot().status === 'demo') finishDemo(false);
    dismissGuide(); openSettings();
    const target = document.getElementById(id);
    target?.scrollIntoView({block: 'center'});
    target?.focus({preventScroll: true});
  }
  $('#welcome-demo').addEventListener('click', startDemo);
  $('#welcome-returning').addEventListener('click', () => {
    store.skipDemo(); syncMode(); welcome.close(); $('#input').focus({preventScroll: true});
  });
  welcome.addEventListener('cancel', event => { event.preventDefault(); startDemo(); });
  welcome.addEventListener('keydown', event => event.stopPropagation());
  $('#demo-end-btn').addEventListener('click', () => finishDemo());
  $('#api-setup-guide-btn').addEventListener('click', () => showGuide());
  $('#api-guide-close').addEventListener('click', dismissGuide);
  $('#api-guide-dismiss').addEventListener('click', dismissGuide);
  $('#api-guide-settings').addEventListener('click', () => jumpToSetting('set-provider'));
  guide.querySelectorAll('[data-setup-field]').forEach(button => button.addEventListener('click', () => jumpToSetting(button.dataset.setupField)));
  guide.addEventListener('keydown', event => event.stopPropagation());
  guide.addEventListener('close', () => {
    if (!guideReturnFocus) return;
    const target = guideReturnFocus.isConnected && guideReturnFocus.getClientRects().length && !guideReturnFocus.closest('[inert]') ? guideReturnFocus : $('#settings-btn');
    target.focus({preventScroll: true}); guideReturnFocus = null;
  });
  let backdropPressed = false;
  const outside = event => { const r = guide.getBoundingClientRect(); return event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom; };
  guide.addEventListener('pointerdown', event => { backdropPressed = event.target === guide && outside(event); });
  guide.addEventListener('click', event => { if (backdropPressed && event.target === guide && outside(event)) dismissGuide(); backdropPressed = false; });
  globalThis.addEventListener('storage', event => {
    if (event.key !== ONBOARDING_KEY && event.key !== null) return;
    if (getSettings().demoMode && store.snapshot().status !== 'demo') cancelRequests();
    syncMode();
  });
  // Migrate the previous optional sample-analysis toggle without forcing a welcome.
  if (getSettings().demoMode && store.snapshot().status === 'normal' && !store.snapshot().demoFinished) store.startDemo();
  syncMode();
  if (store.snapshot().status === 'welcome') welcome.showModal();
  return {
    refresh,
    showGuide,
    toggleDemo() { if (store.snapshot().status === 'demo') finishDemo(); else startDemo(); },
    finishDemo,
    beginDemoUse(feature) {
      const ticket = store.reserve(feature);
      if (!ticket) { showGuide('feature'); return null; }
      return {
        release: () => ticket.release(),
        complete() {
          const result = ticket.complete();
          syncMode();
          if (result.finished) showGuide('finished');
          return result;
        },
      };
    },
  };
}
