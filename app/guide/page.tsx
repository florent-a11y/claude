import type { Metadata } from "next";
import Link from "next/link";
import { JsonLd } from "@/components/JsonLd";
import { OfficialNote } from "@/components/OfficialNote";
import { site } from "@/lib/config";
import { PRICING, money } from "@/lib/pricing";

export const metadata: Metadata = {
  title: "Indonesia arrival card guide 2026: how to fill the All Indonesia form, step by step",
  description:
    "Complete guide to the All Indonesia arrival card: who needs it, the 72-hour window, every step on the official portal and in the app, family and group filing, health and customs questions, the QR code, known app problems and their fixes, and common mistakes.",
  alternates: { canonical: "/guide" },
};

const APP_STORE = "https://apps.apple.com/us/app/all-indonesia/id6749558272";
const GOOGLE_PLAY = "https://play.google.com/store/apps/details?id=id.go.imigrasi.allindonesia";
const ext = { target: "_blank", rel: "noopener nofollow" } as const;

const toc = [
  ["before-you-start", "Before you start"],
  ["portal", "Step by step on the official portal"],
  ["app", "Step by step in the app"],
  ["family", "Filing for a family or a group"],
  ["health-customs", "Health and customs sections explained"],
  ["after", "After submitting"],
  ["problems", "App and portal problems, and fixes"],
  ["mistakes", "Common mistakes"],
  ["faq", "Frequently asked questions"],
  ["sources", "Sources"],
];

const portalSteps = [
  {
    t: "Open the official portal and pick your category",
    d: "Go to allindonesia.imigrasi.go.id, switch the language to English if needed and choose the arrival card service. Then select foreign visitor or Indonesian citizen. Indonesian citizens also enter their NIK (national ID number).",
  },
  {
    t: "Confirm your email address",
    d: "Type the email address where you want the QR code. The portal sends a verification code to it (check on the portal, the flow changes). If nothing arrives within a few minutes, look in the spam folder before requesting a new code.",
  },
  {
    t: "Enter your personal and passport details",
    d: "Scan the machine-readable zone at the bottom of the passport photo page with your camera, or type the details. Check every field: full name as printed, nationality, passport number, date of birth, gender, expiry date and a phone number.",
  },
  {
    t: "Enter your travel details",
    d: "Arrival date in Indonesia (the local date, not your departure date), mode of transport, flight or vessel number, port of entry, planned departure date, purpose of visit, visa type and your address in Indonesia. A hotel name and city is accepted.",
  },
  {
    t: "Answer the health declaration",
    d: "State whether you currently have symptoms such as fever, cough or breathing difficulty, and list the countries visited in the previous 21 days. A truthful yes does not refuse entry; it may mean a short check on arrival.",
  },
  {
    t: "Answer the customs and quarantine declaration",
    d: "Declare cash of IDR 100 million or more, goods above the USD 500 allowance, alcohol and tobacco above the limits, commercial goods, animals, plants or fresh food, and your number of bags. Answer yes to the IMEI question only if you want to register a phone for use beyond 90 days.",
  },
  {
    t: "Review every field and submit",
    d: "Compare the name and passport number on the summary screen with the passport itself. Check the arrival date and port of entry. Submit once.",
  },
  {
    t: "Save the QR code",
    d: "The confirmation with the QR code appears on screen and is emailed to you. Download it, take a full-screen screenshot and print a copy if you can.",
  },
];

const appSteps = [
  { t: "Install the official app", d: "Search for All Indonesia by Direktorat Jenderal Imigrasi on Google Play or the App Store, or use the links above. Ignore look-alike apps." },
  { t: "Create an account", d: "Register with your details, an email address and a password, then enter the one-time code sent to that email. Do this at home, before the 72-hour window opens." },
  { t: "Start an arrival card", d: "Sign in, choose the arrival card service and your category. Scan the passport with the camera or type the details." },
  { t: "Complete the same sections as on the web", d: "Travel details, address in Indonesia, health declaration, customs and quarantine. The questions are identical to the portal." },
  { t: "Submit and keep the QR in the app", d: "The QR code is stored in the app and emailed to you. Screenshot it as a backup so you do not depend on a login at the airport." },
];

const problems = [
  { p: "Verification code or QR email never arrives", f: "Check spam and promotions. Wait five minutes. Confirm the address has no typo. Request a new code once. If a work address filters it, use a personal one." },
  { p: "App closes when you press Next", f: "Update the app, restart the phone and retry. If it persists, use the web portal; it produces the same QR code." },
  { p: "App loops back to the login screen", f: "Sign out, clear the app cache or reinstall, sign in again. Or switch to the web portal." },
  { p: "Passport scan or photo upload fails", f: "Lay the passport flat in good light without glare. If it still fails, type the details by hand and check them twice." },
  { p: "Submission refused as too early", f: "The form only accepts an arrival date within the next 72 hours. Come back when the window opens." },
  { p: "Portal slow or timing out", f: "Try early morning or late evening in Indonesian time. Do not resubmit blindly; check the retrieve page to see whether the first attempt went through." },
  { p: "QR shows the wrong arrival date", f: "Reported after overnight flights: the card shows the day before the date entered. Submit a new card with the correct local date and keep that one." },
  { p: "You submitted twice", f: "Keep the copy with the correct details and show only that one. Duplicates are not reported to cause refusals." },
  { p: "Airline asks for the QR at check-in", f: "Common on flights from Singapore, Australia and the Gulf. Have the QR open on your phone before the counter." },
  { p: "Only one QR arrived for a group", f: "Look up each traveler on the retrieve page with their passport details. If someone has no card, submit an individual one for them." },
];

const mistakes = [
  { m: "Name does not match the passport", c: "The card is flagged and you are sent to a manual counter. Copy the name from the machine-readable zone, all given names included, no titles or accents." },
  { m: "Passport number typed with 0 instead of O, or 1 instead of I", c: "The autogate cannot match you. Read the number from the machine-readable zone and check each character." },
  { m: "Wrong arrival date", c: "The card may not be valid on the day you land. Use the local date of arrival in Indonesia; on an overnight flight that is the day after departure." },
  { m: "Wrong port of entry", c: "Officers ask questions and the customs kiosk may not find you. Pick the airport or port where you first clear immigration, not your final destination after a domestic connection." },
  { m: "Using an unofficial paid site that looks official", c: "You pay for a free form and hand your passport data to strangers; fake follow-up emails asking for more money often follow. Type allindonesia.imigrasi.go.id yourself and use only the official apps." },
  { m: "Forgetting the customs part", c: "Undeclared cash or goods can be fined or seized. Read the customs questions before you travel and check the allowances on our customs page." },
  { m: "One QR for the whole family", c: "Each traveler must be matched to a card. Make sure every person, infants included, has a card in their own name and their own QR." },
  { m: "Screenshot cropped or too small to scan", c: "The kiosk cannot read it and you queue again. Keep the original file and a screenshot showing the whole code, with screen brightness up." },
  { m: "Email address with a typo", c: "No verification code and no QR. Type the address twice and check it before you continue." },
];

const faqs = [
  { q: "Is the All Indonesia arrival card a visa?", a: "No. It is a declaration to immigration, customs, health and quarantine. You still need visa-free entry, a visa on arrival, an e-VOA or another visa, depending on your nationality." },
  { q: "Does it cost anything?", a: "No. The card is free on the official portal and in the official app. Any site that charges for the card itself is unofficial. Our fee pays for preparing, checking and delivering it on your behalf." },
  { q: "When can I submit it?", a: "Inside the 72 hours before your arrival date in Indonesia. Earlier submissions are refused. Most travelers submit 24 to 48 hours before landing." },
  { q: "Do children and infants need one?", a: "Yes. Every traveler with a passport needs a card, whatever their age. A parent can fill it in for them." },
  { q: "Do Indonesian citizens need it?", a: "Yes. Citizens returning from abroad complete the same card, choosing the Indonesian citizen category and entering their NIK." },
  { q: "I am only transiting. Do I need it?", a: "If you stay in the international transit area and do not pass immigration, no. If you clear immigration, even for one night, yes." },
  { q: "Do I need to print the QR code?", a: "No. A digital copy on your phone is accepted. A printout is a useful backup if your battery or signal fails." },
  { q: "I lost the QR code. What now?", a: "Use the retrieve page on the official portal with your passport details to download it again, or open the app where it is stored." },
  { q: "Can I fill it in on arrival?", a: "In practice yes, on your phone in the arrivals hall, but it is slow and some airlines ask for it before boarding. Do it before you fly." },
  { q: "Which airports and ports use it?", a: "All international airports since 1 October 2025, including Jakarta, Bali, Surabaya, Medan, Makassar, Manado and Labuan Bajo, plus international seaports such as the Batam and Bintan ferry terminals and Benoa, and land borders such as Motaain." },
  { q: "Should I use the app or the website?", a: "Either. The website needs no account and works on any device. The app stores the QR and suits repeat trips and groups, but it requires registration and has had crashes." },
  { q: "What happens at the airport?", a: "At immigration you scan your passport at an autogate or hand it to an officer; the system finds your card. After baggage claim you scan the QR at the customs kiosk and take the green or red channel." },
];

export default function Guide() {
  const price = money(PRICING.arrivalCard.first);
  return (
    <div className="mx-auto max-w-3xl px-4 py-12">
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "HowTo",
          name: "How to fill the All Indonesia arrival card on the official portal",
          description: "Step-by-step instructions for the Indonesia digital arrival card, from opening the official portal to saving the QR code.",
          totalTime: "PT15M",
          step: portalSteps.map((s, i) => ({ "@type": "HowToStep", position: i + 1, name: s.t, text: s.d })),
        }}
      />
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "FAQPage",
          mainEntity: faqs.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })),
        }}
      />

      <p className="text-sm font-semibold uppercase tracking-wide text-brand-700">Guide, updated September 2026</p>
      <h1 className="mt-2 text-3xl font-bold md:text-4xl">Indonesia arrival card guide: how to fill the All Indonesia form, step by step</h1>

      <div className="prose-basic mt-6">
        <p>
          The All Indonesia arrival card is the digital form every traveler completes before entering Indonesia. It replaced the paper immigration card, the electronic customs declaration (e-CD) and the SATUSEHAT health form with one submission that produces one QR code. It is run by the Directorate General of Immigration.
        </p>
        <p>
          It became mandatory on 1 September 2025 at Jakarta (CGK), Bali (DPS), Surabaya (SUB) and the Batam ferry terminals, and on 1 October 2025 at every international airport, seaport and land border. It applies to all nationalities, to Indonesian citizens coming home, and to children and infants. It is not a visa. You still need visa-free entry, a visa on arrival or another visa.
        </p>
      </div>
      <OfficialNote className="mt-2 text-sm text-ink-500" />
      <p className="mt-2 text-sm text-ink-500">
        Official apps: <a className="underline" href={GOOGLE_PLAY} {...ext}>All Indonesia on Google Play</a> and <a className="underline" href={APP_STORE} {...ext}>All Indonesia on the App Store</a>, both published by Direktorat Jenderal Imigrasi.
      </p>

      <nav aria-label="Contents" className="card mt-8 bg-slate-50">
        <p className="font-semibold">On this page</p>
        <ol className="mt-2 grid gap-1 text-sm text-ink-700 sm:grid-cols-2">
          {toc.map(([id, label], i) => (
            <li key={id}><a className="underline underline-offset-2 hover:text-brand-700" href={`#${id}`}>{i + 1}. {label}</a></li>
          ))}
        </ol>
      </nav>

      <div className="prose-basic">
        <h2 id="before-you-start" className="scroll-mt-24">Before you start</h2>
        <p>Fifteen minutes is enough if everything is on the table.</p>
        <h3>What you need</h3>
        <ul>
          <li>Passport, open at the photo page.</li>
          <li>Flight or ferry number, date, and the airport or port where you first clear immigration.</li>
          <li>Departure date from Indonesia, even approximate, and your visa type (visa-free, visa on arrival, e-VOA or other).</li>
          <li>Name and address of your first accommodation.</li>
          <li>An email address you can open on your phone. The verification code and the QR code go there.</li>
          <li>The countries you visited in the last 21 days.</li>
          <li>What you carry: cash, alcohol, tobacco, gifts, food, and whether you want to register a phone.</li>
          <li>Indonesian citizens: your NIK.</li>
        </ul>
        <h3>Timing: the 72-hour window</h3>
        <p>
          The portal accepts a card only when the arrival date is within the next 72 hours. Submit earlier and it is refused, because the card is tied to a specific arrival and the data must be current for immigration and health officials. Most people submit one or two days before landing. Do not leave it to the airport: some airlines ask for the QR at check-in, and airport Wi-Fi is slow. Flying in more than three days? <Link href="/reminder">Set a free reminder</Link> and we email you when your window opens.
        </p>
        <h3>Device and email advice</h3>
        <ul>
          <li>Use a stable connection. A dropped connection during submission is the usual reason a QR never appears.</li>
          <li>Prefer a personal email address over a work address with strict filtering.</li>
          <li>One traveler, one card. Filing for several people? Do them one after another with the passports in front of you.</li>
        </ul>

        <h2 id="portal" className="scroll-mt-24">Step by step on the official portal</h2>
        <p>The web portal at <a href={site.officialPortal} {...ext}>allindonesia.imigrasi.go.id</a> is available in Indonesian, English and Mandarin and does not require an account. This is the flow as documented by immigration offices and travelers in 2025 and 2026. Screen names change from time to time; the order of the sections has not.</p>
        <ol>
          {portalSteps.map((s) => (
            <li key={s.t}><strong>{s.t}.</strong> {s.d}</li>
          ))}
        </ol>

        <h2 id="app" className="scroll-mt-24">Step by step in the app</h2>
        <p>The app asks the same questions. The difference is that it needs an account and keeps your cards in one place.</p>
        <ol>
          {appSteps.map((s) => (
            <li key={s.t}><strong>{s.t}.</strong> {s.d}</li>
          ))}
        </ol>
        <h3>App or website?</h3>
        <ul>
          <li>Website: a one-off trip, a larger screen, or when the app is crashing. No registration.</li>
          <li>App: frequent trips, group filing (travel guides report up to ten travelers per group submission; check the current limit in the app), or having the QR at hand without opening your email. It also offers more languages, including Japanese, Korean, Russian and Arabic.</li>
        </ul>

        <h2 id="family" className="scroll-mt-24">Filing for a family or a group</h2>
        <p>
          The system is built around one card per person. Every traveler, including a baby with their own passport, must have a card in their own name. A parent or group leader can fill them all in. The app has a group option that takes several travelers in one session.
        </p>
        <p>
          One warning. Travelers on the Bali forum report that a group submission returned a QR for the leader only, while the other members got an arrival card number but no code. Glitch or design, the safe approach is the same: after submitting, confirm that every person has their own QR. If not, look them up on the <a href={site.officialRetrieve} {...ext}>retrieve page</a> or submit an individual card for that person.
        </p>
        <h3>Tips for doing several in a row</h3>
        <ul>
          <li>Line up the passports in the order you will type them and tick each one off.</li>
          <li>Use the same email for all cards, then rename each file with the traveler's name.</li>
          <li>Flight, port and address are the same for everyone; never copy a passport number from one card to the next.</li>
          <li>For a child, purpose of visit and address are those of the accompanying adult.</li>
        </ul>

        <h2 id="health-customs" className="scroll-mt-24">Health and customs sections explained</h2>
        <h3>Health declaration</h3>
        <p>
          Two things are asked: current symptoms and travel history. Answer yes to symptoms if you have a fever, cough, breathing difficulty or similar signs of infection. Then list the countries visited in the previous 21 days, the incubation period the Ministry of Health uses for the diseases it monitors. A yes may mean a temperature check or a few questions on arrival. A false no is an offence.
        </p>
        <h3>Customs declaration</h3>
        <p>Answer yes if any of these applies to you or to the family you declare for:</p>
        <ul>
          <li>Cash, cheques or other bearer instruments worth IDR 100 million or more, in any currency.</li>
          <li>Personal goods worth more than USD 500 in total, or more than 1 litre of alcohol, 200 cigarettes, 25 cigars or 100 grams of tobacco.</li>
          <li>Goods for sale or for a business, samples included.</li>
          <li>Narcotics, weapons, ammunition or pornography. These are prohibited outright.</li>
        </ul>
        <p>You also state how many bags you have. Full allowances and a quick calculator are on our <Link href="/customs">customs page</Link>.</p>
        <h3>Quarantine declaration</h3>
        <p>Answer yes if you carry live animals, animal products, plants, seeds, fruit, vegetables or other fresh food. Some need a health or phytosanitary certificate; most are inspected or confiscated. Sealed packaged snacks are usually fine, but answer about what you actually carry.</p>
        <h3>IMEI registration</h3>
        <p>A phone bought abroad works on an Indonesian SIM for up to 90 days without registration. Staying longer? Answer yes to the IMEI question and show the QR to the customs officer, who completes the registration. The usual limit is two devices per traveler, and tax may apply above the allowance. Short visits need nothing.</p>

        <h2 id="after" className="scroll-mt-24">After submitting</h2>
        <h3>The QR email</h3>
        <p>The confirmation arrives within minutes. Save the attachment, screenshot the full code and print it if you can. Keep it in one album with your passport photo page.</p>
        <h3>Lost QR</h3>
        <p>Use the <a href={site.officialRetrieve} {...ext}>retrieve page on the official portal</a>. It looks up your submission with your passport details and email (check on the portal, the fields may change) and lets you download the card again. In the app, the card stays in your account.</p>
        <h3>Airline check-in</h3>
        <p>The card is an Indonesian requirement, not an airline one, but ground staff on many routes check it before printing a boarding pass. Have the QR open at the counter and at the gate.</p>
        <h3>Immigration</h3>
        <p>At the large airports you go to an autogate if you hold a biometric passport and a visa or exemption the gate supports. Place the passport on the reader, look at the camera, and the system checks that a valid arrival card exists for that passport. If the gate cannot match you, go to a counter and show the QR with your passport. Visa on arrival is paid before immigration; the card does not replace it.</p>
        <h3>Customs</h3>
        <p>After baggage claim, scan the QR at the customs kiosk. Nothing declared and no random check: green channel. Something declared: red channel, where an officer inspects or assesses duty. Keep receipts for expensive items.</p>

        <h2 id="problems" className="scroll-mt-24">App and portal problems, and fixes</h2>
        <table>
          <thead><tr><th>Problem</th><th>What to do</th></tr></thead>
          <tbody>
            {problems.map((r) => (
              <tr key={r.p}><td className="font-medium">{r.p}</td><td>{r.f}</td></tr>
            ))}
          </tbody>
        </table>

        <h2 id="mistakes" className="scroll-mt-24">Common mistakes</h2>
        <ul>
          {mistakes.map((r) => (
            <li key={r.m}><strong>{r.m}.</strong> {r.c}</li>
          ))}
        </ul>

        <h2 id="faq" className="scroll-mt-24">Frequently asked questions</h2>
      </div>
      <div className="divide-y divide-slate-200">
        {faqs.map((f) => (
          <details key={f.q} className="group py-4">
            <summary className="cursor-pointer text-lg font-semibold">{f.q}</summary>
            <p className="mt-2 text-ink-700">{f.a}</p>
          </details>
        ))}
      </div>

      <div className="prose-basic">
        <h2 id="sources" className="scroll-mt-24">Sources</h2>
        <p>Pages we relied on, all checked on 23 September 2026. Rules change; the official portal always wins over this page.</p>
        <ul>
          <li><a href={site.officialPortal} {...ext}>All Indonesia official portal</a>, its <a href="https://allindonesia.imigrasi.go.id/help" {...ext}>help centre</a> and <a href={site.officialRetrieve} {...ext}>retrieve page</a>, Directorate General of Immigration.</li>
          <li><a href={GOOGLE_PLAY} {...ext}>All Indonesia on Google Play</a> and <a href={APP_STORE} {...ext}>on the App Store</a>, listings and user reviews.</li>
          <li><a href="https://cirebon.imigrasi.go.id/component/content/article/all-indonesia-indonesia-arrival-card?catid=19&Itemid=101" {...ext}>All Indonesia (Indonesia Arrival Card)</a>, Cirebon Immigration Office.</li>
          <li><a href="https://karawang.imigrasi.go.id/begini-tata-cara-registrasi-aplikasi-all-indonesia-untuk-pengajuan-kartu-kedatangan/" {...ext}>How to register in the All Indonesia app</a>, Karawang Immigration Office.</li>
          <li><a href="https://rr-asia.woah.org/app/uploads/2025/09/2025-09-All-Indonesia-Arrival-Card-Guide.pdf" {...ext}>All Indonesia Arrival Card guide (PDF)</a>, WOAH Asia-Pacific, September 2025.</li>
          <li><a href="https://en.wikipedia.org/wiki/All_Indonesia_Arrival_Card" {...ext}>All Indonesia Arrival Card</a>, Wikipedia, rollout timeline and sections of the form.</li>
          <li><a href="https://www.indonesia.travel/gb/en/news-update/escape-long-immigration-queue-with-autogate-system-at-these-2-international-airports-in-indonesia" {...ext}>Autogate system at international airports</a>, Wonderful Indonesia.</li>
          <li><a href="https://www.beacukai.go.id/" {...ext}>Directorate General of Customs and Excise</a>, allowances and the cash rule.</li>
          <li>Tripadvisor Bali forum: <a href="https://www.tripadvisor.com/ShowTopic-g294226-i7220-k15418615-o90-Indonesia_All_Indonesia_Arrival_Card-Bali.html" {...ext}>All Indonesia arrival card</a>, <a href="https://www.tripadvisor.com/ShowTopic-g294226-i7220-k15459210-Wrong_date_on_the_All_Indonesia_arrival_card-Bali.html" {...ext}>wrong date on the card</a>, <a href="https://www.tripadvisor.com/ShowTopic-g294226-i7220-k15557283-Only_one_QR_for_a_group_Arrival_card-Bali.html" {...ext}>only one QR for a group</a>.</li>
          <li>Travel guides used to cross-check the flow: <a href="https://blog.wego.com/all-indonesia-arrival-card/" {...ext}>Wego</a>, <a href="https://www.welcomebacktobali.com/blog/latest-updates/the-new-all-indonesia-arrival-card" {...ext}>Welcome Back to Bali</a>, <a href="https://bali.com/bali/all-indonesia/" {...ext}>bali.com</a>, <a href="https://emerhub.com/indonesia/all-indonesia-arrival-card-a-guide-for-tourists/" {...ext}>Emerhub</a>, <a href="https://thesmartlocal.com/read/all-indonesia-app/" {...ext}>TheSmartLocal</a>, <a href="https://www.zoomtravel-international.com/post/all-indonesia-e-arrival-card-batam-update-2025" {...ext}>Zoom Travel</a>.</li>
        </ul>
      </div>

      <div className="card mt-10 bg-slate-50">
        <h2 className="text-xl font-bold">Prefer to have it prepared and checked?</h2>
        <p className="mt-2 text-ink-700">
          Our team prepares your card from a short guided form, checks every field against your passport, submits it inside the 72-hour window and emails the QR code. From {price} per traveler. Useful for families, groups, or if you would rather not deal with the portal.
        </p>
        <Link href="/apply" className="btn-primary mt-4">Use the assistance service</Link>
        <p className="mt-4 text-sm text-ink-500">
          Flying in more than 3 days? <Link className="underline" href="/reminder">Set a reminder</Link> and we tell you when the window opens.
        </p>
      </div>
    </div>
  );
}
