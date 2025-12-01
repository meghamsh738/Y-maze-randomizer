# Y-maze Randomizer

Modern React + FastAPI app under `modern-app/`. Legacy Tkinter GUI is documented separately in `LEGACY.md`.

## Features (shared logic)
- Balanced exit-arm assignment within genotype, sex, and cage groups, while keeping global counts for arms 1–3 as even as possible.
- Dynamic programming to build trial schedules that avoid the learning-day exit arm for each animal and minimize arm switching.
- Paste or type animal data directly; parser expects rows of `AnimalID Tag Sex Genotype Cage`.
- Export schedules as CSV (per-day or combined) or Excel with one sheet per day.

## Modern web app (preferred)
- See `modern-app/README.md` for setup and dev commands.
- Example run (Playwright E2E with bundled data — refreshed Dec 1, 2025): ![Y-maze scheduler app screenshot](modern-app/screenshots/example_run.png)
- Latest verification: `npm run test:e2e` (starts Vite front-end on :5175 and FastAPI back-end on :8000, drives the example flow, regenerates the screenshot above).

## Legacy Tkinter GUI (archived)
- Requirements: Python 3 with Tkinter (bundled in most installs); `openpyxl` for Excel export (`pip install openpyxl`).
- Run:
  ```bash
  python code.py
  ```
- Enter animal rows in the text box (`AnimalID Tag Sex Genotype Cage`), set learning/reversal days and trials, then click **Generate**. Copy output or export CSV/Excel as needed.

## Example Input

An example input sheet is available at [`examples/example_input.csv`](examples/example_input.csv),
which demonstrates the expected column layout:

```
AnimalID,Tag,Sex,Genotype,Cage
A1,101,M,IL-17 KO,Cage1
A2,102,F,IL-17 KO,Cage1
A3,201,M,C57Bl/6J,Cage2
A4,202,F,C57Bl/6J,Cage2
```

For illustration, a generated day-1 schedule for these animals might look like:

```
AnimalID,Day1ExitArm
A1,1
A2,2
A3,3
A4,1
```

Actual schedules may vary depending on the random seed and parameter choices.

## Notes
- Exit arm assignments are deterministic for a given random seed; leave the seed blank for a fresh randomization each run.
- Excel export requires `openpyxl`; a warning is shown if the library is missing.

## Contributing
Pull requests are welcome! Please open an issue to discuss major changes before submitting.
