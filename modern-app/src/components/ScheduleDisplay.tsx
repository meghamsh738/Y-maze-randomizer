import { useState } from 'react'
import { ScheduleData } from '../types'

interface Props {
    data: ScheduleData
}

const ScheduleDisplay = ({ data }: Props) => {
    const [selectedDay, setSelectedDay] = useState(0)

    if (!data.day_tables || data.day_tables.length === 0) {
        return null
    }

    const currentTable = data.day_tables[selectedDay]

    return (
        <div className="bg-white rounded-2xl shadow-xl p-8">
            <h2 className="text-2xl font-bold text-gray-800 mb-6">Generated Schedule</h2>

            {/* Exit Arm Summary */}
            <div className="mb-6 p-4 bg-indigo-50 rounded-lg">
                <h3 className="font-semibold text-indigo-900 mb-2">Exit Arm Assignments</h3>
                <div className="grid grid-cols-3 gap-2 text-sm">
                    {Object.entries(data.exit_arm_map).map(([id, arm]) => (
                        <div key={id} className="text-gray-700">
                            <span className="font-mono">{id}</span>: Arm {arm}
                        </div>
                    ))}
                </div>
            </div>

            {/* Day Selector */}
            <div className="mb-6">
                <div className="flex gap-2 flex-wrap">
                    {data.day_tables.map((table, idx) => (
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
            <div className="overflow-x-auto">
                <table className="w-full text-sm">
                    <thead>
                        <tr className="bg-gradient-to-r from-indigo-50 to-purple-50">
                            {currentTable.header.map((col, idx) => (
                                <th key={idx} className="px-3 py-2 text-left font-semibold text-gray-700 border-b-2 border-indigo-200">
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
            <div className="mt-6 p-4 bg-purple-50 rounded-lg">
                <h3 className="font-semibold text-purple-900 mb-2">Statistics</h3>
                <div className="grid grid-cols-2 gap-4 text-sm text-gray-700">
                    <div>
                        <span className="font-semibold">Total Animals:</span> {currentTable.rows.length}
                    </div>
                    <div>
                        <span className="font-semibold">Trials per Animal:</span> {currentTable.header.length - 6}
                    </div>
                </div>
            </div>
        </div>
    )
}

export default ScheduleDisplay
