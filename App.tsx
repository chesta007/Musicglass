
import React, { useState, useRef, useEffect } from 'react';
import { GoogleGenAI, Type } from "@google/genai";
import { AnalysisResult, AnalysisStatus, AppMode, LyricForm, ScannedStyle } from './types';
import { getAudioStream, blobToBase64, getSupportedMimeType } from './services/audioRecorder';

const App: React.FC = () => {
  const [mode, setMode] = useState<AppMode>(AppMode.MUSIC);
  const [status, setStatus] = useState<AnalysisStatus>(AnalysisStatus.IDLE);
  const [error, setError] = useState<string | null>(null);
  const [recordingTime, setRecordingTime] = useState(0);
  const [showSettings, setShowSettings] = useState(false);

  const [useProModel, setUseProModel] = useState(true);
  const [autoNavigate, setAutoNavigate] = useState(true);

  const [scannedStyles, setScannedStyles] = useState<ScannedStyle[]>([]);
  const [manualStyleInput, setManualStyleInput] = useState('');
  const [remixResult, setRemixResult] = useState<string | null>(null);

  const [lyricIdea, setLyricIdea] = useState('');
  const [lyricVoice, setLyricVoice] = useState<LyricForm['voice']>('Hombre');
  const [lyricLang, setLyricLang] = useState('Español');
  const [lyricVibe, setLyricVibe] = useState('Melódico');
  const [lyricsResult, setLyricsResult] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<number | null>(null);
  const mimeTypeRef = useRef<string>('');

  const startAnalysis = async () => {
    try {
      setError(null);
      const stream = await getAudioStream();
      
      mimeTypeRef.current = getSupportedMimeType();
      const options = mimeTypeRef.current ? { mimeType: mimeTypeRef.current } : undefined;
      
      const mediaRecorder = new MediaRecorder(stream, options);
      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];
      
      mediaRecorder.ondataavailable = (e) => { 
        if (e.data.size > 0) chunksRef.current.push(e.data); 
      };
      
      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(chunksRef.current, { type: mimeTypeRef.current });
        analyzeAudio(audioBlob);
        stream.getTracks().forEach(track => track.stop());
      };

      mediaRecorder.start();
      setStatus(AnalysisStatus.RECORDING);
      setRecordingTime(0);
      
      timerRef.current = window.setInterval(() => {
        setRecordingTime(prev => {
          if (prev >= 8) { 
            stopRecording(); 
            return 8; 
          }
          return prev + 1;
        });
      }, 1000);
    } catch (err: any) {
      setError(err.message);
      setStatus(AnalysisStatus.ERROR);
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") {
      mediaRecorderRef.current.stop();
      if (timerRef.current) clearInterval(timerRef.current);
      setStatus(AnalysisStatus.ANALYZING);
    }
  };

  const analyzeAudio = async (blob: Blob) => {
    try {
      const base64Audio = await blobToBase64(blob);
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || '' });
      
      const response = await ai.models.generateContent({
        model: useProModel ? 'gemini-3-pro-preview' : 'gemini-3-flash-preview',
        contents: [{
          parts: [
            { inlineData: { data: base64Audio, mimeType: mimeTypeRef.current || 'audio/webm' } },
            { text: "Analiza música. Responde JSON: genre, subgenre, bpm, key, mood, instruments (array), aiPrompt (keywords estilo)." }
          ]
        }],
        config: { responseMimeType: "application/json" }
      });

      const result: AnalysisResult = JSON.parse(response.text || '{}');
      setScannedStyles(prev => [...prev, { id: Math.random().toString(36).substr(2, 9), result, weight: 50 }]);
      setStatus(AnalysisStatus.COMPLETED);
    } catch (err: any) {
      setError("Análisis fallido.");
      setStatus(AnalysisStatus.ERROR);
    }
  };

  const remixStyles = async () => {
    if (scannedStyles.length === 0 && !manualStyleInput) return;
    setStatus(AnalysisStatus.REMIXING);
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || '' });
      const stylesStr = scannedStyles.map(s => `${s.result.genre} ${s.result.subgenre}`).join(', ');
      
      // Prompt ultra-estricto para solo tags y <1000 chars
      const prompt = `Actúa como un motor de etiquetas de estilo para IA musical. 
      REGLAS CRÍTICAS: 
      1. Genera ÚNICAMENTE una lista de etiquetas, estilos e instrumentos musicales separados por comas.
      2. PROHIBIDO incluir frases, introducciones, explicaciones o palabras extra. Solo ideas musicales.
      3. LÍMITE MÁXIMO: 1000 caracteres.
      Base de estilos: [${stylesStr}]. 
      Instrucciones adicionales: ${manualStyleInput}.`;
      
      const response = await ai.models.generateContent({ 
        model: 'gemini-3-pro-preview', 
        contents: prompt 
      });
      
      const result = response.text?.trim() || "";
      setRemixResult(result.substring(0, 1000));
      setStatus(AnalysisStatus.COMPLETED);
      if (autoNavigate) setMode(AppMode.STUDIO);
    } catch (err: any) {
      setError("Error en remix.");
      setStatus(AnalysisStatus.ERROR);
    }
  };

  const generateLyrics = async () => {
    if (!lyricIdea) return;
    setStatus(AnalysisStatus.GENERATING_LYRICS);
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || '' });
      const prompt = `Escribe letra de canción. Idea: ${lyricIdea}. Voz: ${lyricVoice}. Idioma: ${lyricLang}. Estilo: ${lyricVibe}. REGLA: Sin etiquetas [Chorus/Verse], sin títulos, solo la letra pura.`;
      
      const response = await ai.models.generateContent({ 
        model: 'gemini-3-pro-preview', 
        contents: prompt 
      });
      
      const clean = response.text?.replace(/\[.*?\]|\(.*?\)/g, '').trim();
      setLyricsResult(clean || null);
      setStatus(AnalysisStatus.COMPLETED);
      if (autoNavigate) setMode(AppMode.STUDIO);
    } catch (err: any) {
      setError("Error en letra.");
      setStatus(AnalysisStatus.ERROR);
    }
  };

  const exportToSuno = () => {
    const fullText = `STYLE:\n${remixResult || ''}\n\nLYRICS:\n${lyricsResult || ''}`;
    navigator.clipboard.writeText(fullText);
    alert("¡Todo copiado! Pégalo en Suno AI.");
    window.open("https://suno.com/create", "_blank");
  };

  const copyToClipboard = (text: string, msg: string) => {
    navigator.clipboard.writeText(text);
    alert(msg);
  };

  return (
    <div className="min-h-screen flex flex-col p-4 items-center max-w-lg mx-auto pb-44 selection:bg-indigo-100">
      <nav className="w-full flex justify-between items-center mb-6 pt-4 px-2">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-white shadow-xl flex items-center justify-center text-indigo-600 border border-white">
            <i className={`fas ${mode === AppMode.MUSIC ? 'fa-compact-disc animate-spin-slow' : mode === AppMode.LYRICS ? 'fa-pen-nib' : 'fa-rocket'}`}></i>
          </div>
          <div>
            <h1 className="block font-black text-xl text-indigo-950 tracking-tighter leading-none">MusiGlass</h1>
            <span className="block text-[8px] font-black text-indigo-400 uppercase tracking-[0.2em]">Studio Engine</span>
          </div>
        </div>
        <button onClick={() => setShowSettings(true)} className="w-11 h-11 rounded-2xl bg-white/60 backdrop-blur-md flex items-center justify-center text-indigo-950/30 shadow-sm border border-white">
          <i className="fas fa-sliders-h text-lg"></i>
        </button>
      </nav>

      <div className="flex bg-white/30 backdrop-blur-3xl p-1.5 rounded-[2rem] border border-white/60 shadow-lg mb-8 w-full sticky top-4 z-50">
        <button onClick={() => setMode(AppMode.MUSIC)} className={`flex-1 py-3.5 rounded-[1.5rem] transition-all text-[11px] font-black ${mode === AppMode.MUSIC ? 'bg-indigo-600 text-white shadow-xl' : 'text-indigo-300'}`}>ESTILOS</button>
        <button onClick={() => setMode(AppMode.LYRICS)} className={`flex-1 py-3.5 rounded-[1.5rem] transition-all text-[11px] font-black ${mode === AppMode.LYRICS ? 'bg-indigo-600 text-white shadow-xl' : 'text-indigo-300'}`}>LETRAS</button>
        <button onClick={() => setMode(AppMode.STUDIO)} className={`flex-1 py-3.5 rounded-[1.5rem] transition-all text-[11px] font-black ${mode === AppMode.STUDIO ? 'bg-indigo-600 text-white shadow-xl' : 'text-indigo-300'}`}>ESTUDIO</button>
      </div>

      <main className="flex-1 w-full space-y-6">
        {mode === AppMode.MUSIC && (
          <div className="space-y-6 animate-in fade-in slide-in-from-left-6 duration-500">
             <div className="flex flex-col items-center py-8 relative">
                <button 
                  onClick={status === AnalysisStatus.RECORDING ? stopRecording : startAnalysis}
                  disabled={status === AnalysisStatus.ANALYZING}
                  className={`w-48 h-48 rounded-full liquid-orb flex items-center justify-center text-white text-5xl active:scale-95 transition-all shadow-2xl z-10 ${status === AnalysisStatus.RECORDING ? 'recording-pulse' : ''}`}
                >
                  <i className={`fas ${status === AnalysisStatus.RECORDING ? 'fa-square' : status === AnalysisStatus.ANALYZING ? 'fa-spinner fa-spin' : 'fa-microphone-lines'}`}></i>
                </button>
                <div className="text-center mt-8">
                  <h3 className="text-sm font-black text-indigo-950 uppercase">ADN Musical</h3>
                  <p className="text-[10px] font-bold text-indigo-400 uppercase mt-1">
                    {status === AnalysisStatus.RECORDING ? `Escuchando (${recordingTime}s)...` : "Pulsa para analizar estilo"}
                  </p>
                </div>
             </div>

             {scannedStyles.length > 0 && (
               <div className="space-y-4 animate-in fade-in">
                 {scannedStyles.map(s => (
                   <div key={s.id} className="glass-panel p-6 rounded-[2.5rem] border-white shadow-xl">
                     <div className="flex justify-between items-center mb-5">
                        <div className="flex items-center gap-3">
                           <div className="w-8 h-8 rounded-xl bg-indigo-50 flex items-center justify-center text-indigo-600 text-[10px]"><i className="fas fa-compact-disc"></i></div>
                           <h4 className="text-[11px] font-black text-indigo-950 uppercase">{s.result.genre}</h4>
                        </div>
                        <button onClick={() => setScannedStyles(scannedStyles.filter(x => x.id !== s.id))} className="text-red-200"><i className="fas fa-trash-alt"></i></button>
                     </div>
                     <input type="range" min="0" max="100" value={s.weight} onChange={(e) => setScannedStyles(scannedStyles.map(x => x.id === s.id ? {...x, weight: parseInt(e.target.value)} : x))} className="w-full h-2 bg-indigo-50 rounded-lg appearance-none accent-indigo-600" />
                   </div>
                 ))}
               </div>
             )}

             <div className="glass-panel p-6 rounded-[2.5rem] border-white shadow-xl">
                <label className="text-[10px] font-black text-indigo-400 uppercase ml-1 mb-3 block tracking-widest">Manual Ideas</label>
                <textarea value={manualStyleInput} onChange={(e) => setManualStyleInput(e.target.value)} placeholder="Ej: Funk retro, voces espaciales..." className="w-full bg-white/40 border-none p-5 text-xs font-bold h-24 placeholder:text-indigo-200 focus:ring-0" />
             </div>

             <button onClick={remixStyles} disabled={status === AnalysisStatus.REMIXING || (scannedStyles.length === 0 && !manualStyleInput)} className="w-full py-6 bg-indigo-950 text-white rounded-[2.5rem] font-black text-xs uppercase shadow-2xl disabled:opacity-30 transition-all">
                {status === AnalysisStatus.REMIXING ? <i className="fas fa-spinner fa-spin"></i> : "Generar Prompt de Estilo"}
             </button>
          </div>
        )}

        {mode === AppMode.LYRICS && (
          <div className="space-y-6 animate-in fade-in slide-in-from-right-6 duration-500">
            <div className="glass-panel p-8 rounded-[3rem] border-white shadow-2xl space-y-6">
              <textarea value={lyricIdea} onChange={(e) => setLyricIdea(e.target.value)} placeholder="¿De qué habla tu canción?" className="w-full bg-white/50 border-white rounded-[2rem] p-6 text-xs font-bold h-44 shadow-inner placeholder:text-indigo-200 focus:ring-0" />
              <div className="grid grid-cols-2 gap-4">
                <select value={lyricVoice} onChange={(e) => setLyricVoice(e.target.value as any)} className="bg-white/80 border-white rounded-2xl p-4 text-[10px] font-black appearance-none"><option>Hombre</option><option>Mujer</option><option>Dúo</option></select>
                <select value={lyricLang} onChange={(e) => setLyricLang(e.target.value)} className="bg-white/80 border-white rounded-2xl p-4 text-[10px] font-black appearance-none"><option>Español</option><option>Inglés</option></select>
              </div>
              <button onClick={generateLyrics} disabled={status === AnalysisStatus.GENERATING_LYRICS || !lyricIdea} className="w-full py-6 bg-indigo-600 text-white rounded-[2.5rem] font-black text-xs uppercase shadow-2xl disabled:opacity-50">
                {status === AnalysisStatus.GENERATING_LYRICS ? <i className="fas fa-circle-notch fa-spin"></i> : "Redactar Letra"}
              </button>
            </div>
          </div>
        )}

        {mode === AppMode.STUDIO && (
          <div className="space-y-8 animate-in zoom-in-95 duration-500">
            <div className="space-y-6">
              <div className="glass-panel p-7 rounded-[3rem] border-white shadow-xl group">
                <div className="flex justify-between items-center mb-5">
                   <span className="text-[10px] font-black text-indigo-950 uppercase tracking-widest">Estilo (Tags)</span>
                   {remixResult && <button onClick={() => copyToClipboard(remixResult, "Prompt copiado")} className="text-indigo-400"><i className="fas fa-copy"></i></button>}
                </div>
                {remixResult ? (
                  <div className="bg-white/50 p-5 rounded-[2rem] text-[11px] font-bold text-indigo-900 leading-relaxed shadow-inner">"{remixResult}"</div>
                ) : (
                  <button onClick={() => setMode(AppMode.MUSIC)} className="w-full py-5 border-2 border-dashed border-indigo-100 rounded-[2.5rem] text-[10px] font-black text-indigo-300">Configurar ADN Musical</button>
                )}
              </div>

              <div className="glass-panel p-7 rounded-[3rem] border-white shadow-xl">
                <div className="flex justify-between items-center mb-5">
                   <span className="text-[10px] font-black text-indigo-950 uppercase tracking-widest">Letra Pura</span>
                   {lyricsResult && <button onClick={() => copyToClipboard(lyricsResult, "Letra copiada")} className="text-indigo-400"><i className="fas fa-copy"></i></button>}
                </div>
                {lyricsResult ? (
                  <div className="bg-white/50 p-6 rounded-[2rem] text-[11px] font-bold text-indigo-950 max-h-52 overflow-y-auto whitespace-pre-wrap leading-relaxed shadow-inner custom-scrollbar">{lyricsResult}</div>
                ) : (
                  <button onClick={() => setMode(AppMode.LYRICS)} className="w-full py-5 border-2 border-dashed border-indigo-100 rounded-[2.5rem] text-[10px] font-black text-indigo-300">Redactar Letra</button>
                )}
              </div>
            </div>

            <button 
              onClick={exportToSuno}
              disabled={!remixResult && !lyricsResult}
              className="w-full py-9 bg-indigo-950 text-white rounded-[3.5rem] font-black text-xs shadow-3xl flex flex-col items-center gap-4 uppercase tracking-[0.2em] disabled:opacity-30"
            >
              <i className="fas fa-rocket text-2xl"></i>
              Lanzar a Suno AI
              <span className="text-[7px] opacity-40">Auto-Copiado de Estilo + Letra</span>
            </button>
          </div>
        )}
      </main>

      {showSettings && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 animate-in fade-in duration-300">
           <div className="absolute inset-0 bg-indigo-950/40 backdrop-blur-2xl" onClick={() => setShowSettings(false)}></div>
           <div className="glass-panel w-full max-w-sm p-9 rounded-[4rem] border-white shadow-3xl relative z-10">
              <h2 className="text-xl font-black text-indigo-950 mb-10 tracking-tighter">Ajustes</h2>
              <div className="space-y-8">
                 <div className="flex items-center justify-between">
                    <div><p className="text-xs font-black text-indigo-900">Gemini Pro</p><p className="text-[9px] font-bold text-indigo-400 uppercase">Máxima creatividad</p></div>
                    <button onClick={() => setUseProModel(!useProModel)} className={`w-14 h-7 rounded-full flex items-center px-1 transition-all ${useProModel ? 'bg-indigo-600' : 'bg-indigo-100'}`}>
                       <div className={`w-5 h-5 bg-white rounded-full shadow-lg transform ${useProModel ? 'translate-x-7' : 'translate-x-0'}`}></div>
                    </button>
                 </div>
                 <button onClick={async () => { try { await getAudioStream(); alert("Micro OK"); } catch(e:any) { alert(e.message); } }} className="w-full py-5 border-2 border-indigo-100 text-indigo-600 rounded-[2rem] text-[10px] font-black uppercase">Test Micro</button>
                 <button onClick={() => { if(confirm("¿Limpiar?")) { setScannedStyles([]); setLyricsResult(null); setRemixResult(null); setError(null); setShowSettings(false); } }} className="w-full py-5 border-2 border-red-50 text-red-500 rounded-[2rem] text-[10px] font-black uppercase">Reset Proyecto</button>
              </div>
              <button onClick={() => setShowSettings(false)} className="w-full mt-10 py-5 bg-indigo-950 text-white rounded-[2rem] font-black text-[10px] uppercase">Cerrar</button>
           </div>
        </div>
      )}

      {error && (
          <div className="fixed inset-x-4 bottom-32 z-[200] glass-panel border-red-100 bg-white/95 p-6 rounded-[2.5rem] shadow-2xl animate-in slide-in-from-bottom-10">
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center text-red-500 flex-shrink-0 animate-pulse"><i className="fas fa-lock text-xl"></i></div>
                <div className="flex-1">
                  <h4 className="text-[11px] font-black text-red-600 uppercase mb-1">Permiso Micro</h4>
                  <p className="text-[10px] font-bold text-indigo-900 leading-tight mb-4">{error}</p>
                  <button onClick={startAnalysis} className="px-5 py-2.5 bg-indigo-600 text-white text-[9px] font-black rounded-full uppercase">Reintentar</button>
                </div>
                <button onClick={() => setError(null)} className="text-indigo-200"><i className="fas fa-times"></i></button>
              </div>
          </div>
      )}

      <footer className="fixed bottom-8 text-center w-full max-w-lg left-1/2 -translate-x-1/2 pointer-events-none opacity-10">
        <p className="text-[7px] font-black text-indigo-950 uppercase tracking-[1.5em]">MusiGlass Studio</p>
      </footer>

      <style>{`
        .custom-scrollbar::-webkit-scrollbar { width: 4px; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(99, 102, 241, 0.1); border-radius: 10px; }
        @keyframes orb-pulse {
            0% { box-shadow: 0 0 0 0 rgba(99, 102, 241, 0.4), 0 45px 90px -15px rgba(99, 102, 241, 0.4); }
            70% { box-shadow: 0 0 0 45px rgba(99, 102, 241, 0), 0 45px 90px -15px rgba(99, 102, 241, 0.4); }
            100% { box-shadow: 0 0 0 0 rgba(99, 102, 241, 0), 0 45px 90px -15px rgba(99, 102, 241, 0.4); }
        }
        .recording-pulse { animation: orb-pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite; }
        .animate-spin-slow { animation: spin 8s linear infinite; }
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
};

export default App;
