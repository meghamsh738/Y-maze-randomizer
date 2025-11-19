import { useState } from 'react'
import { ScheduleRequest, AnimalInput } from '../types'

interface Props {
    onGenerate: (request: ScheduleRequest) => void
    onExport: (request: ScheduleRequest) => void
    loading: boolean
}

const InputForm = ({ onGenerate, onExport, loading }: Props) => {
    const [animalText, setAnimalText] = useState('')
    const [learningDays, setLearningDays] = useState(3)
    const [reversalDays, setReversalDays] = useState(2)
    const [trialsPerDay, setTrialsPerDay] = useState(10)
    const [useSeed, setUseSeed] = useState(false)
    const [seed, setSeed] = useState(42)

    const parseAnimals = (text: string): AnimalInput[] => {
        const lines = text.trim().split('\n').filter(l => l.trim())
        const animals: AnimalInput[] = []

        for (const line of lines) {
            // Skip header line
            if (line.includes('AnimalID') && line.includes('Sex')) continue

            // Parse tab-separated or multi-space separated
            const parts = line.includes('\t')
                ? line.split('\t').map(p => p.trim()).filter(p => p)
                : line.split(/\s{2,}/).map(p => p.trim()).filter(p => p)

            if (parts.length >= 5) {
                animals.push({
                    AnimalID: parts[0],
                    Tag: parts[1],
                    Sex: parts[2],
                    Genotype: parts[3],
                    Cage: parts[parts.length - 1]  // Last column is Cage
                })
            }
        }

        return animals
    }

    const handleGenerate = () => {
        const animals = parseAnimals(animalText)
        if (animals.length === 0) {
            alert('Please paste animal data first')
            return
        }

        const request: ScheduleRequest = {
            animals,
            learning_days: learningDays,
            reversal_days: reversalDays,
            trials_per_day: trialsPerDay,
            seed: useSeed ? seed : null
        }

        onGenerate(request)
    }

    const handleExport = () => {
        const animals = parseAnimals(animalText)
        if (animals.length === 0) {
            alert('Please paste animal data first')
            return
        }

        const request: ScheduleRequest = {
            animals,
            learning_days: learningDays,
            reversal_days: reversalDays,
            trials_per_day: trialsPerDay,
            seed: useSeed ? seed : null
        }

        onExport(request)
    }

    return (
        <div className="bg-white rounded-2xl shadow-xl p-8">
            <h2 className="text-2xl font-bold text-gray-800 mb-6">Input Parameters</h2>

            {/* Animal Data Input */}
            <div className="mb-6">
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Animal Data
                </label>
                <p className="text-xs text-gray-500 mb-2">
                    Paste tab- or space-separated data: AnimalID | Tag | Sex | Genotype | ... | Cage (last)
                </p>
                <textarea
                    className="w-full h-48 px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent font-mono text-sm resize-none"
                    placeholder="Paste animal data here..."
                    value={animalText}
                    onChange={(e) => setAnimalText(e.target.value)}
                />
            </div>

            {/* Parameters Grid */}
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

            {/* Seed Option */}
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

            {/* Action Buttons */}
            <div className="flex gap-4">
                <button
                    onClick={handleGenerate}
                    disabled={loading}
                    className="flex-1 bg-gradient-to-r from-indigo-600 to-purple-600 text-white font-semibold py-3 px-6 rounded-lg hover:from-indigo-700 hover:to-purple-700 transition-all duration-200 shadow-lg hover:shadow-xl disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    {loading ? 'Generating...' : 'Generate Schedule'}
                </button>

                <button
                    onClick={handleExport}
                    disabled={loading}
                    className="flex-1 bg-green-600 text-white font-semibold py-3 px-6 rounded-lg hover:bg-green-700 transition-all duration-200 shadow-lg hover:shadow-xl disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    Export to Excel
                </button>
            </div>
        </div>
    )
}

export default InputForm
