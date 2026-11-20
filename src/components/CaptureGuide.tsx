import { ArrowRight, Check, Lightbulb, Move3D, Smartphone, Sun, Video } from 'lucide-react'

interface CaptureGuideProps {
  onStart: () => void
}

const steps = [
  {
    number: '01',
    icon: Sun,
    title: 'Prepare the room',
    copy: 'Open curtains, switch on the lights, and remove anything that moves in the breeze.',
  },
  {
    number: '02',
    icon: Video,
    title: 'Start at the doorway',
    copy: 'Hold your phone horizontally at chest height. Use the standard 1× camera—no cinematic mode.',
  },
  {
    number: '03',
    icon: Move3D,
    title: 'Make two slow loops',
    copy: 'Walk the edge of each room, then make a smaller inner loop while keeping surfaces in view.',
  },
  {
    number: '04',
    icon: Check,
    title: 'Connect every room',
    copy: 'Keep recording as you cross doorways so Mira can understand how the spaces join together.',
  },
]

export function CaptureGuide({ onStart }: CaptureGuideProps) {
  return (
    <main className="main-content guide-page">
      <header className="page-header guide-header">
        <div>
          <span className="page-kicker">CAPTURE GUIDE</span>
          <h1>A better walkthrough makes a better space.</h1>
          <p>Five quiet minutes with your phone is usually all you need.</p>
        </div>
        <button className="primary-button" onClick={onStart}>Upload a capture <ArrowRight size={17} /></button>
      </header>

      <section className="guide-hero">
        <div className="phone-demo">
          <div className="phone-shell">
            <div className="phone-speaker" />
            <div className="phone-screen">
              <div className="capture-room-lines"><i /><i /><i /><i /></div>
              <div className="camera-grid"><i /><i /><i /><i /></div>
              <div className="record-status"><i /> 02:14</div>
              <div className="capture-direction">Move slowly around the room <span>→</span></div>
              <div className="record-button"><i /></div>
            </div>
          </div>
          <span className="phone-note note-one">Keep the phone level<i /></span>
          <span className="phone-note note-two">Overlap each pass<i /></span>
        </div>
        <div className="guide-intro-copy">
          <span><Smartphone size={18} /> ANY MODERN PHONE</span>
          <h2>Think “slow tour,” not “property video.”</h2>
          <p>
            Gaussian splatting learns a place by seeing the same details from many angles.
            Smooth, overlapping motion gives it the visual clues it needs to rebuild the room.
          </p>
          <div className="guide-callout"><Lightbulb size={20} /><p><strong>The golden rule</strong> If your movement feels almost too slow, it is probably just right.</p></div>
        </div>
      </section>

      <section className="guide-steps">
        {steps.map(({ number, icon: Icon, title, copy }) => (
          <article key={number}>
            <span className="step-number">{number}</span>
            <div className="step-icon"><Icon size={22} /></div>
            <h3>{title}</h3>
            <p>{copy}</p>
          </article>
        ))}
      </section>

      <section className="guide-footer-card">
        <div><span>READY WHEN YOU ARE</span><h2>Already recorded your space?</h2><p>Upload it now. We’ll check the file before processing begins.</p></div>
        <button className="dark-button" onClick={onStart}>Choose walkthrough <ArrowRight size={17} /></button>
      </section>
    </main>
  )
}
