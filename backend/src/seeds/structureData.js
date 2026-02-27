/**
 * Complete structural data for "Catechism of the Coptic Orthodox Church"
 * by Fr. Tadros Yacoub Malaty, Volumes 1 & 2 (2023 Edition)
 *
 * 7 Books, 1452 Questions
 */

const BOOKS = [
  {
    bookNumber: 1,
    title: 'Introduction to the Coptic Catechism',
    volume: 1,
    questionRange: { start: 1, end: 92 },
    description: 'Foundations of the Coptic Catechism, the Holy Bible, Holy Tradition, and faith that works through love.'
  },
  {
    bookNumber: 2,
    title: 'Christian Dogma',
    volume: 1,
    questionRange: { start: 93, end: 448 },
    description: 'The Creed, the Holy Trinity, Creation, Divine Providence, Grace, the Fall, Christology, and the Holy Spirit.'
  },
  {
    bookNumber: 3,
    title: 'The Church: The Kingdom of God',
    volume: 1,
    questionRange: { start: 449, end: 877 },
    description: 'Ecclesiology, the Holy Sacraments, the priesthood, matrimony, and the monastic movement.'
  },
  {
    bookNumber: 4,
    title: 'Church Worship as a Journey to Heaven',
    volume: 2,
    questionRange: { start: 878, end: 1112 },
    description: 'Prayer, the Agpeya, fasting, praise, hymns, the Coptic calendar, and worship as dying with Christ.'
  },
  {
    bookNumber: 5,
    title: 'The Believer and the Heavenly Hosts',
    volume: 2,
    questionRange: { start: 1113, end: 1184 },
    description: 'Angels, the spiritual world, the order of heavenly hosts, and spiritual warfare.'
  },
  {
    bookNumber: 6,
    title: 'Christian Concepts and Everyday Life',
    volume: 2,
    questionRange: { start: 1185, end: 1356 },
    description: 'Virtues, vices, Church and State, social relationships, wealth, liberty, and science and faith.'
  },
  {
    bookNumber: 7,
    title: 'Eschatology and the After Life',
    volume: 2,
    questionRange: { start: 1357, end: 1452 },
    description: 'Death, the resurrection, millennialism, the Second Coming, the Final Judgment, and the heavenly Jerusalem.'
  }
];

const CHAPTERS = [
  // ══════════════════════════════════════════════════════════════════
  // BOOK 1: Introduction to the Coptic Catechism (Q1–92)
  // ══════════════════════════════════════════════════════════════════
  { bookNumber: 1, chapterNumber: 1, sortOrder: 1, title: 'Catechism', questionRange: { start: 1, end: 2 } },
  { bookNumber: 1, chapterNumber: 2, sortOrder: 2, title: 'The Coptic Catechism Through the Ages', questionRange: { start: 3, end: 4 } },
  { bookNumber: 1, chapterNumber: 3, sortOrder: 3, title: 'The Basic Principles of Catechism', questionRange: { start: 5, end: 6 } },
  { bookNumber: 1, chapterNumber: 4, sortOrder: 4, title: 'Faith That Works Through Love', questionRange: { start: 7, end: 46 } },
  { bookNumber: 1, chapterNumber: 5, sortOrder: 5, title: 'The Holy Bible', questionRange: { start: 47, end: 72 } },
  { bookNumber: 1, chapterNumber: 6, sortOrder: 6, title: 'Holy Tradition', questionRange: { start: 73, end: 92 } },

  // ══════════════════════════════════════════════════════════════════
  // BOOK 2: Christian Dogma (Q93–448)
  // ══════════════════════════════════════════════════════════════════
  { bookNumber: 2, chapterNumber: 1, sortOrder: 1, title: 'Christian Dogma', questionRange: { start: 93, end: 94 } },
  { bookNumber: 2, chapterNumber: 2, sortOrder: 2, title: 'The Creed of Faith and the Origin of the Canons of the Church', questionRange: { start: 95, end: 108 } },
  { bookNumber: 2, chapterNumber: 3, sortOrder: 3, title: 'Regarding the Coptic Orthodox Creed', questionRange: { start: 109, end: 115 } },
  { bookNumber: 2, chapterNumber: 4, sortOrder: 4, title: 'Exposition of the Creed', questionRange: { start: 116, end: 142 } },
  { bookNumber: 2, chapterNumber: 5, sortOrder: 5, title: 'Faith in God and Our Knowledge of Him', questionRange: { start: 143, end: 156 } },
  { bookNumber: 2, chapterNumber: 6, sortOrder: 6, title: 'The Holy Trinity', questionRange: { start: 157, end: 180 } },
  { bookNumber: 2, chapterNumber: 7, sortOrder: 7, title: 'The Wondrous Creator, the Guardian of the World', questionRange: { start: 181, end: 194 } },
  { bookNumber: 2, chapterNumber: 8, sortOrder: 8, title: 'The Exalted Nature of the Human Creation', questionRange: { start: 195, end: 210 } },
  { bookNumber: 2, chapterNumber: 9, sortOrder: 9, title: 'Divine Providence', questionRange: { start: 211, end: 226 } },
  { bookNumber: 2, chapterNumber: 10, sortOrder: 10, title: 'Divine Grace', questionRange: { start: 227, end: 246 } },
  { bookNumber: 2, chapterNumber: 11, sortOrder: 11, title: 'The Fall of Humanity', questionRange: { start: 247, end: 266 } },
  { bookNumber: 2, chapterNumber: 12, sortOrder: 12, title: 'Our Lord Jesus Christ, Savior of the World', questionRange: { start: 267, end: 282 } },
  { bookNumber: 2, chapterNumber: 13, sortOrder: 13, title: 'Titles and Names of the Savior that Witness to the Works of His Love', questionRange: { start: 283, end: 314 } },
  { bookNumber: 2, chapterNumber: 14, sortOrder: 14, title: 'The Holy Spirit and Divine Salvation', questionRange: { start: 315, end: 448 } },

  // ══════════════════════════════════════════════════════════════════
  // BOOK 3: The Church: The Kingdom of God (Q449–877)
  // ══════════════════════════════════════════════════════════════════
  { bookNumber: 3, chapterNumber: 1, sortOrder: 1, title: 'The Church: The Kingdom of God', questionRange: { start: 449, end: 475 } },
  { bookNumber: 3, chapterNumber: 2, sortOrder: 2, title: 'The Heavenly High Priest and the Church', questionRange: { start: 476, end: 490 } },
  { bookNumber: 3, chapterNumber: 3, sortOrder: 3, title: 'The Church as a Heavenly Wedding Feast', questionRange: { start: 491, end: 510 } },
  { bookNumber: 3, chapterNumber: 4, sortOrder: 4, title: 'The Unique Work of the Church', questionRange: { start: 511, end: 520 } },
  { bookNumber: 3, chapterNumber: 5, sortOrder: 5, title: 'The Church: House of Salvation', questionRange: { start: 521, end: 530 } },
  { bookNumber: 3, chapterNumber: 6, sortOrder: 6, title: 'The Eminence of the Church', questionRange: { start: 531, end: 540 } },
  { bookNumber: 3, chapterNumber: 7, sortOrder: 7, title: 'The Church and Daily Renewal', questionRange: { start: 541, end: 545 } },
  { bookNumber: 3, chapterNumber: 8, sortOrder: 8, title: 'The Church and Society', questionRange: { start: 546, end: 570 } },
  { bookNumber: 3, chapterNumber: 9, sortOrder: 9, title: 'The Person of the Church', questionRange: { start: 571, end: 575 } },
  { bookNumber: 3, chapterNumber: 10, sortOrder: 10, title: 'The Mystery of the House of God', questionRange: { start: 576, end: 600 } },
  { bookNumber: 3, chapterNumber: 11, sortOrder: 11, title: 'The Iconostasis', questionRange: { start: 601, end: 620 } },
  { bookNumber: 3, chapterNumber: 12, sortOrder: 12, title: 'Coptic Art and Symbolism', questionRange: { start: 621, end: 630 } },
  { bookNumber: 3, chapterNumber: 13, sortOrder: 13, title: 'The Holy Utensils', questionRange: { start: 631, end: 640 } },
  { bookNumber: 3, chapterNumber: 14, sortOrder: 14, title: 'The Church Nave', questionRange: { start: 641, end: 655 } },
  { bookNumber: 3, chapterNumber: 15, sortOrder: 15, title: 'The Church Belfry', questionRange: { start: 656, end: 665 } },
  { bookNumber: 3, chapterNumber: 16, sortOrder: 16, title: 'The Holy Sacraments', questionRange: { start: 666, end: 680 } },
  { bookNumber: 3, chapterNumber: 17, sortOrder: 17, title: 'The Sacrament of Baptism', questionRange: { start: 681, end: 730 } },
  { bookNumber: 3, chapterNumber: 18, sortOrder: 18, title: 'The Sacrament of Chrismation', questionRange: { start: 731, end: 760 } },
  { bookNumber: 3, chapterNumber: 19, sortOrder: 19, title: 'The Sacrament of Repentance & Confession', questionRange: { start: 761, end: 800 } },
  { bookNumber: 3, chapterNumber: 20, sortOrder: 20, title: 'The Sacrament of the Eucharist', questionRange: { start: 801, end: 840 } },
  { bookNumber: 3, chapterNumber: 21, sortOrder: 21, title: 'The Sacrament of Priesthood', questionRange: { start: 841, end: 860 } },
  { bookNumber: 3, chapterNumber: 22, sortOrder: 22, title: 'The Sacrament of Holy Matrimony', questionRange: { start: 861, end: 870 } },
  { bookNumber: 3, chapterNumber: 23, sortOrder: 23, title: 'Unction of the Sick', questionRange: { start: 871, end: 874 } },
  { bookNumber: 3, chapterNumber: 24, sortOrder: 24, title: 'The Coptic Church and the Monastic Movement', questionRange: { start: 875, end: 877 } },

  // ══════════════════════════════════════════════════════════════════
  // BOOK 4: Church Worship as a Journey to Heaven (Q878–1112)
  // ══════════════════════════════════════════════════════════════════
  { bookNumber: 4, chapterNumber: 1, sortOrder: 1, title: 'Church Worship', questionRange: { start: 878, end: 895 } },
  { bookNumber: 4, chapterNumber: 2, sortOrder: 2, title: 'The Life of Prayer', questionRange: { start: 896, end: 930 } },
  { bookNumber: 4, chapterNumber: 3, sortOrder: 3, title: 'The Agpeya Prayers (the Canonical Hours)', questionRange: { start: 931, end: 955 } },
  { bookNumber: 4, chapterNumber: 4, sortOrder: 4, title: 'The Model Prayer', questionRange: { start: 956, end: 975 } },
  { bookNumber: 4, chapterNumber: 5, sortOrder: 5, title: 'Prayer of the Mind and Contemplation', questionRange: { start: 976, end: 995 } },
  { bookNumber: 4, chapterNumber: 6, sortOrder: 6, title: 'The Jesus Prayer or the Arrow Prayer', questionRange: { start: 996, end: 1010 } },
  { bookNumber: 4, chapterNumber: 7, sortOrder: 7, title: 'Metanoias and Prostrations', questionRange: { start: 1011, end: 1020 } },
  { bookNumber: 4, chapterNumber: 8, sortOrder: 8, title: 'Holy Worship and the Full Life', questionRange: { start: 1021, end: 1040 } },
  { bookNumber: 4, chapterNumber: 9, sortOrder: 9, title: 'Worship and the Fear of the Lord', questionRange: { start: 1041, end: 1060 } },
  { bookNumber: 4, chapterNumber: 10, sortOrder: 10, title: 'Holy Fasting', questionRange: { start: 1061, end: 1075 } },
  { bookNumber: 4, chapterNumber: 11, sortOrder: 11, title: "Worship and 'Dying with Christ'", questionRange: { start: 1076, end: 1085 } },
  { bookNumber: 4, chapterNumber: 12, sortOrder: 12, title: 'Tears in Worship', questionRange: { start: 1086, end: 1095 } },
  { bookNumber: 4, chapterNumber: 13, sortOrder: 13, title: 'Praise and the Heavenly Mindset', questionRange: { start: 1096, end: 1100 } },
  { bookNumber: 4, chapterNumber: 14, sortOrder: 14, title: 'Church Hymns and the Heavenly Mindset', questionRange: { start: 1101, end: 1105 } },
  { bookNumber: 4, chapterNumber: 15, sortOrder: 15, title: 'The Coptic Church Calendar and Joyful Daily Life in the Lord', questionRange: { start: 1106, end: 1112 } },

  // ══════════════════════════════════════════════════════════════════
  // BOOK 5: The Believer and the Heavenly Hosts (Q1113–1184)
  // ══════════════════════════════════════════════════════════════════
  { bookNumber: 5, chapterNumber: 1, sortOrder: 1, title: 'The Creation of the Spiritual World', questionRange: { start: 1113, end: 1130 } },
  { bookNumber: 5, chapterNumber: 2, sortOrder: 2, title: 'Our Companionship with the Heavenly Hosts', questionRange: { start: 1131, end: 1150 } },
  { bookNumber: 5, chapterNumber: 3, sortOrder: 3, title: 'The Order of the Heavenly Hosts', questionRange: { start: 1151, end: 1170 } },
  { bookNumber: 5, chapterNumber: 4, sortOrder: 4, title: 'The Devil Has No Authority Over Us', questionRange: { start: 1171, end: 1184 } },

  // ══════════════════════════════════════════════════════════════════
  // BOOK 6: Christian Concepts and Everyday Life (Q1185–1356)
  // ══════════════════════════════════════════════════════════════════
  { bookNumber: 6, chapterNumber: 1, sortOrder: 1, title: 'Christian Virtues', questionRange: { start: 1185, end: 1200 } },
  { bookNumber: 6, chapterNumber: 2, sortOrder: 2, title: 'The Virtue of Discernment and Illumination', questionRange: { start: 1201, end: 1215 } },
  { bookNumber: 6, chapterNumber: 3, sortOrder: 3, title: 'The Virtue of Obedience', questionRange: { start: 1216, end: 1230 } },
  { bookNumber: 6, chapterNumber: 4, sortOrder: 4, title: 'The Virtues of Chastity and Purity', questionRange: { start: 1231, end: 1245 } },
  { bookNumber: 6, chapterNumber: 5, sortOrder: 5, title: 'Vices or Evils', questionRange: { start: 1246, end: 1260 } },
  { bookNumber: 6, chapterNumber: 6, sortOrder: 6, title: 'Christian Faith and Human Culture', questionRange: { start: 1261, end: 1280 } },
  { bookNumber: 6, chapterNumber: 7, sortOrder: 7, title: 'The Relationship Between Church and State', questionRange: { start: 1281, end: 1295 } },
  { bookNumber: 6, chapterNumber: 8, sortOrder: 8, title: 'Christian Faith and Military Service', questionRange: { start: 1296, end: 1310 } },
  { bookNumber: 6, chapterNumber: 9, sortOrder: 9, title: 'Christian Faith and Social and Familial Relationships', questionRange: { start: 1311, end: 1320 } },
  { bookNumber: 6, chapterNumber: 10, sortOrder: 10, title: 'Social Cohesion', questionRange: { start: 1321, end: 1325 } },
  { bookNumber: 6, chapterNumber: 11, sortOrder: 11, title: 'Christian Faith and Social Class', questionRange: { start: 1326, end: 1335 } },
  { bookNumber: 6, chapterNumber: 12, sortOrder: 12, title: 'Christian Faith and Liberty', questionRange: { start: 1336, end: 1340 } },
  { bookNumber: 6, chapterNumber: 13, sortOrder: 13, title: 'Wealth and the Wealthy in the Christian Faith', questionRange: { start: 1341, end: 1350 } },
  { bookNumber: 6, chapterNumber: 14, sortOrder: 14, title: 'Science and Faith', questionRange: { start: 1351, end: 1356 } },

  // ══════════════════════════════════════════════════════════════════
  // BOOK 7: Eschatology and the After Life (Q1357–1452)
  // ══════════════════════════════════════════════════════════════════
  { bookNumber: 7, chapterNumber: 1, sortOrder: 1, title: 'The Gift of Death and the Resurrected Life in Christ', questionRange: { start: 1357, end: 1375 } },
  { bookNumber: 7, chapterNumber: 2, sortOrder: 2, title: 'The Sacred Pain of Loss', questionRange: { start: 1376, end: 1390 } },
  { bookNumber: 7, chapterNumber: 3, sortOrder: 3, title: 'Millennialism (Chiliasm)', questionRange: { start: 1391, end: 1410 } },
  { bookNumber: 7, chapterNumber: 4, sortOrder: 4, title: 'The Two Comings and the Rapture', questionRange: { start: 1411, end: 1425 } },
  { bookNumber: 7, chapterNumber: 5, sortOrder: 5, title: 'The Final Judgment', questionRange: { start: 1426, end: 1440 } },
  { bookNumber: 7, chapterNumber: 6, sortOrder: 6, title: 'The Resurrected Body', questionRange: { start: 1441, end: 1445 } },
  { bookNumber: 7, chapterNumber: 7, sortOrder: 7, title: 'Heaven and the Jerusalem Above', questionRange: { start: 1446, end: 1452 } },
];

module.exports = { BOOKS, CHAPTERS };
