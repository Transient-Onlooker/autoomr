
import React from 'react';
import { GradingResult } from '../types';
import { CheckCircle, XCircle, MinusCircle, AlertTriangle } from 'lucide-react';

interface ResultsViewProps {
  result: GradingResult;
  onReset: () => void;
}

const ResultsView: React.FC<ResultsViewProps> = ({ result, onReset }) => {
  const identityGroups = result.groups.filter(g => g.type === 'identity');
  const questionGroups = result.groups.filter(g => g.type === 'question');

  return (
    <div className="max-w-5xl mx-auto p-6 space-y-8">
      {/* Header Stats */}
      <div className="bg-white rounded-xl shadow p-6 flex flex-col md:flex-row justify-between items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-800">Grading Complete</h2>
          <p className="text-slate-500">Review the OMR analysis below.</p>
        </div>
        <div className="text-center bg-blue-50 px-8 py-4 rounded-lg border border-blue-100">
          <div className="text-sm text-blue-600 uppercase font-semibold tracking-wider">Total Score</div>
          <div className="text-4xl font-extrabold text-blue-700">
            {result.totalScore} <span className="text-2xl text-blue-400">/ {result.maxScore}</span>
          </div>
        </div>
      </div>

      {/* Identity Section */}
      {identityGroups.length > 0 && (
        <div className="bg-white rounded-xl shadow p-6">
          <h3 className="text-lg font-semibold text-slate-700 mb-4 border-b pb-2">Student Information</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {identityGroups.map(group => {
               // Error if not exactly 1 mark
               const hasError = group.markedValues.length !== 1;
               return (
                  <div key={group.id} className="flex flex-col">
                    <span className="text-sm text-slate-500">{group.label}</span>
                    <div className={`text-xl font-mono font-medium p-2 rounded flex items-center gap-2 ${hasError ? 'bg-red-50 text-red-600 border border-red-200' : 'bg-slate-100 text-slate-900'}`}>
                      {hasError ? (
                          <>
                             <AlertTriangle size={20} />
                             <span className="text-base font-bold">
                                {group.markedValues.length === 0 ? "ERROR (Empty)" : "ERROR (Multiple)"}
                             </span>
                          </>
                      ) : (
                          group.markedValues.length > 0 ? group.markedValues.join(', ') : "—"
                      )}
                    </div>
                  </div>
               );
            })}
          </div>
        </div>
      )}

      {/* Questions Table */}
      <div className="bg-white rounded-xl shadow overflow-hidden">
        <h3 className="text-lg font-semibold text-slate-700 p-6 border-b">Detailed Answers</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 text-slate-500 text-sm uppercase">
                <th className="p-4 font-semibold">Q#</th>
                <th className="p-4 font-semibold">Marked Answer</th>
                <th className="p-4 font-semibold">Correct Answer</th>
                <th className="p-4 font-semibold text-center">Result</th>
                <th className="p-4 font-semibold text-right">Points</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {questionGroups.map((q) => {
                const isGraded = q.isCorrect !== undefined;
                let rowClass = "";
                if (!isGraded) rowClass = "bg-gray-50 text-gray-400";
                else if (q.isCorrect) rowClass = "bg-green-50/30";
                else rowClass = "bg-red-50/30";

                return (
                  <tr key={q.id} className={rowClass}>
                    <td className="p-4 font-medium">{q.label}</td>
                    <td className="p-4">
                      <div className="flex gap-1">
                        {q.markedValues.length > 0 ? (
                          q.markedValues.map(v => (
                            <span key={v} className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold ${isGraded ? 'bg-slate-200 text-slate-700' : 'bg-gray-200 text-gray-500'}`}>
                              {v}
                            </span>
                          ))
                        ) : (
                          <span className="text-slate-400 italic">No mark</span>
                        )}
                      </div>
                    </td>
                    <td className="p-4">
                       <div className="flex gap-1">
                        {q.correctAnswer && q.correctAnswer.length > 0 ? (
                          q.correctAnswer.map((v: string) => (
                            <span key={v} className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-blue-100 text-xs font-bold text-blue-700 border border-blue-200">
                              {v}
                            </span>
                          ))
                        ) : (
                          <span className="text-xs text-gray-400">-</span>
                        )}
                      </div>
                    </td>
                    <td className="p-4 text-center">
                      {isGraded ? (
                        q.isCorrect ? (
                          <CheckCircle className="w-6 h-6 text-green-500 mx-auto" />
                        ) : (
                          <XCircle className="w-6 h-6 text-red-500 mx-auto" />
                        )
                      ) : (
                        <MinusCircle className="w-6 h-6 text-gray-300 mx-auto" title="Not Graded" />
                      )}
                    </td>
                    <td className="p-4 text-right font-mono font-medium">
                      {isGraded ? q.score : '-'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="flex justify-center pt-8">
        <button
          onClick={onReset}
          className="px-6 py-3 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 font-semibold rounded-lg shadow-sm transition-all"
        >
          Grade Another Sheet
        </button>
      </div>
    </div>
  );
};

export default ResultsView;
