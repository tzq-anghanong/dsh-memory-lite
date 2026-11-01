const DEFAULTS = {
  memoryDir: "~/.dsh/memory-lite",
  personaTokens: 200,
  memoryTokens: 500,
  coarseTopK: 15,
  expandTopK: 3,
  minCoverage: 0.6,
  compressMaxChars: 80,
};

const num = (v, d) => { const n = Number(v); return Number.isFinite(n) ? n : d; };
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const int = (v, d) => Math.floor(num(v, d));

export function normalizeConfig(raw = {}) {
  const c = { ...DEFAULTS, ...raw };
  const maxChars = clamp(int(c.compressMaxChars, 80), 20, 500);
  return {
    memoryDir: String(c.memoryDir),
    personaTokens: clamp(int(c.personaTokens, 200), 50, 1000),
    memoryTokens: clamp(int(c.memoryTokens, 500), 100, 3000),
    coarseTopK: clamp(int(c.coarseTopK, 15), 3, 100),
    expandTopK: clamp(int(c.expandTopK, 3), 1, 10),
    minCoverage: clamp(num(c.minCoverage, 0.6), 0.3, 1),
    compressMaxChars: maxChars,
  };
}