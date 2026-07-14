#!/usr/bin/env python3
"""Translate fields that are absent or invalid in the Arabic PDF OCR."""

import json
import os
import urllib.request


DATA_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "../../data"))
FIELDS = {
    359: ("answer",),
    420: ("question", "answer"),
    583: ("question", "answer"),
    591: ("question", "answer"),
    604: ("question", "answer"),
    731: ("question", "answer"),
    972: ("question", "answer"),
    1316: ("question", "answer"),
}


def translate(text):
    prompt = (
        "Translate the following Coptic Orthodox catechism text from English into "
        "clear Modern Standard Arabic. Preserve every quotation, Scripture reference, "
        "proper name, theological meaning, and paragraph break. Do not summarize, add "
        "commentary, or omit anything. Return only the Arabic translation.\n\n" + text
    )
    body = json.dumps({
        "model": "command-r7b-arabic",
        "messages": [{"role": "user", "content": prompt}],
        "stream": False,
        "options": {"temperature": 0, "num_ctx": 16384},
    }).encode()
    request = urllib.request.Request(
        "http://127.0.0.1:11434/api/chat", body,
        headers={"Content-Type": "application/json"},
    )
    with urllib.request.urlopen(request, timeout=900) as response:
        result = json.load(response)["message"]["content"].strip()
    if not result or not any("\u0600" <= char <= "\u06ff" for char in result):
        raise RuntimeError("Translation model returned no Arabic text")
    return result


def main():
    with open(os.path.join(DATA_DIR, "catechism_qa.json"), encoding="utf-8") as source:
        english = {row["questionNumber"]: row for row in json.load(source)}
    output = {}
    for number, fields in FIELDS.items():
        output[str(number)] = {}
        for field in fields:
            print(f"Translating Q{number} {field}...", flush=True)
            output[str(number)][field] = translate(english[number][field])
    with open(os.path.join(DATA_DIR, "arabic_translated_fallbacks.json"), "w", encoding="utf-8") as target:
        json.dump(output, target, ensure_ascii=False, indent=2)


if __name__ == "__main__":
    main()
