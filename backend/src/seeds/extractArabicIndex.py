"""
Extract Arabic question index from الأسئلة-والمحتويات.pdf

Outputs:
  - backend/data/arabic_index.json  (questionNumber -> Arabic question text)
"""
import subprocess, os, re, json, glob, tempfile, unicodedata

ARABIC_DIR = "/home/gergo/OneDrive/Documents/catechism fr malaty arabic"
OUT_DIR = os.path.join(os.path.dirname(__file__), "../../data")
INDEX_PDF = os.path.join(
    ARABIC_DIR,
    "كاتيكيزم-الكنيسة-القبطية-الأرثوذكسية-–-الأسئلة-والمحتويات.pdf"
)
TESSDATA = "/tmp/tessdata"

ARABIC_DIGITS_SET = set("٠١٢٣٤٥٦٧٨٩")

def strip_control(s):
    """Remove LRM, RLM, and other invisible formatting characters."""
    return "".join(c for c in s if ord(c) not in (0x200E, 0x200F, 0x2028, 0x2029, 0xFEFF))

def is_arabic_digit(c):
    return unicodedata.name(c, "").startswith("ARABIC-INDIC DIGIT")

def ar_to_int(s):
    """Convert Arabic-Indic digit string to int."""
    result = 0
    for c in s.strip():
        if is_arabic_digit(c):
            result = result * 10 + (ord(c) - 0x0660)
        elif c.isdigit():
            result = result * 10 + int(c)
    return result if result > 0 else None

print("=== Extracting Arabic question index ===")

# Get page count
result = subprocess.run(["pdfinfo", INDEX_PDF], capture_output=True, text=True)
m = re.search(r"Pages:\s+(\d+)", result.stdout)
pages = int(m.group(1)) if m else 76
print(f"Pages: {pages}")

# OCR all pages
img_dir = tempfile.mkdtemp()
subprocess.run(
    ["pdftoppm", "-r", "300", "-png", INDEX_PDF, os.path.join(img_dir, "idx")],
    check=True, capture_output=True
)

all_text = ""
img_files = sorted(glob.glob(os.path.join(img_dir, "idx*.png")))
for i, img_file in enumerate(img_files):
    result = subprocess.run(
        ["tesseract", img_file, "stdout", "-l", "ara",
         "--tessdata-dir", TESSDATA, "--psm", "6"],
        capture_output=True, text=True
    )
    all_text += "\n" + strip_control(result.stdout)
    if (i + 1) % 20 == 0:
        print(f"  OCR'd page {i+1}/{pages}")

print(f"Total text length: {len(all_text)}")

# ── Parse questions ─────────────────────────────────────────────────
lines = [l.strip() for l in all_text.split("\n") if l.strip()]

questions = []  # (questionNumber, text)

# Pattern 1: starts with Arabic digit(s) after optional dots
# Pattern 2: line starting with "  (OCR mis-read of ٢/٣)
# Pattern 3: line starting with ; (OCR mis-read of ٤)

# Collect all candidate question lines
candidates = []
for line in lines:
    l = strip_control(line)
    if not l:
        continue

    # Skip short lines, cover page text, numbers
    if len(l) < 10:
        continue
    if re.match(r'^\d+$', l):
        continue
    if 'الأسئلة والمحتويات' in l or 'البابا' in l or 'طبع' in l:
        continue
    if l.startswith('www.') or l.startswith('@') or l.startswith('http'):
        continue

    candidates.append(l)

print(f"Total candidate lines: {len(candidates)}")

# Try to identify question lines
# Pattern: a line that contains Arabic question text and starts with a number indicator
question_lines = []
for line in candidates:
    # Strip leading dots, spaces, quotes
    cleaned = re.sub(r'^[\s\.\u201c\u201d\u201e\u201f"]+', '', line)
    # Check if line starts with Arabic digit
    first_chars = cleaned[:5]
    digit_part = ""
    for c in first_chars:
        if is_arabic_digit(c) or c.isdigit():
            digit_part += c
        else:
            break
    if digit_part:
        qnum = int(digit_part) if digit_part.isdigit() else ar_to_int(digit_part)
        if qnum and 1 <= qnum <= 1452:
            qtext = cleaned[len(digit_part):].lstrip(". \t")
            # Remove trailing OCR garbage like (2160/77577) or similar
            qtext = re.sub(r'\s*\(\d+[/\d]*\)\s*$', '', qtext)
            qtext = qtext.strip()
            if len(qtext) > 5:
                question_lines.append((qnum, qtext))
                continue

    # Also try to infer question number from "ما" or "هل" or "كيف" or "لماذا" or "ماذا" patterns
    # These should only be matched if we're in a section where we expect sequential questions

print(f"Found {len(question_lines)} questions with explicit numbers")

# Now infer missing numbers for lines between known numbers
# Check for sequential gaps and fill in using position
question_lines.sort(key=lambda x: x[0])

# Verify coverage
found_nums = set(qn for qn, _ in question_lines)
missing = [i for i in range(1, 1453) if i not in found_nums]
if missing:
    print(f"Missing question numbers: {len(missing)}")
    print(f"  First 10 missing: {missing[:10]}")
    print(f"  Last 10 missing: {missing[-10:]}")
else:
    print("All 1452 question numbers found!")

# ── Write output ────────────────────────────────────────────────────
os.makedirs(OUT_DIR, exist_ok=True)
qa_map = {qnum: qtext for qnum, qtext in question_lines}
with open(os.path.join(OUT_DIR, "arabic_index.json"), "w", encoding="utf-8") as f:
    json.dump(qa_map, f, ensure_ascii=False, indent=2)
print(f"\nWritten {len(qa_map)} entries to arabic_index.json")

# Print sample
print("\nSample questions:")
for qn, qt in question_lines[:10]:
    print(f"  Q{qn}: {qt[:80]}")
print("  ...")
for qn, qt in question_lines[-5:]:
    print(f"  Q{qn}: {qt[:80]}")

# Cleanup
for f in glob.glob(os.path.join(img_dir, "*")):
    os.remove(f)
os.rmdir(img_dir)
