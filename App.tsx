
import React, { useState, useRef } from 'react';
import { GoogleGenAI, Type } from "@google/genai";
import { AnalysisResult, AnalysisStatus, AppMode, LyricForm } from './types';
import { getAudioStream, blobToBase64 } from './services/audioRecorder';

const App: React.FC = () => {
  const [mode, setMode] = useState<AppMode>(AppMode.MUSIC);
  const [status, setStatus] = useState<AnalysisStatus>(AnalysisStatus.IDLE);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [lyricsResult, setLyricsResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [recordingTime, setRecordingTime] = useState(0);

  // Lyric Form States
  const [lyricIdea, setLyricIdea] = useState('');
  const [lyricRefs, setLyricRefs] = useState<string[]>(['']);
  const [lyricVoice, setLyricVoice] = useState<LyricForm['voice']>('Hombre');
  const [lyricLang, setLyricLang] = useState('Español');
  const [lyricVibe, setLyricVibe] = useState('Melódico');
  const [lyricComplexity, setLyricComplexity] = useState('Sencilla'); // New indicator
  
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<number | null>(null);

  const startAnalysis = async () => {
    try {
      setError(null);
      setResult(null);
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
          if (prev >= 10) { stopRecording(); return 10; }
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
        model: 'gemini-3-flash-preview',
        contents: [{
          parts: [
            { inlineData: { data: base64Audio, mimeType: 'audio/webm' } },
            { text: "Identifica género, subgénero, BPM y tonalidad. Genera un prompt para SUNO AI V3.5 (máx 200 caracteres) descriptivo. Devuelve SOLO JSON." }
          ]
        }],
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              genre: { type: Type.STRING },
              subgenre: { type: Type.STRING },
              bpm: { type: Type.NUMBER },
              key: { type: Type.STRING },
              mood: { type: Type.STRING },
              instruments: { type: Type.ARRAY, items: { type: Type.STRING } },
              aiPrompt: { type: Type.STRING }
            },
            required: ["genre", "subgenre", "bpm", "key", "mood", "instruments", "aiPrompt"]
          }
        }
      });
      setResult(JSON.parse(response.text || '{}'));
      setStatus(AnalysisStatus.COMPLETED);
    } catch (err) {
      setError("IA fuera de línea.");
      setStatus(AnalysisStatus.ERROR);
    }
  };

  const generateLyrics = async () => {
    if (!lyricIdea) { setError("Escribe de qué quieres que hable la letra."); return; }
    setStatus(AnalysisStatus.GENERATING_LYRICS);
    setError(null);
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || '' });
      const prompt = `Actúa como un compositor experto de canciones para Suno AI.
        IDEA DE LA LETRA: ${lyricIdea}. 
        MEZCLA DE ESTILOS/REFERENCIAS: ${lyricRefs.filter(r => r).join(', ')}. Mezcla la esencia de estos temas en una sola obra original.
        INDICADORES TÉCNICOS:
        - Voz: ${lyricVoice}
        - Idioma: ${lyricLang}
        - Vibe/Energía: ${lyricVibe}
        - Complejidad: ${lyricComplexity}
        
        REGLA DE ORO (MANDATORIA): Devuelve ÚNICAMENTE la letra de la canción. 
        PROHIBIDO usar etiquetas estructurales como [Verso], [Coro], [Chorus], (Vocal), [Outro], (Estribillo), [Puente] o cualquier marcador entre corchetes o paréntesis. 
        Solo quiero el texto limpio, separado por saltos de línea donde corresponda la pausa natural de la canción.`;
      
      const response = await ai.models.generateContent({
        model: 'gemini-3-pro-preview', // Use Pro for better lyrical creative mixing
        contents: prompt
      });
      
      // Secondary cleaning just in case the model ignores instructions
      const rawLyrics = response.text || '';
      const cleanedLyrics = rawLyrics.replace(/\[.*?\]|\(.*?\)/g, '').trim();
      
      setLyricsResult(cleanedLyrics || 'No se pudo generar la letra.');
      setStatus(AnalysisStatus.COMPLETED);
    } catch (err) {
      setError("Fallo al generar letra.");
      setStatus(AnalysisStatus.ERROR);
    }
  };

  const addRefField = () => { if (lyricRefs.length < 3) setLyricRefs([...lyricRefs, '']); };
  const updateRef = (index: number, val: string) => {
    const newRefs = [...lyricRefs];
    newRefs[index] = val;
    setLyricRefs(newRefs);
  };

  const copyToClipboard = (text: string, msg: string) => {
    navigator.clipboard.writeText(text);
    alert(msg);
  };

  return (
    <div className="min-h-screen flex flex-col p-6 items-center max-w-lg mx-auto pb-32">
      {/* Header */}
      <nav className="w-full flex justify-between items-center mb-8 pt-4">
        <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-[1.2rem] bg-white shadow-xl flex items-center justify-center text-indigo-600 border border-white">
                <i className={`fas ${mode === AppMode.MUSIC ? 'fa-compact-disc animate-spin-slow' : 'fa-pen-fancy'}`}></i>
            </div>
            <div>
              <span className="block font-black text-xl text-indigo-950 tracking-tighter leading-none">MusiGlass</span>
              <span className="block text-[9px] font-black text-indigo-400 uppercase tracking-widest">{mode === AppMode.MUSIC ? 'Analizador' : 'Redactor Pro'}</span>
            </div>
        </div>
        <div className="flex bg-white/50 p-1 rounded-2xl border border-white">
            <button onClick={() => { setMode(AppMode.MUSIC); setStatus(AnalysisStatus.IDLE); }} className={`px-4 py-2 rounded-xl transition-all text-xs font-black ${mode === AppMode.MUSIC ? 'bg-indigo-600 text-white shadow-md' : 'text-indigo-300'}`}>
                ESCÁNER
            </button>
            <button onClick={() => { setMode(AppMode.LYRICS); setStatus(AnalysisStatus.IDLE); }} className={`px-4 py-2 rounded-xl transition-all text-xs font-black ${mode === AppMode.LYRICS ? 'bg-indigo-600 text-white shadow-md' : 'text-indigo-300'}`}>
                LETRA
            </button>
        </div>
      </nav>

      <main className="flex-1 w-full flex flex-col gap-8">
        {mode === AppMode.MUSIC ? (
          <>
            <div className="flex flex-col items-center gap-10 py-6">
                <button 
                    onClick={status === AnalysisStatus.RECORDING ? stopRecording : startAnalysis}
                    className={`w-60 h-60 rounded-full liquid-orb flex items-center justify-center text-white text-7xl active:scale-90 transition-all z-10 relative ${status === AnalysisStatus.RECORDING ? 'recording-pulse' : ''}`}
                >
                    {status === AnalysisStatus.IDLE && <i className="fas fa-microphone-alt"></i>}
                    {status === AnalysisStatus.RECORDING && <i className="fas fa-stop"></i>}
                    {status === AnalysisStatus.ANALYZING && <i className="fas fa-circle-notch fa-spin"></i>}
                    {status === AnalysisStatus.COMPLETED && <i className="fas fa-check"></i>}
                </button>
                <div className="text-center">
                    <h1 className="text-2xl font-black text-indigo-950 mb-1 tracking-tighter">IDENTIFICAR MÚSICA</h1>
                    <p className="text-[10px] font-bold text-indigo-900/30 uppercase tracking-[0.2em]">Escanea Spotify para copiar el estilo</p>
                </div>
            </div>

            {status === AnalysisStatus.COMPLETED && result && (
                <div className="glass-panel p-8 rounded-[3rem] animate-in fade-in slide-in-from-bottom-8">
                    <div className="grid grid-cols-2 gap-4 mb-6">
                        <div className="bg-white/40 p-4 rounded-3xl border border-white">
                            <span className="text-[9px] font-black text-indigo-400 uppercase">Estilo</span>
                            <p className="text-lg font-black text-indigo-950 leading-tight">{result.genre}</p>
                        </div>
                        <div className="bg-white/40 p-4 rounded-3xl border border-white">
                            <span className="text-[9px] font-black text-indigo-400 uppercase">Tempo</span>
                            <p className="text-lg font-black text-indigo-950 leading-tight">{result.bpm} BPM</p>
                        </div>
                    </div>
                    <div className="p-6 bg-indigo-600 rounded-[2rem] text-white shadow-xl">
                        <p className="text-[9px] font-black text-indigo-200 uppercase mb-2 tracking-widest">Prompt Para Suno AI</p>
                        <p className="text-xs font-medium italic mb-4 leading-relaxed opacity-90">"{result.aiPrompt}"</p>
                        <button onClick={() => copyToClipboard(result.aiPrompt, "Estilo copiado")} className="w-full py-3 bg-white/20 hover:bg-white/30 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all">Copiar Estilo</button>
                    </div>
                </div>
            )}
          </>
        ) : (
          <div className="space-y-6 pb-10">
            <div className="glass-panel p-7 rounded-[3rem] border-white space-y-6 shadow-2xl">
              <h2 className="text-sm font-black text-indigo-950 uppercase tracking-widest flex items-center gap-3">
                <i className="fas fa-feather-alt text-indigo-600 text-lg"></i> Redactor de Letras
              </h2>
              
              <div className="space-y-5">
                {/* Lyric Idea */}
                <div>
                  <label className="text-[10px] font-black text-indigo-400 uppercase tracking-widest ml-1 mb-2 block">¿De qué trata la canción?</label>
                  <textarea 
                    value={lyricIdea} onChange={(e) => setLyricIdea(e.target.value)}
                    placeholder="Escribe tu idea aquí (ej: un amor de verano en Galicia...)" 
                    className="w-full bg-white/50 border border-white rounded-[1.5rem] p-5 text-xs font-medium focus:ring-2 focus:ring-indigo-200 focus:outline-none transition-all h-32 shadow-inner"
                  />
                </div>

                {/* Blending References */}
                <div>
                  <div className="flex justify-between items-center mb-2">
                    <label className="text-[10px] font-black text-indigo-400 uppercase tracking-widest ml-1">Mezclar Estilos ({lyricRefs.length}/3)</label>
                    {lyricRefs.length < 3 && (
                      <button onClick={addRefField} className="text-[10px] font-black text-indigo-600 hover:scale-105 active:scale-95 transition-all">+ MEZCLAR OTRO</button>
                    )}
                  </div>
                  <div className="space-y-3">
                    {lyricRefs.map((ref, i) => (
                      <div key={i} className="relative">
                        <input 
                          value={ref} onChange={(e) => updateRef(i, e.target.value)}
                          placeholder={`Canción o Artista Referencia ${i+1}`}
                          className="w-full bg-white/50 border border-white rounded-2xl px-5 py-3 text-[11px] font-bold shadow-sm"
                        />
                        {i > 0 && (
                          <button onClick={() => setLyricRefs(lyricRefs.filter((_, idx) => idx !== i))} className="absolute right-4 top-1/2 -translate-y-1/2 text-indigo-200 hover:text-red-400"><i className="fas fa-times"></i></button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                {/* Indicators Grid */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-[9px] font-black text-indigo-400 uppercase tracking-widest ml-1">Voz Sugerida</label>
                    <select value={lyricVoice} onChange={(e) => setLyricVoice(e.target.value as any)} className="w-full bg-white/80 border border-white rounded-2xl p-3 text-[10px] font-black appearance-none shadow-sm cursor-pointer">
                      <option>Hombre</option>
                      <option>Mujer</option>
                      <option>Dúo</option>
                      <option>Coral</option>
                    </select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-[9px] font-black text-indigo-400 uppercase tracking-widest ml-1">Idioma</label>
                    <select value={lyricLang} onChange={(e) => setLyricLang(e.target.value)} className="w-full bg-white/80 border border-white rounded-2xl p-3 text-[10px] font-black appearance-none shadow-sm cursor-pointer">
                      <option>Español</option>
                      <option>Inglés</option>
                      <option>Portugués</option>
                      <option>Francés</option>
                      <option>Spanglish</option>
                    </select>
                  </div>
                </div>

                {/* Vibe Indicators */}
                <div className="space-y-3">
                   <label className="text-[9px] font-black text-indigo-400 uppercase tracking-widest ml-1">Mood / Energía</label>
                   <div className="flex flex-wrap gap-2">
                     {['Melódico', 'Urbano', 'Poético', 'Agresivo', 'Triste', 'Bailable'].map(v => (
                       <button key={v} onClick={() => setLyricVibe(v)} className={`px-4 py-2.5 rounded-full text-[9px] font-black transition-all ${lyricVibe === v ? 'bg-indigo-600 text-white shadow-lg' : 'bg-white/80 text-indigo-300 border border-white shadow-sm'}`}>
                         {v.toUpperCase()}
                       </button>
                     ))}
                   </div>
                </div>

                {/* Complexity Indicator */}
                <div className="space-y-3">
                   <label className="text-[9px] font-black text-indigo-400 uppercase tracking-widest ml-1">Complejidad Lírica</label>
                   <div className="flex gap-2">
                     {['Sencilla', 'Normal', 'Compleja/Metáforas'].map(c => (
                       <button key={c} onClick={() => setLyricComplexity(c)} className={`flex-1 py-2.5 rounded-xl text-[9px] font-black transition-all ${lyricComplexity === c ? 'bg-indigo-900 text-white shadow-lg' : 'bg-white/80 text-indigo-300 border border-white'}`}>
                         {c.toUpperCase()}
                       </button>
                     ))}
                   </div>
                </div>
              </div>

              <button 
                onClick={generateLyrics}
                disabled={status === AnalysisStatus.GENERATING_LYRICS}
                className="w-full py-6 bg-indigo-600 text-white rounded-[2.5rem] font-black text-xs shadow-2xl shadow-indigo-200 active:scale-95 transition-all flex items-center justify-center gap-3 uppercase tracking-widest mt-4"
              >
                {status === AnalysisStatus.GENERATING_LYRICS ? (
                  <i className="fas fa-circle-notch fa-spin"></i>
                ) : (
                  <i className="fas fa-bolt"></i>
                )}
                Redactar Letra Limpia
              </button>
            </div>

            {lyricsResult && status === AnalysisStatus.COMPLETED && (
              <div className="glass-panel p-8 rounded-[4rem] border-white animate-in slide-in-from-bottom-10 fade-in shadow-2xl">
                <div className="flex justify-between items-center mb-6">
                   <span className="text-[10px] font-black text-indigo-950 uppercase tracking-[0.3em]">Letra Pura (Sin Tags)</span>
                   <button onClick={() => setLyricsResult(null)} className="text-[10px] font-black text-indigo-200 hover:text-indigo-600">LIMPIAR</button>
                </div>
                <div className="bg-white/40 rounded-[2.5rem] p-7 border border-white max-h-[450px] overflow-y-auto mb-6 shadow-inner custom-scrollbar">
                  <p className="text-sm font-bold leading-relaxed text-indigo-950 whitespace-pre-wrap selection:bg-indigo-100">
                    {lyricsResult}
                  </p>
                </div>
                <button 
                  onClick={() => copyToClipboard(lyricsResult, "Letra limpia copiada para Suno")}
                  className="w-full py-6 bg-indigo-50 border-2 border-indigo-100 text-indigo-600 rounded-[2rem] font-black text-xs shadow-sm active:scale-95 transition-all uppercase tracking-widest flex items-center justify-center gap-3"
                >
                  <i className="fas fa-copy"></i> Copiar Letra Pura
                </button>
              </div>
            )}
          </div>
        )}

        {error && (
            <div className="glass-panel border-red-200 bg-red-50/50 p-6 rounded-[2.5rem] text-red-600 text-[11px] font-black flex items-center gap-4 animate-bounce">
                <i className="fas fa-exclamation-triangle text-xl"></i>
                <div className="flex-1">
                    <p>{error}</p>
                    <button onClick={() => setError(null)} className="underline mt-1">Cerrar</button>
                </div>
            </div>
        )}
      </main>

      <footer className="fixed bottom-8 text-center w-full max-w-lg left-1/2 -translate-x-1/2 pointer-events-none opacity-10">
        <p className="text-[7px] font-black text-indigo-950 uppercase tracking-[1em]">MusiGlass Pro Engine v3.5</p>
      </footer>
      
      <style>{`
        .custom-scrollbar::-webkit-scrollbar { width: 4px; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(99, 102, 241, 0.1); border-radius: 10px; }
      `}</style>
    </div>
  );
};

export default App;
