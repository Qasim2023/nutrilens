// Site-wide navigation and accessible, local information panels.
export function initFooter(root = document) {
  const dialog = root.querySelector('#footer-info');
  const close = root.querySelector('#footer-info-close');
  let returnFocus;
  root.querySelector('#footer-year').textContent = String(new Date().getFullYear());

  root.querySelectorAll('[data-footer-target]').forEach(button => {
    button.addEventListener('click', event => {
      event.preventDefault();
      if (dialog.open) {
        dialog.close();
        // The drawer/library must remember a visible footer trigger, not a
        // button inside the dialog that just closed. Do not steal their focus
        // when the native dialog dispatches its asynchronous close event.
        returnFocus?.focus({ preventScroll: true });
        returnFocus = null;
      }
      const id = button.dataset.footerTarget;
      root.getElementById(id)?.click();
      if (id === 'view-analysis' || id === 'view-diary') {
        const target = root.getElementById(id === 'view-analysis' ? 'input' : 'diary-food');
        target?.focus({ preventScroll: true });
        root.querySelector('.topbar')?.scrollIntoView({ block: 'start' });
      }
    });
  });
  root.querySelector('[data-footer-top]').addEventListener('click', event => {
    event.preventDefault();
    root.querySelector('.topbar')?.scrollIntoView({ block: 'start' });
    root.querySelector('#view-diary[aria-pressed="true"], #view-analysis[aria-pressed="true"]')?.focus({ preventScroll: true });
  });
  root.querySelectorAll('[data-footer-info]').forEach(button => {
    button.addEventListener('click', () => {
      const name = button.dataset.footerInfo;
      root.querySelectorAll('[data-footer-panel]').forEach(panel => {
        panel.hidden = panel.dataset.footerPanel !== name;
      });
      dialog.setAttribute('aria-labelledby', 'footer-' + name + '-title');
      returnFocus = button;
      dialog.showModal();
      dialog.scrollTop = 0;
      close.focus();
    });
  });
  close.addEventListener('click', () => dialog.close());
  dialog.addEventListener('close', () => returnFocus?.focus({ preventScroll: true }));
  // Prevent app-wide Escape handlers from opening or closing another panel.
  dialog.addEventListener('keydown', event => {
    event.stopPropagation();
    if (event.key !== 'Tab') return;
    const buttons = [...dialog.querySelectorAll('button')].filter(button => !button.closest('[hidden]'));
    if (event.shiftKey && root.activeElement === buttons[0]) {
      event.preventDefault(); buttons.at(-1).focus();
    } else if (!event.shiftKey && root.activeElement === buttons.at(-1)) {
      event.preventDefault(); buttons[0].focus();
    }
  });
  let backdropPress = false;
  const outside = event => {
    const rect = dialog.getBoundingClientRect();
    return event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom;
  };
  dialog.addEventListener('pointerdown', event => { backdropPress = event.target === dialog && outside(event); });
  dialog.addEventListener('click', event => {
    if (backdropPress && event.target === dialog && outside(event)) dialog.close();
    backdropPress = false;
  });
}
