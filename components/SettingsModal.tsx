import React, { useState, useEffect } from 'react';
import { X, Save, Key, Server, Mic, Cpu } from 'lucide-react';
import { AppSettings, LLMProvider, TTSProvider } from '../types';
import { getSettings, saveSettings } from '../utils/storage';

interface SettingsModalProps {
  onClose: () => void;
  onSave: () => void;
}

const DOUBAO_VOICES = [
  { id: 'BV001_streaming', name: 'BV001 (English Male - BigTTS)' },
  { id: 'BV002_streaming', name: 'BV002 (English Female - BigTTS)' },
  { id: 'zh_female_cancan_mars_bigtts', name: 'Cancan (Chinese/Eng - Recommended)' },
  { id: 'zh_male_yuanbo_moon_bigtts', name: 'Yuanbo (Chinese/Eng Male)' },
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
                    className={`py-2 px-1 text-xs font-medium rounded-md transition-all ${settings.ttsProvider === 'doubao' ? 'bg-white text-pink-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                  >
                    豆包
                  </button>
                </div>
              </div>
            </div>
          </section>

          {/* API Keys Config */}
          <section>
             <h4 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-4 flex items-center gap-2">
              <Key className="w-4 h-4" /> 密钥配置 (API Keys)
            </h4>
            <div className="space-y-4 bg-slate-50 p-4 rounded-xl border border-slate-100">
              {/* Gemini */}
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

              {/* DeepSeek */}
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

              {/* Doubao */}
              <div className={`grid grid-cols-2 gap-4 ${settings.ttsProvider === 'doubao' ? 'block' : 'opacity-50'}`}>
                 <div className="col-span-2 md:col-span-1">
                    <label className="block text-xs font-semibold text-pink-600 mb-1">Volcengine AppID</label>
                    <input 
                      type="text" 
                      value={settings.doubaoAppId}
                      onChange={(e) => setSettings({...settings, doubaoAppId: e.target.value})}
                      placeholder="e.g. BigTTS200..."
                      className="w-full text-sm p-2 border border-pink-200 rounded focus:ring-2 focus:ring-pink-500 outline-none font-mono"
                    />
                 </div>
                 <div className="col-span-2 md:col-span-1">
                    <label className="block text-xs font-semibold text-pink-600 mb-1">Access Token</label>
                    <input 
                      type="password" 
                      value={settings.doubaoToken}
                      onChange={(e) => setSettings({...settings, doubaoToken: e.target.value})}
                      placeholder="Volcengine Access Token"
                      className="w-full text-sm p-2 border border-pink-200 rounded focus:ring-2 focus:ring-pink-500 outline-none font-mono"
                    />
                 </div>
                 <p className="col-span-2 text-[10px] text-slate-400 leading-normal">
                    注意：请确保已在火山引擎控制台开通 <b>语音合成</b> 服务，并绑定 BigTTS 试用包。<br/>
                    本应用使用 V3 协议，需确保 Token 权限正确。
                 </p>
              </div>
            </div>
          </section>

          {/* Voice Config (Doubao Only) */}
          {settings.ttsProvider === 'doubao' && (
            <section className="animate-in fade-in slide-in-from-top-2">
              <h4 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-4 flex items-center gap-2">
                 豆包音色参数
              </h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                 <div>
                    <label className="block text-xs font-semibold text-slate-500 mb-1">音色选择</label>
                    <select 
                      value={settings.doubaoVoiceId}
                      onChange={(e) => setSettings({...settings, doubaoVoiceId: e.target.value})}
                      className="w-full text-sm p-2 border border-slate-300 rounded focus:ring-2 focus:ring-pink-500 outline-none"
                    >
                      {DOUBAO_VOICES.map(v => (
                        <option key={v.id} value={v.id}>{v.name}</option>
                      ))}
                    </select>
                 </div>
                 <div>
                    <label className="block text-xs font-semibold text-slate-500 mb-1">语速 (0.8 - 1.5)</label>
                    <input 
                      type="range"
                      min="0.8"
                      max="1.5"
                      step="0.1"
                      value={settings.doubaoSpeed}
                      onChange={(e) => setSettings({...settings, doubaoSpeed: parseFloat(e.target.value)})}
                      className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-pink-500 mt-2"
                    />
                    <div className="text-xs text-right text-slate-400">{settings.doubaoSpeed}x</div>
                 </div>
              </div>
            </section>
          )}

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