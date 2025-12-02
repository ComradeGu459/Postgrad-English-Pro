
import { GoogleGenAI, Modality } from "@google/genai";
import { pcmToWav, decodeBase64, mergeBuffers, createWavBlob } from '../utils/audioUtils';
import { getSettings } from '../utils/storage';
import { AppSettings } from '../types';

const TTS_CACHE_NAME = 'postgrad-doubao-tts-v1';

// --- Helpers ---

/**
 * Consistent sentence splitting logic used by both App (Player) and Cache Manager.
 */
export const splitSentences = (txt: string): string[] => {
    if (!txt) return [];
    return (txt.match(/[^.!?\n]+[.!?\n]?/g) || [txt])
      .map(s => s.trim())
      .filter(s => s.length > 0);
};

const getGeminiClient = (key?: string) => {
  // Safety check for process.env to prevent white screen crashes in strict browser environments
  const envKey = typeof process !== 'undefined' ? process.env.API_KEY : '';
  const finalKey = key || envKey;
  
  if (!finalKey) {
     console.warn("Gemini API Key is missing. Please configure it in settings or environment.");
  }
  return new GoogleGenAI({ apiKey: finalKey || 'DUMMY_KEY_FOR_INIT' });
};

const uuidv4 = () => {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
};

/**
 * Generates a unique cache key (Fake URL) based on the request parameters.
 */
const getCacheKey = (text: string, voice: string, speed: number = 1.0) => {
  const encodedText = encodeURIComponent(text);
  return `https://local-tts-cache.app/doubao?text=${encodedText}&voice=${voice}&speed=${speed}`;
};

/**
 * Clear ALL TTS Cache.
 */
export const clearAllTTSCache = async () => {
  if (!('caches' in window)) return;
  await caches.delete(TTS_CACHE_NAME);
  console.log('TTS Cache completely cleared.');
};

/**
 * Clears cache for a specific "History Unit" (Paragraph).
 * It splits the paragraph into sentences and removes audio for each sentence.
 * @returns Number of audio files deleted.
 */
export const clearUnitCache = async (fullText: string): Promise<number> => {
  if (!('caches' in window)) return 0;

  const sentences = splitSentences(fullText);
  if (sentences.length === 0) return 0;

  const cache = await caches.open(TTS_CACHE_NAME);
  const keys = await cache.keys();
  
  let deletedCount = 0;

  // We need to match the "text" parameter in the URL.
  // Since we don't know the exact voice/speed used for every file, 
  // we check if the URL's text param matches any of our sentences.
  
  for (const request of keys) {
    try {
      const url = new URL(request.url);
      const cachedText = url.searchParams.get('text'); // Automatically decodes
      
      if (cachedText && sentences.includes(cachedText)) {
        await cache.delete(request);
        deletedCount++;
      }
    } catch (e) {
      console.warn("Error parsing cache key", e);
    }
  }
  
  return deletedCount;
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

// V1 HTTP API Implementation for Doubao with Persistent Caching
const callDoubaoTTS = async (text: string, apiKey: string, appId: string, voice: string): Promise<Uint8Array> => {
  if (!apiKey || !appId) throw new Error("请在设置中配置豆包 AppID 和 Access Token");
  
  const targetUrl = 'https://weathered-doubao.comradegu.workers.dev/api/v1/tts';
  // Use default speed 1.0 for cache key, or pass it if you parameterize speed later
  const cacheKey = getCacheKey(text, voice, 1.0);

  // 1. Check Cache
  if ('caches' in window) {
    try {
      const cache = await caches.open(TTS_CACHE_NAME);
      const cachedResponse = await cache.match(cacheKey);
      
      if (cachedResponse) {
        console.log(`[Doubao TTS] 命中本地缓存 (0流量): "${text.substring(0, 15)}..."`);
        const arrayBuffer = await cachedResponse.arrayBuffer();
        return new Uint8Array(arrayBuffer);
      }
    } catch (e) {
      console.warn("Cache read failed, falling back to network", e);
    }
  }

  // 2. Fetch from Network (Worker)
  const reqId = uuidv4();
  const payload = {
    app: {
      appid: appId,
      token: "access_token",
      cluster: "volcano_tts"
    },
    user: {
      uid: "web_user"
    },
    audio: {
      voice_type: voice || 'zh_male_guozhoudege_moon_bigtts',
      encoding: "mp3", 
      speed_ratio: 1.0,
    },
    request: {
      reqid: `uuid_${reqId}`,
      text: text,
      operation: "query" 
    }
  };

  try {
    const response = await fetch(targetUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer; ${apiKey}` 
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      let errMsg = `Doubao API Error: ${response.status}`;
      try {
        const errJson = await response.json();
        if (errJson.message) errMsg += ` - ${errJson.message}`;
      } catch(e) { /* ignore */ }
      throw new Error(errMsg);
    }

    const data = await response.json();
    
    if (data.code !== 3000) {
      throw new Error(`Doubao API Error (${data.code}): ${data.message || 'Unknown Error'}`);
    }

    if (!data.data) {
      throw new Error("No audio data received from Doubao API");
    }

    const audioData = decodeBase64(data.data);

    // 3. Save to Cache
    if ('caches' in window) {
      try {
        const cache = await caches.open(TTS_CACHE_NAME);
        // Create a proper response object to store
        const resToCache = new Response(audioData, {
          headers: {
            'Content-Type': 'audio/mpeg',
            'X-Doubao-Voice': voice
          }
        });
        await cache.put(cacheKey, resToCache);
        console.log(`[Doubao TTS] 已缓存音频: "${text.substring(0, 15)}..."`);
      } catch (e) {
        console.warn("Cache write failed", e);
      }
    }

    return audioData;

  } catch (e: any) {
    if (e.message.includes('Failed to fetch')) {
       throw new Error("网络请求失败。请检查 Token 是否正确或 Worker 是否可用。");
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
    return await callDoubaoTTS(
      text, 
      settings.doubaoKey, 
      settings.doubaoAppId, 
      settings.doubaoVoice
    );
  } else {
    throw new Error("Browser TTS does not support raw audio fetching. Use Cloud TTS (Gemini/Doubao).");
  }
};

export const generateSpeechUrl = async (text: string): Promise<string> => {
  try {
    const rawBuffer = await fetchRawAudio(text);
    
    const settings = getSettings();
    if (settings.ttsProvider === 'doubao') {
        const blob = new Blob([rawBuffer], { type: 'audio/mp3' });
        return URL.createObjectURL(blob);
    } else {
        const blob = createWavBlob(rawBuffer, 24000);
        return URL.createObjectURL(blob);
    }
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
    const settings = getSettings();
    const type = settings.ttsProvider === 'doubao' ? 'audio/mp3' : 'audio/wav';
    
    if (type === 'audio/wav') {
         const blob = createWavBlob(merged, 24000);
         return URL.createObjectURL(blob);
    } else {
         const blob = new Blob([merged], { type: 'audio/mp3' });
         return URL.createObjectURL(blob);
    }

  } catch (error) {
    console.error("Full Text Generation Error", error);
    throw error;
  }
};
