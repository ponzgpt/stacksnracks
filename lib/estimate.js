// Bandwidth-bound decode estimate: every generated token streams the whole (dense) model through memory once.
// tok/s ≈ memory bandwidth × efficiency ÷ model bytes. Multi-GPU layer split adds capacity, not decode bandwidth.

export const EFFICIENCY = 0.6; // ponytail: one fudge factor for all backends; replace with measured runs in v1.
export const HEADROOM_GB = 3; // KV cache (~8k context, GQA) + compute buffers on top of the weights

export const MODELS = [
  { id: '8b', name: 'Llama 3.1 8B', quant: 'Q4_K_M', gb: 4.9 },
  { id: '32b', name: 'Qwen 2.5 32B', quant: 'Q4_K_M', gb: 19.9 },
  { id: '70b', name: 'Llama 3.3 70B', quant: 'Q4_K_M', gb: 42.5 },
];

export function fits(rig, model) {
  return model.gb + HEADROOM_GB <= rig.memGb;
}

// Returns estimated decode tok/s, or null when the model does not fit in GPU/unified memory.
export function estimateTps(rig, model) {
  if (!fits(rig, model)) return null;
  return Math.round((rig.bwGbs * EFFICIENCY) / model.gb);
}

// tok/s per $1,000 of core hardware, at the midpoint of the price range.
export function tpsPerK(rig, model) {
  const tps = estimateTps(rig, model);
  if (tps == null) return null;
  const mid = (rig.price.low + rig.price.high) / 2;
  return Math.round((tps / mid) * 1000 * 10) / 10;
}

// Biggest reference model that fits.
export function largestFit(rig) {
  return [...MODELS].reverse().find(m => fits(rig, m)) || null;
}
