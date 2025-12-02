import { GoogleGenAI, Modality } from "@google/genai";
import { pcmToWav, decodeBase64, mergeBuffers, createWavBlob } from '../utils/audioUtils';
import { getSettings } from '../utils/storage';

// --- Helpers ---
const getGeminiClient = (key?: string) => {
  const finalKey = key || process.env.API_KEY;
  if (!finalKey) throw new Error("Missing Gemini API Key");
  return new GoogleGenAI({ apiKey: finalKey });
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

// --- TTS Services (Returning raw base64 or buffer) ---

const callDoubaoTTS = async (text: string, settings: any): Promise<Uint8Array> => {
  if (!settings.doubaoAppId || !settings.doubaoToken) {
    throw new Error("请在设置中配置豆包 AppID 和 Token");
  }

  const reqId = crypto.randomUUID();
  const response = await fetch('https://openspeech.bytedance.com/api/v1/tts', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer;${settings.doubaoToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      app: {
        appid: settings.doubaoAppId,
        token: settings.doubaoToken,
        cluster: 'volcano_tts'
      },
      user: {
        uid: 'web_user_001'
      },
      audio: {
        voice_type: settings.doubaoVoiceId,
        encoding: 'pcm',
        speed_ratio: settings.doubaoSpeed || 1.0,
        rate: 24000
      },
      request: {
        reqid: reqId,
        text: text,
        operation: 'query'
      }
    })
  });

  if (!response.ok) {
     const errText = await response.text();
     throw new Error(`Doubao API Error: ${response.status} ${errText}`);
  }

  const data = await response.json();
  if (data.code !== 3000) {
      throw new Error(`Doubao TTS Failed: ${data.message} (Code ${data.code})`);
  }

  if (!data.data) throw new Error("No audio data returned from Doubao");
  return decodeBase64(data.data);
};

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

// --- Public TTS APIs ---

export const fetchRawAudio = async (text: string): Promise<Uint8Array> => {
  const settings = getSettings();
  if (settings.ttsProvider === 'doubao') {
    return await callDoubaoTTS(text, settings);
  } else if (settings.ttsProvider === 'gemini') {
    return await callGeminiTTS(text, settings.geminiKey);
  } else {
    throw new Error("Browser TTS does not support raw audio fetching.");
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

export const generateFullTextAudio = async (texts: string[]): Promise<string> => {
  try {
    const buffers: Uint8Array[] = [];
    // Process sequentially to avoid rate limits and ensure order
    // In production, you might want to parallelize with a concurrency limit
    for (const text of texts) {
      // Small pause (silence) between sentences could be added here if needed by pushing a silence buffer
      const buffer = await fetchRawAudio(text);
      buffers.push(buffer);
      // Optional: Add 500ms silence between sentences
      // buffers.push(new Uint8Array(24000 * 0.5 * 2)); // 2 bytes per sample (16-bit)
    }
    
    const merged = mergeBuffers(buffers);
    const blob = createWavBlob(merged, 24000);
    return URL.createObjectURL(blob);
  } catch (error) {
    console.error("Full Text Generation Error", error);
    throw error;
  }
};