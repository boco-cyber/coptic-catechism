const mongoose = require('mongoose');

const questionArSchema = new mongoose.Schema({
  questionNumber: {
    type: Number,
    required: true,
    unique: true,
    min: 1,
    max: 1452
  },
  question: {
    type: String,
    required: true,
    trim: true
  },
  answer: {
    type: String,
    trim: true,
    default: ''
  },
  book: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Book',
    required: true
  },
  chapter: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Chapter',
    required: true
  },
  bookNumber: {
    type: Number,
    required: true
  },
  chapterTitle: {
    type: String,
    trim: true
  },
  scriptureReferences: [{
    type: String,
    trim: true
  }],
  patristicQuotes: [{
    author: { type: String, trim: true },
    text: { type: String, trim: true },
    source: { type: String, trim: true }
  }],
  footnotes: [{
    type: String,
    trim: true
  }],
  relatedQuestions: [{
    type: Number
  }],
  tags: [{
    type: String,
    trim: true,
    lowercase: true
  }],
  needsReview: {
    type: Boolean,
    default: false
  },
  reviewedBy: {
    type: String,
    trim: true
  },
  reviewedAt: {
    type: Date
  }
}, {
  timestamps: true
});

questionArSchema.index({
  question: 'text',
  answer: 'text',
  tags: 'text'
}, {
  default_language: 'arabic',
  weights: {
    question: 10,
    tags: 5,
    answer: 1
  },
  name: 'search_index_ar'
});

questionArSchema.index({ questionNumber: 1 });
questionArSchema.index({ book: 1, questionNumber: 1 });
questionArSchema.index({ chapter: 1, questionNumber: 1 });
questionArSchema.index({ bookNumber: 1 });
questionArSchema.index({ needsReview: 1 });

module.exports = mongoose.model('QuestionAr', questionArSchema);
