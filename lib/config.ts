export const site = {
  name: "Arrival Card Assist",
  shortName: "Arrival Card Assist",
  url: process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000",
  company: process.env.NEXT_PUBLIC_COMPANY_NAME ?? "Bulan Juli Limited",
  companyReg:
    process.env.NEXT_PUBLIC_COMPANY_REG ??
    "Company Registration No. 76938968 · Business Registration No. 76938968-000",
  companyId: "76938968",
  jurisdiction: "a company incorporated in Hong Kong SAR",
  address:
    process.env.NEXT_PUBLIC_COMPANY_ADDRESS ??
    "Unit 909, Prosperity Millennia Plaza, 663 King's Road, Quarry Bay, Hong Kong",
  postalAddress: {
    streetAddress: "Unit 909, Prosperity Millennia Plaza, 663 King's Road",
    addressLocality: "Quarry Bay",
    addressRegion: "Hong Kong",
    addressCountry: "HK",
  },
  supportEmail: process.env.NEXT_PUBLIC_SUPPORT_EMAIL ?? "support@example.com",
  officialPortal: "https://allindonesia.imigrasi.go.id/",
  officialRetrieve: "https://allindonesia.imigrasi.go.id/arrival-card-submission/retrieve",
  description:
    "Private assistance service for the Indonesia (All Indonesia) digital arrival card. Transparent price, human-checked, delivered by email. Not affiliated with the Government of Indonesia.",
};

export const DISCLOSURE =
  "We are a private travel-assistance company and are not affiliated with, endorsed by or acting for the Government of Indonesia or the Directorate General of Immigration. Our fee pays for form preparation, verification, delivery and support.";

export const OFFICIAL_PORTAL_HOST = "allindonesia.imigrasi.go.id";

export const OFFICIAL_NOTE =
  `You can also complete the All Indonesia arrival card yourself, free of charge, on the official government portal ${OFFICIAL_PORTAL_HOST}.`;
