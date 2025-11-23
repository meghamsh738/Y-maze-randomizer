"""
Y-Maze Randomizer Backend API
Extracted from the original Tkinter application.
Handles all the core scheduling logic.
"""

import io
import random
from collections import defaultdict, OrderedDict, Counter
from pathlib import Path
from typing import List, Dict, Any, Optional

import pandas as pd
from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field


app = FastAPI(title="Y-Maze Randomizer API")

# CORS middleware to allow frontend communication
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://localhost:5174",
        "http://localhost:5175",
    ],  # Vite dev servers
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ==================== MODELS ====================

class AnimalInput(BaseModel):
    AnimalID: str
    Tag: str
    Sex: str
    Genotype: str
    Cage: str


class ScheduleRequest(BaseModel):
    animals: List[AnimalInput]
    learning_days: int = Field(..., gt=0)
    reversal_days: int = Field(..., ge=0)
    trials_per_day: int = Field(..., gt=0)
    seed: Optional[int] = None
    use_example: bool = False


# ==================== CORE LOGIC ====================
ROOT_DIR = Path(__file__).resolve().parent.parent
EXAMPLE_ANIMALS_PATH = ROOT_DIR / "example_data" / "animals.csv"


def load_example_animals() -> List[Dict[str, Any]]:
    """Load bundled example animals as dictionaries."""
    if not EXAMPLE_ANIMALS_PATH.exists():
        raise FileNotFoundError(f"Missing example dataset at {EXAMPLE_ANIMALS_PATH}")
    df = pd.read_csv(EXAMPLE_ANIMALS_PATH)
    return df.rename(columns={
        "AnimalID": "AnimalID",
        "Tag": "Tag",
        "Sex": "Sex",
        "Genotype": "Genotype",
        "Cage": "Cage"
    }).to_dict('records')


def assign_balanced_exit_arms(animal_data: List[Dict]) -> Dict[str, int]:
    """
    Learning-days exit-arm assignment with balanced distribution.
    """
    groupings = defaultdict(list)
    for animal in animal_data:
        key = (animal['Genotype'], animal['Sex'], animal['Cage'])
        groupings[key].append(animal)

    groups = []
    for key, animals in groupings.items():
        animals = animals[:]
        random.shuffle(animals)
        groups.append((key, animals))
    random.shuffle(groups)

    N = len(animal_data)
    base = N // 3
    remainder = N % 3
    target = {
        1: base + (1 if remainder >= 1 else 0),
        2: base + (1 if remainder >= 2 else 0),
        3: base
    }
    remaining = target.copy()

    def seq_from_offset(m, offset):
        return [((j + offset) % 3) + 1 for j in range(m)]

    def score_sequence(seq, rem):
        c = Counter(seq)
        over = sum(max(0, c[a] - rem[a]) for a in (1, 2, 3))
        prefer = -sum(min(c[a], rem[a]) for a in (1, 2, 3))
        return (over, prefer)

    exit_arm_map = {}
    for _, animals in groups:
        m = len(animals)
        candidates = [(o, seq_from_offset(m, o)) for o in (0, 1, 2)]
        best_offset, best_seq = min(candidates, key=lambda it: score_sequence(it[1], remaining))

        adjusted = []
        for arm in best_seq:
            if remaining[arm] > 0:
                adjusted.append(arm)
                remaining[arm] -= 1
            else:
                alt = max((1, 2, 3), key=lambda a: (remaining[a], random.random()))
                adjusted.append(alt)
                remaining[alt] -= 1

        for animal, arm in zip(animals, adjusted):
            exit_arm_map[animal['AnimalID']] = arm

    return exit_arm_map


def group_animals_by_cage_in_order(animal_data: List[Dict]) -> OrderedDict:
    """Preserve first-seen cage order."""
    cages = OrderedDict()
    for a in animal_data:
        cages.setdefault(a['Cage'], []).append(a)
    return cages


def plan_cage_dp(cage_animals: List[Dict], prev_arm: Optional[int], learning_exit_map: Dict[str, int]) -> Dict:
    """
    Dynamic programming for one cage to minimize switches.
    """
    m = len(cage_animals)
    if m == 0:
        return {'cost': 0, 'end': prev_arm, 'first': prev_arm, 'colors': []}

    allowed = []
    for a in cage_animals:
        forbid = learning_exit_map[a['AnimalID']]
        allowed.append(tuple(sorted({1, 2, 3} - {forbid})))

    dp = [dict() for _ in range(m)]
    
    for c in allowed[0]:
        cost0 = 0 if (prev_arm is None or c == prev_arm) else 1
        dp[0][c] = (cost0, None)

    for i in range(1, m):
        for c in allowed[i]:
            best_cost = None
            best_prev = None
            for c_prev, (cost_prev, _) in dp[i-1].items():
                cost_here = cost_prev + (0 if c == c_prev else 1)
                if best_cost is None or cost_here < best_cost:
                    best_cost = cost_here
                    best_prev = c_prev
            dp[i][c] = (best_cost, best_prev)

    end_color = min(dp[-1], key=lambda c: dp[-1][c][0])
    total_cost = dp[-1][end_color][0]

    colors = [None] * m
    colors[-1] = end_color
    for i in range(m-1, 0, -1):
        colors[i-1] = dp[i][colors[i]][1]
    first_color = colors[0]

    return {'cost': total_cost, 'end': end_color, 'first': first_color, 'colors': colors}


def build_nonlearning_plan_cage_packs(animal_data: List[Dict], learning_exit_map: Dict[str, int]):
    """
    Reorder cages to minimize switches on non-learning days.
    """
    cages = group_animals_by_cage_in_order(animal_data)
    cage_names = list(cages.keys())

    plans = {c: {s: plan_cage_dp(cages[c], s, learning_exit_map) for s in (1, 2, 3)}
             for c in cage_names}

    best_total = None
    best_solution = None

    for start_arm in (1, 2, 3):
        for first_cage in cage_names:
            remaining = set(cage_names)
            seq = []
            chosen = {}
            prev_end = start_arm
            total_cost = 0

            current = first_cage
            while remaining:
                if current is None:
                    current = min(remaining, key=lambda ck: plans[ck][prev_end]['cost'])
                plan = plans[current][prev_end]
                total_cost += plan['cost']
                seq.append(current)
                chosen[current] = plan
                remaining.remove(current)
                prev_end = plan['end']
                current = None

            total_cost += 0 if prev_end == start_arm else 1

            if best_total is None or total_cost < best_total:
                best_total = total_cost
                best_solution = (start_arm, seq, chosen)

    _, cage_sequence, chosen_plans = best_solution
    per_animal_exit = {}
    ordered_animals = []

    for c in cage_sequence:
        animals = cages[c]
        colors = chosen_plans[c]['colors']
        for a, arm in zip(animals, colors):
            per_animal_exit[a['AnimalID']] = arm
            ordered_animals.append(a)

    return ordered_animals, per_animal_exit


def generate_pseudorandom_sequence(n_trials: int, armA: int, armB: int, avoid_first: Optional[int] = None) -> List[int]:
    """
    Generate pseudo-random start-arm sequence with no triple repeats.
    """
    countA, countB = n_trials // 2, n_trials // 2
    if n_trials % 2 == 1:
        if random.random() < 0.5:
            countA += 1
        else:
            countB += 1

    pool = [armA] * countA + [armB] * countB
    random.shuffle(pool)

    def valid(seq):
        return len(seq) < 3 or not (seq[-1] == seq[-2] == seq[-3])

    def backtrack(cur, items):
        if not items:
            return cur
        for i, cand in enumerate(items):
            if avoid_first is not None and len(cur) == 0 and cand == avoid_first:
                continue
            new = cur + [cand]
            if valid(new):
                out = backtrack(new, items[:i] + items[i+1:])
                if out is not None:
                    return out
        return None

    seq = backtrack([], pool)
    return seq if seq else pool


def generate_day_tables(animal_data: List[Dict], learning_days: int, reversal_days: int, n_trials: int, exit_arm_map: Dict[str, int]):
    """
    Build per-day tables for learning and reversal days.
    """
    total_days = learning_days + reversal_days
    if total_days <= 0:
        return []

    base_order_animals = list(animal_data)
    day_tables = []

    for d in range(total_days):
        in_learning = d < learning_days
        header = ["AnimalID", "Tag", "Sex", "Genotype", "Cage", "ExitArm"] + [f"T{i+1}" for i in range(n_trials)]
        rows = []

        if in_learning:
            animals_today = base_order_animals
            per_day_exit = {a['AnimalID']: exit_arm_map[a['AnimalID']] for a in animals_today}
        else:
            animals_today, per_day_exit = build_nonlearning_plan_cage_packs(base_order_animals, exit_arm_map)

        for animal in animals_today:
            aid = animal['AnimalID']
            exit_arm_today = per_day_exit[aid]

            other = [1, 2, 3]
            other.remove(exit_arm_today)
            armA, armB = other

            avoid_first = exit_arm_today if in_learning else exit_arm_map[aid]

            seq = generate_pseudorandom_sequence(n_trials, armA, armB, avoid_first=avoid_first)
            row = [aid, animal['Tag'], animal['Sex'], animal['Genotype'], animal['Cage'], exit_arm_today] + seq
            rows.append(row)

        day_tables.append({
            "day": d + 1,
            "type": "Learning" if in_learning else "Reversal",
            "header": header,
            "rows": rows
        })

    return day_tables


# ==================== API ENDPOINTS ====================

@app.post("/generate-schedule")
async def generate_schedule(request: ScheduleRequest):
    """
    Generate Y-maze schedule based on input parameters.
    """
    try:
        # Seed for reproducibility when provided
        if request.seed is not None:
            random.seed(request.seed)

        # Convert Pydantic models to dicts or load example data
        if request.use_example or not request.animals:
            try:
                animal_data = load_example_animals()
            except FileNotFoundError as e:
                raise HTTPException(status_code=400, detail=str(e))
        else:
            animal_data = [animal.dict() for animal in request.animals]

        if not animal_data:
            raise HTTPException(status_code=400, detail="No animals provided.")

        # Generate balanced exit arms
        exit_arm_map = assign_balanced_exit_arms(animal_data)

        # Generate day tables
        day_tables = generate_day_tables(
            animal_data,
            request.learning_days,
            request.reversal_days,
            request.trials_per_day,
            exit_arm_map
        )

        return {
            "success": True,
            "exit_arm_map": exit_arm_map,
            "day_tables": day_tables
        }

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/export-excel")
async def export_excel(request: ScheduleRequest):
    """
    Export schedule to Excel file with separate sheets for each day.
    """
    try:
        if request.seed is not None:
            random.seed(request.seed)

        if request.use_example or not request.animals:
            try:
                animal_data = load_example_animals()
            except FileNotFoundError as e:
                raise HTTPException(status_code=400, detail=str(e))
        else:
            animal_data = [animal.dict() for animal in request.animals]

        if not animal_data:
            raise HTTPException(status_code=400, detail="No animals provided.")

        exit_arm_map = assign_balanced_exit_arms(animal_data)
        day_tables = generate_day_tables(
            animal_data,
            request.learning_days,
            request.reversal_days,
            request.trials_per_day,
            exit_arm_map
        )

        # Create Excel file in memory
        output = io.BytesIO()
        with pd.ExcelWriter(output, engine='openpyxl') as writer:
            for table in day_tables:
                df = pd.DataFrame(table['rows'], columns=table['header'])
                sheet_name = f"Day{table['day']}_{table['type']}"
                df.to_excel(writer, sheet_name=sheet_name, index=False)

        output.seek(0)
        
        return StreamingResponse(
            output,
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers={"Content-Disposition": "attachment; filename=ymaze_schedule.xlsx"}
        )

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/health")
async def health_check():
    """Health check endpoint."""
    return {"status": "healthy"}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8000)
