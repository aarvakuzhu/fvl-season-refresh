// ── FVL Core Member Session ───────────────────────────────────────────
// Password stored in sessionStorage — cleared when browser tab closes.
// Same password as Tournament Director.

const CORE_KEY = 'fvl_core_auth';
const CORE_PWD = 'fvl2026';

function isCoreAuth() {
  return sessionStorage.getItem(CORE_KEY) === '1';
}

function coreLogin(pw) {
  if (pw === CORE_PWD) {
    sessionStorage.setItem(CORE_KEY, '1');
    return true;
  }
  return false;
}

function coreLogout() {
  sessionStorage.removeItem(CORE_KEY);
}

// Apply core visibility — show elements with data-core="true", hide data-core="false"
function applyCoreVisibility() {
  const auth = isCoreAuth();
  document.querySelectorAll('[data-core]').forEach(el => {
    const req = el.dataset.core === 'true';
    el.style.display = req ? (auth ? '' : 'none') : '';
  });
  // Update any lock icons
  document.querySelectorAll('[data-core-icon]').forEach(el => {
    el.textContent = auth ? (el.dataset.coreIconOpen || '🔓') : (el.dataset.coreIcon || '🔒');
  });
}

// Show login modal, call onSuccess() if correct
function promptCoreLogin(onSuccess) {
  // Reuse existing modal if present, else create
  let overlay = document.getElementById('core-login-overlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'core-login-overlay';
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.65);z-index:500;display:flex;align-items:center;justify-content:center';
    overlay.innerHTML = `
      <div style="background:#fff;border-radius:6px;padding:24px;width:90%;max-width:320px;text-align:center;box-shadow:0 8px 32px rgba(0,0,0,.25)">
        <div style="font-size:28px;margin-bottom:8px">🔐</div>
        <div style="font-size:16px;font-weight:700;margin-bottom:4px;color:#0d1b2a">Core Member Access</div>
        <div style="font-size:12px;color:#64748b;margin-bottom:16px">Enter password to unlock governance content, roster and draft tools.</div>
        <input id="core-pw-input" type="password" placeholder="Password"
          style="width:100%;padding:10px;border:1px solid #dde3ed;border-radius:4px;font-size:15px;text-align:center;letter-spacing:3px;outline:none;margin-bottom:8px;box-sizing:border-box"
          onkeydown="if(event.key==='Enter')document.getElementById('core-pw-submit').click()">
        <div id="core-pw-err" style="color:#c62828;font-size:12px;min-height:16px;margin-bottom:8px"></div>
        <div style="display:flex;gap:8px">
          <button onclick="document.getElementById('core-login-overlay').remove()"
            style="flex:1;padding:10px;border:1px solid #dde3ed;background:#fff;border-radius:4px;cursor:pointer;font-size:13px">Cancel</button>
          <button id="core-pw-submit"
            style="flex:1;padding:10px;background:#0d1b2a;color:#fff;border:none;border-radius:4px;cursor:pointer;font-size:13px;font-weight:700"
            onclick="
              const pw=document.getElementById('core-pw-input').value;
              if(coreLogin(pw)){
                document.getElementById('core-login-overlay').remove();
                applyCoreVisibility();
                if(window._coreSuccess) window._coreSuccess();
              } else {
                document.getElementById('core-pw-err').textContent='Wrong password';
                document.getElementById('core-pw-input').value='';
              }
            ">Unlock</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);
    setTimeout(()=>document.getElementById('core-pw-input')?.focus(), 50);
  }
  if (onSuccess) window._coreSuccess = onSuccess;
}

// Call on every page load
document.addEventListener('DOMContentLoaded', applyCoreVisibility);
