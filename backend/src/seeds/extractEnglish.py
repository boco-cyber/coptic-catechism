#!/usr/bin/env python3
"""Extract English Q&A from catechism PDF volumes with proper boundary detection."""

import fitz, json, re, sys

VOL1 = "/home/gergo/OneDrive/Documents/catechumens class material/Catechism-of-the-Coptic-Orthodox-Church-Volume-1-Fr.Tadros-Y.-Malaty.pdf"
VOL2 = "/home/gergo/OneDrive/Documents/catechumens class material/Catechism-of-the-Coptic-Orthodox-Church-Volume-2-Fr.Tadros-Y.-Malaty.pdf"
OUT = "/home/gergo/Seagate2/apps/coptic-catechism/backend/data/catechism_qa.json"

end_markers = ['\nBibliography', '\nBIBLIOGRAPHY', '\nIndex', '\nINDEX',
               '\nList of Abbreviations', '\nLIST OF ABBREVIATIONS']

def extract_volume(pdf_path, q_range):
    doc = fitz.open(pdf_path)
    full_text = ""
    for page in doc:
        full_text += page.get_text() + "\n"
    doc.close()

    # Lazy *? stops at first ?; [^\n]*\n tail handles footnotes with uppercase (St., etc.)
    # Negative lookahead allows multi-line questions to cross \n safely
    q_pattern = r'(?:^|\n)\s*(\d+)\s*\.\s+([A-Z](?:[^\n]|\n(?!\s*\d+\s*\.))*?\?)[^\n]*\n'

    q_starts = []
    for m in re.finditer(q_pattern, full_text):
        num = int(m.group(1))
        question = re.sub(r'\s+', ' ', m.group(2)).strip()
        q_starts.append((m.start(), num, question))

    seen = {}
    deduped = []
    for pos, num, q in q_starts:
        if num not in seen:
            seen[num] = len(deduped)
            deduped.append((pos, num, q))
        elif pos < deduped[seen[num]][0]:
            deduped[seen[num]] = (pos, num, q)
    q_starts = deduped
    q_starts.sort(key=lambda x: x[0])

    results = {}
    for i, (start_pos, num, question) in enumerate(q_starts):
        if num < q_range[0] or num > q_range[1]:
            continue

        if i < len(q_starts) - 1:
            ans_end = q_starts[i+1][0]
        else:
            ans_end = len(full_text)

        answer = full_text[start_pos:ans_end]
        match = re.match(q_pattern, answer)
        if match:
            answer = answer[match.end():]
        else:
            continue

        answer = re.sub(r'\n\s*\d+\s*\n', '\n', answer)
        answer = re.sub(r'\n{3,}', '\n\n', answer)

        for marker in end_markers:
            idx = answer.find(marker)
            if idx >= 0:
                answer = answer[:idx]

        answer = answer.strip()

        if len(answer) > 20:
            if num not in results or len(answer) > len(results[num]):
                results[num] = {'questionNumber': num, 'question': question, 'answer': answer}

    return results

vol1 = extract_volume(VOL1, (1, 877))
print(f"Volume 1: {len(vol1)} questions (range 1-877)", file=sys.stderr)

vol2 = extract_volume(VOL2, (878, 1452))
print(f"Volume 2: {len(vol2)} questions (range 878-1452)", file=sys.stderr)

results = {}
for qn in range(1, 878):
    if qn in vol1:
        results[qn] = vol1[qn]
for qn in range(878, 1453):
    if qn in vol2:
        results[qn] = vol2[qn]

# Q88: no period after the number
if 88 not in results:
    doc = fitz.open(VOL1)
    full_text = "".join(page.get_text() + "\n" for page in doc)
    doc.close()
    idx = full_text.find("\n88 Have the rites taken anything from holy tradition?")
    if idx >= 0:
        rest = full_text[idx + len("\n88 Have the rites taken anything from holy tradition?"):]
        m = re.search(r'\n\s*\d+\s*\.\s+[A-Z]', rest)
        ans = rest[:m.start()] if m else rest
        ans = re.sub(r'\n\s*\d+\s*\n', '\n', ans).strip()
        for marker in end_markers:
            i = ans.find(marker)
            if i >= 0:
                ans = ans[:i]
        if len(ans) > 20:
            results[88] = {
                'questionNumber': 88,
                'question': 'Have the rites taken anything from holy tradition?',
                'answer': ans.strip()
            }
            print("Q88 restored manually", file=sys.stderr)

# Q1337: question doesn't end with ?
if 1337 not in results:
    doc = fitz.open(VOL2)
    full_text = "".join(page.get_text() + "\n" for page in doc)
    doc.close()
    idx = full_text.find("1337. Imitate")
    if idx >= 0:
        m = re.match(r'\s*1337\.\s+([A-Z][^?]*?\.)[^\n]*\n', full_text[idx:])
        if m:
            question = re.sub(r'\s+', ' ', m.group(1)).strip()
            ans_start = idx + m.end()
            m2 = re.search(r'\n\s*\d+\s*\.\s+[A-Z]', full_text[ans_start:])
            ans = full_text[ans_start:ans_start + m2.start()] if m2 else full_text[ans_start:]
            ans = re.sub(r'\n\s*\d+\s*\n', '\n', ans).strip()
            for marker in end_markers:
                i = ans.find(marker)
                if i >= 0:
                    ans = ans[:i]
            if len(ans) > 20:
                results[1337] = {
                    'questionNumber': 1337,
                    'question': question,
                    'answer': ans.strip()
                }
                print("Q1337 restored manually", file=sys.stderr)

missing = [n for n in range(1, 1453) if n not in results]
if missing:
    print(f"Missing: {len(missing)} questions: {missing}", file=sys.stderr)

output = [results[i] for i in sorted(results.keys())]

with open(OUT, 'w', encoding='utf-8') as f:
    json.dump(output, f, ensure_ascii=False, indent=2)

print(f"Written {len(output)}/1452 questions to {OUT}", file=sys.stderr)
