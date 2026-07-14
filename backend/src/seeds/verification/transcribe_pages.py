#!/usr/bin/env python3
"""Stage 2: transcribe rendered page images through an OpenAI-compatible API."""

import argparse
import base64
import concurrent.futures
import json
import os
import random
import time
import urllib.error
import urllib.request
from pathlib import Path

from common import WORK_DIR, load_dotenv, page_number, write_json

PROMPT = """Transcribe all printed Arabic on this page exactly as shown.
Preserve question numbers, headings, paragraph breaks, punctuation, and reading order.
Mark each footnote as [حاشية] followed by its text. Do not translate, correct, summarize,
or add commentary. Output only the page transcription."""

PROVIDERS = {
    "anthropic": {
        "url": "https://api.anthropic.com/v1/messages",
        "key": "ANTHROPIC_API_KEY",
        "key_id": "anthropic",
        "model": "claude-haiku-4-5-20251001",
        "api": "anthropic",
    },
    "openai": {
        "url": "https://api.openai.com/v1/chat/completions",
        "key": "OPENAI_API_KEY",
        "key_id": "openai",
        "model": "gpt-4.1-mini",
    },
    "openrouter": {
        "url": "https://openrouter.ai/api/v1/chat/completions",
        "key": "OPENROUTER_API_KEY",
        "key_id": "openrouter",
        "model": "google/gemini-2.5-flash",
    },
    "gemini": {
        "url": "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
        "key": "GEMINI_API_KEY",
        "key_id": "google",
        "model": "gemini-2.5-flash",
    },
    "nvidia": {
        "url": "https://integrate.api.nvidia.com/v1/chat/completions",
        "key": "NVIDIA_API_KEY",
        "key_id": "nvidia",
        "model": "meta/llama-3.2-90b-vision-instruct",
    },
}


def key_from_bundle(path: Path, provider_id: str) -> str | None:
    """Read one provider key from an OpenCode-style export without copying it."""
    if not path.exists():
        raise SystemExit(f"API key bundle does not exist: {path}")
    data = json.loads(path.read_text(encoding="utf-8"))
    for provider in data.get("providers", []):
        if provider.get("id") == provider_id and provider.get("apiKey"):
            return provider["apiKey"]
    return None


def transcribe(image: Path, settings: dict, timeout: int) -> str:
    encoded = base64.b64encode(image.read_bytes()).decode("ascii")
    if settings.get("api") == "anthropic":
        payload = {
            "model": settings["model"], "max_tokens": 8192, "temperature": 0,
            "messages": [{"role": "user", "content": [
                {"type": "image", "source": {"type": "base64", "media_type": "image/png", "data": encoded}},
                {"type": "text", "text": PROMPT},
            ]}],
        }
        headers = {
            "x-api-key": settings["api_key"], "anthropic-version": "2023-06-01",
            "Content-Type": "application/json",
        }
    else:
        payload = {
            "model": settings["model"],
            "temperature": 0,
            "messages": [{"role": "user", "content": [
                {"type": "text", "text": PROMPT},
                {"type": "image_url", "image_url": {"url": f"data:image/png;base64,{encoded}"}},
            ]}],
        }
        headers = {"Authorization": f"Bearer {settings['api_key']}", "Content-Type": "application/json"}
    request = urllib.request.Request(
        settings["url"],
        data=json.dumps(payload).encode(),
        headers=headers,
        method="POST",
    )
    with urllib.request.urlopen(request, timeout=timeout) as response:
        result = json.load(response)
    text = (
        result["content"][0]["text"] if settings.get("api") == "anthropic"
        else result["choices"][0]["message"]["content"]
    ).strip()
    if not text:
        raise ValueError("Provider returned an empty transcription")
    return text


def process(image: Path, output: Path, settings: dict, args) -> dict | None:
    if output.exists() and output.stat().st_size:
        return None
    error = None
    for attempt in range(1, args.retries + 1):
        try:
            text = transcribe(image, settings, args.timeout)
            output.parent.mkdir(parents=True, exist_ok=True)
            temporary = output.with_suffix(".txt.tmp")
            temporary.write_text(text + "\n", encoding="utf-8")
            temporary.replace(output)
            if args.delay:
                time.sleep(args.delay)
            return None
        except (OSError, ValueError, KeyError, IndexError, urllib.error.HTTPError) as exc:
            error = f"{type(exc).__name__}: {exc}"
            if attempt < args.retries:
                time.sleep((2 ** (attempt - 1)) + random.random())
    return {"page": str(image.relative_to(WORK_DIR)), "error": error}


def main() -> None:
    load_dotenv()
    parser = argparse.ArgumentParser()
    parser.add_argument("--provider", choices=PROVIDERS, default=os.getenv("TRANSCRIBE_PROVIDER", "gemini"))
    parser.add_argument("--key-file", type=Path, help="OpenCode-style JSON provider-key export")
    parser.add_argument("--model")
    parser.add_argument("--book", type=int, choices=range(0, 8), action="append")
    parser.add_argument("--concurrency", type=int, default=1)
    parser.add_argument("--delay", type=float, default=4.2)
    parser.add_argument("--retries", type=int, default=3)
    parser.add_argument("--timeout", type=int, default=180)
    args = parser.parse_args()
    settings = dict(PROVIDERS[args.provider])
    settings["model"] = args.model or os.getenv(f"{args.provider.upper()}_MODEL", settings["model"])
    settings["api_key"] = (
        key_from_bundle(args.key_file, settings["key_id"]) if args.key_file
        else os.getenv(settings["key"])
    )
    if not settings["api_key"] or settings["api_key"].startswith("<"):
        raise SystemExit(f"Missing {settings['key']} in backend/.env")

    jobs = []
    for book in args.book or range(0, 8):
        images = sorted((WORK_DIR / "pages" / f"book{book}").glob("page-*.png"), key=page_number)
        if not images:
            raise SystemExit(f"No rendered pages for book{book}; run render_pages.py first")
        for image in images:
            output = WORK_DIR / "transcripts" / f"book{book}" / f"page-{page_number(image):04d}.txt"
            if not output.exists() or not output.stat().st_size:
                jobs.append((image, output))
    print(f"{len(jobs)} page(s) pending with {args.provider}/{settings['model']}")
    failures = []
    with concurrent.futures.ThreadPoolExecutor(max_workers=max(1, args.concurrency)) as executor:
        futures = [executor.submit(process, image, output, settings, args) for image, output in jobs]
        for index, future in enumerate(concurrent.futures.as_completed(futures), 1):
            failure = future.result()
            if failure:
                failures.append(failure)
            if index % 10 == 0 or index == len(futures):
                print(f"completed {index}/{len(futures)}; failures: {len(failures)}")
    write_json(WORK_DIR / "failed_pages.json", failures)
    if failures:
        raise SystemExit(f"{len(failures)} page(s) failed; see failed_pages.json")


if __name__ == "__main__":
    main()
