
import React, { useState, useRef, useEffect } from 'react';
import { GoogleGenAI, Type } from "@google/genai";
import { AnalysisResult, AnalysisStatus, AppMode, LyricForm, ScannedStyle } from './types';
import { getAudioStream, blobToBase64 } from './services/audioRecorder';

const App: React.FC = () => {
  const [mode, setMode] = useState<AppMode>(AppMode.MUSIC);
  const [status, setStatus] = useState<AnalysisStatus>(AnalysisStatus.IDLE);
  const [error, setError] = useState<string | null>(null);
  const [recordingTime, setRecordingTime] = useState(0);
  const [showSettings, setShowSettings] = useState(false);

  // Configuración de Usuario
  const [useProModel, setUseProModel] = useState(true);
  const [autoNavigate, setAutoNavigate] = useState(true);

  // Estados de Música (Estilos)
  const [scannedStyles, setScannedStyles] = useState<ScannedStyle[]>([]);
  const [manualStyleInput, setManualStyleInput] = useState('');
  const [remixResult, setRemixResult] = useState<string | null>(null);

  // Estados de Letras
  const [lyricIdea, setLyricIdea] = useState('');
  const [lyricRefs, setLyricRefs] = useState<string[]>(['']);
  const [lyricVoice, setLyricVoice] = useState<LyricForm['voice']>('Hombre');
  const [lyricLang, setLyricLang] = useState('Español');
  const [lyricVibe, setLyricVibe] = useState('Melódico');
  const [lyricsResult, setLyricsResult] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<number | null>(null);

  // Lógica de Grabación y Análisis
  const startAnalysis = async () => {
    try {
      setError(null);
      const stream = await getAudioStream();
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];
      mediaRecorder.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(chunksRef.current, { type: 'audio/webm' });
        analyzeAudio(audioBlob);
      };
      mediaRecorder.start();
      setStatus(AnalysisStatus.RECORDING);
      setRecordingTime(0);
      timerRef.current = window.setInterval(() => {
        setRecordingTime(prev => {
          if (prev >= 8) { stopRecording(); return 8; }
          return prev + 1;
        });
      }, 1000);
    } catch (err) {
      setError("Error de micrófono. Verifica los permisos.");
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
            { inlineData: { data: base64Audio, mimeType: 'audio/webm' } },
            { text: "Analiza esta música para SUNO AI. Devuelve JSON con: genre, subgenre, bpm, key, mood, instruments (array), aiPrompt (máx 120 caracteres)." }
          ]
        }],
        config: { responseMimeType: "application/json" }
      });
      const result: AnalysisResult = JSON.parse(response.text || '{}');
      setScannedStyles(prev => [...prev, { id: Math.random().toString(36).substr(2, 9), result, weight: 50 }]);
      setStatus(AnalysisStatus.COMPLETED);
    } catch (err) {
      setError("Fallo en la conexión con la IA.");
      setStatus(AnalysisStatus.ERROR);
    }
  };

  const remixStyles = async () => {
    if (scannedStyles.length === 0 && !manualStyleInput) {
      setError("Añade estilos o escribe una descripción.");
      return;
    }
    setStatus(AnalysisStatus.REMIXING);
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || '' });
      const stylesStr = scannedStyles.map(s => `${s.result.genre} (${s.weight}%)`).join(', ');
      const prompt = `Actúa como productor experto de SUNO AI. Crea un prompt de estilo (Style Prompt) de máximo 200 caracteres mezclando estos ingredientes: [${stylesStr}]. Instrucciones adicionales: ${manualStyleInput}. Usa solo palabras clave técnicas, sin frases largas.`;
      
      const response = await ai.models.generateContent({ 
        model: 'gemini-3-pro-preview', 
        contents: prompt 
      });
      setRemixResult(response.text?.trim() || null);
      setStatus(AnalysisStatus.COMPLETED);
      if (autoNavigate) setMode(AppMode.STUDIO);
    } catch (err) {
      setError("Fallo al crear el remix de estilos.");
      setStatus(AnalysisStatus.ERROR);
    }
  };

  const generateLyrics = async () => {
    if (!lyricIdea) {
      setError("Describe tu idea primero.");
      return;
    }
    setStatus(AnalysisStatus.GENERATING_LYRICS);
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || '' });
      const prompt = `Escribe una letra de canción completa. Idea: ${lyricIdea}. Ref: ${lyricRefs.join(', ')}. Voz: ${lyricVoice}. Idioma: ${lyricLang}. Estilo: ${lyricVibe}.
      REGLA CRÍTICA: Devuelve ÚNICAMENTE la letra. PROHIBIDO incluir [Chorus], [Verse], (Vocal), [Estribillo], [Puente] o cualquier marca estructural. Solo el texto puro de la canción.`;
      
      const response = await ai.models.generateContent({ 
        model: 'gemini-3-pro-preview', 
        contents: prompt 
      });
      
      // Limpieza extra por seguridad
      const clean = response.text?.replace(/\[.*?\]|\(.*?\)/g, '').trim();
      setLyricsResult(clean || null);
      setStatus(AnalysisStatus.COMPLETED);
      if (autoNavigate) setMode(AppMode.STUDIO);
    } catch (err) {
      setError("Error generando la letra.");
      setStatus(AnalysisStatus.ERROR);
    }
  };

  const exportToSuno = () => {
    if (!remixResult && !lyricsResult) return;
    const fullText = `STYLE:\n${remixResult || ''}\n\nLYRICS:\n${lyricsResult || ''}`;
    navigator.clipboard.writeText(fullText);
    alert("¡Todo copiado! Ve a Suno -> Modo Custom y pega cada cosa en su lugar.");
    window.open("https://suno.com/create", "_blank");
  };

  return (
    <div className="min-h-screen flex flex-col p-4 items-center max-w-lg mx-auto pb-44 selection:bg-indigo-100">
      {/* Header Premium */}
      <nav className="w-full flex justify-between items-center mb-6 pt-4 px-2">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-white shadow-xl flex items-center justify-center text-indigo-600 border border-white">
            <i className={`fas ${mode === AppMode.MUSIC ? 'fa-compact-disc animate-spin-slow' : mode === AppMode.LYRICS ? 'fa-pen-nib' : 'fa-rocket-launch'}`}></i>
          </div>
          <div>
            <h1 className="block font-black text-xl text-indigo-950 tracking-tighter leading-none">MusiGlass</h1>
            <span className="block text-[8px] font-black text-indigo-400 uppercase tracking-[0.2em]">{mode === AppMode.STUDIO ? 'Final Studio' : 'Creative Tool'}</span>
          </div>
        </div>
        <button 
          onClick={() => setShowSettings(true)}
          className="w-11 h-11 rounded-2xl bg-white/60 backdrop-blur-md flex items-center justify-center text-indigo-950/30 shadow-sm border border-white active:scale-90 transition-all"
        >
          <i className="fas fa-sliders-h text-lg"></i>
        </button>
      </nav>

      {/* Tabs con Glassmorphism */}
      <div className="flex bg-white/30 backdrop-blur-3xl p-1.5 rounded-[2rem] border border-white/60 shadow-lg mb-8 w-full sticky top-4 z-50">
        <button onClick={() => setMode(AppMode.MUSIC)} className={`flex-1 py-3.5 rounded-[1.5rem] transition-all text-[11px] font-black tracking-tight ${mode === AppMode.MUSIC ? 'bg-indigo-600 text-white shadow-xl scale-[1.02]' : 'text-indigo-300'}`}>ESTILOS</button>
        <button onClick={() => setMode(AppMode.LYRICS)} className={`flex-1 py-3.5 rounded-[1.5rem] transition-all text-[11px] font-black tracking-tight ${mode === AppMode.LYRICS ? 'bg-indigo-600 text-white shadow-xl scale-[1.02]' : 'text-indigo-300'}`}>LETRAS</button>
        <button onClick={() => setMode(AppMode.STUDIO)} className={`flex-1 py-3.5 rounded-[1.5rem] transition-all text-[11px] font-black tracking-tight ${mode === AppMode.STUDIO ? 'bg-indigo-600 text-white shadow-xl scale-[1.02]' : 'text-indigo-300'}`}>ESTUDIO</button>
      </div>

      <main className="flex-1 w-full space-y-6">
        {mode === AppMode.MUSIC && (
          <div className="space-y-6 animate-in fade-in slide-in-from-left-6 duration-500">
             <div className="flex flex-col items-center py-8 relative">
                <button 
                  onClick={status === AnalysisStatus.RECORDING ? stopRecording : startAnalysis}
                  className={`w-48 h-48 rounded-full liquid-orb flex items-center justify-center text-white text-5xl active:scale-95 transition-all shadow-2xl relative z-10 ${status === AnalysisStatus.RECORDING ? 'recording-pulse' : ''}`}
                >
                  <i className={`fas ${status === AnalysisStatus.RECORDING ? 'fa-square' : 'fa-microphone-lines'}`}></i>
                </button>
                <div className="text-center mt-8">
                  <h3 className="text-sm font-black text-indigo-950 uppercase tracking-widest">ADN Musical</h3>
                  <p className="text-[10px] font-bold text-indigo-400 uppercase mt-1 tracking-widest">Escanea el estilo que te gusta</p>
                </div>
             </div>

             {scannedStyles.length > 0 && (
               <div className="space-y-4 animate-in fade-in duration-300">
                 {scannedStyles.map(s => (
                   <div key={s.id} className="glass-panel p-6 rounded-[2.5rem] border-white shadow-xl group">
                     <div className="flex justify-between items-center mb-5">
                        <div className="flex items-center gap-3">
                           <div className="w-8 h-8 rounded-xl bg-indigo-50 flex items-center justify-center text-indigo-600 text-[10px]">
                              <i className="fas fa-compact-disc"></i>
                           </div>
                           <h4 className="text-[11px] font-black text-indigo-950 uppercase tracking-wider">{s.result.genre}</h4>
                        </div>
                        <button onClick={() => setScannedStyles(scannedStyles.filter(x => x.id !== s.id))} className="text-red-200 hover:text-red-500 transition-colors"><i className="fas fa-trash-alt"></i></button>
                     </div>
                     <div className="flex items-center gap-4">
                        <input 
                          type="range" min="0" max="100" value={s.weight} 
                          onChange={(e) => setScannedStyles(scannedStyles.map(x => x.id === s.id ? {...x, weight: parseInt(e.target.value)} : x))} 
                          className="flex-1 h-2 bg-indigo-50 rounded-lg appearance-none accent-indigo-600 cursor-pointer" 
                        />
                        <span className="text-[10px] font-black text-indigo-400 w-8">{s.weight}%</span>
                     </div>
                   </div>
                 ))}
               </div>
             )}

             <div className="glass-panel p-6 rounded-[2.5rem] border-white shadow-xl">
                <label className="text-[10px] font-black text-indigo-400 uppercase tracking-widest ml-1 mb-3 block">Instrucciones Manuales</label>
                <textarea 
                  value={manualStyleInput} onChange={(e) => setManualStyleInput(e.target.value)}
                  placeholder="Ej: Mezcla con guitarras españolas y un toque de techno..."
                  className="w-full bg-white/40 border border-white rounded-[1.5rem] p-5 text-xs font-bold focus:ring-2 focus:ring-indigo-100 transition-all h-28 placeholder:text-indigo-200 outline-none"
                />
             </div>

             <button 
              onClick={remixStyles} 
              disabled={status === AnalysisStatus.REMIXING}
              className="w-full py-6 bg-indigo-950 text-white rounded-[2.5rem] font-black text-xs uppercase tracking-[0.2em] shadow-2xl active:scale-95 transition-all flex items-center justify-center gap-3"
             >
                {status === AnalysisStatus.REMIXING ? <i className="fas fa-spinner fa-spin"></i> : <i className="fas fa-layer-group"></i>}
                Generar Remix de Estilos
             </button>
          </div>
        )}

        {mode === AppMode.LYRICS && (
          <div className="space-y-6 animate-in fade-in slide-in-from-right-6 duration-500">
            <div className="glass-panel p-8 rounded-[3rem] border-white shadow-2xl space-y-6">
              <div>
                <label className="text-[10px] font-black text-indigo-400 uppercase tracking-widest ml-1 mb-3 block">Idea de la Canción</label>
                <textarea 
                  value={lyricIdea} onChange={(e) => setLyricIdea(e.target.value)} 
                  placeholder="¿De qué trata tu próxima obra maestra?" 
                  className="w-full bg-white/50 border border-white rounded-[2rem] p-6 text-xs font-bold h-40 focus:ring-0 outline-none shadow-inner placeholder:text-indigo-200" 
                />
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-[9px] font-black text-indigo-400 uppercase ml-1">Voz</label>
                  <select value={lyricVoice} onChange={(e) => setLyricVoice(e.target.value as any)} className="w-full bg-white/80 border border-white rounded-2xl p-4 text-[10px] font-black outline-none appearance-none cursor-pointer"><option>Hombre</option><option>Mujer</option><option>Dúo</option><option>Coral</option></select>
                </div>
                <div className="space-y-2">
                  <label className="text-[9px] font-black text-indigo-400 uppercase ml-1">Idioma</label>
                  <select value={lyricLang} onChange={(e) => setLyricLang(e.target.value)} className="w-full bg-white/80 border border-white rounded-2xl p-4 text-[10px] font-black outline-none appearance-none cursor-pointer"><option>Español</option><option>Inglés</option><option>Spanglish</option></select>
                </div>
              </div>

              <div className="space-y-3">
                 <label className="text-[9px] font-black text-indigo-400 uppercase tracking-widest ml-1">Vibe del Texto</label>
                 <div className="flex flex-wrap gap-2">
                   {['Melódico', 'Urbano', 'Poético', 'Agresivo', 'Triste'].map(v => (
                     <button key={v} onClick={() => setLyricVibe(v)} className={`px-4 py-2.5 rounded-full text-[9px] font-black transition-all ${lyricVibe === v ? 'bg-indigo-600 text-white shadow-lg' : 'bg-white/80 text-indigo-300 border border-white'}`}>
                       {v.toUpperCase()}
                     </button>
                   ))}
                 </div>
              </div>

              <button 
                onClick={generateLyrics} 
                disabled={status === AnalysisStatus.GENERATING_LYRICS}
                className="w-full py-6 bg-indigo-600 text-white rounded-[2.5rem] font-black text-xs uppercase tracking-widest shadow-2xl active:scale-95 transition-all flex items-center justify-center gap-3"
              >
                {status === AnalysisStatus.GENERATING_LYRICS ? <i className="fas fa-circle-notch fa-spin"></i> : <i className="fas fa-feather"></i>}
                Redactar Letra Pura
              </button>
            </div>
          </div>
        )}

        {mode === AppMode.STUDIO && (
          <div className="space-y-8 animate-in zoom-in-95 duration-500">
            <div className="space-y-6">
              {/* Bloque de Estilo */}
              <div className="glass-panel p-7 rounded-[3rem] border-white shadow-xl relative overflow-hidden group">
                <div className="flex justify-between items-center mb-5">
                   <div className="flex items-center gap-3">
                      <div className={`w-8 h-8 rounded-xl flex items-center justify-center text-[11px] ${remixResult ? 'bg-green-100 text-green-600' : 'bg-indigo-50 text-indigo-300'}`}>
                         <i className={`fas ${remixResult ? 'fa-check' : 'fa-compact-disc'}`}></i>
                      </div>
                      <span className="text-[10px] font-black text-indigo-950 uppercase tracking-widest">DNA Musical</span>
                   </div>
                   {remixResult && (
                     <button onClick={() => copyToClipboard(remixResult, "Estilo copiado")} className="text-indigo-400 text-xs active:scale-90 transition-all"><i className="fas fa-copy"></i></button>
                   )}
                </div>
                {remixResult ? (
                  <div className="bg-white/50 p-5 rounded-[2rem] border border-white/60 italic text-[11px] font-bold text-indigo-900 leading-relaxed shadow-inner">"{remixResult}"</div>
                ) : (
                  <button onClick={() => setMode(AppMode.MUSIC)} className="w-full py-5 border-2 border-dashed border-indigo-100 rounded-[2.5rem] text-[10px] font-black text-indigo-300 hover:bg-indigo-50/50 transition-all uppercase tracking-widest">Configurar Estilo</button>
                )}
              </div>

              {/* Bloque de Letra */}
              <div className="glass-panel p-7 rounded-[3rem] border-white shadow-xl">
                <div className="flex justify-between items-center mb-5">
                   <div className="flex items-center gap-3">
                      <div className={`w-8 h-8 rounded-xl flex items-center justify-center text-[11px] ${lyricsResult ? 'bg-green-100 text-green-600' : 'bg-indigo-50 text-indigo-300'}`}>
                         <i className={`fas ${lyricsResult ? 'fa-check' : 'fa-feather-alt'}`}></i>
                      </div>
                      <span className="text-[10px] font-black text-indigo-950 uppercase tracking-widest">Letra del Tema</span>
                   </div>
                   {lyricsResult && (
                     <button onClick={() => copyToClipboard(lyricsResult, "Letra copiada")} className="text-indigo-400 text-xs active:scale-90 transition-all"><i className="fas fa-copy"></i></button>
                   )}
                </div>
                {lyricsResult ? (
                  <div className="bg-white/50 p-6 rounded-[2rem] border border-white/60 text-[11px] font-bold text-indigo-950 max-h-52 overflow-y-auto whitespace-pre-wrap leading-relaxed shadow-inner custom-scrollbar">{lyricsResult}</div>
                ) : (
                  <button onClick={() => setMode(AppMode.LYRICS)} className="w-full py-5 border-2 border-dashed border-indigo-100 rounded-[2.5rem] text-[10px] font-black text-indigo-300 hover:bg-indigo-50/50 transition-all uppercase tracking-widest">Redactar Letra</button>
                )}
              </div>
            </div>

            <div className="pt-4 px-2">
              <button 
                onClick={exportToSuno}
                disabled={!remixResult && !lyricsResult}
                className="w-full py-9 bg-indigo-950 text-white rounded-[3.5rem] font-black text-xs shadow-3xl active:scale-95 transition-all flex flex-col items-center justify-center gap-4 uppercase tracking-[0.4em] disabled:opacity-30 disabled:grayscale"
              >
                <i className="fas fa-paper-plane text-2xl"></i>
                Lanzar a Suno AI
                <span className="text-[7px] opacity-30 font-bold tracking-[0.2em]">Auto-Copiado Inteligente</span>
              </button>
            </div>
          </div>
        )}
      </main>

      {/* Modal de Configuración */}
      {showSettings && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 animate-in fade-in duration-300">
           <div className="absolute inset-0 bg-indigo-950/40 backdrop-blur-2xl" onClick={() => setShowSettings(false)}></div>
           <div className="glass-panel w-full max-w-sm p-9 rounded-[4rem] border-white shadow-3xl relative z-10 animate-in zoom-in-95">
              <div className="flex justify-between items-center mb-10">
                <h2 className="text-xl font-black text-indigo-950 tracking-tighter">Ajustes Studio</h2>
                <button onClick={() => setShowSettings(false)} className="text-indigo-200 hover:text-indigo-600"><i className="fas fa-times-circle text-2xl"></i></button>
              </div>
              
              <div className="space-y-8">
                 <div className="flex items-center justify-between">
                    <div>
                       <p className="text-xs font-black text-indigo-900">Modelo Gemini Pro</p>
                       <p className="text-[9px] font-bold text-indigo-400 uppercase mt-1">Más creatividad lírica</p>
                    </div>
                    <button onClick={() => setUseProModel(!useProModel)} className={`w-14 h-7 rounded-full transition-all flex items-center px-1 ${useProModel ? 'bg-indigo-600' : 'bg-indigo-100'}`}>
                       <div className={`w-5 h-5 bg-white rounded-full shadow-lg transition-all transform ${useProModel ? 'translate-x-7' : 'translate-x-0'}`}></div>
                    </button>
                 </div>

                 <div className="flex items-center justify-between">
                    <div>
                       <p className="text-xs font-black text-indigo-900">Auto-Navegación</p>
                       <p className="text-[9px] font-bold text-indigo-400 uppercase mt-1">Saltar al estudio al acabar</p>
                    </div>
                    <button onClick={() => setAutoNavigate(!autoNavigate)} className={`w-14 h-7 rounded-full transition-all flex items-center px-1 ${autoNavigate ? 'bg-indigo-600' : 'bg-indigo-100'}`}>
                       <div className={`w-5 h-5 bg-white rounded-full shadow-lg transition-all transform ${autoNavigate ? 'translate-x-7' : 'translate-x-0'}`}></div>
                    </button>
                 </div>

                 <div className="pt-4">
                   <button 
                    onClick={() => { if(confirm("¿Reiniciar todo?")) { setScannedStyles([]); setLyricsResult(null); setRemixResult(null); setShowSettings(false); } }}
                    className="w-full py-5 border-2 border-red-50 text-red-500 rounded-[2rem] text-[10px] font-black uppercase tracking-widest active:bg-red-50 transition-all"
                   >
                      Limpiar Todo el Proyecto
                   </button>
                 </div>
              </div>

              <button onClick={() => setShowSettings(false)} className="w-full mt-10 py-5 bg-indigo-950 text-white rounded-[2rem] font-black text-[10px] uppercase tracking-[0.2em] shadow-xl">Guardar y Salir</button>
           </div>
        </div>
      )}

      {error && (
          <div className="fixed bottom-32 left-4 right-4 z-[200] glass-panel border-red-100 bg-red-50/80 p-5 rounded-[2.5rem] text-red-600 text-[11px] font-black flex items-center gap-4 animate-in slide-in-from-bottom-10">
              <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center text-red-500 flex-shrink-0"><i className="fas fa-exclamation-circle text-lg"></i></div>
              <div className="flex-1"><p>{error}</p></div>
              <button onClick={() => setError(null)} className="p-2"><i className="fas fa-times"></i></button>
          </div>
      )}

      <footer className="fixed bottom-8 text-center w-full max-w-lg left-1/2 -translate-x-1/2 pointer-events-none opacity-10">
        <p className="text-[7px] font-black text-indigo-950 uppercase tracking-[1.5em] flex items-center justify-center gap-2">
           PRO STUDIO ENGINE <span className="w-1 h-1 bg-indigo-600 rounded-full"></span> V3.5
        </p>
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

const copyToClipboard = (text: string, msg: string) => {
  navigator.clipboard.writeText(text);
  alert(msg);
};

export default App;
