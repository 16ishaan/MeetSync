import { useEffect, useState } from "react";
import Orb from "./Orb";
import SpecularButton from "./SpecularButton";
import TextPressure from "../TextPressure";
import MagicBento from "./MagicBento";
import SavedRecordings from "./SavedRecordings";
import StaggeredMenu from "../StaggeredMenu/StaggeredMenu";
import MeetingView from "../meeting/MeetingView";
import MeetingHistory from "../meeting/MeetingHistory";
import { supabase } from "../../lib/supabase";
import "./Hero.css";

// Views the app can show
const VIEW = {
  LANDING: "landing",
  LAUNCHPAD: "launchpad",
  SAVED_RECORDINGS: "saved_recordings",
  MEETING: "meeting",
  HISTORY: "history",
};

const launchCards = [
  {
    id: "record",
    itemClass: "magic-bento-card--item-1",
    title: "In-Browser Audio Recorder",
    description:
      "Capture meetings instantly from any tab and turn live audio into a structured summary without leaving the browser.",
    accent: "Record",
  },
  {
    id: "speech",
    itemClass: "magic-bento-card--item-2",
    title: "Web Speech Intelligence",
    description:
      "Use speech recognition to generate clean transcripts, decisions, and action items as the conversation moves.",
    accent: "Transcript",
  },
  {
    id: "upload",
    itemClass: "magic-bento-card--item-3",
    title: "Audio File Upload",
    description:
      "Upload an MP3 or audio recording to produce minutes of meeting, highlights, and next steps in a single pass.",
    accent: "Upload",
  },
];

export default function Hero() {
  const [timeLabel, setTimeLabel] = useState(() => formatKolkataTime());
  const [view, setView] = useState(VIEW.LANDING);
  const [user, setUser] = useState(null);
  const [authUnavailable, setAuthUnavailable] = useState(!supabase);
  const [activeMeetingId, setActiveMeetingId] = useState(null);

  // Clock
  useEffect(() => {
    const id = window.setInterval(() => setTimeLabel(formatKolkataTime()), 1000);
    return () => window.clearInterval(id);
  }, []);

  // Auth
  useEffect(() => {
    if (!supabase) {
      setAuthUnavailable(true);
      return;
    }
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user || null);
      setAuthUnavailable(false);
      if (session && window.location.hash.includes("access_token")) {
        setView(VIEW.LAUNCHPAD);
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user || null);
      setAuthUnavailable(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  // Warn before leaving during recording
  useEffect(() => {
    const handler = (e) => {
      if (view === VIEW.LAUNCHPAD) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [view]);

  const handleGetStarted = () => setView(VIEW.LAUNCHPAD);

  // Called by AudioRecorder / AudioFileUpload when a meeting has a recording+transcript
  const handleMeetingReady = ({ meetingId }) => {
    if (!meetingId) return;
    setActiveMeetingId(meetingId);
    setView(VIEW.MEETING);
  };

  const openMeeting = (id) => {
    setActiveMeetingId(id);
    setView(VIEW.MEETING);
  };

  const goBack = () => {
    switch (view) {
      case VIEW.MEETING:
        setView(VIEW.LAUNCHPAD);
        break;
      case VIEW.HISTORY:
      case VIEW.SAVED_RECORDINGS:
        setView(VIEW.LAUNCHPAD);
        break;
      default:
        setView(VIEW.LANDING);
    }
  };

  // ── Navigation items ──────────────────────────────────────────────
  const menuItems = view === VIEW.LANDING
    ? []
    : [
        {
          label: "Home",
          link: "#",
          onClick: () => setView(VIEW.LANDING),
        },
        {
          label: "Capture",
          link: "#",
          onClick: () => setView(VIEW.LAUNCHPAD),
        },
        {
          label: "Meeting History",
          link: "#",
          onClick: () => setView(VIEW.HISTORY),
        },
        {
          label: "Saved Recordings",
          link: "#",
          onClick: () => setView(VIEW.SAVED_RECORDINGS),
        },
      ];

  const showMenu = view !== VIEW.LANDING;

  // ── Landing ───────────────────────────────────────────────────────
  if (view === VIEW.LANDING) {
    return (
      <section className="hero">
        <div className="hero__branding">
          <div style={{ position: "relative", height: "300px" }}>
            <TextPressure
              text="MeetSync"
              flex={true}
              alpha={false}
              stroke={false}
              width={true}
              weight={true}
              italic={true}
              textColor="#ffffff"
              strokeColor="#ff0000"
              minFontSize={36}
            />
          </div>
        </div>

        <div className="hero__grid">
          <div className="hero__copy">
            <div className="hero__eyebrow">
              <span className="hero__eyebrow-dot" aria-hidden="true" />
              <span className="hero__eyebrow-time">{timeLabel}</span>
              <span className="hero__eyebrow-sep" aria-hidden="true">·</span>
              {user && (
                <span className="hero__eyebrow-user">
                  Welcome, {user.user_metadata?.full_name || user.email}
                </span>
              )}
            </div>

            <h1 className="hero__headline">
              Every meeting,
              <br />
              written down
              <br />
              <em>before it ends.</em>
            </h1>

            <div className="hero__actions">
              <SpecularButton onClick={handleGetStarted}>
                {user ? "Go to Dashboard" : "Try Recorder"}
              </SpecularButton>
            </div>

            {authUnavailable && (
              <p className="hero__footnote" style={{ color: "#f87171" }}>
                Google sign-in is disabled until you add your Supabase env vars. Create a .env file with VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.
              </p>
            )}

            <p className="hero__footnote">
              MeetSync captures your meetings and uses AI to transform raw audio
              into structured Minutes of Meeting in seconds. No sign-ups, no
              account setup — instant summaries, key decisions, and assigned tasks
              ready to share.
            </p>
          </div>

          <div className="hero__stage">
            <div className="hero__orb-wrap">
              <Orb
                hue={265}
                hoverIntensity={0.35}
                rotateOnHover
                backgroundColor="#14171F"
              />
            </div>
          </div>
        </div>
      </section>
    );
  }

  // ── Meeting View ──────────────────────────────────────────────────
  if (view === VIEW.MEETING && activeMeetingId) {
    return (
      <section className="hero hero--launchpad">
        {showMenu && (
          <StaggeredMenu
            position="right"
            isFixed={true}
            items={menuItems}
            socialItems={[
              { label: "Twitter", link: "#" },
              { label: "GitHub", link: "#" },
            ]}
          />
        )}
        <div className="hero__launchpad bento-section">
          <MeetingView
            meetingId={activeMeetingId}
            onBack={goBack}
          />
        </div>
      </section>
    );
  }

  // ── Meeting History ───────────────────────────────────────────────
  if (view === VIEW.HISTORY) {
    return (
      <section className="hero hero--launchpad">
        {showMenu && (
          <StaggeredMenu
            position="right"
            isFixed={true}
            items={menuItems}
            socialItems={[
              { label: "Twitter", link: "#" },
              { label: "GitHub", link: "#" },
            ]}
          />
        )}
        <div className="hero__launchpad bento-section">
          <MeetingHistory onOpen={openMeeting} onBack={goBack} />
        </div>
      </section>
    );
  }

  // ── Saved Recordings ─────────────────────────────────────────────
  if (view === VIEW.SAVED_RECORDINGS) {
    return (
      <section className="hero hero--launchpad">
        {showMenu && (
          <StaggeredMenu
            position="right"
            isFixed={true}
            items={menuItems}
            socialItems={[
              { label: "Twitter", link: "#" },
              { label: "GitHub", link: "#" },
            ]}
          />
        )}
        <div className="hero__launchpad bento-section">
          <SavedRecordings onBack={() => setView(VIEW.LAUNCHPAD)} />
        </div>
      </section>
    );
  }

  // ── Launchpad (default) ───────────────────────────────────────────
  return (
    <section className="hero hero--launchpad">
      {showMenu && (
        <StaggeredMenu
          position="right"
          isFixed={true}
          items={menuItems}
          socialItems={[
            { label: "Twitter", link: "#" },
            { label: "GitHub", link: "#" },
          ]}
        />
      )}

      <div className="hero__launchpad bento-section">
        <div className="hero__launchpad-header">
          <div>
            <p className="hero__launchpad-kicker">MeetSync</p>
            <h1 className="hero__launchpad-title">
              Pick how you want to capture the meeting.
            </h1>
            <p className="hero__launchpad-copy">
              Start a live recording, listen with web speech, or upload an
              existing file. After recording, generate a transcript and let AI
              produce structured minutes, decisions, and action items.
            </p>
          </div>
        </div>

        <MagicBento
          cards={launchCards.map((card) => ({
            ...card,
            user,
            onMeetingReady: handleMeetingReady,
          }))}
          textAutoHide={true}
          enableStars={true}
          enableSpotlight={true}
          enableBorderGlow={true}
          enableTilt={true}
          enableMagnetism={true}
          clickEffect={true}
          spotlightRadius={300}
          particleCount={12}
          glowColor="132, 0, 255"
          onMeetingReady={handleMeetingReady}
        />

        {/* Quick links below the bento */}
        <div className="hero__launchpad-quick-links">
          <button
            type="button"
            className="hero__launchpad-quick-btn"
            onClick={() => setView(VIEW.HISTORY)}
          >
            📋 Meeting History
          </button>
          <button
            type="button"
            className="hero__launchpad-quick-btn"
            onClick={() => setView(VIEW.SAVED_RECORDINGS)}
          >
            🎙 Saved Recordings
          </button>
        </div>

        <div className="hero__launchpad-footer" />
      </div>
    </section>
  );
}

function formatKolkataTime() {
  return new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Asia/Kolkata",
  }).format(new Date());
}
