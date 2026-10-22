(() => {
  const copy = {
    en: {
      kicker: 'Coptic Orthodox Catechesis',
      title: 'The Coptic Catechism',
      author: 'Fr. Tadros Y. Malaty',
      intro: 'Explore {total} questions and answers about the Orthodox Christian faith.',
      searchLabel: 'Search questions',
      searchPlaceholder: 'Faith, baptism, prayer…',
      searchButton: 'Search',
      previous: 'Previous',
      next: 'Next',
      footer: 'Catechism of the Coptic Orthodox Church · Questions 1–{total}',
      loading: 'Loading questions…',
      range: 'Questions',
      of: 'of',
      none: 'No questions found.',
      error: 'Unable to load questions.',
      footnotes: 'Footnotes'
    },
    ar: {
      kicker: 'التعليم الكنسي القبطي الأرثوذكسي',
      title: 'الكاتيكيزم القبطي',
      author: 'القمص تادرس يعقوب ملطي',
      intro: 'استكشف {total} سؤالًا وجوابًا عن الإيمان المسيحي الأرثوذكسي.',
      searchLabel: 'ابحث في الأسئلة',
      searchPlaceholder: 'الإيمان، المعمودية، الصلاة…',
      searchButton: 'بحث',
      previous: 'السابق',
      next: 'التالي',
      footer: 'كاتيكيزم الكنيسة القبطية الأرثوذكسية · الأسئلة ١–{total}',
      loading: 'جارٍ تحميل الأسئلة…',
      range: 'الأسئلة',
      of: 'من',
      none: 'لا توجد أسئلة.',
      error: 'تعذّر تحميل الأسئلة.',
      footnotes: 'الهوامش'
    }
  };

  let lang = location.pathname.startsWith('/ar')
    ? 'ar'
    : (localStorage.getItem('ccfm-lang') || 'en');
  let start = 1;
  let end = 20;
  let searching = false;
  let page = 1;
  let totalPages = 1;
  const totals = { en: 1452, ar: 1424 };
  const maxima = { en: 1452, ar: 1424 };

  const list = document.querySelector('#questions');
  const status = document.querySelector('#status');
  const notice = document.querySelector('#notice');
  const field = document.querySelector('#search');

  const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[character]));

  function formatNumber(value) {
    return new Intl.NumberFormat(lang === 'ar' ? 'ar-EG' : 'en-US').format(value);
  }

  function fill(template) {
    return template.replace(/\{total\}/g, formatNumber(totals[lang]));
  }

  function localize() {
    const current = copy[lang];
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
    document.title = current.title;
    document.querySelectorAll('[data-copy]').forEach((node) => {
      const template = current[node.dataset.copy];
      if (template) node.textContent = fill(template);
    });
    document.querySelectorAll('[data-placeholder]').forEach((node) => {
      node.placeholder = current[node.dataset.placeholder];
    });
    document.querySelectorAll('[data-lang]').forEach((node) => {
      node.classList.toggle('active', node.dataset.lang === lang);
    });
  }

  function render(rows) {
    const current = copy[lang];
    notice.hidden = true;
    if (!rows.length) {
      list.innerHTML = `<div class="notice">${current.none}</div>`;
      return;
    }
    const markdown = window.CopticMarkdown?.renderSafeMarkdown;
    list.innerHTML = rows.map((question) => {
      const footnotes = Array.isArray(question.footnotes) && question.footnotes.length
        ? `<div class="footnotes"><h3>${current.footnotes}</h3>${question.footnotes.map((footnote) => `<p>${esc(footnote)}</p>`).join('')}</div>`
        : '';
      const image = question.image
        ? `<img class="question-image" src="${esc(question.image)}" alt="" loading="lazy">`
        : '';
      const answer = markdown
        ? markdown(question.answer || '')
        : esc(question.answer || '').replace(/\n/g, '<br>');
      return `<article class="question-card"><p class="meta">${current.range} ${formatNumber(question.questionNumber)} · ${esc(question.book?.title || '')} · ${esc(question.chapter?.title || question.chapterTitle || '')}</p><h2>${esc(question.question)}</h2><div class="answer">${answer}</div>${image}${footnotes}</article>`;
    }).join('');
  }

  async function loadStats() {
    try {
      const response = await fetch('/api/stats');
      const body = await response.json();
      if (!response.ok || !body.success) return;
      const data = body.data;
      totals.en = data.questionsByLang?.en ?? totals.en;
      totals.ar = data.questionsByLang?.ar ?? totals.ar;
      maxima.en = data.maxQuestionNumber?.en ?? maxima.en;
      maxima.ar = data.maxQuestionNumber?.ar ?? maxima.ar;
      localize();
    } catch {
      // Keep the known defaults.
    }
  }

  async function load() {
    const current = copy[lang];
    status.textContent = current.loading;
    list.innerHTML = '';
    try {
      const url = searching
        ? `/api/search?q=${encodeURIComponent(field.value.trim())}&page=${page}&limit=20&lang=${lang}`
        : `/api/questions/range/${start}/${end}?lang=${lang}`;
      const response = await fetch(url);
      const body = await response.json();
      if (!response.ok || !body.success) throw new Error(body.error);
      const rows = body.data || [];
      totalPages = body.totalPages || 1;
      if (body.maxQuestionNumber) maxima[lang] = body.maxQuestionNumber;
      render(rows);
      status.textContent = searching
        ? `${current.range} ${formatNumber(rows.length)} ${current.of} ${formatNumber(body.total || rows.length)}`
        : `${current.range} ${formatNumber(start)}–${formatNumber(Math.min(end, maxima[lang]))} ${current.of} ${formatNumber(totals[lang])}`;
    } catch (error) {
      status.textContent = current.error;
      notice.textContent = error.message || current.error;
      notice.hidden = false;
    }
  }

  function resetCatalogue() {
    start = 1;
    end = 20;
    searching = false;
    page = 1;
    field.value = '';
  }

  document.querySelectorAll('[data-lang]').forEach((button) => {
    button.addEventListener('click', () => {
      lang = button.dataset.lang;
      localStorage.setItem('ccfm-lang', lang);
      history.replaceState({}, '', lang === 'ar' ? '/ar/' : '/');
      resetCatalogue();
      localize();
      load();
    });
  });

  document.querySelector('#searchForm').addEventListener('submit', (event) => {
    event.preventDefault();
    if (field.value.trim().length < 2) return;
    searching = true;
    page = 1;
    load();
  });

  document.querySelector('#previous').addEventListener('click', () => {
    if (searching) {
      page = Math.max(1, page - 1);
    } else {
      start = Math.max(1, start - 20);
      end = Math.min(start + 19, maxima[lang]);
    }
    load();
  });

  document.querySelector('#next').addEventListener('click', () => {
    if (searching) {
      page = Math.min(totalPages, page + 1);
    } else {
      const lastPageStart = Math.floor((maxima[lang] - 1) / 20) * 20 + 1;
      start = Math.min(start + 20, lastPageStart);
      end = Math.min(start + 19, maxima[lang]);
    }
    load();
  });

  localize();
  loadStats().then(load);
})();
