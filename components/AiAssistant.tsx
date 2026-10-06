
import React, { useState, useRef, useEffect } from 'react';
import { GeminiModel, Itinerary, GeminiConfig, ChatMessage } from '../types';
import { modifyItineraryWithChat, chatWithAi } from '../services/geminiService';

interface ExtendedChatMessage extends ChatMessage {
  id: string;
  planSuggestion?: Itinerary;
  isEditing?: boolean;
}

interface Props {
  activePlan: Itinerary | null;
  onUpdatePlan: (plan: Itinerary) => void;
  model: GeminiModel;
  geminiConfig: GeminiConfig;
  onUpdateGeminiConfig: (config: GeminiConfig) => void;
}

const AiAssistant: React.FC<Props> = ({ activePlan, onUpdatePlan, model, geminiConfig, onUpdateGeminiConfig }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<ExtendedChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [copyFeedback, setCopyFeedback] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // 自动滚动到底部
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isTyping]);

  const handleSend = async (overrideText?: string) => {
    const text = overrideText || input.trim();
    if (!text || isTyping) return;
    if (!overrideText) setInput('');

    const userMsg: ExtendedChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      text,
      timestamp: Date.now()
    };

    setMessages(prev => [...prev, userMsg]);
    setIsTyping(true);

    try {
      const history: ChatMessage[] = messages.map(m => ({
        role: m.role,
        text: m.text,
        timestamp: m.timestamp
      }));

      if (activePlan) {
        // 如果有活动计划，调用修改接口
        const { text: aiText, updatedPlan, workingKeyId } = await modifyItineraryWithChat(
          text, 
          activePlan, 
          history, 
          model, 
          geminiConfig
        );
        
        if (workingKeyId && workingKeyId !== geminiConfig.activeKeyId) {
          onUpdateGeminiConfig({ ...geminiConfig, activeKeyId: workingKeyId });
        }

        setMessages(prev => [...prev, {
          id: crypto.randomUUID(),
          role: 'model',
          text: aiText,
          planSuggestion: updatedPlan,
          timestamp: Date.now()
        }]);
      } else {
        // 普通聊天
        const { text: aiText, workingKeyId } = await chatWithAi(
          text,
          history,
          model,
          geminiConfig
        );

        if (workingKeyId && workingKeyId !== geminiConfig.activeKeyId) {
          onUpdateGeminiConfig({ ...geminiConfig, activeKeyId: workingKeyId });
        }

        setMessages(prev => [...prev, {
          id: crypto.randomUUID(),
          role: 'model',
          text: aiText,
          timestamp: Date.now()
        }]);
      }
    } catch (err: any) {
      setMessages(prev => [...prev, {
        id: crypto.randomUUID(),
        role: 'model',
        text: `抱歉，出现了一些错误：${err.message}`,
        timestamp: Date.now()
      }]);
    } finally {
      setIsTyping(false);
    }
  };

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopyFeedback(id);
      setTimeout(() => setCopyFeedback(null), 2000);
    });
  };

  const deleteMessage = (id: string) => {
    setMessages(prev => prev.filter(m => m.id !== id));
  };

  const editMessage = (id: string, newText: string) => {
    setMessages(prev => prev.map(m => m.id === id ? { ...m, text: newText, isEditing: false } : m));
  };

  const regenerate = (index: number) => {
    let lastUserPrompt = '';
    for (let i = index - 1; i >= 0; i--) {
      if (messages[i].role === 'user') {
        lastUserPrompt = messages[i].text;
        break;
      }
    }
    if (lastUserPrompt) {
      setMessages(prev => prev.slice(0, index));
      handleSend(lastUserPrompt);
    }
  };

  const applyPlan = (plan: Itinerary) => {
    onUpdatePlan(plan);
    setMessages(prev => [...prev, {
      id: crypto.randomUUID(),
      role: 'model',
      text: "✨ 已为您成功应用新的行程方案！",
      timestamp: Date.now()
    }]);
  };

  if (!isOpen) {
    return (
      <button 
        onClick={() => setIsOpen(true)}
        className="fixed bottom-6 right-6 w-14 h-14 bg-blue-600 text-white rounded-full shadow-2xl flex items-center justify-center hover:scale-110 active:scale-95 transition-all z-[3000] group"
      >
        <div className="absolute inset-0 bg-blue-400 rounded-full animate-ping opacity-20"></div>
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z"></path></svg>
      </button>
    );
  }

  return (
    <div className="fixed bottom-6 right-6 w-[350px] md:w-[450px] h-[600px] bg-white/95 backdrop-blur-2xl border border-slate-200 rounded-[2.5rem] shadow-[0_32px_64px_-12px_rgba(0,0,0,0.2)] flex flex-col z-[3000] animate-fade-in overflow-hidden">
      <div className="p-6 bg-slate-900 text-white flex items-center justify-between shadow-lg">
        <div className="flex items-center gap-3">
          <div className="w-2.5 h-2.5 bg-green-500 rounded-full animate-pulse shadow-[0_0_10px_rgba(34,197,94,0.6)]"></div>
          <div>
            <div className="text-xs font-black uppercase tracking-widest">智旅 AI 助理</div>
            <div className="text-[9px] text-slate-400 font-bold uppercase">{activePlan ? `正在分析: ${activePlan.name}` : '在线等待指令'}</div>
          </div>
        </div>
        <button onClick={() => setIsOpen(false)} className="p-2 hover:bg-white/10 rounded-xl transition-all">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 9l-7 7-7-7"></path></svg>
        </button>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar bg-slate-50/50">
        {messages.length === 0 && (
          <div className="h-full flex flex-col items-center justify-center text-center space-y-4 text-slate-400">
            <div className="w-16 h-16 bg-white rounded-3xl flex items-center justify-center text-3xl shadow-sm border border-slate-100">✨</div>
            <div className="space-y-1">
              <p className="text-xs font-black text-slate-600">有什么我可以帮您的？</p>
              <p className="text-[10px] max-w-[200px] leading-relaxed">您可以指挥我修改行程、寻找周边美食、或者制定完全不同的冒险计划。</p>
            </div>
            <div className="grid grid-cols-1 gap-2 w-full px-4 pt-4">
              {["把行程缩短一天", "增加一些低预算的美食打卡点"].map(hint => (
                <button key={hint} onClick={() => handleSend(hint)} className="px-4 py-3 bg-white border border-slate-100 rounded-xl text-[10px] font-bold text-slate-500 hover:border-blue-300 hover:text-blue-600 transition-all text-left truncate shadow-sm">
                  "{hint}"
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((m, i) => (
          <div key={m.id} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'} group animate-fade-in`}>
            <div className={`max-w-[85%] flex flex-col gap-1`}>
              <div className={`relative p-4 rounded-2xl text-[12px] font-medium leading-relaxed shadow-sm transition-all ${
                m.role === 'user' 
                  ? 'bg-slate-900 text-white rounded-tr-none' 
                  : 'bg-white border border-slate-100 text-slate-700 rounded-tl-none'
              }`}>
                {m.isEditing ? (
                  <textarea 
                    autoFocus 
                    className="w-full bg-slate-800 text-white p-2 rounded-lg text-xs outline-none"
                    defaultValue={m.text}
                    onBlur={(e) => editMessage(m.id, e.target.value)}
                  />
                ) : (
                  <div className="whitespace-pre-wrap">{m.text}</div>
                )}

                {!m.isEditing && (
                  <div className={`absolute top-0 flex gap-1 opacity-0 group-hover:opacity-100 transition-all ${m.role === 'user' ? 'right-full mr-2' : 'left-full ml-2'}`}>
                    <button 
                      onClick={() => copyToClipboard(m.text, m.id)}
                      className="p-1.5 bg-white border border-slate-100 rounded-lg text-slate-400 hover:text-blue-600 shadow-sm"
                    >
                      {copyFeedback === m.id ? '✅' : <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3"></path></svg>}
                    </button>
                    {m.role === 'user' && (
                      <button onClick={() => deleteMessage(m.id)} className="p-1.5 bg-white border border-slate-100 rounded-lg text-slate-400 hover:text-red-500 shadow-sm"><svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M6 18L18 6M6 6l12 12"></path></svg></button>
                    )}
                    {m.role === 'model' && i > 0 && messages[i-1].role === 'user' && (
                      <button onClick={() => regenerate(i)} className="p-1.5 bg-white border border-slate-100 rounded-lg text-slate-400 hover:text-blue-600 shadow-sm"><svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path></svg></button>
                    )}
                  </div>
                )}
              </div>

              {m.planSuggestion && (
                <div className="mt-2 p-4 bg-blue-600 text-white rounded-2xl shadow-lg animate-fade-in border border-blue-400">
                  <div className="text-[10px] font-black uppercase mb-2 flex items-center gap-1">✨ 智能修改建议</div>
                  <p className="text-[11px] opacity-90 mb-4">{m.planSuggestion.summary}</p>
                  <button 
                    onClick={() => applyPlan(m.planSuggestion!)}
                    className="w-full py-2 bg-white text-blue-600 rounded-xl text-[10px] font-black uppercase hover:bg-slate-50 transition-all"
                  >
                    更新当前行程
                  </button>
                </div>
              )}
            </div>
          </div>
        ))}
        {isTyping && (
          <div className="flex justify-start">
            <div className="bg-white border border-slate-100 p-3 rounded-2xl rounded-tl-none flex gap-1 shadow-sm">
              <div className="w-1.5 h-1.5 bg-blue-400 rounded-full animate-bounce [animation-delay:-0.3s]"></div>
              <div className="w-1.5 h-1.5 bg-blue-400 rounded-full animate-bounce [animation-delay:-0.15s]"></div>
              <div className="w-1.5 h-1.5 bg-blue-400 rounded-full animate-bounce"></div>
            </div>
          </div>
        )}
      </div>

      <div className="p-4 bg-white border-t border-slate-100">
        <div className="flex gap-2 bg-slate-50 p-2 rounded-2xl border border-slate-200">
          <input 
            type="text"
            placeholder="对我说点什么..."
            className="flex-1 px-3 py-2 bg-transparent border-none text-[12px] font-bold outline-none"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSend()}
          />
          <button 
            onClick={() => handleSend()}
            disabled={!input.trim() || isTyping}
            className="w-10 h-10 bg-slate-900 text-white rounded-xl flex items-center justify-center disabled:opacity-30 hover:bg-blue-600 transition-all active:scale-90"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"></path></svg>
          </button>
        </div>
      </div>
    </div>
  );
};

export default AiAssistant;
