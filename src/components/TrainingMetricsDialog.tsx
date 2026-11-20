import {
  Activity,
  AlertTriangle,
  Camera,
  CheckCircle2,
  CircleDot,
  Clock3,
  Cpu,
  Gauge,
  Layers3,
  Target,
  X,
} from 'lucide-react'
import { useEffect } from 'react'
import { buildModeLabel } from '../buildModes'
import type { ReconstructionMetrics, SpaceProject, TrainingMetricSample } from '../types'

interface TrainingMetricsDialogProps {
  project: SpaceProject | null
  onClose: () => void
}

const compactNumber = (value?: number | null) =>
  value == null
    ? '—'
    : Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 }).format(value)

const duration = (seconds?: number | null) => {
  if (seconds == null) return 'Calculating'
  if (seconds < 60) return seconds + 's'
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  return hours > 0 ? hours + 'h ' + minutes + 'm' : minutes + 'm'
}

const percent = (value?: number | null) =>
  value == null ? '—' : Math.round(value * 100) + '%'

const metricValue = (
  sample: TrainingMetricSample,
  field: 'psnr' | 'loss',
) => sample[field]

function MetricChart({
  history,
  field,
  label,
  suffix,
}: {
  history: TrainingMetricSample[]
  field: 'psnr' | 'loss'
  label: string
  suffix: string
}) {
  const points = history
    .map((sample) => ({ iteration: sample.iteration, value: metricValue(sample, field) }))
    .filter((point): point is { iteration: number; value: number } => typeof point.value === 'number')

  if (points.length < 2) {
    return (
      <div className="metric-chart empty">
        <div><span>{label}</span><strong>Waiting for samples</strong></div>
        <p>The chart appears once training has reported multiple checkpoints.</p>
      </div>
    )
  }

  const width = 520
  const height = 120
  const minimum = Math.min(...points.map((point) => point.value))
  const maximum = Math.max(...points.map((point) => point.value))
  const range = Math.max(maximum - minimum, Math.abs(maximum) * 0.02, 0.001)
  const maxIteration = Math.max(...points.map((point) => point.iteration), 1)
  const polyline = points
    .map((point) => {
      const x = 8 + (point.iteration / maxIteration) * (width - 16)
      const y = 8 + ((maximum - point.value) / range) * (height - 24)
      return x.toFixed(1) + ',' + y.toFixed(1)
    })
    .join(' ')
  const latest = points[points.length - 1].value

  return (
    <div className={'metric-chart ' + field}>
      <div>
        <span>{label}</span>
        <strong>{latest.toFixed(field === 'loss' ? 4 : 1)} {suffix}</strong>
      </div>
      <svg viewBox={'0 0 ' + width + ' ' + height} role="img" aria-label={label + ' over training'}>
        <line x1="8" x2={width - 8} y1={height - 16} y2={height - 16} />
        <polyline points={polyline} />
      </svg>
      <small>Iteration 0 <span>Iteration {compactNumber(maxIteration)}</span></small>
    </div>
  )
}

function MetricTile({
  icon,
  label,
  value,
  detail,
  tone,
}: {
  icon: React.ReactNode
  label: string
  value: string
  detail: string
  tone?: 'good' | 'warning' | 'poor'
}) {
  return (
    <div className={'training-metric-tile ' + (tone || '')}>
      <span className="metric-tile-icon">{icon}</span>
      <div>
        <span>{label}</span>
        <strong>{value}</strong>
        <small>{detail}</small>
      </div>
    </div>
  )
}

const qualityCopy = (metrics?: ReconstructionMetrics) => {
  if (!metrics) return { level: 'pending', title: 'Analysis has not started', copy: 'Metrics appear after camera matching.' }
  const titles = {
    pending: 'Analysing capture',
    good: 'Strong capture',
    warning: 'Usable with cautions',
    poor: 'Quality issue detected',
  }
  return {
    level: metrics.quality_level,
    title: titles[metrics.quality_level],
    copy: metrics.quality_message,
  }
}

export function TrainingMetricsDialog({ project, onClose }: TrainingMetricsDialogProps) {
  useEffect(() => {
    if (!project) return
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', closeOnEscape)
    return () => document.removeEventListener('keydown', closeOnEscape)
  }, [project, onClose])

  if (!project) return null
  const metrics = project.metrics
  const quality = qualityCopy(metrics)
  const registrationRate = metrics?.registration_rate
  const isLive = project.status === 'processing'
  const trainingStarted = (metrics?.training_iteration || 0) > 0
  const warnings = metrics?.warnings || []

  return (
    <div className="metrics-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        className="training-metrics-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="training-metrics-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="metrics-header">
          <div>
            <span className="metrics-kicker">
              <Activity size={13} />
              {isLive ? 'LIVE RECONSTRUCTION' : 'BUILD REPORT'}
            </span>
            <h2 id="training-metrics-title">{project.name}</h2>
            <p>
              {project.stage}
              {project.buildMode ? ` · ${buildModeLabel(project.buildMode)} build` : ''}
            </p>
          </div>
          <div className="metrics-header-actions">
            {isLive && <span className="live-pill"><i /> Updating every 3 seconds</span>}
            <button className="metrics-close" onClick={onClose} aria-label="Close training metrics">
              <X size={19} />
            </button>
          </div>
        </header>

        <div className="metrics-scroll">
          <section className="metrics-progress-hero">
            <div className="metrics-progress-copy">
              <span>Overall build progress</span>
              <strong>{Math.round(project.progress)}%</strong>
            </div>
            <div className="metrics-progress-track">
              <i style={{ width: project.progress + '%' }} />
            </div>
            <div className="metrics-progress-meta">
              <span><Clock3 size={13} /> {duration(metrics?.elapsed_seconds)} elapsed</span>
              <span>
                {project.status === 'ready'
                  ? 'Build complete'
                  : metrics?.estimated_remaining_seconds != null
                    ? 'About ' + duration(metrics.estimated_remaining_seconds) + ' remaining'
                    : 'Estimating remaining time'}
              </span>
            </div>
          </section>

          <section className={'quality-verdict ' + quality.level}>
            <span>
              {quality.level === 'good'
                ? <CheckCircle2 size={21} />
                : quality.level === 'pending'
                  ? <Activity size={21} />
                  : <AlertTriangle size={21} />}
            </span>
            <div>
              <strong>{quality.title}</strong>
              <p>{quality.copy}</p>
            </div>
            {registrationRate != null && (
              <div className="quality-rate">
                <strong>{percent(registrationRate)}</strong>
                <span>frames aligned</span>
              </div>
            )}
          </section>

          <div className="metrics-section-heading">
            <div><span>01</span><div><strong>Camera reconstruction</strong><p>Measured before Gaussian training begins.</p></div></div>
          </div>

          <section className="training-metric-grid">
            <MetricTile
              icon={<Camera size={18} />}
              label="Frame alignment"
              value={
                metrics?.registered_frames != null && metrics.input_frames != null
                  ? metrics.registered_frames + ' / ' + metrics.input_frames
                  : 'Analysing'
              }
              detail="Registered camera positions"
              tone={
                registrationRate == null
                  ? undefined
                  : registrationRate >= 0.85
                    ? 'good'
                    : registrationRate >= 0.6
                      ? 'warning'
                      : 'poor'
              }
            />
            <MetricTile
              icon={<Target size={18} />}
              label="Reprojection error"
              value={metrics?.reprojection_error_px != null ? metrics.reprojection_error_px.toFixed(2) + ' px' : '—'}
              detail="Lower is better; under 1.5 px is strong"
              tone={
                metrics?.reprojection_error_px == null
                  ? undefined
                  : metrics.reprojection_error_px <= 1.5
                    ? 'good'
                    : metrics.reprojection_error_px <= 2.5
                      ? 'warning'
                      : 'poor'
              }
            />
            <MetricTile
              icon={<CircleDot size={18} />}
              label="Sparse seed points"
              value={compactNumber(metrics?.sparse_points)}
              detail="Geometry found by COLMAP"
            />
            <MetricTile
              icon={<Layers3 size={18} />}
              label="COLMAP models"
              value={metrics?.colmap_models?.length ? String(metrics.colmap_models.length) : '—'}
              detail={metrics?.selected_model != null ? 'Model ' + metrics.selected_model + ' selected' : 'Selecting strongest model'}
            />
          </section>

          {metrics?.available_registered_frames != null &&
            metrics.registered_frames != null &&
            metrics.available_registered_frames > metrics.registered_frames && (
              <div className="model-mismatch-alert">
                <AlertTriangle size={18} />
                <div>
                  <strong>A stronger camera model was available</strong>
                  <p>
                    This build used {metrics.registered_frames} frames, while another COLMAP model aligned{' '}
                    {metrics.available_registered_frames}. New builds now select the larger model automatically.
                  </p>
                </div>
              </div>
            )}

          <div className="metrics-section-heading">
            <div><span>02</span><div><strong>Gaussian training</strong><p>Live optimizer health and scene density.</p></div></div>
          </div>

          <section className="training-metric-grid">
            <MetricTile
              icon={<Gauge size={18} />}
              label="Training iteration"
              value={
                metrics
                  ? compactNumber(metrics.training_iteration) + ' / ' + compactNumber(metrics.training_iterations)
                  : 'Waiting'
              }
              detail={trainingStarted ? Math.round(metrics?.training_progress || 0) + '% of optimization' : 'Starts after camera analysis'}
            />
            <MetricTile
              icon={<Activity size={18} />}
              label="Training PSNR"
              value={metrics?.psnr != null ? metrics.psnr.toFixed(1) + ' dB' : '—'}
              detail="Higher generally means a closer image match"
            />
            <MetricTile
              icon={<Layers3 size={18} />}
              label="Gaussian count"
              value={compactNumber(metrics?.gaussian_count)}
              detail="Current scene representation"
            />
            <MetricTile
              icon={<Cpu size={18} />}
              label="Peak GPU memory"
              value={metrics?.gpu_memory_mb != null ? (metrics.gpu_memory_mb / 1024).toFixed(1) + ' GB' : '—'}
              detail="RTX memory used by training"
            />
          </section>

          <section className="training-charts">
            <MetricChart history={metrics?.history || []} field="psnr" label="Image match · PSNR" suffix="dB" />
            <MetricChart history={metrics?.history || []} field="loss" label="Training loss" suffix="" />
          </section>

          {warnings.length > 0 && (
            <section className="metrics-warnings">
              <div><AlertTriangle size={17} /><strong>Things to review</strong></div>
              <ul>
                {warnings.map((warning) => <li key={warning}>{warning}</li>)}
              </ul>
            </section>
          )}

          <footer className="metrics-explainer">
            <CheckCircle2 size={16} />
            <p>
              Frame alignment and reprojection error measure capture quality. Loss and PSNR describe optimization,
              but visual inspection near the recorded camera path remains the final quality check.
            </p>
          </footer>
        </div>
      </section>
    </div>
  )
}
