"use client";

import { useEffect, useRef, useState, useSyncExternalStore, type KeyboardEvent } from "react";
import { ArrowLeft, ArrowRight, ArrowUpRight, Languages, LoaderCircle, LogIn } from "lucide-react";
import { LANDING_LANGUAGE_KEY, landingCopy, landingLanguages, resolveLandingLanguage, type LandingLanguage } from "@/lib/landing-copy";
import { DEFAULT_THEME, isThemeMode } from "@/lib/themes";
import "./landing.css";

const productSizes = [
  { width: 1120, height: 264, mobileWidth: 358, mobileHeight: 361 },
  { width: 1120, height: 521, mobileWidth: 358, mobileHeight: 697 },
  { width: 860, height: 488, mobileWidth: 362, mobileHeight: 818 },
  { width: 1120, height: 608, mobileWidth: 358, mobileHeight: 754 },
];

function subscribeLanguage(callback: () => void) {
  window.addEventListener("storage", callback);
  window.addEventListener("languagechange", callback);
  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener("languagechange", callback);
  };
}

function browserLanguage() {
  let saved: string | null = null;
  try { saved = localStorage.getItem(LANDING_LANGUAGE_KEY); } catch { /* Storage is optional. */ }
  return resolveLandingLanguage(saved, navigator.languages.length ? navigator.languages : [navigator.language]);
}

function subscribeTheme(callback: () => void) {
  const observer = new MutationObserver(callback);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  return () => observer.disconnect();
}

function browserTheme() {
  const theme = document.documentElement.dataset.theme;
  return isThemeMode(theme) ? theme : DEFAULT_THEME;
}

export function LandingScreen({ reason, onSignIn }: { reason: string | null; onSignIn: () => void }) {
  const detectedLanguage = useSyncExternalStore(subscribeLanguage, browserLanguage, () => "ko" as const);
  const theme = useSyncExternalStore(subscribeTheme, browserTheme, () => DEFAULT_THEME);
  const [chosenLanguage, setChosenLanguage] = useState<LandingLanguage | null>(null);
  const language = chosenLanguage ?? detectedLanguage;
  const copy = landingCopy[language];
  const [index, setIndex] = useState(0);
  const [signingIn, setSigningIn] = useState(false);
  const viewport = useRef<HTMLDivElement>(null);
  const currentIndex = useRef(0);
  const signingInRef = useRef(false);
  const scrollFrame = useRef<number | null>(null);
  const unavailable = reason === "missing_config";

  useEffect(() => {
    const node = viewport.current;
    if (!node) return;
    // Keep the selected slide aligned when the window, fonts, or language changes.
    const resize = new ResizeObserver(() => node.scrollTo({ left: currentIndex.current * node.clientWidth, behavior: "instant" }));
    resize.observe(node);
    const restore = () => { signingInRef.current = false; setSigningIn(false); };
    window.addEventListener("pageshow", restore);
    return () => {
      resize.disconnect();
      window.removeEventListener("pageshow", restore);
      if (scrollFrame.current !== null) cancelAnimationFrame(scrollFrame.current);
    };
  }, []);

  function navigate(next: number) {
    const target = Math.max(0, Math.min(copy.slides.length - 1, next));
    const node = viewport.current;
    if (!node) return;
    node.scrollTo({ left: target * node.clientWidth, behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth" });
  }

  function trackScroll() {
    if (scrollFrame.current !== null) cancelAnimationFrame(scrollFrame.current);
    scrollFrame.current = requestAnimationFrame(() => {
      const node = viewport.current;
      if (!node?.clientWidth) return;
      const next = Math.max(0, Math.min(3, Math.round(node.scrollLeft / node.clientWidth)));
      currentIndex.current = next;
      setIndex(next);
    });
  }

  function handleKeys(event: KeyboardEvent<HTMLDivElement>) {
    if (event.target !== event.currentTarget || event.altKey || event.ctrlKey || event.metaKey) return;
    const next = { ArrowLeft: index - 1, ArrowRight: index + 1, Home: 0, End: 3 }[event.key];
    if (next === undefined) return;
    event.preventDefault();
    navigate(next);
  }

  function signIn() {
    if (signingInRef.current || unavailable) return;
    signingInRef.current = true;
    setSigningIn(true);
    try { onSignIn(); } catch { signingInRef.current = false; setSigningIn(false); }
  }

  return (
    <main className="landing-shell" lang={language}>
      <header className="landing-header">
        <h1>OKRPTR<span aria-hidden="true">.</span></h1>
        <label className="landing-language">
          <Languages size={18} aria-hidden="true" />
          <span className="sr-only">{copy.language}</span>
          <select value={language} onChange={(event) => {
            const next = event.target.value as LandingLanguage;
            setChosenLanguage(next);
            try { localStorage.setItem(LANDING_LANGUAGE_KEY, next); } catch { /* Keep the selection for this visit. */ }
          }}>
            {landingLanguages.map(({ id, label }) => <option key={id} value={id}>{label}</option>)}
          </select>
        </label>
      </header>

      <section className="landing-story" aria-label={copy.carousel} aria-roledescription="carousel">
        {/* A scrollable carousel needs a focus stop for native and arrow-key scrolling. */}
        {/* eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex, jsx-a11y/no-noninteractive-element-interactions */}
        <div className="landing-viewport" role="group" ref={viewport} onScroll={trackScroll} onKeyDown={handleKeys} tabIndex={0} aria-label={copy.carousel}>
          {copy.slides.map((slide, slideIndex) => (
            // Each independently scrolling slide must also be keyboard focusable.
            <section key={slideIndex} id={`landing-slide-${slideIndex}`} className="landing-slide" role="group" tabIndex={slideIndex === index ? 0 : -1} aria-roledescription={copy.slide} aria-label={`${slideIndex + 1} / 4`} aria-hidden={slideIndex !== index} inert={slideIndex !== index}>
              <div className="landing-slide-inner">
                <div className="landing-copy">
                  <span className="landing-step" aria-hidden="true">0{slideIndex + 1}<span> / 04</span></span>
                  <h2>{slide.title}</h2>
                  <p>{slide.description}</p>
                </div>
                <figure className="landing-product">
                  {/* Product captures deliberately remain images, not editable demo records. */}
                  <picture>
                    <source media="(max-width: 640px)" srcSet={`/landing/${theme}/slide-${slideIndex + 1}-mobile.png`} width={productSizes[slideIndex].mobileWidth} height={productSizes[slideIndex].mobileHeight} />
                    <img src={`/landing/${theme}/slide-${slideIndex + 1}.png`} alt={slide.alt} width={productSizes[slideIndex].width} height={productSizes[slideIndex].height} loading={slideIndex === 0 ? "eager" : "lazy"} decoding="async" />
                  </picture>
                  <figcaption>{copy.sample}</figcaption>
                </figure>
                <div className="landing-context">
                  {slideIndex === 0 && <div className="landing-sources">
                    <a href="https://blog.google/company-news/outreach-and-initiatives/small-business/lets-make-work-better/" target="_blank" rel="noreferrer">{copy.google}<ArrowUpRight size={14} aria-hidden="true" /></a>
                    <a href="https://www.whatmatters.com/okrs-explained/john-doerr-operation-crush" target="_blank" rel="noreferrer">{copy.intel}<ArrowUpRight size={14} aria-hidden="true" /></a>
                  </div>}
                  {slideIndex === 2 && <p>{copy.mcp}</p>}
                </div>
              </div>
            </section>
          ))}
        </div>
        <nav className="landing-navigation" aria-label={copy.carousel}>
          <button type="button" className="secondary landing-arrow" aria-label={copy.previous} title={copy.previous} disabled={index === 0} onClick={() => navigate(index - 1)}><ArrowLeft size={20} aria-hidden="true" /></button>
          <div className="landing-dots">
            {copy.slides.map((slide, slideIndex) => <button key={slideIndex} type="button" aria-label={`${copy.slide} ${slideIndex + 1}: ${slide.title}`} aria-current={index === slideIndex ? "step" : undefined} aria-controls={`landing-slide-${slideIndex}`} title={slide.title} onClick={() => navigate(slideIndex)}><span /></button>)}
          </div>
          <button type="button" className="secondary landing-arrow" aria-label={copy.next} title={copy.next} disabled={index === 3} onClick={() => navigate(index + 1)}><ArrowRight size={20} aria-hidden="true" /></button>
          <span className="sr-only" aria-live="polite" aria-atomic="true">{copy.slide} {index + 1} / 4: {copy.slides[index].title}</span>
        </nav>
      </section>

      <footer className="landing-login">
        <div className="landing-login-inner">
          <div className="landing-login-copy">
            <p id="landing-login-note">{copy.loginNote}</p>
            {(reason === "failed" || unavailable) && <p className="landing-auth-error" role="alert">{unavailable ? copy.unavailable : copy.loginError}</p>}
          </div>
          <button type="button" className="primary-action landing-login-button" aria-describedby="landing-login-note" disabled={signingIn || unavailable} aria-busy={signingIn} onClick={signIn}>
            {signingIn ? <LoaderCircle className="spin" size={18} aria-hidden="true" /> : <LogIn size={18} aria-hidden="true" />}
            <span>{signingIn ? copy.loggingIn : copy.login}</span>
          </button>
        </div>
      </footer>
    </main>
  );
}
