import { GoogleGenAI, Modality } from "@google/genai";
import { pcmToWav, decodeBase64, mergeBuffers, createWavBlob } from '../utils/audioUtils';
import { getSettings } from '../utils/storage';
import { AppSettings } from '../types';

// --- Helpers ---
const getGeminiClient = (key?: string) => {
  const finalKey = key || process.env.API_KEY;
  if (!finalKey) throw new Error("Missing Gemini API Key");
  return new GoogleGenAI({ apiKey: finalKey });
};

// Polyfill for UUID
const uuidv4 = () => {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
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

// Doubao/Volcengine TTS using V3 WebSocket Protocol (unidirectional/stream)
const callDoubaoTTS = (text: string, settings: AppSettings): Promise<Uint8Array> => {
  return new Promise((resolve, reject) => {
    if (!settings.doubaoAppId || !settings.doubaoToken) {
      return reject(new Error("请在设置中配置豆包 AppID 和 Token"));
    }

    const voice = settings.doubaoVoiceId || 'BV001_streaming';
    const speed = settings.doubaoSpeed || 1.0;
    // Default to 'seed-tts-1.0' or specific resource if needed. 
    // Using character version default from docs if not specified.
    const resourceId = 'volc.service_type.10029';

    // Construct V3 WebSocket URL
    // We use query parameters to pass authentication because standard Browser WebSocket API 
    // does not support custom headers.
    const wsUrl = new URL('wss://openspeech.bytedance.com/api/v3/tts/unidirectional/stream');
    wsUrl.searchParams.append('appid', settings.doubaoAppId);
    wsUrl.searchParams.append('access_token', settings.doubaoToken);
    wsUrl.searchParams.append('resource_id', resourceId);

    console.log("Connecting to Doubao TTS V3:", wsUrl.toString().replace(settings.doubaoToken, '***'));

    const socket = new WebSocket(wsUrl.toString());
    socket.binaryType = 'arraybuffer';
    
    const audioChunks: Uint8Array[] = [];
    let hasError = false;

    socket.onopen = () => {
      const reqId = uuidv4();
      
      const payload = {
        user: { 
            uid: 'web_user_' + Math.floor(Math.random() * 10000) 
        },
        req_params: {
          text: text,
          speaker: voice,
          audio_params: {
            format: 'pcm', // Using PCM for seamless merging
            sample_rate: 24000,
            speed_ratio: speed,
          },
          reqid: reqId
        }
      };

      const requestJson = JSON.stringify(payload);
      const requestBytes = new TextEncoder().encode(requestJson);

      // V3 Protocol Frame Construction
      // [Header 4B] + [Payload Size 4B] + [Payload]
      
      // Header: 0x11101000
      // Byte 0: 0x11 (Ver 1, Header Size 4)
      // Byte 1: 0x10 (MsgType 1 [Full Client Req], Flags 0)
      // Byte 2: 0x10 (Serial 1 [JSON], Comp 0 [None])
      // Byte 3: 0x00 (Reserved)
      const header = new Uint8Array([0x11, 0x10, 0x10, 0x00]);
      
      const len = requestBytes.length;
      const sizeBytes = new Uint8Array(4);
      new DataView(sizeBytes.buffer).setUint32(0, len, false); // Big Endian

      const frame = new Uint8Array(header.length + sizeBytes.length + requestBytes.length);
      frame.set(header, 0);
      frame.set(sizeBytes, header.length);
      frame.set(requestBytes, header.length + sizeBytes.length);
      
      socket.send(frame);
    };

    socket.onmessage = (event) => {
      const buffer = event.data as ArrayBuffer;
      const view = new DataView(buffer);
      
      // Basic V3 Frame Parsing
      // 0-3: Header
      // 4-7: Payload Size
      // 8...: Payload
      
      const msgType = view.getUint8(1) >> 4;
      const payloadSize = view.getUint32(4, false); // Big Endian
      
      if (msgType === 0xB) { // 0xB (11) = Audio Response
        // Payload Structure for Audio (MsgType 0xB):
        // [4B Event Code] + [4B SessionID Len] + [SessionID] + [4B Audio Len] + [Audio Data]
        
        // 1. Skip Header (4) + Size (4) -> Offset 8
        let offset = 8;
        
        // 2. Read Event Code (Should be 352 for Audio, or others)
        // const eventCode = view.getUint32(offset, false); 
        offset += 4;
        
        // 3. Read Session ID Length
        const sessionIdLen = view.getUint32(offset, false);
        offset += 4;
        
        // 4. Skip Session ID
        offset += sessionIdLen;
        
        // 5. Read Audio Length
        const audioLen = view.getUint32(offset, false);
        offset += 4;
        
        // 6. Extract Audio
        if (offset + audioLen <= buffer.byteLength) {
            const audioData = new Uint8Array(buffer.slice(offset, offset + audioLen));
            audioChunks.push(audioData);
        }
        
      } else if (msgType === 0xF) { // 0xF (15) = Error
        // Payload Structure for Error:
        // [4B Error Code] + [Error Message Length 4B] + [Error Message]
        // Note: The structure varies, but usually payload contains the error info.
        // Let's interpret the payload as a string for safety if possible, or parsing the JSON/Structure.
        // Assuming standard error payload is JSON or String inside.
        // Actually, V3 Error payload: [4B Code] + [Payload]
        const errCode = view.getUint32(8, false);
        const decoder = new TextDecoder();
        // Try decoding the rest of payload
        const msgBytes = new Uint8Array(buffer.slice(12)); 
        const errMsg = decoder.decode(msgBytes);
        console.error(`Doubao TTS Error (Code ${errCode}): ${errMsg}`);
        hasError = true;
        socket.close();
        reject(new Error(`Doubao API Error ${errCode}: ${errMsg}`));
      }
      
      // Check for last frame?
      // V3 usually relies on connection close or specific event for stream end.
      // However, for Unidirectional, the server often closes after sending.
    };

    socket.onerror = (e) => {
      console.error("WebSocket Error:", e);
      if (!hasError) {
        hasError = true;
        reject(new Error("WebSocket connection failed. Please check AppID/Token."));
      }
    };
    
    socket.onclose = (e) => {
        if (!hasError) {
            if (audioChunks.length > 0) {
                resolve(mergeBuffers(audioChunks));
            } else {
                reject(new Error(`Connection closed without audio (Code: ${e.code}).`));
            }
        }
    };

    // Timeout protection (15s)
    setTimeout(() => {
        if (socket.readyState !== WebSocket.CLOSED) {
            socket.close();
            if (audioChunks.length > 0 && !hasError) {
                 resolve(mergeBuffers(audioChunks)); 
            } else if (!hasError) {
                 reject(new Error("TTS request timed out (15s)"));
            }
        }
    }, 15000); 
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