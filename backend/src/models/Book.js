const mongoose = require('mongoose');

const bookSchema = new mongoose.Schema({
  bookNumber: {
    type: Number,
    required: true,
    unique: true,
    min: 1,
    max: 7
  },
  title: {
    type: String,
    required: true,
    trim: true
  },
  volume: {
    type: Number,
    required: true,
    enum: [1, 2]
  },
  questionRange: {
    start: { type: Number, required: true },
    end: { type: Number, required: true }
  },
  description: {
    type: String,
    trim: true
  },
  titleAr: {
    type: String,
    trim: true
  },
  descriptionAr: {
    type: String,
    trim: true
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

// Virtual: get all chapters for this book
bookSchema.virtual('chapters', {
  ref: 'Chapter',
  localField: '_id',
  foreignField: 'book'
});

// Index for fast lookups
bookSchema.index({ bookNumber: 1 });

module.exports = mongoose.model('Book', bookSchema);
