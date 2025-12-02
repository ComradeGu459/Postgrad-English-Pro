import { GoogleGenAI, Modality } from "@google/genai";
import { pcmToWav } from '../utils/audioUtils';

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

export const translateText = async (text: string): Promise<string> => {
  if (!text.trim()) return "";
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: `Translate the following English text into Chinese. Keep sentences aligned. Text: \n\n${text}`,
    });
    return response.text || "";
  } catch (error) {
    console.error("Translation Error:", error);
    throw new Error("Failed to translate text.");
  }
};

export const analyzeGrammar = async (text: string, sentenceCount: number): Promise<string[]> => {
  if (!text.trim()) return [];
  try {
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

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
    });
    
    const rawText = response.text || "";
    const cleanText = rawText.replace(/```html|```/g, '').trim();
    return cleanText.split('|||').map(s => s.trim());
  } catch (error) {
    console.error("Grammar Analysis Error:", error);
    throw new Error("Failed to analyze grammar.");
  }
};

export const analyzeTerm = async (term: string): Promise<string> => {
  try {
    // Using the specific prompt for Postgrad English
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
    - Keep it compact but visually rich.
    `;

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
    });
    return response.text?.replace(/```html|```/g, '').trim() || "";
  } catch (error) {
    console.error("Term Analysis Error:", error);
    return `<div class="text-red-500">AI 解析失败: ${error}<br/>请检查网络设置。</div>`;
  }
};

export const generateSpeechUrl = async (text: string): Promise<string> => {
  try {
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
    if (!audioContent) throw new Error("No audio content received.");

    return pcmToWav(audioContent);
  } catch (error) {
    console.error("TTS Generation Error:", error);
    throw new Error("Failed to generate speech.");
  }
};