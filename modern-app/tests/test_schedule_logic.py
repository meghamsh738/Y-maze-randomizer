import io
import unittest
import asyncio

from openpyxl import load_workbook

from backend.main import ReviewedScheduleExport, ScheduleRequest, _build_schedule_payload, export_reviewed_excel


def sample_animals():
    return [
        {"AnimalID": f"A{index}", "Tag": f"tag,{index}", "Sex": "F" if index % 2 else "M", "Genotype": "WT" if index < 5 else "KO", "Cage": f"C{index // 2}"}
        for index in range(1, 9)
    ]


def make_request(**overrides):
    values = {
        "animals": sample_animals(),
        "learning_days": 3,
        "reversal_days": 2,
        "trials_per_day": 10,
        "seed": 1287,
    }
    values.update(overrides)
    return ScheduleRequest(**values)


class ScheduleLogicTests(unittest.TestCase):
    def test_fixed_seed_reproduces_assignment_and_every_day(self):
        first = _build_schedule_payload(make_request())
        second = _build_schedule_payload(make_request())

        self.assertEqual(first["seed"], 1287)
        self.assertEqual(first["exit_arm_map"], second["exit_arm_map"])
        self.assertEqual(first["day_tables"], second["day_tables"])

    def test_automatic_seed_is_returned_and_can_replay_the_schedule(self):
        generated = _build_schedule_payload(make_request(seed=None))
        replayed = _build_schedule_payload(make_request(seed=generated["seed"]))

        self.assertIsInstance(generated["seed"], int)
        self.assertEqual(generated["requested_seed"], None)
        self.assertEqual(generated["exit_arm_map"], replayed["exit_arm_map"])
        self.assertEqual(generated["day_tables"], replayed["day_tables"])

    def test_locks_and_maximum_consecutive_repeats_are_respected(self):
        locks = {"A1": 3, "A4": 1}
        schedule = _build_schedule_payload(
            make_request(locked_exit_arms=locks, max_consecutive_repeats=1)
        )

        self.assertEqual({animal_id: schedule["exit_arm_map"][animal_id] for animal_id in locks}, locks)
        for table in schedule["day_tables"]:
            trial_columns = table["header"][6:]
            for row in table["rows"]:
                trials = [row[table["header"].index(column)] for column in trial_columns]
                self.assertTrue(all(trials[index] != trials[index - 1] for index in range(1, len(trials))))

    def test_reviewed_workbook_contains_the_displayed_cells(self):
        schedule = _build_schedule_payload(
            make_request(seed=None, locked_exit_arms={"A2": 2}, max_consecutive_repeats=1)
        )
        reviewed = ReviewedScheduleExport(**schedule)
        response = asyncio.run(export_reviewed_excel(reviewed))

        async def read_response():
            return b"".join([chunk async for chunk in response.body_iterator])

        workbook_bytes = asyncio.run(read_response())
        workbook = load_workbook(io.BytesIO(workbook_bytes), data_only=True)

        for table in schedule["day_tables"]:
            sheet = workbook[f"Day{table['day']}_{table['type']}"]
            exported_rows = [list(row) for row in sheet.iter_rows(values_only=True)]
            expected_rows = [table["header"], *table["rows"]]
            self.assertEqual(exported_rows, expected_rows)
        self.assertEqual(workbook["Protocol"]["B2"].value, "Current Y-maze protocol")
        self.assertEqual(workbook["Protocol"]["B3"].value, str(schedule["seed"]))
        self.assertEqual(workbook["Protocol"]["B4"].value, "ymaze-schedule-v2")
        self.assertEqual(workbook["Protocol"]["B9"].value, "1")
        self.assertEqual(workbook["Protocol"]["B10"].value, '{"A2": 2}')

    def test_reviewed_workbook_keeps_formula_like_and_quoted_values_literal(self):
        animals = sample_animals()
        animals[0].update({
            "AnimalID": "=1+1",
            "Tag": '+tag,"quoted"',
            "Sex": "-F",
            "Genotype": "@WT",
            "Cage": 'Cage,"C1"',
        })
        animals[1]["AnimalID"] = "0002"
        schedule = _build_schedule_payload(
            make_request(animals=animals, preset_name="=pilot+1", seed=73)
        )
        response = asyncio.run(export_reviewed_excel(ReviewedScheduleExport(**schedule)))

        async def read_response():
            return b"".join([chunk async for chunk in response.body_iterator])

        workbook_bytes = asyncio.run(read_response())
        workbook = load_workbook(io.BytesIO(workbook_bytes), data_only=False)
        day_sheet = workbook["Day1_Learning"]
        expected = ["=1+1", '+tag,"quoted"', "-F", "@WT", 'Cage,"C1"']
        self.assertEqual([day_sheet.cell(2, col).value for col in range(1, 6)], expected)
        self.assertTrue(all(day_sheet.cell(2, col).data_type == "s" for col in range(1, 6)))
        self.assertEqual(day_sheet["A3"].value, "0002")
        self.assertEqual(day_sheet["A3"].data_type, "s")
        self.assertEqual(workbook["Protocol"]["B2"].value, "=pilot+1")
        self.assertEqual(workbook["Protocol"]["B2"].data_type, "s")


if __name__ == "__main__":
    unittest.main()
