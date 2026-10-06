import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  Itinerary, 
  Activity, 
  DayItinerary, 
  PackingItem, 
  BudgetCategory, 
  TravelPreferences, 
  GeminiConfig, 
  MapProvider 
} from '../types';
import MapView from './MapView';
import { generateItinerary } from '../services/geminiService';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip as ReTooltip, BarChart, Bar, XAxis, YAxis, CartesianGrid } from 'recharts';

interface Props {
  itinerary: Itinerary;
  destination: string;
  onUpdate: (updated: Itinerary) => void;
  onRestart: () => void;
  geminiConfig: GeminiConfig;
  onUpdateGeminiConfig: (config: GeminiConfig) => void;
  model: string;
  mapProvider: MapProvider;
}

const extractNumericValue = (str?: string | number): number => {
  if (str === undefined || str === null) return 0;
  const cleaned = str.toString().replace(/[^\d.]/g, '');
  const val = parseFloat(cleaned);
  return isNaN(val) ? 0 : val;
};

const getWeatherIcon = (code: number) => {
  if (code === 0) return '☀️'; 
  if (code <= 3) return '⛅'; 
  if (code <= 48) return '🌫️'; 
  if (code <= 55) return '🌦️'; 
  if (code <= 65) return '🌧️'; 
  if (code <= 75) return '❄️'; 
  if (code <= 82) return '⛈️'; 
  if (code <= 99) return '⛈️'; 
  return '🌡️';
};

const CATEGORY_COLORS: Record<string, string> = {
  '交通': '#3b82f6',
  '住宿': '#8b5cf6',
  '餐饮': '#ef4444',
  '门票': '#10b981',
  '购物': '#f59e0b',
  '其他': '#64748b'
};

const BUDGET_CATEGORIES = ['交通', '住宿', '餐饮', '门票', '购物', '其他'];
const TRANSPORT_MODES = ['公共交通', '租车自驾', '私车自驾', '步行', '骑行', '包车', '打车', '飞机', '高铁'];

const ItineraryView: React.FC<Props> = ({ itinerary, destination, onUpdate, onRestart, geminiConfig, onUpdateGeminiConfig, model, mapProvider }) => {
  const [activeDay, setActiveDay] = useState<number>(0);
  const [expandedDays, setExpandedDays] = useState<Set<number>>(new Set([1]));
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [loading, setLoading] = useState(false);
  const [budgetMode, setBudgetMode] = useState<'category' | 'day'>('category');
  const [viewMode, setViewMode] = useState<'detailed' | 'concise'>('detailed');
  
  const [packingCollapsed, setPackingCollapsed] = useState(false);
  const [budgetCollapsed, setBudgetCollapsed] = useState(false);
  const [tipsCollapsed, setTipsCollapsed] = useState(false);

  const [editingActivity, setEditingActivity] = useState<{ dayIdx: number, activity: Activity } | null>(null);
  const [addingActivityTo, setAddingActivityTo] = useState<{ dayIdx: number, actIdx: number, lat?: number, lng?: number } | null>(null);
  
  const [newActivity, setNewActivity] = useState<Partial<Activity>>({
    time: '10:00',
    title: '',
    location: '',
    description: '',
    estimatedCost: '0',
    category: '其他',
    transportToNext: { mode: '公共交通', duration: '30min', cost: '0' }
  });

  const [newPackingName, setNewPackingName] = useState('');
  const [newPackingCat, setNewPackingCat] = useState('必备');
  const [newTipText, setNewTipText] = useState('');

  const isPlanningRef = useRef(false);

  useEffect(() => {
    if ("geolocation" in navigator) {
      navigator.geolocation.getCurrentPosition((pos) => {
        setUserLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude });
      }, (err) => console.warn(err));
    }
  }, []);

  useEffect(() => {
    const fetchWeather = async () => {
      const updatedDays = [...itinerary.days];
      let changed = false;

      for (let i = 0; i < updatedDays.length; i++) {
        const day = updatedDays[i];
        if (day.weather) continue;

        const mainActivity = day.activities.find(a => a.lat !== undefined && a.lng !== undefined);
        if (mainActivity) {
          try {
            const startDate = new Date(itinerary.preferences.startDate);
            startDate.setDate(startDate.getDate() + (day.day - 1));
            const dateStr = startDate.toISOString().split('T')[0];

            const res = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${mainActivity.lat}&longitude=${mainActivity.lng}&daily=weathercode,temperature_2m_max,temperature_2m_min,precipitation_probability_max&timezone=auto&start_date=${dateStr}&end_date=${dateStr}`);
            const data = await res.json();
            
            if (data.daily && data.daily.time && data.daily.time.length > 0) {
              updatedDays[i] = {
                ...day,
                weather: {
                  date: dateStr,
                  tempMax: data.daily.temperature_2m_max[0],
                  tempMin: data.daily.temperature_2m_min[0],
                  conditionCode: data.daily.weathercode[0],
                  precipitationProbability: data.daily.precipitation_probability_max[0]
                }
              };
              changed = true;
            }
          } catch (e) {
            console.error("Failed to fetch weather", e);
          }
        }
      }

      if (changed) {
        onUpdate({ ...itinerary, days: updatedDays });
      }
    };

    fetchWeather();
  }, [itinerary.days.length, itinerary.preferences.startDate, itinerary, onUpdate]);

  const toggleDayExpansion = (day: number) => {
    const next = new Set(expandedDays);
    if (next.has(day)) {
      next.delete(day);
    } else {
      next.add(day);
    }
    setExpandedDays(next);
  };

  const expandAll = () => setExpandedDays(new Set(itinerary.days.map(d => d.day)));
  const collapseAll = () => setExpandedDays(new Set());

  const handleUpdateActivity = () => {
    if (!editingActivity) return;
    const { dayIdx, activity } = editingActivity;
    const newDays = [...itinerary.days];
    const actIdx = newDays[dayIdx].activities.findIndex(a => a.id === activity.id);
    if (actIdx === -1) return;
    
    newDays[dayIdx].activities[actIdx] = activity;
    onUpdate({ ...itinerary, days: newDays });
    setEditingActivity(null);
  };

  const deleteActivityById = (id: string) => {
    const dayIdx = itinerary.days.findIndex(d => d.activities.some(a => a.id === id));
    if (dayIdx === -1) return;
    const newDays = [...itinerary.days];
    newDays[dayIdx].activities = newDays[dayIdx].activities.filter(a => a.id !== id);
    onUpdate({ ...itinerary, days: newDays });
  };

  const moveActivity = (dayIdx: number, actIdx: number, direction: 'up' | 'down') => {
    const newDays = [...itinerary.days];
    const activities = [...newDays[dayIdx].activities];
    const targetIdx = direction === 'up' ? actIdx - 1 : actIdx + 1;
    if (targetIdx < 0 || targetIdx >= activities.length) return;
    
    [activities[actIdx], activities[targetIdx]] = [activities[targetIdx], activities[actIdx]];
    newDays[dayIdx].activities = activities;
    onUpdate({ ...itinerary, days: newDays });
  };

  const handleAddActivity = () => {
    if (!addingActivityTo) return;
    const { dayIdx, actIdx } = addingActivityTo;
    const newDays = [...itinerary.days];
    const activity: Activity = {
      ...newActivity as Activity,
      id: crypto.randomUUID(),
      lat: addingActivityTo.lat,
      lng: addingActivityTo.lng,
      completed: false
    };
    newDays[dayIdx].activities.splice(actIdx + 1, 0, activity);
    onUpdate({ ...itinerary, days: newDays });
    setAddingActivityTo(null);
    setNewActivity({ time: '10:00', title: '', location: '', description: '', estimatedCost: '0', category: '其他', transportToNext: { mode: '公共交通', duration: '30min', cost: '0' } });
  };

  const rePlanFromNode = async (dayIdx: number, actIdx: number) => {
    if (isPlanningRef.current) return;
    isPlanningRef.current = true;
    setLoading(true);
    try {
      const fixedData = itinerary.days.map((day, dIdx) => {
        if (dIdx < dayIdx) return { day: day.day, activities: day.activities };
        if (dIdx === dayIdx) return { day: day.day, activities: day.activities.slice(0, actIdx + 1) };
        return null;
      }).filter(Boolean) as { day: number, activities: Activity[] }[];

      const { itinerary: newItinerary, workingKeyId } = await generateItinerary(itinerary.preferences, model, geminiConfig, fixedData);

      if (workingKeyId && workingKeyId !== geminiConfig.activeKeyId) {
        onUpdateGeminiConfig({ ...geminiConfig, activeKeyId: workingKeyId });
      }

      const mergedDays = itinerary.days.map((day, dIdx) => {
        if (dIdx < dayIdx) return day;
        if (dIdx === dayIdx) {
          const fixed = day.activities.slice(0, actIdx + 1);
          const newDayAi = newItinerary.days.find(nd => nd.day === day.day);
          if (!newDayAi) return day;
          const addition = newDayAi.activities.filter(na => !fixed.some(fa => fa.id === na.id || fa.title === na.title));
          return { ...newDayAi, activities: [...fixed, ...addition] };
        }
        return newItinerary.days.find(nd => nd.day === day.day) || day;
      });

      onUpdate({ ...itinerary, days: mergedDays, summary: newItinerary.summary });
    } catch (err: any) {
      alert(`操作失败: ${err.message}`);
    } finally {
      setLoading(false);
      isPlanningRef.current = false;
    }
  };

  const togglePackingItem = (id: string) => {
    onUpdate({
      ...itinerary,
      packingList: itinerary.packingList.map(item => item.id === id ? { ...item, checked: !item.checked } : item)
    });
  };

  const addPackingItem = () => {
    if (!newPackingName.trim()) return;
    const newItem: PackingItem = {
      id: crypto.randomUUID(),
      name: newPackingName,
      category: newPackingCat,
      checked: false
    };
    onUpdate({ ...itinerary, packingList: [...itinerary.packingList, newItem] });
    setNewPackingName('');
  };

  const removePackingItem = (id: string) => {
    onUpdate({ ...itinerary, packingList: itinerary.packingList.filter(i => i.id !== id) });
  };

  const addTip = () => {
    if (!newTipText.trim()) return;
    onUpdate({ ...itinerary, tips: [...itinerary.tips, newTipText.trim()] });
    setNewTipText('');
  };

  const removeTip = (idx: number) => {
    onUpdate({ ...itinerary, tips: itinerary.tips.filter((_, i) => i !== idx) });
  };

  const updateTip = (idx: number, text: string) => {
    const newTips = [...itinerary.tips];
    newTips[idx] = text;
    onUpdate({ ...itinerary, tips: newTips });
  };

  const dailyBudgetData = useMemo<{ name: string; amount: number }[]>(() => {
    return (itinerary.days || []).map(d => {
      const total = (d.activities || []).reduce((sum, act) => {
        const actCost = extractNumericValue(act.estimatedCost);
        const transCost = extractNumericValue(act.transportToNext?.cost);
        return sum + actCost + transCost;
      }, 0);
      return { name: `Day ${d.day}`, amount: Math.round(total * 100) / 100 };
    });
  }, [itinerary.days]);

  const dynamicBudgetBreakdown = useMemo<BudgetCategory[]>(() => {
    const breakdown: Record<string, number> = {};
    BUDGET_CATEGORIES.forEach(cat => breakdown[cat] = 0);
    
    (itinerary.days || []).forEach(day => {
      (day.activities || []).forEach(act => {
        const cat = act.category || '其他';
        const actCost = extractNumericValue(act.estimatedCost);
        breakdown[cat] = (breakdown[cat] || 0) + actCost;
        
        if (act.transportToNext?.cost) {
          const transCost = extractNumericValue(act.transportToNext.cost);
          breakdown['交通'] = (breakdown['交通'] || 0) + transCost;
        }
      });
    });
    
    return BUDGET_CATEGORIES.map(cat => ({
      category: cat,
      amount: Math.round(breakdown[cat] * 100) / 100,
      color: CATEGORY_COLORS[cat]
    })).filter(item => item.amount > 0);
  }, [itinerary.days]);

  const totalRealBudget = useMemo(() => 
    Math.round(dailyBudgetData.reduce((sum, day) => sum + day.amount, 0) * 100) / 100, 
    [dailyBudgetData]
  );

  const groupedPackingList = useMemo<Record<string, PackingItem[]>>(() => {
    const groups: Record<string, PackingItem[]> = {};
    (itinerary.packingList || []).forEach(item => {
      if (!groups[item.category]) groups[item.category] = [];
      groups[item.category].push(item);
    });
    return groups;
  }, [itinerary.packingList]);

  const mapActivities = useMemo(() => {
    if (activeDay === 0) return (itinerary.days || []).flatMap(d => d.activities || []);
    const day = (itinerary.days || []).find(d => d.day === activeDay);
    return day ? (day.activities || []) : [];
  }, [activeDay, itinerary.days]);

  const getMapLink = (act: Activity) => {
    if (act.lat !== undefined && act.lng !== undefined) {
      if (mapProvider === 'AMap') {
        return `https://uri.amap.com/marker?position=${act.lng},${act.lat}&name=${encodeURIComponent(act.title)}`;
      }
      return `https://www.google.com/maps/search/?api=1&query=${act.lat},${act.lng}`;
    }
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(act.location || act.title)}`;
  };

  return (
    <>
      {/* 全局模态框层：放置在最外层以避开 transform 导致的 fixed 定位失效 */}
      {loading && (
        <div className="fixed inset-0 z-[5000] bg-white/60 backdrop-blur-md flex flex-col items-center justify-center">
          <div className="w-16 h-16 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mb-4"></div>
          <div className="font-black text-blue-600 text-xs tracking-widest uppercase">AI 正在深度重算路网...</div>
        </div>
      )}

      {/* Edit Activity Modal */}
      {editingActivity && (
        <div className="fixed inset-0 z-[4000] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
          <div className="bg-white rounded-[2.5rem] shadow-2xl overflow-hidden flex flex-col w-full max-w-2xl max-h-[90vh] animate-pop">
            <div className="flex items-center justify-between p-6 md:p-8 border-b border-slate-50 bg-slate-50/50">
              <h3 className="text-xl font-black text-slate-900 flex items-center gap-3">
                <span className="w-10 h-10 rounded-2xl bg-blue-600 text-white flex items-center justify-center text-lg shadow-lg shadow-blue-100">✎</span>
                编辑行程节点
              </h3>
              <button onClick={() => setEditingActivity(null)} className="w-10 h-10 rounded-full hover:bg-white flex items-center justify-center text-slate-300 hover:text-slate-600 transition-all">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
              </button>
            </div>

            <div className="p-6 md:p-8 overflow-y-auto custom-scrollbar space-y-8">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div className="space-y-6 md:col-span-2">
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">活动标题</label>
                    <input type="text" className="w-full px-5 py-4 bg-slate-50 border border-slate-100 rounded-[1.5rem] font-black text-lg focus:ring-4 focus:ring-blue-500/10 outline-none transition-all placeholder:text-slate-300" value={editingActivity.activity.title} onChange={e => setEditingActivity({...editingActivity, activity: {...editingActivity.activity, title: e.target.value}})} placeholder="如：漫步西湖..." />
                  </div>
                </div>

                <div className="space-y-6">
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">到达时间</label>
                    <input type="time" className="w-full px-5 py-4 bg-slate-50 border border-slate-100 rounded-2xl font-bold focus:ring-4 focus:ring-blue-500/10 outline-none transition-all" value={editingActivity.activity.time} onChange={e => setEditingActivity({...editingActivity, activity: {...editingActivity.activity, time: e.target.value}})} />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">预估费用 (¥)</label>
                    <input type="text" className="w-full px-5 py-4 bg-slate-50 border border-slate-100 rounded-2xl font-black text-blue-600 focus:ring-4 focus:ring-blue-500/10 outline-none transition-all" value={editingActivity.activity.estimatedCost} onChange={e => setEditingActivity({...editingActivity, activity: {...editingActivity.activity, estimatedCost: e.target.value}})} />
                  </div>
                </div>

                <div className="space-y-6">
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">分类与标签</label>
                    <select className="w-full px-5 py-4 bg-slate-50 border border-slate-100 rounded-2xl text-xs font-black focus:ring-4 focus:ring-blue-500/10 outline-none transition-all" value={editingActivity.activity.category} onChange={e => setEditingActivity({...editingActivity, activity: {...editingActivity.activity, category: e.target.value}})}>
                      {BUDGET_CATEGORIES.map(cat => <option key={cat} value={cat}>{cat}</option>)}
                    </select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">详细地点</label>
                    <input type="text" className="w-full px-5 py-4 bg-slate-50 border border-slate-100 rounded-2xl font-bold focus:ring-4 focus:ring-blue-500/10 outline-none transition-all" value={editingActivity.activity.location} onChange={e => setEditingActivity({...editingActivity, activity: {...editingActivity.activity, location: e.target.value}})} placeholder="具体地址" />
                  </div>
                </div>

                <div className="md:col-span-2 p-6 bg-blue-50/30 rounded-[2rem] border border-blue-100/50 space-y-6">
                  <h4 className="text-[10px] font-black text-blue-600 uppercase tracking-widest">下站交通设置</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-2">
                       <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">交通工具</label>
                       <select className="w-full px-4 py-3 bg-white border border-slate-100 rounded-xl text-[11px] font-black" value={editingActivity.activity.transportToNext?.mode} onChange={e => setEditingActivity({...editingActivity, activity: {...editingActivity.activity, transportToNext: {...(editingActivity.activity.transportToNext || {}), mode: e.target.value}}})}>
                        {TRANSPORT_MODES.map(mode => <option key={mode} value={mode}>{mode}</option>)}
                       </select>
                    </div>
                    <div className="space-y-2">
                       <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">预计用时</label>
                       <input type="text" className="w-full px-4 py-3 bg-white border border-slate-100 rounded-xl text-[11px] font-bold" value={editingActivity.activity.transportToNext?.duration} onChange={e => setEditingActivity({...editingActivity, activity: {...editingActivity.activity, transportToNext: { mode: editingActivity.activity.transportToNext?.mode || '公共交通', ...(editingActivity.activity.transportToNext || {}), duration: e.target.value}}})} placeholder="如: 30min" />
                    </div>
                    <div className="space-y-2">
                       <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">预估路费 (¥)</label>
                       <input type="text" className="w-full px-4 py-3 bg-white border border-slate-100 rounded-xl text-[11px] font-bold text-amber-600" value={editingActivity.activity.transportToNext?.cost} onChange={e => setEditingActivity({...editingActivity, activity: {...editingActivity.activity, transportToNext: { mode: editingActivity.activity.transportToNext?.mode || '公共交通', ...(editingActivity.activity.transportToNext || {}), cost: e.target.value}}})} placeholder="路费金额" />
                    </div>
                  </div>
                </div>

                <div className="md:col-span-2 space-y-2">
                   <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">行程备忘</label>
                   <textarea className="w-full px-5 py-4 bg-slate-50 border border-slate-100 rounded-[1.5rem] text-sm font-medium outline-none focus:ring-4 focus:ring-blue-500/10 transition-all resize-none" rows={3} value={editingActivity.activity.description} onChange={e => setEditingActivity({...editingActivity, activity: {...editingActivity.activity, description: e.target.value}})} placeholder="记录一些细节..." />
                </div>
              </div>
            </div>

            <div className="p-6 md:p-8 bg-slate-50/50 flex gap-4">
              <button onClick={() => setEditingActivity(null)} className="flex-1 py-4 bg-white text-slate-500 rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-slate-100 transition-all border border-slate-100">取消</button>
              <button onClick={handleUpdateActivity} className="flex-1 py-4 bg-blue-600 text-white rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-blue-700 shadow-xl shadow-blue-100 transition-all active:scale-[0.98]">确认保存</button>
            </div>
          </div>
        </div>
      )}

      {/* Adding Activity Modal */}
      {addingActivityTo && (
        <div className="fixed inset-0 z-[4000] flex items-center justify-center bg-slate-900/60 backdrop-blur-md p-4">
          <div className="bg-white rounded-[2.5rem] shadow-2xl overflow-hidden flex flex-col w-full max-w-2xl max-h-[90vh] animate-pop">
            <div className="p-6 md:p-8 flex items-center justify-between border-b border-slate-50">
              <h3 className="text-xl font-black text-slate-900 flex items-center gap-3">
                <span className="w-10 h-10 rounded-2xl bg-green-500 text-white flex items-center justify-center text-lg shadow-lg shadow-green-100">+</span>
                Day {itinerary.days[addingActivityTo.dayIdx].day} 新活动
              </h3>
              <button onClick={() => setAddingActivityTo(null)} className="text-slate-300 hover:text-slate-600 transition-colors"><svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg></button>
            </div>
            
            <div className="p-6 md:p-8 space-y-6 overflow-y-auto custom-scrollbar">
              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">活动名称</label>
                <input type="text" className="w-full px-5 py-4 bg-slate-50 border border-slate-100 rounded-2xl font-black text-lg" value={newActivity.title} onChange={e => setNewActivity({...newActivity, title: e.target.value})} placeholder="输入景点或活动名称" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">时间点</label>
                  <input type="time" className="w-full px-5 py-4 bg-slate-50 border border-slate-100 rounded-2xl font-bold" value={newActivity.time} onChange={e => setNewActivity({...newActivity, time: e.target.value})} />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">费用分类</label>
                  <select className="w-full px-5 py-4 bg-slate-50 border border-slate-100 rounded-2xl text-[11px] font-black" value={newActivity.category} onChange={e => setNewActivity({...newActivity, category: e.target.value})}>
                    {BUDGET_CATEGORIES.map(cat => <option key={cat} value={cat}>{cat}</option>)}
                  </select>
                </div>
              </div>
            </div>

            <div className="p-6 md:p-8 bg-slate-50 flex gap-4">
              <button onClick={() => setAddingActivityTo(null)} className="flex-1 py-4 bg-white text-slate-500 rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-slate-100 transition-all">取消</button>
              <button onClick={handleAddActivity} className="flex-1 py-4 bg-blue-600 text-white rounded-2xl font-black text-xs uppercase tracking-widest shadow-xl shadow-blue-100 active:scale-[0.98]">确定添加</button>
            </div>
          </div>
        </div>
      )}

      {/* Main Content View */}
      <div className="max-w-6xl mx-auto space-y-8 pb-20 animate-fade-in relative">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 px-2">
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <span className="px-3 py-1 bg-blue-600 text-white text-[10px] font-black rounded-full uppercase tracking-widest shadow-lg shadow-blue-100">
                {itinerary.preferences.budget} · {itinerary.preferences.style}
              </span>
              <span className="text-slate-300 font-black">/</span>
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                {itinerary.preferences.duration} DAYS ADVENTURE
              </span>
            </div>
            <h2 className="text-4xl md:text-6xl font-black text-slate-900 tracking-tighter leading-none">
              {itinerary.name}
            </h2>
          </div>
          
          <div className="flex items-center gap-3">
            <button onClick={onRestart} className="px-6 py-4 bg-white text-slate-900 border border-slate-100 rounded-[1.5rem] font-black text-[10px] uppercase tracking-widest hover:bg-slate-900 hover:text-white transition-all shadow-xl shadow-slate-200/50 flex items-center gap-2">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path></svg>
              重新规划
            </button>
            <button onClick={() => window.print()} className="p-4 bg-white text-slate-400 border border-slate-100 rounded-[1.5rem] hover:text-blue-600 transition-all shadow-xl shadow-slate-200/50">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 00-2 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z"></path></svg>
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 p-8 bg-white border border-slate-100 rounded-[3rem] shadow-sm relative overflow-hidden group">
            <div className="absolute top-0 right-0 w-32 h-32 bg-blue-50 rounded-full -translate-y-1/2 translate-x-1/2 group-hover:scale-150 transition-transform duration-700"></div>
            <div className="relative z-10 space-y-4">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 bg-blue-600 rounded-full"></span>
                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">行程摘要 / SUMMARY</span>
              </div>
              <p className="text-lg md:text-xl text-slate-600 font-bold leading-relaxed pr-10 italic">
                “{itinerary.summary}”
              </p>
            </div>
          </div>

          <div className="p-8 bg-slate-900 text-white rounded-[3rem] shadow-2xl flex flex-col justify-between">
            <div className="space-y-1">
              <div className="text-[10px] font-black text-slate-500 uppercase tracking-widest">预估总开销 / TOTAL BUDGET</div>
              <div className="text-4xl font-black tracking-tighter">¥{totalRealBudget.toLocaleString()}</div>
            </div>
            <div className="mt-6 flex items-center justify-between p-4 bg-white/5 rounded-2xl border border-white/5">
              <div className="flex flex-col">
                <span className="text-[8px] font-black text-slate-500 uppercase">人均预算</span>
                <span className="text-sm font-black">¥{Math.round(totalRealBudget / Math.max(1, (itinerary.preferences.adults + itinerary.preferences.children))).toLocaleString()}</span>
              </div>
              <div className="w-px h-8 bg-white/10"></div>
              <div className="flex flex-col items-end">
                <span className="text-[8px] font-black text-slate-500 uppercase">当前汇率参考</span>
                <span className="text-sm font-black">CNY 1.00</span>
              </div>
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <div className="flex items-center justify-between px-2">
            <div className="flex items-center gap-4">
              <h3 className="text-xl font-black text-slate-900 flex items-center gap-2">
                <span className="text-blue-600">🗺️</span> 动态地理概览
              </h3>
              <div className="flex bg-slate-100 p-1 rounded-xl">
                <button onClick={() => setActiveDay(0)} className={`px-4 py-1.5 text-[10px] font-black rounded-lg transition-all ${activeDay === 0 ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}>全部</button>
                {itinerary.days.map(d => (
                  <button key={d.day} onClick={() => setActiveDay(d.day)} className={`px-4 py-1.5 text-[10px] font-black rounded-lg transition-all ${activeDay === d.day ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}>D{d.day}</button>
                ))}
              </div>
            </div>
          </div>
          
          <MapView 
            activities={mapActivities} 
            userLocation={userLocation} 
            transportationMode={itinerary.preferences.transportation}
            onDeletePoint={deleteActivityById}
            onMovePoint={(id, lat, lng) => {
              const newDays = [...itinerary.days];
              for (let day of newDays) {
                const act = day.activities.find(a => a.id === id);
                if (act) { act.lat = lat; act.lng = lng; break; }
              }
              onUpdate({ ...itinerary, days: newDays });
            }}
            mapProvider={mapProvider}
          />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10">
          <div className="lg:col-span-8 space-y-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between mb-4 px-2 gap-4">
              <h3 className="text-sm font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                <span className="w-1.5 h-1.5 bg-blue-600 rounded-full"></span>
                详细行程单 / ITINERARY
              </h3>
              <div className="flex items-center gap-4">
                 <div className="flex bg-slate-100 p-1 rounded-xl">
                   <button 
                    onClick={() => setViewMode('detailed')} 
                    className={`px-4 py-1.5 text-[10px] font-black rounded-lg transition-all ${viewMode === 'detailed' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
                   >
                     详情模式
                   </button>
                   <button 
                    onClick={() => setViewMode('concise')} 
                    className={`px-4 py-1.5 text-[10px] font-black rounded-lg transition-all ${viewMode === 'concise' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
                   >
                     简介模式
                   </button>
                 </div>
                 <div className="flex gap-2">
                    <button onClick={expandAll} className="text-[10px] font-black text-blue-600 uppercase tracking-widest hover:underline">全部展开</button>
                    <span className="text-slate-200 text-[10px]">|</span>
                    <button onClick={collapseAll} className="text-[10px] font-black text-slate-400 uppercase tracking-widest hover:underline">全部折叠</button>
                 </div>
              </div>
            </div>

            {(itinerary.days || []).map((day, dIdx) => (
              <div key={day.day} className={`relative group ${activeDay !== 0 && activeDay !== day.day ? 'opacity-30 blur-[2px] pointer-events-none' : ''}`}>
                <div 
                  onClick={() => toggleDayExpansion(day.day)}
                  className={`flex flex-col md:flex-row md:items-center justify-between mb-2 p-6 rounded-[2.5rem] cursor-pointer transition-all border ${expandedDays.has(day.day) ? 'bg-slate-900 text-white shadow-2xl border-slate-900 mb-6' : 'bg-white text-slate-900 border-slate-100 hover:border-blue-100 shadow-sm'}`}
                >
                  <div className="flex items-center gap-6">
                    <div className={`w-14 h-14 rounded-2xl flex flex-col items-center justify-center transition-all ${expandedDays.has(day.day) ? 'bg-blue-600 text-white' : 'bg-slate-50 text-slate-400'}`}>
                      <span className="text-[8px] font-black uppercase opacity-60">D</span>
                      <span className="text-xl font-black leading-none">{day.day}</span>
                    </div>
                    <div className="flex-1">
                      <h4 className="text-lg font-black tracking-tight">{day.theme}</h4>
                      {!expandedDays.has(day.day) && (
                        <div className="flex items-center gap-3 mt-1 text-[10px] font-bold opacity-50">
                          <span>{day.activities.length} 个行程点</span>
                          <span>·</span>
                          <span>¥{dailyBudgetData[dIdx].amount.toLocaleString()}</span>
                          {day.weather && <span>· {getWeatherIcon(day.weather.conditionCode)} {day.weather.tempMax}°C</span>}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-4 mt-4 md:mt-0">
                    {expandedDays.has(day.day) && (
                      <button 
                        onClick={(e) => { 
                          e.stopPropagation(); 
                          setAddingActivityTo({ dayIdx: dIdx, actIdx: day.activities.length - 1 }); 
                        }}
                        className="px-4 py-2 bg-white/10 text-white/60 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-white/20 transition-all border border-white/10"
                      >
                        + 活动
                      </button>
                    )}
                    <div className={`transition-transform duration-300 ${expandedDays.has(day.day) ? 'rotate-180' : ''}`}>
                      <svg className="w-5 h-5 opacity-40" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M19 9l-7 7-7-7"></path></svg>
                    </div>
                  </div>
                </div>

                {expandedDays.has(day.day) && (
                  <div className="space-y-6 pl-4 md:pl-8 border-l-2 border-slate-100 ml-7 md:ml-10 py-4 animate-fade-in">
                    {day.weather && (
                      <div className="mb-8 p-6 bg-gradient-to-br from-blue-50 to-indigo-50 border border-blue-100 rounded-[2.5rem] flex items-center justify-between shadow-sm relative overflow-hidden group/weather">
                        <div className="absolute -right-4 -top-4 text-7xl opacity-10 group-hover/weather:scale-125 transition-transform duration-700 pointer-events-none">
                          {getWeatherIcon(day.weather.conditionCode)}
                        </div>
                        <div className="flex items-center gap-6 relative z-10">
                          <div className="text-4xl">{getWeatherIcon(day.weather.conditionCode)}</div>
                          <div className="space-y-1">
                            <div className="text-[10px] font-black text-blue-600 uppercase tracking-widest">当日实时预报</div>
                            <div className="flex items-center gap-3">
                              <span className="text-2xl font-black text-slate-800">{day.weather.tempMin}° ~ {day.weather.tempMax}°C</span>
                              <span className="px-2 py-0.5 bg-blue-100 text-blue-700 text-[9px] font-black rounded-lg">降水概率 {day.weather.precipitationProbability}%</span>
                            </div>
                          </div>
                        </div>
                        <div className="text-right relative z-10">
                          <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest">日期</div>
                          <div className="text-sm font-black text-slate-700">{day.weather.date}</div>
                        </div>
                      </div>
                    )}

                    {(day.activities || []).map((activity, aIdx) => (
                      <div key={activity.id} className="relative group/item">
                        <div className="flex items-start gap-6 relative z-10">
                          <div className="shrink-0 w-16 flex flex-col items-center pt-2">
                            <div className="text-[11px] font-black text-slate-400 mb-2">{activity.time}</div>
                            <div className={`w-12 h-12 rounded-2xl flex items-center justify-center transition-all ${activity.completed ? 'bg-green-50 text-green-500 shadow-inner' : 'bg-white border-2 border-slate-50 text-blue-500 group-hover/item:border-blue-100 shadow-sm'}`}>
                              {activity.category === '交通' ? '🚗' : activity.category === '餐饮' ? '🍲' : activity.category === '住宿' ? '🏨' : activity.category === '门票' ? '🎟️' : activity.category === '购物' ? '🛍️' : '📍'}
                            </div>
                          </div>

                          {viewMode === 'detailed' ? (
                            <div className="flex-1 bg-white border border-slate-100 p-6 rounded-[2.5rem] shadow-sm hover:shadow-xl hover:border-blue-100 transition-all group-hover/item:translate-x-1 duration-300">
                              <div className="flex justify-between items-start mb-4">
                                <div className="flex-1">
                                  <h5 className="text-lg font-black text-slate-900 flex items-center gap-2">
                                    {activity.title}
                                    {activity.completed && <span className="w-5 h-5 bg-green-500 rounded-full flex items-center justify-center text-[8px] text-white">✓</span>}
                                  </h5>
                                  <div className="flex items-center gap-2 mt-1">
                                    <a 
                                      href={getMapLink(activity)} 
                                      target="_blank" 
                                      rel="noopener noreferrer" 
                                      className="text-[10px] font-bold text-slate-400 flex items-center gap-1 hover:text-blue-600 hover:underline transition-all"
                                    >
                                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"></path></svg>
                                      {activity.location}
                                    </a>
                                  </div>
                                </div>
                                <div className="text-right ml-4">
                                  <div className="text-[10px] font-black text-slate-300 uppercase tracking-widest mb-1">预算</div>
                                  <div className="text-sm font-black text-blue-600">¥{activity.estimatedCost}</div>
                                </div>
                              </div>

                              <p className="text-slate-500 text-xs font-medium leading-relaxed mb-6">
                                {activity.description}
                              </p>

                              <div className="flex flex-wrap items-center justify-between gap-4 pt-6 border-t border-slate-50">
                                <div className="flex gap-2">
                                  <button onClick={() => {
                                    const newDays = [...itinerary.days];
                                    newDays[dIdx].activities[aIdx].completed = !activity.completed;
                                    onUpdate({...itinerary, days: newDays});
                                  }} className={`px-4 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all ${activity.completed ? 'bg-green-100 text-green-600' : 'bg-slate-50 text-slate-400 hover:bg-slate-900 hover:text-white'}`}>
                                    {activity.completed ? '已打卡' : '标记完成'}
                                  </button>
                                  <button 
                                    onClick={(e) => { 
                                      e.stopPropagation();
                                      setEditingActivity({ dayIdx: dIdx, activity: { ...activity } }); 
                                    }} 
                                    className="px-4 py-2 bg-slate-50 text-slate-400 rounded-xl text-[9px] font-black uppercase tracking-widest hover:text-blue-600 hover:bg-blue-50 transition-all"
                                  >
                                    编辑
                                  </button>
                                  <button 
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setAddingActivityTo({ dayIdx: dIdx, actIdx: aIdx });
                                    }}
                                    className="px-4 py-2 bg-slate-50 text-slate-400 rounded-xl text-[9px] font-black uppercase tracking-widest hover:text-green-600 hover:bg-green-50 transition-all"
                                  >
                                    插入
                                  </button>
                                  <button onClick={() => deleteActivityById(activity.id)} className="px-4 py-2 bg-slate-50 text-slate-400 rounded-xl text-[9px] font-black uppercase tracking-widest hover:text-red-500 hover:bg-red-50 transition-all">移除</button>
                                </div>
                                
                                <div className="flex items-center gap-1">
                                  <button onClick={() => moveActivity(dIdx, aIdx, 'up')} disabled={aIdx === 0} className="p-2 text-slate-300 hover:text-slate-900 disabled:opacity-20 transition-all"><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M5 15l7-7 7 7"></path></svg></button>
                                  <button onClick={() => moveActivity(dIdx, aIdx, 'down')} disabled={aIdx === day.activities.length - 1} className="p-2 text-slate-300 hover:text-slate-900 disabled:opacity-20 transition-all"><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 9l-7 7-7-7"></path></svg></button>
                                  <div className="w-px h-4 bg-slate-100 mx-1"></div>
                                  <button onClick={() => rePlanFromNode(dIdx, aIdx)} className="group/btn relative px-4 py-2 bg-blue-50 text-blue-600 rounded-xl text-[9px] font-black uppercase tracking-widest hover:bg-blue-600 hover:text-white transition-all flex items-center gap-2">
                                    ✨ AI 扩写
                                  </button>
                                </div>
                              </div>

                              {activity.transportToNext && (
                                <div 
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setEditingActivity({ dayIdx: dIdx, activity: { ...activity } });
                                  }}
                                  className="mt-6 flex items-center gap-4 p-4 bg-slate-50/80 rounded-2xl border border-white cursor-pointer hover:bg-blue-50 hover:border-blue-100 transition-all group/trans"
                                >
                                  <div className="w-10 h-10 bg-white rounded-xl shadow-sm flex items-center justify-center text-lg">
                                    {activity.transportToNext.mode === '步行' ? '🚶' : activity.transportToNext.mode === '骑行' ? '🚲' : activity.transportToNext.mode === '打车' ? '🚕' : '🚗'}
                                  </div>
                                  <div className="flex-1">
                                    <div className="text-[9px] font-black text-slate-400 uppercase tracking-tighter mb-1 flex items-center gap-2">
                                      下站交通 / TRANSPORT
                                      <span className="opacity-0 group-hover/trans:opacity-100 text-blue-600 transition-opacity text-[8px] font-black uppercase">点击修改</span>
                                    </div>
                                    <div className="text-[11px] font-black text-slate-700 flex items-center gap-2">
                                      <span className="text-blue-600">{activity.transportToNext.mode}</span>
                                      <span className="w-1 h-1 bg-slate-300 rounded-full"></span>
                                      <span>约 {activity.transportToNext.duration}</span>
                                      {activity.transportToNext.cost && activity.transportToNext.cost !== "0" && (
                                        <>
                                          <span className="w-1 h-1 bg-slate-300 rounded-full"></span>
                                          <span className="text-amber-600 font-bold">¥{activity.transportToNext.cost}</span>
                                        </>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              )}
                            </div>
                          ) : (
                            /* Concise Mode View */
                            <div className="flex-1 bg-white border border-slate-100 p-4 rounded-[1.5rem] shadow-sm hover:border-blue-100 transition-all flex flex-col md:flex-row md:items-center justify-between gap-4">
                              <div className="flex-1 min-w-0">
                                  <h5 className="text-sm font-black text-slate-900 truncate flex items-center gap-2">
                                    {activity.title}
                                    {activity.completed && <span className="w-4 h-4 bg-green-500 rounded-full flex items-center justify-center text-[7px] text-white">✓</span>}
                                  </h5>
                                  <div className="flex items-center gap-2 mt-1">
                                    <a 
                                      href={getMapLink(activity)} 
                                      target="_blank" 
                                      rel="noopener noreferrer" 
                                      className="text-[9px] font-bold text-slate-400 flex items-center gap-1 hover:text-blue-600 transition-all truncate max-w-[200px]"
                                    >
                                      <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"></path></svg>
                                      {activity.location}
                                    </a>
                                  </div>
                              </div>
                              
                              {activity.transportToNext && (
                                <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-50 rounded-lg border border-slate-100/50 shrink-0">
                                  <span className="text-sm">
                                    {activity.transportToNext.mode === '步行' ? '🚶' : activity.transportToNext.mode === '骑行' ? '🚲' : activity.transportToNext.mode === '打车' ? '🚕' : '🚗'}
                                  </span>
                                  <div className="flex flex-col">
                                    <span className="text-[8px] font-black text-slate-400 uppercase leading-none mb-0.5">下站</span>
                                    <span className="text-[10px] font-black text-blue-600 leading-none">{activity.transportToNext.mode} / {activity.transportToNext.duration}</span>
                                  </div>
                                </div>
                              )}

                              <div className="flex items-center gap-1 opacity-0 group-hover/item:opacity-100 transition-opacity">
                                <button onClick={() => {
                                  const newDays = [...itinerary.days];
                                  newDays[dIdx].activities[aIdx].completed = !activity.completed;
                                  onUpdate({...itinerary, days: newDays});
                                }} className="p-2 text-slate-300 hover:text-green-500 transition-colors">
                                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M5 13l4 4L19 7"></path></svg>
                                </button>
                                <button onClick={() => setEditingActivity({ dayIdx: dIdx, activity: { ...activity } })} className="p-2 text-slate-300 hover:text-blue-500 transition-colors">
                                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"></path></svg>
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>

          <div className="lg:col-span-4 space-y-10">
            <div className="p-8 bg-white border border-slate-100 rounded-[3rem] shadow-sm space-y-6 transition-all">
              <div className="flex items-center justify-between">
                <h4 className="text-lg font-black text-slate-900 flex items-center gap-2">
                  <span className="text-blue-600">🎒</span> 智能行李清单
                </h4>
                <button 
                  onClick={() => setPackingCollapsed(!packingCollapsed)}
                  className={`p-2 rounded-xl transition-all ${packingCollapsed ? 'bg-blue-50 text-blue-600 rotate-180' : 'bg-slate-50 text-slate-300 hover:text-slate-600'}`}
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M19 9l-7 7-7-7"></path></svg>
                </button>
              </div>

              {!packingCollapsed && (
                <div className="animate-fade-in space-y-6">
                  <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">
                    {itinerary.packingList.filter(i => i.checked).length}/{itinerary.packingList.length} 完成
                  </div>
                  <div className="space-y-6 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
                    {Object.entries(groupedPackingList).map(([cat, items]) => (
                      <div key={cat} className="space-y-3">
                        <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest border-b pb-1">{cat}</div>
                        <div className="space-y-2">
                          {items.map(item => (
                            <div key={item.id} onClick={() => togglePackingItem(item.id)} className={`group flex items-center justify-between p-3 rounded-2xl cursor-pointer transition-all ${item.checked ? 'bg-green-50/50 opacity-60' : 'bg-slate-50 hover:bg-slate-100'}`}>
                              <div className="flex items-center gap-3">
                                <div className={`w-5 h-5 rounded-lg border-2 flex items-center justify-center transition-all ${item.checked ? 'bg-green-500 border-green-500 text-white' : 'bg-white border-slate-200'}`}>
                                  {item.checked && <span className="text-[10px]">✓</span>}
                                </div>
                                <span className={`text-[11px] font-bold ${item.checked ? 'line-through text-slate-400' : 'text-slate-700'}`}>{item.name}</span>
                              </div>
                              <button onClick={(e) => { e.stopPropagation(); removePackingItem(item.id); }} className="opacity-0 group-hover:opacity-100 text-slate-300 hover:text-red-500 transition-all">
                                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 18L18 6M6 6l12 12"></path></svg>
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="pt-4 space-y-3 border-t border-slate-50">
                    <div className="flex gap-2">
                      <input 
                        type="text" 
                        value={newPackingName} 
                        onChange={e => setNewPackingName(e.target.value)} 
                        placeholder="添加物品..." 
                        className="flex-1 px-4 py-2 bg-slate-50 border border-slate-100 rounded-xl text-[11px] font-bold outline-none focus:ring-2 focus:ring-blue-500/10"
                        onKeyDown={(e) => e.key === 'Enter' && addPackingItem()}
                      />
                      <button onClick={addPackingItem} className="w-10 h-10 bg-slate-900 text-white rounded-xl flex items-center justify-center hover:bg-blue-600 transition-all">+</button>
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="p-8 bg-white border border-slate-100 rounded-[3rem] shadow-sm space-y-6 overflow-hidden transition-all">
              <div className="flex items-center justify-between">
                 <h4 className="text-lg font-black text-slate-900 flex items-center gap-2">
                   <span className="text-blue-600">📊</span> 预算深度分析
                 </h4>
                 <button 
                  onClick={() => setBudgetCollapsed(!budgetCollapsed)}
                  className={`p-2 rounded-xl transition-all ${budgetCollapsed ? 'bg-blue-50 text-blue-600 rotate-180' : 'bg-slate-50 text-slate-300 hover:text-slate-600'}`}
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M19 9l-7 7-7-7"></path></svg>
                </button>
              </div>

              {!budgetCollapsed && (
                <div className="animate-fade-in space-y-6">
                  <div className="flex bg-slate-100 p-1 rounded-xl w-fit ml-auto">
                    <button onClick={() => setBudgetMode('category')} className={`px-3 py-1.5 text-[8px] font-black rounded-lg transition-all ${budgetMode === 'category' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-400'}`}>分类</button>
                    <button onClick={() => setBudgetMode('day')} className={`px-3 py-1.5 text-[8px] font-black rounded-lg transition-all ${budgetMode === 'day' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-400'}`}>每日</button>
                  </div>

                  <div className="h-[240px] w-full mt-4">
                    {budgetMode === 'category' ? (
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={dynamicBudgetBreakdown as any}
                            cx="50%"
                            cy="50%"
                            innerRadius={60}
                            outerRadius={80}
                            paddingAngle={5}
                            dataKey="amount"
                            nameKey="category"
                            stroke="none"
                          >
                            {dynamicBudgetBreakdown.map((entry, index) => (
                              <Cell key={`cell-${index}`} fill={entry.color} />
                            ))}
                          </Pie>
                          <ReTooltip 
                            contentStyle={{ borderRadius: '1rem', border: 'none', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)', fontSize: '10px', fontWeight: 'bold' }}
                            formatter={(value: any) => [`¥${value.toLocaleString()}`, '金额']}
                          />
                        </PieChart>
                      </ResponsiveContainer>
                    ) : (
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={dailyBudgetData}>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                          <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 10, fontWeight: 900, fill: '#cbd5e1' }} />
                          <YAxis hide />
                          <ReTooltip 
                            cursor={{ fill: '#f8fafc' }}
                            contentStyle={{ borderRadius: '1rem', border: 'none', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)', fontSize: '10px', fontWeight: 'bold' }}
                            formatter={(value: any) => [`¥${value.toLocaleString()}`, '预算']}
                          />
                          <Bar dataKey="amount" fill="#3b82f6" radius={[6, 6, 6, 6]} barSize={24} />
                        </BarChart>
                      </ResponsiveContainer>
                    )}
                  </div>

                  <div className="pt-6 border-t border-slate-50 space-y-4">
                     <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest">预算构成详情</div>
                     <div className="space-y-3">
                        {budgetMode === 'category' ? (
                          dynamicBudgetBreakdown.map((item, idx) => (
                            <div key={idx} className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: item.color }}></div>
                                <span className="text-[11px] font-bold text-slate-600">{item.category}</span>
                              </div>
                              <div className="text-xs font-black text-slate-900">¥{item.amount.toLocaleString()}</div>
                            </div>
                          ))
                        ) : (
                          dailyBudgetData.map((item, idx) => (
                            <div key={idx} className="flex items-center justify-between">
                              <span className="text-[11px] font-bold text-slate-600">{item.name}</span>
                              <div className="text-xs font-black text-slate-900">¥{item.amount.toLocaleString()}</div>
                            </div>
                          ))
                        )}
                     </div>
                  </div>
                </div>
              )}
            </div>

            <div className="p-8 bg-blue-600 text-white rounded-[3rem] shadow-2xl space-y-6 relative overflow-hidden group transition-all">
              <div className="absolute top-0 right-0 p-4 text-white/10 text-6xl group-hover:rotate-12 transition-transform duration-500">💡</div>
              
              <div className="flex items-center justify-between relative z-10">
                <h4 className="text-lg font-black flex items-center gap-2">专家温馨提示</h4>
                <button 
                  onClick={() => setTipsCollapsed(!tipsCollapsed)}
                  className={`p-2 rounded-xl transition-all ${tipsCollapsed ? 'bg-white/10 rotate-180' : 'bg-white/10 hover:bg-white/20'}`}
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M19 9l-7 7-7-7"></path></svg>
                </button>
              </div>

              {!tipsCollapsed && (
                <div className="animate-fade-in space-y-6 relative z-10">
                  <div className="space-y-4">
                    {(itinerary.tips || []).map((tip, idx) => (
                      <div key={idx} className="group/tip flex items-start gap-3 p-4 bg-white/10 rounded-2xl border border-white/10 backdrop-blur-sm transition-all hover:bg-white/15">
                        <div className="text-xs pt-0.5">✨</div>
                        <div className="flex-1 space-y-2">
                          <textarea 
                            value={tip} 
                            onChange={(e) => updateTip(idx, e.target.value)}
                            className="w-full bg-transparent border-none p-0 text-[11px] font-bold leading-relaxed outline-none resize-none focus:ring-0"
                            rows={2}
                          />
                          <button onClick={() => removeTip(idx)} className="opacity-0 group-hover/tip:opacity-100 text-[8px] font-black uppercase tracking-widest text-white/50 hover:text-white transition-all">删除</button>
                        </div>
                      </div>
                    ))}
                    <div className="flex gap-2 pt-4">
                      <input 
                        type="text" 
                        value={newTipText}
                        onChange={e => setNewTipText(e.target.value)}
                        placeholder="添加提示..."
                        className="flex-1 bg-white/10 border border-white/20 rounded-xl px-4 py-2 text-[10px] font-bold outline-none placeholder:text-white/30"
                        onKeyDown={(e) => e.key === 'Enter' && addTip()}
                      />
                      <button onClick={addTip} className="w-10 h-10 bg-white text-blue-600 rounded-xl flex items-center justify-center font-black">+</button>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {itinerary.sources && itinerary.sources.length > 0 && (
              <div className="p-8 bg-white border border-slate-100 rounded-[3rem] shadow-sm space-y-4 animate-fade-in">
                <h4 className="text-sm font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                  <span className="w-1.5 h-1.5 bg-blue-600 rounded-full"></span>
                  引用来源 / SOURCES
                </h4>
                <div className="flex flex-wrap gap-2">
                  {itinerary.sources.map((source, idx) => (
                    <a 
                      key={idx} 
                      href={source.uri} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="px-3 py-2 bg-slate-50 border border-slate-100 rounded-xl text-[10px] font-bold text-blue-600 hover:bg-blue-50 transition-all flex items-center gap-2"
                    >
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"></path></svg>
                      <span className="truncate max-w-[150px]">{source.title || source.uri}</span>
                    </a>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
};

export default ItineraryView;