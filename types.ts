
export interface AnalysisResult {
  genre: string;
  subgenre: string;
  bpm: number;
  key: string;
  mood: string;
  instruments: string[];
  aiPrompt: string;
  description: string;
}

export interface LyricForm {
  idea: string;
  references: string[];
  voice: 'Hombre' | 'Mujer' | 'Dúo' | 'Coral';
  language: string;
  vibe: string;
}

export enum AppMode {
  MUSIC = 'MUSIC',
  LYRICS = 'LYRICS'
}

export enum AnalysisStatus {
  IDLE = 'IDLE',
  RECORDING = 'RECORDING',
  ANALYZING = 'ANALYZING',
  COMPLETED = 'COMPLETED',
  ERROR = 'ERROR',
  GENERATING_LYRICS = 'GENERATING_LYRICS'
}
