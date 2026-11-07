const demos = {
  wave: { label: "WAVE FIELD", action: "激起一道波纹", hint: "点一下，看看波纹怎样从落点散开。", link: "/a/physics/", linkText: "打开 Physics 项目 ↗" },
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
  let width = 0;
  let height = 0;
  let point = { x: .55, y: .54 };
  let dark = document.body.classList.contains("dark-mode");

  const draw = (progress = 1) => {
    if (!width || !height) return;
    ink.clearRect(0, 0, width, height);
    if (demo === "wave") {
      const x = point.x * width;
      const y = point.y * height;
      const color = dark ? "118,210,233" : "29,111,164";
      const spacing = Math.max(11, height * .105);
      ink.lineWidth = 1;
      for (let ring = 0; ring < 7; ring++) {
        const radius = 10 + ring * spacing;
        ink.strokeStyle = `rgba(${color}, ${.62 - ring * .075})`;
        ink.beginPath();
        ink.ellipse(x, y, radius * 1.18, radius, 0, 0, Math.PI * 2);
        ink.stroke();
      }
      if (progress < 1) {
        const radius = 8 + progress * Math.max(width, height) * .88;
        ink.strokeStyle = `rgba(${color}, ${.68 * (1 - progress)})`;
        ink.lineWidth = 2;
        ink.beginPath();
        ink.ellipse(x, y, radius * 1.18, radius, 0, 0, Math.PI * 2);
        ink.stroke();
      }
      ink.fillStyle = `rgb(${color})`;
      ink.beginPath();
      ink.arc(x, y, 2.5, 0, Math.PI * 2);
      ink.fill();
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
    const progress = Math.min(1, (now - started) / 1250);
    draw(progress);
    frame = progress < 1 ? requestAnimationFrame(tick) : 0;
  }

  const select = (next: Demo) => {
    demo = next;
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
    stop();
    if (reduce()) draw();
    else {
      started = performance.now();
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
