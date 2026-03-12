// @ts-check

(function () {
  if (window.CommentRenderShared) return;

  function getMarked() {
    return window.marked && typeof window.marked.parse === 'function' ? window.marked : null;
  }

  function escapeHtml(text) {
    const shared = window.CommentShared;
    if (shared && typeof shared.escapeHtml === 'function') {
      return shared.escapeHtml(text);
    }
    return String(text ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function renderMarkdown(text, useMarkdown) {
    const raw = String(text ?? '');
    if (!useMarkdown) {
      return escapeHtml(raw).replace(/\n/g, '<br>');
    }
    const marked = getMarked();
    if (!marked) {
      return escapeHtml(raw).replace(/\n/g, '<br>');
    }
    return marked.parse(raw);
  }

  function formatTime(timestamp) {
    if (!timestamp) return '未知时间';
    const date = new Date(timestamp);
    return date.toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  function buildReplyTree(replies) {
    if (!replies) return { roots: [], map: {} };
    const replyMap = {};
    Object.keys(replies).forEach((key) => {
      const reply = replies[key];
      reply.id = key;
      reply.replies = [];
      replyMap[key] = reply;
    });
    const roots = [];
    Object.keys(replyMap).forEach((key) => {
      const reply = replyMap[key];
      if (reply.parentReplyId && replyMap[reply.parentReplyId]) {
        replyMap[reply.parentReplyId].replies.push(reply);
      } else {
        roots.push(reply);
      }
    });
    roots.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
    return { roots, map: replyMap };
  }

  window.CommentRenderShared = {
    renderMarkdown,
    formatTime,
    buildReplyTree
  };
})();
