const test = require('node:test');
const assert = require('node:assert/strict');
const { groupBookContent } = require('../../src/services/bookContent');

const blocks = [
  { sourceBlockId: 'front', blockType: 'front_matter', bookNumber: null, volumeNumber: 1, sequenceInBook: 1 },
  { sourceBlockId: 'intro', blockType: 'section_introduction', bookNumber: 3, volumeNumber: 1, sequenceInBook: 2 },
  { sourceBlockId: 'note', blockType: 'footnote', bookNumber: 3, volumeNumber: 1, sequenceInBook: 3, relatedQuestionNumber: 675 },
  { sourceBlockId: 'volume-note', blockType: 'footnote', bookNumber: null, volumeNumber: 1, sequenceInBook: 4 },
  { sourceBlockId: 'back', blockType: 'back_matter', bookNumber: null, volumeNumber: 1, sequenceInBook: 4 },
  { sourceBlockId: 'other-book', blockType: 'section_introduction', bookNumber: 4, volumeNumber: 2, sequenceInBook: 5 },
  { sourceBlockId: 'other-volume', blockType: 'front_matter', bookNumber: null, volumeNumber: 2, sequenceInBook: 6 }
];
const issues = [
  { sourceIssueId: 'issue-book', bookNumber: 3, volumeNumber: 1, pdfPage: 10 },
  { sourceIssueId: 'issue-volume', bookNumber: null, volumeNumber: 1, pdfPage: 5 },
  { sourceIssueId: 'issue-other', bookNumber: null, volumeNumber: 2, pdfPage: 5 }
];

test('groups book and volume content for a logical book', () => {
  const result = groupBookContent({
    blocks,
    issues,
    bookNumber: 3,
    volumeNumber: 1
  });
  assert.deepEqual(result.frontMatter.map((row) => row.sourceBlockId), ['front']);
  assert.deepEqual(result.introductions.map((row) => row.sourceBlockId), ['intro']);
  assert.deepEqual(result.footnotes.map((row) => row.sourceBlockId), ['note']);
  assert.deepEqual(result.backMatter.map((row) => row.sourceBlockId), ['back']);
  assert.deepEqual(result.issues.map((row) => row.sourceIssueId), ['issue-volume', 'issue-book']);
});

test('filters content by type', () => {
  const result = groupBookContent({
    blocks,
    issues,
    bookNumber: 3,
    volumeNumber: 1,
    type: 'footnote'
  });
  assert.deepEqual(result.footnotes.map((row) => row.sourceBlockId), ['note']);
  assert.deepEqual(result.introductions, []);
  assert.deepEqual(result.issues, []);
});

test('excludes volume-level footnotes from a book response', () => {
  const result = groupBookContent({
    blocks,
    issues,
    bookNumber: 3,
    volumeNumber: 1
  });
  assert.deepEqual(result.footnotes.map((row) => row.sourceBlockId), ['note']);
});

test('returns only issues when type is issues', () => {
  const result = groupBookContent({
    blocks,
    issues,
    bookNumber: 3,
    volumeNumber: 1,
    type: 'issues'
  });
  assert.deepEqual(result.issues.map((row) => row.sourceIssueId), ['issue-volume', 'issue-book']);
  assert.deepEqual(result.frontMatter, []);
  assert.deepEqual(result.introductions, []);
  assert.deepEqual(result.footnotes, []);
  assert.deepEqual(result.backMatter, []);
});
