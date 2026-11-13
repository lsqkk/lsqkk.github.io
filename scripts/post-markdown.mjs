import { deflateRawSync } from "node:zlib";

export const diagramLanguages = ["mermaid", "plantuml", "puml", "uml"];

const languageLabels = new Map(Object.entries({
  plaintext: "纯文本", text: "纯文本", txt: "纯文本",
  js: "JavaScript", javascript: "JavaScript", ts: "TypeScript", typescript: "TypeScript",
  py: "Python", python: "Python", cpp: "C++", cs: "C#", csharp: "C#",
  sh: "Shell", shell: "Shell", shellscript: "Shell", html: "HTML", xml: "XML",
  css: "CSS", json: "JSON", sql: "SQL", yaml: "YAML", yml: "YAML",
  md: "Markdown", markdown: "Markdown", nginx: "Nginx", php: "PHP",
}));

const text = (value) => ({ type: "text", value });
const element = (tagName, properties, children = []) => ({ type: "element", tagName, properties, children });
const hasTag = (node, tagName) => node.type === "element" && node.tagName === tagName;
const classes = (node) => [].concat(node.properties.className || []).join(" ").split(/\s+/);
const sourceText = (node) => node.type === "text" ? node.value : (node.children || []).map(sourceText).join("");

function plantUmlUrl(source) {
  const diagram = /^\s*@start\w+\b/i.test(source) ? source : `@startuml\n${source}\n@enduml`;
  const base64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  const alphabet = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz-_";
  const encoded = deflateRawSync(diagram).toString("base64").replace(/=+$/, "")
    .replace(/./g, (char) => alphabet[base64.indexOf(char)]);
  return `https://www.plantuml.com/plantuml/svg/${encoded}`;
}

function codeBlock(pre, label) {
  const actions = [
    element("button", { type: "button", dataCodeAction: "wrap", ariaPressed: "false", hidden: true }, [text("自动换行")]),
    element("button", { type: "button", dataCodeAction: "copy", hidden: true }, [text("复制")]),
  ];
  const toolbar = element("div", { className: ["post-code-toolbar"] }, [
    element("span", { className: ["post-code-language"] }, [text(label)]),
    element("div", { className: ["post-code-actions"] }, actions),
    element("span", { className: ["post-code-status"], role: "status" }),
  ]);
  pre.properties.tabIndex = 0;
  pre.properties.ariaLabel = `${label}代码`;
  return element("div", { className: ["post-code-block"] }, [toolbar, pre]);
}

function diagramBlock(pre, type, label, source) {
  const properties = { className: ["post-diagram"], dataPostDiagram: type, ariaLabel: `${label} 图表` };
  if (type === "plantuml") properties.dataDiagramUrl = plantUmlUrl(source);
  return element("figure", properties, [
    element("figcaption", { className: ["post-diagram-caption"] }, [text(label)]),
    element("div", { className: ["post-diagram-preview"], role: "region", ariaLabel: `${label} 预览`, tabIndex: 0, hidden: true }),
    element("p", { className: ["post-diagram-status"], role: "status", hidden: true }),
    element("details", { className: ["post-diagram-source"] }, [
      element("summary", {}, [text("图表源码")]),
      codeBlock(pre, label),
    ]),
  ]);
}

export function rehypePostMarkdown() {
  return (tree, file) => {
    if (!/(?:^|[/\\])posts[/\\].+\.md$/i.test(file.path || "")) return;

    function visit(parent) {
      parent.children?.forEach((node, index) => {
        if (hasTag(node, "ol")) {
          const start = Number(node.properties.start ?? 1);
          const count = node.children.filter((child) => hasTag(child, "li")).length;
          const digits = Math.max(String(start).length, String(start + count - 1).length);
          if (Number.isInteger(start) && digits > 2) {
            const existingStyle = node.properties.style ? `${node.properties.style};` : "";
            node.properties.style = `${existingStyle}--post-list-indent:${digits + 2}ch`;
          }
        }
        if (!hasTag(node, "pre")) {
          visit(node);
          return;
        }

        const code = node.children.find((child) => hasTag(child, "code"));
        const fence = code && classes(code).find((name) => /^(language|lang)-/.test(name));
        const language = (node.properties.dataLanguage || fence?.replace(/^(language|lang)-/, "") || "").toLowerCase();
        const type = classes(node).includes("mermaid") ? "mermaid" : language;
        if (diagramLanguages.includes(type)) {
          const source = sourceText(code || node).replace(/\r?\n$/, "");
          const diagramType = type === "mermaid" ? "mermaid" : "plantuml";
          const label = diagramType === "mermaid" ? "Mermaid" : "PlantUML";
          const pre = element("pre", {}, [element("code", {}, [text(source)])]);
          parent.children[index] = diagramBlock(pre, diagramType, label, source);
        } else if (code && language !== "math") {
          const label = languageLabels.get(language) || (language ? language.toUpperCase() : "纯文本");
          parent.children[index] = codeBlock(node, label);
        }
      });
    }

    visit(tree);
  };
}
