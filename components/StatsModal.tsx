import React from 'react';
import { X, Trophy, Activity } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { DailyStats } from '../types';

interface StatsModalProps {
  onClose: () => void;
  data: DailyStats[];
}

export const StatsModal: React.FC<StatsModalProps> = ({ onClose, data }) => {
  const totalSentences = data.reduce((acc, curr) => acc + curr.sentences, 0);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-in fade-in">
      <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full p-6 animate-in slide-in-from-bottom-4">
        <div className="flex justify-between items-center mb-6">
          <h3 className="text-xl font-bold text-slate-800 flex items-center gap-2">
            <Trophy className="w-6 h-6 text-amber-500" />
            Learning Statistics
          </h3>
          <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-full transition-colors">
            <X className="w-5 h-5 text-slate-500" />
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
            <div className="bg-indigo-50 p-4 rounded-xl border border-indigo-100">
                <p className="text-sm text-indigo-600 font-semibold uppercase">Total Sentences</p>
                <p className="text-3xl font-bold text-indigo-900 mt-1">{totalSentences}</p>
            </div>
            <div className="bg-emerald-50 p-4 rounded-xl border border-emerald-100">
                <p className="text-sm text-emerald-600 font-semibold uppercase">Active Days</p>
                <p className="text-3xl font-bold text-emerald-900 mt-1">{data.length}</p>
            </div>
            <div className="bg-amber-50 p-4 rounded-xl border border-amber-100">
                <p className="text-sm text-amber-600 font-semibold uppercase">Current Streak</p>
                <p className="text-3xl font-bold text-amber-900 mt-1">{data.length > 0 ? 1 : 0}</p>
            </div>
        </div>

        <div className="h-64 w-full bg-slate-50 rounded-xl p-4 border border-slate-100">
            <div className="flex items-center gap-2 mb-4 text-slate-500 text-sm">
                <Activity className="w-4 h-4" />
                <span>Practice Activity (Last 7 Days)</span>
            </div>
            <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data}>
                    <XAxis dataKey="day" tick={{fontSize: 12}} axisLine={false} tickLine={false} />
                    <YAxis hide />
                    <Tooltip 
                        cursor={{fill: '#f1f5f9'}}
                        contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                    />
                    <Bar dataKey="sentences" radius={[4, 4, 0, 0]}>
                        {data.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={index === data.length - 1 ? '#4f46e5' : '#cbd5e1'} />
                        ))}
                    </Bar>
                </BarChart>
            </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
};