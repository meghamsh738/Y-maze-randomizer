@echo off
echo Starting Y-Maze Randomizer Frontend...
IF NOT EXIST node_modules (
  echo Installing dependencies...
  npm install
)
npm run dev
