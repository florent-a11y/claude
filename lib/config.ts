export const site = {
  name: "Indonesia Arrival Card Assist",
  shortName: "Arrival Card Assist",
  url: process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000",
  company: process.env.NEXT_PUBLIC_COMPANY_NAME ?? "[Your Hong Kong company name]",
  address: process.env.NEXT_PUBLIC_COMPANY_ADDRESS ?? "[Registered address, Hong Kong]",
  companyReg: process.env.NEXT_PUBLIC_COMPANY_REG ?? "[HK business registration no.]",
  supportEmail: process.env.NEXT_PUBLIC_SUPPORT_EMAIL ?? "support@example.com",
  whatsapp: process.env.NEXT_PUBLIC_WHATSAPP ?? "",
  officialPortal: "https://allindonesia.imigrasi.go.id/",
  officialRetrieve: "https://allindonesia.imigrasi.go.id/arrival-card-submission/retrieve",
  description:
    "Private assistance service for the Indonesia (All Indonesia) digital arrival card. Transparent price, human-checked, delivered by email and WhatsApp. Not affiliated with the Government of Indonesia.",
};

export const DISCLOSURE =
  "We are a private travel-assistance company and are not affiliated with the Government of Indonesia or the Directorate General of Immigration. The All Indonesia arrival card is free of charge on the official portal allindonesia.imigrasi.go.id. Our fee pays for form preparation, verification, delivery and support.";
