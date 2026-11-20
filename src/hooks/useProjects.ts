import { useEffect, useMemo, useRef, useState } from 'react'
import { demoProjects } from '../data'
import { reconstructionApi } from '../services/reconstruction'
import { isDemoMode } from '../services/api'
import type { RemoteReconstructionJob } from '../services/reconstruction'
import type { BuildMode, BuildTuning, CaptureDraft, ProcessingStage, SpaceProject } from '../types'

const STORAGE_KEY = 'mira-space-projects-v2'
const palettes: SpaceProject['palette'][] = ['clay', 'sage', 'sky', 'sand']

const stageForProgress = (progress: number): ProcessingStage => {
  if (progress < 18) return 'Uploading walkthrough'
  if (progress < 38) return 'Finding camera positions'
  if (progress < 42) return 'Camera analysis complete'
  if (progress < 92) return 'Training Gaussian scene'
  if (progress < 100) return 'Optimizing for the web'
  return 'Ready to explore'
}

const stageFromJob = (job: RemoteReconstructionJob, progress: number): ProcessingStage =>
  (job.stage as ProcessingStage | undefined) || stageForProgress(progress)

const compactNumber = (value: number) =>
  Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 }).format(value)

const mergeRemoteJob = (project: SpaceProject, job: RemoteReconstructionJob): SpaceProject => {
  const updatedAt = new Date().toISOString()
  const tuning = job.custom_tuning && job.target_frames && job.train_steps && job.downscale_factor
    ? { targetFrames: job.target_frames, trainSteps: job.train_steps, downscaleFactor: job.downscale_factor }
    : project.tuning
  if (job.status === 'failed') {
    return {
      ...project,
      status: 'failed',
      stage: 'Build failed',
      progress: Math.min(99, job.progress || project.progress),
      errorMessage: job.error || 'Reconstruction failed.',
      metrics: job.metrics,
      buildMode: job.build_mode || project.buildMode,
      tuning,
      updatedAt,
    }
  }

  if (job.status === 'completed') {
    const modelPath = job.model_url
      ? reconstructionApi.resolveModelUrl(job.model_url)
      : project.modelUrl
    const modelName = job.model_filename || project.modelFileName || 'scene.ply'
    return {
      ...project,
      status: 'ready',
      progress: 100,
      stage: 'Ready to explore',
      modelUrl: modelPath,
      modelFileName: modelName,
      modelFormat: modelName.split('.').pop(),
      splatCount: job.splat_count
        ? compactNumber(job.splat_count)
        : project.splatCount || 'Complete',
      processingMinutes: job.metrics?.elapsed_seconds
        ? Math.max(1, Math.round(job.metrics.elapsed_seconds / 60))
        : project.processingMinutes,
      metrics: job.metrics,
      buildMode: job.build_mode || project.buildMode,
      tuning,
      errorMessage: undefined,
      updatedAt,
    }
  }

  const progress = Math.max(8, Math.min(99, job.progress || project.progress || 8))
  return {
    ...project,
    status: 'processing',
    progress,
    stage: stageFromJob(job, progress),
    metrics: job.metrics,
    buildMode: job.build_mode || project.buildMode,
    tuning,
    errorMessage: undefined,
    updatedAt,
  }
}

const projectFromRemote = (job: RemoteReconstructionJob, index: number): SpaceProject => {
  const now = new Date().toISOString()
  return mergeRemoteJob({
    id: job.id,
    remoteJobId: job.id,
    name: job.name || 'Untitled space',
    location: job.location || 'Location not added',
    status: 'processing',
    progress: job.progress || 1,
    stage: 'Uploading walkthrough',
    createdAt: job.created_at || now,
    updatedAt: job.updated_at || now,
    palette: palettes[index % palettes.length],
    rooms: 1,
    processingMode: 'remote',
    buildMode: job.build_mode,
    tuning: job.custom_tuning && job.target_frames && job.train_steps && job.downscale_factor
      ? { targetFrames: job.target_frames, trainSteps: job.train_steps, downscaleFactor: job.downscale_factor }
      : undefined,
  }, job)
}

const loadProjects = (userId: string): SpaceProject[] => {
  try {
    const stored = localStorage.getItem(`${STORAGE_KEY}-${userId}`)
    if (!stored) return isDemoMode ? demoProjects : []
    const parsed = JSON.parse(stored) as SpaceProject[]
    const restored: SpaceProject[] = parsed.map((project) =>
      project.modelUrl?.startsWith('blob:')
        ? {
            ...project,
            modelUrl: undefined,
            status: 'draft' as const,
            stage: 'Ready to explore' as const,
          }
        : project,
    )
    return isDemoMode ? restored : restored.filter((project) => project.processingMode !== 'remote')
  } catch {
    return isDemoMode ? demoProjects : []
  }
}

export function useProjects(userId: string) {
  const [projects, setProjects] = useState<SpaceProject[]>(() => loadProjects(userId))
  const projectsRef = useRef(projects)

  useEffect(() => {
    projectsRef.current = projects
    localStorage.setItem(`${STORAGE_KEY}-${userId}`, JSON.stringify(projects.filter((project) => project.processingMode !== 'remote')))
  }, [projects, userId])

  useEffect(() => {
    if (isDemoMode) return
    let cancelled = false
    void reconstructionApi.list().then((jobs) => {
      if (cancelled) return
      setProjects((current) => [
        ...jobs.map(projectFromRemote),
        ...current.filter((project) => project.processingMode !== 'remote'),
      ])
    }).catch(() => undefined)
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    const timer = window.setInterval(() => {
      setProjects((current) =>
        current.map((project) => {
          if (project.status !== 'processing' || project.processingMode === 'remote') return project
          const increment = project.isDemo ? 0.3 : 1.1
          const progress = Math.min(100, project.progress + increment)
          return {
            ...project,
            progress,
            stage: stageForProgress(progress),
            status: progress >= 100 ? 'ready' : 'processing',
            updatedAt: new Date().toISOString(),
            splatCount: progress >= 100 ? '1.6M' : project.splatCount,
            processingMinutes: progress >= 100 ? 28 : project.processingMinutes,
          }
        }),
      )
    }, 1400)
    return () => window.clearInterval(timer)
  }, [])

  useEffect(() => {
    let cancelled = false
    let pollRunning = false

    const refreshRemoteProjects = async () => {
      if (pollRunning) return
      pollRunning = true
      const targets = projectsRef.current.filter(
        (project) =>
          project.processingMode === 'remote' &&
          project.remoteJobId &&
          project.status === 'processing',
      )
      const updates = await Promise.all(
        targets.map(async (project) => {
          try {
            const job = await reconstructionApi.get(project.remoteJobId!)
            return { projectId: project.id, job }
          } catch {
            return null
          }
        }),
      )
      if (!cancelled) {
        const available = updates.filter(
          (update): update is { projectId: string; job: RemoteReconstructionJob } => Boolean(update),
        )
        if (available.length > 0) {
          setProjects((current) =>
            current.map((project) => {
              const update = available.find((candidate) => candidate.projectId === project.id)
              return update ? mergeRemoteJob(project, update.job) : project
            }),
          )
        }
      }
      pollRunning = false
    }

    void refreshRemoteProjects()
    const timer = window.setInterval(() => void refreshRemoteProjects(), 15000)
    return () => {
      cancelled = true
      window.clearInterval(timer)
    }
  }, [])

  useEffect(
    () => () => {
      projects.forEach((project) => {
        if (project.modelUrl?.startsWith('blob:')) URL.revokeObjectURL(project.modelUrl)
      })
    },
    // Blob URLs should be revoked only when the app unmounts.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  )

  const startRemoteReconstruction = async (
    projectId: string,
    file: File,
    name: string,
    location: string,
    buildMode: BuildMode,
    tuning?: BuildTuning,
  ) => {
    try {
      const job = await reconstructionApi.create(file, { name, location, buildMode, tuning })
      setProjects((current) =>
        current.map((project) =>
          project.id === projectId
            ? mergeRemoteJob({ ...project, id: job.id, remoteJobId: job.id }, job)
            : project,
        ),
      )
    } catch (error) {
      setProjects((current) =>
        current.map((project) =>
          project.id === projectId
            ? {
                ...project,
                status: 'failed',
                stage: 'Build failed',
                errorMessage: error instanceof Error ? error.message : 'Reconstruction failed.',
                updatedAt: new Date().toISOString(),
              }
            : project,
        ),
      )
    }
  }

  const createProject = (draft: CaptureDraft) => {
    const now = new Date().toISOString()
    const isModel = draft.kind === 'model'
    const extension = draft.file.name.split('.').pop()?.toLowerCase()
    const project: SpaceProject = {
      id: crypto.randomUUID(),
      name: draft.name.trim() || 'Untitled space',
      location: draft.location.trim() || 'Location not added',
      status: isModel ? 'ready' : 'processing',
      progress: isModel ? 100 : 8,
      stage: isModel ? 'Ready to explore' : 'Uploading walkthrough',
      createdAt: now,
      updatedAt: now,
      videoFileName: isModel ? undefined : draft.file.name,
      videoSize: isModel ? undefined : draft.file.size,
      modelUrl: isModel ? URL.createObjectURL(draft.file) : undefined,
      modelFileName: isModel ? draft.file.name : undefined,
      modelFormat: isModel ? extension : undefined,
      palette: palettes[projects.length % palettes.length],
      rooms: 1,
      splatCount: isModel ? 'Imported' : undefined,
      processingMode: isModel ? undefined : reconstructionApi.isConfigured ? 'remote' : 'demo',
      buildMode: isModel ? undefined : draft.buildMode,
      tuning: isModel ? undefined : draft.tuning,
    }
    setProjects((current) => [project, ...current])
    if (!isModel && reconstructionApi.isConfigured) {
      void startRemoteReconstruction(project.id, draft.file, project.name, project.location, draft.buildMode, draft.tuning)
    }
    return project
  }

  const deleteProject = (id: string) => {
    const remote = projectsRef.current.find((project) => project.id === id)?.processingMode === 'remote'
    setProjects((current) => {
      const target = current.find((project) => project.id === id)
      if (target?.modelUrl?.startsWith('blob:')) URL.revokeObjectURL(target.modelUrl)
      return current.filter((project) => project.id !== id)
    })
    if (!isDemoMode && remote) void reconstructionApi.delete(id).catch(() => undefined)
  }

  const renameProject = (id: string, name: string) => {
    setProjects((current) =>
      current.map((project) =>
        project.id === id
          ? { ...project, name, updatedAt: new Date().toISOString() }
          : project,
      ),
    )
  }

  const readyCount = useMemo(
    () => projects.filter((project) => project.status === 'ready').length,
    [projects],
  )

  return { projects, readyCount, createProject, deleteProject, renameProject }
}
