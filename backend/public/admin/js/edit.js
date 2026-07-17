import { api } from './api.js';

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
      title.textContent = `Question ${questionNumber}`;
      form.question_en.value = data.question_en;
      form.answer_en.value = data.answer_en;
      form.question_ar.value = data.question_ar;
      form.answer_ar.value = data.answer_ar;
      form.needsReview.checked = Boolean(data.needsReview);
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
      await api.updateQuestion(currentNumber, {
        question_en: form.question_en.value,
        answer_en: form.answer_en.value,
        question_ar: form.question_ar.value,
        answer_ar: form.answer_ar.value,
        needsReview: form.needsReview.checked
      });
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
