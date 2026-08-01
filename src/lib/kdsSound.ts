// Alerte sonore KDS — générée via Web Audio API, pas de fichier audio à
// embarquer : trois "sons" simples différenciés par fréquence/enveloppe.
// Choix et volume pilotés par resto_settings (migration 044), jamais codés
// en dur dans l'appelant.
let ctx: AudioContext | null = null;

function getContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
  if (!AudioCtx) return null;
  if (!ctx) ctx = new AudioCtx();
  return ctx;
}

const PATTERNS: Record<string, { freq: number; type: OscillatorType; notes: number }> = {
  chime: { freq: 880, type: "sine", notes: 2 },
  bell: { freq: 1320, type: "triangle", notes: 1 },
  soft: { freq: 523, type: "sine", notes: 1 },
};

export function playKdsSound(choice: "chime" | "bell" | "soft", volume: number) {
  const audioCtx = getContext();
  if (!audioCtx) return;
  if (audioCtx.state === "suspended") audioCtx.resume().catch(() => {});
  const pattern = PATTERNS[choice] ?? PATTERNS.chime;
  const now = audioCtx.currentTime;
  const vol = Math.max(0, Math.min(1, volume));
  for (let i = 0; i < pattern.notes; i++) {
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = pattern.type;
    osc.frequency.value = pattern.freq * (i === 0 ? 1 : 1.25);
    const start = now + i * 0.18;
    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(vol, start + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, start + 0.35);
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start(start);
    osc.stop(start + 0.4);
  }
}
