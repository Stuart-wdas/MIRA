export type ProjectStatus = 'ready' | 'processing' | 'draft' | 'failed'

export type ProcessingStage =
  | 'Uploading walkthrough'
  | 'Finding camera positions'
  | 'Camera analysis complete'
  | 'Training Gaussian scene'
  | 'Optimizing for the web'
  | 'Build interrupted'
  | 'Build failed'
  | 'Ready to explore'

export type ProjectPalette = 'clay' | 'sage' | 'sky' | 'sand'

export type BuildMode = 'quick' | 'preview' | 'balanced' | 'high' | 'maximum'

export interface BuildTuning {
  targetFrames: number
  trainSteps: number
  downscaleFactor: 1 | 2 | 4 | 8
}

export interface TrainingMetricSample {
  iteration: number
  elapsed_seconds: number
  loss?: number | null
  psnr?: number | null
  gaussian_count?: number | null
  gpu_memory_mb?: number | null
}

export interface ColmapModelMetric {
  id: string
  registered_frames: number
  sparse_points: number
  reprojection_error_px: number
}

export interface ReconstructionMetrics {
  input_frames?: number | null
  registered_frames?: number | null
  registration_rate?: number | null
  available_registered_frames?: number | null
  selected_model?: string | null
  sparse_points?: number | null
  reprojection_error_px?: number | null
  colmap_models?: ColmapModelMetric[]
  training_iteration: number
  training_iterations: number
  training_progress: number
  train_loss?: number | null
  psnr?: number | null
  gaussian_count?: number | null
  gpu_memory_mb?: number | null
  elapsed_seconds: number
  estimated_remaining_seconds?: number | null
  quality_level: 'pending' | 'good' | 'warning' | 'poor'
  quality_message: string
  warnings: string[]
  history: TrainingMetricSample[]
}

export interface SpaceProject {
  id: string
  name: string
  location: string
  status: ProjectStatus
  progress: number
  stage: ProcessingStage
  createdAt: string
  updatedAt: string
  videoFileName?: string
  videoSize?: number
  modelUrl?: string
  modelFileName?: string
  modelFormat?: string
  palette: ProjectPalette
  isDemo?: boolean
  rooms: number
  splatCount?: string
  processingMinutes?: number
  processingMode?: 'demo' | 'remote'
  buildMode?: BuildMode
  tuning?: BuildTuning
  remoteJobId?: string
  errorMessage?: string
  metrics?: ReconstructionMetrics
}

export type AppView = 'spaces' | 'captures' | 'shared' | 'billing' | 'settings' | 'viewer'

export interface CaptureDraft {
  name: string
  location: string
  file: File
  kind: 'walkthrough' | 'model'
  buildMode: BuildMode
  tuning?: BuildTuning
}
