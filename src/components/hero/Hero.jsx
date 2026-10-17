import { useEffect, useRef, useState } from "react";
import Orb from "./Orb";
import SpecularButton from "./SpecularButton";
import TextPressure from "../TextPressure";
import MagicBento from "./MagicBento";
import SavedRecordings from "./SavedRecordings";
import StaggeredMenu from "../StaggeredMenu/StaggeredMenu";
import { supabase } from "../../lib/supabase";
import "./Hero.css";
import MinutesWorkspace from "./MinutesWorkspace";

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
      "Turn microphone audio into a live transcript. Choose your language, review the text, and download it when you finish.",
    accent: "Transcript",
  },
  {
    id: "upload",
    itemClass: "magic-bento-card--item-3",
    title: "Audio File Upload",
    description:
      "Upload an MP3 recording to produce minutes of meeting, highlights, and next steps in a single pass.",
    accent: "Upload",
  },
];

export default function Hero() {
  const minutesRef = useRef(null);
  const [timeLabel, setTimeLabel] = useState(() => formatKolkataTime());
  const [showLaunchpad, setShowLaunchpad] = useState(false);
  const [showSavedRecordings, setShowSavedRecordings] = useState(false);
  const [user, setUser] = useState(null);
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [authError, setAuthError] = useState("");
  const [authUnavailable, setAuthUnavailable] = useState(!supabase);

  useEffect(() => {
    const updateClock = () => {
      setTimeLabel(formatKolkataTime());
    };

    updateClock();
    const intervalId = window.setInterval(updateClock, 1000);

    return () => window.clearInterval(intervalId);
  }, []);

  useEffect(() => {
    if (!supabase) {
      setAuthUnavailable(true);
      return;
    }
    // Check if user is already logged in
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user || null);
      setAuthUnavailable(false);
      if (session) {
        // If we just redirected back from login, optionally show launchpad
        setShowLaunchpad(true);
      }
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user || null);
      setAuthUnavailable(false);
      if (_event === "SIGNED_IN" && session) setShowLaunchpad(true);
    });

    return () => subscription.unsubscribe();
  }, []);

  const handleGetStarted = async () => {
    if (user) {
      setShowLaunchpad(true);
      return;
    }
    if (!supabase || isSigningIn) return;

    setAuthError("");
    setIsSigningIn(true);
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: window.location.origin + window.location.pathname },
      });
      if (error) throw error;
    } catch (error) {
      setAuthError(error.message || "Unable to sign in with Google. Please try again.");
    } finally {
      setIsSigningIn(false);
    }
  };

  return (
    <section className={`hero ${showLaunchpad ? "hero--launchpad" : ""}`}>
      {showLaunchpad && (
        <StaggeredMenu
          position="right"
          isFixed={true}
          items={[
            {
              label: "Home",
              link: "#",
              onClick: () => setShowLaunchpad(false),
            },
            {
              label: "Saved recordings",
              link: "#",
              onClick: () => setShowSavedRecordings(true),
            },
          ]}
          socialItems={[
            { label: "Twitter", link: "#" },
            { label: "GitHub", link: "#" },
          ]}
        />
      )}
      {showLaunchpad ? (
        <div className="hero__launchpad bento-section">
          {showSavedRecordings ? (
            <SavedRecordings onBack={() => setShowSavedRecordings(false)} />
          ) : (
            <>
              <div className="hero__launchpad-header">
                <div>
                  <p className="hero__launchpad-kicker">MEETSYNC / YOUR MEETING WORKSPACE</p>
                  <h1 className="hero__launchpad-title">
                    Good meetings deserve clear next steps.
                  </h1>
                  <p className="hero__launchpad-copy">
                    Record a meeting, capture live speech, or upload your audio.
                    Send the transcript to your MOM workspace, review the draft,
                    and download minutes your team can act on.
                  </p>
                </div>
              </div>

              <MagicBento
                onTranscript={(text) => minutesRef.current?.importTranscript(text)}
                cards={launchCards.map((card) => ({ ...card, user }))}
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
              />
              <MinutesWorkspace ref={minutesRef} user={user} />
            </>
          )}

          <div className="hero__launchpad-footer"></div>
        </div>
      ) : (
        <>
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
                <span className="hero__eyebrow-sep" aria-hidden="true">
                  ·
                </span>
                {user && (
                  <span className="hero__eyebrow-user">
                    Welcome, {user.user_metadata?.full_name || user.email}
                  </span>
                )}
              </div>

              <h1 className="hero__headline">
                Every meeting,
                <br />
                turned into
                <br />
                <em>clear next steps.</em>
              </h1>

              <div className="hero__actions">
                <SpecularButton
                  onClick={handleGetStarted}
                  disabled={isSigningIn || (!user && authUnavailable)}
                >
                  {user ? "Go to Dashboard" : isSigningIn ? "Connecting…" : "Login with Google"}
                </SpecularButton>
              </div>

              {authError && <p className="hero__footnote" role="alert">{authError}</p>}

              {authUnavailable && (
                <p className="hero__footnote font-['Plus_Jakarta_Sans',sans-serif] text-base md:text-lg font-normal text-slate-600 leading-relaxed max-w-2xl mx-auto text-red-300">
                  Google sign-in is disabled until you add your Supabase env
                  vars. Create a .env file with VITE_SUPABASE_URL and
                  VITE_SUPABASE_ANON_KEY.
                </p>
              )}

              <p className="hero__footnote font-['Plus_Jakarta_Sans',sans-serif] text-base md:text-lg font-normal text-slate-600 leading-relaxed max-w-2xl mx-auto">
                MeetSync turns meeting transcripts into structured, editable
                Minutes of Meeting. Sign in
                with Google to capture a transcript, prepare editable minutes, and download a PDF for
                your team.
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
        </>
      )}
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
