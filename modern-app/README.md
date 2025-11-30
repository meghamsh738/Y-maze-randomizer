# Y-Maze Randomizer (React + FastAPI)

Modern web UI for generating balanced Y-maze schedules. Paste animals or flip on **Use Example Data**, tweak days/trials, then export CSV/Excel. Bundled Playwright E2E verifies the flow and saves a screenshot.

## Project structure
- `src/` – React UI (Vite + TypeScript + Tailwind).
- `backend/` – FastAPI API with scheduling logic.
- `example_data/animals.csv` – Built-in dataset for example mode.
- `tests/` – Playwright E2E covering the example flow.
- `screenshots/example_run.png` – Produced by the E2E as evidence.
- Preview: open `screenshots/example_run.png` after running the E2E.

## Screenshot
| Example run (Use Example Data) |
| --- |
| ![Example schedule generation](screenshots/example_run.png) |

## Prerequisites
- Node 18+ and npm
- Python 3.10+

## Setup
```bash
npm install
pip install -r backend/requirements.txt
```

## Run (dev)
```bash
# API on :8000
npm run dev:back
# Frontend on :5175
npm run dev:front
```
Open http://localhost:5175, check **Use Example Data**, and click **Generate Schedule**.

## Data format & quick AI helper
- Required columns (CSV/XLSX): `AnimalID, Tag, Sex, Genotype, Cage` (see `example_data/animals.csv`).
- Need to reshape first? Use: [ChatGPT](https://chat.openai.com/), [Gemini](https://gemini.google.com/app), [Grok](https://grok.com/).
- Prompt: "Convert my table to CSV with headers: AnimalID, Tag, Sex, Genotype, Cage. Keep data unchanged, no new rows, output UTF-8 CSV text only."
- Save as `animals.csv`, then upload or paste. See `screenshots/data-format-helper.svg` for a one-screen guide.

## Tests & screenshot
```bash
npx playwright install --with-deps chromium
npm run test:e2e
```
This starts both servers, drives the example flow, and writes `screenshots/example_run.png`.

## API highlights
- `POST /generate-schedule` – animals[], learning_days, reversal_days, trials_per_day, seed?, use_example?
- `POST /export-excel` – same body, returns Excel workbook
- `POST /upload`
- `GET /health`

All endpoints honor `use_example: true` to operate on `example_data/animals.csv`, so the app runs even without user-provided data.
