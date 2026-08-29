import React, { useState, useEffect } from "react";
import { useConvexAuth, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import {
  Star,
  Clock,
  Buildings,
  Play,
  ArrowRight,
  CaretLeft,
  CaretRight,
  User,
  List,
  X,
  ShieldCheck,
  Envelope,
  CheckCircle,
  Compass,
} from "@phosphor-icons/react";
import { NavigationView } from "../layout/Sidebar";
import { BrandLogo } from "../common/BrandLogo";
import { Avatar, AvatarFallback, AvatarImage } from "../ui/avatar";

interface CinematicHeroProps {
  onEnterConsole: (view?: NavigationView) => void;
}

interface HeroSlide {
  badge1: { icon: React.ElementType; label: string };
  badge2: { icon: React.ElementType; label: string };
  badge3: { icon: React.ElementType; label: string };
  title: string;
  description: string;
  primaryCtaText: string;
  secondaryCtaText: string;
  targetView: NavigationView;
}

const HERO_SLIDES: HeroSlide[] = [
  {
    badge1: { icon: Star, label: "94.8% Overturn Rate" },
    badge2: { icon: Clock, label: "24/7 Autonomous Sentinel" },
    badge3: { icon: Buildings, label: "500+ Payers Indexed" },
    title: "Step Through. Defend Every Claim.",
    description:
      "AI-powered clinical intelligence citing insurer policy bulletins and medical guidelines in real time to overturn health insurance denials autonomously.",
    primaryCtaText: "Launch Sentinel",
    secondaryCtaText: "Explore Case Radar",
    targetView: "radar",
  },
  {
    badge1: { icon: ShieldCheck, label: "ERISA 29 CFR § 2560.503-1" },
    badge2: { icon: Clock, label: "< 14-Day Alarm Sweep" },
    badge3: { icon: Buildings, label: "Molina · GeoBlue · BCBS · 500+ Payers" },
    title: "Clinical Precedent. Zero Hallucination.",
    description:
      "Autonomous clinical policy indexing scans payer bulletins, CPT codes, and LCD precedent rulings to construct unassailable, cited appeal dossiers.",
    primaryCtaText: "Inspect Evidence Matrix",
    secondaryCtaText: "Launch Appeal Studio",
    targetView: "evidence",
  },
  {
    badge1: { icon: Envelope, label: "Direct Payer Gateway" },
    badge2: { icon: Clock, label: "Instant Real-Time Sync" },
    badge3: { icon: CheckCircle, label: "$1.4M+ Recovered" },
    title: "Autonomous Dispatch. Rapid Settlement.",
    description:
      "Dedicated case inboxes automatically transmit cited briefs to grievance portals and record incoming payer determinations in real time.",
    primaryCtaText: "Open Payer Inbox",
    secondaryCtaText: "View Portfolio Analytics",
    targetView: "communications",
  },
];

export const CinematicHero: React.FC<CinematicHeroProps> = ({
  onEnterConsole,
}) => {
  const { isAuthenticated } = useConvexAuth();
  const viewer = useQuery((api as any).users?.viewer);
  const userName = viewer?.name || viewer?.email?.split("@")[0] || "Officer";
  const userInitial = (viewer?.name?.[0] || viewer?.email?.[0] || "S").toUpperCase();

  const [currentSlideIndex, setCurrentSlideIndex] = useState(0);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isTransitioning, setIsTransitioning] = useState(false);

  const slide = HERO_SLIDES[currentSlideIndex];

  const handlePrevSlide = () => {
    setIsTransitioning(true);
    setTimeout(() => {
      setCurrentSlideIndex((prev) =>
        prev === 0 ? HERO_SLIDES.length - 1 : prev - 1
      );
      setIsTransitioning(false);
    }, 150);
  };

  const handleNextSlide = () => {
    setIsTransitioning(true);
    setTimeout(() => {
      setCurrentSlideIndex((prev) =>
        prev === HERO_SLIDES.length - 1 ? 0 : prev + 1
      );
      setIsTransitioning(false);
    }, 150);
  };

  // Keyboard arrow navigation for showcase slides
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") {
        handlePrevSlide();
      } else if (e.key === "ArrowRight") {
        handleNextSlide();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const navLinks: { label: string; view: NavigationView; delay: string }[] = [
    { label: "Case Radar", view: "radar", delay: "100ms" },
    { label: "Evidence Matrix", view: "evidence", delay: "150ms" },
    { label: "Appeal Studio", view: "studio", delay: "200ms" },
    { label: "Payer Communications", view: "communications", delay: "250ms" },
    { label: "Portfolio Analytics", view: "analytics", delay: "300ms" },
  ];

  const Badge1Icon = slide.badge1.icon;
  const Badge2Icon = slide.badge2.icon;
  const Badge3Icon = slide.badge3.icon;

  return (
    <div className="h-screen h-[100dvh] w-screen overflow-hidden relative bg-black text-white font-sans select-none flex flex-col justify-between">
      {/* 1. Full-Screen Ambient Background Video (z-index 0) */}
      <div className="fixed inset-0 w-full h-full z-0 overflow-hidden pointer-events-none">
        <video
          src="https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260406_094145_4a271a6c-3869-4f1c-8aa7-aeb0cb227994.mp4"
          autoPlay
          loop
          muted
          playsInline
          className="w-full h-full object-cover"
        />
      </div>

      {/* 2. Bottom Optical Blur Overlay (no dark artificial gradient, pure backdrop-blur-xl masked) */}
      <div className="fixed inset-0 w-full h-full z-[1] pointer-events-none backdrop-blur-xl bottom-blur-mask" />

      {/* 3. Horizontal Navbar (z-index 50) */}
      <header className="relative z-50 px-4 sm:px-6 md:px-12 py-4 md:py-6 flex items-center justify-between">
        {/* Left: Brand Showcase Logo */}
        <div
          className="animate-blur-fade-up cursor-pointer"
          style={{ animationDelay: "0ms" }}
          onClick={() => onEnterConsole("radar")}
        >
          <BrandLogo size="lg" glow interactive />
        </div>

        {/* Center: Showcase Navigation Links (hidden below lg) */}
        <nav className="hidden lg:flex items-center gap-8">
          {navLinks.map((link) => (
            <button
              key={link.view}
              onClick={() => onEnterConsole(link.view)}
              className="animate-blur-fade-up text-sm text-gray-300 hover:text-white transition-colors cursor-pointer"
              style={{ animationDelay: link.delay }}
            >
              {link.label}
            </button>
          ))}
        </nav>

        {/* Right: Console Launch Actions */}
        <div className="flex items-center gap-3">
          {isAuthenticated ? (
            <>
              {/* Open Console Pill Button */}
              <button
                onClick={() => onEnterConsole("radar")}
                className="hidden sm:flex animate-blur-fade-up liquid-glass items-center gap-2 rounded-full px-4 md:px-5 py-2 text-sm text-white/90 hover:text-white transition-all cursor-pointer hover:bg-white/5 active:scale-95"
                style={{ animationDelay: "350ms" }}
              >
                <span>Sentinel Console</span>
                <Compass className="size-[18px] text-white/80" />
              </button>

              {/* User Profile Avatar */}
              <button
                onClick={() => onEnterConsole("radar")}
                className="hidden sm:flex animate-blur-fade-up size-10 rounded-full border border-white/20 items-center justify-center text-white/90 hover:text-white transition-all cursor-pointer overflow-hidden active:scale-95 bg-white/10"
                style={{ animationDelay: "400ms" }}
                title={`Signed in as ${userName}`}
              >
                <Avatar size="default" className="size-full border-0 bg-transparent">
                  {viewer?.image && <AvatarImage src={viewer.image} alt={userName} />}
                  <AvatarFallback className="text-xs font-semibold text-white/90">{userInitial}</AvatarFallback>
                </Avatar>
              </button>
            </>
          ) : (
            <>
              {/* Sign In Pill Button */}
              <button
                onClick={() => onEnterConsole("login")}
                className="hidden sm:flex animate-blur-fade-up liquid-glass items-center gap-1.5 rounded-full px-4 py-2 text-sm text-white/90 hover:text-white transition-all cursor-pointer hover:bg-white/5 active:scale-95"
                style={{ animationDelay: "320ms" }}
              >
                <User className="size-4 text-white/80" />
                <span>Sign In</span>
              </button>

              {/* Enter Console Pill Button */}
              <button
                onClick={() => onEnterConsole("login")}
                className="hidden sm:flex animate-blur-fade-up bg-white text-black hover:bg-gray-200 transition-all rounded-full font-medium px-4 md:px-5 py-2 text-sm flex items-center gap-2 shadow-lg active:scale-95 cursor-pointer"
                style={{ animationDelay: "350ms" }}
              >
                <span>Launch Sentinel</span>
                <Compass className="size-4" />
              </button>
            </>
          )}

          {/* Hamburger Menu Button (visible only below lg) */}
          <button
            onClick={() => setIsMobileMenuOpen((prev) => !prev)}
            className="lg:hidden animate-blur-fade-up liquid-glass w-10 h-10 rounded-full flex items-center justify-center text-white transition-all cursor-pointer hover:bg-white/5 active:scale-95 relative"
            style={{ animationDelay: "350ms" }}
            aria-label="Toggle Menu"
          >
            <div className="relative size-[18px] flex items-center justify-center">
              <List
                className={`size-[18px] absolute transition-all duration-500 ease-out ${
                  isMobileMenuOpen
                    ? "rotate-180 opacity-0 scale-50"
                    : "rotate-0 opacity-100 scale-100"
                }`}
              />
              <X
                className={`size-[18px] absolute transition-all duration-500 ease-out ${
                  isMobileMenuOpen
                    ? "rotate-0 opacity-100 scale-100"
                    : "-rotate-180 opacity-0 scale-50"
                }`}
              />
            </div>
          </button>
        </div>
      </header>

      {/* 4. Mobile Menu Dropdown (below lg breakpoint) */}
      <div
        className={`lg:hidden absolute top-[72px] inset-x-4 sm:inset-x-6 z-40 bg-gray-900/95 backdrop-blur-lg border-t border-b border-gray-800 shadow-2xl rounded-2xl p-4 transition-all duration-500 ease-out ${
          isMobileMenuOpen
            ? "translate-y-0 opacity-100 pointer-events-auto"
            : "-translate-y-4 opacity-0 pointer-events-none"
        }`}
      >
        <div className="flex flex-col space-y-1">
          {navLinks.map((link, idx) => (
            <button
              key={link.view}
              onClick={() => {
                setIsMobileMenuOpen(false);
                onEnterConsole(link.view);
              }}
              className="w-full text-left py-3 px-3 rounded-lg text-sm text-gray-200 hover:text-white hover:bg-gray-800/50 transition-colors flex items-center justify-between"
              style={{
                transitionDelay: `${idx * 50}ms`,
              }}
            >
              <span>{link.label}</span>
              <ArrowRight className="size-4 text-gray-500" />
            </button>
          ))}

          {/* Below sm Launch Console & Sign In button in dropdown */}
          <div className="sm:hidden pt-3 mt-2 border-t border-gray-800 flex flex-col gap-2">
            <button
              onClick={() => {
                setIsMobileMenuOpen(false);
                onEnterConsole("radar");
              }}
              className="w-full liquid-glass rounded-full py-2.5 px-4 text-xs font-medium flex items-center justify-center gap-2 text-white hover:bg-white/5"
            >
              <Compass className="size-4" />
              <span>Launch Sentinel Console</span>
            </button>
            <button
              onClick={() => {
                setIsMobileMenuOpen(false);
                onEnterConsole("login");
              }}
              className="w-full bg-white text-black rounded-full py-2.5 px-4 text-xs font-semibold flex items-center justify-center gap-2 hover:bg-gray-200"
            >
              <User className="size-4 text-black" />
              <span>Sign In / Create Account</span>
            </button>
          </div>
        </div>
      </div>

      {/* 5. Showcase Hero Content (Bottom of viewport, z-index 10) */}
      <main className="flex-1 flex flex-col justify-end px-4 sm:px-6 md:px-12 pb-8 md:pb-16 z-10">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-8">
          {/* Left Side: Metadata, Title, Description, Showcase CTAs */}
          <div
            className={`flex-1 transition-opacity duration-200 ${
              isTransitioning ? "opacity-40" : "opacity-100"
            }`}
          >
            {/* Metadata Row */}
            <div
              className="animate-blur-fade-up flex flex-wrap items-center gap-3 sm:gap-6 mb-6 md:mb-8 text-xs sm:text-sm text-gray-300"
              style={{ animationDelay: "300ms" }}
            >
              {/* Badge 1 */}
              <div className="flex items-center gap-1.5 font-medium text-white">
                <Badge1Icon className="size-4 sm:size-5 fill-white text-white" />
                <span>{slide.badge1.label}</span>
              </div>

              {/* Badge 2 */}
              <div className="flex items-center gap-1.5 text-gray-300">
                <Badge2Icon className="size-4" />
                <span>{slide.badge2.label}</span>
              </div>

              {/* Badge 3 */}
              <div className="flex items-center gap-1.5 text-gray-300">
                <Badge3Icon className="size-4" />
                <span>{slide.badge3.label}</span>
              </div>
            </div>

            {/* Main Title */}
            <h1
              className="animate-blur-fade-up text-3xl sm:text-5xl md:text-6xl lg:text-7xl font-normal tracking-[-0.04em] mb-4 md:mb-6 text-white leading-[1.08] max-w-4xl"
              style={{ animationDelay: "400ms" }}
            >
              {slide.title}
            </h1>

            {/* Description Subtitle */}
            <p
              className="animate-blur-fade-up text-base sm:text-lg md:text-xl text-gray-400 mb-6 md:mb-12 max-w-2xl leading-relaxed font-light"
              style={{ animationDelay: "500ms" }}
            >
              {slide.description}
            </p>

            {/* Showcase CTA Buttons Row */}
            <div className="flex flex-wrap items-center gap-3 sm:gap-4">
              {/* Primary Solid White Showcase CTA Button */}
              <button
                onClick={() => onEnterConsole(slide.targetView)}
                className="animate-blur-fade-up bg-white text-black hover:bg-gray-200 transition-all rounded-full font-medium px-6 sm:px-8 py-2.5 sm:py-3 text-sm sm:text-base flex items-center gap-2.5 shadow-xl hover:shadow-white/20 active:scale-95 cursor-pointer"
                style={{ animationDelay: "600ms" }}
              >
                <Play className="size-[18px] fill-black text-black" />
                <span>{slide.primaryCtaText}</span>
              </button>

              {/* Secondary Liquid Glass Showcase CTA Button */}
              <button
                onClick={() => onEnterConsole(slide.targetView)}
                className="animate-blur-fade-up liquid-glass text-white rounded-full font-medium px-6 sm:px-8 py-2.5 sm:py-3 text-sm sm:text-base flex items-center gap-2 hover:bg-white/5 transition-all active:scale-95 cursor-pointer"
                style={{ animationDelay: "700ms" }}
              >
                <span>{slide.secondaryCtaText}</span>
                <ArrowRight className="size-4" />
              </button>
            </div>
          </div>

          {/* Right Side: Showcase Navigation Arrows & Slide Indicators */}
          <div className="flex flex-col items-start md:items-end gap-3 shrink-0">
            {/* Slide Index Counter */}
            <div
              className="animate-blur-fade-up text-xs font-mono text-gray-400 tracking-wider flex items-center gap-2"
              style={{ animationDelay: "750ms" }}
            >
              <span className="text-white font-medium">0{currentSlideIndex + 1}</span>
              <span>/</span>
              <span>0{HERO_SLIDES.length}</span>
              <div className="flex items-center gap-1 ml-2">
                {HERO_SLIDES.map((_, i) => (
                  <div
                    key={i}
                    onClick={() => setCurrentSlideIndex(i)}
                    className={`h-1.5 rounded-full transition-all cursor-pointer ${
                      currentSlideIndex === i ? "w-5 bg-white" : "w-1.5 bg-white/30"
                    }`}
                  />
                ))}
              </div>
            </div>

            {/* Prev / Next Showcase Navigation Pill Buttons */}
            <div className="flex items-center gap-2">
              <button
                onClick={handlePrevSlide}
                className="animate-blur-fade-up liquid-glass rounded-full px-4 sm:px-6 py-2.5 sm:py-3 flex items-center gap-1.5 text-sm text-white hover:bg-white/5 transition-all active:scale-95 cursor-pointer"
                style={{ animationDelay: "800ms" }}
                aria-label="Previous Slide"
              >
                <CaretLeft className="size-4" />
                <span>Previous</span>
              </button>

              <button
                onClick={handleNextSlide}
                className="animate-blur-fade-up liquid-glass rounded-full px-4 sm:px-6 py-2.5 sm:py-3 flex items-center gap-1.5 text-sm text-white hover:bg-white/5 transition-all active:scale-95 cursor-pointer"
                style={{ animationDelay: "900ms" }}
                aria-label="Next Slide"
              >
                <span>Next</span>
                <CaretRight className="size-4" />
              </button>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};
