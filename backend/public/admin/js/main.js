import { api } from './api.js';
import { initBrowse } from './browse.js';
import { initEdit } from './edit.js';
import { initImportExport } from './importExport.js';

const tabs = document.querySelectorAll('[data-tab]');
const panels = document.querySelectorAll('[data-panel]');
const statsBox = document.querySelector('#stats');
const logoutButton = document.querySelector('#logout');

function showTab(name) {
  tabs.forEach((tab) => tab.classList.toggle('active', tab.dataset.tab === name));
  panels.forEach((panel) => { panel.hidden = panel.dataset.panel !== name; });
}

tabs.forEach((tab) => tab.addEventListener('click', () => showTab(tab.dataset.tab)));

logoutButton.addEventListener('click', async () => {
  await api.logout();
  window.location.href = '/admin/login.html';
});

async function refreshStats() {
  const { data } = await api.stats();
  statsBox.textContent = `${data.needsReview} of ${data.total} need review`;
}

async function init() {
  try {
    await api.me();
  } catch {
    return;
  }
  await refreshStats();
  const edit = initEdit({ onSaved: async () => { await refreshStats(); browse.reload(); } });
  const browse = initBrowse({ onRowSelected: edit.open });
  initImportExport({ onImported: async () => { await refreshStats(); browse.reload(); } });
  showTab('browse');
}

init();
