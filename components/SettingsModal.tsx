
import React, { useState } from 'react';
import { X, Save, Key, Server, Mic, Cpu, Globe } from 'lucide-react';
import { AppSettings } from '../types';
import { getSettings, saveSettings } from '../utils/storage';

interface SettingsModalProps {
  onClose: () => void;
  onSave: () => void;
}

const DOUBAO_VOICES = [
  { id: 'BV001_streaming', name: '通用女声 (BV001)' },
  { id: 'BV002_streaming', name: '通用男声 (BV002)' },
  { id: 'zh_female_shuangkuaisisi_moon_bigtts', name: '爽快思思 (生动/推荐)' },
  { id: 'zh_male_beijingxiaoye_emo_v2_mars_bigtts', name: '北京小爷 (情感版)' },
  { id: 'zh_female_cancan_mars_bigtts', name: '灿灿 (解说)' },
  { id: 'zh_female_zhichuxin_moon_bigtts', name: '知性楚欣 (新闻/正式)' },
  { id: 'zh_male_chunhouxiaoyu_moon_bigtts', name: '醇厚小宇 (有声书)' }
];

export const SettingsModal: React.FC<SettingsModalProps> = ({ onClose, onSave }) => {
  const [settings, setSettings] = useState<AppSettings>(getSettings());

  const handleSave = () => {
    saveSettings(settings);
    onSave();
    onClose();
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
                    <Globe className="w-3 h-3"/> CORS Proxy URL (Required for Doubao/Web)
                </label>
                <input 
                  type="text" 
                  value={settings.proxyUrl}
                  onChange={(e) => setSettings({...settings, proxyUrl: e.target.value})}
                  placeholder="https://your-worker.workers.dev/corsproxy/"
                  className="w-full text-sm p-2 border border-slate-300 rounded focus:ring-2 focus:ring-indigo-500 outline-none font-mono"
                />
                <p className="text-[10px] text-slate-400 mt-1">
                   豆包 API 不支持浏览器直接调用 (CORS)。请部署 Cloudflare Worker 并在此填入地址。
                </p>
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
                    <label className="block text-xs font-semibold text-emerald-600 mb-1">Doubao Voice Model</label>
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
