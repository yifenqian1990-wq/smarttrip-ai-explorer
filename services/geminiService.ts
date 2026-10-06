
// services/geminiService.ts

import { GoogleGenAI } from "@google/genai";
import { TravelPreferences, Itinerary, ChatMessage, GeminiModel, Activity, DayItinerary, GeminiConfig, PackingItem } from "../types";

const getApiErrorMessage = (error: any): string => {
  const message = error.message || "";
  if (message.includes("429") || message.includes("RESOURCE_EXHAUSTED")) return "QUOTA_EXHAUSTED";
  if (message.includes("404") || message.includes("NOT_FOUND")) return `模型不可用 (404): 请尝试切换模型。`;
  if (message.includes("400")) return `参数错误 (400): ${message}`;
  return message;
};

const extractJson = (text: string): any => {
  try {
    return JSON.parse(text);
  } catch (e) {
    const match = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
    if (match && match[1]) {
      try {
        return JSON.parse(match[1]);
      } catch (e2) {}
    }
    const firstBrace = text.indexOf('{');
    const lastBrace = text.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace !== -1) {
      try {
        return JSON.parse(text.substring(firstBrace, lastBrace + 1));
      } catch (e3) {}
    }
    return null;
  }
};

const JSON_SCHEMA_PROMPT = `
  请严格按照以下 JSON 结构输出行程：
  {
    "title": "行程标题",
    "summary": "行程摘要",
    "totalEstimatedBudget": "总预算数值(字符串)",
    "days": [
      {
        "day": 1,
        "theme": "当天主题",
        "activities": [
          { 
            "time": "09:00", 
            "title": "活动名", 
            "description": "描述", 
            "location": "详细地点", 
            "estimatedCost": "费用(纯数字字符串)", 
            "category": "交通/住宿/餐饮/门票/购物/其他",
            "lat": 0.0, 
            "lng": 0.0,
            "transportToNext": { "mode": "交通方式", "duration": "用时", "cost": "费用" }
          }
        ]
      }
    ],
    "packingList": [
      { "name": "物品名称", "category": "必备/衣物/洗漱/电子/药品/其他", "checked": false }
    ],
    "tips": ["建议1", "注意事项2"]
  }
`;

async function callWithKeyRotation<T>(
  geminiConfig: GeminiConfig,
  worker: (apiKey: string) => Promise<T>
): Promise<{ result: T; workingKeyId: string | null }> {
  const userKeys = [...geminiConfig.keys];
  const activeKeyId = geminiConfig.activeKeyId;
  
  const tryOrder = [...userKeys].sort((a, b) => {
    if (a.id === activeKeyId) return -1;
    if (b.id === activeKeyId) return 1;
    return 0;
  });

  if (tryOrder.length === 0) {
    const envKey = process.env.API_KEY;
    if (!envKey) throw new Error("未配置 API Key 且环境变量不可用。");
    const result = await worker(envKey);
    return { result, workingKeyId: null };
  }

  let lastError: any = null;
  for (const keyItem of tryOrder) {
    try {
      const result = await worker(keyItem.key);
      return { result, workingKeyId: keyItem.id };
    } catch (error: any) {
      lastError = error;
      const errMsg = getApiErrorMessage(error);
      if (errMsg === "QUOTA_EXHAUSTED") {
        console.warn(`密钥 [${keyItem.label}] 配额已用尽，正在尝试自动切换到下一个可用密钥...`);
        continue;
      }
      throw error; 
    }
  }

  throw new Error(`所有可用密钥均已超额 (429)。最后一次错误: ${lastError?.message}`);
}

/**
 * Fix: Added 4th parameter 'fixedData' to match usage in components/ItineraryView.tsx
 * and provide the AI with existing context when expanding an itinerary.
 */
export const generateItinerary = async (
  prefs: TravelPreferences, 
  model: GeminiModel, 
  geminiConfig: GeminiConfig,
  fixedData?: { day: number; activities: Activity[] }[]
): Promise<{ itinerary: Itinerary; workingKeyId: string | null }> => {
  
  const fixedDataPrompt = fixedData ? `
    【续写行程上下文】
    以下是行程中已经确定的部分，请在此基础上继续生成后续行程，确保逻辑连贯且风格一致：
    ${JSON.stringify(fixedData)}
  ` : '';

  const prompt = `你是一个顶级私人旅游专家。请规划深度旅行。
    目的地：${prefs.destinations.join('、')}
    天数：${prefs.duration} | 出发：${prefs.startDate}
    风格：${prefs.style} | 预算：${prefs.budget}
    兴趣点：${prefs.interests.join('、')}
    参与人数：${prefs.adults}成人, ${prefs.children}儿童 | 宠物：${prefs.hasPets ? '是' : '否'}
    
    ${fixedDataPrompt}
    
    【核心要求】
    1. 必须使用 Google Search 获取真实的地理坐标(lat/lng)。
    2. 费用字段(estimatedCost)必须是纯数字字符串。
    3. 特别重要：根据目的地气候、季节、旅行天数和特殊需求，生成一份高度定制化的智能打包清单(packingList)。
    
    【回复格式】只输出 JSON：
    ${JSON_SCHEMA_PROMPT}`;

  const { result, workingKeyId } = await callWithKeyRotation(geminiConfig, async (apiKey) => {
    // Initializing Gemini client with named parameter as required.
    const ai = new GoogleGenAI({ apiKey });
    const response = await ai.models.generateContent({
      model: model, 
      contents: prompt,
      config: { tools: [{ googleSearch: {} }], temperature: 0.7 }
    });
    
    const sources: { uri: string; title: string }[] = [];
    // Extracting website URLs from groundingChunks if search was used.
    const groundingChunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks;
    if (Array.isArray(groundingChunks)) {
      groundingChunks.forEach((chunk: any) => {
        if (chunk.web) {
          sources.push({ uri: chunk.web.uri, title: chunk.web.title });
        }
      });
    }

    // Directly accessing .text property (not a method) to extract AI output.
    const data = extractJson(response.text || "");
    if (!data) throw new Error("AI 响应解析失败");
    const itinerary = processItineraryData(data, prefs);
    itinerary.sources = sources;
    return itinerary;
  });

  return { itinerary: result, workingKeyId };
};

export const modifyItineraryWithChat = async (
  instruction: string,
  currentItinerary: Itinerary,
  history: ChatMessage[],
  model: GeminiModel,
  geminiConfig: GeminiConfig
): Promise<{ text: string; updatedPlan?: Itinerary; workingKeyId: string | null }> => {

  const prompt = `你是一个旅游助理。用户想修改当前的行程。
    当前行程摘要：${currentItinerary.summary}
    目的地：${currentItinerary.preferences.destinations.join(', ')}
    用户指令：${instruction}
    
    【任务】
    1. 根据指令修改行程。
    2. 返回两部分内容：一段简短文字描述改动 + 完整 JSON。
    
    ${JSON_SCHEMA_PROMPT}`;

  const { result, workingKeyId } = await callWithKeyRotation(geminiConfig, async (apiKey) => {
    const ai = new GoogleGenAI({ apiKey });
    const chat = ai.chats.create({
      model: model,
      history: history.map(h => ({ role: h.role, parts: [{ text: h.text }] })),
      config: { systemInstruction: "你是一个专业的旅游助手，协助用户修改行程。必须包含修改后的完整行程 JSON。" }
    });
    
    const response = await chat.sendMessage({ message: prompt });
    
    // Accessing .text directly to retrieve the AI response.
    const text = response.text || "";
    const jsonData = extractJson(text);
    
    let updatedPlan;
    if (jsonData && jsonData.days) {
      updatedPlan = processItineraryData(jsonData, currentItinerary.preferences);
      updatedPlan.id = currentItinerary.id;
    }

    const cleanText = text.replace(/```(?:json)?[\s\S]*?```/g, '').trim();
    return { text: cleanText || "我已经根据您的需求调整了方案。", updatedPlan };
  });

  return { ...result, workingKeyId };
};

const processItineraryData = (data: any, prefs: TravelPreferences): Itinerary => {
  const processedDays = (data.days || []).map((day: any) => ({
    ...day,
    activities: (day.activities || []).map((act: any) => ({
      ...act,
      id: act.id || crypto.randomUUID(),
      estimatedCost: act.estimatedCost?.toString().replace(/[^\d.]/g, '') || "0",
      category: act.category || '其他',
      lat: act.lat !== undefined ? Number(act.lat) : undefined,
      lng: act.lng !== undefined ? Number(act.lng) : undefined
    }))
  }));

  const processedPackingList = (data.packingList || []).map((item: any) => ({
    id: item.id || crypto.randomUUID(),
    name: item.name || "未知物品",
    category: item.category || "其他",
    checked: !!item.checked
  }));

  return {
    ...data,
    id: data.id || crypto.randomUUID(),
    name: data.title || `${prefs.destinations[0]} 之旅`,
    createdAt: data.createdAt || Date.now(),
    preferences: prefs,
    days: processedDays,
    packingList: processedPackingList,
    tips: data.tips || [],
    sources: data.sources || []
  };
};

export const chatWithAi = async (message: string, history: ChatMessage[], model: GeminiModel, geminiConfig: GeminiConfig): Promise<{ text: string; workingKeyId: string | null }> => {
  const { result, workingKeyId } = await callWithKeyRotation(geminiConfig, async (apiKey) => {
    const ai = new GoogleGenAI({ apiKey });
    const chat = ai.chats.create({
      model: model,
      history: history.map(h => ({ role: h.role === 'model' ? 'model' : 'user', parts: [{ text: h.text }] })),
      config: { systemInstruction: "你是一个专业的旅游助手。你可以通过对话协助用户规划、修改行程。请保持语气热情且专业。" }
    });
    const response = await chat.sendMessage({ message });
    return response.text || "抱歉，我暂时无法回答。";
  });
  return { text: result, workingKeyId };
};
