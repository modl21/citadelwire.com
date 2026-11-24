/**
 * Lightweight pub/sub coordinating all mounted AudioPlayer instances:
 * - Starting one player automatically pauses any other playing show.
 * - Exposes the active player's state and controls to the floating StickyAudioBar.
 */

export interface ActiveAudioSnapshot {
  id: string;
  label: string;
  title: string;
  accentColor: 'purple' | 'orange' | 'emerald' | 'sky' | 'rose' | 'zinc' | 'lime' | 'amber';
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  speed: number;
  togglePlay: () => void;
  seekBy: (deltaSeconds: number) => void;
  seekTo: (seconds: number) => void;
  cycleSpeed: () => void;
  dismiss: () => void;
}

type PauseHandler = () => void;
type SnapshotListener = () => void;

const pauseHandlers = new Map<string, PauseHandler>();
const listeners = new Set<SnapshotListener>();
let activeSnapshot: ActiveAudioSnapshot | null = null;

function notify() {
  listeners.forEach((listener) => listener());
}

export function registerAudioPlayer(id: string, onPauseRequest: PauseHandler): () => void {
  pauseHandlers.set(id, onPauseRequest);
  return () => {
    pauseHandlers.delete(id);
    if (activeSnapshot?.id === id) {
      activeSnapshot = null;
      notify();
    }
  };
}

export function pauseOtherAudioPlayers(exceptId: string): void {
  for (const [id, pause] of pauseHandlers.entries()) {
    if (id !== exceptId) pause();
  }
}

export function publishActiveAudio(snapshot: ActiveAudioSnapshot): void {
  activeSnapshot = snapshot;
  notify();
}

export function clearActiveAudio(id: string): void {
  if (activeSnapshot?.id === id) {
    activeSnapshot = null;
    notify();
  }
}

export function subscribeActiveAudio(listener: SnapshotListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getActiveAudioSnapshot(): ActiveAudioSnapshot | null {
  return activeSnapshot;
}
