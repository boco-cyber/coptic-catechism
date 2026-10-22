import { api, LANG } from './api.js';
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
  statsBox.textContent = LANG === 'ar'
    ? `${data.needsReview} of ${data.total} need review`
    : `${data.total} English questions`;
}

async function init() {
  document.querySelectorAll('[data-admin-lang]').forEach((link) => {
    link.classList.toggle('active', link.dataset.adminLang === LANG);
  });
  document.querySelectorAll('[data-lang-only]').forEach((node) => {
    if (node.dataset.langOnly !== LANG) node.hidden = true;
  });
  document.querySelector('#editForm').dir = LANG === 'ar' ? 'rtl' : 'ltr';
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
