# Y-maze Randomizer

This project provides a Tkinter-based GUI for generating randomized Y-maze schedules. It balances exit arm assignments across animals and produces per-day tables that minimize color switches between trials.

## Features
- Balanced exit-arm assignment within genotype, sex, and cage groups, while keeping global counts for arms 1–3 as even as possible.
- Dynamic programming to build trial schedules that avoid the learning-day exit arm for each animal and minimize arm switching.
- Paste or type animal data directly into the interface; robust parser expects rows of `AnimalID Tag Sex Genotype Cage`.
- Export generated schedules as separate CSV files, a combined CSV, or an Excel workbook with one sheet per day.

## Requirements
- Python 3 with Tkinter (included with most Python distributions).
- Optional: `openpyxl` for Excel export (`pip install openpyxl`).

## Usage
1. Run the application:
   ```bash
   python code.py
   ```
2. Enter animal information into the text box. Each line should contain:
   ```
   AnimalID Tag Sex Genotype Cage
   ```
   The parser uses the `Sex` token to separate fields, so tags and genotypes may contain spaces.
3. Specify the number of learning days, reversal days, and trials per day.
4. Click **Generate** to produce the schedules.
5. Copy results to the clipboard or use the export buttons for CSV or Excel files.

## Notes
- Exit arm assignments are deterministic for a given random seed; leave the seed blank for a fresh randomization each run.
- Excel export requires `openpyxl`; a warning is shown if the library is missing.

## Contributing
Pull requests are welcome! Please open an issue to discuss major changes before submitting.
