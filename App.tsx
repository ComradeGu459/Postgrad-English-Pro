import React, { useState, useEffect, useRef } from 'react';
import { 
  Play, Pause, RotateCcw, Volume2, BookOpen, Eye, EyeOff, 
  ChevronRight, Save, History, Trash2, X, Search, Volume1, FileText, 
  Sparkles, Settings, Globe, Mic, Download, Wand2, Loader2, Edit3, Headphones
} from 'lucide-react';
import { SentencePair, HistoryItem, AppSettings } from './types';
import { translateText, analyzeGrammar, generateSpeechUrl, generateFullTextAudio } from './services/aiService';
import { AnalysisModal } from './components/AnalysisModal';
import { SettingsModal } from './components/SettingsModal';
import { getSettings } from './utils/storage';

const DEFAULT_TEXT = `Public administration, as a discipline, necessitates a comprehensive understanding of the intricate mechanisms through which policies are formulated and implemented. Bureaucracy, often stigmatized for its inefficiency, actually serves as the backbone of governance, ensuring that statutory obligations are met with rigorous adherence to protocol.`;

type ViewMode = 'edit' | 'study';

export default function App() {
  const [text, setText] = useState(DEFAULT_TEXT);
  const [title, setTitle] = useState("Public Admin Example");
  const [pairs, setPairs] = useState<SentencePair[]>([]); 
  const [settings, setSettings] = useState<AppSettings>(getSettings());
  const [viewMode, setViewMode] = useState<ViewMode>('study');
  
  // Playback State
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [rate, setRate] = useState(1.0); 
  const [pauseDuration, setPauseDuration] = useState(1500); 
  const [hideText, setHideText] = useState(false); 
  const [autoLoop, setAutoLoop] = useState(false);
  
  // Browser Voices
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [selectedVoice, setSelectedVoice] = useState<SpeechSynthesisVoice | null>(null);

  // Async & UI State
  const [isTranslating, setIsTranslating] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [downloadingIndex, setDownloadingIndex] = useState<number | null>(null);
  
  const [isDownloadingFull, setIsDownloadingFull] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState<{current: number, total: number} | null>(null);

  const [loadingAudioIndex, setLoadingAudioIndex] = useState<number | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  
  // History & Selection
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [selectedTerm, setSelectedTerm] = useState<string | null>(null);
  const [selectionTerm, setSelectionTerm] = useState<string | null>(null); 
  const [selectionPos, setSelectionPos] = useState({ x: 0, y: 0 });

  // Refs
  const synth = useRef(window.speechSynthesis);
  const uttr = useRef<SpeechSynthesisUtterance | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null); // For Cloud TTS
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const speakTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activeCardRef = useRef<HTMLDivElement>(null);
  
  // Cache for generated audio URLs to prevent re-fetching in loops
  const audioCache = useRef<Map<string, string>>(new Map());

  // --- Initialization ---
  useEffect(() => {
    try {
      const saved = localStorage.getItem('shadowing_history_v3');
      if (saved) {
          const parsed = JSON.parse(saved);
          if (Array.isArray(parsed)) setHistory(parsed);
      }
    } catch (e) {
      console.error("Failed to load history", e);
    }
    
    // Load voices for Browser TTS
    const loadVoices = () => {
        if (!synth.current) return;
        const available = synth.current.getVoices();
        const enVoices = available.filter(v => v.lang.includes('en'));
        setVoices(enVoices.length > 0 ? enVoices : available);
        if (!selectedVoice && enVoices.length > 0) {
            const pref = enVoices.find(v => v.name.includes('Google US')) || enVoices[0];
            setSelectedVoice(pref);
        }
    };
    loadVoices();
    if (speechSynthesis.onvoiceschanged !== undefined) {
        speechSynthesis.onvoiceschanged = loadVoices;
    }

    // Initialize Audio Element for Cloud TTS
    audioRef.current = new Audio();
    audioRef.current.onended = handleAudioEnded;
    audioRef.current.onerror = handleAudioError;
    
    return () => {
       if (audioRef.current) {
         audioRef.current.pause();
         audioRef.current = null;
       }
    };
  }, []);

  // --- Text Processing ---
  useEffect(() => {
    const splitSentences = (txt: string) => {
        if (!txt) return [];
        return (txt.match(/[^.!?\n]+[.!?\n]?/g) || [txt]).map(s => s.trim()).filter(s => s.length > 0);
    };
    const enSentences = splitSentences(text);
    const newPairs = enSentences.map(s => ({ text: s, trans: '', grammar: '' }));
    setPairs(newPairs);
    setCurrentIndex(0);
    stopPlayback();
    audioCache.current.clear();
  }, [text]);

  // Scroll to active card
  useEffect(() => {
      if (viewMode === 'study' && activeCardRef.current) {
          activeCardRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
  }, [currentIndex, viewMode]);

  const stopPlayback = () => {
    setIsPlaying(false);
    if (synth.current) synth.current.cancel();
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
    if (timerRef.current) clearTimeout(timerRef.current);
    if (speakTimeoutRef.current) clearTimeout(speakTimeoutRef.current);
    setLoadingAudioIndex(null);
  };

  const handleAudioEnded = () => {
    scheduleNext(currentIndex);
  };

  const handleAudioError = (e: any) => {
    console.error("Audio Playback Error", e);
    setIsPlaying(false);
    setLoadingAudioIndex(null);
    alert("播放出错，请检查网络或 TTS 设置。如果使用的是 Cloud TTS，请确认 API Key 正确。");
  };

  const scheduleNext = (completedIndex: number) => {
     if (autoLoop) {
        timerRef.current = setTimeout(() => { 
            if (isPlaying) speakSentence(completedIndex); 
        }, pauseDuration);
      } else {
        if (completedIndex < pairs.length - 1) {
          timerRef.current = setTimeout(() => { 
            if (isPlaying) { 
              const next = completedIndex + 1;
              setCurrentIndex(next); 
              speakSentence(next); 
            } 
          }, pauseDuration);
        } else {
          setIsPlaying(false);
          setCurrentIndex(0);
        }
      }
  };

  // --- Speech Logic ---
  const speakSentence = async (index: number) => {
    if (index >= pairs.length || index < 0) { setIsPlaying(false); return; }
    
    // Stop any current playback
    if (synth.current) synth.current.cancel();
    if (audioRef.current) audioRef.current.pause();
    if (timerRef.current) clearTimeout(timerRef.current);

    const sentence = pairs[index].text;

    // --- Strategy 1: Cloud TTS (Gemini) ---
    if (settings.ttsProvider !== 'browser') {
        try {
            setLoadingAudioIndex(index);
            let url = audioCache.current.get(sentence);
            
            if (!url) {
                // Fetch new
                url = await generateSpeechUrl(sentence);
                audioCache.current.set(sentence, url);
            }

            if (audioRef.current && isPlaying) {
                audioRef.current.src = url;
                audioRef.current.playbackRate = rate; 
                await audioRef.current.play();
                setLoadingAudioIndex(null);
            }
        } catch (e: any) {
            console.error("Cloud TTS Error", e);
            setLoadingAudioIndex(null);
            setIsPlaying(false);
            alert(`TTS Error (${settings.ttsProvider}): ` + e.message);
        }
        return;
    }

    // --- Strategy 2: Browser TTS ---
    const utterance = new SpeechSynthesisUtterance(sentence);
    utterance.rate = rate;
    if (selectedVoice) utterance.voice = selectedVoice;
    
    utterance.onstart = () => { uttr.current = utterance; };
    utterance.onend = () => {
      uttr.current = null;
      scheduleNext(index);
    };
    utterance.onerror = (e) => { 
        if (e.error !== 'interrupted') setIsPlaying(false); 
    };
    
    speakTimeoutRef.current = setTimeout(() => { 
        uttr.current = utterance; 
        if (synth.current) synth.current.speak(utterance); 
    }, 50);
  };

  const handlePlay = () => {
    if (isPlaying) {
      stopPlayback();
    } else {
      setIsPlaying(true);
      speakSentence(currentIndex);
    }
  };

  // --- AI Handlers ---
  const handleAiTranslate = async () => {
      if (!text.trim()) return alert("请先输入英文原文");
      setIsTranslating(true);
      try {
          const result = await translateText(text);
          const cnSentences = result.split(/([。！？\n])/).reduce((acc: string[], curr, idx, arr) => {
              if (idx % 2 === 0 && curr.trim()) acc.push(curr + (arr[idx+1] || ''));
              return acc;
          }, []);
          
          setPairs(prev => prev.map((p, i) => ({
              ...p,
              trans: cnSentences[i] || (i === 0 ? result : '')
          })));
      } catch (e: any) {
          alert("翻译失败: " + e.message);
      } finally {
          setIsTranslating(false);
      }
  };

  const handleAiAnalyzeGrammar = async () => {
      if (!text.trim()) return alert("请先输入英文原文");
      setIsAnalyzing(true);
      try {
           const analyses = await analyzeGrammar(text, pairs.length);
           setPairs(prev => prev.map((p, i) => ({
               ...p,
               grammar: analyses[i] ? analyses[i].trim() : ''
           })));
          // Automatically switch to study mode after analysis
          setViewMode('study');
      } catch (e: any) {
          alert("分析失败: " + e.message);
      } finally {
          setIsAnalyzing(false);
      }
  };

  const handleDownloadSingleAudio = async (sentence: string, index: number) => {
      setDownloadingIndex(index);
      try {
          const wavUrl = await generateSpeechUrl(sentence);
          const a = document.createElement('a');
          a.href = wavUrl;
          a.download = `sentence_${index + 1}.wav`;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
      } catch (e: any) {
          alert("音频生成失败: " + e.message);
      } finally {
          setDownloadingIndex(null);
      }
  };

  const handleDownloadFullAudio = async () => {
    if (settings.ttsProvider === 'browser') {
        alert("浏览器语音不支持全文下载，请在设置中切换为 Cloud TTS (Gemini)。");
        return;
    }
    
    if (pairs.length === 0) return;
    
    setIsDownloadingFull(true);
    setDownloadProgress({ current: 0, total: pairs.length });
    
    try {
        const sentences = pairs.map(p => p.text);
        
        const wavUrl = await generateFullTextAudio(sentences, (curr, total) => {
            setDownloadProgress({ current: curr, total });
        });

        const a = document.createElement('a');
        a.href = wavUrl;
        a.download = `${title || 'full_audio'}.wav`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
    } catch (e: any) {
        alert("全文生成失败 (API 错误或网络问题): " + e.message);
    } finally {
        setIsDownloadingFull(false);
        setDownloadProgress(null);
    }
  };

  // --- Interaction Handlers ---
  const handleWordClick = (e: React.MouseEvent, wordPart: string) => {
      e.stopPropagation();
      setSelectionTerm(null);
      const clean = wordPart.replace(/[^a-zA-Z-]/g, '');
      if (clean.length > 1) setSelectedTerm(clean);
  };

  const handleMouseUp = () => {
      const selection = window.getSelection();
      if (!selection) return;
      const txt = selection.toString().trim();
      if (txt.length > 0 && txt.includes(' ')) { 
          const range = selection.getRangeAt(0);
          const rect = range.getBoundingClientRect();
          setSelectionPos({ x: rect.left + rect.width / 2, y: rect.top - 10 });
          setSelectionTerm(txt);
      }
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 font-sans selection:bg-indigo-100 flex flex-col" onClick={() => setSelectionTerm(null)}>
      
      {/* Term Detail Modal */}
      {selectedTerm && (
          <AnalysisModal 
            term={selectedTerm} 
            onClose={() => setSelectedTerm(null)} 
          />
      )}

      {/* Settings Modal */}
      {showSettings && (
          <SettingsModal 
            onClose={() => setShowSettings(false)}
            onSave={() => {
                setSettings(getSettings());
                audioCache.current.clear();
            }}
          />
      )}

      {/* Phrase Selection Popup */}
      {selectionTerm && (
          <div 
            className="fixed z-50 transform -translate-x-1/2 -translate-y-full mb-2 animate-in zoom-in duration-200"
            style={{ left: selectionPos.x, top: selectionPos.y }}
          >
              <button 
                onClick={(e) => {
                    e.stopPropagation();
                    setSelectedTerm(selectionTerm);
                    setSelectionTerm(null);
                }}
                className="bg-indigo-600 text-white text-xs font-bold px-3 py-1.5 rounded-full shadow-lg hover:bg-indigo-700 flex items-center gap-1"
              >
                  <Sparkles className="w-3 h-3 text-amber-300"/> 解析短语
              </button>
          </div>
      )}

      {/* History Sidebar */}
      {showHistory && (
        <div className="fixed inset-0 z-40 flex">
            <div className="absolute inset-0 bg-black/20" onClick={() => setShowHistory(false)}></div>
            <div className="relative bg-white w-80 shadow-2xl p-4 flex flex-col h-full animate-in slide-in-from-left duration-200">
                <div className="flex justify-between items-center mb-4 border-b pb-2">
                    <h2 className="font-bold text-lg flex items-center gap-2 text-slate-800"><History className="w-5 h-5"/> 历史记录</h2>
                    <button onClick={() => setShowHistory(false)}><X className="w-5 h-5 text-slate-400"/></button>
                </div>
                <div className="flex-1 overflow-y-auto space-y-2">
                    {history.map(item => (
                        <div key={item.id} onClick={() => { setText(item.text); setTitle(item.title); setShowHistory(false); }} className="p-3 bg-slate-50 hover:bg-indigo-50 rounded-lg cursor-pointer border border-slate-100 transition-colors group">
                            <h3 className="font-semibold text-slate-700 text-sm truncate group-hover:text-indigo-700">{item.title}</h3>
                            <p className="text-xs text-slate-400 mt-1">{item.date} · {item.text.length} chars</p>
                        </div>
                    ))}
                    {history.length === 0 && <p className="text-center text-slate-400 mt-10 text-sm">暂无历史记录</p>}
                </div>
            </div>
        </div>
      )}

      {/* Top Header */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-30">
          <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="bg-indigo-600 p-1.5 rounded-lg text-white">
                    <BookOpen className="w-5 h-5" />
                </div>
                <div>
                    <h1 className="text-lg font-bold text-slate-900 leading-tight">Postgrad English <span className="text-indigo-600">Pro</span></h1>
                    <p className="text-[10px] text-slate-500 font-medium tracking-wide">INTELLIGENT SHADOWING</p>
                </div>
              </div>

              {/* View Mode Switcher */}
              <div className="hidden md:flex bg-slate-100 p-1 rounded-lg">
                  <button 
                    onClick={() => setViewMode('edit')}
                    className={`px-4 py-1.5 rounded-md text-sm font-semibold transition-all flex items-center gap-2 ${viewMode === 'edit' ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                  >
                      <Edit3 className="w-4 h-4" /> 编辑原文
                  </button>
                  <button 
                    onClick={() => setViewMode('study')}
                    className={`px-4 py-1.5 rounded-md text-sm font-semibold transition-all flex items-center gap-2 ${viewMode === 'study' ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                  >
                      <Headphones className="w-4 h-4" /> 沉浸跟读
                  </button>
              </div>

              <div className="flex items-center gap-2">
                 <button onClick={() => setShowHistory(true)} className="p-2 text-slate-500 hover:bg-slate-100 rounded-lg"><History className="w-5 h-5" /></button>
                 <button onClick={() => setShowSettings(true)} className="p-2 text-slate-500 hover:bg-slate-100 rounded-lg relative">
                     <Settings className="w-5 h-5" />
                     {(!settings.deepseekKey && settings.llmProvider === 'deepseek') && <span className="absolute top-2 right-2 w-2 h-2 bg-red-500 rounded-full"></span>}
                 </button>
                 <button onClick={() => {
                     const newEntry = { id: Date.now(), title: title || `Untitled`, text, date: new Date().toLocaleDateString() };
                     setHistory([newEntry, ...history]);
                     localStorage.setItem('shadowing_history_v3', JSON.stringify([newEntry, ...history]));
                     alert("已保存");
                 }} className="hidden md:flex items-center gap-2 px-3 py-1.5 text-xs font-bold text-white bg-slate-900 rounded-lg hover:bg-slate-800 transition-colors"><Save className="w-3 h-3" /> 保存</button>
              </div>
          </div>
      </header>

      {/* Main Content Workspace */}
      <main className="flex-1 overflow-hidden relative max-w-7xl mx-auto w-full flex flex-col">
          
          {/* Mobile Tabs */}
          <div className="md:hidden flex border-b border-slate-200 bg-white">
              <button onClick={() => setViewMode('edit')} className={`flex-1 py-3 text-sm font-medium border-b-2 ${viewMode === 'edit' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-slate-500'}`}>原文编辑</button>
              <button onClick={() => setViewMode('study')} className={`flex-1 py-3 text-sm font-medium border-b-2 ${viewMode === 'study' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-slate-500'}`}>跟读练习</button>
          </div>

          <div className="flex-1 overflow-y-auto pb-32 custom-scrollbar">
            {viewMode === 'edit' ? (
                // --- Edit Mode View ---
                <div className="p-6 max-w-4xl mx-auto animate-in fade-in slide-in-from-bottom-4">
                    <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
                        <div className="flex justify-between items-center mb-4">
                            <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2"><FileText className="w-5 h-5 text-indigo-500"/> 原文输入</h2>
                            <button onClick={() => { if(confirm('清空文本?')) setText(''); }} className="text-xs text-slate-400 hover:text-red-500 flex items-center gap-1"><Trash2 className="w-3 h-3"/> 清空</button>
                        </div>
                        <textarea 
                            className="w-full h-96 p-4 text-base leading-relaxed outline-none resize-none font-serif text-slate-700 bg-slate-50 rounded-lg border border-slate-200 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all placeholder:text-slate-300" 
                            value={text} 
                            onChange={(e) => setText(e.target.value)} 
                            placeholder="在此粘贴考研英语真题长难句或段落..." 
                        />
                        <div className="mt-6 flex flex-wrap gap-4">
                            <button 
                                onClick={handleAiTranslate} 
                                disabled={isTranslating} 
                                className="flex-1 flex items-center justify-center gap-2 bg-white text-slate-700 font-semibold py-3 rounded-lg border border-slate-300 hover:bg-slate-50 hover:border-slate-400 transition-all disabled:opacity-50 shadow-sm"
                            >
                                {isTranslating ? <Loader2 className="w-5 h-5 animate-spin"/> : <Globe className="w-5 h-5 text-indigo-500"/>}
                                {settings.llmProvider === 'deepseek' ? 'DeepSeek 智能翻译' : 'Gemini 智能翻译'}
                            </button>
                            <button 
                                onClick={handleAiAnalyzeGrammar} 
                                disabled={isAnalyzing} 
                                className="flex-1 flex items-center justify-center gap-2 bg-indigo-600 text-white font-semibold py-3 rounded-lg hover:bg-indigo-700 shadow-md shadow-indigo-200 transition-all disabled:opacity-50"
                            >
                                {isAnalyzing ? <Loader2 className="w-5 h-5 animate-spin"/> : <Wand2 className="w-5 h-5 text-indigo-200"/>}
                                深度语法分析 & 生成练习
                            </button>
                        </div>
                        <p className="mt-4 text-center text-xs text-slate-400">
                             点击"深度分析"将自动切分句子并生成语法讲解，随后跳转至跟读模式。
                        </p>
                    </div>
                </div>
            ) : (
                // --- Study Mode View ---
                <div className="p-4 md:p-8 max-w-3xl mx-auto space-y-6 animate-in fade-in">
                     <div className="flex items-center justify-between mb-2">
                        <input 
                            value={title} 
                            onChange={(e) => setTitle(e.target.value)} 
                            className="text-xl font-bold bg-transparent border-none outline-none text-slate-800 placeholder:text-slate-300 w-full" 
                            placeholder="Unit Title..." 
                        />
                     </div>

                     {pairs.length === 0 ? (
                         <div className="text-center py-20 bg-white rounded-xl border border-dashed border-slate-300">
                             <p className="text-slate-400">列表为空，请前往 <button onClick={() => setViewMode('edit')} className="text-indigo-600 font-bold underline">编辑模式</button> 添加文本。</p>
                         </div>
                     ) : (
                         pairs.map((item, index) => (
                            <div 
                                key={index} 
                                ref={index === currentIndex ? activeCardRef : null}
                                onClick={() => { if(isPlaying) { stopPlayback(); setTimeout(()=>speakSentence(index), 50);} setCurrentIndex(index); }} 
                                className={`relative p-6 rounded-2xl transition-all duration-300 border-2 cursor-pointer group ${index === currentIndex ? 'bg-white border-indigo-500 shadow-xl shadow-indigo-100 scale-[1.01]' : 'bg-white border-transparent hover:border-slate-200 shadow-sm hover:shadow-md'}`}
                            >
                                <div className="flex justify-between items-start mb-3">
                                    <span className={`text-xs font-bold px-2 py-1 rounded-md ${index === currentIndex ? 'bg-indigo-100 text-indigo-700' : 'bg-slate-100 text-slate-400'}`}>
                                        {String(index + 1).padStart(2, '0')}
                                    </span>
                                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                        <button onClick={(e) => { e.stopPropagation(); handleDownloadSingleAudio(item.text, index); }} className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded" title="下载单句音频">
                                            {downloadingIndex === index ? <Loader2 className="w-4 h-4 animate-spin"/> : <Download className="w-4 h-4"/>}
                                        </button>
                                    </div>
                                </div>

                                <div className={`text-xl md:text-2xl leading-relaxed font-serif transition-colors ${index === currentIndex ? 'text-slate-900' : 'text-slate-500'}`}>
                                    {hideText && index === currentIndex ? (
                                        <div className="flex items-center gap-3 text-slate-300 italic py-4 select-none bg-slate-50 rounded-lg justify-center border border-dashed border-slate-200">
                                            <Volume2 className="w-6 h-6 animate-pulse"/>
                                            <span>Focus on listening...</span>
                                        </div>
                                    ) : (
                                        item.text.split(/(\s+)/).map((part, i) => {
                                            if(part.match(/^\s+$/)) return part;
                                            return <span key={i} className="inline-block hover:bg-indigo-100 hover:text-indigo-800 rounded px-0.5 cursor-help transition-colors duration-100" onClick={(e) => handleWordClick(e, part)}>{part}</span>
                                        })
                                    )}
                                </div>

                                {item.trans && (
                                    <div className={`mt-4 text-base border-t border-slate-100 pt-3 text-slate-600 leading-relaxed ${index === currentIndex ? 'opacity-100' : 'opacity-60'}`}>
                                        {item.trans}
                                    </div>
                                )}

                                {item.grammar && (
                                    <div className="mt-4 bg-amber-50/50 rounded-xl p-4 text-sm text-slate-700 border border-amber-100/50">
                                        <div className="prose prose-sm prose-indigo max-w-none" dangerouslySetInnerHTML={{ __html: item.grammar }} />
                                    </div>
                                )}
                            </div>
                         ))
                     )}
                </div>
            )}
          </div>
      </main>

      {/* Persistent Bottom Player Bar */}
      <div className="fixed bottom-0 left-0 right-0 bg-white/90 backdrop-blur-md border-t border-slate-200 p-3 md:p-4 z-40 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)]">
          <div className="max-w-4xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
              
              {/* Controls */}
              <div className="flex items-center gap-6">
                   <button onClick={() => {const prev = Math.max(0, currentIndex - 1); if(isPlaying) {stopPlayback(); setTimeout(()=>speakSentence(prev),50);} setCurrentIndex(prev);}} className="text-slate-400 hover:text-slate-800 transition-colors">
                       <ChevronRight className="w-8 h-8 rotate-180" />
                   </button>
                   
                   <button onClick={handlePlay} className={`w-14 h-14 flex items-center justify-center rounded-full shadow-lg transition-all transform active:scale-95 ${isPlaying ? 'bg-amber-500 text-white ring-4 ring-amber-100' : 'bg-slate-900 text-white ring-4 ring-slate-200'}`}>
                        {loadingAudioIndex !== null ? <Loader2 className="w-6 h-6 animate-spin"/> : isPlaying ? <Pause className="w-6 h-6 fill-current" /> : <Play className="w-6 h-6 fill-current ml-1" />}
                   </button>
                   
                   <button onClick={() => {const next = Math.min(pairs.length - 1, currentIndex + 1); if(isPlaying) {stopPlayback(); setTimeout(()=>speakSentence(next),50);} setCurrentIndex(next);}} className="text-slate-400 hover:text-slate-800 transition-colors">
                       <ChevronRight className="w-8 h-8" />
                   </button>
              </div>

              {/* Progress & Settings */}
              <div className="flex flex-1 items-center gap-4 w-full md:w-auto overflow-x-auto no-scrollbar">
                  <div className="flex items-center gap-2 bg-slate-100 px-3 py-1.5 rounded-full">
                      <button onClick={() => setAutoLoop(!autoLoop)} className={`p-1.5 rounded-full transition-colors ${autoLoop ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:bg-slate-200'}`} title="单句循环">
                          <RotateCcw className="w-4 h-4" />
                      </button>
                      <button onClick={() => setHideText(!hideText)} className={`p-1.5 rounded-full transition-colors ${hideText ? 'bg-amber-500 text-white' : 'text-slate-400 hover:bg-slate-200'}`} title="盲听模式">
                          {hideText ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                  </div>

                  {/* Voice Indicator */}
                  <div className="hidden md:flex items-center gap-2 px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-full text-xs font-medium text-slate-500 whitespace-nowrap">
                      {settings.ttsProvider === 'browser' ? (
                          <span className="flex items-center gap-1"><Globe className="w-3 h-3"/> Browser TTS</span>
                      ) : (
                          <span className="flex items-center gap-1 text-pink-600"><Mic className="w-3 h-3"/> Gemini Cloud</span>
                      )}
                  </div>

                  {/* Sliders */}
                  <div className="flex items-center gap-3 min-w-[140px]">
                      <span className="text-[10px] font-bold text-slate-400">SPEED</span>
                      <input type="range" min="0.5" max="1.5" step="0.1" value={rate} onChange={(e) => setRate(parseFloat(e.target.value))} className="w-20 h-1 bg-slate-300 rounded-lg appearance-none cursor-pointer accent-slate-800" />
                  </div>
              </div>

              {/* Download Full */}
              <button 
                onClick={handleDownloadFullAudio}
                disabled={isDownloadingFull || pairs.length === 0}
                className="hidden md:flex items-center gap-2 px-4 py-2 bg-indigo-50 text-indigo-700 text-sm font-bold rounded-full hover:bg-indigo-100 transition-colors disabled:opacity-50 border border-indigo-100 whitespace-nowrap min-w-[140px] justify-center"
              >
                  {isDownloadingFull ? <Loader2 className="w-4 h-4 animate-spin"/> : <Download className="w-4 h-4"/>}
                  {isDownloadingFull && downloadProgress ? `Merging ${downloadProgress.current}/${downloadProgress.total}` : "全文下载"}
              </button>
          </div>
      </div>
    </div>
  );
}