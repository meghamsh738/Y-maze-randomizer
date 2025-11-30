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

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-purple-50">
      <div className="container mx-auto px-4 py-8 max-w-7xl">
        <header className="text-center mb-12">
          <h1 className="text-5xl font-bold bg-gradient-to-r from-indigo-600 to-purple-600 bg-clip-text text-transparent mb-4">
            Y-Maze Scheduler
          </h1>
          <p className="text-gray-600 text-lg">
            Generate balanced, randomized Y-maze schedules with ease
          </p>
        </header>

        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">
            <strong>Error:</strong> {error}
            <button onClick={() => setError(null)} className="ml-4 text-red-900 underline">Dismiss</button>
          </div>
        )}

        <div className="grid lg:grid-cols-2 gap-8">
          {/* Input Form */}
          <div className="bg-white rounded-2xl shadow-xl p-8">
            <h2 className="text-2xl font-bold text-gray-800 mb-6">Input Parameters</h2>

            <div className="mb-6">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-2">
                <div>
                  <label className="block text-sm font-semibold text-gray-700">
                    Animal Data
                  </label>
                  <p className="text-xs text-gray-500">
                    Paste tab- or space-separated data: AnimalID | Tag | Sex | Genotype | ... | Cage (last)
                  </p>
                </div>
                <div className="flex flex-wrap gap-3 items-center">
                  <label className="inline-flex items-center gap-2 text-sm font-semibold text-gray-700">
                    <input
                      type="checkbox"
                      className="w-5 h-5 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500"
                      checked={useExampleData}
                      onChange={(e) => setUseExampleData(e.target.checked)}
                    />
                    Use Example Data
                  </label>
                  <button
                    onClick={() => {
                      setUseExampleData(true)
                      setAnimalText(EXAMPLE_DATA)
                    }}
                    className="text-xs bg-gray-100 hover:bg-gray-200 text-gray-600 px-3 py-1 rounded transition-colors"
                  >
                    Reload Sample
                  </button>
                </div>
              </div>
              <textarea
                className="w-full h-48 px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent font-mono text-sm resize-none"
                placeholder="Paste animal data here..."
                value={useExampleData ? EXAMPLE_DATA : animalText}
                onChange={(e) => {
                  setUseExampleData(false)
                  setAnimalText(e.target.value)
                }}
              />
              <div className="mt-3 p-4 rounded-xl bg-indigo-50 border border-indigo-100 text-indigo-900 space-y-2">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div>
                    <p className="text-xs font-semibold">Need to reformat your sheet?</p>
                    <p className="text-xs">Send this prompt to ChatGPT, Gemini, or Grok; paste the returned CSV/TSV here.</p>
                  </div>
                  <div className="flex gap-2 text-xs font-semibold underline">
                    <a href="https://chat.openai.com/" target="_blank" rel="noreferrer" className="text-indigo-800">ChatGPT</a>
                    <a href="https://gemini.google.com/app" target="_blank" rel="noreferrer" className="text-indigo-800">Gemini</a>
                    <a href="https://grok.com/" target="_blank" rel="noreferrer" className="text-indigo-800">Grok</a>
                  </div>
                </div>
                <pre className="text-[11px] leading-5 bg-white border border-indigo-100 rounded-lg p-3 whitespace-pre-wrap">Convert to CSV with headers: AnimalID, Tag, Sex, Genotype, Cage. Normalize Sex to M/F, trim whitespace, keep cage text. Keep all rows, no invented data. Output CSV only.</pre>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4 mb-6">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Learning Days
                </label>
                <input
                  type="number"
                  min="0"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                  value={learningDays}
                  onChange={(e) => setLearningDays(parseInt(e.target.value) || 0)}
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Reversal Days
                </label>
                <input
                  type="number"
                  min="0"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                  value={reversalDays}
                  onChange={(e) => setReversalDays(parseInt(e.target.value) || 0)}
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Trials/Day
                </label>
                <input
                  type="number"
                  min="1"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                  value={trialsPerDay}
                  onChange={(e) => setTrialsPerDay(parseInt(e.target.value) || 1)}
                />
              </div>
            </div>

            <div className="mb-8">
              <label className="flex items-center space-x-2 cursor-pointer">
                <input
                  type="checkbox"
                  className="w-5 h-5 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500"
                  checked={useSeed}
                  onChange={(e) => setUseSeed(e.target.checked)}
                />
                <span className="text-sm font-semibold text-gray-700">Use Random Seed</span>
              </label>
              {useSeed && (
                <input
                  type="number"
                  className="mt-2 w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                  value={seed}
                  onChange={(e) => setSeed(parseInt(e.target.value) || 0)}
                />
              )}
            </div>

            <div className="space-y-3">
              <button
                onClick={handleGenerate}
                disabled={loading}
                data-testid="generate-btn"
                className="w-full bg-gradient-to-r from-indigo-600 to-purple-600 text-white font-semibold py-3 px-6 rounded-lg hover:from-indigo-700 hover:to-purple-700 transition-all duration-200 shadow-lg hover:shadow-xl disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? 'Generating...' : 'Generate Schedule'}
              </button>

              {scheduleData && (
                <>
                  <button
                    onClick={handleCopyOutput}
                    className="w-full bg-blue-600 text-white font-semibold py-3 px-6 rounded-lg hover:bg-blue-700 transition-all duration-200 shadow-lg hover:shadow-xl"
                  >
                    Copy Output
                  </button>

                  <div className="grid grid-cols-3 gap-2">
                    <button
                      onClick={handleExportCSVs}
                      className="bg-amber-600 text-white font-semibold py-2 px-4 rounded-lg hover:bg-amber-700 transition-all duration-200 text-sm"
                    >
                      CSV/Day
                    </button>
                    <button
                      onClick={handleExportCombinedCSV}
                      className="bg-amber-700 text-white font-semibold py-2 px-4 rounded-lg hover:bg-amber-800 transition-all duration-200 text-sm"
                    >
                      CSV Combined
                    </button>
                    <button
                      onClick={handleExportExcel}
                      className="bg-green-600 text-white font-semibold py-2 px-4 rounded-lg hover:bg-green-700 transition-all duration-200 text-sm"
                    >
                      Excel
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Results Display */}
          {scheduleData && (
            <div className="bg-white rounded-2xl shadow-xl p-8">
              <h2 className="text-2xl font-bold text-gray-800 mb-6">Generated Schedule</h2>

              {/* Exit Arm Summary */}
              <div className="mb-6 p-4 bg-indigo-50 rounded-lg">
                <h3 className="font-semibold text-indigo-900 mb-2">Exit Arm Assignments</h3>
                <div className="grid grid-cols-3 gap-2 text-sm max-h-32 overflow-y-auto">
                  {Object.entries(scheduleData.exit_arm_map).map(([id, arm]) => (
                    <div key={id} className="text-gray-700">
                      <span className="font-mono">{id}</span>: Arm {arm}
                    </div>
                  ))}
                </div>
              </div>

              {/* Day Selector */}
              <div className="mb-6">
                <div className="flex gap-2 flex-wrap">
                  {scheduleData.day_tables.map((table, idx) => (
                    <button
                      key={idx}
                      onClick={() => setSelectedDay(idx)}
                      className={`px-4 py-2 rounded-lg font-semibold transition-all duration-200 ${selectedDay === idx
                          ? 'bg-gradient-to-r from-indigo-600 to-purple-600 text-white shadow-lg'
                          : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                        }`}
                    >
                      Day {table.day} ({table.type})
                    </button>
                  ))}
                </div>
              </div>

              {/* Schedule Table */}
              {currentTable && (
                <>
                  <div className="overflow-x-auto mb-6">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-gradient-to-r from-indigo-50 to-purple-50">
                          {currentTable.header.map((col, idx) => (
                            <th key={idx} className="px-3 py-2 text-left font-semibold text-gray-700 border-b-2 border-indigo-200 whitespace-nowrap">
                              {col}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {currentTable.rows.map((row, rowIdx) => (
                          <tr key={rowIdx} className="hover:bg-gray-50 transition-colors">
                            {row.map((cell, cellIdx) => (
                              <td key={cellIdx} className="px-3 py-2 border-b border-gray-200 font-mono text-xs">
                                {cell}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Statistics */}
                  <div className="p-4 bg-purple-50 rounded-lg">
                    <h3 className="font-semibold text-purple-900 mb-2">Statistics</h3>
                    <div className="grid grid-cols-2 gap-4 text-sm text-gray-700">
                      <div>
                        <span className="font-semibold">Total Animals:</span> {currentTable.rows.length}
                      </div>
                      <div>
                        <span className="font-semibold">Trials per Animal:</span> {currentTable.header.length - 6}
                      </div>
                      <div>
                        <span className="font-semibold">Total Days:</span> {scheduleData.day_tables.length}
                      </div>
                      <div>
                        <span className="font-semibold">Current Day:</span> Day {currentTable.day} ({currentTable.type})
                      </div>
                    </div>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default App
