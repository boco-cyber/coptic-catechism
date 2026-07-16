#!/usr/bin/env python3
"""Translate the ~665 Arabic Q&A entries that couldn't be reliably recovered
from OCR, using the local Ollama qwen3:8b model (command-r7b-arabic fails to
load on this GPU -- cudaMalloc OOM, unrelated to this script).

Resumable: writes incrementally to translated_fallbacks.json, keyed by
questionNumber; a rerun skips numbers already present. Meant to run for
hours in the background given local-model latency (~30s per answer).
"""

import json
import sys
import time
import urllib.request
from pathlib import Path

DATA_DIR = Path("/home/gergo/Seagate2/apps/coptic-catechism/backend/data")
WORK_DIR = DATA_DIR / "verification"
OUT_PATH = WORK_DIR / "translated_fallbacks.json"
OLLAMA_URL = "http://127.0.0.1:11434/api/chat"

PROMPT_TEMPLATE = (
    "Translate the following Coptic Orthodox catechism question and answer from "
    "English into clear Modern Standard Arabic. Preserve every quotation, Scripture "
    "reference, proper name, theological meaning, and paragraph break. Do not "
    "summarize, add commentary, or omit anything. Output exactly two lines in this "
    "format, nothing else:\n"
    "QUESTION: <translated question>\n"
    "ANSWER: <translated answer, may itself contain newlines>\n\n"
    "English question: {question}\n\n"
    "English answer:\n{answer}"
)


def call_model(question: str, answer: str, retries: int = 3) -> tuple[str, str]:
    prompt = PROMPT_TEMPLATE.format(question=question, answer=answer)
    body = json.dumps({
        "model": "qwen3:8b",
        "messages": [{"role": "user", "content": prompt}],
        "stream": False,
        "think": False,
        "options": {"temperature": 0, "num_ctx": 8192},
    }).encode()
    last_error = None
    for attempt in range(retries):
        try:
            req = urllib.request.Request(OLLAMA_URL, body, headers={"Content-Type": "application/json"})
            with urllib.request.urlopen(req, timeout=240) as resp:
                content = json.load(resp)["message"]["content"].strip()
            if "QUESTION:" not in content or "ANSWER:" not in content:
                raise ValueError(f"unexpected model output shape: {content[:120]!r}")
            q_part, a_part = content.split("ANSWER:", 1)
            translated_question = q_part.split("QUESTION:", 1)[1].strip()
            translated_answer = a_part.strip()
            if not any("؀" <= c <= "ۿ" for c in translated_answer):
                raise ValueError("no Arabic text in answer")
            return translated_question, translated_answer
        except Exception as exc:  # noqa: BLE001
            last_error = exc
            time.sleep(2 * (attempt + 1))
    raise RuntimeError(f"translation failed after {retries} attempts: {last_error}")


def main():
    needs = json.loads((WORK_DIR / "needs_translation.json").read_text(encoding="utf-8"))
    english = {e["questionNumber"]: e for e in json.loads((DATA_DIR / "catechism_qa.json").read_text(encoding="utf-8"))}

    done = {}
    if OUT_PATH.exists():
        done = json.loads(OUT_PATH.read_text(encoding="utf-8"))

    remaining = [q for q in needs if str(q) not in done]
    print(f"{len(done)} already translated, {len(remaining)} remaining", flush=True)

    for i, qnum in enumerate(remaining):
        e = english[qnum]
        try:
            tq, ta = call_model(e["question"], e["answer"])
            done[str(qnum)] = {"question": tq, "answer": ta}
        except Exception as exc:  # noqa: BLE001
            print(f"Q{qnum}: FAILED ({exc})", flush=True)
            continue
        OUT_PATH.write_text(json.dumps(done, ensure_ascii=False, indent=2), encoding="utf-8")
        if (i + 1) % 10 == 0 or i == len(remaining) - 1:
            print(f"[{i+1}/{len(remaining)}] Q{qnum} done, total translated: {len(done)}", flush=True)


if __name__ == "__main__":
    main()
