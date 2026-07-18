const mongoose = require('mongoose');

const questionSchema = new mongoose.Schema({
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
    required: true,
    trim: true
  },
  // References to parent hierarchy
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
  // Content metadata
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
  // For quiz generation
  relatedQuestions: [{
    type: Number // questionNumber references
  }],
  tags: [{
    type: String,
    trim: true,
    lowercase: true
  }]
}, {
  timestamps: true
});

// Full-text search index on question and answer
questionSchema.index({
  question: 'text',
  answer: 'text',
  tags: 'text'
}, {
  weights: {
    question: 10,
    tags: 5,
    answer: 1
  },
  name: 'search_index'
});

// Index for fast lookups
questionSchema.index({ book: 1, questionNumber: 1 });
questionSchema.index({ chapter: 1, questionNumber: 1 });
questionSchema.index({ bookNumber: 1 });

module.exports = mongoose.model('Question', questionSchema);
