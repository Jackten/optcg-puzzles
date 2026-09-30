export interface Progress { solved: Record<string, { tries: number; hints: number; date: string }>; streak: number; lastDaily: string; sound: boolean; mat: number; portrait: boolean }
const initial: Progress = { solved: {}, streak: 0, lastDaily: '', sound: true, mat: 0, portrait: false };
export function loadProgress(): Progress { try { return { ...initial, ...JSON.parse(localStorage.getItem('grand-line-v1') || '{}') }; } catch { return { ...initial }; } }
export function saveProgress(progress: Progress) { try { localStorage.setItem('grand-line-v1', JSON.stringify(progress)); } catch { /* private browsing / storage full */ } }
export function localDate(date = new Date()) { return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`; }
export function dailyOffset() { const now = new Date(); return Math.floor((Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()) - Date.UTC(2026,9,1)) / 86400000); }
