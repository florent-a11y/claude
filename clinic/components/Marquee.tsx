/** A band of keywords drifting sideways. Decorative: the same words appear as filters on the menu pages. */
export function Marquee({ items }: { items: string[] }) {
  const row = (key: string) => (
    <ul key={key} className="marquee-row">
      {[...items, ...items].map((item, i) => (
        <li key={`${item}-${i}`} className="flex items-center whitespace-nowrap font-display text-2xl font-semibold sm:text-3xl">
          <span className="px-6 sm:px-9">{item}</span>
          <span className="h-2.5 w-2.5 rounded-full bg-lime-400" />
        </li>
      ))}
    </ul>
  );
  return <div aria-hidden="true" className="marquee bg-deep-950 py-5 text-white">{row("a")}{row("b")}</div>;
}
