const BASE = '/admin/api';
export const LANG = new URLSearchParams(location.search).get('lang') === 'ar' ? 'ar' : 'en';

async function request(path, { method = 'GET', body, isForm = false, redirectOnUnauthorized = true } = {}) {
  const headers = {};
  if (method !== 'GET') headers['X-Requested-With'] = 'admin-ui';
  if (body && !isForm) headers['Content-Type'] = 'application/json';

  const response = await fetch(`${BASE}${path}`, {
    method,
    headers,
    credentials: 'same-origin',
    body: body ? (isForm ? body : JSON.stringify(body)) : undefined
  });

  if (response.status === 401 && redirectOnUnauthorized) {
    window.location.href = '/admin/login.html';
    throw new Error('Not authenticated');
  }

  const contentType = response.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) {
    if (!response.ok) throw new Error(`Request failed (${response.status})`);
    return response;
  }

  const data = await response.json();
  if (!response.ok || !data.success) {
    throw new Error(data.error || `Request failed (${response.status})`);
  }
  return data;
}

export const api = {
  me: () => request('/me'),
  login: (username, password) => request('/login', {
    method: 'POST',
    body: { username, password },
    redirectOnUnauthorized: false
  }),
  logout: () => request('/logout', { method: 'POST' }),
  listQuestions: (params) => request(`/questions?${new URLSearchParams({ ...params, lang: LANG })}`),
  getQuestion: (questionNumber) => request(`/questions/${questionNumber}?lang=${LANG}`),
  updateQuestion: (questionNumber, fields) => request(`/questions/${questionNumber}?lang=${LANG}`, { method: 'PUT', body: fields }),
  stats: () => request(`/stats?lang=${LANG}`),
  exportUrl: (params) => `${BASE}/export?${new URLSearchParams({ ...params, lang: LANG })}`,
  importDryRun: (file) => {
    const form = new FormData();
    form.append('file', file);
    return request(`/import?dryRun=true&lang=${LANG}`, { method: 'POST', body: form, isForm: true });
  },
  importCommit: (file) => {
    const form = new FormData();
    form.append('file', file);
    return request(`/import?dryRun=false&lang=${LANG}`, { method: 'POST', body: form, isForm: true });
  }
};
