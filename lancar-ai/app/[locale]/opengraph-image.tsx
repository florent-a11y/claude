import { ImageResponse } from "next/og";
import { getDictionary, plain } from "@/content";
import { LOCALES } from "@/i18n/routing";

/** Link preview image (WhatsApp, Instagram, LinkedIn): brand, headline and where we work. */
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "Lancar AI";

export function generateStaticParams() {
  return LOCALES.map((locale) => ({ locale }));
}

export default async function OpengraphImage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const dict = getDictionary(locale);
  const wave = "M14 24c6.6-6 13.4-6 20 0s13.4 6 20 0";

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: 72,
          backgroundColor: "#0a1330",
          backgroundImage: "radial-gradient(circle at 12% 0%, rgba(47,107,255,0.55), rgba(10,19,48,0) 55%), radial-gradient(circle at 95% 100%, rgba(201,154,46,0.35), rgba(10,19,48,0) 50%)",
          color: "#ffffff",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 22 }}>
          <svg width="84" height="84" viewBox="0 0 68 68">
            <rect x="1" y="1" width="66" height="66" rx="20" fill="#152552" stroke="#dcb64a" strokeOpacity="0.6" strokeWidth="2" />
            <path d={wave} fill="none" stroke="#ecd27f" strokeWidth="4.8" strokeLinecap="round" />
            <path d={wave} transform="translate(0 11)" fill="none" stroke="#5f8fff" strokeWidth="4.8" strokeLinecap="round" />
            <path d={wave} transform="translate(0 22)" fill="none" stroke="#ffffff" strokeWidth="4.8" strokeLinecap="round" />
          </svg>
          <div style={{ display: "flex", fontSize: 52, fontWeight: 700 }}>
            Lancar <span style={{ color: "#ecd27f", marginLeft: 14 }}>AI</span>
          </div>
        </div>
        <div style={{ display: "flex", fontSize: 76, fontWeight: 700, lineHeight: 1.1, letterSpacing: -2, maxWidth: 1000 }}>
          {plain(dict.home.hero.title)}
        </div>
        <div style={{ display: "flex", fontSize: 30, color: "#ecd27f" }}>{dict.home.hero.eyebrow}</div>
      </div>
    ),
    size,
  );
}
