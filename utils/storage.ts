
import { AppSettings } from '../types';

const STORAGE_KEY = 'postgrad_eng_settings_v2';

export const DEFAULT_SETTINGS: AppSettings = {
  llmProvider: 'gemini',
  ttsProvider: 'browser', // Default to browser to ensure it works without keys
  geminiKey: '', // Will fallback to process.env in service if empty
  deepseekKey: '',
  doubaoKey: '',
  doubaoVoice: 'BV001_streaming', // Default Doubao voice
};

export const getSettings = (): AppSettings => {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      // Migration: ensure new fields exist if loading old settings
      return { ...DEFAULT_SETTINGS, ...parsed };
    }
  } catch (e) {
    console.error('Failed to load settings', e);
  }
  return DEFAULT_SETTINGS;
};

export const saveSettings = (settings: AppSettings) => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
};