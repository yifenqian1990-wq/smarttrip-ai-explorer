export interface TravelPreferences {
  startLocation: string;
  destinations: string[];
  duration: number;
  startDate: string;
  budget: '经济型' | '舒适型' | '豪华型';
  style: '冒险' | '休闲' | '文化' | '亲子';
  interests: string[];
  accommodationType: '民宿' | '精品酒店' | '豪华酒店' | '青年旅舍';
  transportation: '公共交通' | '租车自驾' | '私车自驾' | '步行/骑行' | '包车';
  adults: number;
  children: number;
  hasPets: boolean;
  customRequirements?: string;
}

export interface Activity {
  id: string;
  time: string;
  title: string;
  description: string;
  location: string;
  estimatedCost: string;
  category: string; // 新增：用于预算分类
  lat?: number;
  lng?: number;
  completed?: boolean;
  transportToNext?: {
    mode: string;
    duration?: string;
    cost?: string;
  };
}

export interface WeatherInfo {
  tempMax: number;
  tempMin: number;
  conditionCode: number;
  date: string;
  precipitationProbability?: number;
  windSpeed?: number;
}

export interface DayItinerary {
  day: number;
  theme: string;
  activities: Activity[];
  dailyBudget: number;
  weather?: WeatherInfo;
}

export interface PackingItem {
  id: string;
  name: string;
  checked: boolean;
  category: string;
}

export interface BudgetCategory {
  category: string;
  amount: number;
  color?: string;
}

export interface Itinerary {
  id: string;
  name: string;
  title: string;
  summary: string;
  days: DayItinerary[];
  totalEstimatedBudget: string;
  budgetBreakdown: BudgetCategory[];
  packingList: PackingItem[];
  tips: string[];
  sources?: { uri: string; title: string }[];
  createdAt: number;
  preferences: TravelPreferences;
  isPinned?: boolean;
  isArchived?: boolean;
}

export interface ApiKeyItem {
  id: string;
  label: string;
  key: string;
  createdAt: number;
}

export interface ModelEntry {
  id: string;
  name: string;
  versionId: string;
  desc: string;
}

export type SearchEngine = 'Google Custom' | 'Tavily AI' | 'Brave Search';
export type MapProvider = 'AMap' | 'Leaflet';

export interface SearchConfig {
  engine: SearchEngine;
  cx?: string; // Google Search Engine ID
  activeKeyId: string | null;
  keys: ApiKeyItem[];
}

export interface GeminiConfig {
  activeKeyId: string | null;
  keys: ApiKeyItem[];
}

export interface AMapConfig {
  key: string;
  securityCode: string;
}

export type GeminiModel = string;

export interface ChatMessage {
  role: 'user' | 'model';
  text: string;
  timestamp: number;
}

export interface AppData {
  trip_plans: Itinerary[];
  search_config: SearchConfig;
  gemini_config: GeminiConfig;
  amap_config?: AMapConfig;
  map_provider: MapProvider;
  chat_messages: ChatMessage[];
  selected_model: GeminiModel;
  custom_models: ModelEntry[];
}

export interface DbStatus {
  isConnected: boolean;
  fileName: string | null;
  lastSync: number | null;
  status: 'ok' | 'error' | 'none';
}