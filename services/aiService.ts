
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

const uuidv4 = () => {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
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

// V1 HTTP API Implementation for Doubao via Specific Worker
const callDoubaoTTS = async (text: string, apiKey: string, appId: string, voice: string): Promise<Uint8Array> => {
  if (!apiKey || !appId) throw new Error("请在设置中配置豆包 AppID 和 Access Token");
  
  // Specific Worker URL provided
  const targetUrl = 'https://weathered-doubao.comradegu.workers.dev/api/v1/tts';
  const reqId = uuidv4();

  // Strict JSON Body Structure
  const payload = {
    app: {
      appid: appId,
      token: "access_token", // "Fake token" usually, real auth in header
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
        // Crucial: Bearer and token separated by semicolon
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
    
    // V1 API response validation
    if (data.code !== 3000) {
      throw new Error(`Doubao API Error (${data.code}): ${data.message || 'Unknown Error'}`);
    }

    if (!data.data) {
      throw new Error("No audio data received from Doubao API");
    }

    return decodeBase64(data.data);

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
    // Note: If using mp3 from Doubao, we might want to return a blob with audio/mp3
    // But createWavBlob wraps it in a wav container or we can just use the raw bytes if mp3
    // For simplicity in this app structure, we convert to blob. 
    // If the source is MP3, wrapping in WAV header is technically wrong but often works or we should just make a blob.
    
    // Let's create a generic audio blob to support MP3/WAV
    const settings = getSettings();
    if (settings.ttsProvider === 'doubao') {
        // Doubao returns MP3 based on our config above.
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
    
    // Note: Simple concatenation of MP3 files works reasonably well in many players but isn't spec-perfect.
    // For WAV (Gemini), mergeBuffers works perfectly.
    const merged = mergeBuffers(buffers);
    const settings = getSettings();
    const type = settings.ttsProvider === 'doubao' ? 'audio/mp3' : 'audio/wav';
    
    // If WAV, add header. If MP3, raw concat.
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
