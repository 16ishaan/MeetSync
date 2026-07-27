import Hero from "./components/hero/Hero";

const coreFeatures = [
  {
    title: "Live capture and upload",
    copy: "Record meetings in-app, connect conferencing tools, or upload recordings for transcription and MOM generation.",
  },
  {
    title: "Speaker-aware transcription",
    copy: "Separate voices, refine punctuation, and produce clean transcripts that are ready for review.",
  },
  {
    title: "Decision and action extraction",
    copy: "Turn long conversations into structured minutes with decisions, owners, deadlines, and follow-ups.",
  },
  {
    title: "Collaborative editing",
    copy: "Let teams annotate, correct, and finalize minutes together with a clear review flow.",
  },
  {
    title: "Searchable meeting history",
    copy: "Find topics, tags, dates, and speaker mentions across every meeting in one place.",
  },
  {
    title: "Custom MOM templates",
    copy: "Adapt the output for standups, client calls, board meetings, retrospectives, and more.",
  },
];

const workflow = [
  {
    step: "01",
    title: "Capture",
    copy: "Join the meeting, record audio or video, or import an existing file.",
  },
  {
    step: "02",
    title: "Analyze",
    copy: "Transcription, diarization, and NLP extract the important threads in the discussion.",
  },
  {
    step: "03",
    title: "Publish",
    copy: "Review the draft minutes, assign owners, and export a polished MOM instantly.",
  },
];

const architecture = [
  "Meeting ingestion service",
  "ASR transcription pipeline",
  "LLM summarization layer",
  "MOM generation and editor API",
  "Search and indexing service",
  "Identity, auth, and permissions",
];

const metrics = [
  { label: "Minutes ready", value: "< 2 min" },
  { label: "Search latency", value: "< 300 ms" },
  { label: "Core services", value: "8 modules" },
  { label: "Trust posture", value: "OAuth + SSO" },
];

const suggestions = [
  "Calendar sync with automatic agenda import",
  "Task sync to Jira, Asana, or Linear",
  "Realtime action-item reminders",
  "Multilingual transcription and MOM generation",
  "Team knowledge graph across meetings and docs",
  "Meeting effectiveness analytics dashboard",
];

function SectionHeading({ eyebrow, title, copy }) {
  return (
    <div className="section-heading">
      <span className="section-heading__eyebrow">{eyebrow}</span>
      <h2>{title}</h2>
      <p>{copy}</p>
    </div>
  );
}

function App() {
  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="topbar__brand">
          <span className="topbar__dot" aria-hidden="true" />
          MeetSync
        </div>
        <nav className="topbar__nav" aria-label="Primary">
          <a href="#features">Features</a>
          <a href="#workflow">Workflow</a>
          <a href="#architecture">Architecture</a>
          <a href="#roadmap">Roadmap</a>
        </nav>
      </header>

      <main>
        <Hero />

        <section className="panel panel--intro">
          <div className="panel__copy">
            <span className="panel__kicker">Built from the PRD and TRD</span>
            <h2>From raw meeting data to structured, shareable minutes.</h2>
            <p>
              MeetSync is designed around the complete post-meeting flow:
              capture, transcribe, summarize, edit, search, and distribute the
              final MOM without manual cleanup.
            </p>
          </div>
          <div className="panel__statgrid">
            {metrics.map((metric) => (
              <article className="stat-card" key={metric.label}>
                <span>{metric.label}</span>
                <strong>{metric.value}</strong>
              </article>
            ))}
          </div>
        </section>

        <section id="features" className="section-block">
          <SectionHeading
            eyebrow="Core product"
            title="Everything the PRD calls for, organized into a single workflow."
            copy="These are the product surfaces that matter most for the first version: ingestion, AI summarization, editing, and retrieval."
          />
          <div className="feature-grid">
            {coreFeatures.map((feature) => (
              <article className="feature-card" key={feature.title}>
                <h3>{feature.title}</h3>
                <p>{feature.copy}</p>
              </article>
            ))}
          </div>
        </section>

        <section id="workflow" className="section-block section-block--split">
          <SectionHeading
            eyebrow="User flow"
            title="A short path from meeting to minutes."
            copy="The experience should feel obvious: start the capture, review the generated draft, then publish the final MOM."
          />
          <div className="workflow-grid">
            {workflow.map((item) => (
              <article className="workflow-card" key={item.step}>
                <span className="workflow-card__step">{item.step}</span>
                <h3>{item.title}</h3>
                <p>{item.copy}</p>
              </article>
            ))}
          </div>
        </section>

        <section id="architecture" className="section-block architecture">
          <SectionHeading
            eyebrow="TRD view"
            title="A modular backend that can scale with meeting volume."
            copy="The TRD points to a cloud-native microservices setup. This layout keeps the front-end aligned with the intended service boundaries."
          />
          <div className="architecture__layout">
            <div
              className="architecture__diagram"
              aria-label="Architecture modules"
            >
              {architecture.map((item, index) => (
                <div className="architecture__node" key={item}>
                  <span>{String(index + 1).padStart(2, "0")}</span>
                  <strong>{item}</strong>
                </div>
              ))}
            </div>
            <aside className="architecture__note">
              <h3>What this unlocks</h3>
              <p>
                Independent deployment for transcription, summarization, search,
                and auth. That keeps the UI fast while the heavier AI jobs run
                behind the scenes.
              </p>
              <p>
                It also makes the product easier to extend with integrations,
                multilingual support, and team-level governance later.
              </p>
            </aside>
          </div>
        </section>

        <section id="roadmap" className="section-block section-block--wide">
          <SectionHeading
            eyebrow="Feature ideas"
            title="Extra features worth adding after the first release."
            copy="These are the highest-value additions I’d recommend beyond the PRD/TRD baseline."
          />
          <div className="roadmap-grid">
            {suggestions.map((item) => (
              <div className="roadmap-pill" key={item}>
                {item}
              </div>
            ))}
          </div>
        </section>

        <section className="section-block cta-block">
          <div>
            <span className="panel__kicker">Success metrics</span>
            <h2>Track adoption, accuracy, and turnaround time from day one.</h2>
            <p>
              Measure how quickly a meeting becomes a finalized MOM, how
              accurate the transcript feels to users, and whether teams keep
              returning to their meeting history.
            </p>
          </div>
          <a className="cta-link" href="mailto:hello@meetsync.local">
            Request the next build
          </a>
        </section>
      </main>
    </div>
  );
}

export default App;
