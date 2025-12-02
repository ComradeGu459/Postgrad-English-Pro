import { GoogleGenAI, Modality } from "@google/genai";
import { pcmToWav, decodeBase64, mergeBuffers, createWavBlob } from '../utils/audioUtils';
import { getSettings } from '../utils/storage';
import { AppSettings } from '../types';

// --- Helpers ---
const getGeminiClient = (key?: string) => {
  // Safety check for process.env to prevent white screen crashes in strict browser environments
  const envKey = typeof process !== 'undefined' ? process.env.API_KEY : '';
  const finalKey = key || envKey;
  
  if (!finalKey) {
     console.warn("Gemini API Key is missing. Please configure it in settings or environment.");
     // We return a client that will likely fail on calls, but we don't crash the app initialization
  }
  return new GoogleGenAI({ apiKey: finalKey || 'DUMMY_KEY_FOR_INIT' });
};

// --- LLM Services ---

const callDeepSeek = async (messages: any[], apiKey: string) => {
  if (!apiKey) throw new Error("请在设置中配置 DeepSeek API Key");
  
  const response = await fetch('https://api.deepseek.com/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: "deepseek-chat",
      messages: messages,
      stream: false
    })
  });

  if (!response.ok) {
    const err = await response.json();
    throw new Error(err.error?.message || "DeepSeek API Error");
  }

  const data = await response.json();
  return data.choices?.[0]?.message?.content || "";
};

const callGeminiText = async (prompt: string, apiKey: string) => {
  const ai = getGeminiClient(apiKey);
  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash',
    contents: prompt,
  });
  return response.text || "";
};

export const translateText = async (text: string): Promise<string> => {
  if (!text.trim()) return "";
  const settings = getSettings();

  const systemPrompt = `Translate the following English text into Chinese. Keep sentences aligned and strictly maintain the number of lines.`;
  const userPrompt = `Text:\n\n${text}`;

  try {
    if (settings.llmProvider === 'deepseek') {
      return await callDeepSeek([
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
      ], settings.deepseekKey);
    } else {
      return await callGeminiText(`${systemPrompt}\n${userPrompt}`, settings.geminiKey);
    }
  } catch (error: any) {
    console.error("Translation Error:", error);
    throw new Error(`Translation failed: ${error.message}`);
  }
};

export const analyzeGrammar = async (text: string, sentenceCount: number): Promise<string[]> => {
  if (!text.trim()) return [];
  const settings = getSettings();

  const prompt = `
    Task: Analyze these ${sentenceCount} sentences for a Chinese postgraduate student.
    Output format: A list separated by "|||".
    For each sentence, return a HTML string (no markdown):
    <div class="text-sm">
      <div class="mb-1"><span class="font-bold text-indigo-700">【语法核心】</span> ...</div>
      <div><span class="font-bold text-indigo-700">【重点词汇】</span> ...</div>
    </div>
    
    Text:
    ${text}
    `;

  try {
    let rawText = "";
    if (settings.llmProvider === 'deepseek') {
      rawText = await callDeepSeek([
        { role: "system", content: "You are a helpful English tutor." },
        { role: "user", content: prompt }
      ], settings.deepseekKey);
    } else {
      rawText = await callGeminiText(prompt, settings.geminiKey);
    }

    const cleanText = rawText.replace(/```html|```/g, '').trim();
    return cleanText.split('|||').map(s => s.trim());
  } catch (error: any) {
    console.error("Grammar Analysis Error:", error);
    throw new Error(`Analysis failed: ${error.message}`);
  }
};

export const analyzeTerm = async (term: string): Promise<string> => {
  const settings = getSettings();
  const prompt = `
    Role: 考研英语阅卷组长 / Public Administration Expert.
    Task: Analyze the word/phrase "${term}".
    Output Format: **Pure HTML string** (no markdown fences like \`\`\`html). 
    
    Requirements:
    1. Use Tailwind CSS classes for styling.
    2. Structure:
       - **Header**: Phonetic symbols (IPA) and Part of Speech.
       - **Section 1: 考研核心释义**: Focus on academic/formal meanings used in reading comprehension. Highlight "熟词僻义" (uncommon meanings of common words) if any.
       - **Section 2: 语境例句 (公共管理/学术)**: Provide one sophisticated sentence.
       - **Section 3: 写作加分替换**: Provide synonyms that get higher scores in writing (e.g., use 'necessitate' instead of 'need').
       - **Section 4: 记忆与搭配**: Collocations or mnemonics.
    
    Styling Guide:
    - Use <div class="mb-4"> for sections.
    - Use <span class="bg-indigo-100 text-indigo-800 px-1 rounded font-bold"> for key terms.
    - Use <p class="text-slate-600"> for explanations.
    - Use <h4 class="font-bold text-indigo-700 mb-2"> for subtitles.
  `;

  try {
    let result = "";
    if (settings.llmProvider === 'deepseek') {
       result = await callDeepSeek([
         { role: "system", content: "You are an expert English teacher." },
         { role: "user", content: prompt }
       ], settings.deepseekKey);
    } else {
       result = await callGeminiText(prompt, settings.geminiKey);
    }
    return result.replace(/```html|```/g, '').trim();
  } catch (error: any) {
    return `<div class="text-red-500">解析失败 (${settings.llmProvider}): ${error.message}</div>`;
  }
};

// --- TTS Services ---

const callGeminiTTS = async (text: string, apiKey: string): Promise<Uint8Array> => {
  const ai = getGeminiClient(apiKey);
  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash-preview-tts",
    contents: [{ parts: [{ text }] }],
    config: {
      responseModalities: [Modality.AUDIO],
      speechConfig: {
        voiceConfig: {
          prebuiltVoiceConfig: { voiceName: 'Kore' },
        },
      },
    },
  });

  const audioContent = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
  if (!audioContent) throw new Error("No audio content received from Gemini.");
  return decodeBase64(audioContent);
};

const callDoubaoTTS = async (text: string, apiKey: string, voice: string): Promise<Uint8Array> => {
  if (!apiKey) throw new Error("请在设置中配置豆包 API Key");
  
  const url = 'https://openspeech.bytedance.com/api/v3/tts/unidirectional';
  
  // Standard Resource ID for BigTTS as per documentation
  const resourceId = 'volc.service_type.10029'; 

  // Config params for Doubao engine optimization
  const additionsObj = {
    disable_markdown_filter: true,
    enable_language_detector: true,
    enable_latex_tn: true,
    disable_default_bit_rate: true,
    max_length_to_filter_parenthesis: 0,
    cache_config: { text_type: 1, use_cache: true }
  };

  const payload = {
    user: {
      uid: "postgrad_user"
    },
    req_params: {
      text: text,
      speaker: voice, 
      additions: JSON.stringify(additionsObj), 
      audio_params: {
        format: 'pcm', 
        sample_rate: 24000
      }
    }
  };

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // Note the semicolon: 'Bearer; token' is often required by ByteDance APIs
        'Authorization': `Bearer; ${apiKey}`,
        'X-Api-Resource-Id': resourceId
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      let errMsg = `Doubao API Error: ${response.status}`;
      try {
        const errJson = await response.json();
        if (errJson.message) errMsg += ` - ${errJson.message}`;
        if (errJson.code) errMsg += ` (Code: ${errJson.code})`;
      } catch(e) {
         // ignore JSON parse error
         const textBody = await response.text();
         if(textBody) errMsg += ` - ${textBody.substring(0, 100)}`;
      }
      throw new Error(errMsg);
    }

    const arrayBuffer = await response.arrayBuffer();
    return new Uint8Array(arrayBuffer);
  } catch (e: any) {
    // Check for potential CORS/Network errors which often appear as "Failed to fetch"
    if (e.message === 'Failed to fetch') {
       throw new Error("网络请求失败 (CORS)。请检查 API Key 是否正确，或尝试更换网络环境。如果问题持续，可能是浏览器跨域限制导致的。");
    }
    throw e;
  }
};

// --- Public TTS APIs ---

export const fetchRawAudio = async (text: string): Promise<Uint8Array> => {
  const settings = getSettings();
  if (settings.ttsProvider === 'gemini') {
    return await callGeminiTTS(text, settings.geminiKey);
  } else if (settings.ttsProvider === 'doubao') {
    return await callDoubaoTTS(text, settings.doubaoKey, settings.doubaoVoice);
  } else {
    throw new Error("Browser TTS does not support raw audio fetching. Use Cloud TTS (Gemini/Doubao).");
  }
};

export const generateSpeechUrl = async (text: string): Promise<string> => {
  try {
    const rawBuffer = await fetchRawAudio(text);
    const blob = createWavBlob(rawBuffer, 24000);
    return URL.createObjectURL(blob);
  } catch (error: any) {
    console.error("TTS Generation Error:", error);
    throw error;
  }
};

export const generateFullTextAudio = async (texts: string[], onProgress?: (current: number, total: number) => void): Promise<string> => {
  try {
    const buffers: Uint8Array[] = [];
    let processed = 0;
    
    for (const text of texts) {
      if (onProgress) onProgress(processed + 1, texts.length);
      const buffer = await fetchRawAudio(text);
      buffers.push(buffer);
      processed++;
    }
    
    const merged = mergeBuffers(buffers);
    const blob = createWavBlob(merged, 24000);
    return URL.createObjectURL(blob);
  } catch (error) {
    console.error("Full Text Generation Error", error);
    throw error;
  }
};