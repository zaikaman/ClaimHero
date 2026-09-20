import { useState } from "react";
import {
  ArrowRight,
  Buildings,
  CheckCircle,
  Clock,
  Compass,
  Envelope,
  FileText,
  List,
  MagnifyingGlass,
  Scales,
  ShieldCheck,
  X,
} from "@phosphor-icons/react";
import { NavigationView } from "../layout/Sidebar";
import { GlobalDisclaimer } from "../common/GlobalDisclaimer";
import { useCurrentUser } from "../../hooks/useCurrentUser";

export interface TemplateLandingProps {
  onEnterConsole: (view?: NavigationView) => void;
  isAuthenticated?: boolean;
}

const NAV_LINKS = [
  { label: "Workspace", href: "#workspace" },
  { label: "Denials", href: "#denials" },
  { label: "Demo", href: "#demo" },
  { label: "Trust", href: "#trust" },
] as const;

const HERO_STATS = [
  { label: "Denied each year", value: "1.5B claims" },
  { label: "Care denied", value: "$200B" },
  { label: "Appealed with evidence", value: "70% overturned" },
  { label: "Patients who appeal", value: "<1%" },
] as const;

const WORKSPACE_CARDS = [
  {
    icon: MagnifyingGlass,
    title: "Case Radar",
    body: "Every denial in one deadline-first queue with live status, disputed amounts, and a statutory countdown that shifts as the clock runs.",
    points: [
      "ERISA, ACA, and state clocks anchored to the denial date",
      "Payer breakdown with CSV and JSON export",
      "Anonymous demo case ready in one click",
    ],
    cta: "Open My Cases",
    targetView: "radar" as NavigationView,
  },
  {
    icon: Buildings,
    title: "Evidence Matrix",
    body: "Your denial language next to the insurer's published policy clause, scored across four pillars so missing proof is named, not guessed.",
    points: [
      "CPB 35 / documentation 25 / ERISA 20 / precedent 20",
      "Capped at 40 when evidence runs thin",
      "Vector-matched overturned precedents",
    ],
    cta: "See the proof",
    targetView: "evidence" as NavigationView,
  },
  {
    icon: Scales,
    title: "Appeal Studio",
    body: "An editable brief where every key sentence traces to a stored clause, study, statute, or precedent, with three escalation tiers.",
    points: [
      "Versioned drafts with citation sidebar",
      "Level 1 internal through external review",
      "Printable court-ready dossier binder",
    ],
    cta: "Open your letter",
    targetView: "studio" as NavigationView,
  },
  {
    icon: Envelope,
    title: "AgentMail Inbox",
    body: "A dedicated inbox per claim. Packets wait for your approval, payer replies route back to the same case with delivery evidence.",
    points: [
      "Nothing sends without human approval",
      "Inbound determination detection",
      "ERISA delivery evidence record",
    ],
    cta: "Track a reply",
    targetView: "communications" as NavigationView,
  },
] as const;

const DENIAL_CARDS = [
  { icon: Clock, label: "ERISA Deadline Defense" },
  { icon: Buildings, label: "High-Dollar EOB Review" },
  { icon: Scales, label: "P2P Physician Reviews" },
] as const;

const ARTIFACTS = [
  {
    image: "/artifacts/cited-appeal-brief.jpg",
    title: "Cited Appeal Brief",
    body: "Grounded paragraphs with clause-level citations, not template filler.",
  },
  {
    image: "/artifacts/p2p-defense-script.jpg",
    title: "P2P Defense Script",
    body: "A three-minute tele-script plus live call copilot for physician reviews.",
  },
  {
    image: "/artifacts/delivery-evidence-report.jpg",
    title: "Delivery Evidence Report",
    body: "Message IDs, delivery receipts, and DNS proof of electronic service.",
  },
  {
    image: "/artifacts/dossier-binder.jpg",
    title: "Dossier Binder",
    body: "Cover, statutory summary, exhibit index, and attestation in one packet.",
  },
] as const;

const STACK_STRIP = [
  { name: "Convex", role: "Reactive system of record" },
  { name: "Firecrawl", role: "Live policy discovery" },
  { name: "OpenAI", role: "Structured reasoning" },
  { name: "AgentMail", role: "Two-way correspondence" },
] as const;

const JUDGE_STEPS = [
  "Open the live app and choose Explore as Anonymous Advocate.",
  "Open the Eleanor Vance case.",
  "Follow Your proof, Your letter, then Send and track.",
  "Inspect citations, evidence score, audit trail, and the approval gate.",
] as const;

/**
 * Editorial landing page for ClaimHero, structured on the approved
 * black-and-white template: fixed nav, serif hero with stat row, about,
 * workspace cards, divider, denial grid, live demo, artifacts, trust,
 * start CTA, and footer. Sharp corners and uppercase labels throughout.
 */
export function TemplateLanding({
  onEnterConsole,
  isAuthenticated: propIsAuthenticated,
}: TemplateLandingProps) {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const userContext = useCurrentUser();

  const isAuthenticated = propIsAuthenticated ?? userContext.isAuthenticated;

  return (
    <div className="relative z-10 w-full text-white antialiased selection:bg-white selection:text-black">
      {/* Navigation */}
      <nav className="sticky top-0 z-50 w-full border-b border-white/20 bg-black/80 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-6">
          <a
            href="#top"
            className="font-serif text-xl font-medium uppercase tracking-widest text-white"
          >
            ClaimHero
          </a>

          <div className="hidden items-center space-x-8 text-sm font-medium text-slate-500 md:flex">
            {NAV_LINKS.map((link) => (
              <a
                key={link.href}
                href={link.href}
                className="transition-colors hover:text-slate-100"
              >
                {link.label}
              </a>
            ))}
          </div>

          {isAuthenticated ? (
            <div className="hidden items-center md:flex">
              <button
                type="button"
                onClick={() => onEnterConsole("radar")}
                className="flex items-center gap-2 border border-white bg-transparent px-6 py-2 text-xs font-medium uppercase tracking-widest text-white transition-colors hover:bg-white hover:text-black cursor-pointer"
              >
                <Compass className="size-3.5 shrink-0" />
                <span>Open Workspace</span>
              </button>
            </div>
          ) : (
            <div className="hidden items-center gap-3 md:flex">
              <button
                type="button"
                onClick={() => onEnterConsole("login")}
                className="text-xs font-medium uppercase tracking-widest text-slate-400 transition-colors hover:text-white cursor-pointer"
              >
                Sign In
              </button>
              <button
                type="button"
                onClick={() => onEnterConsole("radar")}
                className="flex items-center gap-2 border border-white bg-transparent px-6 py-2 text-xs font-medium uppercase tracking-widest text-white transition-colors hover:bg-white hover:text-black cursor-pointer"
              >
                <span>Launch Sentinel</span>
              </button>
            </div>
          )}

          <button
            type="button"
            className="text-slate-100 md:hidden cursor-pointer"
            aria-label="Toggle menu"
            aria-expanded={isMobileMenuOpen}
            onClick={() => setIsMobileMenuOpen((prev) => !prev)}
          >
            <span className="relative flex size-6 items-center justify-center">
              <List
                className={`size-6 absolute transition-all duration-300 ${
                  isMobileMenuOpen ? "rotate-180 opacity-0" : "rotate-0 opacity-100"
                }`}
              />
              <X
                className={`size-6 absolute transition-all duration-300 ${
                  isMobileMenuOpen ? "rotate-0 opacity-100" : "-rotate-180 opacity-0"
                }`}
              />
            </span>
          </button>
        </div>

        {/* Collapsible mobile menu: grid-rows animation reserves zero layout
            height when closed (opacity alone would leave an invisible block
            pushing the hero down on phones). */}
        <div
          className={`md:hidden grid transition-[grid-template-rows,opacity,visibility] duration-300 ease-out ${
            isMobileMenuOpen
              ? "grid-rows-[1fr] opacity-100 visible"
              : "grid-rows-[0fr] opacity-0 invisible pointer-events-none"
          }`}
          aria-hidden={!isMobileMenuOpen}
        >
          <div className="overflow-hidden min-h-0">
            <div className="border-t border-white/10 px-6">
              <div className="flex flex-col py-4">
                {NAV_LINKS.map((link) => (
                  <a
                    key={link.href}
                    href={link.href}
                    onClick={() => setIsMobileMenuOpen(false)}
                    className="flex items-center justify-between py-3 text-sm text-gray-200 transition-colors hover:text-white"
                  >
                    <span>{link.label}</span>
                    <ArrowRight className="size-4 text-gray-500" />
                  </a>
                ))}
                {isAuthenticated ? (
                  <div className="mt-2 flex flex-col gap-2 border-t border-white/10 pt-4">
                    <button
                      type="button"
                      onClick={() => {
                        setIsMobileMenuOpen(false);
                        onEnterConsole("radar");
                      }}
                      className="flex w-full items-center justify-center gap-2 border border-white bg-transparent px-4 py-2.5 text-xs font-medium uppercase tracking-widest text-white hover:bg-white hover:text-black cursor-pointer"
                    >
                      <Compass className="size-4" />
                      <span>Open Workspace</span>
                    </button>
                  </div>
                ) : (
                  <div className="mt-2 flex flex-col gap-2 border-t border-white/10 pt-4">
                    <button
                      type="button"
                      onClick={() => {
                        setIsMobileMenuOpen(false);
                        onEnterConsole("radar");
                      }}
                      className="flex w-full items-center justify-center gap-2 border border-white bg-transparent px-4 py-2.5 text-xs font-medium uppercase tracking-widest text-white cursor-pointer"
                    >
                      <Compass className="size-4" />
                      <span>Launch Sentinel</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setIsMobileMenuOpen(false);
                        onEnterConsole("login");
                      }}
                      className="flex w-full items-center justify-center gap-2 bg-white px-4 py-2.5 text-xs font-bold uppercase tracking-widest text-black hover:bg-gray-200 cursor-pointer"
                    >
                      <span>Sign In</span>
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section id="top" className="relative overflow-hidden pb-20 pt-24 md:pb-32 md:pt-36">
        <div className="relative z-10 mx-auto max-w-7xl px-6">
          <div className="mb-6 inline-flex items-center gap-2 border border-white bg-transparent px-4 py-1.5 text-xs uppercase tracking-widest text-white">
            <span className="h-2 w-2 rounded-full bg-blue-500" />
            Evidence-Grounded Appeal Workspace
          </div>

          <h1 className="mb-8 max-w-4xl font-serif text-5xl font-medium leading-[1.1] tracking-tighter text-white md:text-7xl lg:text-8xl">
            Fight the denial. <br />
            <span className="font-medium italic text-white">Keep your coverage.</span>
          </h1>

          <p className="mb-10 max-w-2xl text-lg leading-relaxed text-white/80 md:text-xl">
            ClaimHero turns a denial letter into a cited, dispatch-ready appeal:
            the insurer&apos;s own policy, your clinical evidence, and every
            statutory deadline in one workspace.
          </p>

          <div className="flex flex-col gap-4 sm:flex-row">
            <a
              href="#workspace"
              className="inline-flex items-center justify-center gap-2 bg-white px-8 py-4 text-sm font-bold uppercase tracking-widest text-black transition-all hover:bg-gray-200"
            >
              See How It Works
              <ArrowRight className="size-4" />
            </a>
            <button
              type="button"
              onClick={() => onEnterConsole("radar")}
              className="inline-flex items-center justify-center gap-2 bg-[#1a1a1a] px-8 py-4 text-sm font-bold uppercase tracking-widest text-white transition-all hover:bg-[#2a2a2a] cursor-pointer"
            >
              {isAuthenticated ? "Open Workspace" : "Launch Sentinel"}
            </button>
          </div>

          <div className="mt-20 grid grid-cols-2 gap-8 border-t border-white/20 pt-10 md:grid-cols-4">
            {HERO_STATS.map((stat) => (
              <div key={stat.label} className="flex flex-col text-right">
                <p className="order-1 mb-2 text-xs uppercase tracking-widest text-white/60">
                  {stat.label}
                </p>
                <p className="order-2 font-serif text-3xl italic tracking-tight text-white tabular-nums md:text-4xl lg:text-5xl">
                  {stat.value}
                </p>
              </div>
            ))}
          </div>
        </div>

        <div className="absolute right-0 top-0 -z-0 h-full w-1/2 bg-gradient-to-br from-blue-600 to-blue-400 opacity-50" />
      </section>

      {/* About */}
      <section id="about" className="border-y border-white/20 bg-black pb-24 pt-24">
        <div className="mx-auto max-w-7xl px-6">
          <div className="grid items-start gap-16 md:grid-cols-2">
            <div>
              <h2 className="mb-6 font-serif text-3xl font-medium tracking-tight text-white">
                Built on Evidence, Driven by Deadlines.
              </h2>
              <p className="mb-6 font-light leading-relaxed text-white/70">
                Insurers deny care citing short codes while the real criteria sit
                buried in hundred-page policy bulletins. Patients face strict
                appeal clocks measured from the denial date, and almost no one
                appeals even though cited appeals overturn most denials.
              </p>
              <p className="font-light leading-relaxed text-white/70">
                ClaimHero carries the administrative load end to end: extract the
                denial, crawl the live policy, score the evidence honestly, draft
                a cited brief, and stage it for your approval before anything is
                sent.
              </p>

              <div className="mt-8 grid grid-cols-2 gap-4">
                <div className="flex items-center gap-3">
                  <div className="bg-[#1a1a1a] p-2 text-white">
                    <Buildings className="size-5" />
                  </div>
                  <span className="text-sm font-medium text-white/80">
                    Insurer&apos;s Own Rules
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <div className="bg-[#1a1a1a] p-2 text-white">
                    <Clock className="size-5" />
                  </div>
                  <span className="text-sm font-medium text-white/80">
                    Deadline-First Queue
                  </span>
                </div>
              </div>
            </div>

            <div className="grid gap-6">
              <div className="border border-white/20 bg-[#1a1a1a] p-6 transition-colors hover:border-white/40">
                <MagnifyingGlass className="mb-4 size-7 text-white" />
                <h3 className="mb-2 text-lg font-medium tracking-tight text-white">
                  Vision
                </h3>
                <p className="text-sm leading-relaxed text-white/70">
                  A future where no winnable denial stands because the paperwork
                  outlasted the patient, and every appeal answers the
                  payer&apos;s own published rules.
                </p>
              </div>
              <div className="border border-white/20 bg-[#1a1a1a] p-6 transition-colors hover:border-white/40">
                <ShieldCheck className="mb-4 size-7 text-white" />
                <h3 className="mb-2 text-lg font-medium tracking-tight text-white">
                  Mission
                </h3>
                <p className="text-sm leading-relaxed text-white/70">
                  Give denial teams and self-advocates a cited, deadline-safe
                  appeal packet for every case, with a human approving every
                  send.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Workspace */}
      <section id="workspace" className="bg-black pb-24 pt-24">
        <div className="mx-auto max-w-7xl px-6">
          <div className="mb-16">
            <h2 className="mb-4 font-serif text-3xl font-medium tracking-tight text-white md:text-4xl">
              The Workspace
            </h2>
            <p className="max-w-2xl font-light text-white/70">
              Four surfaces on the same claim. Deadlines, evidence, drafts, and
              correspondence update together in real time.
            </p>
          </div>

          <div className="grid gap-6 md:grid-cols-2">
            {WORKSPACE_CARDS.map((card) => (
              <div
                key={card.title}
                className="group border border-white/20 bg-[#1a1a1a] p-8 transition-all duration-300 hover:border-white/40 hover:shadow-lg"
              >
                <div className="mb-6 flex h-12 w-12 items-center justify-center bg-black text-white">
                  <card.icon className="size-6" />
                </div>
                <h3 className="mb-3 font-serif text-xl font-medium tracking-tight text-white">
                  {card.title}
                </h3>
                <p className="mb-6 text-sm leading-relaxed text-white/70">
                  {card.body}
                </p>
                <ul className="mb-6 space-y-2">
                  {card.points.map((point) => (
                    <li
                      key={point}
                      className="flex items-start gap-2 font-mono text-xs tabular-nums text-white/60"
                    >
                      <CheckCircle className="mt-0.5 size-4 shrink-0 text-white/40" />
                      {point}
                    </li>
                  ))}
                </ul>
                <button
                  type="button"
                  onClick={() => onEnterConsole(card.targetView)}
                  className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-white transition-colors hover:text-gray-300"
                >
                  <span>{card.cta}</span>
                  <ArrowRight className="size-4" />
                </button>
              </div>
            ))}
          </div>

          <div className="mt-6 grid grid-cols-2 gap-px border border-white/20 bg-white/20 lg:grid-cols-4">
            {STACK_STRIP.map((item) => (
              <div key={item.name} className="bg-black px-6 py-5">
                <p className="text-sm font-medium uppercase tracking-wider text-white">
                  {item.name}
                </p>
                <p className="mt-1 text-xs text-white/60">{item.role}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Divider */}
      <section className="relative flex h-96 w-full items-center justify-center overflow-hidden bg-[#1a1a1a]">
        <img
          src="https://images.unsplash.com/photo-1451187580459-43490279c0fa?q=80&w=3840&auto=format&fit=crop"
          alt="Appeal infrastructure"
          loading="lazy"
          className="absolute inset-0 h-full w-full object-cover opacity-20 mix-blend-screen"
        />
        <div className="relative z-10 px-6 text-center">
          <h2 className="mb-4 font-serif text-3xl font-medium tracking-tight text-white md:text-5xl">
            Built for the Appeal That Matters.
          </h2>
          <p className="mx-auto max-w-xl text-lg font-light text-white/70">
            Cited evidence, honest scoring, and review-gated dispatch, so your
            case never sleeps and never misses its clock.
          </p>
        </div>
      </section>

      {/* Denials */}
      <section id="denials" className="bg-black pb-24 pt-24">
        <div className="mx-auto max-w-7xl px-6">
          <div className="mb-16">
            <h2 className="mb-2 font-serif text-3xl font-medium tracking-tight text-white">
              Fights We Take On
            </h2>
            <p className="font-light text-white/70">
              Deadline clocks, high-dollar bills, and physician reviews, each
              answered with sourced proof.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {DENIAL_CARDS.map((item) => (
              <div
                key={item.label}
                className="flex flex-col items-center gap-3 border border-white/20 bg-[#1a1a1a] px-6 py-6 text-center transition-colors hover:border-white/40"
              >
                <item.icon className="size-8 text-white" />
                <span className="text-sm font-medium uppercase tracking-wider text-white">
                  {item.label}
                </span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Demo */}
      <section id="demo" className="border-t border-white/20 bg-black pb-24 pt-24">
        <div className="mx-auto max-w-7xl px-6">
          <div className="mb-16">
            <div className="mb-6 inline-flex items-center gap-2 border border-white/20 bg-[#1a1a1a] px-3 py-1 text-xs uppercase tracking-widest text-white">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.8)]" />
              Live Demo
            </div>
            <h2 className="mb-6 font-serif text-3xl font-medium tracking-tight text-white md:text-5xl">
              Experience the Workspace.
            </h2>
            <p className="max-w-2xl text-lg font-light leading-relaxed text-white/70">
              See exactly what an advocate sees. Open the seeded case or ingest a
              denial, no setup, no commitment.
            </p>
          </div>

          <div className="grid items-stretch gap-6 md:grid-cols-2">
            <div className="flex flex-col border border-white/20 bg-[#1a1a1a] p-8 transition-all duration-300 hover:border-white/40 hover:shadow-lg">
              <div className="mb-4 flex items-center gap-2">
                <span className="h-2 w-2 animate-pulse rounded-full bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.8)]" />
                <span className="text-xs font-medium uppercase tracking-widest text-white/60">
                  Seeded Demo Case
                </span>
              </div>
              <h3 className="mb-4 font-serif text-2xl font-medium tracking-tight text-white">
                Eleanor Vance
              </h3>
              <p className="mb-8 flex-grow text-sm leading-relaxed text-white/70">
                A synthetic high-dollar denial with extracted codes, policy
                evidence, a cited draft, and an approval gate, visibly labelled
                with no real patient data.
              </p>
              <button
                type="button"
                onClick={() => onEnterConsole("evidence")}
                className="inline-flex w-full items-center justify-center gap-2 border border-white/20 bg-black px-8 py-4 text-center text-xs font-bold uppercase tracking-widest text-white transition-all hover:bg-white hover:text-black"
              >
                Open the Demo Case
                <ArrowRight className="size-4" />
              </button>
            </div>

            <div className="flex flex-col border border-white/20 bg-[#1a1a1a] p-8 transition-all duration-300 hover:border-white/40 hover:shadow-lg">
              <div className="mb-4 flex items-center gap-2">
                <span className="h-2 w-2 animate-pulse rounded-full bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.8)]" />
                <span className="text-xs font-medium uppercase tracking-widest text-white/60">
                  Your Document
                </span>
              </div>
              <h3 className="mb-4 font-serif text-2xl font-medium tracking-tight text-white">
                Your Denial Letter
              </h3>
              <p className="mb-8 flex-grow text-sm leading-relaxed text-white/70">
                Upload a PDF or image, or paste denial text. Extraction runs in
                the browser first, identifiers are redacted before any model
                call.
              </p>
              <button
                type="button"
                onClick={() => onEnterConsole("radar")}
                className="inline-flex w-full items-center justify-center gap-2 border border-white/20 bg-black px-8 py-4 text-center text-xs font-bold uppercase tracking-widest text-white transition-all hover:bg-white hover:text-black"
              >
                Ingest a Denial
                <ArrowRight className="size-4" />
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* Artifacts */}
      <section id="artifacts" className="border-t border-white/20 bg-black pb-24 pt-24">
        <div className="mx-auto max-w-7xl px-6">
          <h2 className="mb-3 font-serif text-3xl font-medium tracking-tight text-white">
            Your Appeal Packet
          </h2>
          <p className="mb-12 max-w-2xl font-light text-white/70">
            Send-ready documents you leave with, each one cited, review-gated,
            and backed by stored proof.
          </p>

          <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-4">
            {ARTIFACTS.map((item) => (
              <article key={item.title}>
                <div className="mb-4 h-40 bg-slate-800 bg-cover bg-center opacity-80 mix-blend-luminosity transition-opacity hover:opacity-100">
                  <img
                    src={item.image}
                    alt={item.title}
                    loading="lazy"
                    className="h-full w-full object-cover"
                  />
                </div>
                <h4 className="mt-4 text-sm font-medium uppercase tracking-wider text-white">
                  {item.title}
                </h4>
                <p className="mt-2 text-xs leading-relaxed text-white/70">
                  {item.body}
                </p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* Trust */}
      <section id="trust" className="border-t border-white/20 bg-black py-24">
        <div className="mx-auto flex max-w-7xl flex-col items-center gap-16 px-6 md:flex-row">
          <div className="w-full md:w-1/2">
            <div className="mb-4 inline-block border border-white/20 bg-[#1a1a1a] px-3 py-1 text-xs font-medium uppercase tracking-widest text-white">
              Human Approval Gate
            </div>
            <h2 className="mb-6 font-serif text-3xl font-medium tracking-tight text-slate-100">
              AI Prepares. You Approve.
            </h2>
            <p className="mb-8 font-light leading-relaxed text-slate-500">
              Every brief, recipient, and outbound message waits for explicit
              human review. Thin evidence caps the score and forces
              acknowledgment before dispatch.
            </p>

            <ul className="space-y-4">
              <li className="flex items-center gap-3 border border-white/20 bg-[#1a1a1a] p-4">
                <ShieldCheck className="size-6 shrink-0 text-slate-100" />
                <div>
                  <p className="text-sm font-medium text-slate-100">
                    De-identified Reasoning
                  </p>
                  <p className="text-xs text-slate-500">
                    Browser-first extraction, redaction before any model call
                  </p>
                </div>
              </li>
              <li className="flex items-center gap-3 border border-white/20 bg-[#1a1a1a] p-4">
                <CheckCircle className="size-6 shrink-0 text-slate-100" />
                <div>
                  <p className="text-sm font-medium text-slate-100">
                    Review-Gated Dispatch
                  </p>
                  <p className="text-xs text-slate-500">
                    AI recommends, a human sends, every time
                  </p>
                </div>
              </li>
            </ul>
          </div>
          <div className="relative w-full md:w-1/2">
            <div className="relative aspect-square overflow-hidden border border-white/20 bg-slate-900">
              <img
                src="https://images.unsplash.com/photo-1497366216548-37526070297c?q=80&w=2069&auto=format&fit=crop"
                className="h-full w-full object-cover opacity-70 mix-blend-luminosity"
                alt="Denial team workspace"
                loading="lazy"
              />
              <div className="absolute inset-0 bg-gradient-to-br from-blue-900/50 to-blue-500/30" />
              <div className="absolute bottom-6 left-6 text-white">
                <p className="text-lg font-medium">Review-Gated Dispatch</p>
                <p className="text-sm opacity-80">
                  Nothing leaves the workspace without you
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Start */}
      <section id="start" className="border-t border-white/20 bg-black py-24 text-white">
        <div className="mx-auto grid max-w-7xl gap-16 px-6 md:grid-cols-2">
          <div>
            <h2 className="mb-6 font-serif text-3xl font-medium tracking-tight text-white md:text-4xl">
              Start Your Appeal.
            </h2>
            <p className="mb-10 text-lg font-light text-white/70">
              Open the workspace and follow the 60-second path before your clock
              runs down.
            </p>

            <div className="space-y-6">
              <div className="flex items-center gap-4">
                <Compass className="size-5 text-white/70" />
                <div>
                  <h4 className="mb-1 text-sm font-medium uppercase tracking-widest text-white">
                    Live App
                  </h4>
                  <button
                    type="button"
                    onClick={() => onEnterConsole("radar")}
                    className="text-sm text-white/70 transition-colors hover:text-white"
                  >
                    Open ClaimHero and explore as Anonymous Advocate
                  </button>
                </div>
              </div>

              <div className="flex items-center gap-4">
                <FileText className="size-5 text-white/70" />
                <div>
                  <h4 className="mb-1 text-sm font-medium uppercase tracking-widest text-white">
                    Demo Video
                  </h4>
                  <a
                    href="https://www.youtube.com/watch?v=M04LMuJRilg"
                    target="_blank"
                    rel="noreferrer"
                    className="text-sm text-white/70 transition-colors hover:text-white"
                  >
                    Watch the 3-minute walkthrough
                  </a>
                </div>
              </div>
            </div>
          </div>

          <div className="border border-white/20 bg-[#1a1a1a] p-8">
            <h3 className="mb-6 font-serif text-xl font-medium tracking-tight text-white">
              Your 60-Second Path
            </h3>
            <ol className="space-y-4">
              {JUDGE_STEPS.map((step, index) => (
                <li key={step} className="flex items-start gap-3">
                  <span className="font-mono text-xs tabular-nums text-white/50">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <span className="text-sm leading-relaxed text-white/80">
                    {step}
                  </span>
                </li>
              ))}
            </ol>
            <button
              type="button"
              onClick={() => onEnterConsole("radar")}
              className="mt-8 w-full bg-white py-4 text-sm font-bold uppercase tracking-widest text-black transition-colors hover:bg-gray-200 cursor-pointer"
            >
              {isAuthenticated ? "Open Workspace" : "Launch Sentinel"}
            </button>
            {!isAuthenticated && (
              <button
                type="button"
                onClick={() => onEnterConsole("login")}
                className="mt-3 w-full border border-white/20 bg-transparent py-4 text-sm font-bold uppercase tracking-widest text-white transition-colors hover:bg-white hover:text-black cursor-pointer"
              >
                Sign In
              </button>
            )}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-white/20 bg-black py-12">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-6 px-6 md:flex-row">
          <p className="text-sm uppercase tracking-widest text-white/50">
            2026 ClaimHero. All rights reserved.
          </p>
          <div className="flex gap-6">
            <a
              href="#top"
              className="text-sm uppercase tracking-widest text-white/50 transition-colors hover:text-white"
            >
              Top
            </a>
            <a
              href="#workspace"
              className="text-sm uppercase tracking-widest text-white/50 transition-colors hover:text-white"
            >
              Workspace
            </a>
          </div>
        </div>
        <div className="mx-auto mt-8 max-w-7xl px-6">
          <GlobalDisclaimer variant="footer" className="rounded-none" />
        </div>
      </footer>
    </div>
  );
}
