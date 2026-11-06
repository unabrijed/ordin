import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  ArrowUpRight,
  Plus,
  Minus,
  Menu,
  X,
  RotateCcw,
  Pause,
  Play,
  Check,
} from "lucide-react";
import "./styles.css";
import { ImmersiveHero } from "./ImmersiveHero";

function Logo() {
  return (
    <a className="logo" href="#home" aria-label="Ordin home">
      <svg viewBox="0 0 40 40" aria-hidden="true">
        <path
          d="M20 4a16 16 0 1 0 16 16"
          fill="none"
          stroke="currentColor"
          strokeWidth="8"
        />
        <path d="M24 4h12v12H24z" fill="currentColor" />
      </svg>
      ordin<span>®</span>
    </a>
  );
}
function Star({ className = "" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 100 100" aria-hidden="true">
      <path
        d="m50 0 9 31 26-16-16 26 31 9-31 9 16 26-26-16-9 31-9-31-26 16 16-26L0 50l31-9-16-26 26 16Z"
        fill="currentColor"
      />
    </svg>
  );
}
function Coin({ x = 0, y = 0 }: { x?: number; y?: number }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <ellipse
        cx="0"
        cy="0"
        rx="26"
        ry="29"
        fill="#81cba5"
        stroke="#142b40"
        strokeWidth="2.5"
      />
      <ellipse
        cx="-5"
        cy="-2"
        rx="24"
        ry="28"
        fill="#d2fa90"
        stroke="#142b40"
        strokeWidth="2.5"
      />
      <path
        d="M-15-13H5M-5-13v25M-15-4Q-5 3 5-4"
        fill="none"
        stroke="#142b40"
        strokeWidth="3.5"
        strokeLinecap="round"
      />
    </g>
  );
}
function WalletArt() {
  return (
    <g>
      <path
        d="M27 52 160 19q17-4 20 12l8 45"
        fill="#8ca3c4"
        stroke="#142b40"
        strokeWidth="3"
      />
      <path
        d="m43 48 111-22 5 32"
        fill="#f6f2e8"
        stroke="#142b40"
        strokeWidth="3"
      />
      <rect
        x="20"
        y="53"
        width="178"
        height="129"
        rx="25"
        fill="#a9bbe0"
        stroke="#142b40"
        strokeWidth="3"
      />
      <path
        d="M33 68h143M34 166h144"
        fill="none"
        stroke="#6e87ad"
        strokeWidth="2"
        strokeDasharray="4 5"
      />
      <path
        d="M156 94h49v47h-49q-23-24 0-47"
        fill="#d4dff4"
        stroke="#142b40"
        strokeWidth="3"
      />
      <circle cx="163" cy="117" r="6" fill="#142b40" />
      <path
        d="M63 107v9m30-9v9m-29 15q16 13 30 0"
        fill="none"
        stroke="#142b40"
        strokeWidth="4"
        strokeLinecap="round"
      />
      <path
        d="m30 185-7 14m147-14 12 14"
        stroke="#142b40"
        strokeWidth="4"
        strokeLinecap="round"
      />
    </g>
  );
}
function ShopArt() {
  return (
    <g>
      <path
        d="M22 82h159v110H22z"
        fill="#f5efe1"
        stroke="#142b40"
        strokeWidth="3"
      />
      <path
        d="M16 42h172l16 43H0z"
        fill="#d2fa90"
        stroke="#142b40"
        strokeWidth="3"
      />
      <path
        d="M45 43 36 85m43-42-4 42m37-42 4 42m29-42 10 42"
        stroke="#142b40"
        strokeWidth="3"
      />
      <path
        d="M0 85q18 29 36 0 20 29 39 0 20 29 41 0 19 29 39 0 26 29 49 0"
        fill="#b8df7f"
        stroke="#142b40"
        strokeWidth="3"
      />
      <rect
        x="41"
        y="124"
        width="45"
        height="68"
        rx="4"
        fill="#a9bbe0"
        stroke="#142b40"
        strokeWidth="3"
      />
      <rect
        x="107"
        y="122"
        width="52"
        height="38"
        rx="5"
        fill="#e8edcf"
        stroke="#142b40"
        strokeWidth="3"
      />
      <circle cx="74" cy="160" r="3" fill="#142b40" />
      <path
        d="M8 194h187"
        stroke="#142b40"
        strokeWidth="3"
        strokeLinecap="round"
      />
    </g>
  );
}
const questions = [
  [
    "Do I need to sign every payment?",
    "No. Once token access and the payment policy are authorized, the approved spender can request eligible collections without a new renewal signature.",
  ],
  [
    "Where do my tokens live?",
    "In your wallet. A successful collection transfers the fixed amount directly to your approved recipient.",
  ],
  [
    "Who makes payments happen?",
    "Your authorized spender—a merchant backend, automation service, or script—submits the collection transaction and pays its network fee. Ordin checks the payment rules.",
  ],
  [
    "What happens when I cancel?",
    "Once cancellation is confirmed onchain, future collections are blocked. Previous payments are not refunded. Starting again requires a new authorization.",
  ],
  [
    "Can I use Ordin today?",
    "Ordin is a local prototype with a contract, TypeScript SDK, demo, and local tests. It is not deployed to Whitechain or audited. Live USDT compatibility and fully gasless initial token approval are not yet verified.",
  ],
];
function App() {
  const [menu, setMenu] = useState(false);
  const [paused, setPaused] = useState(false);
  const [open, setOpen] = useState<number | null>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenu(false);
    };
    window.addEventListener("keydown", onKey);
    const observer = new IntersectionObserver(
      (entries) =>
        entries.forEach((e) => {
          if (e.isIntersecting) {
            e.target.classList.add("in");
            observer.unobserve(e.target);
          }
        }),
      { threshold: 0.1 },
    );
    document.querySelectorAll(".reveal").forEach((el) => {
      el.classList.add("ready");
      observer.observe(el);
    });
    return () => {
      observer.disconnect();
      window.removeEventListener("keydown", onKey);
    };
  }, []);
  useEffect(() => {
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    const pointer = window.matchMedia("(hover: hover) and (pointer: fine)");
    const surfaces = [
      ...document.querySelectorAll<HTMLElement>(".depth-surface"),
    ];
    const cleanups: (() => void)[] = [];
    for (const surface of surfaces) {
      let frame = 0;
      const reset = () => {
        cancelAnimationFrame(frame);
        surface.style.setProperty("--tilt-x", "0deg");
        surface.style.setProperty("--tilt-y", "0deg");
        surface.style.setProperty("--light-x", "50%");
        surface.style.setProperty("--light-y", "50%");
      };
      const move = (event: PointerEvent) => {
        if (
          paused ||
          preference.matches ||
          !pointer.matches ||
          event.pointerType === "touch"
        )
          return;
        const rect = surface.getBoundingClientRect();
        const x = Math.max(
          0,
          Math.min(1, (event.clientX - rect.left) / rect.width),
        );
        const y = Math.max(
          0,
          Math.min(1, (event.clientY - rect.top) / rect.height),
        );
        cancelAnimationFrame(frame);
        frame = requestAnimationFrame(() => {
          surface.style.setProperty("--tilt-x", `${(0.5 - y) * 4}deg`);
          surface.style.setProperty("--tilt-y", `${(x - 0.5) * 4}deg`);
          surface.style.setProperty("--light-x", `${x * 100}%`);
          surface.style.setProperty("--light-y", `${y * 100}%`);
        });
      };
      surface.addEventListener("pointermove", move, { passive: true });
      surface.addEventListener("pointerleave", reset);
      preference.addEventListener("change", reset);
      cleanups.push(() => {
        reset();
        surface.removeEventListener("pointermove", move);
        surface.removeEventListener("pointerleave", reset);
        preference.removeEventListener("change", reset);
      });
    }
    return () => cleanups.forEach((cleanup) => cleanup());
  }, [paused]);
  return (
    <>
      <header className="nav">
        <Logo />
        <nav className="desktop-nav" aria-label="Main">
          <a href="#how">How it works</a>
          <a href="#rules">Your rules</a>
          <a href="#builders">
            Build with Ordin <ArrowUpRight size={13} />
          </a>
        </nav>
        <a className="nav-button" href="#playground">
          Take it for a spin <ArrowUpRight size={16} />
        </a>
        <button
          className="mobile-toggle"
          aria-label={menu ? "Close menu" : "Open menu"}
          aria-expanded={menu}
          aria-controls="mobile-menu"
          onClick={() => setMenu(!menu)}
        >
          {menu ? <X /> : <Menu />}
        </button>
        {menu && (
          <nav id="mobile-menu" className="mobile-nav">
            {[
              ["How it works", "how"],
              ["Your rules", "rules"],
              ["Build with Ordin", "builders"],
            ].map(([label, id]) => (
              <a href={`#${id}`} key={id} onClick={() => setMenu(false)}>
                {label}
                <ArrowUpRight size={18} />
              </a>
            ))}
          </nav>
        )}
      </header>
      <main className={paused ? "motion-paused" : undefined}>
        <ImmersiveHero paused={paused} onPause={()=>setPaused(!paused)}/>
        <section className="how section" id="how">
          <div className="section-top reveal">
            <span className="eyebrow">01 / THE SHORT VERSION</span>
            <h2>
              Less “sign here.”
              <br />
              More <span className="serif">set & go.</span>
            </h2>
            <p>
              Tell Ordin what’s allowed.
              <br />
              It checks every collection.
            </p>
          </div>
          <div className="how-grid">
            <article className="how-card lilac reveal depth-surface">
              <div className="card-step">
                01 <span>MAKE THE RULES</span>
              </div>
              <div className="terms-art">
                <div className="term-ticket">
                  <span>THE DEAL</span>
                  <strong>
                    5 <small>USDT</small>
                  </strong>
                  <div>
                    Every <b>30 days</b>
                  </div>
                  <span className="ticket-dash" />
                  <div>
                    To <b>Your merchant ↗</b>
                  </div>
                  <i />
                </div>
                <Star className="ticket-star" />
              </div>
              <h3>
                Your terms.
                <br />
                No surprises.
              </h3>
              <p>Choose the amount, recipient, and interval.</p>
            </article>
            <article className="how-card mint reveal depth-surface">
              <div className="card-step">
                02 <span>GIVE THE GO-AHEAD</span>
              </div>
              <div className="permission-art">
                <div className="permission-circle">
                  <Check size={74} strokeWidth={2.5} />
                </div>
                <span className="signature">Approved by you.</span>
                <svg viewBox="0 0 200 30">
                  <path
                    d="M10 19q77-20 180-7"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  />
                </svg>
                <span className="spark s1">✳</span>
                <span className="spark s2">+</span>
              </div>
              <h3>
                One setup.
                <br />
                Permission granted.
              </h3>
              <p>Authorize token access and your payment policy.</p>
            </article>
            <article className="how-card peach reveal depth-surface">
              <div className="card-step">
                03 <span>LET IT REPEAT</span>
              </div>
              <div className="calendar-art">
                <div className="calendar-back" />
                <div className="calendar">
                  <div>EVERY</div>
                  <strong>30</strong>
                  <span>DAYS</span>
                </div>
                <span className="calendar-check">
                  <Check size={30} />
                </span>
                <span className="calendar-orbit">↻</span>
              </div>
              <h3>
                Renewals happen.
                <br />
                You do you.
              </h3>
              <p>The spender collects. Ordin checks your rules.</p>
            </article>
          </div>
        </section>
        <section className="rules section" id="rules">
          <div className="rules-heading reveal">
            <span className="eyebrow">02 / YOU KEEP THE KEYS</span>
            <h2>
              Automatic.
              <br />
              Not a <span className="serif">free-for-all.</span>
            </h2>
            <Star />
          </div>
          <div className="rules-grid">
            <article className="rule-wide reveal">
              <div className="wallet-picture">
                <svg
                  viewBox="0 0 270 240"
                  role="img"
                  aria-label="Tokens stay in your wallet"
                >
                  <g transform="translate(30 20) rotate(-10 100 100)">
                    <WalletArt />
                    <Coin x={96} y={36} />
                  </g>
                </svg>
                <span>Still yours :)</span>
              </div>
              <div>
                <span className="eyebrow">01 — YOUR FUNDS</span>
                <h3>
                  At home.
                  <br />
                  In your wallet.
                </h3>
                <p>Tokens leave only when a collection succeeds.</p>
              </div>
            </article>
            <article className="rule-small reveal">
              <div className="fixed-amount">
                <span>
                  5 USDT <Check size={20} />
                </span>
                <span>
                  50 USDT <X size={20} />
                </span>
              </div>
              <h3>5 means 5.</h3>
              <p>Only the exact amount you approved.</p>
            </article>
            <article className="rule-small reveal">
              <div className="period-stamps">
                <span>
                  <Check size={23} /> PAID
                </span>
                <span>
                  <X size={23} /> AGAIN?
                </span>
              </div>
              <h3>Once. Not twice.</h3>
              <p>One successful collection per period.</p>
            </article>
          </div>
        </section>
        <section id="builders" className="builders section">
          <div className="builders-panel reveal">
            <div className="builders-copy">
              <span className="eyebrow">03 / YOUR NEXT BUILD</span>
              <h2>
                Make recurring
                <br />
                <span className="serif">a thing.</span>
              </h2>
              <p>
                Solidity rules. TypeScript tools.
                <br />
                Your collection workflow.
              </p>
              <a
                href="/protocol.md"
                target="_blank"
                rel="noreferrer"
                className="button mint-button"
              >
                Explore the protocol <ArrowUpRight size={18} />
              </a>
              <small>Local prototype · Not deployed or audited</small>
            </div>
            <div
              className="builder-art"
              aria-label="Contract plus SDK equals recurring payments"
            >
              <div className="code-block">
                <span>CONTRACT.sol</span>
                <div>
                  <b>{"{"} </b>
                  <i>your rules</i>
                  <b> {"}"}</b>
                </div>
                <span className="code-lines">
                  ━━ ━━━━━
                  <br />
                  ━━━━ ━━
                  <br />
                  ━━━ ━━━━━
                </span>
              </div>
              <span className="builder-plus">+</span>
              <div className="sdk-block">
                <span>TYPESCRIPT</span>
                <strong>
                  sdk<span>↗</span>
                </strong>
              </div>
              <div className="build-caption">
                Your app. Their permission.
                <svg viewBox="0 0 70 50">
                  <path
                    d="M3 25Q36 48 63 9m-14 1 14-2-1 14"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  />
                </svg>
              </div>
            </div>
          </div>
        </section>
        <section className="faq section">
          <div className="reveal">
            <span className="eyebrow">THE FINE PRINT, SIMPLIFIED</span>
            <h2>
              Wait, <span className="serif">what if?</span>
            </h2>
          </div>
          <div className="faq-items reveal">
            {questions.map(([q, a], i) => (
              <div className="faq-item" key={q}>
                <h3>
                  <button
                    aria-expanded={open === i}
                    aria-controls={`answer-${i}`}
                    onClick={() => setOpen(open === i ? null : i)}
                  >
                    {q}
                    {open === i ? <Minus size={20} /> : <Plus size={20} />}
                  </button>
                </h3>
                <div id={`answer-${i}`} hidden={open !== i}>
                  <p>{a}</p>
                </div>
              </div>
            ))}
          </div>
        </section>
        <section className="closing section">
          <div className="closing-panel reveal">
            <Star className="closing-star" />
            <span className="eyebrow">A BETTER KIND OF REPEAT.</span>
            <h2>
              Your terms.
              <br />
              Every. Single. <span className="serif">Payment.</span>
            </h2>
            <a href="#playground" className="button navy">
              Let's run that again <RotateCcw size={17} />
            </a>
            <span className="closing-spark">✳</span>
          </div>
        </section>
      </main>
      <footer>
        <div className="footer-top">
          <Logo />
          <p>Your terms. Every payment.</p>
          <a href="/protocol.md" target="_blank" rel="noreferrer">
            Protocol overview <ArrowUpRight size={15} />
          </a>
          <a href="#home">Back to top ↑</a>
        </div>
        <div className="footer-word" aria-hidden="true">
          ordin<span>↗</span>
        </div>
        <div className="footer-bottom">
          <span>
            <span className="live-dot" /> In development
          </span>
        </div>
      </footer>
    </>
  );
}
function ArrowDown() {
  return (
    <svg
      width="17"
      height="17"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M12 4v16m-6-6 6 6 6-6"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
createRoot(document.getElementById("root")!).render(<App />);
