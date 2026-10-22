import { api, LANG } from './api.js';

export function initEdit({ onSaved }) {
  const panel = document.querySelector('#editPanel');
  const form = document.querySelector('#editForm');
  const title = document.querySelector('#editTitle');
  const errorBox = document.querySelector('#editError');
  const closeButton = document.querySelector('#editClose');

  let currentNumber = null;

  async function open(questionNumber) {
    errorBox.hidden = true;
    try {
      const { data } = await api.getQuestion(questionNumber);
      currentNumber = questionNumber;
      title.textContent = `Question ${questionNumber} · ${LANG === 'ar' ? 'Arabic' : 'English'}`;
      form.question.value = data.question;
      form.answer.value = data.answer;
      if (LANG === 'ar') form.needsReview.checked = Boolean(data.needsReview);
      panel.hidden = false;
    } catch (error) {
      errorBox.textContent = error.message;
      errorBox.hidden = false;
    }
  }

  function close() {
    panel.hidden = true;
    currentNumber = null;
  }

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (currentNumber === null) return;
    errorBox.hidden = true;
    try {
      const fields = { question: form.question.value, answer: form.answer.value };
      if (LANG === 'ar') fields.needsReview = form.needsReview.checked;
      await api.updateQuestion(currentNumber, fields);
      close();
      await onSaved();
    } catch (error) {
      errorBox.textContent = error.message;
      errorBox.hidden = false;
    }
  });

  closeButton.addEventListener('click', close);

  return { open, close };
}
