const mongoose = require('mongoose');

const englishExtractionIssueSchema = new mongoose.Schema({
  sourceIssueId: { type: String, required: true, unique: true },
  sourceVolumeId: { type: String, required: true },
  volumeNumber: { type: Number, required: true, enum: [1, 2] },
  bookNumber: { type: Number, min: 1, max: 7, default: null },
  relatedRecordId: { type: String, default: null },
  pdfPage: { type: Number, default: null },
  issueType: { type: String, required: true },
  description: { type: String, required: true },
  normalizationApplied: { type: String, default: null }
}, { timestamps: true });

englishExtractionIssueSchema.index({ bookNumber: 1, issueType: 1 });
englishExtractionIssueSchema.index({ sourceVolumeId: 1, issueType: 1 });

module.exports = mongoose.model('EnglishExtractionIssue', englishExtractionIssueSchema);
