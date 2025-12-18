import { useEffect, useState } from 'react'
import exampleAnimals from '../example_data/animals.csv?raw'

interface AnimalInput {
  AnimalID: string
  Tag: string
  Sex: string
  Genotype: string
  Cage: string
}

interface DayTable {
  day: number
  type: 'Learning' | 'Reversal'
  header: string[]
  rows: (string | number)[][]
}

interface ScheduleData {
  success: boolean
  exit_arm_map: Record<string, number>
  day_tables: DayTable[]
}

const EXAMPLE_DATA = exampleAnimals.trim()
// Default to local FastAPI dev server when env var is missing (common in Playwright runs)
const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000'

function App() {
  const [animalText, setAnimalText] = useState('')
  const [learningDays, setLearningDays] = useState(3)
  const [reversalDays, setReversalDays] = useState(2)
  const [trialsPerDay, setTrialsPerDay] = useState(10)
  const [useExampleData, setUseExampleData] = useState(false)
  const [useSeed, setUseSeed] = useState(false)
  const [seed, setSeed] = useState(42)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [scheduleData, setScheduleData] = useState<ScheduleData | null>(null)
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

    lines.forEach((line, idx) => {
      if (line.toLowerCase().includes('animalid') && line.toLowerCase().includes('sex')) return

      const parts = line
        .split(/[\s,\t]+/)
        .map(p => p.trim())
        .filter(p => p)

      if (parts.length < 5) {
        errors.push(`Line ${idx + 1}: expected 5 fields (AnimalID Tag Sex Genotype Cage)`) 
        return
      }

      animals.push({
        AnimalID: parts[0],
        Tag: parts[1],
        Sex: parts[2],
        Genotype: parts[3],
        Cage: parts[parts.length - 1]
      })
    })

    return { animals, errors }
  }

  const handleGenerate = async () => {
    const sourceText = useExampleData ? EXAMPLE_DATA : animalText
    const { animals, errors } = parseAnimals(sourceText)
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
        seed: useSeed ? seed : null,
        use_example: useExampleData
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
      setSelectedDay(0)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred')
    } finally {
      setLoading(false)
    }
  }

  const handleCopyOutput = () => {
    if (!scheduleData) return

    let output = 'Y-Maze Schedule\n\n'

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
    const sourceText = useExampleData ? EXAMPLE_DATA : animalText
    const { animals, errors } = parseAnimals(sourceText)
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

    try {
      const request = {
        animals,
        learning_days: learningDays,
        reversal_days: reversalDays,
        trials_per_day: trialsPerDay,
        seed: useSeed ? seed : null,
        use_example: useExampleData
      }

      const response = await fetch(`${API_BASE}/export-excel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request)
      })

      if (!response.ok) {
        const msg = await response.text()
        throw new Error(msg || 'Failed to export schedule')
      }

      const blob = await response.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'ymaze_schedule.xlsx'
      document.body.appendChild(a)
      a.click()
      window.URL.revokeObjectURL(url)
      document.body.removeChild(a)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Export failed')
    }
  }

  const handleExportCSVs = () => {
    if (!scheduleData) return

    scheduleData.day_tables.forEach(table => {
      const csv = [table.header.join(',')]
      table.rows.forEach(row => {
        csv.push(row.join(','))
      })

      const blob = new Blob([csv.join('\n')], { type: 'text/csv' })
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
    if (!scheduleData) return

    const csv: string[] = []

    scheduleData.day_tables.forEach((table, idx) => {
      if (idx > 0) csv.push('') // blank line between days
      csv.push(`Day ${table.day} (${table.type})`)
      csv.push(table.header.join(','))
      table.rows.forEach(row => {
        csv.push(row.join(','))
      })
    })

    const blob = new Blob([csv.join('\n')], { type: 'text/csv' })
    const url = window.URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'ymaze_schedule_combined.csv'
    document.body.appendChild(a)
    a.click()
    window.URL.revokeObjectURL(url)
    document.body.removeChild(a)
  }

  const currentTable = scheduleData?.day_tables?.[selectedDay]
  const hasSchedule = Boolean(scheduleData)

  return (
    <div className="ui-container">
      <div className="ui-stack">
        <header className="ui-header">
          <h1 className="ui-title">Y‑Maze Scheduler</h1>
          <p className="ui-subtitle">Generate balanced, randomized Y‑maze schedules from pasted animal data.</p>
        </header>

        {error && (
          <div className="ui-alert error">
            <div style={{ whiteSpace: 'pre-wrap' }}>
              <strong>Error:</strong> {error}
            </div>
            <button onClick={() => setError(null)} className="ui-btn ghost compact">Dismiss</button>
          </div>
        )}

        <section className="ui-panel">
          <div className="ui-stack sm">
            <div className="ui-field">
              <div className="ui-row">
                <div>
                  <div className="ui-label">Animal Data</div>
                  <div className="ui-hint">Paste tab- or space-separated: AnimalID Tag Sex Genotype … Cage (last).</div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={useExampleData}
                      onChange={(e) => setUseExampleData(e.target.checked)}
                    />
                    <span>Use Example Data</span>
                  </label>
                  <button
                    onClick={() => {
                      setUseExampleData(true)
                      setAnimalText(EXAMPLE_DATA)
                    }}
                    className="ui-btn ghost compact"
                  >
                    Reload Sample
                  </button>
                </div>
              </div>

              <textarea
                className="ui-textarea mono"
                placeholder="Paste animal data here..."
                value={useExampleData ? EXAMPLE_DATA : animalText}
                onChange={(e) => {
                  setUseExampleData(false)
                  setAnimalText(e.target.value)
                }}
              />
            </div>

            <div className="ui-panel compact">
              <div className="ui-row">
                <div>
                  <div className="ui-label">Need to reformat your sheet?</div>
                  <div className="ui-hint">Send this prompt to ChatGPT, Gemini, or Grok; paste the returned CSV/TSV above.</div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <a href="https://chat.openai.com/" target="_blank" rel="noreferrer" className="ui-btn ghost compact">ChatGPT</a>
                  <a href="https://gemini.google.com/app" target="_blank" rel="noreferrer" className="ui-btn ghost compact">Gemini</a>
                  <a href="https://grok.com/" target="_blank" rel="noreferrer" className="ui-btn ghost compact">Grok</a>
                </div>
              </div>
              <pre className="ui-codeblock">Convert to CSV with headers: AnimalID, Tag, Sex, Genotype, Cage. Normalize Sex to M/F, trim whitespace, keep cage text. Keep all rows, no invented data. Output CSV only.</pre>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <div className="ui-field">
                <div className="ui-label">Learning Days</div>
                <input
                  type="number"
                  min="0"
                  className="ui-input"
                  value={learningDays}
                  onChange={(e) => setLearningDays(parseInt(e.target.value) || 0)}
                />
              </div>

              <div className="ui-field">
                <div className="ui-label">Reversal Days</div>
                <input
                  type="number"
                  min="0"
                  className="ui-input"
                  value={reversalDays}
                  onChange={(e) => setReversalDays(parseInt(e.target.value) || 0)}
                />
              </div>

              <div className="ui-field">
                <div className="ui-label">Trials/Day</div>
                <input
                  type="number"
                  min="1"
                  className="ui-input"
                  value={trialsPerDay}
                  onChange={(e) => setTrialsPerDay(parseInt(e.target.value) || 1)}
                />
              </div>
            </div>

            <div className="ui-field">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={useSeed}
                  onChange={(e) => setUseSeed(e.target.checked)}
                />
                <span>Use Random Seed</span>
              </label>
              {useSeed && (
                <input
                  type="number"
                  className="ui-input"
                  value={seed}
                  onChange={(e) => setSeed(parseInt(e.target.value) || 0)}
                />
              )}
            </div>

            <div className="grid gap-2">
              <button
                onClick={handleGenerate}
                disabled={loading}
                data-testid="generate-btn"
                className="ui-btn primary w-full"
              >
                {loading ? 'Generating…' : 'Generate Schedule'}
              </button>

              {hasSchedule && (
                <>
                  <button onClick={handleCopyOutput} className="ui-btn secondary w-full">
                    Copy Output
                  </button>

                  <div className="grid gap-2 sm:grid-cols-3">
                    <button onClick={handleExportCSVs} className="ui-btn secondary compact">
                      CSV/Day
                    </button>
                    <button onClick={handleExportCombinedCSV} className="ui-btn secondary compact">
                      CSV Combined
                    </button>
                    <button onClick={handleExportExcel} className="ui-btn secondary compact">
                      Excel
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </section>

        <section className="ui-panel">
          <div className="ui-row">
            <h2 className="ui-h2">Generated Schedule</h2>
            {hasSchedule && scheduleData && (
              <span className="ui-hint">
                {scheduleData.day_tables.length} days · {Object.keys(scheduleData.exit_arm_map).length} animals
              </span>
            )}
          </div>

          {!hasSchedule && (
            <div className="ui-panel compact text-center">
              <p className="ui-hint">Generate a schedule to see results.</p>
            </div>
          )}

          {hasSchedule && scheduleData && (
            <div className="ui-stack sm">
              <div className="ui-panel compact">
                <h3 className="ui-h2">Exit Arm Assignments</h3>
                <div className="grid gap-2 sm:grid-cols-2 max-h-56 overflow-y-auto text-sm">
                  {Object.entries(scheduleData.exit_arm_map).map(([id, arm]) => (
                    <div key={id} className="ui-hint">
                      <code>{id}</code>: Arm {arm}
                    </div>
                  ))}
                </div>
              </div>

              <div className="ui-panel compact">
                <div className="ui-label">Days</div>
                <div className="flex flex-wrap gap-2">
                  {scheduleData.day_tables.map((table, idx) => (
                    <button
                      key={idx}
                      onClick={() => setSelectedDay(idx)}
                      className={`ui-btn compact ${selectedDay === idx ? 'primary' : 'secondary'}`}
                    >
                      Day {table.day} ({table.type})
                    </button>
                  ))}
                </div>
              </div>

              {currentTable && (
                <div className="ui-panel compact">
                  <div className="ui-row">
                    <div className="ui-label">Day {currentTable.day} ({currentTable.type})</div>
                    <span className="ui-hint">{currentTable.rows.length} rows</span>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="ui-table">
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
                <div className="ui-panel compact">
                  <h3 className="ui-h2">Statistics</h3>
                  <div className="grid gap-2 sm:grid-cols-2 text-sm">
                    <div className="ui-hint"><strong>Total Animals:</strong> {currentTable.rows.length}</div>
                    <div className="ui-hint"><strong>Trials per Animal:</strong> {currentTable.header.length - 6}</div>
                    <div className="ui-hint"><strong>Total Days:</strong> {scheduleData.day_tables.length}</div>
                    <div className="ui-hint"><strong>Current Day:</strong> Day {currentTable.day} ({currentTable.type})</div>
                  </div>
                </div>
              )}
            </div>
          )}
        </section>
      </div>
    </div>
  )
}

export default App
