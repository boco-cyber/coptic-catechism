const mongoose = require('mongoose');

const englishContentBlockSchema = new mongoose.Schema({
  sourceBlockId: { type: String, required: true, unique: true },
  sourceVolumeId: { type: String, required: true },
  volumeNumber: { type: Number, required: true, enum: [1, 2] },
  bookNumber: { type: Number, min: 1, max: 7, default: null },
  sourceSectionId: { type: String, default: null },
  relatedSourceQuestionId: { type: String, default: null },
  relatedQuestionNumber: { type: Number, default: null },
  blockType: {
    type: String,
    required: true,
    enum: ['front_matter', 'section_introduction', 'footnote', 'back_matter']
  },
  text: { type: String, required: true },
  sequenceInBook: { type: Number, required: true },
  pdfPageStart: { type: Number, required: true },
  pdfPageEnd: { type: Number, required: true }
}, { timestamps: true });

englishContentBlockSchema.index({
  bookNumber: 1,
  blockType: 1,
  sequenceInBook: 1
});
englishContentBlockSchema.index({
  sourceVolumeId: 1,
  blockType: 1,
  sequenceInBook: 1
});
englishContentBlockSchema.index({ relatedQuestionNumber: 1 });

module.exports = mongoose.model('EnglishContentBlock', englishContentBlockSchema);
