import { api } from './api.js';

const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function initBrowse({ onRowSelected }) {
  const tableBody = document.querySelector('#browseTable tbody');
  const status = document.querySelector('#browseStatus');
  const form = document.querySelector('#browseFilters');
  const prevButton = document.querySelector('#browsePrev');
  const nextButton = document.querySelector('#browseNext');

  let page = 1;
  let totalPages = 1;

  function currentFilters() {
    const data = new FormData(form);
    const params = {};
    for (const [key, value] of data.entries()) {
      if (value) params[key] = value;
    }
    params.page = page;
    params.limit = 20;
    return params;
  }

  function renderRows(rows) {
    tableBody.innerHTML = '';
    for (const row of rows) {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${esc(row.questionNumber)}</td>
        <td>${esc(row.bookNumber)}</td>
        <td class="snippet">${esc(row.question_en).slice(0, 60)}</td>
        <td class="snippet" dir="rtl">${esc(row.question_ar).slice(0, 60)}</td>
        <td>${row.needsReview ? '<span class="badge badge-warn">needs review</span>' : '<span class="badge badge-ok">reviewed</span>'}</td>
      `;
      tr.addEventListener('click', () => onRowSelected(row.questionNumber));
      tableBody.appendChild(tr);
    }
  }

  async function load() {
    status.textContent = 'Loading…';
    try {
      const result = await api.listQuestions(currentFilters());
      totalPages = result.totalPages || 1;
      renderRows(result.data);
      status.textContent = `${result.total} result(s) · page ${result.page} of ${totalPages}`;
    } catch (error) {
      status.textContent = error.message;
    }
  }

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    page = 1;
    load();
  });
  prevButton.addEventListener('click', () => { if (page > 1) { page -= 1; load(); } });
  nextButton.addEventListener('click', () => { if (page < totalPages) { page += 1; load(); } });

  load();

  return { reload: load };
}
