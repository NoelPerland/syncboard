"use client";
import { useEffect, useRef } from "react";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
type Preview = { id: string; title: string; lane: string };
export default function ProductIntro({
  cards,
  ready,
  status,
  peers,
  onOpen,
  onMove,
}: {
  cards: Preview[];
  ready: boolean;
  status: string;
  peers: number;
  onOpen: () => void;
  onMove: (id: string) => void;
}) {
  const root = useRef<HTMLElement>(null);
  useEffect(() => {
    if (!ready) return;
    gsap.registerPlugin(ScrollTrigger);
    const media = gsap.matchMedia();
    media.add(
      "(prefers-reduced-motion: no-preference)",
      () => {
        gsap.from(".studio-title > span", {
          y: 65,
          rotation: 3,
          opacity: 0,
          stagger: 0.12,
          duration: 1.05,
          ease: "expo.out",
        });
        gsap.from(".preview-note", {
          scale: 0.8,
          y: 50,
          opacity: 0,
          stagger: 0.15,
          duration: 1,
          ease: "back.out(1.3)",
        });
        gsap.to(".preview-arc", {
          rotation: 15,
          ease: "none",
          scrollTrigger: {
            trigger: ".studio-hero",
            start: "top top",
            end: "bottom top",
            scrub: 0.6,
          },
        });
        gsap.from(".studio-how li", {
          y: 25,
          stagger: 0.13,
          duration: 0.7,
          ease: "power3.out",
          scrollTrigger: {
            trigger: ".studio-how",
            start: "top 90%",
            once: true,
          },
        });
      },
      root,
    );
    return () => media.revert();
  }, [ready]);
  return (
    <section
      className="product-intro studio-landing"
      ref={root}
      aria-labelledby="studio-title"
    >
      <div className="studio-top">
        <a className="studio-wordmark" href="#studio-title">
          <span aria-hidden="true">↗</span>SyncBoard
        </a>
        <nav aria-label="Studio navigation">
          <a href="#studio-how">How we work</a>
          <button disabled={!ready} onClick={onOpen}>
            Enter the studio ↗
          </button>
        </nav>
      </div>
      <div className="studio-hero">
        <div className="studio-hero-copy">
          <p>Make space for your next good idea.</p>
          <h1 id="studio-title" className="studio-title">
            <span>Good work</span>
            <span>happens</span>
            <span>
              <em>together.</em>
              <svg viewBox="0 0 440 25" aria-hidden="true">
                <path
                  d="M5 17Q216 0 435 14M65 23Q240 10 398 21"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="3"
                  strokeLinecap="round"
                />
              </svg>
            </span>
          </h1>
          <p className="studio-description">
            A shared home for tasks, notes and all the little conversations that
            move a project forward.
          </p>
          <button className="studio-primary" disabled={!ready} onClick={onOpen}>
            Enter your shared board <span aria-hidden="true">↗</span>
          </button>
          <p className="studio-trust">
            Share with people you trust. Anyone with the board link can edit.
          </p>
        </div>
        <div className="studio-preview" aria-label="Live preview of your board">
          <svg className="preview-arc" viewBox="0 0 500 470" aria-hidden="true">
            <path
              d="M43 290C-20 65 434 12 454 225S79 425 168 131"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeDasharray="8 8"
            />
            <path
              d="M447 202L455 229L472 205"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            />
          </svg>
          <div className="studio-paper-label">
            <span aria-hidden="true">✳</span>
            <p>
              Less status chasing.
              <br />
              <em>More making.</em>
            </p>
          </div>
          {ready ? (
            cards.slice(0, 3).map((card, index) => (
              <article className={`preview-note note-${index}`} key={card.id}>
                <span>{card.lane}</span>
                <h2>{card.title}</h2>
                <button
                  type="button"
                  aria-label={`Move ${card.title} forward`}
                  onClick={() => onMove(card.id)}
                >
                  Move it forward <span aria-hidden="true">↗</span>
                </button>
              </article>
            ))
          ) : (
            <p className="preview-loading" role="status">
              {status === "Invalid board link"
                ? status
                : "Opening your shared studio…"}
            </p>
          )}
          <p className="preview-live" role="status">
            {ready
              ? `${status} · ${peers} ${peers === 1 ? "person" : "people"} here`
              : status}
          </p>
        </div>
      </div>
      <div className="studio-preview-note">
        This preview is your real board. Move a task forward, then open the
        studio to keep working.
      </div>
      <section
        className="studio-how"
        id="studio-how"
        aria-labelledby="how-title"
      >
        <div>
          <h2 id="how-title">
            A little structure.
            <br />
            <em>A lot of possibility.</em>
          </h2>
          <p>
            For the first sketch, the last review and everything you figure out
            together.
          </p>
        </div>
        <ol>
          <li>
            <span aria-hidden="true">↗</span>
            <h3>Start somewhere.</h3>
            <p>Give the work a name. Add the next thing to do.</p>
          </li>
          <li>
            <span aria-hidden="true">↔</span>
            <h3>Bring your people.</h3>
            <p>Share the board link. Changes arrive as you make them.</p>
          </li>
          <li>
            <span aria-hidden="true">✓</span>
            <h3>Keep it moving.</h3>
            <p>Drag tasks, leave a note and celebrate a clear next step.</p>
          </li>
        </ol>
      </section>
      <footer className="studio-footer">
        <p>
          Room for the work.
          <br />
          <em>And the people behind it.</em>
        </p>
        <button disabled={!ready} onClick={onOpen}>
          Let’s make something ↗
        </button>
      </footer>
    </section>
  );
}
