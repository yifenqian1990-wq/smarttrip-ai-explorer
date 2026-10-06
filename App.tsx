

import React, { useState, useEffect, useRef } from 'react';
import PreferenceForm from './components/PreferenceForm';
import ItineraryView from './components/ItineraryView';
import ApiKeySettings from './components/ApiKeySettings';
import AiAssistant from './components/AiAssistant';
import { TravelPreferences, Itinerary, SearchConfig, GeminiConfig, ChatMessage, DbStatus, AppData, GeminiModel, ModelEntry, AMapConfig, MapProvider } from './types';
import { generateItinerary } from './services/geminiService';

const DB_NAME = 'SmartTripDB';
const STORE_NAME = 'handles';
const HANDLE_KEY = 'current_db_handle';

const DEFAULT_MODELS: ModelEntry[] = [
  { id: 'm1', name: 'Gemini 3 Flash', versionId: 'gemini-3-flash-preview', desc: '新一代高性能轻量化模型' },
  { id: 'm2', name: 'Gemini 3 Pro', versionId: 'gemini-3-pro-preview', desc: '复杂逻辑与深度推理' },
  { id: 'm3', name: 'Gemini 2.5 Flash', versionId: 'gemini-flash-latest', desc: '高性能稳定版模型' },
];

const saveHandleToIndexedDB = async (handle: FileSystemFileHandle) => {
  const request = indexedDB.open(DB_NAME, 1);
  request.onupgradeneeded = () => request.result.createObjectStore(STORE_NAME);
  request.onsuccess = () => {
    const db = request.result;
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put(handle, HANDLE_KEY);
  };
};

const getHandleFromIndexedDB = (): Promise<FileSystemFileHandle | null> => {
  return new Promise((resolve) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE_NAME);
    request.onsuccess = () => {
      const db = request.result;
      const tx = db.transaction(STORE_NAME, 'readonly');
      const getReq = tx.objectStore(STORE_NAME).get(HANDLE_KEY);
      getReq.onsuccess = () => resolve(getReq.result || null);
      getReq.onerror = () => resolve(null);
    };
    request.onerror = () => resolve(null);
  });
};

const App: React.FC = () => {
  const [itineraries, setItineraries] = useState<Itinerary[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [selectedModel, setSelectedModel] = useState<GeminiModel>('gemini-3-flash-preview');
  const [customModels, setCustomModels] = useState<ModelEntry[]>(DEFAULT_MODELS);
  
  const [draftPrefs, setDraftPrefs] = useState<TravelPreferences | null>(null);
  const [replacingId, setReplacingId] = useState<string | null>(null);
  const [draftKey, setDraftKey] = useState<string>('initial');

  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy, setSortBy] = useState<'newest' | 'oldest' | 'name'>('newest');

  const [editingNameId, setEditingNameId] = useState<string | null>(null);
  const [editingNameValue, setEditingNameValue] = useState('');

  const [searchConfig, setSearchConfig] = useState<SearchConfig>({ engine: 'Google Custom', keys: [], activeKeyId: null });
  const [geminiConfig, setGeminiConfig] = useState<GeminiConfig>({ keys: [], activeKeyId: null });
  const [amapConfig, setAmapConfig] = useState<AMapConfig>({ key: '', securityCode: '' });
  const [mapProvider, setMapProvider] = useState<MapProvider>('AMap');

  const [sidebarOpen, setSidebarOpen] = useState(window.innerWidth > 1024);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  
  const [dbStatus, setDbStatus] = useState<DbStatus>({ isConnected: false, fileName: null, lastSync: null, status: 'none' });
  const fileHandleRef = useRef<FileSystemFileHandle | null>(null);

  // Initialize App Data
  useEffect(() => {
    const initApp = async () => {
      const savedPlans = localStorage.getItem('trip_plans');
      if (savedPlans) setItineraries(JSON.parse(savedPlans));
      
      const savedActiveId = localStorage.getItem('active_plan_id');
      if (savedActiveId) setActiveId(savedActiveId);

      const savedSearch = localStorage.getItem('search_config');
      if (savedSearch) setSearchConfig(JSON.parse(savedSearch));
      const savedGemini = localStorage.getItem('gemini_config');
      if (savedGemini) setGeminiConfig(JSON.parse(savedGemini));
      const savedAmap = localStorage.getItem('amap_config');
      if (savedAmap) setAmapConfig(JSON.parse(savedAmap));
      const savedMapProvider = localStorage.getItem('map_provider');
      if (savedMapProvider) setMapProvider(savedMapProvider as MapProvider);
      const savedMessages = localStorage.getItem('chat_messages');
      if (savedMessages) setChatMessages(JSON.parse(savedMessages));
      const savedModel = localStorage.getItem('selected_model');
      if (savedModel) setSelectedModel(savedModel);
      const savedCustomModels = localStorage.getItem('custom_models');
      if (savedCustomModels) setCustomModels(JSON.parse(savedCustomModels));

      try {
        const handle = await getHandleFromIndexedDB();
        if (handle) {
          fileHandleRef.current = handle;
          const options = { mode: 'readwrite' as any };
          const permission = await (handle as any).queryPermission(options);
          
          if (permission === 'granted') {
            await setupDatabaseConnection(handle, false);
          } else {
            const file = await handle.getFile();
            setDbStatus({ 
              isConnected: true, 
              fileName: file.name, 
              lastSync: null, 
              status: 'error' 
            });
            
            const content = await file.text();
            if (content) {
              const data = JSON.parse(content);
              if (data.trip_plans) setItineraries(data.trip_plans);
            }
          }
        }
      } catch (err) {
        console.error("DB Auto-connect error:", err);
      }
    };
    initApp();
  }, []);

  const setupDatabaseConnection = async (handle: FileSystemFileHandle, isUserTriggered: boolean = true) => {
    try {
      const file = await handle.getFile();
      const content = await file.text();
      let data: Partial<AppData> = {};
      try { data = JSON.parse(content || '{}'); } catch (e) {}

      if (isUserTriggered && data.trip_plans && data.trip_plans.length > 0) {
        if (confirm(`已选择文件 "${file.name}"。是否导入其中的数据并开启自动同步？`)) {
          if (data.trip_plans) setItineraries(data.trip_plans);
          if (data.search_config) setSearchConfig(data.search_config);
          if (data.gemini_config) setGeminiConfig(data.gemini_config);
          if (data.amap_config) setAmapConfig(data.amap_config);
          if (data.map_provider) setMapProvider(data.map_provider);
          if (data.selected_model) setSelectedModel(data.selected_model);
          if (data.custom_models) setCustomModels(data.custom_models);
        }
      } else if (!isUserTriggered && data.trip_plans) {
        setItineraries(data.trip_plans);
        if (data.search_config) setSearchConfig(data.search_config);
        if (data.gemini_config) setGeminiConfig(data.gemini_config);
        if (data.amap_config) setAmapConfig(data.amap_config);
        if (data.map_provider) setMapProvider(data.map_provider);
      }

      fileHandleRef.current = handle;
      await saveHandleToIndexedDB(handle);
      setDbStatus({ isConnected: true, fileName: file.name, lastSync: Date.now(), status: 'ok' });
    } catch (err) {
      console.error("Setup DB error:", err);
      setDbStatus(prev => ({ ...prev, status: 'error' }));
    }
  };

  const reAuthorizeDb = async () => {
    if (fileHandleRef.current) {
      try {
        const options = { mode: 'readwrite' as any };
        const permission = await (fileHandleRef.current as any).requestPermission(options);
        if (permission === 'granted') {
          await setupDatabaseConnection(fileHandleRef.current, false);
        }
      } catch (err) {
        setError("无法获得本地文件写入授权。");
      }
    } else {
      connectDb();
    }
  };

  useEffect(() => {
    const syncData = async () => {
      const currentData: AppData = {
        trip_plans: itineraries,
        search_config: searchConfig,
        gemini_config: geminiConfig,
        amap_config: amapConfig,
        map_provider: mapProvider,
        chat_messages: chatMessages,
        selected_model: selectedModel,
        custom_models: customModels
      };
      
      localStorage.setItem('trip_plans', JSON.stringify(itineraries));
      localStorage.setItem('search_config', JSON.stringify(searchConfig));
      localStorage.setItem('gemini_config', JSON.stringify(geminiConfig));
      localStorage.setItem('amap_config', JSON.stringify(amapConfig));
      localStorage.setItem('map_provider', mapProvider);
      localStorage.setItem('chat_messages', JSON.stringify(chatMessages));
      localStorage.setItem('selected_model', selectedModel);
      localStorage.setItem('custom_models', JSON.stringify(customModels));
      
      if (activeId) {
        localStorage.setItem('active_plan_id', activeId);
      } else {
        localStorage.removeItem('active_plan_id');
      }

      if (fileHandleRef.current && dbStatus.isConnected && dbStatus.status === 'ok') {
        try {
          const writable = await fileHandleRef.current.createWritable();
          await writable.write(JSON.stringify(currentData, null, 2));
          await writable.close();
          setDbStatus(prev => ({ ...prev, lastSync: Date.now(), status: 'ok' }));
        } catch (err) {
          console.error("Sync to file error:", err);
          setDbStatus(prev => ({ ...prev, status: 'error' }));
        }
      }
    };
    const timer = setTimeout(syncData, 1000);
    return () => clearTimeout(timer);
  }, [itineraries, searchConfig, geminiConfig, amapConfig, mapProvider, chatMessages, dbStatus.isConnected, dbStatus.status, selectedModel, customModels, activeId]);

  const connectDb = async () => {
    try {
      if (!('showOpenFilePicker' in window)) {
        alert("当前浏览器不支持直接访问文件。请使用 Chrome, Edge 或 Opera 的最新版本。");
        return;
      }
      const [handle] = await (window as any).showOpenFilePicker({
        types: [{ description: 'JSON Database', accept: { 'application/json': ['.json'] } }],
        multiple: false
      });
      await setupDatabaseConnection(handle, true);
    } catch (err) {
      console.warn("User cancelled file selection.");
    }
  };

  const disconnectDb = () => {
    fileHandleRef.current = null;
    const request = indexedDB.open(DB_NAME, 1);
    request.onsuccess = () => { request.result.transaction(STORE_NAME, 'readwrite').objectStore(STORE_NAME).delete(HANDLE_KEY); };
    setDbStatus({ isConnected: false, fileName: null, lastSync: null, status: 'none' });
  };

  const handleGenerate = async (prefs: TravelPreferences) => {
    setLoading(true); setError(null);
    try {
      const { itinerary: result, workingKeyId } = await generateItinerary(prefs, selectedModel, geminiConfig);
      
      if (workingKeyId && workingKeyId !== geminiConfig.activeKeyId) {
        setGeminiConfig(prev => ({ ...prev, activeKeyId: workingKeyId }));
      }

      if (replacingId) { setItineraries(prev => prev.map(p => p.id === replacingId ? result : p)); } 
      else { setItineraries(prev => [result, ...prev]); }
      setActiveId(result.id); setDraftPrefs(null); setReplacingId(null);
      if (window.innerWidth < 1024) setSidebarOpen(false);
    } catch (err: any) { setError(err.message); } finally { setLoading(false); }
  };

  const updateItinerary = (updated: Itinerary) => {
    setItineraries(prev => prev.map(p => p.id === updated.id ? updated : p));
  };

  const togglePin = (id: string) => setItineraries(prev => prev.map(p => p.id === id ? { ...p, isPinned: !p.isPinned } : p));
  const toggleArchive = (id: string) => { setItineraries(prev => prev.map(p => p.id === id ? { ...p, isArchived: !p.isArchived } : p)); if (activeId === id) setActiveId(null); };
  const deletePlan = (id: string) => { if (confirm("永久删除该行程？")) { setItineraries(prev => prev.filter(p => p.id !== id)); if (activeId === id) setActiveId(null); } };
  const startRename = (plan: Itinerary) => { setEditingNameId(plan.id); setEditingNameValue(plan.name); };
  const saveRename = () => { if (editingNameId) { setItineraries(prev => prev.map(p => p.id === editingNameId ? { ...p, name: editingNameValue } : p)); setEditingNameId(null); } };

  const filteredItineraries = itineraries.filter(p => (p.name.toLowerCase().includes(searchTerm.toLowerCase()) || p.title.toLowerCase().includes(searchTerm.toLowerCase())) && !p.isArchived).sort((a, b) => { if (a.isPinned && !b.isPinned) return -1; if (!a.isPinned && b.isPinned) return 1; if (sortBy === 'newest') return b.createdAt - a.createdAt; if (sortBy === 'oldest') return a.createdAt - b.createdAt; return a.name.localeCompare(b.name); });

  const activePlan = itineraries.find(p => p.id === activeId);

  const selectPlan = (id: string) => {
    setActiveId(id);
    if (window.innerWidth < 1024) setSidebarOpen(false);
  };

  const handleRestart = () => {
    if (activePlan) {
      setDraftPrefs(activePlan.preferences); 
      setDraftKey(activePlan.id); 
      setReplacingId(activePlan.id); 
    }
    setActiveId(null);
  };

  return (
    <div className="flex h-screen bg-slate-50 overflow-hidden font-sans text-slate-900 relative">
      {sidebarOpen && window.innerWidth < 1024 && (
        <div 
          className="fixed inset-0 bg-slate-900/40 backdrop-blur-[2px] z-[150] lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <aside className={`fixed inset-y-0 left-0 lg:relative bg-white border-r border-slate-100 flex flex-col transition-all duration-300 shadow-2xl lg:shadow-sm z-[200] ${sidebarOpen ? 'w-[85vw] md:w-80 translate-x-0' : 'w-0 -translate-x-full lg:translate-x-0 lg:w-0 overflow-hidden'}`}>
        <div className="p-6 border-b border-slate-50 flex items-center justify-between">
          <span className="font-black text-slate-800 tracking-tight flex items-center gap-2 text-xl">智旅 <span className="text-blue-600">AI</span></span>
          <button onClick={() => { setActiveId(null); setDraftPrefs(null); setReplacingId(null); setDraftKey(crypto.randomUUID()); if (window.innerWidth < 1024) setSidebarOpen(false); }} className="p-2 bg-blue-50 text-blue-600 rounded-xl hover:bg-blue-100 transition-colors">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4"></path></svg>
          </button>
        </div>
        
        {dbStatus.isConnected && (
          <div className={`mx-4 mt-4 p-3 rounded-2xl flex flex-col gap-2 shadow-sm border ${dbStatus.status === 'ok' ? 'bg-green-50/50 border-green-100' : 'bg-amber-50/50 border-amber-100 animate-pulse'}`}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className={`w-2 h-2 rounded-full ${dbStatus.status === 'ok' ? 'bg-green-500' : 'bg-amber-500'}`}></div>
                <span className={`text-[9px] font-black uppercase tracking-tighter ${dbStatus.status === 'ok' ? 'text-green-700' : 'text-amber-700'}`}>
                  {dbStatus.status === 'ok' ? `已同步: ${dbStatus.fileName}` : '需要手动激活同步'}
                </span>
              </div>
              {dbStatus.status !== 'ok' && (
                <button onClick={reAuthorizeDb} className="text-[9px] font-black text-amber-800 underline uppercase tracking-widest decoration-amber-300 hover:decoration-amber-500">点击授权</button>
              )}
            </div>
            {dbStatus.status === 'ok' && dbStatus.lastSync && (
              <span className="text-[8px] text-green-600 font-bold">最后同步: {new Date(dbStatus.lastSync).toLocaleTimeString()}</span>
            )}
          </div>
        )}

        <div className="p-4 border-b border-slate-50 space-y-3">
          <div className="relative">
            <input type="text" placeholder="搜索行程..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-100 rounded-xl text-xs outline-none focus:ring-2 focus:ring-blue-500/20" />
            <svg className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path></svg>
          </div>
          <div className="flex gap-2">
            <select value={sortBy} onChange={(e) => setSortBy(e.target.value as any)} className="w-full bg-slate-50 border border-slate-100 rounded-xl px-2 py-1.5 text-[10px] font-bold text-slate-500 outline-none">
              <option value="newest">按日期最新</option>
              <option value="oldest">按日期最早</option>
              <option value="name">按名称排序</option>
            </select>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-2 custom-scrollbar">
          {filteredItineraries.map((p) => (
            <div key={p.id} onClick={() => selectPlan(p.id)} className={`group relative p-4 rounded-2xl cursor-pointer transition-all border ${activeId === p.id ? 'bg-slate-900 text-white border-slate-900 shadow-xl' : 'bg-white text-slate-600 border-slate-100 hover:border-blue-200'}`}>
              {p.isPinned && <div className="absolute top-2 right-2 text-blue-500"><svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20"><path d="M10 2a1 1 0 011 1v1.323l3.954 1.582 1.599-.8a1 1 0 011.082 1.637l-1.025.512a8.004 8.004 0 01-1.29 7.138 1 1 0 01-1.517-1.3l.074-.086a6.004 6.004 0 00.971-5.353l-2.714-1.086A1 1 0 0110 5.323V3a1 1 0 01-1-1z"></path></svg></div>}
              <div className="text-[10px] font-bold opacity-60 mb-1">{new Date(p.createdAt).toLocaleDateString()}</div>
              {editingNameId === p.id ? (
                <input autoFocus className="bg-white/10 text-white border-none outline-none font-bold text-sm w-full rounded px-1" value={editingNameValue} onChange={(e) => setEditingNameValue(e.target.value)} onBlur={saveRename} onKeyDown={(e) => e.key === 'Enter' && saveRename()} onClick={(e) => e.stopPropagation()} />
              ) : (
                <div className="font-bold text-sm truncate pr-4">{p.name}</div>
              )}
              <div className="mt-3 flex gap-2 lg:opacity-0 group-hover:opacity-100 transition-opacity">
                <button onClick={(e) => { e.stopPropagation(); togglePin(p.id); }} className={`p-1.5 rounded-lg transition-all ${p.isPinned ? 'bg-blue-600/20 text-blue-400' : 'bg-slate-100 text-slate-400 hover:text-blue-500'}`}><svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 2a1 1 0 011 1v1.323l3.954 1.582 1.599-.8a1 1 0 011.082 1.637l-1.025.512a8.004 8.004 0 01-1.29 7.138 1 1 0 01-1.517-1.3l.074-.086a6.004 6.004 0 00.971-5.353l-2.714-1.086A1 1 0 0110 5.323V3a1 1 0 01-1-1z"></path></svg></button>
                <button onClick={(e) => { e.stopPropagation(); startRename(p); }} className="p-1.5 rounded-lg bg-slate-100 text-slate-400 hover:text-blue-500 transition-all"><svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"></path></svg></button>
                <button onClick={(e) => { e.stopPropagation(); toggleArchive(p.id); }} className="p-1.5 rounded-lg bg-slate-100 text-slate-400 hover:text-amber-500 transition-all"><svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4"></path></svg></button>
                <button onClick={(e) => { e.stopPropagation(); deletePlan(p.id); }} className="p-1.5 rounded-lg bg-slate-100 text-slate-400 hover:text-red-500 transition-all ml-auto"><svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg></button>
              </div>
            </div>
          ))}
          {filteredItineraries.length === 0 && (<div className="py-20 text-center text-slate-300 text-xs italic">暂无行程</div>)}
        </div>

        <div className="p-4 border-t border-slate-50">
          <button onClick={() => { setShowSettings(true); if (window.innerWidth < 1024) setSidebarOpen(false); }} className="w-full p-4 flex items-center justify-between text-slate-500 hover:bg-slate-50 rounded-2xl transition-all group">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-xs group-hover:bg-blue-50 transition-colors">⚙️</div>
              <div className="text-left">
                <div className="font-black text-[10px] text-slate-800 uppercase tracking-widest leading-none mb-1">系统设置</div>
                <div className="text-[9px] text-slate-400 font-bold">Key与数据管理</div>
              </div>
            </div>
            <svg className="w-4 h-4 text-slate-300 group-hover:text-blue-400 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7"></path></svg>
          </button>
        </div>
      </aside>

      <main className="flex-1 flex flex-col h-full relative overflow-hidden w-full">
        <button 
          onClick={() => setSidebarOpen(!sidebarOpen)} 
          className="absolute left-4 top-4 z-[100] p-3 bg-white/80 backdrop-blur-md border border-slate-100 rounded-2xl shadow-lg hover:bg-white transition-all active:scale-95"
        >
          <svg className="w-5 h-5 text-slate-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d={sidebarOpen ? "M6 18L18 6M6 6l12 12" : "M4 6h16M4 12h16M4 18h16"}></path>
          </svg>
        </button>

        <div className="flex-1 overflow-y-auto p-4 md:p-8 pt-20 lg:pt-8 custom-scrollbar">
          {!activeId ? (
            <div className="max-w-6xl mx-auto h-full flex flex-col justify-center gap-8 md:gap-12 py-12">
              <div className="space-y-2">
                <h1 className="text-4xl md:text-7xl font-black text-slate-900 leading-none tracking-tighter text-center md:text-left">
                  智旅 AI <span className="text-blue-600 block md:inline">探险家</span>
                </h1>
                <p className="text-slate-400 text-sm md:text-lg font-bold text-center md:text-left">开启智能、深度、且富有个性的旅程。</p>
              </div>
              <div className="max-w-xl mx-auto md:mx-0 w-full">
                <PreferenceForm key={draftKey} initialPrefs={draftPrefs || undefined} onSubmit={handleGenerate} isLoading={loading} />
                {error && <div className="mt-4 p-4 bg-red-50 text-red-700 rounded-xl text-sm font-bold border border-red-100 animate-pulse">{error}</div>}
              </div>
            </div>
          ) : (
            activePlan && (
              <ItineraryView 
                itinerary={activePlan} 
                destination={activePlan.days[0]?.activities[0]?.location || 'Travel'} 
                onUpdate={updateItinerary} 
                onRestart={handleRestart} 
                geminiConfig={geminiConfig} 
                onUpdateGeminiConfig={setGeminiConfig} 
                model={selectedModel}
                mapProvider={mapProvider}
              />
            )
          )}
        </div>
      </main>

      <AiAssistant 
        activePlan={activePlan || null} 
        onUpdatePlan={updateItinerary} 
        model={selectedModel} 
        geminiConfig={geminiConfig} 
        onUpdateGeminiConfig={setGeminiConfig}
      />

      {showSettings && (
        <ApiKeySettings 
          onClose={() => setShowSettings(false)}
          searchConfig={searchConfig} onUpdateSearchConfig={setSearchConfig}
          geminiConfig={geminiConfig} onUpdateGeminiConfig={setGeminiConfig}
          amapConfig={amapConfig} onUpdateAmapConfig={setAmapConfig}
          mapProvider={mapProvider} onUpdateMapProvider={setMapProvider}
          selectedModel={selectedModel} onSelectModel={setSelectedModel}
          customModels={customModels} onUpdateCustomModels={setCustomModels}
          dbStatus={dbStatus} onConnectDb={connectDb} onDisconnectDb={disconnectDb}
          itineraries={itineraries} onToggleArchive={toggleArchive} onDeletePlan={deletePlan}
        />
      )}
    </div>
  );
};

export default App;
