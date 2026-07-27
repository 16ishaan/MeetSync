import { useEffect, useRef, useState } from "react";
import Orb from "./Orb";
import "./Hero.css";

// The "minutes" that type themselves out beside the Orb — numbered because
// real meeting minutes are numbered agenda/decision/action items.
const MINUTE_LINES = [
  "Approved the Q3 launch budget",
  "Priya owns the vendor follow-up",
  "Next sync: Thursday, 10:00",
];

function useTypedMinutes(
  lines,
  { typeSpeed = 28, holdTime = 1400, pauseBetween = 500 } = {},
) {
  const [visibleLines, setVisibleLines] = useState([""]);
  const reducedMotion = useRef(
    typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );

  useEffect(() => {
    if (reducedMotion.current) {
      setVisibleLines(lines);
      return;
    }

    let cancelled = false;
    let timeoutId;

    async function run() {
      while (!cancelled) {
        for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
          const full = lines[lineIndex];
          for (let charIndex = 1; charIndex <= full.length; charIndex++) {
            if (cancelled) return;
            await new Promise((res) => {
              timeoutId = setTimeout(res, typeSpeed);
            });
            setVisibleLines((prev) => {
              const next = prev.slice(0, lineIndex);
              next[lineIndex] = full.slice(0, charIndex);
              return next;
            });
          }
          await new Promise((res) => {
            timeoutId = setTimeout(res, pauseBetween);
          });
        }
        await new Promise((res) => {
          timeoutId = setTimeout(res, holdTime);
        });
        if (cancelled) return;
        setVisibleLines([""]);
        await new Promise((res) => {
          timeoutId = setTimeout(res, 300);
        });
      }
    }

    run();
    return () => {
      cancelled = true;
      clearTimeout(timeoutId);
    };
  }, [lines, typeSpeed, holdTime, pauseBetween]);

  return visibleLines;
}

export default function Hero() {
  const typedLines = useTypedMinutes(MINUTE_LINES);

  return (
    <section className="hero">
      <div className="hero__grid">
        <div className="hero__copy">
          <div className="hero__eyebrow">
            <span className="hero__eyebrow-dot" aria-hidden="true" />
            09:41 · LIVE
          </div>

          <h1 className="hero__headline">
            Every meeting,
            <br />
            written down
            <br />
            <em>before it ends.</em>
          </h1>

          <p className="hero__subcopy">
            Docket listens in, drafts clean minutes as you talk, and hands your
            team a finished record — decisions, owners, and deadlines — the
            second the call wraps.
          </p>

          <div className="hero__actions">
            <button className="hero__cta hero__cta--primary">
              Start capturing minutes
              <span aria-hidden="true">&nbsp;→</span>
            </button>
            <button className="hero__cta hero__cta--secondary">
              Watch a 90-second demo
            </button>
          </div>

          <p className="hero__footnote">
            No plugin to install. Works with any call.
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

          <div className="hero__minutes-card" role="status" aria-live="polite">
            <div className="hero__minutes-header">
              <span>MINUTES</span>
              <span className="hero__minutes-clock">32:14</span>
            </div>
            <ol className="hero__minutes-list">
              {MINUTE_LINES.map((line, i) => (
                <li
                  key={line}
                  className={i < typedLines.length ? "is-active" : ""}
                >
                  <span className="hero__minutes-index">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <span>
                    {typedLines[i] || ""}
                    {i === typedLines.length - 1 && (
                      <span className="hero__cursor" />
                    )}
                  </span>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </div>
    </section>
  );
}
