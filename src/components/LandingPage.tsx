import { ArrowRight, Check, ScanLine, ShieldCheck, Sparkles, UploadCloud } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Brand } from './Brand'

export function LandingPage() {
  return (
    <div className="marketing-page">
      <nav className="marketing-nav">
        <Link to="/" aria-label="Mira home"><Brand /></Link>
        <div className="marketing-nav-links">
          <a href="#how-it-works">How it works</a>
          <a href="#pricing">Pricing</a>
          <Link to="/login">Sign in</Link>
          <Link className="marketing-cta" to="/register">Create your free scan</Link>
        </div>
      </nav>

      <main>
        <section className="marketing-hero">
          <div className="marketing-hero-copy">
            <span className="marketing-eyebrow"><Sparkles size={14} /> A place you can step back into</span>
            <h1>Turn a walkthrough into a living digital space.</h1>
            <p>Upload a phone video and Mira reconstructs the room as an immersive Gaussian-splat scene you can explore from any modern browser.</p>
            <div className="marketing-actions">
              <Link className="marketing-primary" to="/register">Build your first space free <ArrowRight size={17} /></Link>
              <a className="marketing-secondary" href="#how-it-works">See how capture works</a>
            </div>
            <div className="marketing-proof"><span><Check size={14} /> No specialist camera</span><span><Check size={14} /> First scan free</span><span><Check size={14} /> Private by default</span></div>
          </div>
          <div className="marketing-scene" aria-label="Digital apartment scene preview">
            <div className="scene-room">
              <div className="scene-window"><i /><i /></div>
              <div className="scene-sofa"><i /><i /></div>
              <div className="scene-table"><i /></div>
              <div className="scene-plant"><i /><i /><i /></div>
              <span className="scene-scan-line" />
            </div>
            <div className="scene-status"><i /> 3D scene ready <span>1.8M splats</span></div>
          </div>
        </section>

        <section className="marketing-steps" id="how-it-works">
          <span className="section-label">FROM VIDEO TO SPACE</span>
          <h2>Capture naturally. We handle the hard part.</h2>
          <div className="step-grid">
            <article><span><UploadCloud size={22} /></span><b>01</b><h3>Upload a walkthrough</h3><p>Move slowly through the room with a phone. No LiDAR or special rig required.</p></article>
            <article><span><ScanLine size={22} /></span><b>02</b><h3>Mira reconstructs it</h3><p>COLMAP solves the camera path, then Gaussian splatting trains the digital scene.</p></article>
            <article><span><ShieldCheck size={22} /></span><b>03</b><h3>Explore and share</h3><p>Return to the finished space in your private library and view its quality report.</p></article>
          </div>
        </section>

        <section className="marketing-pricing" id="pricing">
          <div><span className="section-label">SIMPLE PAY-PER-SCAN</span><h2>Your first scene is on us.</h2><p>After your free reconstruction, pay only when you build. Higher qualities use more frames and training time, so their price increases with detail.</p></div>
          <div className="pricing-card"><strong>1</strong><span>free generated scan</span><p>All five quality choices are available. See the exact price before uploading every later scan.</p><Link to="/register">Start free <ArrowRight size={16} /></Link></div>
        </section>
      </main>
      <footer className="marketing-footer"><Brand /><span>Immersive spaces from everyday video.</span><p>© {new Date().getFullYear()} Mira</p></footer>
    </div>
  )
}
