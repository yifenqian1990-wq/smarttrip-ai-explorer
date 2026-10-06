import React, { useState, useRef } from 'react';
import { ApiKeyItem, SearchEngine, SearchConfig, GeminiConfig, AppData, DbStatus, GeminiModel, ModelEntry, Itinerary, AMapConfig, MapProvider } from '../types';

interface Props {
  onClose: () => void;
  searchConfig: SearchConfig;
  onUpdateSearchConfig: (config: SearchConfig) => void;
  geminiConfig: GeminiConfig;
  onUpdateGeminiConfig: (config: GeminiConfig) => void;
  amapConfig: AMapConfig;
  onUpdateAmapConfig: (config: AMapConfig) => void;
  mapProvider: MapProvider;
  onUpdateMapProvider: (provider: MapProvider) => void;
  selectedModel: GeminiModel;
  onSelectModel: (model: GeminiModel) => void;
  customModels: ModelEntry[];
  onUpdateCustomModels: (models: ModelEntry[]) => void;
  dbStatus: DbStatus;
  onConnectDb: () => Promise<void>;
  onDisconnectDb: () => void;
  itineraries: Itinerary[];
  onToggleArchive: (id: string) => void;
  onDeletePlan: (id: string) => void;
}

const ApiKeySettings: React.FC<Props> = ({ 
  onClose, 
  searchConfig, 
  onUpdateSearchConfig,
  geminiConfig,
  onUpdateGeminiConfig,
  amapConfig,
  onUpdateAmapConfig,
  mapProvider,
  onUpdateMapProvider,
  selectedModel,
  onSelectModel,
  customModels,
  onUpdateCustomModels,
  dbStatus,
  onConnectDb,
  onDisconnectDb,
  itineraries,
  onToggleArchive,
  onDeletePlan
}) => {
  const [activeTab, setActiveTab] = useState<'gemini' | 'search' | 'map' | 'archived' | 'storage'>('gemini');
  const [newLabel, setNewLabel] = useState('');
  const [newKey, setNewKey] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showKeyContent, setShowKeyContent] = useState(false);
  const [revealedKeyId, setRevealedKeyId] = useState<string | null>(null);

  const [isEditingModel, setIsEditingModel] = useState<string | null>(null);
  const [editModelName, setEditModelName] = useState('');
  const [editModelVersion, setEditModelVersion] = useState('');
  const [editModelDesc, setEditModelDesc] = useState('');
  const [isAddingNewModel, setIsAddingNewModel] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const archivedItineraries = itineraries.filter(i => i.isArchived);

  const handleGeminiAction = () => {
    if (!newLabel || !newKey) return;
    let updatedKeys: ApiKeyItem[];
    if (editingId) {
      updatedKeys = geminiConfig.keys.map(k => k.id === editingId ? { ...k, label: newLabel, key: newKey } : k);
    } else {
      const item: ApiKeyItem = { id: crypto.randomUUID(), label: newLabel, key: newKey, createdAt: Date.now() };
      updatedKeys = [...geminiConfig.keys, item];
    }
    onUpdateGeminiConfig({ ...geminiConfig, keys: updatedKeys, activeKeyId: geminiConfig.activeKeyId || (updatedKeys.length > 0 ? updatedKeys[0].id : null) });
    setNewLabel(''); setNewKey(''); setEditingId(null);
  };

  const handleSearchAction = () => {
    if (!newLabel || !newKey) return;
    let updatedKeys: ApiKeyItem[];
    if (editingId) {
      updatedKeys = searchConfig.keys.map(k => k.id === editingId ? { ...k, label: newLabel, key: newKey } : k);
    } else {
      const item: ApiKeyItem = { id: crypto.randomUUID(), label: newLabel, key: newKey, createdAt: Date.now() };
      updatedKeys = [...searchConfig.keys, item];
    }
    onUpdateSearchConfig({ ...searchConfig, keys: updatedKeys, activeKeyId: searchConfig.activeKeyId || (updatedKeys.length > 0 ? updatedKeys[0].id : null) });
    setNewLabel(''); setNewKey(''); setEditingId(null);
  };

  const startEditKey = (k: ApiKeyItem) => {
    setEditingId(k.id);
    setNewLabel(k.label);
    setNewKey(k.key);
    setShowKeyContent(true);
  };

  const handleSaveModel = () => {
    if (!editModelName || !editModelVersion) return;
    if (isEditingModel) {
      onUpdateCustomModels(customModels.map(m => m.id === isEditingModel ? { ...m, name: editModelName, versionId: editModelVersion, desc: editModelDesc } : m));
    } else {
      const newModel: ModelEntry = { id: crypto.randomUUID(), name: editModelName, versionId: editModelVersion, desc: editModelDesc };
      onUpdateCustomModels([...customModels, newModel]);
    }
    resetModelForm();
  };

  const resetModelForm = () => { setIsEditingModel(null); setIsAddingNewModel(false); setEditModelName(''); setEditModelVersion(''); setEditModelDesc(''); };

  const startEditModel = (m: ModelEntry) => { setIsEditingModel(m.id); setEditModelName(m.name); setEditModelVersion(m.versionId); setEditModelDesc(m.desc); };

  const deleteModel = (id: string) => {
    if (confirm('确定要删除此模型版本吗？')) {
      onUpdateCustomModels(customModels.filter(m => m.id !== id));
      if (customModels.find(m => m.id === id)?.versionId === selectedModel) {
         const remaining = customModels.filter(m => m.id !== id);
         if (remaining.length > 0) onSelectModel(remaining[0].versionId);
      }
    }
  };

  const handleExport = () => {
    const data: AppData = {
      trip_plans: itineraries,
      search_config: searchConfig,
      gemini_config: geminiConfig,
      amap_config: amapConfig,
      map_provider: mapProvider,
      chat_messages: JSON.parse(localStorage.getItem('chat_messages') || '[]'),
      selected_model: selectedModel,
      custom_models: customModels
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `smart-trip-backup-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const data: AppData = JSON.parse(event.target?.result as string);
        if (confirm('导入将覆盖当前所有行程和设置（含密钥）。确定继续吗？')) {
          localStorage.setItem('trip_plans', JSON.stringify(data.trip_plans || []));
          localStorage.setItem('search_config', JSON.stringify(data.search_config));
          localStorage.setItem('gemini_config', JSON.stringify(data.gemini_config));
          localStorage.setItem('amap_config', JSON.stringify(data.amap_config));
          localStorage.setItem('map_provider', data.map_provider || 'AMap');
          localStorage.setItem('selected_model', data.selected_model || 'gemini-3-flash-preview');
          localStorage.setItem('custom_models', JSON.stringify(data.custom_models || []));
          window.location.reload();
        }
      } catch (err) { alert('导入失败：文件格式不正确'); }
    };
    reader.readAsText(file);
  };

  const renderKeyVault = (keys: ApiKeyItem[], activeId: string | null, onSetActive: (id: string) => void, onDelete: (id: string) => void) => (
    <div className="bg-slate-50/50 border border-slate-100 rounded-3xl overflow-hidden mt-6">
      <div className="p-4 bg-white/60 border-b border-slate-100 flex items-center justify-between">
        <div className="flex items-center gap-2 text-slate-700 font-bold text-sm">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z"></path></svg>
          密钥存储库
        </div>
        <div className="text-[10px] font-black bg-slate-100 px-2 py-1 rounded-full text-slate-400">{keys.length}</div>
      </div>
      <div className="max-h-56 overflow-y-auto custom-scrollbar">
        {keys.map(k => (
          <div key={k.id} onClick={() => onSetActive(k.id)} className={`p-4 border-b border-slate-50 flex items-center justify-between cursor-pointer transition-all hover:bg-white ${activeId === k.id ? 'bg-blue-50/50 ring-1 ring-inset ring-blue-100' : ''}`}>
            <div className="flex-1 space-y-1">
              <div className="flex items-center gap-2">
                <span className={`text-sm font-bold ${activeId === k.id ? 'text-blue-600' : 'text-slate-700'}`}>{k.label}</span>
                {activeId === k.id && <span className="text-[9px] font-bold px-1.5 py-0.5 bg-blue-100 text-blue-600 rounded flex items-center gap-1">使用中</span>}
                {editingId === k.id && <span className="text-[9px] font-bold px-1.5 py-0.5 bg-amber-100 text-amber-600 rounded flex items-center gap-1">编辑中</span>}
              </div>
              <div className="flex items-center gap-2">
                <div className="px-2 py-0.5 bg-slate-100 rounded text-[10px] text-slate-400 font-mono break-all">
                  {revealedKeyId === k.id ? k.key : `${k.key.slice(0, 4)}...${k.key.slice(-4)}`}
                </div>
              </div>
            </div>
            <div className="flex gap-1 ml-2">
              <button 
                onClick={(e) => { e.stopPropagation(); setRevealedKeyId(revealedKeyId === k.id ? null : k.id); }} 
                className={`p-2 rounded-lg transition-colors ${revealedKeyId === k.id ? 'text-blue-500 bg-blue-50' : 'text-slate-300 hover:text-blue-500'}`}
                title="查看密钥"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  {revealedKeyId === k.id ? (
                    <path d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l18 18"></path>
                  ) : (
                    <path d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path>
                  )}
                  {!revealedKeyId || revealedKeyId !== k.id ? <path d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268-2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542 7-4.477 0-8.268-2.943-9.542-7z"></path> : null}
                </svg>
              </button>
              <button onClick={(e) => { e.stopPropagation(); startEditKey(k); }} className="p-2 text-slate-300 hover:text-amber-500 transition-colors" title="编辑密钥">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"></path></svg>
              </button>
              <button onClick={(e) => { e.stopPropagation(); onDelete(k.id); }} className="p-2 text-slate-300 hover:text-red-500 transition-colors" title="删除密钥">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
              </button>
            </div>
          </div>
        ))}
        {keys.length === 0 && <div className="p-8 text-center text-slate-300 text-xs italic">暂无密钥存储</div>}
      </div>
      <div className={`p-4 bg-white/40 flex flex-col md:flex-row gap-2 border-t border-slate-100 ${editingId ? 'bg-amber-50/30' : ''}`}>
        <div className="flex gap-2 flex-1">
          <input placeholder="密钥标识" className="w-1/3 px-3 py-2 bg-white border border-slate-100 rounded-xl text-xs outline-none focus:ring-2 focus:ring-blue-500/20" value={newLabel} onChange={(e) => setNewLabel(e.target.value)} />
          <div className="flex-1 relative">
             <input placeholder="输入 API Key..." type={showKeyContent ? "text" : "password"} className="w-full px-3 py-2 bg-white border border-slate-100 rounded-xl text-xs font-mono outline-none focus:ring-2 focus:ring-blue-500/20 pr-8" value={newKey} onChange={(e) => setNewKey(e.target.value)} />
             <button onClick={() => setShowKeyContent(!showKeyContent)} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-300 hover:text-slate-500">
               {showKeyContent ? (
                 <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l18 18"></path></svg>
               ) : (
                 <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path><path d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268-2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542 7-4.477 0-8.268-2.943-9.542-7z"></path></svg>
               )}
             </button>
          </div>
        </div>
        <div className="flex gap-2">
          {editingId && (
            <button onClick={() => { setEditingId(null); setNewLabel(''); setNewKey(''); }} className="px-4 py-2 bg-slate-200 text-slate-600 rounded-xl text-xs font-bold hover:bg-slate-300 transition-all">取消</button>
          )}
          <button onClick={activeTab === 'gemini' ? handleGeminiAction : handleSearchAction} className="flex-1 bg-slate-900 text-white px-4 py-2 rounded-xl text-xs font-bold hover:bg-slate-800 transition-all active:scale-95">
            {editingId ? '保存' : '添加'}
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4 animate-fade-in text-slate-800">
      <div className="bg-white w-full max-w-2xl rounded-[3rem] shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        <div className="flex border-b border-slate-100 px-4 overflow-x-auto no-scrollbar">
          <button onClick={() => setActiveTab('gemini')} className={`shrink-0 px-6 py-6 text-xs font-black uppercase tracking-widest transition-all ${activeTab === 'gemini' ? 'text-blue-600 border-b-2 border-blue-600' : 'text-slate-400 hover:text-slate-600'}`}>模型密钥</button>
          <button onClick={() => setActiveTab('search')} className={`shrink-0 px-6 py-6 text-xs font-black uppercase tracking-widest transition-all ${activeTab === 'search' ? 'text-blue-600 border-b-2 border-blue-600' : 'text-slate-400 hover:text-slate-600'}`}>联网搜索</button>
          <button onClick={() => setActiveTab('map')} className={`shrink-0 px-6 py-6 text-xs font-black uppercase tracking-widest transition-all ${activeTab === 'map' ? 'text-blue-600 border-b-2 border-blue-600' : 'text-slate-400 hover:text-slate-600'}`}>地图设置</button>
          <button onClick={() => setActiveTab('archived')} className={`shrink-0 px-6 py-6 text-xs font-black uppercase tracking-widest transition-all ${activeTab === 'archived' ? 'text-blue-600 border-b-2 border-blue-600' : 'text-slate-400 hover:text-slate-600'}`}>归档中心{archivedItineraries.length > 0 && <span className="ml-2 px-1.5 py-0.5 bg-slate-100 text-slate-400 rounded-md text-[9px]">{archivedItineraries.length}</span>}</button>
          <button onClick={() => setActiveTab('storage')} className={`shrink-0 px-6 py-6 text-xs font-black uppercase tracking-widest transition-all ${activeTab === 'storage' ? 'text-blue-600 border-b-2 border-blue-600' : 'text-slate-400 hover:text-slate-600'}`}>数据存储</button>
          <button onClick={onClose} className="ml-auto p-4 text-slate-300 hover:text-slate-600 transition-colors"><svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 18L18 6M6 6l12 12"></path></svg></button>
        </div>

        <div className="p-10 overflow-y-auto custom-scrollbar flex-1">
          {activeTab === 'gemini' && (
            <div className="space-y-8 animate-fade-in">
              <div className="flex items-center justify-between">
                <div><h3 className="text-2xl font-black text-slate-900 tracking-tight">模型配置</h3><p className="text-xs text-slate-400 mt-1">定制可用的 Gemini AI 推理引擎。</p></div>
                {!isAddingNewModel && !isEditingModel && (<button onClick={() => setIsAddingNewModel(true)} className="px-5 py-2.5 bg-blue-50 text-blue-600 rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-blue-100 transition-all">新增模型版本</button>)}
              </div>
              {(isAddingNewModel || isEditingModel) && (
                <div className="p-6 bg-slate-50 border border-blue-100 rounded-3xl space-y-4 animate-fade-in">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1"><label className="text-[10px] font-bold text-slate-400 uppercase">显示名称</label><input value={editModelName} onChange={(e) => setEditModelName(e.target.value)} placeholder="如: Gemini 2.5 Flash" className="w-full px-4 py-2 bg-white border border-slate-200 rounded-xl text-xs outline-none" /></div>
                    <div className="space-y-1"><label className="text-[10px] font-bold text-slate-400 uppercase">模型版本 ID</label><input value={editModelVersion} onChange={(e) => setEditModelVersion(e.target.value)} placeholder="gemini-..." className="w-full px-4 py-2 bg-white border border-slate-200 rounded-xl text-xs font-mono outline-none" /></div>
                  </div>
                  <button onClick={handleSaveModel} className="w-full py-3 bg-blue-600 text-white rounded-xl text-xs font-black shadow-lg shadow-blue-100">保存配置</button>
                </div>
              )}
              <div className="grid grid-cols-1 gap-3">
                {customModels.map(m => (
                  <div key={m.id} className={`group p-5 rounded-[2rem] border-2 transition-all flex items-center justify-between ${selectedModel === m.versionId ? 'border-blue-600 bg-blue-50/20' : 'border-slate-50 bg-white hover:border-blue-100'}`}>
                    <div className="flex-1 cursor-pointer" onClick={() => onSelectModel(m.versionId)}>
                      <div className="flex items-center gap-3"><div className="text-sm font-black text-slate-800">{m.name}</div>{selectedModel === m.versionId && <span className="text-[8px] font-black bg-blue-600 text-white px-1.5 py-0.5 rounded-full uppercase">当前使用</span>}</div>
                      <div className="text-[10px] font-mono text-slate-400 mt-1">{m.versionId}</div>
                    </div>
                    <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-all">
                      <button onClick={(e) => { e.stopPropagation(); startEditModel(m); }} className="p-2 text-slate-400 hover:text-blue-600 rounded-xl transition-colors"><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"></path></svg></button>
                      <button onClick={(e) => { e.stopPropagation(); deleteModel(m.id); }} className="p-2 text-slate-400 hover:text-red-600 rounded-xl transition-colors"><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg></button>
                    </div>
                  </div>
                ))}
              </div>
              {renderKeyVault(geminiConfig.keys, geminiConfig.activeKeyId, (id) => onUpdateGeminiConfig({ ...geminiConfig, activeKeyId: id }), (id) => onUpdateGeminiConfig({ ...geminiConfig, keys: geminiConfig.keys.filter(k => k.id !== id), activeKeyId: geminiConfig.activeKeyId === id ? null : geminiConfig.activeKeyId }))}
            </div>
          )}

          {activeTab === 'search' && (
            <div className="space-y-8 animate-fade-in">
              <div><h3 className="text-2xl font-black text-slate-900 tracking-tight">联网搜索优化</h3><p className="text-xs text-slate-400 mt-1">开启 AI 的广阔视野，获取最新旅游咨询与实时价格。</p></div>
              <div className="flex gap-3 p-2 bg-slate-50 rounded-[1.8rem] border">{(['Google Custom', 'Tavily AI'] as SearchEngine[]).map(eng => (<button key={eng} onClick={() => onUpdateSearchConfig({ ...searchConfig, engine: eng })} className={`flex-1 py-3 text-xs font-black rounded-2xl transition-all ${searchConfig.engine === eng ? 'bg-white shadow-md text-blue-600' : 'text-slate-400'}`}>{eng}</button>))}</div>
              {searchConfig.engine === 'Google Custom' && (<div className="space-y-3"><label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Programmable Search Engine ID (CX)</label><input placeholder="请输入 CX ID..." className="w-full px-5 py-4 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-mono outline-none focus:ring-2 focus:ring-blue-500/20" value={searchConfig.cx || ''} onChange={(e) => onUpdateSearchConfig({ ...searchConfig, cx: e.target.value })} /></div>)}
              {renderKeyVault(searchConfig.keys, searchConfig.activeKeyId, (id) => onUpdateSearchConfig({ ...searchConfig, activeKeyId: id }), (id) => onUpdateSearchConfig({ ...searchConfig, keys: searchConfig.keys.filter(k => k.id !== id), activeKeyId: searchConfig.activeKeyId === id ? null : searchConfig.activeKeyId }))}
            </div>
          )}

          {activeTab === 'map' && (
            <div className="space-y-8 animate-fade-in">
              <div><h3 className="text-2xl font-black text-slate-900 tracking-tight">地图引擎配置</h3><p className="text-xs text-slate-400 mt-1">选择渲染引擎及配置相关接口 Key。</p></div>
              
              <div className="space-y-6">
                <div>
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3 block">地图引擎选择</label>
                  <div className="flex gap-3 p-2 bg-slate-50 rounded-[1.8rem] border">
                    {(['AMap', 'Leaflet'] as MapProvider[]).map(provider => (
                      <button 
                        key={provider} 
                        onClick={() => onUpdateMapProvider(provider)} 
                        className={`flex-1 py-3 text-xs font-black rounded-2xl transition-all ${mapProvider === provider ? 'bg-white shadow-md text-blue-600' : 'text-slate-400'}`}
                      >
                        {provider === 'AMap' ? '高德地图 (国内优选)' : 'OSM (国际化)'}
                      </button>
                    ))}
                  </div>
                </div>

                {mapProvider === 'AMap' ? (
                  <div className="p-8 bg-slate-50 border border-slate-100 rounded-[2.5rem] space-y-6">
                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Web 端 API Key (JS API)</label>
                      <input 
                        type="password"
                        placeholder="请输入 JS API Key..." 
                        className="w-full px-5 py-4 bg-white border border-slate-200 rounded-2xl text-xs font-mono outline-none focus:ring-2 focus:ring-blue-500/20" 
                        value={amapConfig.key} 
                        onChange={(e) => onUpdateAmapConfig({ ...amapConfig, key: e.target.value })} 
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">安全密钥 (Security JS Code)</label>
                      <input 
                        type="password"
                        placeholder="请输入 Security Code..." 
                        className="w-full px-5 py-4 bg-white border border-slate-200 rounded-2xl text-xs font-mono outline-none focus:ring-2 focus:ring-blue-500/20" 
                        value={amapConfig.securityCode} 
                        onChange={(e) => onUpdateAmapConfig({ ...amapConfig, securityCode: e.target.value })} 
                      />
                    </div>
                  </div>
                ) : (
                  <div className="p-8 bg-blue-50 border border-blue-100 rounded-[2.5rem] flex items-center gap-4">
                    <div className="w-12 h-12 bg-white rounded-2xl flex items-center justify-center text-xl shadow-sm">🌍</div>
                    <div className="flex-1">
                      <div className="text-sm font-black text-blue-900">Leaflet + OpenStreetMap</div>
                      <p className="text-[10px] font-bold text-blue-600/70 mt-1">无需 API Key，适用于海外访问及开源爱好者。支持基础点位展示与直线路径规划。</p>
                    </div>
                  </div>
                )}
                
                <div className="p-4 bg-blue-50 rounded-2xl flex gap-3 items-start">
                   <span className="text-lg">ℹ️</span>
                   <p className="text-[10px] font-bold text-blue-600 leading-relaxed">
                     修改引擎后建议刷新页面或重新进入行程。高德地图功能最为强大，支持真实的导航路网计算。
                   </p>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'archived' && (
            <div className="space-y-8 animate-fade-in">
              <div><h3 className="text-2xl font-black text-slate-900 tracking-tight">归档行程</h3><p className="text-xs text-slate-400 mt-1">这里存储了您已完成或暂时不需要的探险计划。</p></div>
              <div className="grid grid-cols-1 gap-4">
                {archivedItineraries.map(i => (
                  <div key={i.id} className="p-6 bg-white border border-slate-100 rounded-[2.5rem] shadow-sm flex items-center justify-between group hover:shadow-xl transition-all duration-300">
                    <div className="space-y-1"><div className="text-sm font-black text-slate-800">{i.name}</div><div className="text-[10px] text-slate-400 font-bold">归档于: {new Date(i.createdAt).toLocaleDateString()}</div><p className="text-[10px] text-slate-400 mt-1 line-clamp-1 italic max-w-sm">“{i.summary}”</p></div>
                    <div className="flex gap-2"><button onClick={() => onToggleArchive(i.id)} className="px-4 py-2 bg-blue-50 text-blue-600 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-blue-600 hover:text-white transition-all">恢复计划</button><button onClick={() => onDeletePlan(i.id)} className="p-2 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all"><svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg></button></div>
                  </div>
                ))}
                {archivedItineraries.length === 0 && (<div className="py-20 text-center space-y-4"><div className="w-16 h-16 bg-slate-50 text-slate-200 rounded-full flex items-center justify-center mx-auto text-3xl">🗄️</div><div className="text-xs font-bold text-slate-300 italic">空空如也，这里没有被遗忘的行程</div></div>)}
              </div>
            </div>
          )}

          {activeTab === 'storage' && (
            <div className="space-y-8 animate-fade-in">
              <div><h3 className="text-2xl font-black text-slate-900 tracking-tight">本地云同步</h3><p className="text-xs text-slate-400 mt-1">配置本地 JSON 数据库，让数据在磁盘上实时持久化。{!( 'showOpenFilePicker' in window) && <span className="text-amber-500 ml-1 font-bold">(当前环境可能限制访问)</span>}</p></div>
              <div className={`p-8 rounded-[2.5rem] border-2 transition-all flex items-center justify-between ${dbStatus.isConnected ? 'bg-green-50/20 border-green-500 shadow-xl shadow-green-100' : 'bg-slate-50 border-slate-100 cursor-pointer hover:border-blue-300'}`} onClick={!dbStatus.isConnected ? onConnectDb : undefined}>
                <div className="flex items-center gap-6">
                  <div className={`w-16 h-16 rounded-3xl flex items-center justify-center text-3xl ${dbStatus.isConnected ? 'bg-white text-green-500 shadow-lg' : 'bg-white text-slate-300 shadow-inner'}`}><svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4"></path></svg></div>
                  <div>
                    <div className="text-sm font-black text-slate-800">{dbStatus.isConnected ? dbStatus.fileName : '连接本地文件数据库'}</div>
                    <div className="text-[10px] font-bold text-slate-400 mt-1 uppercase tracking-widest">{dbStatus.isConnected ? `状态: ${dbStatus.status === 'ok' ? '实时同步中' : '等待权限授权'}` : '点击选择磁盘文件建立同步'}</div>
                  </div>
                </div>
                {dbStatus.isConnected && <button onClick={(e) => { e.stopPropagation(); onDisconnectDb(); }} className="px-5 py-2.5 bg-red-50 text-red-600 rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-red-600 hover:text-white transition-all">断开连接</button>}
              </div>
              <div className="grid grid-cols-2 gap-6 pt-4">
                <button onClick={handleExport} className="p-8 bg-white border border-slate-100 rounded-[2.5rem] shadow-sm hover:shadow-xl transition-all flex flex-col items-center gap-3"><div className="w-12 h-12 bg-blue-50 text-blue-500 rounded-2xl flex items-center justify-center text-xl">💾</div><div className="text-xs font-black text-slate-800 text-center">全量导出数据 (.json)</div></button>
                <button onClick={() => fileInputRef.current?.click()} className="p-8 bg-white border border-slate-100 rounded-[2.5rem] shadow-sm hover:shadow-xl transition-all flex flex-col items-center gap-3"><div className="w-12 h-12 bg-purple-50 text-purple-500 rounded-2xl flex items-center justify-center text-xl">☁️</div><div className="text-xs font-black text-slate-800 text-center">手动恢复/覆盖数据</div><input type="file" ref={fileInputRef} onChange={handleImport} accept=".json" className="hidden" /></button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ApiKeySettings;