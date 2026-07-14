# Arabic verification pipeline

Run from this directory with Python 3.10+:

```bash
python3 render_pages.py
python3 transcribe_pages.py                 # resumable; uses backend/.env
python3 segment_transcripts.py              # hard-stops on gaps/duplicates/order
python3 compare_datasets.py                 # review verification_report.md
python3 build_v2.py --approve-conflicts     # only after manual conflict review
npm --prefix ../../.. run seed:arabic       # separate, explicit DB mutation
```

Useful scoped runs include `--book 1` for rendering/transcription and
`--provider nvidia` to retry failures through the fallback provider. Generated
pages, transcripts, and reports are under `backend/data/verification/` and are
gitignored. Set `ARABIC_PDF_DIR` if the source PDFs move.
