# Y-Maze Randomizer (React + FastAPI)

Modern web UI for generating balanced Y-maze schedules. Paste animals or flip on **Use Example Data**, tweak days/trials, then export CSV/Excel. Bundled Playwright E2E verifies the flow and saves a screenshot.

## Project structure
- `src/` – React UI (Vite + TypeScript + Tailwind).
- `backend/` – FastAPI API with scheduling logic.
- `example_data/animals.csv` – Built-in dataset for example mode.
- `tests/` – Playwright E2E covering the example flow.
- `screenshots/example_run.png` – Produced by the E2E as evidence.
- Preview: open `screenshots/example_run.png` after running the E2E.

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
7. Click "Export to Excel" to download the schedule

## Input Format

Animal data should include the following columns:
- AnimalID
- Tag
- Sex
- Genotype
- Cage (last column)

Example:
```
A001  Tag1  M  C57Bl/6J  Cage1
A002  Tag2  F  IL-17 KO  Cage1
```

## Features

- **Balanced Exit Arm Assignment**: Ensures fair distribution of exit arms across all animals
- **Learning vs. Reversal Days**: Supports both learning and reversal phases
- **No Triple Repeats**: Prevents the same start arm from appearing 3 times in a row
- **Cage Optimization**: Minimizes exit arm switches for non-learning days
- **Customizable**: Adjust parameters like number of days and trials per day

## Technology Stack

- **Frontend**: React, TypeScript, Vite, Tailwind CSS
- **Backend**: Python, FastAPI, Pandas, OpenPyXL
