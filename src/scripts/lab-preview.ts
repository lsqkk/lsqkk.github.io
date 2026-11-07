const demos = {
  wave: { label: "WAVE TABLE", action: "激起一道波纹", hint: "点在波面上，看一道波沿着细线传开。", link: "/a/physics/", linkText: "打开 Physics 项目 ↗" },
  spectrum: { label: "SPECTRUM", action: "改变频谱的峰值位置", hint: "点击不同位置，看看示例频谱的峰值怎样移动。", link: "/a/music-visualizer/", linkText: "打开音乐可视化 ↗" },
} as const;
type Demo = keyof typeof demos;

export function initLabPreview(preview: HTMLDetailsElement) {
  const modes = preview.querySelector<HTMLElement>("[data-lab-modes]");
  const surface = preview.querySelector<HTMLButtonElement>("[data-lab-surface]");
  const canvas = surface?.querySelector("canvas");
  const ink = canvas?.getContext("2d");
  const label = preview.querySelector<HTMLElement>("[data-lab-label]");
  const hint = preview.querySelector<HTMLElement>("[data-lab-hint]");
  const link = preview.querySelector<HTMLAnchorElement>("[data-lab-link]");
  if (!modes || !surface || !canvas || !ink || !label || !hint || !link) return;

  const motion = matchMedia("(prefers-reduced-motion: reduce)");
  const reduce = () => motion.matches || document.documentElement.dataset.motion === "reduce";
  const tabs = [...modes.querySelectorAll<HTMLButtonElement>("button[data-mode]")];
  let demo: Demo = "wave";
  let frame = 0;
  let started = 0;
  let lastPaint = 0;
  let impact: { u: number; v: number } | null = null;
  let width = 0;
  let height = 0;
  let point = { x: .55, y: .54 };
  let dark = document.body.classList.contains("dark-mode");

  const baseHeight = (u: number, v: number) => {
    const edge = .62 + .38 * Math.cos(u * 1.5) * Math.cos(v * 1.5);
    return edge * (.44 * Math.sin(u * 3.4 - v * 2.7 + .8)
      + .24 * Math.sin(u * 5.8 + v * 3.2)
      + .14 * Math.cos(v * 6.6 + u * 1.5));
  };

  const rows = 25;
  const columns = 55;
  const xs = new Float32Array(rows * columns);
  const ys = new Float32Array(rows * columns);

  const drawWave = (progress: number) => {
    const front = progress * 2.65;
    const energy = .62 * Math.pow(1 - progress, 1.25);

    for (let row = 0; row < rows; row++) {
      const v = row / (rows - 1) * 2 - 1;
      for (let column = 0; column < columns; column++) {
        const u = column / (columns - 1) * 2 - 1;
        let elevation = baseHeight(u, v);
        if (impact) {
          const radius = Math.hypot(u - impact.u, v - impact.v);
          const distance = radius - front;
          const falloff = distance * distance * 15;
          const ripple = (1 - 2 * falloff) * Math.exp(-falloff) * energy;
          elevation += ripple + .19 * Math.cos(radius * 12) * Math.exp(-radius * radius * 13);
        }
        const index = row * columns + column;
        xs[index] = width * (.5 + .38 * u - .09 * v);
        ys[index] = height * (.56 + .19 * v + .075 * u - .23 * elevation);
      }
    }

    const threads = ink.createLinearGradient(width * .05, 0, width * .95, 0);
    threads.addColorStop(0, dark ? "#637ce4" : "#526ac0");
    threads.addColorStop(.49, dark ? "#a1c5ff" : "#497bb4");
    threads.addColorStop(1, dark ? "#60d1c1" : "#198c91");

    // A faint wash gives the fine lines a surface without filling every mesh cell.
    ink.beginPath();
    for (let row = 0; row < rows; row++) {
      const i = row * columns;
      if (row === 0) ink.moveTo(xs[i], ys[i]);
      else ink.lineTo(xs[i], ys[i]);
    }
    for (let column = 1; column < columns; column++) {
      const i = (rows - 1) * columns + column;
      ink.lineTo(xs[i], ys[i]);
    }
    for (let row = rows - 2; row >= 0; row--) {
      const i = row * columns + columns - 1;
      ink.lineTo(xs[i], ys[i]);
    }
    for (let column = columns - 2; column >= 0; column--) ink.lineTo(xs[column], ys[column]);
    ink.closePath();
    ink.fillStyle = threads;
    ink.globalAlpha = dark ? .15 : .105;
    ink.fill();

    ink.strokeStyle = threads;
    for (let row = 0; row < rows; row++) {
      const depth = row / (rows - 1);
      ink.globalAlpha = .22 + depth * .54;
      ink.lineWidth = row % 6 === 0 ? 1.05 : .68;
      ink.beginPath();
      for (let column = 0; column < columns; column++) {
        const i = row * columns + column;
        if (column === 0) ink.moveTo(xs[i], ys[i]);
        else ink.lineTo(xs[i], ys[i]);
      }
      ink.stroke();
    }

    ink.lineWidth = .7;
    ink.globalAlpha = dark ? .3 : .24;
    for (let column = 0; column < columns; column += 6) {
      ink.beginPath();
      for (let row = 0; row < rows; row++) {
        const i = row * columns + column;
        if (row === 0) ink.moveTo(xs[i], ys[i]);
        else ink.lineTo(xs[i], ys[i]);
      }
      ink.stroke();
    }
    ink.globalAlpha = 1;
  };

  const pickImpact = () => {
    let nearest = { u: 0, v: 0 };
    let best = Infinity;
    // Pick the nearest point on the projected surface so the wave starts under the tap.
    for (let row = 0; row <= 18; row++) {
      const v = row / 9 - 1;
      for (let column = 0; column <= 32; column++) {
        const u = column / 16 - 1;
        const x = .5 + .38 * u - .09 * v;
        const y = .56 + .19 * v + .075 * u - .23 * baseHeight(u, v);
        const distance = ((x - point.x) * width) ** 2 + ((y - point.y) * height) ** 2;
        if (distance < best) {
          nearest = { u, v };
          best = distance;
        }
      }
    }
    return nearest;
  };

  const draw = (progress = 1) => {
    if (!width || !height) return;
    ink.clearRect(0, 0, width, height);
    if (demo === "wave") {
      drawWave(progress);
    } else {
      const bars = 26;
      const step = (width - 32) / bars;
      const base = height * .77;
      const color = dark ? "170,175,255" : "80,88,178";
      for (let index = 0; index < bars; index++) {
        const t = index / (bars - 1);
        const peak = Math.exp(-Math.pow((t - point.x) * 5.4, 2));
        const ripple = (1 - progress) * Math.sin(index * .72 - progress * 9) * .16;
        const amplitude = height * (.06 + peak * (.42 + .13 * Math.sin(index * .9)) + peak * ripple);
        ink.fillStyle = `rgba(${color}, ${.27 + peak * .54})`;
        ink.fillRect(16 + index * step, base - amplitude, Math.max(2, step - 2), amplitude);
      }
    }
  };

  function stop() {
    cancelAnimationFrame(frame);
    frame = 0;
  }

  function tick(now: number) {
    const progress = Math.min(1, (now - started) / (demo === "wave" ? 1650 : 1250));
    if (progress === 1 || now - lastPaint >= 1000 / 36) {
      draw(progress);
      lastPaint = now;
    }
    frame = progress < 1 ? requestAnimationFrame(tick) : 0;
  }

  const select = (next: Demo) => {
    demo = next;
    impact = null;
    point = { x: .55, y: .54 };
    const config = demos[next];
    for (const tab of tabs) tab.setAttribute("aria-pressed", String(tab.dataset.mode === next));
    surface.setAttribute("aria-label", config.action);
    label.textContent = config.label;
    hint.textContent = config.hint;
    link.href = config.link;
    link.textContent = config.linkText;
    stop();
    draw();
  };

  for (const tab of tabs) {
    tab.addEventListener("click", () => {
      const next = tab.dataset.mode;
      if (next === "wave" || next === "spectrum") select(next);
    });
  }

  surface.addEventListener("click", event => {
    const bounds = surface.getBoundingClientRect();
    const clamp = (value: number) => Math.max(.06, Math.min(.94, value));
    point = event.detail
      ? { x: clamp((event.clientX - bounds.left) / bounds.width), y: clamp((event.clientY - bounds.top) / bounds.height) }
      : { x: demo === "spectrum" && point.x > .5 ? .3 : .65, y: .5 };
    if (demo === "wave") impact = pickImpact();
    stop();
    if (reduce()) draw();
    else {
      started = performance.now();
      lastPaint = 0;
      frame = requestAnimationFrame(tick);
    }
  });

  new ResizeObserver(([entry]) => {
    ({ width, height } = entry.contentRect);
    if (!width || !height) return;
    const ratio = Math.min(window.devicePixelRatio || 1, 1.5);
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    ink.setTransform(ratio, 0, 0, ratio, 0, 0);
    draw();
  }).observe(canvas);

  const respectMotion = () => { if (reduce()) { stop(); draw(); } };
  motion.addEventListener("change", respectMotion);
  new MutationObserver(respectMotion).observe(document.documentElement, { attributeFilter: ["data-motion"] });
  new MutationObserver(() => {
    const next = document.body.classList.contains("dark-mode");
    if (dark !== next) { dark = next; draw(); }
  }).observe(document.body, { attributeFilter: ["class"] });
  preview.addEventListener("toggle", () => { if (!preview.open) stop(); });

  modes.hidden = surface.hidden = false;
  select("wave");
  preview.open = matchMedia("(min-width: 1001px)").matches;
}
