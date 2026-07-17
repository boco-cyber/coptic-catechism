import { api } from './api.js';

const form = document.querySelector('#loginForm');
const errorBox = document.querySelector('#loginError');

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  errorBox.hidden = true;
  const username = form.username.value.trim();
  const password = form.password.value;
  try {
    await api.login(username, password);
    window.location.href = '/admin/index.html';
  } catch (error) {
    errorBox.textContent = error.message;
    errorBox.hidden = false;
  }
});
