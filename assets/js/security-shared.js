// @ts-check

(function () {
  if (window.SecurityShared) return;

  function setText(target, value) {
    if (!target) return;
    if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) {
      target.value = value ?? '';
      return;
    }
    target.textContent = value ?? '';
  }

  function setStatus(target, value, state) {
    setText(target, value);
    if (!(target instanceof HTMLElement)) return;
    target.classList.remove('status-row--ok', 'status-row--warn', 'status-row--info');
    if (state) target.classList.add(`status-row--${state}`);
  }

  function checkCooldown(key, cooldownMs) {
    const now = Date.now();
    const last = Number(localStorage.getItem(key) || 0);
    if (now - last < cooldownMs) {
      return Math.ceil((cooldownMs - (now - last)) / 1000);
    }
    localStorage.setItem(key, String(now));
    return 0;
  }

  function startCooldown(button, seconds) {
    if (!(button instanceof HTMLButtonElement)) return;
    const original = button.textContent || '';
    let remain = seconds;
    button.disabled = true;
    button.textContent = `${remain}s`;
    const timer = window.setInterval(() => {
      remain -= 1;
      if (remain <= 0) {
        window.clearInterval(timer);
        button.disabled = false;
        button.textContent = original;
      } else {
        button.textContent = `${remain}s`;
      }
    }, 1000);
  }

  async function verifyTurnstile(kind, statusEl, purposeOverride) {
    if (!window.QuarkTurnstile) {
      setStatus(statusEl, '验证码未加载', 'warn');
      return false;
    }
    return window.QuarkTurnstile.verify(kind, (msg) => setStatus(statusEl, msg, 'warn'), purposeOverride);
  }

  window.SecurityShared = {
    setText,
    setStatus,
    checkCooldown,
    startCooldown,
    verifyTurnstile
  };
})();
