export type Sound = 'slap' | 'flip' | 'slide' | 'don' | 'hit' | 'win';
let context: AudioContext | null = null;
export function unlockAudio() {
  try { context ??= new AudioContext(); if (context.state === 'suspended') void context.resume(); } catch { /* audio unavailable */ }
}
export function sound(kind: Sound, enabled: boolean) {
  if (!enabled || !context) return;
  try {
    const ctx = context;
    const notes = kind === 'win' ? [523, 659, 784, 1046] : [kind === 'don' ? 1120 : kind === 'flip' ? 440 : kind === 'hit' ? 70 : kind === 'slap' ? 120 : 220];
    notes.forEach((hz, index) => {
      const t = ctx.currentTime + index * .1;
      const gain = ctx.createGain(); gain.connect(ctx.destination);
      gain.gain.setValueAtTime(.0001, t); gain.gain.exponentialRampToValueAtTime(kind === 'win' ? .07 : .12, t + .008); gain.gain.exponentialRampToValueAtTime(.0001, t + .18);
      const osc = ctx.createOscillator(); osc.type = kind === 'don' || kind === 'win' ? 'sine' : 'triangle'; osc.frequency.setValueAtTime(hz, t); osc.frequency.exponentialRampToValueAtTime(Math.max(30, hz * .4), t + .17); osc.connect(gain); osc.start(t); osc.stop(t + .2);
      if (kind === 'slap' || kind === 'slide' || kind === 'hit') {
        const buffer = ctx.createBuffer(1, ctx.sampleRate * .09, ctx.sampleRate); const data = buffer.getChannelData(0);
        for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * .3;
        const noise = ctx.createBufferSource(); noise.buffer = buffer; noise.connect(gain); noise.start(t);
      }
    });
  } catch { /* do not interrupt play for audio */ }
}
