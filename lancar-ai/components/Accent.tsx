/**
 * Renders a heading from the dictionary, turning *marked words* into the gold italic accent.
 * "AI that fits the way your business *really works*" -> the last two words are highlighted.
 */
export function Accent({ text }: { text: string }) {
  return (
    <>
      {text.split("*").map((part, index) =>
        index % 2 === 1 ? (
          <em key={index} className="accent">
            {part}
          </em>
        ) : (
          part
        ),
      )}
    </>
  );
}
