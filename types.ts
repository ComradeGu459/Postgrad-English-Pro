export interface SentencePair {
  text: string;
  trans: string;
  grammar: string;
}

export interface HistoryItem {
  id: number;
  title: string;
  text: string;
  date: string;
}

export interface DailyStats {
  day: string;
  sentences: number;
}

export type LLMProvider = 'gemini' | 'deepseek';
export type TTSProvider = 'browser' | 'gemini' | 'doubao';

export interface AppSettings {
  llmProvider: LLMProvider;
  ttsProvider: TTSProvider;
  
  // Keys
  geminiKey: string;
  deepseekKey: string;
  doubaoKey: string;
  
  // Config
  doubaoVoice: string;
}