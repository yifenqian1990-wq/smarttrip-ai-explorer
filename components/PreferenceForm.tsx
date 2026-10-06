
import React, { useState, useEffect } from 'react';
import { TravelPreferences } from '../types';

interface Props {
  onSubmit: (prefs: TravelPreferences) => void;
  isLoading: boolean;
  initialPrefs?: TravelPreferences;
}

const PreferenceForm: React.FC<Props> = ({ onSubmit, isLoading, initialPrefs }) => {
  const [startLocation, setStartLocation] = useState(initialPrefs?.startLocation || '');
  const [destinations, setDestinations] = useState<string[]>(initialPrefs?.destinations || ['']);
  const [duration, setDuration] = useState(initialPrefs?.duration || 3);
  const [startDate, setStartDate] = useState(initialPrefs?.startDate || new Date().toISOString().split('T')[0]);
  const [budget, setBudget] = useState<TravelPreferences['budget']>(initialPrefs?.budget || '舒适型');
  const [style, setStyle] = useState<TravelPreferences['style']>(initialPrefs?.style || '文化');
  const [interests, setInterests] = useState<string[]>(initialPrefs?.interests || []);
  const [accommodationType, setAccommodationType] = useState<TravelPreferences['accommodationType']>(initialPrefs?.accommodationType || '精品酒店');
  const [transportation, setTransportation] = useState<TravelPreferences['transportation']>(initialPrefs?.transportation || '公共交通');
  const [adults, setAdults] = useState(initialPrefs?.adults || 2);
  const [children, setChildren] = useState(initialPrefs?.children || 0);
  const [hasPets, setHasPets] = useState(initialPrefs?.hasPets || false);
  const [customRequirements, setCustomRequirements] = useState(initialPrefs?.customRequirements || '');
  const [detecting, setDetecting] = useState(false);
  const [currentAddress, setCurrentAddress] = useState<string | null>(null);

  const interestOptions = ['美食', '历史', '夜生活', '徒步', '购物', '博物馆', '海滩', '艺术'];
  const accommodationOptions: TravelPreferences['accommodationType'][] = ['民宿', '精品酒店', '豪华酒店', '青年旅舍'];
  const transportOptions: TravelPreferences['transportation'][] = ['公共交通', '租车自驾', '私车自驾', '步行/骑行', '包车'];

  useEffect(() => {
    if (initialPrefs) {
      setStartLocation(initialPrefs.startLocation);
      setDestinations(initialPrefs.destinations);
      setDuration(initialPrefs.duration);
      setStartDate(initialPrefs.startDate);
      setBudget(initialPrefs.budget);
      setStyle(initialPrefs.style);
      setInterests(initialPrefs.interests);
      setAccommodationType(initialPrefs.accommodationType);
      setTransportation(initialPrefs.transportation);
      setAdults(initialPrefs.adults);
      setChildren(initialPrefs.children);
      setHasPets(initialPrefs.hasPets);
      setCustomRequirements(initialPrefs.customRequirements || '');
    }
  }, [initialPrefs]);

  useEffect(() => {
    if (!initialPrefs) detectLocation(true);
  }, []);

  const detectLocation = (isSilent = false) => {
    if (!isSilent) setDetecting(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          const response = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${pos.coords.latitude}&lon=${pos.coords.longitude}&addressdetails=1`, {
            headers: { 'Accept-Language': 'zh-CN,zh;q=0.9' }
          });
          const data = await response.json();
          const address = data.display_name || `${pos.coords.latitude.toFixed(4)}, ${pos.coords.longitude.toFixed(4)}`;
          setCurrentAddress(address);
          if (!isSilent) setStartLocation(address);
        } catch (err) {
          const fallback = `${pos.coords.latitude.toFixed(4)}, ${pos.coords.longitude.toFixed(4)}`;
          setCurrentAddress(fallback);
          if (!isSilent) setStartLocation(fallback);
        } finally {
          if (!isSilent) setDetecting(false);
        }
      },
      () => {
        if (!isSilent) {
          alert("无法获取位置，请手动输入。");
          setDetecting(false);
        }
      }
    );
  };

  const handleAddDestination = () => setDestinations([...destinations, '']);
  const handleRemoveDestination = (index: number) => {
    const newDests = destinations.filter((_, i) => i !== index);
    setDestinations(newDests.length ? newDests : ['']);
  };
  const handleDestChange = (index: number, val: string) => {
    const newDests = [...destinations];
    newDests[index] = val;
    setDestinations(newDests);
  };

  const toggleInterest = (interest: string) => {
    setInterests(prev => 
      prev.includes(interest) ? prev.filter(i => i !== interest) : [...prev, interest]
    );
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const filteredDests = destinations.filter(d => d.trim() !== '');
    if (filteredDests.length === 0) return;
    onSubmit({ 
      startLocation: startLocation.trim() || currentAddress || '当前位置',
      destinations: filteredDests, 
      duration, 
      startDate, 
      budget, 
      style, 
      interests, 
      accommodationType, 
      transportation,
      adults,
      children,
      hasPets,
      customRequirements: customRequirements.trim() || undefined
    });
  };

  return (
    <form onSubmit={handleSubmit} className="glass p-5 md:p-10 rounded-[2rem] md:rounded-[3.5rem] shadow-2xl border border-white/50 space-y-6 md:space-y-8 animate-fade-in max-h-[85vh] overflow-y-auto custom-scrollbar">
      {currentAddress && !initialPrefs && (
        <div className="bg-blue-50/50 p-4 rounded-2xl border border-blue-100 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 overflow-hidden">
            <div className="shrink-0 w-2 h-2 bg-blue-500 rounded-full animate-pulse"></div>
            <span className="text-[10px] font-black text-blue-600 uppercase truncate tracking-widest">
              当前所在位置: {currentAddress}
            </span>
          </div>
          <button type="button" onClick={() => setStartLocation(currentAddress)} className="shrink-0 text-[10px] font-black text-blue-700 hover:text-blue-900 transition-colors">使用</button>
        </div>
      )}

      <div className="space-y-6">
        <div>
          <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">您的旅程轨迹</label>
          <div className="flex gap-2 mb-3">
            <input type="text" value={startLocation} onChange={(e) => setStartLocation(e.target.value)} placeholder="起始城市" className="flex-1 px-4 py-3 bg-white/50 rounded-xl md:rounded-2xl border border-slate-200 outline-none focus:ring-4 focus:ring-blue-500/10 font-bold text-sm" required />
            <button type="button" onClick={() => detectLocation(false)} className="px-4 py-3 bg-white border border-slate-200 rounded-xl md:rounded-2xl hover:bg-slate-50 transition-all active:scale-95 shadow-sm">
              <svg className={`w-5 h-5 text-slate-500 ${detecting ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"></path></svg>
            </button>
          </div>
          <div className="space-y-3">
            {destinations.map((dest, index) => (
              <div key={index} className="flex gap-2 animate-fade-in">
                <input type="text" value={dest} onChange={(e) => handleDestChange(index, e.target.value)} placeholder={`目的地 ${index + 1}`} className="flex-1 px-4 py-3 bg-white/50 rounded-xl md:rounded-2xl border border-slate-200 outline-none focus:ring-4 focus:ring-blue-500/10 font-bold text-sm" required={index === 0} />
                {destinations.length > 1 && (
                  <button type="button" onClick={() => handleRemoveDestination(index)} className="p-2 text-slate-300 hover:text-red-500 transition-colors"><svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg></button>
                )}
              </div>
            ))}
            <button type="button" onClick={handleAddDestination} className="text-[10px] font-black text-blue-600 uppercase flex items-center gap-2 hover:text-blue-700 transition-colors ml-1 mt-1">
              <div className="w-4 h-4 bg-blue-100 rounded-full flex items-center justify-center text-[8px]">+</div>
              添加多个目的地
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 md:gap-6">
          <div>
            <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">停留天数</label>
            <input type="number" min="1" max="21" value={duration} onChange={(e) => setDuration(parseInt(e.target.value))} className="w-full px-4 py-3 bg-white/50 rounded-xl md:rounded-2xl border border-slate-200 font-bold text-sm" />
          </div>
          <div>
            <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">出发日期</label>
            <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="w-full px-4 py-3 bg-white/50 rounded-xl md:rounded-2xl border border-slate-200 font-bold text-sm" />
          </div>
        </div>

        <div>
          <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">旅行规模</label>
          <div className="grid grid-cols-3 gap-3 md:gap-4">
            <div className="bg-white/40 p-2 md:p-3 rounded-xl md:rounded-2xl border border-slate-100 text-center">
              <span className="text-[9px] text-slate-400 font-black uppercase mb-1 block tracking-tighter">成人</span>
              <input type="number" min="1" value={adults} onChange={(e) => setAdults(parseInt(e.target.value))} className="w-full bg-transparent text-center font-black text-base md:text-lg outline-none" />
            </div>
            <div className="bg-white/40 p-2 md:p-3 rounded-xl md:rounded-2xl border border-slate-100 text-center">
              <span className="text-[9px] text-slate-400 font-black uppercase mb-1 block tracking-tighter">儿童</span>
              <input type="number" min="0" value={children} onChange={(e) => setChildren(parseInt(e.target.value))} className="w-full bg-transparent text-center font-black text-base md:text-lg outline-none" />
            </div>
            <button 
              type="button" 
              onClick={() => setHasPets(!hasPets)}
              className={`p-2 md:p-3 rounded-xl md:rounded-2xl border transition-all flex flex-col items-center justify-center ${hasPets ? 'bg-amber-50 border-amber-200 text-amber-600' : 'bg-white/40 border-slate-100 text-slate-300'}`}
            >
              <span className="text-[9px] font-black uppercase tracking-tighter">宠物</span>
              <span className="text-lg">{hasPets ? '🐾' : '🚫'}</span>
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
          <div>
            <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">住宿首选</label>
            <select value={accommodationType} onChange={(e) => setAccommodationType(e.target.value as any)} className="w-full px-4 py-3 bg-white/50 rounded-xl md:rounded-2xl border border-slate-200 font-bold text-sm outline-none">
              {accommodationOptions.map(opt => <option key={opt} value={opt}>{opt}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">交通偏好</label>
            <select value={transportation} onChange={(e) => setTransportation(e.target.value as any)} className="w-full px-4 py-3 bg-white/50 rounded-xl md:rounded-2xl border border-slate-200 font-bold text-sm outline-none">
              {transportOptions.map(opt => <option key={opt} value={opt}>{opt}</option>)}
            </select>
          </div>
        </div>

        <div>
          <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">兴趣爱好</label>
          <div className="flex flex-wrap gap-2">
            {interestOptions.map(i => (
              <button key={i} type="button" onClick={() => toggleInterest(i)} className={`px-3 py-2 rounded-lg md:rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${interests.includes(i) ? 'bg-slate-900 text-white shadow-lg scale-105' : 'bg-white/50 text-slate-400 border border-slate-200 hover:border-blue-300'}`}>
                {i}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">特别需求</label>
          <textarea 
            value={customRequirements} 
            onChange={(e) => setCustomRequirements(e.target.value)} 
            placeholder="如：食物禁忌、轮椅友好等..." 
            className="w-full px-4 py-3 bg-white/50 rounded-xl md:rounded-[1.5rem] border border-slate-200 text-sm font-medium focus:ring-4 focus:ring-blue-500/10 outline-none resize-none leading-relaxed"
            rows={2}
          />
        </div>
      </div>

      <button type="submit" disabled={isLoading} className="w-full py-4 md:py-5 bg-blue-600 text-white rounded-xl md:rounded-[2rem] font-black text-xs md:text-sm shadow-xl shadow-blue-100 hover:bg-blue-700 transition-all active:scale-95 disabled:opacity-50 uppercase tracking-widest">
        {isLoading ? '正在全力规划...' : (initialPrefs ? '更新行程' : '开启智能旅程')}
      </button>
    </form>
  );
};

export default PreferenceForm;
