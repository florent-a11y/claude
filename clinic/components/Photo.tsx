import Image from "next/image";
import { FOCUS, PHOTOS, type PhotoKey } from "@/lib/photos";

/**
 * A photograph that fills its frame. `className` sizes and shapes the frame (give it an aspect ratio or a height);
 * `sizes` tells the browser how wide the frame is on screen so it downloads the right file.
 * Photos next to text that already names the subject are decorative: leave `alt` empty.
 */
export function Photo({ name, alt = "", sizes, className = "", priority = false }: { name: PhotoKey; alt?: string; sizes: string; className?: string; priority?: boolean }) {
  return (
    <div className={`photo ${className}`}>
      <Image src={PHOTOS[name]} alt={alt} fill sizes={sizes} placeholder="blur" priority={priority} className="object-cover" style={{ objectPosition: FOCUS[name] ?? "50% 50%" }} />
    </div>
  );
}
