const {
  Book,
  Chapter,
  Question,
  BookAr,
  ChapterAr,
  QuestionAr
} = require('../models');

const MAX_QUESTION_NUMBER = { en: 1452, ar: 1424 };

function catalogueFor(lang) {
  if (lang === 'ar') {
    return {
      Book: BookAr,
      Chapter: ChapterAr,
      Question: QuestionAr,
      maxQuestionNumber: MAX_QUESTION_NUMBER.ar
    };
  }
  return {
    Book,
    Chapter,
    Question,
    maxQuestionNumber: MAX_QUESTION_NUMBER.en
  };
}

function maxQuestionNumber(lang) {
  return MAX_QUESTION_NUMBER[lang] || MAX_QUESTION_NUMBER.en;
}

module.exports = { catalogueFor, maxQuestionNumber, MAX_QUESTION_NUMBER };
