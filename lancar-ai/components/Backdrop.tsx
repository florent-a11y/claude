/**
 * Decorative background: blue and gold light drifting behind a faint grid, with flowing lines
 * (lancar = flowing) for the hero and the closing call to action. Purely visual, hidden from assistive tech.
 */
const WAVE = "M0 40 q 150 -34 300 0 t 300 0 t 300 0 t 300 0 t 300 0 t 300 0 t 300 0 t 300 0 t 300 0 t 300 0 t 300 0 t 300 0";

export function Backdrop({ variant = "soft" }: { variant?: "hero" | "soft" | "cta" }) {
  const lines = variant !== "soft";
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
      <div
        className={`blob blob-blue ${
          variant === "hero"
            ? "-left-56 -top-64 h-[34rem] w-[34rem] opacity-60 sm:-left-72 sm:-top-72 sm:h-[58rem] sm:w-[58rem] sm:opacity-70"
            : "-left-56 -top-64 h-[30rem] w-[30rem] opacity-50 sm:-left-60 sm:-top-72 sm:h-[44rem] sm:w-[44rem] sm:opacity-55"
        }`}
      />
      <div
        className={`blob blob-azure [animation-delay:-8s] ${
          variant === "hero"
            ? "-right-56 top-40 h-[30rem] w-[30rem] opacity-40 sm:-right-64 sm:-top-10 sm:h-[52rem] sm:w-[52rem] sm:opacity-45"
            : "-right-56 -top-56 h-[26rem] w-[26rem] opacity-30 sm:-right-64 sm:h-[38rem] sm:w-[38rem] sm:opacity-35"
        }`}
      />
      <div
        className={`blob blob-gold [animation-delay:-14s] ${
          variant === "hero" ? "bottom-[-22rem] left-1/4 h-[40rem] w-[40rem] opacity-30" : "bottom-[-18rem] left-1/2 h-[28rem] w-[28rem] opacity-20"
        }`}
      />
      <div className="bg-grid absolute inset-0" />
      {lines && (
        <svg className="flow-lines absolute inset-x-0 bottom-0 h-44 w-[2400px] max-w-none" viewBox="0 0 2400 176" fill="none">
          <g>
            <path d={WAVE} transform="translate(0 30)" stroke="#dcb64a" strokeOpacity="0.5" strokeWidth="1.5" />
          </g>
          <g>
            <path d={WAVE} transform="translate(0 70)" stroke="#5f8fff" strokeOpacity="0.55" strokeWidth="1.5" />
          </g>
          <g>
            <path d={WAVE} transform="translate(0 110)" stroke="#ffffff" strokeOpacity="0.18" strokeWidth="1.5" />
          </g>
        </svg>
      )}
    </div>
  );
}
