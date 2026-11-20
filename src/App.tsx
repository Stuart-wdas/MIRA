import { lazy, Suspense, useEffect, useState } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { authClient } from './auth-client'
import { buildModeLabel } from './buildModes'
import { AuthPage } from './components/AuthPages'
import { AdminDashboard } from './components/AdminDashboard'
import { BillingPage } from './components/BillingPage'
import { CaptureGuide } from './components/CaptureGuide'
import { Dashboard } from './components/Dashboard'
import { LandingPage } from './components/LandingPage'
import { SettingsPage, SharedPage } from './components/SecondaryPages'
import { Sidebar } from './components/Sidebar'
import { TrainingMetricsDialog } from './components/TrainingMetricsDialog'
import { UploadDialog } from './components/UploadDialog'
import { useProjects } from './hooks/useProjects'
import { adminApi, type AdminIdentity } from './services/admin'
import type { AppView, CaptureDraft, SpaceProject } from './types'

const ViewerPage = lazy(() =>
  import('./components/ViewerPage').then((module) => ({ default: module.ViewerPage })),
)

function WorkspaceApp() {
  const session = authClient.useSession()
  const { projects, createProject, deleteProject } = useProjects(session.data!.user.id)
  const [view, setView] = useState<AppView>('spaces')
  const [uploadOpen, setUploadOpen] = useState(false)
  const [activeProject, setActiveProject] = useState<SpaceProject | null>(null)
  const [metricsProjectId, setMetricsProjectId] = useState<string | null>(null)
  const [billingRevision] = useState(0)
  const [toast, setToast] = useState('')

  const processingCount = projects.filter((project) => project.status === 'processing').length
  const metricsProject = projects.find((project) => project.id === metricsProjectId) || null
  const user = session.data!.user

  const notify = (message: string) => {
    setToast(message)
    window.setTimeout(() => setToast(''), 2800)
  }

  useEffect(() => {
    const parameters = new URLSearchParams(window.location.search)
    if (parameters.get('view') === 'billing') setView('billing')
  }, [])

  const handleCreate = (draft: CaptureDraft) => {
    const project = createProject(draft)
    setView('spaces')
    if (draft.kind === 'model') {
      setActiveProject(project)
      setView('viewer')
    } else {
      notify(`${buildModeLabel(draft.buildMode)} upload started. Your order will enter the processing queue once uploaded.`)
    }
  }

  const openProject = (project: SpaceProject) => {
    if (project.status === 'processing') return
    if (project.status === 'failed') {
      setUploadOpen(true)
      notify(project.errorMessage || 'That build failed. Try a different walkthrough.')
      return
    }
    if (project.status === 'draft') {
      setUploadOpen(true)
      notify('Re-import the local splat file to open this space.')
      return
    }
    setActiveProject(project)
    setView('viewer')
  }

  const navigate = (next: AppView) => {
    setView(next)
    if (next !== 'viewer') setActiveProject(null)
  }

  if (view === 'viewer' && activeProject) {
    return (
      <>
        <Suspense fallback={<div className="viewer-route-loading">Opening space…</div>}>
          <ViewerPage project={activeProject} onBack={() => navigate('spaces')} />
        </Suspense>
        {toast && <div className="app-toast">{toast}</div>}
      </>
    )
  }

  return (
    <div className="app-shell">
      <Sidebar
        activeView={view}
        processingCount={processingCount}
        userName={user.name}
        userEmail={user.email}
        onNavigate={navigate}
        onNewCapture={() => setUploadOpen(true)}
        onSignOut={() => void authClient.signOut({ fetchOptions: { onSuccess: () => window.location.assign('/') } })}
      />
      <div className="page-shell">
        {view === 'spaces' && (
          <Dashboard
            projects={projects}
            userName={user.name}
            onNewCapture={() => setUploadOpen(true)}
            onOpenProject={openProject}
            onDeleteProject={(id) => { deleteProject(id); notify('Space removed.') }}
            onViewMetrics={(project) => setMetricsProjectId(project.id)}
          />
        )}
        {view === 'captures' && <CaptureGuide onStart={() => setUploadOpen(true)} />}
        {view === 'shared' && <SharedPage onCreate={() => setUploadOpen(true)} />}
        {view === 'billing' && <BillingPage refreshKey={billingRevision} />}
        {view === 'settings' && <SettingsPage />}
      </div>
      <UploadDialog open={uploadOpen} onClose={() => setUploadOpen(false)} onCreate={handleCreate} />
      <TrainingMetricsDialog project={metricsProject} onClose={() => setMetricsProjectId(null)} />
      {toast && <div className="app-toast">{toast}</div>}
    </div>
  )
}

function ProtectedWorkspace() {
  const session = authClient.useSession()
  if (session.isPending) return <div className="route-loading"><BrandLoader /></div>
  if (!session.data) return <Navigate to="/login" replace />
  return <WorkspaceApp />
}

function ProtectedAdmin() {
  const session = authClient.useSession()
  const [identity, setIdentity] = useState<AdminIdentity | null>(null)
  const [checked, setChecked] = useState(false)

  useEffect(() => {
    if (session.isPending || !session.data) return
    let cancelled = false
    void adminApi.me()
      .then((result) => { if (!cancelled) setIdentity(result) })
      .catch(() => { if (!cancelled) setIdentity(null) })
      .finally(() => { if (!cancelled) setChecked(true) })
    return () => { cancelled = true }
  }, [session.data, session.isPending])

  if (session.isPending) return <div className="route-loading"><BrandLoader /></div>
  if (!session.data) return <Navigate to="/login?returnTo=/admin" replace />
  if (!checked) return <div className="route-loading"><BrandLoader /></div>
  if (!identity) return <div className="admin-access-denied"><ShieldLock /><h1>Administrator access required</h1><p>This signed-in account does not have permission to open the Mira administration area.</p><a href="/app">Return to your workspace</a></div>
  return <AdminDashboard identity={identity} />
}

function ShieldLock() {
  return <span className="admin-denied-mark"><i /><i /><i /></span>
}

function BrandLoader() {
  return <><span className="loader-orbit"><i /><i /></span><p>Opening your workspace…</p></>
}

function App() {
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/login" element={<AuthPage mode="login" />} />
      <Route path="/register" element={<AuthPage mode="register" />} />
      <Route path="/forgot-password" element={<AuthPage mode="forgot" />} />
      <Route path="/reset-password" element={<AuthPage mode="reset" />} />
      <Route path="/app/*" element={<ProtectedWorkspace />} />
      <Route path="/admin/*" element={<ProtectedAdmin />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default App
