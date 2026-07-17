import { api } from './api.js';

const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function initImportExport({ onImported }) {
  const filterForm = document.querySelector('#exportFilters');
  const downloadButton = document.querySelector('#downloadTemplate');
  const fileInput = document.querySelector('#importFile');
  const previewButton = document.querySelector('#previewImport');
  const confirmButton = document.querySelector('#confirmImport');
  const diffBox = document.querySelector('#importDiff');
  const statusBox = document.querySelector('#importStatus');

  function currentFilters() {
    const data = new FormData(filterForm);
    const params = {};
    for (const [key, value] of data.entries()) {
      if (value) params[key] = value;
    }
    return params;
  }

  function renderDiff(result) {
    if (!result.changed.length && !result.errors.length) {
      diffBox.textContent = 'No changes detected.';
      return;
    }
    const changeRows = result.changed.flatMap((item) =>
      item.changes.map((c) => `
        <tr>
          <td>${esc(item.questionNumber)}</td>
          <td>${esc(c.field)}</td>
          <td class="old-value">${esc(c.oldValue).slice(0, 200)}</td>
          <td class="new-value">${esc(c.newValue).slice(0, 200)}</td>
        </tr>
      `)
    ).join('');
    const errorRows = result.errors.map((e) => `<tr class="error-row"><td colspan="4">row ${esc(e.row)}: ${esc(e.message)}</td></tr>`).join('');
    diffBox.innerHTML = `<table><thead><tr><th>Q#</th><th>Field</th><th>Old</th><th>New</th></tr></thead><tbody>${changeRows}${errorRows}</tbody></table>`;
  }

  downloadButton.addEventListener('click', () => {
    window.location.href = api.exportUrl(currentFilters());
  });

  previewButton.addEventListener('click', async () => {
    const file = fileInput.files[0];
    if (!file) {
      statusBox.textContent = 'Choose a file first.';
      return;
    }
    statusBox.textContent = 'Checking file…';
    confirmButton.disabled = true;
    try {
      const result = await api.importDryRun(file);
      renderDiff(result);
      confirmButton.disabled = result.errors.length > 0 || result.changed.length === 0;
      statusBox.textContent = `${result.changed.length} row(s) changed, ${result.unchanged} unchanged, ${result.errors.length} error(s).`;
    } catch (error) {
      statusBox.textContent = error.message;
    }
  });

  confirmButton.addEventListener('click', async () => {
    const file = fileInput.files[0];
    if (!file) return;
    statusBox.textContent = 'Importing…';
    try {
      const result = await api.importCommit(file);
      statusBox.textContent = `Imported ${result.updated} row(s).`;
      diffBox.innerHTML = '';
      confirmButton.disabled = true;
      await onImported();
    } catch (error) {
      statusBox.textContent = error.message;
    }
  });
}
