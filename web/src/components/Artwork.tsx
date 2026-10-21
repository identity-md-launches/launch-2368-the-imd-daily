/** Original bundled illustrations. PNG/JPEG fallbacks retain transparency and broad support. */
export function Artwork({ name, className = "", alt = "", eager = false }: {
  name: "reporter" | "emblem"; className?: string; alt?: string; eager?: boolean;
}) {
  return <picture className={className}>
    <source srcSet={`./art/${name}.webp`} type="image/webp" />
    <img src={`./art/${name}.png`} alt={alt} loading={eager ? "eager" : "lazy"}
      width={name === "reporter" ? 800 : 160} height={name === "reporter" ? 714 : 149} />
  </picture>;
}
