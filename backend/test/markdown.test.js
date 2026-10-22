const test = require('node:test');
const assert = require('node:assert/strict');
const { renderSafeMarkdown } = require('../public/markdown');

test('renders bold and escapes HTML', () => {
  const html = renderSafeMarkdown('**safe** <script>alert(1)</script>');
  assert.match(html, /<strong>safe<\/strong>/);
  assert.doesNotMatch(html, /<script>/);
  assert.match(html, /&lt;script&gt;/);
});

test('renders quotes and lists', () => {
  const html = renderSafeMarkdown('> quote\n\n* one\n* two\n\n١- اول\n٢- ثاني');
  assert.match(html, /<blockquote>quote<\/blockquote>/);
  assert.match(html, /<ul><li>one<\/li><li>two<\/li><\/ul>/);
  assert.match(html, /<ol><li>اول<\/li><li>ثاني<\/li><\/ol>/);
});

test('joins wrapped lines into one paragraph', () => {
  assert.equal(renderSafeMarkdown('first line\nsecond line'), '<p>first line second line</p>');
});

test('keeps list items together across blank lines', () => {
  const html = renderSafeMarkdown('* one\n\n* two');
  assert.equal(html, '<ul><li>one</li><li>two</li></ul>');
});

test('renders wrapped quote lines as one blockquote', () => {
  const html = renderSafeMarkdown('> first\n> second');
  assert.equal(html, '<blockquote>first second</blockquote>');
});
