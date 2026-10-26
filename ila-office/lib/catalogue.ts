import type { ServiceItem } from "./types";

/**
 * ILA's service catalogue, reconstructed from the descriptions actually used on quotes and invoices
 * (QuickBooks 2025–2026 and the Google Slides quote templates). Prices are list prices in IDR; USD/EUR
 * equivalents are the figures ILA has quoted, not conversions. Edit freely in Settings → Service catalogue.
 */
type Row = Omit<ServiceItem, "id" | "active" | "sortOrder"> & { priceUSD?: number; priceEUR?: number };

const S = (code: string, category: ServiceItem["category"], name: string, priceIDR: number, unit = "each", extra: Partial<Row> = {}): Row => ({
  code, category, name, priceIDR, unit, cadence: "none", taxTreatment: "out_of_scope", ...extra,
});

export const SERVICE_CATALOGUE: Row[] = [
  // Corporate & company secretarial
  S("CORP-PMA", "corporate", "Company incorporation - PT PMA", 23_000_000, "each", { priceUSD: 1400, description: "Deed, SK Kemenkumham, NPWP, NIB via OSS, KBLI structuring. Bank account assistance included.", renewalMonths: undefined }),
  S("CORP-PMDN", "corporate", "Company incorporation - PT PMDN", 15_000_000, "each", { description: "Indonesian-owned PT. Local shareholders can be provided by ILA (see nominee services)." }),
  S("CORP-PMA-LOMBOK", "corporate", "Company incorporation - PT PMA Lombok / Sumba", 30_000_000, "each", { description: "Incorporation outside Bali, including local notary coordination." }),
  S("CORP-HK", "corporate", "Company incorporation - Hong Kong Limited", 25_952_100, "each", { priceUSD: 1450, description: "Hong Kong company incorporation via partner (USD 1,450) plus ILA service fee (USD 500)." }),
  S("CORP-HK-FEE", "corporate", "ILA service fee - Hong Kong incorporation", 8_948_575, "each", { priceUSD: 500 }),
  S("CORP-HK-BR", "corporate", "Hong Kong Business Registration Certificate renewal", 0, "per year", { cadence: "annual", renewalMonths: 12, description: "Government fee re-billed at cost (HKD)." }),
  S("CORP-PH-OPC", "corporate", "Company incorporation - Philippines OPC", 0, "each", { description: "Quoted per proposal in PHP (SEC, BIR, LGU, SSS/PhilHealth/Pag-IBIG registrations + ILA professional fee)." }),
  S("CORP-NIB", "corporate", "NIB issuance (OSS)", 10_000_000, "each"),
  S("CORP-VO", "corporate", "Commercial address / virtual office", 5_500_000, "per year", { cadence: "annual", renewalMonths: 12, description: "Registered commercial address for the company, renewed annually." }),
  S("CORP-DIR", "corporate", "Resident director (nominee)", 30_000_000, "per year", { cadence: "annual", renewalMonths: 12, description: "ILA-provided resident director for 12 months, with standard contract." }),
  S("CORP-COMM", "corporate", "Resident commissioner (nominee)", 15_000_000, "per year", { cadence: "annual", renewalMonths: 12 }),
  S("CORP-SH", "corporate", "Local shareholder (nominee), per shareholder", 30_000_000, "per year", { cadence: "annual", renewalMonths: 12, description: "PT PMDN requires 2 local shareholders. Set of shareholder agreements included." }),
  S("CORP-SHA", "corporate", "Shareholder agreement / set of agreements", 6_000_000, "each"),
  S("CORP-AMEND", "corporate", "Company amendment - deed (KBLI, director, commissioner, capital)", 8_000_000, "each", { description: "Circular resolution, deed amendment, AHU registration, OSS update." }),
  S("CORP-AMEND-KBLI", "corporate", "Company amendment - KBLI and NIB update", 12_000_000, "each"),
  S("CORP-ADDR", "corporate", "Change of company address", 3_000_000, "each"),
  S("CORP-NAME", "corporate", "Change of company name", 2_000_000, "each"),
  S("CORP-CAP", "corporate", "Circular to reduce / increase capital", 3_500_000, "each"),
  S("CORP-SHARES", "corporate", "Share transfer (deed, GMS, AHU)", 12_000_000, "each"),
  S("CORP-GMS", "corporate", "Annual GMS (RUPS) - notarisation and financial statement submission", 10_000_000, "per year", { cadence: "annual", renewalMonths: 12 }),
  S("CORP-CLOSE", "corporate", "Company closure / liquidation", 17_000_000, "each"),
  S("CORP-PROFILE", "corporate", "Company profile extract (AHU)", 150_000, "each", { priceEUR: 75, description: "Simple profile IDR 150,000; full profile EUR 75." }),
  S("CORP-HOLDING", "corporate", "Holding set-up and shareholder agreement", 30_000_000, "each"),
  S("CORP-NOVATION", "corporate", "Novation - transfer of lease to company", 10_000_000, "each"),
  S("CORP-BPJS-REG", "corporate", "Company BPJS health and social security registration", 500_000, "each"),
  S("CORP-NPWPD", "corporate", "NPWPD regional tax registration", 1_500_000, "each"),
  // Visa & immigration
  S("VISA-WK", "visa", "Working KITAS (1 year) incl. RPTKA/IMTA USD 1,200", 43_000_000, "per person", { renewalMonths: 12, includesNote: "USD 1,200 manpower fee (DKP-TKA) and all visa fees included.", description: "Onshore or offshore process. Express (14 working days) available." }),
  S("VISA-WK-RENEW", "visa", "Working KITAS renewal", 39_000_000, "per person", { renewalMonths: 12 }),
  S("VISA-INV", "visa", "Investor KITAS E28A (2 years)", 19_500_000, "per person", { renewalMonths: 24, priceUSD: 1100, priceEUR: 955, description: "For shareholders of a PT PMA. Onshore application +IDR 3,500,000." }),
  S("VISA-INV-EXT", "visa", "Investor KITAS extension (2 years)", 21_000_000, "per person", { renewalMonths: 24 }),
  S("VISA-INV-ONSHORE", "visa", "Onshore conversion (VOA → Investor KITAS)", 3_500_000, "per person"),
  S("VISA-DEP", "visa", "Dependent / spouse KITAS (2 years)", 18_250_000, "per person", { renewalMonths: 24, priceUSD: 750 }),
  S("VISA-DEP-1Y", "visa", "Dependent / spouse KITAS (1 year)", 15_250_000, "per person", { renewalMonths: 12 }),
  S("VISA-CHILD", "visa", "Child KITAS", 15_000_000, "per person", { renewalMonths: 24 }),
  S("VISA-CHILD-EXT", "visa", "Child / dependent KITAS extension", 19_000_000, "per person", { renewalMonths: 24 }),
  S("VISA-PARENT", "visa", "Parent of KITAS holder", 15_000_000, "per person", { renewalMonths: 12 }),
  S("VISA-REMOTE", "visa", "Remote worker KITAS E33G (1 year)", 16_500_000, "per person", { renewalMonths: 12, priceUSD: 750, description: "Proof of employment abroad and USD 60,000 annual income required." }),
  S("VISA-RETIRE", "visa", "Retirement KITAS E33F", 16_500_000, "per person", { renewalMonths: 12 }),
  S("VISA-KITAP", "visa", "KITAP (permanent stay permit)", 50_000_000, "per person", { renewalMonths: 60 }),
  S("VISA-YOGA", "visa", "Yoga teacher / art performer KITAS (6-12 months)", 27_000_000, "per person", { renewalMonths: 6 }),
  S("VISA-BRIDGE", "visa", "Bridging visa (stay in country during process)", 3_000_000, "per person"),
  S("VISA-C18", "visa", "Work trial visa C18 (up to 90 days)", 7_000_000, "per person"),
  S("VISA-C22", "visa", "Internship visa C22 (up to 180 days)", 7_500_000, "per person"),
  S("VISA-C1", "visa", "Single entry visa C1 / C7A", 3_500_000, "per person", { priceEUR: 213 }),
  S("VISA-C10", "visa", "Visa C10", 4_050_000, "per person"),
  S("VISA-D1", "visa", "Multiple entry visa D1 (1 year)", 7_000_000, "per person", { renewalMonths: 12 }),
  S("VISA-D1-EXT", "visa", "D1 visa extension", 2_050_000, "per person"),
  S("VISA-D2", "visa", "Multiple entry business visa D2 (1 year)", 7_050_000, "per person", { renewalMonths: 12 }),
  S("VISA-D12", "visa", "Multiple entry pre-investment visa D12 (1 year)", 9_000_000, "per person", { renewalMonths: 12 }),
  S("VISA-ERP", "visa", "KITAS cancellation / exit permit (ERP)", 1_500_000, "per person"),
  S("VISA-PASSPORT", "visa", "Passport mutation (new passport on KITAS)", 1_000_000, "per person"),
  S("VISA-SKTT", "visa", "SKTT (civil registration)", 2_800_000, "per person"),
  S("VISA-DOMICILE", "visa", "Domicile letter", 1_500_000, "per person"),
  S("VISA-ADDRESS", "visa", "Address mutation", 1_500_000, "per person"),
  S("VISA-NPWP", "visa", "NPWP personal tax number", 800_000, "per person"),
  S("VISA-EXPRESS", "visa", "Express visa activation / fast process", 1_000_000, "per person"),
  S("VISA-IMTA", "visa", "IMTA / RPTKA processing (USD 1,200 government fee)", 21_400_000, "per person"),
  // Tax & accounting
  S("TAX-MONTHLY", "tax_accounting", "Monthly tax compliance and declaration (up to 20 transactions)", 1_500_000, "per month", { cadence: "monthly", description: "PPh 21/23/26/4(2), PPN if PKP, Coretax reporting. 3,000,000 up to 50 transactions." }),
  S("TAX-MONTHLY-50", "tax_accounting", "Monthly tax compliance and declaration (up to 50 transactions)", 3_000_000, "per month", { cadence: "monthly" }),
  S("ACC-MONTHLY", "tax_accounting", "Monthly bookkeeping (up to 20 transactions)", 1_000_000, "per month", { cadence: "monthly", description: "Client gives bank access as maker; financial statements by the 15th." }),
  S("ACC-QBO", "tax_accounting", "QuickBooks Online subscription (re-billed)", 260_000, "per month", { cadence: "monthly", description: "From USD 8 per company per month; client may bring its own subscription." }),
  S("TAX-ANNUAL-CIT", "tax_accounting", "Annual corporate income tax return (SPT Badan)", 5_000_000, "per year", { cadence: "annual", renewalMonths: 12 }),
  S("TAX-ANNUAL-OP", "tax_accounting", "Annual personal income tax return (SPT OP) incl. director", 2_500_000, "per year", { cadence: "annual", renewalMonths: 12 }),
  S("TAX-LKPM", "tax_accounting", "LKPM quarterly investment report", 1_500_000, "per quarter", { cadence: "quarterly" }),
  S("TAX-PEMBETULAN", "tax_accounting", "Tax return amendment (pembetulan) / back-filing", 2_500_000, "each"),
  S("TAX-CONSULT", "tax_accounting", "Tax consultation (per hour)", 1_500_000, "per hour"),
  S("TAX-PLANNING", "tax_accounting", "Tax planning and structuring memorandum", 10_000_000, "each"),
  S("ACC-ANNUAL", "tax_accounting", "Annual accounting package (LKPM + annual report, dormant company)", 18_000_000, "per year", { cadence: "annual" }),
  S("ACC-AUDIT", "tax_accounting", "Audit coordination / internal audit", 77_675_000, "each"),
  S("ACC-FS", "tax_accounting", "Financial statements preparation (annual)", 5_000_000, "per year", { cadence: "annual" }),
  // Payroll & EOR
  S("PAY-MONTHLY", "payroll_eor", "Monthly payroll management (up to 5 employees)", 1_500_000, "per month", { cadence: "monthly", description: "PPh 21, BPJS registration and maintenance, payslips, annual A1 slips. +IDR 250,000 per extra employee." }),
  S("PAY-EXTRA", "payroll_eor", "Payroll - additional employee", 250_000, "per person", { cadence: "monthly" }),
  S("PAY-CONTRACT", "payroll_eor", "Employment contract template (PKWTT / PKWT)", 4_500_000, "each"),
  S("PAY-EOR", "payroll_eor", "Employer of record fee (per employee, per month)", 0, "per person", { cadence: "monthly", description: "Salary + PPh 21 + BPJS re-billed at cost plus an EOR fee (10-15%)." }),
  // Legal & property
  S("LEG-DD", "legal_property", "Legal due diligence (property)", 8_500_000, "each", { priceEUR: 395, priceUSD: 490, description: "Document, zoning, ownership, tax, access road and building permit checks. 20 working days." }),
  S("LEG-CONTRACT", "legal_property", "Contract drafting or review (per agreement)", 4_500_000, "per agreement", { priceEUR: 250, priceUSD: 255, description: "MOU, lease, management, contractor, shareholder, NDA." }),
  S("LEG-NOTARY", "legal_property", "Notary and purchase assistance (signing, coordination)", 5_000_000, "each", { priceEUR: 245 }),
  S("LEG-TOPO", "legal_property", "Topography and land measurement", 8_000_000, "each", { description: "Excludes VAT; with BPN (land office) from IDR 4,000,000." }),
  S("LEG-RETAINER", "legal_property", "Legal retainer (monthly)", 9_000_000, "per month", { cadence: "monthly", priceUSD: 570 }),
  S("LEG-OPINION", "legal_property", "Legal opinion / memorandum", 8_000_000, "each"),
  S("LEG-LEGALISE", "legal_property", "Legalisation of agreement (notarial)", 10_000_000, "each"),
  S("LEG-BUYER", "legal_property", "Buyer agent service", 0, "each", { priceUSD: 2900, description: "3% of the property value." }),
  // Licensing & permits
  S("LIC-PBG", "licensing", "PBG building permit application", 0, "each", { description: "Quoted per project (architect drawings, retribution). Staged 30/50/20%." }),
  S("LIC-SLF", "licensing", "SLF (certificate of worthiness)", 0, "each", { description: "Quoted per project." }),
  S("LIC-PKKPR", "licensing", "PKKPR (spatial conformity) certificate", 65_000_000, "each"),
  S("LIC-UKL", "licensing", "UKL-UPL environmental document", 70_000_000, "each"),
  S("LIC-SS", "licensing", "Sertifikat Standar (OSS, verified)", 60_000_000, "each"),
  S("LIC-PSE", "licensing", "PSE licence (electronic system operator)", 10_000_000, "each"),
  S("LIC-TM", "licensing", "Trademark registration (first class)", 10_000_000, "each"),
  S("LIC-TM-CLASS", "licensing", "Trademark - additional class", 10_000_000, "per class"),
  S("LIC-ALCOHOL", "licensing", "Alcohol licence", 14_500_000, "each", { priceUSD: 900 }),
  S("LIC-IMPORT", "licensing", "Import licence (API)", 14_500_000, "each", { priceUSD: 900 }),
  S("LIC-RECRUIT", "licensing", "Recruitment agency licence", 32_000_000, "each", { priceUSD: 2000 }),
  S("LIC-GENERIC", "licensing", "Business licence (generic)", 16_000_000, "each", { priceUSD: 900 }),
  S("LIC-BPN-FAST", "licensing", "Fast-track BPN (land office) visit", 40_000_000, "each"),
  // Advisory
  S("ADV-CONSULT", "advisory", "Consultation (company set-up, visa, tax)", 1_000_000, "per hour"),
  S("ADV-STRUCT", "advisory", "Business structuring and investment advisory", 20_000_000, "each"),
  S("ADV-MARKET", "advisory", "Market study", 30_000_000, "each", { priceUSD: 1500 }),
  S("ADV-BPLAN", "advisory", "Business plan", 57_000_000, "each", { priceUSD: 2900 }),
  S("ADV-PROPERTY", "advisory", "Property / investment consulting fee", 0, "each", { description: "Quoted per engagement." }),
  S("ADV-REFERRAL", "advisory", "Referral fee", 0, "each"),
  // Disbursements
  S("DISB-GOV", "disbursement", "Government fee / PNBP (pass-through)", 0, "each", { description: "Billed at cost: visa PNBP, retribution PBG, DKP-TKA, AHU." }),
  S("DISB-PREPAY", "disbursement", "Prepayment / deposit", 0, "each"),
  S("DISB-FX", "disbursement", "Exchange rate adjustment", 0, "each"),
  S("DISB-DISCOUNT", "disbursement", "Discount", 0, "each", { description: "Negative line." }),
];

export function catalogueItems(newId: () => string): ServiceItem[] {
  return SERVICE_CATALOGUE.map((r, i) => ({ ...r, id: newId(), active: true, sortOrder: i }));
}

/** Default quote terms, as printed on every ILA quote. */
export const QUOTE_TERMS = `Payment terms: the quote above is valid at the moment it has been sent. The client understands that the estimate price can vary from the final invoice price and is valid for a maximum period of 7 days. All currency exchange variation might affect the final price. All services are paid in advance.
Cancellation and refund policy: any fee engaged by ILA with acceptance of the client or in order to deliver the service cannot be refunded. ILA Global Consulting reserves the right to refund the client at its demand for the fee non engaged to deliver the service.
The above services don't include audit, appeal or court services that are not imputable to ILA Global Consulting.`;

export const COMPANY = {
  name: "PT ILA GLOBAL CONSULTING",
  tagline: "Strategic Investment & Legal Advisory · Bali · Jakarta · Manila · Hong Kong",
  motto: "Your journey, our expertise.",
  baliOffice: "Jl. Raya Semat No.17B, Tibubeneng, Kec. Kuta Utara, Kabupaten Badung, Bali 80361",
  jakartaOffice: "Treasury Tower, Jl. Jend. Sudirman kav 52-53, 31st Floor, Jakarta",
  email: "florent@ilaglobalconsulting.com",
  phone: "+62 822 3560 2572",
  website: "ilaglobalconsulting.com",
  /** Invoices are due 3 working days after the send date; payment by bank transfer. */
  invoiceDueWorkingDays: 3,
  quoteValidityDays: 7,
};
