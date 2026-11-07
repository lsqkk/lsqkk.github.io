// The layered waves and soft currents are inspired by sine-waves and Flow Fields:
// https://github.com/isuttell/sine-waves
// https://github.com/evoluteur/flow-fields
export function animateCover(cover: HTMLElement, canvas: HTMLCanvasElement) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const ink = ctx;
  const motion = matchMedia("(prefers-reduced-motion: reduce)");
  const root = document.documentElement;
  const pointer = { x: 0, y: 0, strength: 0, targetX: 0, targetY: 0, targetStrength: 0 };
  let width = 0;
  let height = 0;
  let phase = 0;
  let frame = 0;
  let last = 0;
  let visible = false;
  let atTop = window.scrollY <= 0;
  let colors: CanvasGradient[] = [];

  const reduced = () => motion.matches || root.dataset.motion === "reduce";

  function setPalette() {
    const dark = document.body.classList.contains("dark-mode");
    colors = [
      [dark ? "122, 151, 238" : "93, 119, 206", dark ? "115, 205, 212" : "36, 139, 161"],
      [dark ? "101, 174, 236" : "69, 133, 195", dark ? "162, 151, 236" : "127, 114, 190"],
    ].map(([left, right]) => {
      const gradient = ink.createLinearGradient(0, 0, width, 0);
      gradient.addColorStop(0, `rgba(${left}, .04)`);
      gradient.addColorStop(.19, `rgba(${left}, ${dark ? .35 : .25})`);
      gradient.addColorStop(.5, `rgba(${left}, .035)`);
      gradient.addColorStop(.8, `rgba(${right}, ${dark ? .36 : .26})`);
      gradient.addColorStop(1, `rgba(${right}, .05)`);
      return gradient;
    });
  }

  function draw() {
    if (!width || !height) return;
    ink.clearRect(0, 0, width, height);
    ink.lineWidth = 0.9;
    const compact = width < 600;
    const lines = compact ? 15 : 24;
    const samples = compact ? 60 : 96;
    for (let band = 0; band < 2; band++) {
      const sign = band === 0 ? 1 : -1;
      ink.strokeStyle = colors[band];
      for (let i = 0; i < lines; i++) {
        const lane = i / (lines - 1) - 0.5;
        ink.beginPath();
        for (let step = 0; step <= samples; step++) {
          const u = step / samples;
          const x = u * width;
          const spread = 0.06 + 0.18 * Math.pow(Math.cos(u * Math.PI), 2);
          const ripple = Math.sin(u * 7.6 + band * 0.8 + phase + lane * 1.2) * 0.095
            + Math.sin(u * 12.4 - phase * 0.7 + band) * 0.03;
          const y = height * (0.5 + sign * (0.23 + ripple) + lane * spread);
          // A soft, local displacement with eased entry and exit.
          let bend = 0;
          if (pointer.strength > 0.005) {
            const dx = (x - pointer.x) / (compact ? 105 : 210);
            const dy = (y - pointer.y) / 185;
            bend = pointer.strength * 34 * Math.exp(-(dx * dx + dy * dy)) * Math.tanh(dy * 3);
          }
          if (step === 0) ink.moveTo(x, y + bend);
          else ink.lineTo(x, y + bend);
        }
        ink.stroke();
      }
    }
  }

  function tick(now: number) {
    const elapsed = last ? Math.min(now - last, 40) : 0;
    last = now;
    phase += elapsed * 0.00032;
    const ease = 1 - Math.exp(-elapsed / 125);
    pointer.x += (pointer.targetX - pointer.x) * ease;
    pointer.y += (pointer.targetY - pointer.y) * ease;
    pointer.strength += (pointer.targetStrength - pointer.strength) * ease;
    draw();
    frame = requestAnimationFrame(tick);
  }

  function syncPlayback() {
    const active = visible && atTop && !document.hidden && !reduced();
    if (active && !frame) frame = requestAnimationFrame(tick);
    if (!active && frame) {
      cancelAnimationFrame(frame);
      frame = 0;
      last = 0;
    }
    if (reduced()) {
      phase = 0;
      pointer.strength = pointer.targetStrength = 0;
      draw();
    }
  }

  new ResizeObserver(([entry]) => {
    ({ width, height } = entry.contentRect);
    const scale = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(width * scale);
    canvas.height = Math.round(height * scale);
    ink.setTransform(scale, 0, 0, scale, 0, 0);
    setPalette();
    draw();
  }).observe(cover);

  new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting;
    if (!visible) pointer.targetStrength = 0;
    syncPlayback();
  }).observe(cover);

  cover.addEventListener("pointermove", (event) => {
    if (event.pointerType === "touch" || !atTop || reduced()) return;
    const bounds = cover.getBoundingClientRect();
    pointer.targetX = event.clientX - bounds.left;
    pointer.targetY = event.clientY - bounds.top;
    if (pointer.strength < 0.05) {
      pointer.x = pointer.targetX;
      pointer.y = pointer.targetY;
    }
    pointer.targetStrength = 1;
  }, { passive: true });
  cover.addEventListener("pointerleave", () => { pointer.targetStrength = 0; });

  // Freeze the last canvas frame during the exit, leaving scrolling to CSS.
  window.addEventListener("scroll", () => {
    const nextAtTop = window.scrollY <= 0;
    if (nextAtTop === atTop) return;
    atTop = nextAtTop;
    if (!atTop) pointer.targetStrength = 0;
    syncPlayback();
  }, { passive: true });

  motion.addEventListener("change", syncPlayback);
  document.addEventListener("visibilitychange", syncPlayback);
  new MutationObserver(syncPlayback).observe(root, { attributeFilter: ["data-motion"] });
  new MutationObserver(() => {
    setPalette();
    draw();
  }).observe(document.body, { attributeFilter: ["class"] });
}
