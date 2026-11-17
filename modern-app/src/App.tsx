import { useEffect, useMemo, useState, type ChangeEvent } from 'react'
import {
  Calendar,
  Clipboard,
  Download,
  FlaskConical,
  RefreshCw,
  Shuffle
} from 'lucide-react'
import { GuidedTutorial, type TutorialStep } from './GuidedTutorial'
import exampleAnimals from '../example_data/animals.csv?raw'
import './App.css'

interface AnimalInput {
  AnimalID: string
  Tag: string
  Sex: string
  Genotype: string
  Cage: string
}

type BalanceField = 'Genotype' | 'Sex' | 'Cage'

interface ProtocolPreset {
  id: string
  name: string
  learning_days: number
  reversal_days: number
  trials_per_day: number
  balance_by: BalanceField[]
  max_consecutive_repeats: number
}

interface ScheduleSettings {
  learning_days: number
  reversal_days: number
  trials_per_day: number
  balance_by: BalanceField[]
  max_consecutive_repeats: number
}

interface DayTable {
  day: number
  type: 'Learning' | 'Reversal'
  header: string[]
  rows: (string | number)[][]
}

interface ScheduleData {
  success: boolean
  seed: number
  requested_seed: number | null
  algorithm_version: string
  preset_name: string
  animals: AnimalInput[]
  settings: ScheduleSettings
  locked_exit_arms: Record<string, number>
  use_example: boolean
  exit_arm_map: Record<string, number>
  day_tables: DayTable[]
}

interface SavedRun {
  format: 'easylab-ymaze-run'
  version: 1
  saved_at: string
  input_text: string
  use_example: boolean
  requested_seed: number | null
  schedule: ScheduleData
  reviewed: boolean
}

const PRESET_KEY = 'easylab-next:ymaze:presets:v1'
const REVIEW_KEY = 'easylab-next:ymaze:reviewed-run:v1'
const DEFAULT_PRESET: ProtocolPreset = {
  id: 'standard-learning-reversal',
  name: 'Standard learning and reversal',
  learning_days: 3,
  reversal_days: 2,
  trials_per_day: 10,
  balance_by: ['Genotype', 'Sex', 'Cage'],
  max_consecutive_repeats: 2,
}

function readSavedRun(): SavedRun | null {
  try {
    const value = localStorage.getItem(REVIEW_KEY)
    if (!value) return null
    const parsed: unknown = JSON.parse(value)
    return isSavedRun(parsed) ? parsed : null
  } catch {
    return null
  }
}

function readCustomPresets(): ProtocolPreset[] {
  try {
    const value = localStorage.getItem(PRESET_KEY)
    if (!value) return []
    const parsed = JSON.parse(value)
    return Array.isArray(parsed)
      ? parsed.filter((preset) => typeof preset?.id === 'string' && typeof preset?.name === 'string')
      : []
  } catch {
    return []
  }
}

function csvCell(value: string | number): string {
  const text = String(value)
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text
}

function tableCsv(table: DayTable): string {
  return [table.header, ...table.rows].map((row) => row.map(csvCell).join(',')).join('\r\n')
}

function splitCsvLine(line: string): string[] {
  const cells: string[] = []
  let cell = ''
  let quoted = false
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index]
    if (character === '"' && line[index + 1] === '"' && quoted) {
      cell += '"'
      index += 1
    } else if (character === '"') {
      quoted = !quoted
    } else if (character === ',' && !quoted) {
      cells.push(cell.trim())
      cell = ''
    } else {
      cell += character
    }
  }
  cells.push(cell.trim())
  return cells
}

function isSavedRun(value: unknown): value is SavedRun {
  if (!value || typeof value !== 'object') return false
  const run = value as Partial<SavedRun>
  const schedule = run.schedule
  if (run.format !== 'easylab-ymaze-run' || run.version !== 1 ||
    typeof run.input_text !== 'string' || typeof run.use_example !== 'boolean' ||
    typeof run.reviewed !== 'boolean' || !schedule ||
    !Number.isInteger(schedule.seed) || !Array.isArray(schedule.animals) ||
    !Array.isArray(schedule.day_tables) || schedule.day_tables.length === 0 ||
    !schedule.settings || !schedule.locked_exit_arms) {
    return false
  }
  return schedule.day_tables.every((table) =>
      Array.isArray(table.header) && Array.isArray(table.rows) &&
      table.rows.every((row) => Array.isArray(row) && row.length === table.header.length),
    )
}

function settingsMatchPreset(settings: ScheduleSettings, preset: ProtocolPreset | undefined): boolean {
  if (!preset) return false
  return settings.learning_days === preset.learning_days &&
    settings.reversal_days === preset.reversal_days &&
    settings.trials_per_day === preset.trials_per_day &&
    settings.max_consecutive_repeats === preset.max_consecutive_repeats &&
    [...settings.balance_by].sort().join(',') === [...preset.balance_by].sort().join(',')
}

const EXAMPLE_DATA = exampleAnimals.trim()
const resolveApiBase = () => {
  if (typeof window === 'undefined') return undefined
  const params = new URLSearchParams(window.location.search)
  const queryBase = params.get('apiBase') ?? undefined
  const injected = (window as Window & { __EASYLAB_API__?: string }).__EASYLAB_API__
  const candidate = injected ?? queryBase ?? import.meta.env.VITE_API_BASE ?? import.meta.env.VITE_API_URL
  if (!candidate) return undefined
  try {
    const parsed = new URL(candidate)
    if (parsed.protocol === 'http:' && ['127.0.0.1', 'localhost', '[::1]'].includes(parsed.hostname) && parsed.port === '18523') {
      return parsed.origin
    }
  } catch {
    return undefined
  }
  return undefined
}

const API_BASE =
  resolveApiBase() ??
  'http://127.0.0.1:18523'

function App() {
  const [restoredRun] = useState(readSavedRun)
  const [customPresets, setCustomPresets] = useState(readCustomPresets)
  const [animalText, setAnimalText] = useState(restoredRun?.input_text ?? '')
  const [learningDays, setLearningDays] = useState(restoredRun?.schedule.settings.learning_days ?? DEFAULT_PRESET.learning_days)
  const [reversalDays, setReversalDays] = useState(restoredRun?.schedule.settings.reversal_days ?? DEFAULT_PRESET.reversal_days)
  const [trialsPerDay, setTrialsPerDay] = useState(restoredRun?.schedule.settings.trials_per_day ?? DEFAULT_PRESET.trials_per_day)
  const [balanceBy, setBalanceBy] = useState<BalanceField[]>(restoredRun?.schedule.settings.balance_by ?? DEFAULT_PRESET.balance_by)
  const [maxConsecutiveRepeats, setMaxConsecutiveRepeats] = useState(restoredRun?.schedule.settings.max_consecutive_repeats ?? DEFAULT_PRESET.max_consecutive_repeats)
  const [presetName, setPresetName] = useState(restoredRun?.schedule.preset_name ?? DEFAULT_PRESET.name)
  const [selectedPresetId, setSelectedPresetId] = useState(() => {
    if (!restoredRun) return DEFAULT_PRESET.id
    if (restoredRun.schedule.preset_name === DEFAULT_PRESET.name) return DEFAULT_PRESET.id
    return customPresets.find((preset) => preset.name === restoredRun.schedule.preset_name)?.id ?? ''
  })
  const [presetToSave, setPresetToSave] = useState('')
  const [lockedExitArms, setLockedExitArms] = useState<Record<string, number>>(restoredRun?.schedule.locked_exit_arms ?? {})
  const [useExampleData, setUseExampleData] = useState(restoredRun?.use_example ?? false)
  const [useSeed, setUseSeed] = useState(restoredRun?.requested_seed !== null && restoredRun?.requested_seed !== undefined)
  const [seed, setSeed] = useState(restoredRun?.requested_seed ?? 42)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [scheduleData, setScheduleData] = useState<ScheduleData | null>(restoredRun?.schedule ?? null)
  const [isReviewed, setIsReviewed] = useState(restoredRun?.reviewed ?? false)
  const [selectedDay, setSelectedDay] = useState(0)

  useEffect(() => {
    if (useExampleData) {
      setAnimalText(EXAMPLE_DATA)
    }
  }, [useExampleData])

  const parseAnimals = (text: string): { animals: AnimalInput[]; errors: string[] } => {
    const lines = text.trim().split('\n').filter(l => l.trim())
    const animals: AnimalInput[] = []
    const errors: string[] = []
    const seenIds = new Set<string>()

    lines.forEach((line, idx) => {
      if (line.toLowerCase().includes('animalid') && line.toLowerCase().includes('sex')) return

      const parts = line.includes('\t')
        ? line.split('\t').map((part) => part.trim())
        : line.includes(',')
          ? splitCsvLine(line)
          : line.trim().split(/\s{2,}/).map((part) => part.trim())

      if (parts.length < 5 || parts.slice(0, 5).some((part) => !part)) {
        errors.push(`Line ${idx + 1}: enter AnimalID, Tag, Sex, Genotype and Cage.`)
        return
      }

      const animal = {
        AnimalID: parts[0].trim(),
        Tag: parts[1],
        Sex: parts[2],
        Genotype: parts[3],
        Cage: parts[parts.length - 1]
      }
      if (seenIds.has(animal.AnimalID)) {
        errors.push(`Line ${idx + 1}: AnimalID ${animal.AnimalID} is duplicated.`)
        return
      }
      seenIds.add(animal.AnimalID)
      animals.push(animal)
    })

    return { animals, errors }
  }

  const sourceText = useExampleData ? EXAMPLE_DATA : animalText
  const parsedInput = parseAnimals(sourceText)
  const customSelectedPreset = customPresets.find((preset) => preset.id === selectedPresetId)
  const currentLockMap = Object.fromEntries(
    Object.entries(lockedExitArms).filter(([animalId]) => parsedInput.animals.some((animal) => animal.AnimalID === animalId)),
  )
  const currentSettings: ScheduleSettings = {
    learning_days: learningDays,
    reversal_days: reversalDays,
    trials_per_day: trialsPerDay,
    balance_by: balanceBy,
    max_consecutive_repeats: maxConsecutiveRepeats,
  }
  const selectedPreset = selectedPresetId === DEFAULT_PRESET.id ? DEFAULT_PRESET : customSelectedPreset
  const settingsMatchSelectedPreset = settingsMatchPreset(currentSettings, selectedPreset)
  const runMatchesCurrentInputs = Boolean(
    scheduleData &&
    parsedInput.errors.length === 0 &&
    JSON.stringify(scheduleData.animals) === JSON.stringify(parsedInput.animals) &&
    JSON.stringify(scheduleData.settings) === JSON.stringify(currentSettings) &&
    JSON.stringify(scheduleData.locked_exit_arms) === JSON.stringify(currentLockMap) &&
    scheduleData.preset_name === presetName &&
    scheduleData.use_example === useExampleData &&
    scheduleData.requested_seed === (useSeed ? seed : null),
  )
  const reviewIsCurrent = isReviewed && runMatchesCurrentInputs
  const allocationGroups = useMemo(() => {
    if (!scheduleData) return []
    const groups = new Map<string, { label: string; count: number; arms: Record<number, number> }>()
    for (const animal of scheduleData.animals) {
      const fields = scheduleData.settings.balance_by
      const label = fields.length ? fields.map((field) => `${field}: ${animal[field]}`).join(' · ') : 'Full cohort'
      const group = groups.get(label) ?? { label, count: 0, arms: { 1: 0, 2: 0, 3: 0 } }
      const arm = scheduleData.exit_arm_map[animal.AnimalID]
      group.count += 1
      if (arm) group.arms[arm] += 1
      groups.set(label, group)
    }
    return Array.from(groups.values())
  }, [scheduleData])
  const totalArmCounts = useMemo(() => {
    const counts: Record<number, number> = { 1: 0, 2: 0, 3: 0 }
    if (scheduleData) {
      Object.values(scheduleData.exit_arm_map).forEach((arm) => { counts[arm] += 1 })
    }
    return counts
  }, [scheduleData])
  const csvHasFormulaLikeText = scheduleData?.animals.some((animal) =>
    Object.values(animal).some((value) => /^[=+\-@]/.test(value)),
  ) ?? false

  const handleGenerate = async () => {
    const { animals, errors } = parsedInput
    if (animals.length === 0) {
      setError(errors[0] || 'Please paste animal data first')
      return
    }
    if (errors.length) {
      setError(errors.join('\n'))
      return
    }

    if (learningDays <= 0 || reversalDays < 0 || trialsPerDay <= 0) {
      setError('Learning days and trials must be > 0; reversal days must be ≥ 0.')
      return
    }

    setLoading(true)
    setError(null)

    try {
      const request = {
        animals,
        learning_days: learningDays,
        reversal_days: reversalDays,
        trials_per_day: trialsPerDay,
        balance_by: balanceBy,
        max_consecutive_repeats: maxConsecutiveRepeats,
        locked_exit_arms: currentLockMap,
        preset_name: presetName,
        seed: useSeed ? seed : null,
        use_example: false,
        source_is_example: useExampleData,
      }

      const response = await fetch(`${API_BASE}/generate-schedule`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request)
      })

      if (!response.ok) {
        const msg = await response.text()
        throw new Error(msg || 'Failed to generate schedule')
      }

      const data = await response.json()
      setScheduleData(data)
      setIsReviewed(false)
      setSelectedDay(0)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred')
    } finally {
      setLoading(false)
    }
  }

  const handleCopyOutput = () => {
    if (!scheduleData) return

    let output = `Y-Maze Schedule\nPreset: ${scheduleData.preset_name}\nSeed: ${scheduleData.seed}\nBalance within: ${scheduleData.settings.balance_by.join(', ') || 'Full cohort'}\nMaximum consecutive repeats: ${scheduleData.settings.max_consecutive_repeats}\nReviewed: ${reviewIsCurrent ? 'Yes' : 'No'}\n\n`

    // Add exit arm map
    output += 'Exit Arm Assignments:\n'
    Object.entries(scheduleData.exit_arm_map).forEach(([id, arm]) => {
      output += `${id}: Arm ${arm}\n`
    })
    output += '\n'

    // Add each day's schedule
    scheduleData.day_tables.forEach(table => {
      output += `Day ${table.day} (${table.type}):\n`
      output += table.header.join('\t') + '\n'
      table.rows.forEach(row => {
        output += row.join('\t') + '\n'
      })
      output += '\n'
    })

    navigator.clipboard.writeText(output)
    alert('Schedule copied to clipboard!')
  }

  const handleExportExcel = async () => {
    if (!scheduleData || !reviewIsCurrent) return
    try {
      const response = await fetch(`${API_BASE}/export-reviewed-excel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(scheduleData)
      })

      if (!response.ok) {
        const msg = await response.text()
        throw new Error(msg || 'Failed to export schedule')
      }

      const blob = await response.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'ymaze_reviewed_schedule.xlsx'
      document.body.appendChild(a)
      a.click()
      window.URL.revokeObjectURL(url)
      document.body.removeChild(a)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Export failed')
    }
  }

  const handleExportCSVs = () => {
    if (!scheduleData || !reviewIsCurrent) return

    scheduleData.day_tables.forEach(table => {
      const blob = new Blob([tableCsv(table)], { type: 'text/csv;charset=utf-8' })
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `Day${table.day}_${table.type}.csv`
      document.body.appendChild(a)
      a.click()
      window.URL.revokeObjectURL(url)
      document.body.removeChild(a)
    })

    alert(`Exported ${scheduleData.day_tables.length} CSV files!`)
  }

  const handleExportCombinedCSV = () => {
    if (!scheduleData || !reviewIsCurrent) return

    const csv: string[] = []

    scheduleData.day_tables.forEach((table, idx) => {
      if (idx > 0) csv.push('') // blank line between days
      csv.push(csvCell(`Day ${table.day} (${table.type})`))
      csv.push(...tableCsv(table).split('\r\n'))
    })

    const blob = new Blob([csv.join('\r\n')], { type: 'text/csv;charset=utf-8' })
    const url = window.URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'ymaze_schedule_combined.csv'
    document.body.appendChild(a)
    a.click()
    window.URL.revokeObjectURL(url)
    document.body.removeChild(a)
  }

  const handleSavePreset = () => {
    const name = presetToSave.trim()
    if (!name) {
      setError('Enter a name for this protocol preset.')
      return
    }
    const preset: ProtocolPreset = {
      id: `custom-${Date.now()}`,
      name,
      ...currentSettings,
    }
    const nextPresets = [...customPresets.filter((item) => item.name.toLowerCase() !== name.toLowerCase()), preset]
    try {
      localStorage.setItem(PRESET_KEY, JSON.stringify(nextPresets))
    } catch {
      setError('This browser could not save local protocol presets.')
      return
    }
    setCustomPresets(nextPresets)
    setPresetName(name)
    setSelectedPresetId(preset.id)
    setPresetToSave('')
  }

  const applyPreset = (preset: ProtocolPreset) => {
    setSelectedPresetId(preset.id)
    setPresetName(preset.name)
    setLearningDays(preset.learning_days)
    setReversalDays(preset.reversal_days)
    setTrialsPerDay(preset.trials_per_day)
    setBalanceBy(preset.balance_by)
    setMaxConsecutiveRepeats(preset.max_consecutive_repeats)
  }

  const createSavedRun = (reviewed: boolean): SavedRun | null => {
    if (!scheduleData) return null
    return {
      format: 'easylab-ymaze-run',
      version: 1,
      saved_at: new Date().toISOString(),
      input_text: useExampleData ? EXAMPLE_DATA : animalText,
      use_example: scheduleData.use_example,
      requested_seed: useSeed ? seed : null,
      schedule: scheduleData,
      reviewed,
    }
  }

  const handleReviewAndLock = () => {
    if (!scheduleData || !runMatchesCurrentInputs) return
    const savedRun = createSavedRun(true)
    if (!savedRun) return
    try {
      localStorage.setItem(REVIEW_KEY, JSON.stringify(savedRun))
      setIsReviewed(true)
      setError(null)
    } catch {
      setIsReviewed(true)
      setError('This browser could not save the reviewed run. Download the run package to keep a copy.')
    }
  }

  const handleDownloadPackage = () => {
    if (!scheduleData || !reviewIsCurrent) return
    const savedRun = createSavedRun(true)
    if (!savedRun) return
    const blob = new Blob([JSON.stringify(savedRun, null, 2)], { type: 'application/json' })
    const url = window.URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `ymaze-${scheduleData.preset_name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-seed-${scheduleData.seed}.easylab-ymaze.json`
    anchor.click()
    window.URL.revokeObjectURL(url)
  }

  const handleOpenPackage = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    try {
      const value: unknown = JSON.parse(await file.text())
      if (!isSavedRun(value)) {
        throw new Error('This file is not a supported Y-maze run package.')
      }
      const savedRun = value
      setScheduleData(savedRun.schedule)
      setIsReviewed(savedRun.reviewed)
      setAnimalText(savedRun.input_text)
      setUseExampleData(savedRun.use_example)
      setLearningDays(savedRun.schedule.settings.learning_days)
      setReversalDays(savedRun.schedule.settings.reversal_days)
      setTrialsPerDay(savedRun.schedule.settings.trials_per_day)
      setBalanceBy(savedRun.schedule.settings.balance_by)
      setMaxConsecutiveRepeats(savedRun.schedule.settings.max_consecutive_repeats)
      setLockedExitArms(savedRun.schedule.locked_exit_arms)
      setPresetName(savedRun.schedule.preset_name)
      setUseSeed(savedRun.requested_seed !== null)
      setSeed(savedRun.requested_seed ?? savedRun.schedule.seed)
      setSelectedDay(0)
      setError(null)
      if (savedRun.reviewed) {
        try {
          localStorage.setItem(REVIEW_KEY, JSON.stringify(savedRun))
        } catch {
          setError('Run opened. The browser could not save a local copy.')
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not open this run package.')
    }
  }

  const currentTable = scheduleData?.day_tables?.[selectedDay]
  const hasSchedule = Boolean(scheduleData)
  const statusLabel = loading ? 'Generating' : !hasSchedule ? 'Ready' : reviewIsCurrent ? 'Reviewed' : 'Needs review'
  const statusClass = loading || (hasSchedule && !reviewIsCurrent) ? 'warning' : 'success'
  const tutorialSteps: TutorialStep[] = [
    {
      selector: '[data-testid="ymaze-use-example-toggle"]',
      title: 'Use example data toggle',
      description: 'Enable this for a quick end-to-end demo dataset.',
    },
    {
      selector: '[data-testid="ymaze-animal-input"]',
      title: 'Load animal data',
      description: 'Paste tabular animal data or load the bundled example first.',
      details: [
        'Expected fields: AnimalID, Tag, Sex, Genotype, Cage.',
      ],
    },
    {
      selector: '[data-testid="ymaze-settings-section"]',
      title: 'Configure schedule settings',
      description: 'Choose a named protocol, set days and trials, balance factors, repeat limits and locked exit arms.',
    },
    {
      selector: '[data-testid="ymaze-learning-days-input"]',
      title: 'Learning days',
      description: 'Number of acquisition-learning days to generate.',
    },
    {
      selector: '[data-testid="ymaze-reversal-days-input"]',
      title: 'Reversal days',
      description: 'Number of reversal-learning days after acquisition.',
    },
    {
      selector: '[data-testid="ymaze-trials-input"]',
      title: 'Trials per day',
      description: 'Controls schedule table width and trial repetition count.',
    },
    {
      selector: '[data-testid="ymaze-seed-toggle"]',
      title: 'Random seed option',
      description: 'Each schedule records a seed. Set one here to reproduce the same assignments and trial order.',
    },
    {
      selector: '[data-testid="generate-btn"]',
      title: 'Generate schedule',
      description: 'Build randomized schedules once the input sheet and settings are ready.',
    },
    {
      selector: '[data-testid="ymaze-export-excel-btn"]',
      title: 'Export outputs',
      description: 'Download the final workbook or CSV variants after generation.',
    },
    {
      selector: '[data-testid="ymaze-results-panel"]',
      title: 'Review day tables',
      description: 'Inspect exit-arm mapping and day-by-day schedules before export.',
    },
  ]

  return (
    <div className="app-bg">
      <header className="panel">
        <div className="lab-head">
          <div>
            <p className="eyebrow">Y-maze scheduler</p>
            <h2>Y‑Maze Randomizer</h2>
            <p className="muted">Generate balanced, randomized Y‑maze schedules from pasted animal data.</p>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <span className={`status-chip ${statusClass}`}>{statusLabel}</span>
            <span className="pill soft">
              <Calendar className="icon" aria-hidden="true" />
              {learningDays + reversalDays} days planned
            </span>
            <span className="pill">
              <FlaskConical className="icon" aria-hidden="true" />
              Lab-ready exports
            </span>
          </div>
        </div>
      </header>

      {error && (
        <div className="panel" role="alert">
          <div className="lab-head">
            <div>
              <p className="eyebrow">Alert</p>
              <h2>Error</h2>
              <p className="muted" style={{ whiteSpace: 'pre-wrap' }}>{error}</p>
            </div>
            <button onClick={() => setError(null)} className="ghost">Dismiss</button>
          </div>
        </div>
      )}

      <div className="app-shell">
        <aside className="panel sidebar">
          <div className="lab-head">
            <div>
              <p className="eyebrow">Inputs</p>
              <h2>Animal Intake</h2>
              <p className="muted">Paste tab- or space-separated: AnimalID Tag Sex Genotype … Cage (last).</p>
            </div>
            <button
              onClick={() => {
                setUseExampleData(true)
                setAnimalText(EXAMPLE_DATA)
              }}
              className="pill soft"
              type="button"
            >
              <RefreshCw className="icon" aria-hidden="true" />
              Sample
            </button>
          </div>

          <div className="sidebar-section">
            <div className="section-title">Animal Data</div>
            <div className="chip-row">
              <label className="pill soft">
                <input
                  type="checkbox"
                  checked={useExampleData}
                  onChange={(e) => setUseExampleData(e.target.checked)}
                  data-testid="ymaze-use-example-toggle"
                />
                <span>Use Example Data</span>
              </label>
              <button
                onClick={() => {
                  setUseExampleData(true)
                  setAnimalText(EXAMPLE_DATA)
                }}
                className="pill"
                type="button"
              >
                Reload Sample
              </button>
            </div>

            <textarea
              className="data-textarea"
              placeholder="Paste animal data here..."
              aria-label="Animal data input"
              data-testid="ymaze-animal-input"
              value={useExampleData ? EXAMPLE_DATA : animalText}
              onChange={(e) => {
                setUseExampleData(false)
                setAnimalText(e.target.value)
              }}
            />
          </div>

          <div className="sidebar-section" data-testid="ymaze-settings-section">
            <div className="section-title">Schedule Settings</div>
            <label className="field">
              <span className="eyebrow">Protocol preset</span>
              <select
                value={selectedPresetId || 'custom'}
                onChange={(event) => {
                  const nextId = event.target.value
                  if (nextId === DEFAULT_PRESET.id) applyPreset(DEFAULT_PRESET)
                  else if (nextId === 'custom') {
                    setSelectedPresetId('')
                    setPresetName('Custom protocol')
                  } else {
                    const preset = customPresets.find((item) => item.id === nextId)
                    if (preset) applyPreset(preset)
                  }
                }}
                data-testid="ymaze-preset-select"
              >
                <option value={DEFAULT_PRESET.id}>{DEFAULT_PRESET.name}</option>
                {customPresets.map((preset) => <option key={preset.id} value={preset.id}>{preset.name}</option>)}
                <option value="custom">Custom settings</option>
              </select>
            </label>
            <p className="muted tiny">
              {!selectedPresetId
                ? 'Custom protocol settings.'
                : settingsMatchSelectedPreset
                  ? `Using ${selectedPreset?.name}.`
                  : `Settings differ from ${selectedPreset?.name ?? 'the selected preset'}.`}
            </p>
            <button
              onClick={() => {
                applyPreset(DEFAULT_PRESET)
                setLockedExitArms({})
                setUseSeed(false)
                setSeed(42)
              }}
              className="ghost"
              type="button"
              data-testid="ymaze-reset-settings-btn"
            >
              Reset settings and locks
            </button>
            <div className="template-row">
              <label className="field">
                <span className="eyebrow">Learning Days</span>
                <input
                  type="number"
                  min="0"
                  value={learningDays}
                  onChange={(e) => setLearningDays(parseInt(e.target.value) || 0)}
                  data-testid="ymaze-learning-days-input"
                />
              </label>

              <label className="field">
                <span className="eyebrow">Reversal Days</span>
                <input
                  type="number"
                  min="0"
                  value={reversalDays}
                  onChange={(e) => setReversalDays(parseInt(e.target.value) || 0)}
                  data-testid="ymaze-reversal-days-input"
                />
              </label>

              <label className="field">
                <span className="eyebrow">Trials/Day</span>
                <input
                  type="number"
                  min="1"
                  value={trialsPerDay}
                  onChange={(e) => setTrialsPerDay(parseInt(e.target.value) || 1)}
                  data-testid="ymaze-trials-input"
                />
              </label>
              <label className="field">
                <span className="eyebrow">Maximum repeats</span>
                <input
                  type="number"
                  min="1"
                  max="8"
                  value={maxConsecutiveRepeats}
                  onChange={(e) => setMaxConsecutiveRepeats(parseInt(e.target.value) || 1)}
                  data-testid="ymaze-max-repeats-input"
                />
              </label>
            </div>

            <fieldset className="sidebar-section" style={{ border: 0, padding: 0, margin: 0 }}>
              <legend className="section-title">Balance arms within</legend>
              <div className="chip-row">
                {(['Genotype', 'Sex', 'Cage'] as BalanceField[]).map((field) => (
                  <label className="pill soft" key={field}>
                    <input
                      type="checkbox"
                      checked={balanceBy.includes(field)}
                      onChange={(event) => setBalanceBy((current) => event.target.checked
                        ? [...current, field]
                        : current.filter((item) => item !== field))}
                      data-testid={`ymaze-balance-${field.toLowerCase()}`}
                    />
                    <span>{field}</span>
                  </label>
                ))}
              </div>
              <p className="muted tiny">Arm totals stay as even as locks allow. These fields define subgroups within which assignments are spread.</p>
            </fieldset>

            <div className="field-row">
              <label className="pill soft">
                <input
                  type="checkbox"
                  checked={useSeed}
                  onChange={(e) => setUseSeed(e.target.checked)}
                  data-testid="ymaze-seed-toggle"
                />
                <span>Set a fixed seed</span>
              </label>
              {useSeed && (
                <label className="field">
                  <span className="eyebrow">Seed</span>
                  <input
                    type="number"
                    value={seed}
                    onChange={(e) => setSeed(parseInt(e.target.value) || 0)}
                    data-testid="ymaze-seed-input"
                  />
                </label>
              )}
            </div>
            <p className="muted tiny">Every generated schedule records its seed. Leave this off to generate one automatically.</p>

            {parsedInput.animals.length > 0 && (
              <div className="sidebar-section">
                <div className="section-title">Lock learning exit arms</div>
                <p className="muted tiny">Choose an arm for animals that must keep that assignment. Others are balanced automatically.</p>
                <div className="lock-list">
                  {parsedInput.animals.map((animal) => (
                    <label className="field-row" key={animal.AnimalID}>
                      <span className="mono">{animal.AnimalID}</span>
                      <select
                        aria-label={`Lock exit arm for ${animal.AnimalID}`}
                        value={lockedExitArms[animal.AnimalID] ?? ''}
                        onChange={(event) => setLockedExitArms((current) => {
                          const next = { ...current }
                          if (event.target.value) next[animal.AnimalID] = Number(event.target.value)
                          else delete next[animal.AnimalID]
                          return next
                        })}
                      >
                        <option value="">Automatic</option>
                        <option value="1">Arm 1</option>
                        <option value="2">Arm 2</option>
                        <option value="3">Arm 3</option>
                      </select>
                    </label>
                  ))}
                </div>
              </div>
            )}

            <div className="field-row preset-save-row">
              <label className="field">
                <span className="eyebrow">Preset name</span>
                <input
                  value={presetToSave}
                  onChange={(event) => setPresetToSave(event.target.value)}
                  placeholder="e.g. 8-trial pilot"
                  data-testid="ymaze-preset-name-input"
                />
              </label>
              <button onClick={handleSavePreset} className="ghost" type="button" data-testid="ymaze-save-preset-btn">Save preset</button>
            </div>
          </div>

          <div className="sidebar-section">
            <div className="section-title">Actions</div>
            <div className="edit-actions">
              <GuidedTutorial
                steps={tutorialSteps}
                startLabel="Tutorial"
              />
              <button
                onClick={handleGenerate}
                disabled={loading}
                data-testid="generate-btn"
                className="accent"
                type="button"
              >
                {loading ? 'Generating…' : 'Generate Schedule'}
              </button>
              {hasSchedule && (
                <button onClick={handleCopyOutput} className="ghost" type="button">
                  <Clipboard className="icon" aria-hidden="true" />
                  Copy Output
                </button>
              )}
              {hasSchedule && (
                <>
                  <button
                    onClick={handleReviewAndLock}
                    disabled={!runMatchesCurrentInputs || reviewIsCurrent}
                    className="accent"
                    type="button"
                    data-testid="ymaze-review-lock-btn"
                  >
                    {reviewIsCurrent ? 'Reviewed and locked' : 'Review and lock schedule'}
                  </button>
                  {!runMatchesCurrentInputs && (
                    <p className="muted tiny" role="status">Inputs changed. Generate again to review these settings.</p>
                  )}
                  <button onClick={handleDownloadPackage} disabled={!reviewIsCurrent} className="ghost" type="button" data-testid="ymaze-download-package-btn">
                    <Download className="icon" aria-hidden="true" />
                    Save run package
                  </button>
                </>
              )}
              <label className="ghost package-open">
                Open saved run
                <input type="file" accept=".json,.easylab-ymaze.json,application/json" onChange={handleOpenPackage} aria-label="Open saved Y-maze run package" />
              </label>
            </div>

            {hasSchedule && (
              <div className="template-row">
                <button onClick={handleExportCSVs} disabled={!reviewIsCurrent} className="ghost" type="button">
                  <Shuffle className="icon" aria-hidden="true" />
                  CSV/Day
                </button>
                <button onClick={handleExportCombinedCSV} disabled={!reviewIsCurrent} className="ghost" type="button">
                  <Shuffle className="icon" aria-hidden="true" />
                  CSV Combined
                </button>
                <button onClick={handleExportExcel} disabled={!reviewIsCurrent} className="ghost" type="button" data-testid="ymaze-export-excel-btn">
                  <Download className="icon" aria-hidden="true" />
                  Excel
                </button>
              </div>
            )}
            {reviewIsCurrent && csvHasFormulaLikeText && (
              <p className="muted tiny" role="note">
                CSV keeps the exact values. In Excel or another spreadsheet, import columns as text if a value starts with =, +, - or @.
              </p>
            )}
          </div>

          <div className="sidebar-section">
            <div className="section-title">Sheet Helper</div>
            <div className="link-panel">
              <div className="field">
                <span className="muted tiny">Send this prompt to ChatGPT, Gemini, or Grok; paste the returned CSV/TSV above.</span>
              </div>
              <div className="edit-actions">
                <a href="https://chat.openai.com/" target="_blank" rel="noreferrer" className="pill soft">ChatGPT</a>
                <a href="https://gemini.google.com/app" target="_blank" rel="noreferrer" className="pill soft">Gemini</a>
                <a href="https://grok.com/" target="_blank" rel="noreferrer" className="pill soft">Grok</a>
              </div>
              <pre className="data-textarea" aria-label="Formatting prompt">
                Convert to CSV with headers: AnimalID, Tag, Sex, Genotype, Cage. Normalize Sex to M/F, trim whitespace, keep cage text. Keep all rows, no invented data. Output CSV only.
              </pre>
            </div>
          </div>
        </aside>

        <section className="panel editor" data-testid="ymaze-results-panel">
          <div className="editor-header">
            <div className="title-row">
              <h1>Generated Schedule</h1>
              <span className={`status-chip ${hasSchedule ? 'success' : 'warning'}`}>
                {hasSchedule ? 'Ready' : 'Waiting'}
              </span>
            </div>
            {hasSchedule && scheduleData && (
              <div className="chip-row">
                <span className="pill soft">{scheduleData.day_tables.length} days</span>
                <span className="pill">{Object.keys(scheduleData.exit_arm_map).length} animals</span>
                <span className="pill soft" data-testid="ymaze-schedule-seed">Seed {scheduleData.seed}</span>
                <span className={`status-chip ${reviewIsCurrent ? 'success' : 'warning'}`}>
                  {reviewIsCurrent ? 'Reviewed and locked' : 'Review required'}
                </span>
              </div>
            )}
          </div>

          <div className="editor-body">
            {!hasSchedule && (
              <div className="empty">
                <p className="muted">Generate a schedule to see results.</p>
              </div>
            )}

            {hasSchedule && scheduleData && (
              <>
                {!runMatchesCurrentInputs && (
                  <div className="review-notice" role="status">
                    <strong>This schedule uses earlier inputs.</strong> Generate again to apply current changes. Exports are disabled until you review the current schedule.
                  </div>
                )}
                <div className="today-card">
                  <div className="today-head">
                    <div>
                      <h2>Exit Arm Assignments</h2>
                      <p className="muted tiny">The learning exit arm stays fixed for each animal. Locked assignments are shown in the table.</p>
                    </div>
                    <span className="pill soft">{Object.keys(scheduleData.exit_arm_map).length} animals</span>
                  </div>
                  <div className="table-wrap">
                    <table data-testid="ymaze-assignment-table">
                      <thead>
                        <tr>
                          <th>Animal ID</th>
                          <th>Exit Arm</th>
                          <th>Assignment</th>
                        </tr>
                      </thead>
                      <tbody>
                        {Object.entries(scheduleData.exit_arm_map).map(([id, arm]) => (
                          <tr key={id}>
                            <td><code>{id}</code></td>
                            <td>Arm {arm}</td>
                            <td>{scheduleData.locked_exit_arms[id] === arm ? 'Locked' : 'Automatic'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="arm-counts" aria-label="Learning exit arm counts">
                    {[1, 2, 3].map((arm) => (
                      <div className="template-card active" key={arm}>
                        <p className="eyebrow">Arm {arm}</p>
                        <p className="muted">{totalArmCounts[arm]} animals</p>
                      </div>
                    ))}
                  </div>
                  <p className="muted tiny">
                    Assignments are spread across {scheduleData.settings.balance_by.length
                      ? scheduleData.settings.balance_by.join(', ').toLowerCase()
                      : 'the full cohort'} subgroups. Locks can prevent equal totals.
                  </p>
                  {allocationGroups.length > 1 && (
                    <details className="balance-detail">
                      <summary>Arm counts by subgroup</summary>
                      <div className="table-wrap">
                        <table>
                          <thead><tr><th>Subgroup</th><th>Animals</th><th>Arm 1</th><th>Arm 2</th><th>Arm 3</th></tr></thead>
                          <tbody>
                            {allocationGroups.map((group) => (
                              <tr key={group.label}>
                                <td>{group.label}</td><td>{group.count}</td>
                                <td>{group.arms[1]}</td><td>{group.arms[2]}</td><td>{group.arms[3]}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </details>
                  )}
                </div>

                <div className="today-card protocol-note">
                  <h2>Protocol used</h2>
                  <p className="muted">{scheduleData.preset_name} · seed {scheduleData.seed} · maximum {scheduleData.settings.max_consecutive_repeats} consecutive starts on the same arm.</p>
                  <p className="muted">During learning, each animal’s first trial avoids its assigned exit arm. During reversal, each animal’s daily exit arm is one of the other two arms, and its first trial avoids the original learning exit arm.</p>
                  {Object.keys(scheduleData.locked_exit_arms).length > 0 && (
                    <p className="muted">{Object.keys(scheduleData.locked_exit_arms).length} learning exit assignment(s) were locked before generation.</p>
                  )}
                </div>

                <div className="today-card">
                  <div className="today-head">
                    <div>
                      <h2>Days</h2>
                      <p className="muted tiny">Select a day to view the schedule table.</p>
                    </div>
                    <span className="pill soft">Trials/day: {scheduleData.settings.trials_per_day}</span>
                  </div>
                  <div className="editor-tabs">
                    {scheduleData.day_tables.map((table, idx) => (
                      <button
                        key={idx}
                        onClick={() => setSelectedDay(idx)}
                        className={`tab-button ${selectedDay === idx ? 'active' : ''}`}
                        type="button"
                      >
                        Day {table.day} ({table.type})
                      </button>
                    ))}
                  </div>
                </div>

                {currentTable && (
                  <div className="today-card">
                    <div className="today-head">
                      <div>
                        <h2>Day {currentTable.day} ({currentTable.type})</h2>
                        <p className="muted tiny">{currentTable.rows.length} rows</p>
                      </div>
                      <span className="pill soft">Trials: {currentTable.header.length - 6}</span>
                    </div>
                    <div className="table-wrap">
                      <table data-testid="ymaze-day-table">
                        <thead>
                          <tr>
                            {currentTable.header.map((col, idx) => (
                              <th key={idx}>{col}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {currentTable.rows.map((row, rowIdx) => (
                            <tr key={rowIdx}>
                              {row.map((cell, cellIdx) => (
                                <td key={cellIdx}><code>{cell}</code></td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {currentTable && (
                  <div className="today-card">
                    <div className="today-head">
                      <div>
                        <h2>Statistics</h2>
                        <p className="muted tiny">Quick summary for the selected day.</p>
                      </div>
                    </div>
                    <div className="template-row">
                      <div className="template-card active">
                        <p className="eyebrow">Total Animals</p>
                        <p className="muted">{currentTable.rows.length}</p>
                      </div>
                      <div className="template-card active">
                        <p className="eyebrow">Trials/Animal</p>
                        <p className="muted">{currentTable.header.length - 6}</p>
                      </div>
                      <div className="template-card active">
                        <p className="eyebrow">Total Days</p>
                        <p className="muted">{scheduleData.day_tables.length}</p>
                      </div>
                      <div className="template-card active">
                        <p className="eyebrow">Current Day</p>
                        <p className="muted">Day {currentTable.day}</p>
                      </div>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </section>
      </div>

      <footer className="signature" data-testid="signature">
        <span className="sig-primary">Made by Meghamsh Teja Konda</span>
        <span className="sig-dot" aria-hidden="true" />
        <a className="sig-link" href="mailto:meghamshteja555@gmail.com">
          meghamshteja555@gmail.com
        </a>
      </footer>
    </div>
  )
}

export default App
