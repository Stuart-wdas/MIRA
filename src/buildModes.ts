import type { BuildMode } from './types'

export interface BuildModeOption {
  id: BuildMode
  name: string
  description: string
  detail: string
  recommended?: boolean
  tuning: import('./types').BuildTuning
}

export const buildModeOptions: BuildModeOption[] = [
  {
    id: 'quick',
    name: 'Quick',
    description: 'Fastest geometry and camera check.',
    detail: '120 frames · 2.5K steps · 4× downscale',
    tuning: { targetFrames: 120, trainSteps: 2500, downscaleFactor: 4 },
  },
  {
    id: 'preview',
    name: 'Preview',
    description: 'A fast draft with enough detail to explore.',
    detail: '180 frames · 4K steps · 4× downscale',
    tuning: { targetFrames: 180, trainSteps: 4000, downscaleFactor: 4 },
  },
  {
    id: 'balanced',
    name: 'Balanced',
    description: 'A strong balance of processing time and clarity.',
    detail: '240 frames · 6.5K steps · 2× downscale',
    recommended: true,
    tuning: { targetFrames: 240, trainSteps: 6500, downscaleFactor: 2 },
  },
  {
    id: 'high',
    name: 'High',
    description: 'More refinement for a finished scene.',
    detail: '300 frames · 10K steps · 2× downscale',
    tuning: { targetFrames: 300, trainSteps: 10000, downscaleFactor: 2 },
  },
  {
    id: 'maximum',
    name: 'Maximum',
    description: 'Full source detail with the longest processing time.',
    detail: '400 frames · 15K steps · full resolution',
    tuning: { targetFrames: 400, trainSteps: 15000, downscaleFactor: 1 },
  },
]

export const buildModeLabel = (mode?: BuildMode) =>
  buildModeOptions.find((option) => option.id === mode)?.name || 'High'
