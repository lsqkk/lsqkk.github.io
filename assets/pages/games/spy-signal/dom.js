// @ts-check
/**
 * 「谍报风云」DOM 构造工具。
 *
 * 界面全部由这些函数生成节点，用户输入一律经 `textContent` 写入，
 * 从不拼接 innerHTML，因此昵称 / 暗号 / 笔记里的任何字符都不会被当作 HTML 解析。
 */

/**
 * @typedef {Node | string | number | null | undefined | false} Child
 */

/**
 * 创建元素。
 * @param {string} tag
 * @param {Record<string, any> | null} [props]
 * @param {Child | Child[]} [children]
 * @returns {any}
 */
export function el(tag, props, children) {
  const node = document.createElement(tag);
  if (props) {
    applyProps(node, props);
  }
  append(node, children);
  return node;
}

/**
 * @param {any} node
 * @param {Record<string, any>} props
 */
function applyProps(node, props) {
  for (const [key, value] of Object.entries(props)) {
    if (value === null || value === undefined || value === false) continue;

    if (key === "class") node.className = String(value);
    else if (key === "text") node.textContent = String(value);
    else if (key === "style" && typeof value === "object") Object.assign(node.style, value);
    else if (key === "dataset" && typeof value === "object") Object.assign(node.dataset, value);
    else if (key === "on" && typeof value === "object") {
      for (const [type, handler] of Object.entries(value)) {
        node.addEventListener(type, handler);
      }
    } else if (key === "attrs" && typeof value === "object") {
      for (const [name, attrValue] of Object.entries(value)) {
        if (attrValue === null || attrValue === undefined) continue;
        node.setAttribute(name, String(attrValue));
      }
    } else if (key === "value") node.value = value;
    else if (key === "checked" || key === "disabled" || key === "hidden" || key === "selected") {
      node[key] = value === true;
    } else if (key === "type" || key === "placeholder" || key === "maxlength" || key === "name") {
      node.setAttribute(key, String(value));
    } else node.setAttribute(key, String(value));
  }
}

/**
 * @param {any} parent
 * @param {Child | Child[]} children
 */
export function append(parent, children) {
  if (children === null || children === undefined || children === false) return parent;
  if (Array.isArray(children)) {
    for (const child of children) append(parent, child);
    return parent;
  }
  if (children instanceof Node) {
    parent.appendChild(children);
    return parent;
  }
  parent.appendChild(document.createTextNode(String(children)));
  return parent;
}

/**
 * 文档片段。
 * @param {Child | Child[]} children
 * @returns {DocumentFragment}
 */
export function frag(children) {
  const fragment = document.createDocumentFragment();
  append(fragment, children);
  return fragment;
}

/**
 * @param {any} node
 */
export function clear(node) {
  if (!node) return;
  while (node.firstChild) node.removeChild(node.firstChild);
}

/**
 * @param {string} id
 * @returns {any}
 */
export function byId(id) {
  return document.getElementById(id);
}

/**
 * 重新渲染但保留输入框内容与焦点/光标位置。
 *
 * RTDB 每次变更都会触发整屏重绘，如果不做保留，别人切换在线状态就会
 * 把正在填写的暗号清空。这里在渲染前记录 value 与光标，渲染后还原。
 * @param {any} root
 * @param {() => void} render
 */
export function withPreservedInputs(root, render) {
  const active = document.activeElement;
  const activeId =
    active && root.contains(active) && active.id ? String(active.id) : null;
  const selectionStart =
    activeId && typeof (/** @type {any} */ (active).selectionStart) === "number"
      ? /** @type {any} */ (active).selectionStart
      : null;

  /** @type {Map<string, string>} */
  const values = new Map();
  for (const node of root.querySelectorAll("input, textarea, select")) {
    if (node.id) values.set(node.id, node.value);
  }

  render();

  for (const node of root.querySelectorAll("input, textarea, select")) {
    if (node.id && values.has(node.id)) node.value = values.get(node.id);
  }

  if (activeId) {
    const next = root.querySelector(`#${cssEscape(activeId)}`);
    if (next && typeof next.focus === "function") {
      next.focus();
      if (selectionStart !== null && typeof next.setSelectionRange === "function") {
        try {
          next.setSelectionRange(selectionStart, selectionStart);
        } catch {
          /* 某些 input type 不支持 setSelectionRange，忽略 */
        }
      }
    }
  }
}

/**
 * @param {string} value
 * @returns {string}
 */
function cssEscape(value) {
  if (window.CSS && typeof window.CSS.escape === "function") {
    return window.CSS.escape(value);
  }
  return value.replace(/[^a-zA-Z0-9_-]/g, "\\$&");
}

/**
 * 复制文本到剪贴板，失败时退回选中输入框内容。
 * @param {string} text
 * @returns {Promise<boolean>}
 */
export async function copyText(text) {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* 继续尝试兜底方案 */
  }

  try {
    const helper = /** @type {any} */ (
      el("textarea", { value: text, style: { position: "fixed", opacity: "0" } })
    );
    document.body.appendChild(helper);
    helper.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(helper);
    return ok;
  } catch {
    return false;
  }
}
