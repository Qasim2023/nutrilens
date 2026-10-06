// Native modal keeps password entry separate from storage and download code.
import {localizeDOM} from './i18n.js';
export function askBackupPassword({creating = false} = {}) {
  if (document.querySelector('#backup-password')) return Promise.resolve(null);
  const previous = document.activeElement, dialog = document.createElement('dialog');
  dialog.id = 'backup-password'; dialog.className = 'delete-confirmation backup-password';
  dialog.setAttribute('aria-labelledby', 'backup-password-title');
  dialog.setAttribute('aria-describedby', 'backup-password-help');
  dialog.innerHTML = '<form class="delete-confirmation-content"><h2 id="backup-password-title"></h2><p id="backup-password-help"></p><div class="field"><label for="backup-password-input">Backup password</label><input id="backup-password-input" type="password" required maxlength="1024" spellcheck="false" autocapitalize="off"></div><div class="field" id="backup-password-repeat-field"><label for="backup-password-repeat">Confirm password</label><input id="backup-password-repeat" type="password" maxlength="1024" spellcheck="false" autocapitalize="off"></div><div class="delete-confirmation-actions"><button class="btn" type="button" data-password-cancel>Cancel</button><button class="btn btn-primary" type="submit" data-password-submit></button></div></form>';
  dialog.querySelector('h2').textContent = creating ? 'Encrypt your meals backup' : 'Unlock your meals backup';
  dialog.querySelector('p').textContent = creating ? 'Use a unique passphrase of at least 12 characters. Keep it in a password manager: a lost password cannot be recovered. Your live browser data is not encrypted.' : 'Enter the password used when this backup was encrypted. Nothing is imported until the password and file are verified.';
  const input = dialog.querySelector('#backup-password-input'), repeat = dialog.querySelector('#backup-password-repeat');
  input.autocomplete = creating ? 'new-password' : 'current-password';
  if (creating) { input.minLength = 12; repeat.required = true; repeat.autocomplete = 'new-password'; }
  else dialog.querySelector('#backup-password-repeat-field').hidden = true;
  dialog.querySelector('[data-password-submit]').textContent = creating ? 'Encrypt and download' : 'Unlock and restore';
  return new Promise(resolve => {
    let result = null;
    dialog.querySelector('form').addEventListener('submit', event => {
      event.preventDefault();
      repeat.setCustomValidity(creating && input.value !== repeat.value ? 'Passwords must match.' : '');
      if (!dialog.querySelector('form').reportValidity()) return;
      result = input.value; dialog.close();
    });
    for (const field of [input, repeat]) field.addEventListener('input', () => repeat.setCustomValidity(''));
    dialog.querySelector('[data-password-cancel]').addEventListener('click', () => dialog.close());
    dialog.addEventListener('keydown', event => event.stopPropagation());
    dialog.addEventListener('close', () => {
      input.value = ''; repeat.value = ''; dialog.remove(); previous?.focus({preventScroll:true}); resolve(result); result = null;
    }, {once:true});
    document.body.appendChild(dialog); localizeDOM(dialog); dialog.showModal(); input.focus();
  });
}
