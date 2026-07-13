"""
Extract Arabic answers from book PDFs using cached OCR text.
Strategy: find question numbers in OCR text and extract between them.
"""
import os, re, json, unicodedata

OUT_DIR = os.path.join(os.path.dirname(__file__), "../../data")

BOOK_RANGES = {
    1: (1, 92), 2: (93, 448), 3: (449, 877), 4: (878, 1112),
    5: (1113, 1184), 6: (1185, 1356), 7: (1357, 1452),
}

def strip_ctrl(s):
    return "".join(c for c in s if ord(c) not in (0x200E,0x200F,0x2028,0x2029,0xFEFF))

def clean_ocr(s):
    s = re.sub(r'\s+', ' ', s)
    s = s.replace('|', '').replace('_', '').replace('>', '').replace('<', '')
    s = re.sub(r'[▯▰▪▸▹►→■●○◎※†‡•‧]', '', s)
    return s.strip()

def is_digit(c):
    return c.isdigit() or (unicodedata.name(c, "").startswith("ARABIC-INDIC DIGIT") if c else False)

def ar_to_int(s):
    result = 0
    for c in s:
        if c.isdigit():
            result = result * 10 + int(c)
        elif unicodedata.name(c, "").startswith("ARABIC-INDIC DIGIT"):
            result = result * 10 + (ord(c) - 0x0660)
        else:
            break
    return result if result > 0 else None

print("=== Arabic Answer Extraction (v3 - numeric anchors) ===\n")

index_path = os.path.join(OUT_DIR, "arabic_index.json")
with open(index_path, encoding="utf-8") as f:
    arabic_index = json.load(f)

all_answers = {}

for book_num in range(1, 8):
    q_start, q_end = BOOK_RANGES[book_num]
    ocr_path = os.path.join(OUT_DIR, f"ocr_book{book_num}.txt")
    if not os.path.exists(ocr_path):
        continue

    print(f"\nBook {book_num} (Q{q_start}-Q{q_end})")

    with open(ocr_path, encoding="utf-8") as f:
        book_text = strip_ctrl(f.read())

    # Split into lines
    raw_lines = book_text.split('\n')
    lines = [clean_ocr(l) for l in raw_lines if l.strip()]

    # Find lines that likely start with a question number
    # Pattern: optional punctuation + Arabic/ASCII digits + separator
    q_pattern = re.compile(r'^[\s\.\,\;\:\"\'\!\*\-]*(\d+)[\s\.\)\:]\s+(.+)')
    found_qs = []

    for line in lines:
        m = q_pattern.match(line)
        if m:
            num_str = m.group(1)
            rest = m.group(2).strip()
            qnum = ar_to_int(num_str)
            if qnum and q_start <= qnum <= q_end:
                found_qs.append((qnum, rest, line))

    # Deduplicate by question number (keep first occurrence)
    seen = {}
    for qnum, rest, line in found_qs:
        if qnum not in seen:
            seen[qnum] = (rest, line)

    found_qs = sorted(seen.items())
    print(f"  Found {len(found_qs)} questions")

    # Reconstruct full text with position tracking for extraction
    full_text = '\n'.join(lines)

    # For each question, extract answer by finding position and going to next question
    answers = {}
    sorted_qs = sorted(seen.items())

    for i, (qnum, (rest, line)) in enumerate(sorted_qs):
        # Find this line in the full text
        idx = full_text.find(line)
        if idx < 0:
            continue

        answer_start = idx + len(line)

        if i + 1 < len(sorted_qs):
            next_num, (next_rest, next_line) = sorted_qs[i + 1]
            next_idx = full_text.find(next_line, answer_start)
            if next_idx > answer_start:
                answer_end = next_idx
            else:
                answer_end = answer_start + 2000  # fallback
        else:
            answer_end = min(answer_start + 3000, len(full_text))

        answer_text = full_text[answer_start:answer_end]
        # Take up to next question number or reasonable length
        answer_text = re.sub(r'\s+', ' ', answer_text).strip()
        # Remove trailing OCR garbage
        answer_text = re.sub(r'\s*\d{1,4}\s*$', '', answer_text)
        # Truncate at reasonable answer length (most answers are 1-3 paragraphs)
        if len(answer_text) > 3000:
            answer_text = answer_text[:3000]

        if len(answer_text) > 20:
            answers[qnum] = answer_text

    all_answers[book_num] = answers
    print(f"  Extracted {len(answers)} answers")

# Build final output
print(f"\n{'='*60}")
print("Building catechism_qa_ar.json...")
output = []
wcq = 0
wca = 0
for qnum in range(1, 1453):
    question = arabic_index.get(str(qnum), "")
    answer = ""
    for bn, (qs, qe) in BOOK_RANGES.items():
        if qs <= qnum <= qe and bn in all_answers:
            answer = all_answers[bn].get(qnum, "")
            break
    output.append({"questionNumber": qnum, "question": question, "answer": answer})
    if question: wcq += 1
    if answer: wca += 1

output_path = os.path.join(OUT_DIR, "catechism_qa_ar.json")
with open(output_path, "w", encoding="utf-8") as f:
    json.dump(output, f, ensure_ascii=False, indent=2)

print(f"Total: {len(output)}, Questions: {wcq}, Answers: {wca}, Both: {sum(1 for q in output if q['question'] and q['answer'])}")
