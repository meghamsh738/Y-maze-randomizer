# Suite Integration (Easylab Suite)

This folder contains the integration contract for bundling this repo into the `easylab-suite` desktop launcher.

## What the suite expects
- Front-end build output at `.app-dist/web/` (Vite, file:// safe via `base: "./"`).
- FastAPI backend at `backend/main.py` (bundled into the suite under `apps/ymaze/backend`).
- Optional example dataset at `example_data/` (bundled into the suite under `apps/ymaze/example_data`).

## Module metadata
See `suite/module.json`.
