
import { AppSettings } from '../types';

const STORAGE_KEY = 'postgrad_eng_settings_v1';

export const DEFAULT_SETTINGS: AppSettings = {
  llmProvider: 'gemini',
  ttsProvider: 'browser', // Default to browser to ensure it works without keys
  geminiKey: '', // Will fallback to process.env in service if empty
  deepseekKey: '',
  doubaoAppId: '',
  doubaoToken: '',
  doubaoVoiceId: 'BV001_streaming', // Use a standard streaming voice by default
  doubaoSpeed: 1.0,
};

export const getSettings = (): AppSettings => {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      return { ...DEFAULT_SETTINGS, ...JSON.parse(saved) };
    }
  } catch (e) {
    console.error('Failed to load settings', e);
  }
  return DEFAULT_SETTINGS;
};

export const saveSettings = (settings: AppSettings) => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
};
