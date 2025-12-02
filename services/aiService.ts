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

// --- TTS Services ---

// Doubao/Volcengine TTS using WebSocket (Bypasses CORS)
const callDoubaoTTS = (text: string, settings: any): Promise<Uint8Array> => {
  return new Promise((resolve, reject) => {
    if (!settings.doubaoAppId || !settings.doubaoToken) {
      return reject(new Error("请在设置中配置豆包 AppID 和 Token"));
    }

    const socket = new WebSocket('wss://openspeech.bytedance.com/api/v1/tts/ws_binary');
    const audioChunks: Uint8Array[] = [];

    socket.binaryType = 'arraybuffer';

    socket.onopen = () => {
      const reqId = crypto.randomUUID();
      const payload = JSON.stringify({
        app: {
          appid: settings.doubaoAppId,
          token: settings.doubaoToken,
          cluster: 'volcano_tts'
        },
        user: { uid: 'web_user' },
        audio: {
          voice_type: settings.doubaoVoiceId,
          encoding: 'pcm',
          speed_ratio: settings.doubaoSpeed || 1.0,
          rate: 24000
        },
        request: {
          reqid: reqId,
          text: text,
          operation: 'submit' // Important: submit for streaming
        }
      });

      // Construct Header (4 bytes)
      // Byte 0: Version (4 bits) | Header Size (4 bits) -> 0x1 | 0x1 = 0x11
      // Byte 1: Msg Type (4 bits) | Flags (4 bits) -> 0x1 (Full Client Req) | 0x0 = 0x10
      // Byte 2: Serialization (4 bits) | Compression (4 bits) -> 0x1 (JSON) | 0x0 (None) = 0x10
      // Byte 3: Reserved = 0x00
      const header = new Uint8Array([0x11, 0x10, 0x10, 0x00]);

      // Encode Payload
      const encoder = new TextEncoder();
      const payloadBytes = encoder.encode(payload);

      // Combine
      const message = new Uint8Array(header.length + payloadBytes.length);
      message.set(header, 0);
      message.set(payloadBytes, header.length);

      socket.send(message);
    };

    socket.onmessage = (event) => {
      const buffer = event.data as ArrayBuffer;
      const view = new DataView(buffer);
      // Byte 0: Version/HeaderSize
      const headerSize = (view.getUint8(0) & 0x0F) * 4; 
      // Byte 1: MsgType/Flags
      const msgType = (view.getUint8(1) >> 4); 
      const flags = (view.getUint8(1) & 0x0F); 
      
      // MsgType 0xB (11) is Audio-only server response
      if (msgType === 0xB) { 
        // Payload is raw audio (PCM)
        const audioData = new Uint8Array(buffer.slice(headerSize));
        if (audioData.length > 0) {
           audioChunks.push(audioData);
        }

        // Flags: 0=no seq, 1=seq>0, 2=neg seq (last), 3=neg seq (last)
        if (flags >= 2) { 
           socket.close();
           resolve(mergeBuffers(audioChunks));
        }
      } else if (msgType === 0xF) { // Error message
        const decoder = new TextDecoder();
        const errorMsg = decoder.decode(buffer.slice(headerSize));
        console.error("Doubao WS Error Payload:", errorMsg);
        socket.close();
        reject(new Error(`Doubao Error: ${errorMsg}`));
      }
    };

    socket.onerror = (e) => {
      console.error("WebSocket Error", e);
      reject(new Error("WebSocket connection failed. Check console for details."));
    };
    
    // Safety timeout (30s)
    setTimeout(() => {
        if (socket.readyState !== WebSocket.CLOSED) {
            socket.close();
            if (audioChunks.length > 0) {
                 resolve(mergeBuffers(audioChunks)); // Resolve with what we have
            } else {
                 reject(new Error("TTS Timeout"));
            }
        }
    }, 30000); 
  });
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
    for (const text of texts) {
      const buffer = await fetchRawAudio(text);
      buffers.push(buffer);
      // Optional: Add small silence?
    }
    
    const merged = mergeBuffers(buffers);
    const blob = createWavBlob(merged, 24000);
    return URL.createObjectURL(blob);
  } catch (error) {
    console.error("Full Text Generation Error", error);
    throw error;
  }
};