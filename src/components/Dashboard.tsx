import { ArrowDownAZ, ChevronDown, Plus, Search, Sparkles, X } from 'lucide-react'
import { useMemo, useState } from 'react'
import type { SpaceProject } from '../types'
import { ProjectCard } from './ProjectCard'
import { SpaceArtwork } from './SpaceArtwork'

interface DashboardProps {
  projects: SpaceProject[]
  userName: string
  onNewCapture: () => void
  onOpenProject: (project: SpaceProject) => void
  onDeleteProject: (id: string) => void
  onViewMetrics: (project: SpaceProject) => void
}

export function Dashboard({
  projects,
  userName,
  onNewCapture,
  onOpenProject,
  onDeleteProject,
  onViewMetrics,
}: DashboardProps) {
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState<'recent' | 'name'>('recent')

  const visibleProjects = useMemo(() => {
    const filtered = projects.filter((project) =>
      `${project.name} ${project.location}`.toLowerCase().includes(query.toLowerCase()),
    )
    return [...filtered].sort((a, b) =>
      sort === 'recent'
        ? new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
        : a.name.localeCompare(b.name),
    )
  }, [projects, query, sort])

  const processingCount = projects.filter((project) => project.status === 'processing').length

  return (
    <main className="main-content">
      <header className="page-header">
        <div>
          <span className="page-kicker">YOUR DIGITAL SPACES</span>
          <h1>Good morning, {userName.split(' ')[0] || 'there'}.</h1>
          <p>Preserve a place. Step back inside whenever you like.</p>
        </div>
        <button className="primary-button desktop-new-button" onClick={onNewCapture}>
          <Plus size={18} /> New capture
        </button>
      </header>

      <section className="welcome-card">
        <div className="welcome-copy">
          <span className="welcome-chip"><Sparkles size={14} /> A new way to remember a place</span>
          <h2>Turn a simple walkthrough into a space you can revisit.</h2>
          <p>
            Record on any phone. Mira rebuilds your rooms as a lifelike 3D scene,
            ready to explore from anywhere.
          </p>
          <div className="welcome-actions">
            <button className="dark-button" onClick={onNewCapture}>
              Capture your first space <span>→</span>
            </button>
            <button className="text-button" onClick={() => document.getElementById('spaces-grid')?.scrollIntoView({ behavior: 'smooth' })}>
              View an example
            </button>
          </div>
        </div>
        <div className="welcome-visual">
          <div className="visual-label"><i /> LIVE 3D SCENE</div>
          <SpaceArtwork palette="clay" variant="hero" />
          <div className="orbit-hint"><span>↔</span> Drag to look around</div>
        </div>
      </section>

      <section className="library-section" id="spaces-grid">
        <div className="section-heading-row">
          <div>
            <h2>Your spaces</h2>
            <p>
              {projects.length} {projects.length === 1 ? 'space' : 'spaces'}
              {processingCount > 0 && ` · ${processingCount} processing`}
            </p>
          </div>
          <div className="library-controls">
            <label className="search-control">
              <Search size={17} />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search spaces"
                aria-label="Search spaces"
              />
              {query && <button onClick={() => setQuery('')} aria-label="Clear search"><X size={15} /></button>}
            </label>
            <label className="sort-control">
              <ArrowDownAZ size={16} />
              <select value={sort} onChange={(event) => setSort(event.target.value as 'recent' | 'name')}>
                <option value="recent">Last updated</option>
                <option value="name">Name</option>
              </select>
              <ChevronDown size={14} />
            </label>
          </div>
        </div>

        {visibleProjects.length > 0 ? (
          <div className="project-grid">
            {visibleProjects.map((project) => (
              <ProjectCard
                key={project.id}
                project={project}
                onOpen={onOpenProject}
                onDelete={onDeleteProject}
                onViewMetrics={onViewMetrics}
              />
            ))}
            <button className="add-space-card" onClick={onNewCapture}>
              <span><Plus size={25} /></span>
              <strong>Add another space</strong>
              <p>Upload a phone walkthrough or a finished splat.</p>
            </button>
          </div>
        ) : projects.length === 0 ? (
          <div className="first-space-empty">
            <span><Sparkles size={24} /></span>
            <h3>Your first space starts with a walkthrough</h3>
            <p>Your account includes one free generated scan. Upload a steady phone video when you are ready.</p>
            <button className="dark-button" onClick={onNewCapture}><Plus size={16} /> Create your first scan</button>
          </div>
        ) : (
          <div className="empty-search">
            <Search size={27} />
            <h3>No spaces found</h3>
            <p>Try a different name or location.</p>
            <button className="text-button" onClick={() => setQuery('')}>Clear search</button>
          </div>
        )}
      </section>
    </main>
  )
}
