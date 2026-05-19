# Tax Receipts App — Infrastructure Framework

## Recommendation

Use a **local-first Docker Compose web app** that can run on this computer during development and later be backed up or moved to another host/VPS.

Core stack:

- **Frontend:** React + Vite + TypeScript
- **Backend API:** FastAPI + Python
- **Database:** PostgreSQL
- **Job queue:** Redis + Celery/RQ workers
- **OCR:** Local OCR first — OCRmyPDF + Tesseract, with optional PaddleOCR later if receipt quality requires it
- **AI extraction:** Pluggable extractor service; start with OpenAI/Codex-compatible model for structured extraction, but keep OCR text and AI prompts auditable
- **SharePoint integration:** Microsoft Graph API
- **Storage:** Local mounted data volume for cached PDFs/OCR text/exports; SharePoint remains source of truth for original receipt documents
- **Deployment:** Docker Compose now; later move unchanged to another Linux box, mini-server, NAS, or VPS
- **Backups:** Nightly PostgreSQL dump + app config + optional local file cache archive

## Why this stack

- Runs cleanly on Boss's current Ubuntu/OpenClaw computer.
- Easy to back up: database dump + `.env` + Docker volumes + repo.
- Easy to move: install Docker, copy backup, restore compose stack.
- Python backend is best fit for OCR/PDF/document automation.
- React frontend is flexible for dashboards, graphs, upload/review screens, and future budgeting pages.
- PostgreSQL gives reliable structured history independent of SharePoint metadata limits.
- SharePoint stays integrated instead of trying to replace existing document storage.

## High-level services

```text
Browser UI
  ↓
React/Vite frontend
  ↓
FastAPI backend
  ├─ PostgreSQL: app state, receipt records, extraction history, review status
  ├─ Redis: background job queue
  ├─ Worker: SharePoint sync, OCR, AI extraction, metadata writes
  └─ Microsoft Graph: SharePoint document library read/write
```

## Tax Receipts workflow

1. User opens Tax Receipts page.
2. App syncs configured SharePoint receipt libraries/folders.
3. New or changed PDFs are queued.
4. Worker downloads/caches PDF locally.
5. Worker runs OCR.
6. AI extractor converts OCR text into structured receipt fields.
7. App stores extraction result with confidence, source text snippets, and audit trail.
8. User reviews low-confidence or important fields.
9. Approved metadata is written back to SharePoint custom columns.
10. Dashboard updates progress, totals, missing fields, and review queue.

## Initial SharePoint fields

Likely fields to support first:

- Business/job
- Tax year
- Receipt date
- Supplier/vendor
- ABN/GST number if present
- Total amount
- GST amount
- Category
- Payment method
- Deductibility flag/status
- Confidence score
- Review status
- Notes

## Security posture

- Store Microsoft credentials/tokens outside git in `.env` or a secure local secret store.
- Use least-privilege Microsoft Graph permissions.
- Keep an audit trail of every AI extraction and SharePoint metadata write.
- Never overwrite manually reviewed fields without clear rules.
- Treat OCR/AI output as suggestions until confidence thresholds and review rules are proven.
- Keep original receipts in SharePoint; app stores metadata/history and optional local cache.

## Backup/migration model

Minimum backup bundle:

- Git repo/app code
- `.env` secrets backup kept separately and encrypted/manual
- PostgreSQL dump: `pg_dump`
- Docker named volumes if local cache is required
- SharePoint library remains cloud source for original documents

Restore target:

1. Install Docker + Docker Compose.
2. Clone/copy repo.
3. Restore `.env`.
4. Restore PostgreSQL dump.
5. Start `docker compose up -d`.
6. Re-run SharePoint sync to verify.

## Proposed first milestone

Build Tax Receipts MVP:

- Basic dashboard shell
- Tax Receipts page
- PostgreSQL schema for receipt records and extraction runs
- Manual mock SharePoint file list importer first
- OCR pipeline against sample PDFs
- AI extraction into structured JSON
- Review table with editable fields
- Later: real Microsoft Graph connection and SharePoint metadata write-back
