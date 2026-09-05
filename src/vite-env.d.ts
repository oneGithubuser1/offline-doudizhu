/// <reference types="vite/client" />

interface RiverLabBridge {
  loadSave: () => Promise<unknown>;
  saveGame: (data: unknown) => Promise<{ ok: boolean; error?: string }>;
}

interface Window {
  riverLab: RiverLabBridge;
}
