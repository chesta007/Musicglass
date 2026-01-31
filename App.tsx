
import React, { useState, useRef, useEffect } from 'react';
import { GoogleGenAI, Type } from "@google/genai";
import { AnalysisResult, AnalysisStatus, AppMode, LyricForm, ScannedStyle } from './types';
import { getAudioStream, blobToBase64, getSupportedMimeType } from './services/audioRecorder';

const DECO_MESSAGES = [
  "Reticulando splines...",
  "Desmenuzando beats...",
  "Midiendo ritmos siderales...",
  "Afinando condensador de fluzo...",
  "Calibrando sintes analógicos...",
  "Buscando la quinta nota...",
  "Aislando ruido interestelar...",
  "Compilando rimas imposibles...",
  "Calculando el swing del bombo...",
  "Extrayendo el alma del bajo...",
  "Limpiando polvo de vinilos...",
  "Ajustando autotune cuántico...",
  "Invocando espíritus rítmicos...",
  "Traduciendo silencios...",
  "Añadiendo 3% de magia pura...",
  "Mezclando frecuencias prohibidas...",
  "Sincronizando metrónomos...",
  "Analizando transientes rebeldes..."
];

const App: React.FC = () => {
  const [mode, setMode] = useState<AppMode>(AppMode.MUSIC);
  const [status, setStatus] = useState<AnalysisStatus>(AnalysisStatus.IDLE);
  const [error, setError] = useState<string | null>(null);
  const [recordingTime, setRecordingTime] = useState(0);
  const [showSettings, setShowSettings] = useState(false);
  const [decoMsg, setDecoMsg] = useState("");
  const [isPWA, setIsPWA] = useState(false);

  const [useProModel, setUseProModel] = useState(true);
  const [autoNavigate, setAutoNavigate] = useState(true);

  // Estados de Música
  const [scannedStyles, setScannedStyles] = useState<ScannedStyle[]>([]);
  const [manualStyleInput, setManualStyleInput] = useState('');
  const [remixResult, setRemixResult] = useState<string | null>(null);

  // Estados de Letras
  const [lyricIdea, setLyricIdea] = useState('');
  const [lyricVoice, setLyricVoice] = useState<LyricForm['voice']>('Hombre');
  const [lyricLang, setLyricLang] = useState('Español');
  const [lyricVibe, setLyricVibe] = useState('Melódico');
  const [lyricsResult, setLyricsResult] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<number | null>(null);
  const mimeTypeRef = useRef<string>('');

  useEffect(() => {
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches || (window.navigator as any).standalone === true;
    setIsPWA(isStandalone);
  }, []);

  useEffect(() => {
    let interval: number;
    const isBusy = [
      AnalysisStatus.RECORDING, 
      AnalysisStatus.ANALYZING, 
      AnalysisStatus.REMIXING, 
      AnalysisStatus.GENERATING_LYRICS
    ].includes(status);

    if (isBusy) {
      setDecoMsg(DECO_MESSAGES[Math.floor(Math.random() * DECO_MESSAGES.length)]);
      interval = window.setInterval(() => {
        setDecoMsg(DECO_MESSAGES[Math.floor(Math.random() * DECO_MESSAGES.length)]);
      }, 2200);
    } else {
      setDecoMsg("");
    }

    return () => clearInterval(interval);
  }, [status]);

  const startAnalysis = async () => {
    try {
      setError(null);
      const stream = await getAudioStream();
      mimeTypeRef.current = getSupportedMimeType();
      const mediaRecorder = new MediaRecorder(stream, mimeTypeRef.current ? { mimeType: mimeTypeRef.current } : undefined);
      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];
      
      mediaRecorder.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(chunksRef.current, { type: mimeTypeRef.current });
        analyzeAudio(audioBlob);
        stream.getTracks().forEach(track => track.stop());
      };

      mediaRecorder.start();
      setStatus(AnalysisStatus.RECORDING);
      setRecordingTime(0);
      timerRef.current = window.setInterval(() => {
        setRecordingTime(prev => { if (prev >= 8) { stopRecording(); return 8; } return prev + 1; });
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
            { text: "Analiza esta muestra de audio musical. Responde estrictamente en formato JSON con los siguientes campos: genre (estilo principal), subgenre, bpm, key, mood, instruments (lista), aiPrompt (tags para generación musical)." }
          ]
        }],
        config: { responseMimeType: "application/json" }
      });
      const result: AnalysisResult = JSON.parse(response.text || '{}');
      setScannedStyles(prev => [{ id: Math.random().toString(36).substr(2, 9), result, weight: 50 }, ...prev]);
      setStatus(AnalysisStatus.COMPLETED);
    } catch (err: any) {
      setError("Fallo en el análisis sónico.");
      setStatus(AnalysisStatus.ERROR);
    }
  };

  const remixStyles = async () => {
    if (scannedStyles.length === 0 && !manualStyleInput) return;
    setStatus(AnalysisStatus.REMIXING);
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || '' });
      const stylesStr = scannedStyles.map(s => `${s.result.genre} (${s.result.aiPrompt})`).join(', ');
      const prompt = `Actúa como un experto en prompts de Suno AI. Genera una lista de etiquetas (estilos, instrumentos, vibras) separadas por comas.
      REGLAS: Solo palabras clave, sin frases, máximo 1000 caracteres.
      Base de estilos: [${stylesStr}]. Instrucciones adicionales: ${manualStyleInput}.`;
      
      const response = await ai.models.generateContent({ model: 'gemini-3-pro-preview', contents: prompt });
      setRemixResult(response.text?.trim()?.substring(0, 1000) || "");
      setStatus(AnalysisStatus.COMPLETED);
      if (autoNavigate) setTimeout(() => setMode(AppMode.STUDIO), 600);
    } catch (err: any) {
      setError("Error mezclando ADN musical.");
      setStatus(AnalysisStatus.ERROR);
    }
  };

  const generateLyrics = async () => {
    if (!lyricIdea) return;
    setStatus(AnalysisStatus.GENERATING_LYRICS);
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || '' });
      const prompt = `Escribe la letra de una canción. Idea: ${lyricIdea}. Voz: ${lyricVoice}. Idioma: ${lyricLang}. Estilo: ${lyricVibe}. REGLA: Sin títulos ni etiquetas de partes [Chorus], solo el texto puro lírico.`;
      const response = await ai.models.generateContent({ model: 'gemini-3-pro-preview', contents: prompt });
      setLyricsResult(response.text?.replace(/\[.*?\]|\(.*?\)/g, '').trim() || null);
      setStatus(AnalysisStatus.COMPLETED);
      if (autoNavigate) setTimeout(() => setMode(AppMode.STUDIO), 600);
    } catch (err: any) {
      setError("Error redactando versos.");
      setStatus(AnalysisStatus.ERROR);
    }
  };

  const exportToSuno = () => {
    const fullText = `STYLE:\n${remixResult || ''}\n\nLYRICS:\n${lyricsResult || ''}`;
    navigator.clipboard.writeText(fullText);
    alert("¡ADN copiado! Dirígete a Suno.");
    window.open("https://suno.com/create", "_blank");
  };

  const copyToClipboard = (text: string, msg: string) => {
    navigator.clipboard.writeText(text);
    alert(msg);
  };

  return (
    <div className="min-h-screen flex flex-col p-4 items-center max-w-lg mx-auto pb-44 selection:bg-indigo-100 transition-all duration-700 overflow-x-hidden">
      <nav className="w-full flex justify-between items-center mb-6 pt-4 px-2">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-white shadow-xl flex items-center justify-center text-indigo-600 border border-white transition-transform hover:rotate-12">
            <i className={`fas ${mode === AppMode.MUSIC ? 'fa-compact-disc animate-spin-slow' : mode === AppMode.LYRICS ? 'fa-pen-nib' : 'fa-rocket'}`}></i>
          </div>
          <div>
            <h1 className="block font-black text-xl text-indigo-950 tracking-tighter leading-none">MusiGlass</h1>
            <span className="block text-[8px] font-black text-indigo-400 uppercase tracking-[0.2em]">Studio Engine v2.0</span>
          </div>
        </div>
        <button onClick={() => setShowSettings(true)} className="w-11 h-11 rounded-2xl bg-white/60 backdrop-blur-md flex items-center justify-center text-indigo-950/30 shadow-sm border border-white active:scale-90 transition-all">
          <i className="fas fa-sliders-h text-lg"></i>
        </button>
      </nav>

      <div className="flex bg-white/30 backdrop-blur-3xl p-1.5 rounded-[2rem] border border-white/60 shadow-lg mb-8 w-full sticky top-4 z-50 overflow-x-auto no-scrollbar">
        <div className="flex w-full gap-1">
            {[
                {id: AppMode.MUSIC, label: 'ESTILOS', icon: 'fa-music'},
                {id: AppMode.LYRICS, label: 'LETRAS', icon: 'fa-pen-nib'},
                {id: AppMode.STUDIO, label: 'ESTUDIO', icon: 'fa-rocket'}
            ].map(tab => (
                <button key={tab.id} onClick={() => setMode(tab.id)} className={`flex-1 py-3.5 rounded-[1.5rem] transition-all duration-500 text-[10px] font-black flex items-center justify-center gap-2 ${mode === tab.id ? 'bg-indigo-600 text-white shadow-xl scale-[1.02]' : 'text-indigo-300'}`}>
                    <i className={`fas ${tab.icon}`}></i>
                    <span>{tab.label}</span>
                </button>
            ))}
        </div>
      </div>

      <main className="flex-1 w-full space-y-6">
        {mode === AppMode.MUSIC && (
          <div className="space-y-6 animate-in fade-in slide-in-from-left-6 duration-700">
             <div className="flex flex-col items-center py-8 relative">
                <button 
                  onClick={status === AnalysisStatus.RECORDING ? stopRecording : startAnalysis}
                  disabled={status === AnalysisStatus.ANALYZING}
                  className={`w-48 h-48 rounded-full liquid-orb flex items-center justify-center text-white text-5xl active:scale-95 transition-all duration-500 shadow-2xl z-10 ${status === AnalysisStatus.RECORDING ? 'recording-pulse scale-110' : ''} ${status === AnalysisStatus.ANALYZING ? 'scale-90 opacity-80' : ''}`}
                >
                  <i className={`fas ${status === AnalysisStatus.RECORDING ? 'fa-square' : status === AnalysisStatus.ANALYZING ? 'fa-spinner fa-spin' : 'fa-microphone-lines'}`}></i>
                </button>
                <div className="text-center mt-8">
                  <h3 className="text-sm font-black text-indigo-950 uppercase tracking-widest">ADN de Beats</h3>
                  <div className="h-10 flex flex-col justify-center">
                    <p className={`text-[10px] font-bold uppercase transition-all duration-300 ${status === AnalysisStatus.RECORDING ? 'text-red-500 animate-pulse' : 'text-indigo-400'}`}>
                      {status === AnalysisStatus.RECORDING ? `Escuchando (${recordingTime}s)...` : status === AnalysisStatus.ANALYZING ? "Procesando Ondas..." : "Analiza estilos en tiempo real"}
                    </p>
                    {decoMsg && <p className="text-[8px] font-black text-indigo-300 uppercase mt-1 italic animate-in slide-in-from-bottom-2">{decoMsg}</p>}
                  </div>
                </div>
             </div>

             <div className="space-y-4">
               {scannedStyles.map((s, idx) => (
                 <div key={s.id} className="glass-panel p-6 rounded-[2.5rem] border-white shadow-xl animate-in zoom-in-95" style={{animationDelay: `${idx*100}ms`}}>
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

             <div className="glass-panel p-6 rounded-[2.5rem] border-white shadow-xl">
                <label className="text-[10px] font-black text-indigo-400 uppercase ml-1 mb-3 block tracking-widest">Personalizar Estilo</label>
                <textarea value={manualStyleInput} onChange={(e) => setManualStyleInput(e.target.value)} placeholder="Ej: Funk retro con toques de Jazz..." className="w-full bg-white/40 border-none p-5 text-xs font-bold h-24 placeholder:text-indigo-200 focus:ring-0 rounded-2xl" />
             </div>

             <button onClick={remixStyles} disabled={status === AnalysisStatus.REMIXING || (scannedStyles.length === 0 && !manualStyleInput)} className="w-full py-6 bg-indigo-950 text-white rounded-[2.5rem] font-black text-xs uppercase shadow-2xl active:scale-95 transition-all">
                {status === AnalysisStatus.REMIXING ? <i className="fas fa-spinner fa-spin mr-2"></i> : null}
                {status === AnalysisStatus.REMIXING ? "Mezclando ADN..." : "Generar Prompt de Estilo"}
             </button>
          </div>
        )}

        {mode === AppMode.LYRICS && (
          <div className="space-y-6 animate-in fade-in slide-in-from-right-6 duration-700">
            <div className="glass-panel p-8 rounded-[3rem] border-white shadow-2xl space-y-6">
              <textarea value={lyricIdea} onChange={(e) => setLyricIdea(e.target.value)} placeholder="¿De qué habla tu canción?" className="w-full bg-white/50 border-white rounded-[2rem] p-6 text-xs font-bold h-44 shadow-inner focus:ring-0" />
              <div className="grid grid-cols-2 gap-4">
                <select value={lyricVoice} onChange={(e) => setLyricVoice(e.target.value as any)} className="bg-white/80 border-white rounded-2xl p-4 text-[10px] font-black appearance-none"><option>Hombre</option><option>Mujer</option><option>Dúo</option></select>
                <select value={lyricLang} onChange={(e) => setLyricLang(e.target.value)} className="bg-white/80 border-white rounded-2xl p-4 text-[10px] font-black appearance-none"><option>Español</option><option>Inglés</option></select>
              </div>
              <button onClick={generateLyrics} disabled={status === AnalysisStatus.GENERATING_LYRICS || !lyricIdea} className="w-full py-6 bg-indigo-600 text-white rounded-[2.5rem] font-black text-xs uppercase shadow-2xl active:scale-95 transition-all">
                {status === AnalysisStatus.GENERATING_LYRICS ? <i className="fas fa-circle-notch fa-spin"></i> : "Redactar Letra"}
              </button>
            </div>
          </div>
        )}

        {mode === AppMode.STUDIO && (
          <div className="space-y-8 animate-in zoom-in-95 duration-700">
            <div className="space-y-6">
              <div className="glass-panel p-7 rounded-[3rem] border-white shadow-xl">
                <div className="flex justify-between items-center mb-5">
                   <span className="text-[10px] font-black text-indigo-950 uppercase tracking-widest">Estilo (Suno Tags)</span>
                   {remixResult && <button onClick={() => copyToClipboard(remixResult, "Prompt copiado")} className="text-indigo-400"><i className="fas fa-copy"></i></button>}
                </div>
                {remixResult ? (
                  <div className="bg-white/50 p-5 rounded-[2rem] text-[11px] font-bold text-indigo-900 leading-relaxed shadow-inner">"{remixResult}"</div>
                ) : (
                  <button onClick={() => setMode(AppMode.MUSIC)} className="w-full py-5 border-2 border-dashed border-indigo-100 rounded-[2.5rem] text-[10px] font-black text-indigo-300">Configurar Estilo</button>
                )}
              </div>

              <div className="glass-panel p-7 rounded-[3rem] border-white shadow-xl">
                <div className="flex justify-between items-center mb-5">
                   <span className="text-[10px] font-black text-indigo-950 uppercase tracking-widest">Letra Generada</span>
                   {lyricsResult && <button onClick={() => copyToClipboard(lyricsResult, "Letra copiada")} className="text-indigo-400"><i className="fas fa-copy"></i></button>}
                </div>
                {lyricsResult ? (
                  <div className="bg-white/50 p-6 rounded-[2rem] text-[11px] font-bold text-indigo-950 max-h-52 overflow-y-auto whitespace-pre-wrap shadow-inner custom-scrollbar">{lyricsResult}</div>
                ) : (
                  <button onClick={() => setMode(AppMode.LYRICS)} className="w-full py-5 border-2 border-dashed border-indigo-100 rounded-[2.5rem] text-[10px] font-black text-indigo-300">Redactar Letra</button>
                )}
              </div>
            </div>

            <button onClick={exportToSuno} disabled={!remixResult && !lyricsResult} className="w-full py-9 bg-indigo-950 text-white rounded-[3.5rem] font-black text-xs shadow-3xl flex flex-col items-center gap-4 uppercase tracking-[0.2em] active:scale-95 transition-all group">
              <i className="fas fa-rocket text-2xl group-hover:translate-x-1 group-hover:-translate-y-1 transition-transform"></i>
              Lanzar Producción
            </button>
          </div>
        )}
      </main>

      {showSettings && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 animate-in fade-in duration-300">
           <div className="absolute inset-0 bg-indigo-950/40 backdrop-blur-2xl" onClick={() => setShowSettings(false)}></div>
           <div className="glass-panel w-full max-w-sm p-9 rounded-[4rem] border-white shadow-3xl relative z-10 animate-in zoom-in-95">
              <h2 className="text-xl font-black text-indigo-950 mb-10 tracking-tighter">Ajustes Studio</h2>
              <div className="space-y-8">
                 <div className="flex items-center justify-between">
                    <div><p className="text-xs font-black text-indigo-900">Gemini 3 Pro</p><p className="text-[9px] font-bold text-indigo-400 uppercase">Motor Principal</p></div>
                    <button onClick={() => setUseProModel(!useProModel)} className={`w-14 h-7 rounded-full flex items-center px-1 transition-all duration-300 ${useProModel ? 'bg-indigo-600' : 'bg-indigo-100'}`}>
                       <div className={`w-5 h-5 bg-white rounded-full shadow-lg transform transition-transform duration-300 ${useProModel ? 'translate-x-7' : 'translate-x-0'}`}></div>
                    </button>
                 </div>
                 <button onClick={() => { if(confirm("¿Limpiar todo el proyecto?")) { window.location.reload(); } }} className="w-full py-5 border-2 border-red-50 text-red-500 rounded-[2rem] text-[10px] font-black uppercase tracking-widest">Reiniciar Sesión</button>
              </div>
              <button onClick={() => setShowSettings(false)} className="w-full mt-10 py-5 bg-indigo-950 text-white rounded-[2rem] font-black text-[10px] uppercase shadow-xl">Cerrar</button>
           </div>
        </div>
      )}

      {error && (
          <div className="fixed inset-x-4 bottom-32 z-[200] glass-panel border-red-100 bg-white/95 p-6 rounded-[2.5rem] shadow-2xl animate-in slide-in-from-bottom-10">
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center text-red-500 flex-shrink-0 animate-bounce"><i className="fas fa-exclamation-triangle"></i></div>
                <div className="flex-1">
                  <h4 className="text-[11px] font-black text-red-600 uppercase mb-1">Aviso del Sistema</h4>
                  <p className="text-[10px] font-bold text-indigo-900 leading-tight mb-4">{error}</p>
                  <button onClick={() => setError(null)} className="px-5 py-2.5 bg-indigo-600 text-white text-[9px] font-black rounded-full uppercase">Entendido</button>
                </div>
              </div>
          </div>
      )}

      <footer className="fixed bottom-8 text-center w-full max-w-lg left-1/2 -translate-x-1/2 pointer-events-none opacity-20 transition-opacity">
        <p className="text-[7px] font-black text-indigo-950 uppercase tracking-[1.5em]">MusiGlass Studio Engine</p>
      </footer>

      <style>{`
        .no-scrollbar::-webkit-scrollbar { display: none; }
        .custom-scrollbar::-webkit-scrollbar { width: 4px; display: block; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(99, 102, 241, 0.1); border-radius: 10px; }
        @keyframes orb-pulse {
            0% { box-shadow: 0 0 0 0 rgba(99, 102, 241, 0.5), 0 45px 90px -15px rgba(99, 102, 241, 0.4); }
            70% { box-shadow: 0 0 0 45px rgba(99, 102, 241, 0), 0 45px 90px -15px rgba(99, 102, 241, 0.4); }
            100% { box-shadow: 0 0 0 0 rgba(99, 102, 241, 0), 0 45px 90px -15px rgba(99, 102, 241, 0.4); }
        }
        .recording-pulse { animation: orb-pulse 1.5s infinite; }
        .animate-spin-slow { animation: spin 10s linear infinite; }
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
};

export default App;
