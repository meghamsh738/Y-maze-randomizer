# Y-Maze Randomizer - Modern Application

## Features
- Modern, responsive UI built with React + TypeScript + Tailwind CSS
- FastAPI backend with optimized Y-maze scheduling algorithms
- Balanced exit arm assignment
- Pseudorandom sequence generation (no triple repeats)
- Dynamic programming for cage optimization
- Excel export functionality

## Running the Application

### Backend (FastAPI)
```bash
cd backend
python -m venv venv
venv\Scripts\activate  # Windows
pip install -r requirements.txt
python main.py
```

The backend will run on `http://localhost:8000`

### Frontend (React)
```bash
cd modern-app
npm install  # If not already installed
npm run dev
```

The frontend will run on `http://localhost:5173`

## Usage

1. Start the backend server first
2. Start the frontend development server
3. Open `http://localhost:5173` in your browser
4. Paste animal data (tab-separated or space-separated format)
5. Configure learning days, reversal days, and trials per day
6. Click "Generate Schedule" to view the results
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
