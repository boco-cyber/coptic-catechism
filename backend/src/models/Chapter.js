const mongoose = require('mongoose');

const chapterSchema = new mongoose.Schema({
  book: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Book',
    required: true
  },
  bookNumber: {
    type: Number,
    required: true
  },
  chapterNumber: {
    type: Number,
    required: true
  },
  title: {
    type: String,
    required: true,
    trim: true
  },
  subtitle: {
    type: String,
    trim: true
  },
  titleAr: {
    type: String,
    trim: true
  },
  questionRange: {
    start: { type: Number, required: true },
    end: { type: Number, required: true }
  },
  totalQuestions: {
    type: Number,
    default: 0
  },
  sortOrder: {
    type: Number,
    required: true
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Virtual: get all questions for this chapter
chapterSchema.virtual('questions', {
  ref: 'Question',
  localField: '_id',
  foreignField: 'chapter'
});

// Compound index for unique chapter within a book
chapterSchema.index({ book: 1, chapterNumber: 1 }, { unique: true });
chapterSchema.index({ bookNumber: 1, sortOrder: 1 });

module.exports = mongoose.model('Chapter', chapterSchema);
