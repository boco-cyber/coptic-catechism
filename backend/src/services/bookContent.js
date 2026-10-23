const BLOCK_GROUPS = {
  front_matter: 'frontMatter',
  section_introduction: 'introductions',
  footnote: 'footnotes',
  back_matter: 'backMatter'
};

function groupBookContent({
  blocks = [],
  issues = [],
  bookNumber,
  volumeNumber,
  type
}) {
  const groups = {
    frontMatter: [],
    introductions: [],
    footnotes: [],
    backMatter: [],
    issues: []
  };

  const isVolumeLevel = (row) =>
    (row.bookNumber === null || row.bookNumber === undefined) &&
    row.volumeNumber === volumeNumber;

  const blockInScope = (block) =>
    block.bookNumber === bookNumber ||
    (isVolumeLevel(block) &&
      (block.blockType === 'front_matter' || block.blockType === 'back_matter'));

  const issueInScope = (issue) =>
    issue.bookNumber === bookNumber || isVolumeLevel(issue);

  for (const block of blocks) {
    if (!blockInScope(block)) continue;
    if (type === 'issues') continue;
    if (type && type !== block.blockType) continue;
    const group = BLOCK_GROUPS[block.blockType];
    if (group) groups[group].push(block);
  }

  for (const issue of issues) {
    if (!issueInScope(issue)) continue;
    if (type && type !== 'issues') continue;
    groups.issues.push(issue);
  }

  const sortBySequence = (a, b) =>
    (a.sequenceInBook ?? 0) - (b.sequenceInBook ?? 0) ||
    (a.pdfPage ?? a.pdfPageStart ?? 0) - (b.pdfPage ?? b.pdfPageStart ?? 0);

  groups.frontMatter.sort(sortBySequence);
  groups.introductions.sort(sortBySequence);
  groups.footnotes.sort(sortBySequence);
  groups.backMatter.sort(sortBySequence);
  groups.issues.sort((a, b) => (a.pdfPage ?? 0) - (b.pdfPage ?? 0));

  return groups;
}

module.exports = { groupBookContent };
