
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

  // Config States
  const [useProModel, setUseProModel] = useState(true);
  const [autoNavigate, setAutoNavigate] = useState(true);

  // Music Mode States
  const [scannedStyles, setScannedStyles] = useState<ScannedStyle[]>([]);
  const [manualStyleInput, setManualStyleInput] = useState('');
  const [remixResult, setRemixResult] = useState<string | null>(null);

  // Lyric Mode States
  const [lyricIdea, setLyricIdea] = useState('');
  const [lyricRefs, setLyricRefs] = useState<string[]>(['']);
  const [lyricVoice, setLyricVoice] = useState<LyricForm['voice']>('Hombre');
  const [lyricLang, setLyricLang] = useState('Español');
  const [lyricVibe, setLyricVibe] = useState('Melódico');
  const [lyricsResult, setLyricsResult] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<number | null>(null);

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
      setError("Permisos denegados. Activa el micrófono.");
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
            { text: "Analiza el estilo musical. Devuelve JSON: genre, subgenre, bpm, key, mood, instruments (array), aiPrompt." }
          ]
        }],
        config: { responseMimeType: "application/json" }
      });
      const result: AnalysisResult = JSON.parse(response.text || '{}');
      setScannedStyles(prev => [...prev, { id: Math.random().toString(36).substr(2, 9), result, weight: 50 }]);
      setStatus(AnalysisStatus.COMPLETED);
    } catch (err) {
      setError("IA fuera de línea.");
      setStatus(AnalysisStatus.ERROR);
    }
  };

  const remixStyles = async () => {
    setStatus(AnalysisStatus.REMIXING);
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || '' });
      const prompt = `Crea un prompt de estilo para Suno AI. Mezcla estos estilos: ${scannedStyles.map(s => `${s.result.genre} (${s.weight}%)`).join(', ')}. Adicional: ${manualStyleInput}. Máximo 200 caracteres de puras palabras clave.`;
      const response = await ai.models.generateContent({ model: 'gemini-3-pro-preview', contents: prompt });
      setRemixResult(response.text?.trim() || null);
      setStatus(AnalysisStatus.COMPLETED);
      if (autoNavigate) setMode(AppMode.STUDIO);
    } catch (err) {
      setError("Fallo al mezclar.");
      setStatus(AnalysisStatus.ERROR);
    }
  };

  const generateLyrics = async () => {
    if (!lyricIdea) return;
    setStatus(AnalysisStatus.GENERATING_LYRICS);
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || '' });
      const prompt = `Escribe una letra de canción completa sobre: ${lyricIdea}. Referencias: ${lyricRefs.join(', ')}. Voz: ${lyricVoice}. Idioma: ${lyricLang}. Mood: ${lyricVibe}. REGLA: Devuelve SOLO el texto de la letra, sin marcas como [Verso].`;
      const response = await ai.models.generateContent({ model: 'gemini-3-pro-preview', contents: prompt });
      setLyricsResult(response.text?.replace(/\[.*?\]|\(.*?\)/g, '').trim() || null);
      setStatus(AnalysisStatus.COMPLETED);
      if (autoNavigate) setMode(AppMode.STUDIO);
    } catch (err) {
      setError("Error en letras.");
      setStatus(AnalysisStatus.ERROR);
    }
  };

  const exportToSuno = () => {
    const fullText = `ESTILO:\n${remixResult || 'No definido'}\n\nLETRA:\n${lyricsResult || 'No definida'}`;
    navigator.clipboard.writeText(fullText);
    alert("¡Copiado! Estilo y Letra listos para pegar en el modo 'Custom' de Suno.");
    window.open("https://suno.com/create", "_blank");
  };

  return (
    <div className="min-h-screen flex flex-col p-4 items-center max-w-lg mx-auto pb-44">
      {/* Header Con Ajustes */}
      <nav className="w-full flex justify-between items-center mb-6 pt-4 px-2">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-white shadow-lg flex items-center justify-center text-indigo-600 border border-white">
            <i className={`fas ${mode === AppMode.MUSIC ? 'fa-sliders-h' : mode === AppMode.LYRICS ? 'fa-feather-alt' : 'fa-rocket'}`}></i>
          </div>
          <div>
            <span className="block font-black text-lg text-indigo-950 tracking-tighter leading-none">MusiGlass</span>
            <span className="block text-[8px] font-black text-indigo-400 uppercase tracking-widest">v3.5 Studio</span>
          </div>
        </div>
        <button 
          onClick={() => setShowSettings(true)}
          className="w-10 h-10 rounded-2xl bg-white/50 backdrop-blur-sm flex items-center justify-center text-indigo-950/40 shadow-sm border border-white active:scale-90 transition-all"
        >
          <i className="fas fa-cog"></i>
        </button>
      </nav>

      {/* Tabs Principales */}
      <div className="flex bg-indigo-50/50 p-1.5 rounded-3xl border border-indigo-100/50 backdrop-blur-xl mb-8 w-full">
        <button onClick={() => setMode(AppMode.MUSIC)} className={`flex-1 py-3 rounded-[1.2rem] transition-all text-[10px] font-black tracking-tight ${mode === AppMode.MUSIC ? 'bg-indigo-600 text-white shadow-xl' : 'text-indigo-300'}`}>ESTILOS</button>
        <button onClick={() => setMode(AppMode.LYRICS)} className={`flex-1 py-3 rounded-[1.2rem] transition-all text-[10px] font-black tracking-tight ${mode === AppMode.LYRICS ? 'bg-indigo-600 text-white shadow-xl' : 'text-indigo-300'}`}>LETRAS</button>
        <button onClick={() => setMode(AppMode.STUDIO)} className={`flex-1 py-3 rounded-[1.2rem] transition-all text-[10px] font-black tracking-tight ${mode === AppMode.STUDIO ? 'bg-indigo-600 text-white shadow-xl' : 'text-indigo-300'}`}>ESTUDIO</button>
      </div>

      <main className="flex-1 w-full space-y-6">
        {mode === AppMode.MUSIC && (
          <div className="space-y-6 animate-in fade-in slide-in-from-left-4">
             {/* ... UI de Scanner existente simplificada para espacio ... */}
             <div className="flex flex-col items-center py-6">
                <button 
                  onClick={status === AnalysisStatus.RECORDING ? stopRecording : startAnalysis}
                  className={`w-40 h-40 rounded-full liquid-orb flex items-center justify-center text-white text-4xl active:scale-90 transition-all ${status === AnalysisStatus.RECORDING ? 'recording-pulse' : ''}`}
                >
                  <i className={`fas ${status === AnalysisStatus.RECORDING ? 'fa-stop' : 'fa-microphone-alt'}`}></i>
                </button>
                <p className="mt-6 text-[10px] font-black text-indigo-900/40 uppercase tracking-widest">Samplear ADN Musical</p>
             </div>

             {scannedStyles.length > 0 && (
               <div className="space-y-4">
                 {scannedStyles.map(s => (
                   <div key={s.id} className="glass-panel p-5 rounded-[2rem] border-white shadow-lg">
                     <div className="flex justify-between items-center mb-4">
                        <h4 className="text-xs font-black text-indigo-950 uppercase">{s.result.genre}</h4>
                        <button onClick={() => setScannedStyles(scannedStyles.filter(x => x.id !== s.id))} className="text-red-400"><i className="fas fa-trash-alt"></i></button>
                     </div>
                     <input type="range" min="0" max="100" value={s.weight} onChange={(e) => setScannedStyles(scannedStyles.map(x => x.id === s.id ? {...x, weight: parseInt(e.target.value)} : x))} className="w-full accent-indigo-600" />
                   </div>
                 ))}
                 <button onClick={remixStyles} className="w-full py-5 bg-indigo-950 text-white rounded-[2rem] font-black text-[10px] uppercase tracking-widest shadow-2xl">Remezclar Estilos</button>
               </div>
             )}
          </div>
        )}

        {mode === AppMode.LYRICS && (
          <div className="space-y-6 animate-in fade-in slide-in-from-right-4">
            <div className="glass-panel p-7 rounded-[3rem] border-white space-y-6">
              <textarea value={lyricIdea} onChange={(e) => setLyricIdea(e.target.value)} placeholder="¿De qué trata tu canción?" className="w-full bg-white/60 border border-white rounded-[1.8rem] p-5 text-xs font-bold h-32 focus:ring-0" />
              <div className="grid grid-cols-2 gap-3">
                <select value={lyricVoice} onChange={(e) => setLyricVoice(e.target.value as any)} className="bg-white/80 border border-white rounded-2xl p-3 text-[10px] font-black appearance-none"><option>Hombre</option><option>Mujer</option><option>Dúo</option></select>
                <select value={lyricLang} onChange={(e) => setLyricLang(e.target.value)} className="bg-white/80 border border-white rounded-2xl p-3 text-[10px] font-black appearance-none"><option>Español</option><option>Inglés</option></select>
              </div>
              <button onClick={generateLyrics} className="w-full py-5 bg-indigo-600 text-white rounded-[2rem] font-black text-[10px] uppercase tracking-widest">Generar Letra Pura</button>
            </div>
          </div>
        )}

        {mode === AppMode.STUDIO && (
          <div className="space-y-6 animate-in zoom-in-95 duration-500">
            <div className="grid gap-6">
              {/* Card de Estilo */}
              <div className="glass-panel p-6 rounded-[2.5rem] border-white shadow-xl relative overflow-hidden">
                <div className="flex justify-between items-center mb-4">
                   <span className="text-[9px] font-black text-indigo-400 uppercase tracking-widest">DNA Musical</span>
                   {remixResult && <i className="fas fa-check-circle text-green-500"></i>}
                </div>
                {remixResult ? (
                  <div className="bg-white/40 p-5 rounded-3xl border border-white/50 italic text-[11px] font-bold text-indigo-950">"{remixResult}"</div>
                ) : (
                  <button onClick={() => setMode(AppMode.MUSIC)} className="w-full py-4 border-2 border-dashed border-indigo-100 rounded-3xl text-[10px] font-black text-indigo-300">CONFIGURAR ESTILO</button>
                )}
              </div>

              {/* Card de Letra */}
              <div className="glass-panel p-6 rounded-[2.5rem] border-white shadow-xl">
                <div className="flex justify-between items-center mb-4">
                   <span className="text-[9px] font-black text-indigo-400 uppercase tracking-widest">Letra del Tema</span>
                   {lyricsResult && <i className="fas fa-check-circle text-green-500"></i>}
                </div>
                {lyricsResult ? (
                  <div className="bg-white/40 p-5 rounded-3xl border border-white/50 text-[11px] font-bold text-indigo-950 max-h-40 overflow-y-auto whitespace-pre-wrap">{lyricsResult}</div>
                ) : (
                  <button onClick={() => setMode(AppMode.LYRICS)} className="w-full py-4 border-2 border-dashed border-indigo-100 rounded-3xl text-[10px] font-black text-indigo-300">REDACTAR LETRA</button>
                )}
              </div>
            </div>

            <div className="pt-4">
              <button 
                onClick={exportToSuno}
                disabled={!remixResult && !lyricsResult}
                className="w-full py-8 bg-indigo-950 text-white rounded-[3rem] font-black text-xs shadow-2xl active:scale-95 transition-all flex flex-col items-center justify-center gap-2 uppercase tracking-[0.3em] disabled:opacity-30"
              >
                <i className="fas fa-rocket text-2xl mb-1"></i>
                Lanzar a Suno AI
                <span className="text-[8px] opacity-40 font-bold">Copia todo automáticamente</span>
              </button>
            </div>
          </div>
        )}
      </main>

      {/* Modal de Ajustes */}
      {showSettings && (
        <div className="fixed inset-0 z-[2000] flex items-center justify-center p-6 animate-in fade-in duration-300">
           <div className="absolute inset-0 bg-indigo-950/20 backdrop-blur-3xl" onClick={() => setShowSettings(false)}></div>
           <div className="glass-panel w-full max-w-sm p-8 rounded-[3.5rem] border-white shadow-3xl relative z-10">
              <h2 className="text-xl font-black text-indigo-950 mb-8 tracking-tighter">Configuración</h2>
              
              <div className="space-y-6">
                 <div className="flex items-center justify-between">
                    <div>
                       <p className="text-xs font-black text-indigo-900">Modo Creativo Pro</p>
                       <p className="text-[9px] font-bold text-indigo-400 uppercase">Usa Gemini 3 Pro para mejores letras</p>
                    </div>
                    <button onClick={() => setUseProModel(!useProModel)} className={`w-12 h-6 rounded-full transition-all ${useProModel ? 'bg-indigo-600' : 'bg-indigo-100'}`}>
                       <div className={`w-4 h-4 bg-white rounded-full shadow-sm transition-all transform ${useProModel ? 'translate-x-7' : 'translate-x-1'}`}></div>
                    </button>
                 </div>

                 <div className="flex items-center justify-between">
                    <div>
                       <p className="text-xs font-black text-indigo-900">Auto-Navegación</p>
                       <p className="text-[9px] font-bold text-indigo-400 uppercase">Ir al Estudio al terminar</p>
                    </div>
                    <button onClick={() => setAutoNavigate(!autoNavigate)} className={`w-12 h-6 rounded-full transition-all ${autoNavigate ? 'bg-indigo-600' : 'bg-indigo-100'}`}>
                       <div className={`w-4 h-4 bg-white rounded-full shadow-sm transition-all transform ${autoNavigate ? 'translate-x-7' : 'translate-x-1'}`}></div>
                    </button>
                 </div>

                 <button 
                  onClick={() => { setScannedStyles([]); setLyricsResult(null); setRemixResult(null); setShowSettings(false); }}
                  className="w-full py-4 border-2 border-red-50 text-red-500 rounded-3xl text-[10px] font-black uppercase tracking-widest mt-4"
                 >
                    Reiniciar Aplicación
                 </button>
              </div>

              <button onClick={() => setShowSettings(false)} className="w-full mt-8 py-4 bg-indigo-950 text-white rounded-[1.8rem] font-black text-[10px] uppercase tracking-widest">Cerrar</button>
           </div>
        </div>
      )}

      <footer className="fixed bottom-10 text-center w-full max-w-lg left-1/2 -translate-x-1/2 pointer-events-none opacity-5">
        <p className="text-[6px] font-black text-indigo-950 uppercase tracking-[1.5em]">MusiGlass Advanced Studio Logic</p>
      </footer>
    </div>
  );
};

export default App;
