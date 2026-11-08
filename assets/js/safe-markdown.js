(() => {
  const allowed = new Set('A B BLOCKQUOTE BR CODE DEL DIV EM H1 H2 H3 H4 H5 H6 HR I KBD LI OL P PRE S SPAN STRONG TABLE TBODY TD TH THEAD TR UL'.split(' '));
  const discard = new Set('SCRIPT STYLE IFRAME OBJECT EMBED SVG MATH TEMPLATE FORM INPUT TEXTAREA BUTTON'.split(' '));

  window.QuarkSanitizeMarkdownHtml = (html, { editor = false } = {}) => {
    const template = document.createElement('template');
    template.innerHTML = html;
    for (const node of template.content.querySelectorAll('*')) {
      const tag = node.tagName;
      if (discard.has(tag) || node.namespaceURI !== 'http://www.w3.org/1999/xhtml') {
        node.remove();
        continue;
      }
      if (!allowed.has(tag) && !(editor && tag === 'IMG')) {
        node.replaceWith(...node.childNodes);
        continue;
      }
      for (const attribute of [...node.attributes]) {
        const { name, value } = attribute;
        if (tag === 'A' && name === 'href') {
          try {
            if (['http:', 'https:', 'mailto:'].includes(new URL(value, location.href).protocol)) continue;
          } catch {}
        }
        if (tag === 'CODE' && name === 'class' && /^language-[\w+-]+$/.test(value)) continue;
        if (tag === 'OL' && name === 'start' && /^\d+$/.test(value)) continue;
        if (editor && name === 'class' && ['mermaid', 'math-block', 'math-inline', 'md-image', 'md-link'].includes(value)) continue;
        if (editor && tag === 'IMG' && name === 'alt') continue;
        if (editor && tag === 'IMG' && name === 'src') {
          try {
            if (['http:', 'https:'].includes(new URL(value, location.href).protocol) || /^data:image\/(?:png|jpeg|gif|webp);base64,/i.test(value)) continue;
          } catch {}
        }
        node.removeAttribute(name);
      }
      if (tag === 'A') node.rel = 'noopener noreferrer';
    }
    return template.innerHTML;
  };
  window.QuarkSafeMarkdown = (source, { bareLinks = true, editor = false } = {}) => {
    if (!window.marked) {
      const template = document.createElement('template');
      template.content.append(document.createTextNode(String(source ?? '')));
      return template.innerHTML;
    }
    const options = { breaks: true };
    if (!bareLinks) {
      // Leave bare URLs as text so QuarkBot can find their boundaries after Markdown parsing.
      const tokenizer = new window.marked.Tokenizer();
      tokenizer.url = () => undefined;
      options.tokenizer = tokenizer;
    }
    return window.QuarkSanitizeMarkdownHtml(window.marked.parse(String(source ?? ''), options), { editor });
  };
})();
