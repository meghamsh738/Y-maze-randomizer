// Type definitions for Y-Maze Scheduler

export interface AnimalInput {
    AnimalID: string
    Tag: string
    Sex: string
    Genotype: string
    Cage: string
}

export interface ScheduleRequest {
    animals: AnimalInput[]
    learning_days: number
    reversal_days: number
    trials_per_day: number
    seed?: number | null
}

export interface DayTable {
    day: number
    type: 'Learning' | 'Reversal'
    header: string[]
    rows: (string | number)[][]
}

export interface ScheduleData {
    success: boolean
    exit_arm_map: Record<string, number>
    day_tables: DayTable[]
}
