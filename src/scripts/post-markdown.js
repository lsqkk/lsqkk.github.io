const content = document.querySelector(".post-content");

async function copyCode(code, button) {
  try {
    await navigator.clipboard.writeText(code.textContent);
    return true;
  } catch {
    const field = document.createElement("textarea");
    field.value = code.textContent;
    field.className = "post-code-status";
    field.readOnly = true;
    document.body.append(field);
    field.select();
    try {
      return document.execCommand("copy");
    } catch {
      return false;
    } finally {
      field.remove();
      button.focus({ preventScroll: true });
    }
  }
}

function initCodeBlocks() {
  for (const block of content.querySelectorAll(".post-code-block")) {
    const code = block.querySelector("pre > code");
    const wrap = block.querySelector('[data-code-action="wrap"]');
    const copy = block.querySelector('[data-code-action="copy"]');
    const status = block.querySelector(".post-code-status");
    wrap.hidden = copy.hidden = false;
    wrap.addEventListener("click", () => {
      const wrapped = block.classList.toggle("is-wrapped");
      if (wrapped) code.parentElement.scrollLeft = 0;
      wrap.setAttribute("aria-pressed", String(wrapped));
    });

    let reset;
    copy.addEventListener("click", async () => {
      clearTimeout(reset);
      const copied = await copyCode(code, copy);
      copy.textContent = status.textContent = copied ? "已复制" : "复制失败";
      copy.dataset.result = copied ? "success" : "error";
      reset = setTimeout(() => {
        copy.textContent = "复制";
        status.textContent = "";
        delete copy.dataset.result;
      }, 2000);
    });
  }
}

const root = document.documentElement;
const systemTheme = matchMedia("(prefers-color-scheme: dark)");
const resolvedTheme = () => root.dataset.siteResolvedTheme || (systemTheme.matches ? "dark" : "light");
let mermaidModule;
let renderQueue = Promise.resolve();
let nextDiagramId = 0;

function renderMermaid(source, theme) {
  const render = renderQueue.then(async () => {
    mermaidModule ??= import("mermaid");
    const { default: mermaid } = await mermaidModule;
    mermaid.initialize({
      startOnLoad: false,
      securityLevel: "strict",
      suppressErrorRendering: true,
      theme: theme === "dark" ? "dark" : "neutral",
      fontFamily: getComputedStyle(content).fontFamily,
    });
    const { svg } = await mermaid.render(`post-mermaid-${++nextDiagramId}`, source);
    const template = document.createElement("template");
    template.innerHTML = svg;
    const image = template.content.querySelector("svg");
    if (!image) throw new Error("Missing Mermaid SVG");
    const width = image.viewBox.baseVal.width;
    if (width > 0) image.style.setProperty("--post-diagram-width", `${Math.ceil(width)}px`);
    return image;
  });
  renderQueue = render.catch(() => {});
  return render;
}

async function loadPlantUml(url) {
  const response = await fetch(url, {
    referrerPolicy: "no-referrer",
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw new Error("PlantUML rendering failed");
  const image = new Image();
  image.alt = "PlantUML 图表";
  const objectUrl = URL.createObjectURL(await response.blob());
  image.src = objectUrl;
  try {
    await image.decode();
    return image;
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

function initDiagrams() {
  const diagrams = [...content.querySelectorAll("[data-post-diagram]")];
  if (!diagrams.length) return;

  const render = async (figure) => {
    const preview = figure.querySelector(".post-diagram-preview");
    const status = figure.querySelector(".post-diagram-status");
    const details = figure.querySelector("details");
    const isMermaid = figure.dataset.postDiagram === "mermaid";
    const theme = resolvedTheme();
    if (figure.dataset.renderTheme === theme) return;
    figure.dataset.renderTheme = theme;

    status.textContent = "正在渲染图表…";
    status.hidden = !preview.hidden;
    try {
      const source = details.querySelector("code").textContent;
      const image = isMermaid ? await renderMermaid(source, theme) : await loadPlantUml(figure.dataset.diagramUrl);
      if (figure.dataset.renderTheme !== theme) return;
      preview.replaceChildren(image);
      preview.hidden = false;
      status.hidden = true;
    } catch {
      if (figure.dataset.renderTheme !== theme) return;
      status.textContent = preview.hidden ? "图表渲染失败，已展开源码。" : "图表主题更新失败。";
      status.hidden = false;
      if (preview.hidden) details.open = true;
    }
  };

  const observer = new IntersectionObserver((entries) => {
    for (const { target, isIntersecting } of entries) {
      if (!isIntersecting) continue;
      observer.unobserve(target);
      render(target);
    }
  }, { rootMargin: "300px" });
  diagrams.forEach((figure) => observer.observe(figure));

  const refreshMermaid = () => {
    for (const figure of diagrams) {
      if (figure.dataset.postDiagram === "mermaid" && figure.dataset.renderTheme) render(figure);
    }
  };
  new MutationObserver(refreshMermaid).observe(root, {
    attributes: true,
    attributeFilter: ["data-site-resolved-theme"],
  });
  systemTheme.addEventListener("change", refreshMermaid);
}

if (content) {
  initCodeBlocks();
  initDiagrams();
}
