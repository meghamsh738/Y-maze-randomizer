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
    balance_by?: ('Genotype' | 'Sex' | 'Cage')[]
    max_consecutive_repeats?: number
    locked_exit_arms?: Record<string, number>
    preset_name?: string
    source_is_example?: boolean
}

export interface DayTable {
    day: number
    type: 'Learning' | 'Reversal'
    header: string[]
    rows: (string | number)[][]
}

export interface ScheduleData {
    success: boolean
    seed?: number
    requested_seed?: number | null
    algorithm_version?: string
    preset_name?: string
    animals?: AnimalInput[]
    settings?: {
        learning_days: number
        reversal_days: number
        trials_per_day: number
        balance_by: ('Genotype' | 'Sex' | 'Cage')[]
        max_consecutive_repeats: number
    }
    locked_exit_arms?: Record<string, number>
    exit_arm_map: Record<string, number>
    day_tables: DayTable[]
}
