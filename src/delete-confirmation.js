import {esc,ICONS} from './render.js';
import {localizeDOM} from './i18n.js';

let activeDialog = null;

// A native modal supplies top-layer stacking and makes even an open library inert.
// Nothing is deleted here: callers perform their existing storage operation only
// after this promise resolves true. Escape, backdrop and close always cancel.
export function confirmDelete({title,subject,detail='',message,confirmLabel='Delete',subjectIsFood=true,fallbackFocus}) {
  if(activeDialog)return Promise.resolve(false);
  const returnFocus=document.activeElement;
  const dialog=document.createElement('dialog');
  dialog.id='delete-confirmation';
  dialog.className='delete-confirmation';
  dialog.setAttribute('role','alertdialog');
  dialog.setAttribute('aria-labelledby','delete-confirmation-title');
  dialog.setAttribute('aria-describedby','delete-confirmation-message delete-confirmation-subject delete-confirmation-warning');
  dialog.innerHTML=`
    <div class="delete-confirmation-content">
      <button class="icon-btn delete-confirmation-close" type="button" aria-label="Cancel">${ICONS.x}</button>
      <div class="delete-confirmation-icon" aria-hidden="true">${ICONS.trash}</div>
      <h2 id="delete-confirmation-title">${esc(title)}</h2>
      <p id="delete-confirmation-message">${esc(message)}</p>
      <div class="delete-confirmation-subject" id="delete-confirmation-subject"><span aria-hidden="true">${ICONS.leaf}</span><div><strong ${subjectIsFood?'data-i18n-skip':''}>${esc(subject)}</strong>${detail?`<small data-i18n-skip>${esc(detail)}</small>`:''}</div></div>
      <p class="delete-confirmation-warning" id="delete-confirmation-warning"><span aria-hidden="true">!</span><span>This cannot be undone.</span></p>
      <div class="delete-confirmation-actions"><button class="btn" type="button" data-delete-cancel autofocus>Cancel</button><button class="btn btn-danger" type="button" data-delete-confirm>${ICONS.trash}<span>${esc(confirmLabel)}</span></button></div>
    </div>`;
  document.body.append(dialog);
  localizeDOM(dialog);
  activeDialog=dialog;
  return new Promise(resolve=>{
    let settled=false;
    function finish(accepted) {
      if(settled)return;
      settled=true;
      dialog.close();dialog.remove();activeDialog=null;
      const target=returnFocus?.isConnected && !returnFocus.disabled && returnFocus.getClientRects().length?returnFocus:(fallbackFocus?document.querySelector(fallbackFocus):null);
      target?.focus();
      resolve(accepted);
    }
    dialog.querySelector('[data-delete-cancel]').addEventListener('click',()=>finish(false));
    dialog.querySelector('.delete-confirmation-close').addEventListener('click',()=>finish(false));
    dialog.querySelector('[data-delete-confirm]').addEventListener('click',()=>finish(true));
    dialog.addEventListener('cancel',event=>{event.preventDefault();finish(false);});
    dialog.addEventListener('close',()=>finish(false));
    // Do not let underlying library/drawer shortcuts handle modal keystrokes.
    dialog.addEventListener('keydown',event=>{
      event.stopPropagation();
      if(event.key==='Tab') {
        const buttons=[...dialog.querySelectorAll('button')];
        if(event.shiftKey && document.activeElement===buttons[0]){event.preventDefault();buttons.at(-1).focus();}
        else if(!event.shiftKey && document.activeElement===buttons.at(-1)){event.preventDefault();buttons[0].focus();}
      }
    });
    let backdropPress=false;
    const outside=event=>{const r=dialog.getBoundingClientRect();return event.clientX<r.left || event.clientX>r.right || event.clientY<r.top || event.clientY>r.bottom;};
    dialog.addEventListener('pointerdown',event=>{backdropPress=event.target===dialog && outside(event);});
    dialog.addEventListener('click',event=>{if(backdropPress && event.target===dialog && outside(event))finish(false);backdropPress=false;});
    dialog.showModal();
    dialog.querySelector('[data-delete-cancel]').focus();
  });
}
