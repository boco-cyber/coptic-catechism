(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  } else {
    root.CopticMarkdown = api;
  }
})(typeof self !== 'undefined' ? self : this, function () {
  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, (character) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    }[character]));
  }

  function inline(value) {
    return escapeHtml(value).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  }

  function renderSafeMarkdown(text) {
    const lines = String(text ?? '').split(/\r?\n/);
    const output = [];
    let paragraph = [];
    let quote = [];
    let list = null;

    function flushParagraph() {
      if (paragraph.length) {
        output.push(`<p>${inline(paragraph.join(' '))}</p>`);
        paragraph = [];
      }
    }

    function flushQuote() {
      if (quote.length) {
        output.push(`<blockquote>${inline(quote.join(' '))}</blockquote>`);
        quote = [];
      }
    }

    function flushList() {
      if (list) {
        output.push(`<${list.type}>${list.items.map((item) => `<li>${inline(item)}</li>`).join('')}</${list.type}>`);
        list = null;
      }
    }

    function startList(type) {
      if (!list || list.type !== type) {
        flushList();
        list = { type, items: [] };
      }
    }

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) {
        flushParagraph();
        flushQuote();
        continue;
      }

      let match = trimmed.match(/^>\s?(.*)$/);
      if (match) {
        flushParagraph();
        flushList();
        quote.push(match[1]);
        continue;
      }

      match = trimmed.match(/^[*•●▪◦-]\s+(.*)$/);
      if (match) {
        flushParagraph();
        flushQuote();
        startList('ul');
        list.items.push(match[1]);
        continue;
      }

      match = trimmed.match(/^([0-9٠-٩]+)\s*[-.)]\s*(.*)$/);
      if (match) {
        flushParagraph();
        flushQuote();
        startList('ol');
        list.items.push(match[2]);
        continue;
      }

      flushQuote();
      flushList();
      paragraph.push(trimmed);
    }

    flushParagraph();
    flushQuote();
    flushList();
    return output.join('');
  }

  return { renderSafeMarkdown, escapeHtml };
});
