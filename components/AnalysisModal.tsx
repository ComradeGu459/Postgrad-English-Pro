import React, { useEffect, useState } from 'react';
import { X, Volume1, Sparkles } from 'lucide-react';
import { analyzeTerm } from '../services/aiService';

interface AnalysisModalProps {
  term: string;
  onClose: () => void;
}

export const AnalysisModal: React.FC<AnalysisModalProps> = ({ term, onClose }) => {
  const [aiAnalysis, setAiAnalysis] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  
  useEffect(() => {
    handleAiAnalysis(term);
  }, [term]);

  const handleAiAnalysis = async (targetTerm: string) => {
      setLoading(true);
      try {
          const html = await analyzeTerm(targetTerm);
          setAiAnalysis(html);
      } catch (e: any) {
          setAiAnalysis(`<div class="text-red-500">AI 解析失败: ${e.message}</div>`);
      } finally {
          setLoading(false);
      }
  };

  const speakWord = () => {
    // Simple word speaking uses browser by default for responsiveness, 
    // or we could use the service if needed, but simple is better for UI response.
    const u = new SpeechSynthesisUtterance(term);
    window.speechSynthesis.speak(u);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="bg-white rounded-xl shadow-2xl max-w-lg w-full p-6 flex flex-col max-h-[85vh] border-t-4 border-indigo-600">
        <div className="flex justify-between items-start mb-4">
          <div>
            <h3 className="text-2xl font-bold text-slate-900 flex items-center gap-3">
              {term}
              <button 
                onClick={speakWord}
                className="p-2 rounded-full bg-indigo-50 text-indigo-600 hover:bg-indigo-100 transition-colors"
                title="朗读"
              >
                <Volume1 className="w-5 h-5" />
              </button>
            </h3>
            <span className="text-xs font-bold text-indigo-500 bg-indigo-50 px-2 py-0.5 rounded mt-2 inline-block">
               考研英语·深度解析
            </span>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 p-1 hover:bg-slate-100 rounded-full transition-colors">
            <X className="w-6 h-6" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto space-y-4 pr-2 custom-scrollbar">
           <div className="bg-slate-50 border border-slate-100 rounded-xl p-5 shadow-inner min-h-[200px]">
               {loading ? (
                   <div className="flex flex-col items-center justify-center h-full py-8 text-indigo-500 gap-3">
                       <Sparkles className="w-8 h-8 animate-spin"/> 
                       <span className="text-sm font-medium">AI 正在查询考研题库与词源...</span>
                   </div>
               ) : (
                   <div 
                     className="prose prose-sm prose-indigo max-w-none text-slate-700 leading-relaxed"
                     dangerouslySetInnerHTML={{ __html: aiAnalysis || '' }} 
                   />
               )}
           </div>
        </div>
      </div>
    </div>
  );
};
