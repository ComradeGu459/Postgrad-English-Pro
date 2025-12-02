
import React, { useState, useEffect } from 'react';
import { X, Save, Key, Server, Mic, Cpu, Globe, Trash2, Check, Database } from 'lucide-react';
import { AppSettings, HistoryItem } from '../types';
import { getSettings, saveSettings } from '../utils/storage';
import { clearAllTTSCache, clearUnitCache } from '../services/aiService';

interface SettingsModalProps {
  onClose: () => void;
  onSave: () => void;
}

const DOUBAO_VOICES = [
  // --- 核心推荐 (BigTTS) ---
  { id: 'zh_male_guozhoudege_moon_bigtts', name: '国周 (磁性解说/推荐)' },
  { id: 'zh_female_shuangkuaisisi_moon_bigtts', name: '爽快思思 (生动/推荐)' },
  
  // --- 情感/特色 ---
  { id: 'zh_male_beijingxiaoye_emo_v2_mars_bigtts', name: '北京小爷 (情感版)' },
  { id: 'zh_male_chunhouxiaoyu_moon_bigtts', name: '醇厚小宇 (有声书)' },
  { id: 'zh_female_zhichuxin_moon_bigtts', name: '知性楚欣 (新闻/正式)' },
  { id: 'zh_female_cancan_mars_bigtts', name: '灿灿 (温柔解说)' },
  
  // --- 英语专用/外语 ---
  { id: 'en_male_adam', name: 'Adam (美式男声)' },
  { id: 'en_female_sarah', name: 'Sarah (美式女声)' },

  // --- 基础流式 (备用) ---
  { id: 'BV001_streaming', name: '基础通用女声 (BV001)' },
  { id: 'BV002_streaming', name: '基础通用男声 (BV002)' },
];

export const SettingsModal: React.FC<SettingsModalProps> = ({ onClose, onSave }) => {
  const [settings, setSettings] = useState<AppSettings>(getSettings());
  const [cacheStatus, setCacheStatus] = useState<string>('');
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [clearingId, setClearingId] = useState<number | null>(null);

  useEffect(() => {
    try {
      const saved = localStorage.getItem('shadowing_history_v3');
      if (saved) {
        setHistory(JSON.parse(saved));
      }
    } catch (e) { console.error(e); }
  }, []);

  const handleSave = () => {
    saveSettings(settings);
    onSave();
    onClose();
  };

  const handleClearAllCache = async () => {
    if (confirm('确定要清空所有已下载的语音缓存吗？\n清空后下次播放将需要重新消耗网络流量。')) {
      await clearAllTTSCache();
      setCacheStatus('已清空');
      setTimeout(() => setCacheStatus(''), 2000);
    }
  };

  const handleClearUnitCache = async (item: HistoryItem) => {
    setClearingId(item.id);
    const count = await clearUnitCache(item.text);
    alert(`已清理 "${item.title}" 相关的 ${count} 个音频缓存文件。`);
    setClearingId(null);
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in">
      <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full flex flex-col max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-slate-50">
          <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
            <SettingsIcon /> 系统设置
          </h3>
          <button onClick={onClose} className="p-2 hover:bg-slate-200 rounded-full text-slate-500 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-8">
          
          {/* Provider Selection */}
          <section>
            <h4 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-4 flex items-center gap-2">
              <Server className="w-4 h-4" /> 模型引擎选择
            </h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-700 flex items-center gap-2">
                  <Cpu className="w-4 h-4 text-indigo-500"/> 文本分析 (LLM)
                </label>
                <div className="grid grid-cols-2 gap-2 p-1 bg-slate-100 rounded-lg">
                  <button 
                    onClick={() => setSettings({...settings, llmProvider: 'gemini'})}
                    className={`py-2 px-3 text-sm font-medium rounded-md transition-all ${settings.llmProvider === 'gemini' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                  >
                    Gemini 2.5
                  </button>
                  <button 
                    onClick={() => setSettings({...settings, llmProvider: 'deepseek'})}
                    className={`py-2 px-3 text-sm font-medium rounded-md transition-all ${settings.llmProvider === 'deepseek' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                  >
                    DeepSeek
                  </button>
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-700 flex items-center gap-2">
                  <Mic className="w-4 h-4 text-pink-500"/> 语音合成 (TTS)
                </label>
                <div className="grid grid-cols-3 gap-2 p-1 bg-slate-100 rounded-lg">
                   <button 
                    onClick={() => setSettings({...settings, ttsProvider: 'browser'})}
                    className={`py-2 px-1 text-xs font-medium rounded-md transition-all ${settings.ttsProvider === 'browser' ? 'bg-white text-slate-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                  >
                    浏览器
                  </button>
                  <button 
                    onClick={() => setSettings({...settings, ttsProvider: 'gemini'})}
                    className={`py-2 px-1 text-xs font-medium rounded-md transition-all ${settings.ttsProvider === 'gemini' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                  >
                    Gemini
                  </button>
                  <button 
                    onClick={() => setSettings({...settings, ttsProvider: 'doubao'})}
                    className={`py-2 px-1 text-xs font-medium rounded-md transition-all ${settings.ttsProvider === 'doubao' ? 'bg-white text-emerald-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                  >
                    豆包
                  </button>
                </div>
              </div>
            </div>
          </section>

          {/* Configuration */}
          <section>
             <h4 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-4 flex items-center gap-2">
              <Key className="w-4 h-4" /> 详细配置
            </h4>
            <div className="space-y-4 bg-slate-50 p-4 rounded-xl border border-slate-100">
              
              {/* Gemini Key */}
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1">Gemini API Key</label>
                <input 
                  type="password" 
                  value={settings.geminiKey}
                  onChange={(e) => setSettings({...settings, geminiKey: e.target.value})}
                  placeholder="AIStudio Key (Leave empty to use default env)"
                  className="w-full text-sm p-2 border border-slate-300 rounded focus:ring-2 focus:ring-indigo-500 outline-none"
                />
              </div>

              {/* DeepSeek Key */}
              <div className={settings.llmProvider === 'deepseek' ? 'block' : 'opacity-50'}>
                <label className="block text-xs font-semibold text-blue-600 mb-1">DeepSeek API Key (sk-...)</label>
                <input 
                  type="password" 
                  value={settings.deepseekKey}
                  onChange={(e) => setSettings({...settings, deepseekKey: e.target.value})}
                  placeholder="sk-..."
                  className="w-full text-sm p-2 border border-blue-200 rounded focus:ring-2 focus:ring-blue-500 outline-none font-mono"
                />
              </div>

              {/* Proxy Settings */}
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1 flex items-center gap-2">
                    <Globe className="w-3 h-3"/> CORS Proxy URL (Optional)
                </label>
                <input 
                  type="text" 
                  value={settings.proxyUrl}
                  onChange={(e) => setSettings({...settings, proxyUrl: e.target.value})}
                  placeholder="https://your-worker.workers.dev/corsproxy/"
                  className="w-full text-sm p-2 border border-slate-300 rounded focus:ring-2 focus:ring-indigo-500 outline-none font-mono"
                />
              </div>

              {/* Doubao Config */}
              <div className={settings.ttsProvider === 'doubao' ? 'space-y-3 pt-3 border-t border-slate-200' : 'hidden'}>
                 <div>
                    <label className="block text-xs font-semibold text-emerald-600 mb-1">Doubao AppID</label>
                    <input 
                      type="text" 
                      value={settings.doubaoAppId || ''}
                      onChange={(e) => setSettings({...settings, doubaoAppId: e.target.value})}
                      placeholder="e.g. 123456789"
                      className="w-full text-sm p-2 border border-emerald-200 rounded focus:ring-2 focus:ring-emerald-500 outline-none font-mono"
                    />
                 </div>
                 <div>
                    <label className="block text-xs font-semibold text-emerald-600 mb-1">Doubao Access Token</label>
                    <input 
                      type="password" 
                      value={settings.doubaoKey}
                      onChange={(e) => setSettings({...settings, doubaoKey: e.target.value})}
                      placeholder="Your Access Token"
                      className="w-full text-sm p-2 border border-emerald-200 rounded focus:ring-2 focus:ring-emerald-500 outline-none font-mono"
                    />
                 </div>
                 <div>
                    <label className="block text-xs font-semibold text-emerald-600 mb-1">Doubao Voice Model (音色)</label>
                    <select
                      value={settings.doubaoVoice}
                      onChange={(e) => setSettings({...settings, doubaoVoice: e.target.value})}
                      className="w-full text-sm p-2 border border-emerald-200 rounded focus:ring-2 focus:ring-emerald-500 outline-none bg-white"
                    >
                      {DOUBAO_VOICES.map(v => (
                        <option key={v.id} value={v.id}>{v.name}</option>
                      ))}
                    </select>
                 </div>
                 
                 {/* Cache Management */}
                 <div className="pt-4 border-t border-emerald-100">
                    <h5 className="text-xs font-bold text-slate-500 flex items-center gap-2 mb-2">
                      <Database className="w-3 h-3" /> 历史记录缓存管理
                    </h5>
                    
                    <div className="max-h-40 overflow-y-auto space-y-1 mb-2 custom-scrollbar pr-1">
                      {history.length === 0 ? (
                        <p className="text-xs text-slate-400 italic">暂无历史记录</p>
                      ) : (
                        history.map(item => (
                          <div key={item.id} className="flex justify-between items-center p-2 bg-slate-50 rounded border border-slate-100">
                            <div className="overflow-hidden">
                              <p className="text-xs font-medium text-slate-700 truncate w-40">{item.title}</p>
                              <p className="text-[10px] text-slate-400">{item.date}</p>
                            </div>
                            <button 
                              onClick={() => handleClearUnitCache(item)}
                              disabled={clearingId === item.id}
                              className="text-xs text-slate-400 hover:text-red-500 p-1.5 hover:bg-red-50 rounded transition-colors"
                              title="清除该记录的音频缓存"
                            >
                              {clearingId === item.id ? <span className="animate-spin">...</span> : <Trash2 className="w-3 h-3"/>}
                            </button>
                          </div>
                        ))
                      )}
                    </div>

                    <button 
                      onClick={handleClearAllCache}
                      className="w-full text-xs text-red-500 hover:bg-red-50 p-2 rounded flex items-center justify-center gap-1 transition-colors border border-dashed border-red-200 mt-2"
                    >
                      {cacheStatus === '已清空' ? <Check className="w-3 h-3"/> : <Trash2 className="w-3 h-3"/>}
                      {cacheStatus || '一键清空所有缓存'}
                    </button>
                 </div>
              </div>

            </div>
          </section>

        </div>

        {/* Footer */}
        <div className="p-5 border-t border-slate-100 bg-slate-50 flex justify-end">
          <button 
            onClick={handleSave}
            className="flex items-center gap-2 px-6 py-2.5 bg-indigo-600 text-white font-semibold rounded-lg hover:bg-indigo-700 transition-colors shadow-lg shadow-indigo-200"
          >
            <Save className="w-4 h-4" /> 保存设置
          </button>
        </div>
      </div>
    </div>
  );
};

const SettingsIcon = () => (
  <svg className="w-5 h-5 text-indigo-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
  </svg>
);
