#!/usr/bin/env python3
"""Whitespace and footnote formatting for the catechism datasets.

This module only rewrites whitespace and separates footnote definitions from
answer bodies. It never rewrites, translates, or repairs wording.
"""

from __future__ import annotations

import json
import re
import statistics
from collections import Counter
from pathlib import Path

HERE = Path(__file__).resolve().parent
STRUCTURE_FILE = HERE / "structureData.js"

EXTRA_ARTIFACTS = {
    "After Life",
    "Metanoias and Prostrations",
    "Holy Fasting",
    "Tears in Worship",
    "Vices or Evils",
    "Social Cohesion",
    "The Model Prayer",
    "The Holy Sacraments",
    "The Church Belfry",
    "The Iconostasis",
    "Coptic Art and Symbolism",
    "Christian Concepts and Everyday Life",
    "Christian Faith and Liberty",
    "Christian Faith and Human Culture",
    "Christian Faith and Military Service",
    "Christian Faith and Social Class",
    "The Church and Society",
    "The Believer and the Heavenly Hosts",
    "Eschatology and the After Life",
}


def _load_titles() -> set[str]:
    if not STRUCTURE_FILE.exists():
        return set(EXTRA_ARTIFACTS)
    source = STRUCTURE_FILE.read_text(encoding="utf-8")
    titles = {match.group(2).strip() for match in re.finditer(r"title:\s*(['\"])(.*?)\1", source)}
    return titles | EXTRA_ARTIFACTS


def _load_words() -> set[str]:
    for candidate in ("/usr/share/dict/words", "/usr/dict/words"):
        path = Path(candidate)
        if path.exists():
            with path.open(encoding="utf-8", errors="ignore") as source:
                return {word.strip().lower() for word in source if word.strip()}
    return set()


TITLES = _load_titles()
WORDS = _load_words()

ABBR = re.compile(
    r"(?:\b(?:St|Mr|Mrs|Ms|Dr|Fr|Cf|vs|etc|al|Vol|Ch|pp|p|no|Nos|Rev|Gen|Ex|Lev|Num|Deut|"
    r"Matt|Mk|Lk|Jn|Rom|Cor|Gal|Eph|Phil|Col|Thess|Tim|Tit|Heb|Jas|Pet|Rev)\.|[A-Z]\.)$"
)
TERM = re.compile(r"[.!?؟…][\"”’')\]]*\s*$")
LIST = re.compile(
    r"^\s*(?:\(?[a-zA-Z]\)|\(?[ivxlcdm]+[.)]|[a-zA-Z]\.|[0-9]{1,3}[.)]|[•●▪◦*\-–—])\s+"
)
STRUCT = re.compile(
    r"^\s*(?:(?:First|Second|Third|Fourth|Fifth|Sixth|Seventh|Eighth|Ninth|Tenth|Eleventh|"
    r"Twelfth|Finally|Stage\s+\d+|Part\s+\d+|Chapter\s+\d+|Question\s+\d+|Note|Conclusion|"
    r"Introduction)\s*[:.])",
    re.I,
)
CITEISH = re.compile(
    r"^\s*(?:Cf\.|See\b|St\.?\s|St,|The\b|Ibid|Idem|Translators|From\b|In\b|Compare\b|Also\b|"
    r"Origen|Tertullian|Tatian|Eusebius|Gregory|John|Cyril|Augustine|Basil|Athanasius|Clement|"
    r"Fr\.|Bishop|Metropolitan|Canons\b|Writings\b|H\.|J\.|E\.|G\.|W\.|M\.|R\.|F\.|A\.|Dom\b|"
    r"Pastor\b|Minucius|Athenagoras|Aristides|Lactantius|Sozomen|Socrates|Theodoret|Epiphanius|"
    r"Jerome|Ambrose|Cyprian|Irenaeus|Hippolytus|Justin|Methodius|Peter\b|Leo\b|Gelasius|"
    r"Dionysius|Diodore|Theodore|Severus|Philoxenus|Isaac|Ephrem|Jacob|Aphrahat|Macarius|"
    r"Dorotheos|Palladius|Cassian|Benedict|Pachomius|Antony|Caesarius|Nilus|Mark\b|Maximus|"
    r"Nemesius|Procopius|Cosmas|Adamantius|Arnobius|Novatian|Commodian|Prudentius|Juvencus|"
    r"Sedulius|Fortunatus|Cawthra|Klaus|Earl|Henry|Joseph|Ya’qub|Mike|PG\b|PL\b|ANF\b|NPNF\b|"
    r"FOTC\b|ACCOS\b|“|\"|\[)"
)
LOOKS_CITE = re.compile(
    r"(?:\b(?:vol|trans|ed|eds|pp?|no|ch|chap)\.|\bVolume\b|\bPhilokalia\b|"
    r"\b(?:18|19|20)\d\d\b|\([A-Z][^)]*,|^[A-Z][a-z]+(?:\s+[A-Z][a-z]+)+[,.:])"
)
STARTNUM = re.compile(r"^\s*(\d{1,4})[.)]?\s+(.*)$")
SCRIPTURE_START = re.compile(
    r"^(?:Gen|Ex|Lev|Num|Deut|Josh|Judg|Ruth|Sam|Kings|Chron|Ezra|Neh|Esth|Job|Ps|Prov|Eccl|"
    r"Song|Isa|Jer|Lam|Ezek|Dan|Hos|Joel|Amos|Obad|Jonah|Mic|Nah|Hab|Zeph|Hag|Zech|Mal|Matt|"
    r"Mk|Lk|Jn|Acts|Rom|Cor|Gal|Eph|Phil|Col|Thess|Tim|Tit|Phlm|Heb|Jas|Pet|Jude|Rev)\b\.?",
    re.I,
)

AR_TERM = re.compile(r"[.!?؟…][\"”’»)\]]*\s*$")
AR_STRUCT = re.compile(
    r"^\s*(?:أولًا|أولا|ثانيًا|ثانيا|ثالثًا|ثالثا|ثالثاً|ثالنًا|ثالًا|رابعًا|رابعا|خامسًا|"
    r"خامسا|سادسًا|سادسا|سابعًا|سابعا|ثامنًا|ثامنا|تاسعًا|تاسعا|عاشرًا|عاشرا|أخيرًا|"
    r"أخيرا|الخاتمة|مقدمة|ملاحظة)\s*[:：]"
)
AR_LIST = re.compile(
    r"^\s*(?:[أ-يa-zA-Z][.)]|[٠-٩0-9]+[.)]|[•*\-–—]|\.\s*[٠-٩0-9]+)"
)


def normalize_title(value: str) -> str:
    value = value.strip().lower()
    for _ in range(2):
        value = re.sub(r"^\(?[a-z0-9]{1,4}[.)]\s*", "", value)
    value = re.sub(r"^[\s\-–—•]+", "", value)
    value = re.sub(r"[^a-z0-9]+", " ", value)
    value = re.sub(r"\s+", " ", value).strip()
    value = re.sub(r"\d{1,4}$", "", value).strip()
    return value


TITLE_MAP: dict[str, str] = {}
for _title in TITLES:
    _normalized = normalize_title(_title)
    if _normalized:
        TITLE_MAP.setdefault(_normalized, _title)


def definition_start(line: str):
    match = STARTNUM.match(line.strip())
    if not match:
        return None
    number = int(match.group(1))
    rest = match.group(2).strip()
    if not 1 <= number <= 1830:
        return None
    if rest[:1] in "(:)]-–—":
        return None
    return number, rest


def is_title_line(value: str) -> bool:
    text = value.strip()
    if not text or len(text) > 130 or text.endswith("."):
        return False
    normalized = normalize_title(text)
    return bool(normalized and normalized in TITLE_MAP)


def is_toc_like(value: str) -> bool:
    text = value.strip()
    if not text:
        return True
    if len(text) > 110:
        return False
    if TERM.search(text):
        return False
    if re.match(r"^\d{1,2}[.)]\s+\S", text):
        return True
    if is_title_line(text):
        return True
    return False


def strip_known_headers(lines: list[str]):
    removed: list[str] = []
    count = len(lines)
    removed_indexes: set[int] = set()
    index = 0
    while index < count:
        text = lines[index].strip()
        if not text:
            index += 1
            continue
        combined = (text + " " + (lines[index + 1].strip() if index + 1 < count else "")).strip()
        if is_title_line(text):
            removed.append(text)
            removed_indexes.add(index)
            index += 1
            continue
        if (
            index + 1 < count
            and len(text) < 70
            and len(lines[index + 1].strip()) < 70
            and is_title_line(combined)
        ):
            removed.append(combined)
            removed_indexes.add(index)
            removed_indexes.add(index + 1)
            index += 2
            continue
        if re.match(
            r"^(?:Catechism of the Coptic Orthodox Church|Book\s+\d+\s*:|Volume\s+[IVXLC]+\s*$)",
            text,
            re.I,
        ):
            removed.append(text)
            removed_indexes.add(index)
            index += 1
            continue
        if re.match(r"^\s*(?:\d{1,4}|[ivxlcdm]{1,8})\s*$", text, re.I):
            removed.append(text)
            removed_indexes.add(index)
            index += 1
            continue
        index += 1

    index = 0
    while index < count:
        if not lines[index].strip() or not is_toc_like(lines[index]):
            index += 1
            continue
        end = index
        while (
            end < count
            and (not lines[end].strip() or is_toc_like(lines[end]))
            and end - index < 80
        ):
            end += 1
        span = [position for position in range(index, end) if lines[position].strip()]
        known = sum(
            1
            for position in span
            if is_title_line(lines[position])
            or re.match(r"^\d{1,2}[.)]\s+\S", lines[position].strip())
        )
        if known >= 2 and len(span) >= 2:
            for position in span:
                if position not in removed_indexes:
                    removed_indexes.add(position)
                    removed.append(lines[position].strip())
            index = end
        else:
            index += 1
    return [line for position, line in enumerate(lines) if position not in removed_indexes], removed


def split_footnote_block(block: list[str], start: int) -> list[str]:
    entries: list[str] = []
    current: list[str] = []
    expected = start
    for line in block:
        text = line.strip()
        definition = definition_start(text)
        number = definition[0] if definition else None
        previous = " ".join(current).rstrip()
        continuation = previous.endswith((":", ";", ",", "("))
        if definition and number == expected and not continuation:
            if current:
                entries.append(re.sub(r"\s+", " ", " ".join(current)).strip())
            current = [text]
            expected += 1
        else:
            current.append(text)
    if current:
        entries.append(re.sub(r"\s+", " ", " ".join(current)).strip())
    return entries


def get_markers(text: str) -> set[int]:
    markers: set[int] = set()
    for line in text.split("\n"):
        text_line = line.rstrip()
        if not text_line:
            continue
        for match in re.finditer(r"\d{1,4}", text_line):
            value = int(match.group(0))
            if not 1 <= value <= 1830:
                continue
            before = text_line[match.start() - 1] if match.start() > 0 else ""
            after = text_line[match.end()] if match.end() < len(text_line) else ""
            if after.isdigit() or after == ":":
                continue
            attached = before.isalpha() or (before and before in ")]”’")
            if not attached and before == "." and match.start() >= 2 and text_line[match.start() - 2].isalpha():
                attached = True
            if not attached:
                continue
            if re.search(r"(?:A\.D\.|B\.C\.)$", text_line[: match.start()]):
                continue
            markers.add(value)
    return markers


def next_numbered(lines: list[str], index: int, limit: int = 8):
    for position in range(index + 1, min(len(lines), index + 1 + limit)):
        if not lines[position].strip():
            return None
        definition = definition_start(lines[position])
        if definition:
            return position, definition[0], definition[1]
    return None


def sequential_ahead(lines: list[str], index: int, number: int, limit: int = 12) -> bool:
    for position in range(index + 1, min(len(lines), index + 1 + limit)):
        if not lines[position].strip():
            break
        definition = definition_start(lines[position])
        if definition and definition[0] == number + 1:
            return True
    return False


def extract_footnotes(lines: list[str], markers_current: set[int], markers_previous: set[int]):
    body: list[str] = []
    footnotes: list[str] = []
    index = 0
    count = len(lines)
    while index < count:
        line = lines[index]
        definition = definition_start(line)
        if definition:
            number, rest = definition
            previous_blank = index == 0 or not lines[index - 1].strip()
            next_blank = index + 1 >= count or not lines[index + 1].strip()
            cited = bool(CITEISH.match(rest))
            confirmed = number in markers_current
            detached = number in markers_previous and (cited or previous_blank)
            following = next_numbered(lines, index)
            chain_next = bool(
                number >= 2
                and previous_blank
                and (cited or LOOKS_CITE.search(rest))
                and sequential_ahead(lines, index, number)
            )
            tail_cite = bool(number >= 2 and previous_blank and cited and following is None)
            isolated_cite = bool(previous_blank and cited and number >= 20 and next_blank)
            unmarked_chain = number >= 21 and previous_blank and (number + 1 in markers_current)
            candidate = (
                1 <= number <= 1830
                and len(rest) > 1
                and not SCRIPTURE_START.match(rest)
                and (
                    confirmed
                    or detached
                    or chain_next
                    or tail_cite
                    or isolated_cite
                    or unmarked_chain
                )
            )
            if candidate:
                block = [line.strip()]
                position = index + 1
                while position < count and lines[position].strip():
                    if STRUCT.match(lines[position]) or is_title_line(lines[position]):
                        break
                    block.append(lines[position].strip())
                    position += 1
                footnotes.extend(split_footnote_block(block, number))
                index = position
                continue
        body.append(line)
        index += 1
    return body, footnotes


def smart_join(left: str, right: str) -> str:
    left = left.rstrip()
    right = right.lstrip()
    if not left:
        return right
    if not right:
        return left
    if left.endswith("-") and re.match(r"[a-z]", right):
        stem = re.sub(r"[^A-Za-z]+$", "", left).lower()
        first = re.match(r"[A-Za-z’']+", right)
        if first:
            joined = stem + first.group(0).lower()
            if joined in WORDS and (stem + "-" + first.group(0).lower()) not in WORDS:
                return left[:-1] + right
        return left + right
    if re.search(r"[A-Za-z]$", left) and re.match(r"[a-z]", right):
        left_word = re.search(r"([A-Za-z’']+)$", left)
        right_word = re.match(r"([A-Za-z’']+)", right)
        if left_word and right_word:
            first = left_word.group(1)
            second = right_word.group(1)
            if (first + second).lower() in WORDS and first.lower() not in WORDS:
                return left[: -len(first)] + first + second + right[len(second) :]
    if right[:1] in ".,;:!?؟)]»":
        return left + right
    if left[-1:] in "([«":
        return left + right
    return left + " " + right


def join_lines(lines: list[str]) -> str:
    if not lines:
        return ""
    result = lines[0].strip()
    for line in lines[1:]:
        result = smart_join(result, line.strip())
    return re.sub(r"[ \t]+", " ", result).strip()


def quote_open(text: str) -> bool:
    return (
        text.count("“") - text.count("”") > 0
        or text.count('"') % 2 == 1
        or text.count("(") > text.count(")")
    )


def marker_only(value: str) -> bool:
    return bool(
        re.fullmatch(
            r"(?:\(?[a-zA-Z]\)|\(?[ivxlcdm]+[.)]|[a-zA-Z]\.|[0-9]{1,3}[.)]|[•●▪◦*\-–—])",
            value.strip(),
            re.I,
        )
    )


def should_break(previous: str, current: str, max_length: int, blank: bool = False, current_text: str = "") -> bool:
    left = previous.rstrip()
    right = current.lstrip()
    if not left or not right:
        return True
    if STRUCT.match(right) or LIST.match(right) or is_title_line(right):
        return True
    if marker_only(left):
        return False
    if quote_open(current_text or left):
        return False
    if left.endswith((";", ",")):
        return False
    if blank:
        return bool(TERM.search(left) and not ABBR.search(left))
    if not TERM.search(left):
        return False
    if ABBR.search(left):
        return False
    if right[:1].islower():
        return False
    if len(left) < 70:
        return True
    if len(left) < 0.85 * max_length:
        return True
    return bool(
        re.match(
            r"^(?:When|The|This|Thus|For|But|And|Therefore|Moreover|However|After|As|If|We|I|"
            r"He|She|They|It|There|Here|Now|So|Yet|Then|Finally|First|Second|Third|Fourth|Fifth|"
            r"Sixth|Seventh|Eighth|Ninth|Tenth|Stage|In|On|At|By|From|With|Through|During|Before|"
            r"Today|Many|Some|All|God|Our|His|Her|Their|Saint|St\.|Abba|Origen|Clement|Athanasius|"
            r"Cyril|Augustine|Basil|John|Gregory)\b",
            right,
        )
    )


def normalized_words(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", "", value.lower())


def strip_embedded_next(lines: list[str], question_number: int | None, next_answer: str):
    if question_number is None or not next_answer:
        return lines, None
    next_normalized = normalized_words(next_answer)
    for index, line in enumerate(lines):
        match = re.match(r"^\s*(\d{1,4})[.)]?\s+(\S.*)$", line)
        if not match or int(match.group(1)) != question_number + 1:
            continue
        tail = " ".join(lines[index:])
        tail = re.sub(r"^\s*\d{1,4}[.)]?\s*", "", tail)
        tail_normalized = normalized_words(tail)
        position = tail_normalized.find(next_normalized[:200])
        if len(tail_normalized) > 80 and (
            tail_normalized.startswith(next_normalized[:200]) or 0 <= position < 250
        ):
            return lines[:index], "\n".join(lines[index:])
    return lines, None


def format_english_answer(
    answer: str,
    previous_answer: str = "",
    next_answer: str = "",
    question_number: int | None = None,
):
    raw = answer.replace("\r\n", "\n").replace("\r", "\n")
    lines = raw.split("\n")
    lines, dropped = strip_embedded_next(lines, question_number, next_answer)
    lines, headers = strip_known_headers(lines)
    lines, footnotes = extract_footnotes(lines, get_markers(raw), get_markers(previous_answer or ""))
    lengths = [len(line.strip()) for line in lines if line.strip()]
    max_length = (
        statistics.quantiles(lengths, n=20)[-2]
        if len(lengths) >= 20
        else (max(lengths) if lengths else 90)
    )
    max_length = max(70, min(100, max_length))
    paragraphs: list[str] = []
    current: list[str] = []
    blank = False
    for line in lines:
        if not line.strip():
            blank = True
            continue
        text = line.strip()
        if not current:
            current = [text]
            blank = False
            continue
        if should_break(current[-1], text, max_length, blank=blank, current_text=" ".join(current)):
            paragraphs.append(join_lines(current))
            current = [text]
        else:
            current.append(text)
        blank = False
    if current:
        paragraphs.append(join_lines(current))
    body = "\n\n".join(paragraph for paragraph in paragraphs if paragraph.strip()).strip()
    return body, footnotes, headers, dropped


def arabic_join(left: str, right: str) -> str:
    left = left.rstrip()
    right = right.lstrip()
    if not left:
        return right
    if not right:
        return left
    if right[0] in "،,.!?؟:؛»)”’'":
        return left + right
    if left[-1] in "([«“‘":
        return left + right
    return left + " " + right


def arabic_should_break(previous: str, current: str, blank: bool = False) -> bool:
    left = previous.rstrip()
    right = current.lstrip()
    if not left or not right:
        return True
    if AR_STRUCT.match(right) or AR_LIST.match(right):
        return True
    if AR_LIST.fullmatch(left):
        return False
    if blank:
        return bool(AR_TERM.search(left))
    return bool(AR_TERM.search(left) and len(left) > 40)


def format_arabic_answer(answer: str) -> str:
    raw = answer.replace("\r\n", "\n").replace("\r", "\n")
    paragraphs: list[str] = []
    current: list[str] = []
    blank = False
    for line in raw.split("\n"):
        if not line.strip():
            blank = True
            continue
        text = line.strip()
        if not current:
            current = [text]
            blank = False
            continue
        if arabic_should_break(current[-1], text, blank=blank):
            paragraphs.append(_join_arabic_lines(current))
            current = [text]
        else:
            current.append(text)
        blank = False
    if current:
        paragraphs.append(_join_arabic_lines(current))
    return "\n\n".join(paragraph for paragraph in paragraphs if paragraph.strip()).strip()


def _join_arabic_lines(lines: list[str]) -> str:
    result = lines[0].strip()
    for line in lines[1:]:
        result = arabic_join(result, line.strip())
    return re.sub(r"[ \t]+", " ", result).strip()


def visible_characters(value: str) -> Counter:
    return Counter(re.sub(r"\s+", "", value))


def validate_preserved(original: str, output_parts: list[str]) -> bool:
    return visible_characters(original) == Counter(
        character
        for part in output_parts
        for character in re.sub(r"\s+", "", part)
    )


def format_english_dataset(rows: list[dict]) -> list[dict]:
    # A dataset that already carries a footnotes array has been through this
    # formatter. Re-running footnote detection on the separated body can
    # mistake numbered body lists for definitions, so leave it untouched.
    if all("footnotes" in row for row in rows):
        return rows
    output = []
    for index, row in enumerate(rows):
        previous_answer = rows[index - 1]["answer"] if index else ""
        next_answer = rows[index + 1]["answer"] if index + 1 < len(rows) else ""
        body, footnotes, headers, dropped = format_english_answer(
            row["answer"], previous_answer, next_answer, row["questionNumber"]
        )
        if not validate_preserved(row["answer"], [body, *footnotes, *headers, dropped or ""]):
            raise ValueError(f"Character loss while formatting English Q{row['questionNumber']}")
        output.append(
            {
                "questionNumber": row["questionNumber"],
                "question": row["question"],
                "answer": body,
                "footnotes": footnotes,
            }
        )
    return output


def format_arabic_dataset(rows: list[dict]) -> list[dict]:
    output = []
    for row in rows:
        body = format_arabic_answer(row["answer"])
        if not validate_preserved(row["answer"], [body]):
            raise ValueError(f"Character loss while formatting Arabic Q{row['questionNumber']}")
        output.append(
            {
                "questionNumber": row["questionNumber"],
                "question": row["question"],
                "answer": body,
            }
        )
    return output
