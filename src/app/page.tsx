export default function Home() {
  return (
    <main className="landing-shell">
      <nav className="site-nav" aria-label="Primary navigation">
        <a className="wordmark" href="#top" aria-label="Meri home">
          Meri
        </a>
        <span className="status-pill">
          <span className="status-dot" aria-hidden="true" />
          Foundation ready
        </span>
      </nav>

      <section className="hero" id="top">
        <p className="eyebrow">Your personal outdoor intelligence companion</p>
        <h1>
          Plan with clarity.
          <br />
          Travel with confidence.
        </h1>
        <p className="hero-copy">
          Meri brings routes, weather, local knowledge, and trip decisions into
          one calm, evolving view of the journey ahead.
        </p>
        <div className="hero-actions">
          <a className="primary-action" href="#vision">
            Explore the vision
          </a>
          <a className="text-action" href="/api/health">
            Check system health <span aria-hidden="true">↗</span>
          </a>
        </div>
      </section>

      <section className="vision-card" id="vision" aria-labelledby="vision-title">
        <p className="card-label">Built for the whole journey</p>
        <h2 id="vision-title">From the first idea to the way home.</h2>
        <p>
          Meri will grow around real trips, helping outdoor travelers understand
          what matters now and what has changed since they last checked.
        </p>
      </section>

      <footer>
        <span>Meri</span>
        <span>Built incrementally for the outdoors.</span>
      </footer>
    </main>
  );
}
