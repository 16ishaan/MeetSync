import { useEffect, useState } from "react";
import Orb from "./Orb";
import SpecularButton from "./SpecularButton";
import TextPressure from "../TextPressure";
import MagicBento from "./MagicBento";
import StaggeredMenu from "../StaggeredMenu/StaggeredMenu";
import { supabase } from "../../lib/supabase";
import "./Hero.css";

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
      "Drop in existing recordings to produce minutes of meeting, highlights, and next steps in a single pass.",
    accent: "Upload",
  },
];

export default function Hero() {
  const [timeLabel, setTimeLabel] = useState(() => formatKolkataTime());
  const [showLaunchpad, setShowLaunchpad] = useState(false);
  const [user, setUser] = useState(null);

  useEffect(() => {
    const updateClock = () => {
      setTimeLabel(formatKolkataTime());
    };

    updateClock();
    const intervalId = window.setInterval(updateClock, 1000);

    return () => window.clearInterval(intervalId);
  }, []);

  useEffect(() => {
    if (!supabase) return;
    // Check if user is already logged in
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user || null);
      if (session && window.location.hash.includes("access_token")) {
        // If we just redirected back from login, optionally show launchpad
        setShowLaunchpad(true);
      }
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user || null);
    });

    return () => subscription.unsubscribe();
  }, []);

  const handleGetStarted = async () => {
    if (user) {
      setShowLaunchpad(true);
      return;
    }
    if (!supabase) {
      console.error('Supabase not configured');
      return;
    }
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
    });
    
    if (error) {
      console.error('Error logging in with Google:', error.message);
    }
  };

  return (
    <section className={`hero ${showLaunchpad ? "hero--launchpad" : ""}`}>
      {showLaunchpad && (
        <StaggeredMenu
          position="right"
          isFixed={true}
          items={[
            { label: "Home", link: "#", onClick: () => setShowLaunchpad(false) },
            { label: "About", link: "#" },
          ]}
          socialItems={[
            { label: "Twitter", link: "#" },
            { label: "GitHub", link: "#" },
          ]}
        />
      )}
      {showLaunchpad ? (
        <div className="hero__launchpad bento-section">
          <div className="hero__launchpad-header">
            <div>
              <p className="hero__launchpad-kicker">MeetSync setup</p>
              <h1 className="hero__launchpad-title">
                Pick how you want to capture the meeting.
              </h1>
              <p className="hero__launchpad-copy">
                Start a live recording, listen with web speech, or upload an
                existing file. The new interface keeps the workflow focused and
                card-driven.
              </p>
            </div>


          </div>

          <MagicBento
            cards={launchCards}
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

          <div className="hero__launchpad-footer">
          </div>
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
                written down
                <br />
                <em>before it ends.</em>
              </h1>

              <div className="hero__actions">
                <SpecularButton onClick={handleGetStarted}>
                  {user ? "Go to Dashboard" : "Get Started"}
                </SpecularButton>
              </div>

              <p className="hero__footnote font-['Plus_Jakarta_Sans',sans-serif] text-base md:text-lg font-normal text-slate-600 leading-relaxed max-w-2xl mx-auto">
                MeetSync captures your meetings and uses AI to transform raw
                audio into structured Minutes of Meeting in seconds. No
                sign-ups, no account setup, and zero friction just instant
                summaries, key decisions, and assigned tasks ready to share with
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
