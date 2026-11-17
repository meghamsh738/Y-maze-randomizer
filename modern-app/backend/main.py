"""
Y-Maze Randomizer Backend API
Extracted from the original Tkinter application.
Handles all the core scheduling logic.
"""

import io
import json
import random
import secrets
from collections import defaultdict, OrderedDict, Counter
from pathlib import Path
from typing import List, Dict, Any, Optional, Literal

import pandas as pd
from openpyxl import Workbook
from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field


app = FastAPI(title="Y-Maze Randomizer API")

# CORS middleware to allow frontend communication
app.add_middleware(
    CORSMiddleware,
    # The suite loads front-ends from file:// inside Electron. Allow all origins so
    # local module windows can talk to the bundled FastAPI backend.
    allow_origins=["*"],
    allow_credentials=False,
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
    balance_by: List[Literal["Genotype", "Sex", "Cage"]] = Field(default_factory=lambda: ["Genotype", "Sex", "Cage"])
    max_consecutive_repeats: int = Field(2, ge=1, le=8)
    locked_exit_arms: Dict[str, int] = Field(default_factory=dict)
    preset_name: str = "Current Y-maze protocol"
    source_is_example: bool = False


class DayTableData(BaseModel):
    day: int = Field(..., gt=0)
    type: Literal["Learning", "Reversal"]
    header: List[str]
    rows: List[List[Any]]


class ReviewedScheduleExport(BaseModel):
    seed: int
    exit_arm_map: Dict[str, int]
    day_tables: List[DayTableData]
    settings: Dict[str, Any]
    animals: List[AnimalInput]
    locked_exit_arms: Dict[str, int] = Field(default_factory=dict)
    preset_name: str = "Current Y-maze protocol"


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


def assign_balanced_exit_arms(
    animal_data: List[Dict],
    balance_by: Optional[List[str]] = None,
    locked_exit_arms: Optional[Dict[str, int]] = None,
    rng=None,
) -> Dict[str, int]:
    """
    Learning-days exit-arm assignment with balanced distribution.
    """
    rng = rng or random
    balance_by = balance_by if balance_by is not None else ["Genotype", "Sex", "Cage"]
    locked_exit_arms = locked_exit_arms or {}

    N = len(animal_data)
    base = N // 3
    remainder = N % 3
    target = {
        1: base + (1 if remainder >= 1 else 0),
        2: base + (1 if remainder >= 2 else 0),
        3: base
    }
    remaining = target.copy()
    exit_arm_map = dict(locked_exit_arms)
    for arm in locked_exit_arms.values():
        remaining[arm] -= 1

    groupings = defaultdict(list)
    for animal in animal_data:
        if animal['AnimalID'] in locked_exit_arms:
            continue
        key = tuple(animal[field] for field in balance_by)
        groupings[key].append(animal)

    groups = []
    for key, animals in groupings.items():
        rng.shuffle(animals)
        groups.append((key, animals))
    rng.shuffle(groups)

    def seq_from_offset(m, offset):
        return [((j + offset) % 3) + 1 for j in range(m)]

    def score_sequence(seq, rem):
        c = Counter(seq)
        over = sum(max(0, c[a] - rem[a]) for a in (1, 2, 3))
        prefer = -sum(min(c[a], rem[a]) for a in (1, 2, 3))
        return (over, prefer)

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
                alt = max((1, 2, 3), key=lambda a: (remaining[a], rng.random()))
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


def generate_pseudorandom_sequence(
    n_trials: int,
    armA: int,
    armB: int,
    avoid_first: Optional[int] = None,
    max_consecutive_repeats: int = 2,
    rng=None,
) -> List[int]:
    """
    Generate pseudo-random start-arm sequence with no triple repeats.
    """
    rng = rng or random
    countA, countB = n_trials // 2, n_trials // 2
    if n_trials % 2 == 1:
        if avoid_first == armA:
            countB += 1
        elif avoid_first == armB:
            countA += 1
        else:
            if rng.random() < 0.5:
                countA += 1
            else:
                countB += 1

    pool = [armA] * countA + [armB] * countB
    sequence: List[int] = []
    failed_states = set()

    def build(left_a: int, left_b: int, previous: Optional[int], run_length: int) -> bool:
        if left_a == 0 and left_b == 0:
            return True

        state = (left_a, left_b, previous, run_length)
        if state in failed_states:
            return False

        choices = []
        if left_a:
            choices.append(armA)
        if left_b:
            choices.append(armB)
        rng.shuffle(choices)

        for arm in choices:
            if not sequence and arm == avoid_first:
                continue
            next_run = run_length + 1 if arm == previous else 1
            if next_run > max_consecutive_repeats:
                continue

            sequence.append(arm)
            if build(left_a - (arm == armA), left_b - (arm == armB), arm, next_run):
                return True
            sequence.pop()

        failed_states.add(state)
        return False

    if not build(countA, countB, None, 0):
        raise ValueError("The requested first-trial and consecutive-repeat rules cannot fit this trial count.")
    return sequence


def generate_day_tables(
    animal_data: List[Dict],
    learning_days: int,
    reversal_days: int,
    n_trials: int,
    exit_arm_map: Dict[str, int],
    max_consecutive_repeats: int = 2,
    rng=None,
):
    """
    Build per-day tables for learning and reversal days.
    """
    rng = rng or random
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

            seq = generate_pseudorandom_sequence(
                n_trials,
                armA,
                armB,
                avoid_first=avoid_first,
                max_consecutive_repeats=max_consecutive_repeats,
                rng=rng,
            )
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

def _model_data(model: BaseModel) -> Dict[str, Any]:
    if hasattr(model, "model_dump"):
        return model.model_dump()
    return model.dict()

def _get_animal_data(request: ScheduleRequest) -> List[Dict[str, Any]]:
    if request.use_example or not request.animals:
        try:
            animal_data = load_example_animals()
        except FileNotFoundError as error:
            raise HTTPException(status_code=400, detail=str(error)) from error
    else:
        animal_data = [_model_data(animal) for animal in request.animals]

    if not animal_data:
        raise HTTPException(status_code=400, detail="No animals provided.")

    seen_ids = set()
    for animal in animal_data:
        animal_id = str(animal.get("AnimalID", "")).strip()
        if not animal_id:
            raise HTTPException(status_code=400, detail="Every animal needs an AnimalID.")
        if animal_id in seen_ids:
            raise HTTPException(status_code=400, detail=f"AnimalID {animal_id} appears more than once.")
        seen_ids.add(animal_id)
        for field in ("Tag", "Sex", "Genotype", "Cage"):
            if not str(animal.get(field, "")).strip():
                raise HTTPException(status_code=400, detail=f"Animal {animal_id} is missing {field}.")

    unknown_locks = set(request.locked_exit_arms) - seen_ids
    if unknown_locks:
        raise HTTPException(
            status_code=400,
            detail="Exit-arm locks refer to unknown animals: " + ", ".join(sorted(unknown_locks)),
        )
    for animal_id, arm in request.locked_exit_arms.items():
        if arm not in (1, 2, 3):
            raise HTTPException(status_code=400, detail=f"Animal {animal_id} has an exit-arm lock outside 1–3.")

    return animal_data


def _build_schedule_payload(request: ScheduleRequest) -> Dict[str, Any]:
    animal_data = _get_animal_data(request)
    effective_seed = request.seed if request.seed is not None else secrets.randbits(32)
    rng = random.Random(effective_seed)

    exit_arm_map = assign_balanced_exit_arms(
        animal_data,
        balance_by=request.balance_by,
        locked_exit_arms=request.locked_exit_arms,
        rng=rng,
    )
    day_tables = generate_day_tables(
        animal_data,
        request.learning_days,
        request.reversal_days,
        request.trials_per_day,
        exit_arm_map,
        max_consecutive_repeats=request.max_consecutive_repeats,
        rng=rng,
    )

    return {
        "success": True,
        "seed": effective_seed,
        "requested_seed": request.seed,
        "algorithm_version": "ymaze-schedule-v2",
        "preset_name": request.preset_name,
        "animals": animal_data,
        "settings": {
            "learning_days": request.learning_days,
            "reversal_days": request.reversal_days,
            "trials_per_day": request.trials_per_day,
            "balance_by": request.balance_by,
            "max_consecutive_repeats": request.max_consecutive_repeats,
        },
        "locked_exit_arms": request.locked_exit_arms,
        "use_example": request.use_example or request.source_is_example,
        "exit_arm_map": exit_arm_map,
        "day_tables": day_tables,
    }


def _write_schedule_workbook(day_tables: List[Dict[str, Any]], protocol: Optional[Dict[str, Any]] = None) -> io.BytesIO:
    workbook = Workbook()

    def append_row(sheet, values: List[Any]) -> None:
        sheet.append(values)
        for column, value in enumerate(values, start=1):
            if isinstance(value, str):
                # Keep reviewed text literal, including values Excel treats as formulas.
                sheet.cell(row=sheet.max_row, column=column).data_type = "s"

    if protocol is not None:
        protocol_sheet = workbook.active
        protocol_sheet.title = "Protocol"
        append_row(protocol_sheet, ["Setting", "Value"])
        for key, value in protocol.items():
            append_row(protocol_sheet, [key, str(value)])
    else:
        workbook.remove(workbook.active)

    for table in day_tables:
        header = table["header"]
        rows = table["rows"]
        if any(len(row) != len(header) for row in rows):
            raise HTTPException(status_code=400, detail=f"Day {table['day']} has a row with the wrong number of values.")
        sheet_name = f"Day{table['day']}_{table['type']}"
        sheet = workbook.create_sheet(title=sheet_name)
        append_row(sheet, header)
        for row in rows:
            append_row(sheet, row)

    output = io.BytesIO()
    workbook.save(output)
    output.seek(0)
    return output

@app.post("/generate-schedule")
async def generate_schedule(request: ScheduleRequest):
    """
    Generate Y-maze schedule based on input parameters.
    """
    try:
        return _build_schedule_payload(request)

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
        payload = _build_schedule_payload(request)
        day_tables = payload["day_tables"]
        output = _write_schedule_workbook(day_tables)
        
        return StreamingResponse(
            output,
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers={"Content-Disposition": "attachment; filename=ymaze_schedule.xlsx"}
        )

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/export-reviewed-excel")
async def export_reviewed_excel(request: ReviewedScheduleExport):
    """Export the exact day tables that were reviewed in the interface."""
    try:
        day_tables = [_model_data(table) for table in request.day_tables]
        if not day_tables:
            raise HTTPException(status_code=400, detail="There is no reviewed schedule to export.")

        protocol = {
            "Preset": request.preset_name,
            "Seed": request.seed,
            "Algorithm version": "ymaze-schedule-v2",
            "Learning days": request.settings.get("learning_days"),
            "Reversal days": request.settings.get("reversal_days"),
            "Trials per day": request.settings.get("trials_per_day"),
            "Balance within": ", ".join(request.settings.get("balance_by", [])) or "Full cohort",
            "Maximum consecutive repeats": request.settings.get("max_consecutive_repeats"),
            "Locked exit arms": json.dumps(request.locked_exit_arms, sort_keys=True),
        }
        output = _write_schedule_workbook(day_tables, protocol)
        return StreamingResponse(
            output,
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers={"Content-Disposition": "attachment; filename=ymaze_reviewed_schedule.xlsx"},
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
