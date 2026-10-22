const mongoose = require('mongoose');

const chapterArSchema = new mongoose.Schema({
  book: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'BookAr',
    required: true
  },
  bookNumber: {
    type: Number,
    required: true
  },
  chapterNumber: {
    type: Number,
    required: true,
    min: 1
  },
  sourceSectionId: {
    type: Number,
    required: true,
    unique: true
  },
  title: {
    type: String,
    required: true,
    trim: true
  },
  slug: {
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

chapterArSchema.virtual('questions', {
  ref: 'QuestionAr',
  localField: '_id',
  foreignField: 'chapter'
});

chapterArSchema.index({ book: 1, chapterNumber: 1 }, { unique: true });
chapterArSchema.index({ bookNumber: 1, sortOrder: 1 });

module.exports = mongoose.model('ChapterAr', chapterArSchema);
