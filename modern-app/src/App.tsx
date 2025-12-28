import { useEffect, useState } from 'react'
import {
  Calendar,
  Clipboard,
  Download,
  FlaskConical,
  RefreshCw,
  Shuffle
} from 'lucide-react'
import exampleAnimals from '../example_data/animals.csv?raw'
import './App.css'

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
  const statusLabel = loading ? 'Generating' : 'Ready'
  const statusClass = loading ? 'warning' : 'success'

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
              value={useExampleData ? EXAMPLE_DATA : animalText}
              onChange={(e) => {
                setUseExampleData(false)
                setAnimalText(e.target.value)
              }}
            />
          </div>

          <div className="sidebar-section">
            <div className="section-title">Schedule Settings</div>
            <div className="template-row">
              <label className="field">
                <span className="eyebrow">Learning Days</span>
                <input
                  type="number"
                  min="0"
                  value={learningDays}
                  onChange={(e) => setLearningDays(parseInt(e.target.value) || 0)}
                />
              </label>

              <label className="field">
                <span className="eyebrow">Reversal Days</span>
                <input
                  type="number"
                  min="0"
                  value={reversalDays}
                  onChange={(e) => setReversalDays(parseInt(e.target.value) || 0)}
                />
              </label>

              <label className="field">
                <span className="eyebrow">Trials/Day</span>
                <input
                  type="number"
                  min="1"
                  value={trialsPerDay}
                  onChange={(e) => setTrialsPerDay(parseInt(e.target.value) || 1)}
                />
              </label>
            </div>

            <div className="field-row">
              <label className="pill soft">
                <input
                  type="checkbox"
                  checked={useSeed}
                  onChange={(e) => setUseSeed(e.target.checked)}
                />
                <span>Use Random Seed</span>
              </label>
              {useSeed && (
                <label className="field">
                  <span className="eyebrow">Seed</span>
                  <input
                    type="number"
                    value={seed}
                    onChange={(e) => setSeed(parseInt(e.target.value) || 0)}
                  />
                </label>
              )}
            </div>
          </div>

          <div className="sidebar-section">
            <div className="section-title">Actions</div>
            <div className="edit-actions">
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
            </div>

            {hasSchedule && (
              <div className="template-row">
                <button onClick={handleExportCSVs} className="ghost" type="button">
                  <Shuffle className="icon" aria-hidden="true" />
                  CSV/Day
                </button>
                <button onClick={handleExportCombinedCSV} className="ghost" type="button">
                  <Shuffle className="icon" aria-hidden="true" />
                  CSV Combined
                </button>
                <button onClick={handleExportExcel} className="ghost" type="button">
                  <Download className="icon" aria-hidden="true" />
                  Excel
                </button>
              </div>
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

        <section className="panel editor">
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
                <div className="today-card">
                  <div className="today-head">
                    <div>
                      <h2>Exit Arm Assignments</h2>
                      <p className="muted tiny">Stable arm mapping for the entire experiment.</p>
                    </div>
                    <span className="pill soft">{Object.keys(scheduleData.exit_arm_map).length} animals</span>
                  </div>
                  <div className="table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>Animal ID</th>
                          <th>Exit Arm</th>
                        </tr>
                      </thead>
                      <tbody>
                        {Object.entries(scheduleData.exit_arm_map).map(([id, arm]) => (
                          <tr key={id}>
                            <td><code>{id}</code></td>
                            <td>Arm {arm}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="today-card">
                  <div className="today-head">
                    <div>
                      <h2>Days</h2>
                      <p className="muted tiny">Select a day to view the schedule table.</p>
                    </div>
                    <span className="pill soft">Trials/day: {trialsPerDay}</span>
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
                      <table>
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
    </div>
  )
}

export default App
