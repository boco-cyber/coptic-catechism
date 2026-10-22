const mongoose = require('mongoose');

const bookArSchema = new mongoose.Schema({
  bookNumber: {
    type: Number,
    required: true,
    unique: true,
    min: 1,
    max: 7
  },
  sourceBookId: {
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
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

bookArSchema.virtual('sections', {
  ref: 'ChapterAr',
  localField: '_id',
  foreignField: 'book'
});

module.exports = mongoose.model('BookAr', bookArSchema);
