import type { BuildMode, BuildTuning, ReconstructionMetrics } from '../types'
import { apiJson, isDemoMode } from './api'

export type RemoteJobStatus = 'uploading' | 'queued' | 'processing' | 'completed' | 'failed'

export interface RemoteReconstructionJob {
  id: string
  name?: string
  location?: string
  status: RemoteJobStatus
  progress: number
  stage?: string
  model_url?: string
  model_filename?: string
  splat_count?: number
  build_mode?: BuildMode
  error?: string
  metrics?: ReconstructionMetrics
  created_at?: string
  updated_at?: string
  target_frames?: number
  train_steps?: number
  downscale_factor?: 1 | 2 | 4 | 8
  custom_tuning?: boolean
}

interface WorkerHealth {
  build_modes?: Partial<Record<BuildMode, unknown>>
  advanced_tuning?: { max_target_frames?: number }
  worker?: {
    build_modes?: Partial<Record<BuildMode, unknown>>
    advanced_tuning?: { max_target_frames?: number }
  }
}

async function responseJson<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const detail = await response.text().catch(() => '')
    let message = detail
    try {
      const parsed = JSON.parse(detail) as { error?: string }
      message = parsed.error || detail
    } catch { /* The worker can return plain text errors. */ }
    throw new Error(message || `Reconstruction service returned ${response.status}.`)
  }
  return response.json() as Promise<T>
}

async function workerHealth() {
  if (isDemoMode) return null
  return apiJson<WorkerHealth>('/api/health')
}

export const reconstructionApi = {
  isConfigured: !isDemoMode,

  async supportedBuildModes() {
    const health = await workerHealth()
    const modes = health?.worker?.build_modes || health?.build_modes
    return modes ? Object.keys(modes) as BuildMode[] : []
  },

  async capabilities() {
    const health = await workerHealth()
    const source = health?.worker || health
    return {
      buildModes: source?.build_modes ? Object.keys(source.build_modes) as BuildMode[] : [],
      advancedTuning: Boolean(source?.advanced_tuning),
      maxTargetFrames: source?.advanced_tuning?.max_target_frames || 1200,
    }
  },

  async create(file: File, metadata: { name: string; location: string; buildMode: BuildMode; tuning?: BuildTuning }) {
    if (isDemoMode) throw new Error('No reconstruction API is configured.')
    const health = await workerHealth()
    const modes = health?.worker?.build_modes || health?.build_modes
    if (!modes?.[metadata.buildMode]) {
      throw new Error('This quality level is currently unavailable.')
    }
    const payload = new FormData()
    payload.append('video', file)
    payload.append('name', metadata.name)
    payload.append('location', metadata.location)
    payload.append('build_mode', metadata.buildMode)
    if (metadata.tuning) {
      payload.append('target_frames', String(metadata.tuning.targetFrames))
      payload.append('train_steps', String(metadata.tuning.trainSteps))
      payload.append('downscale_factor', String(metadata.tuning.downscaleFactor))
    }
    const response = await fetch('/api/scans', {
      method: 'POST',
      body: payload,
      credentials: 'include',
    })
    return responseJson<RemoteReconstructionJob>(response)
  },

  async get(jobId: string) {
    if (isDemoMode) throw new Error('No reconstruction API is configured.')
    const response = await fetch(`/api/scans/${encodeURIComponent(jobId)}`, { credentials: 'include' })
    return responseJson<RemoteReconstructionJob>(response)
  },

  async list() {
    if (isDemoMode) return []
    const result = await apiJson<{ scans: RemoteReconstructionJob[] }>('/api/scans')
    return result.scans
  },

  async delete(jobId: string) {
    if (isDemoMode) return
    await apiJson<void>(`/api/scans/${encodeURIComponent(jobId)}`, { method: 'DELETE' })
  },

  resolveModelUrl(path: string) {
    if (/^(blob:|https?:)/.test(path)) return path
    return `${path.startsWith('/') ? '' : '/'}${path}`
  },
}
