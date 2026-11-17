/**
 * English copy. This file is the shape every other language must follow: content/id.ts is typed against it,
 * so a missing or extra key in Indonesian fails `npm run typecheck`.
 */
export const en = {
  meta: {
    title: "Lancar AI | Practical AI for small and medium businesses in Bali and Jakarta",
    titleTemplate: "%s | Lancar AI",
    description:
      "We come to your business, study how your team works and set up AI that saves hours every week: replies in any language, bookings, invoices, reports. On-site audit at a fixed price, in English and Indonesian.",
  },

  nav: {
    services: "Services",
    process: "How we work",
    sectors: "Sectors",
    pricing: "Pricing",
    about: "About",
    blog: "Blog",
    contact: "Contact",
    demo: "Live demo",
    quiz: "Readiness quiz",
    cta: "Free call",
    openMenu: "Open menu",
    closeMenu: "Close menu",
    language: "Language",
    home: "Lancar AI home",
  },

  common: {
    whatsapp: "Chat on WhatsApp",
    bookCall: "Book a free 30-minute call",
    contactUs: "Contact us",
    learnMore: "Learn more",
    whatsappGreeting: "Hello Lancar AI, I would like to book a free call about my business.",
    fictional: "Fictional example",
    from: "From",
    free: "Free",
  },

  footer: {
    tagline: "On-site AI consulting for small and medium businesses in Bali and Jakarta.",
    explore: "Explore",
    try: "Try it",
    contact: "Contact",
    areas: "On site in Bali and Greater Jakarta",
    languages: "We speak Indonesian and English",
    privacy: "Privacy notice",
    rights: "All rights reserved.",
  },

  home: {
    hero: {
      eyebrow: "On-site AI consulting · Bali and Jakarta",
      title: "AI that fits the way your business *really works*",
      subtitle:
        "We come to your business, see how your team works and set up AI helpers for the repetitive part: replies in any language, bookings, invoices, reports. Then we stay by your side until it all runs smoothly.",
      secondaryCta: "Check your AI readiness",
      points: ["On site, in person", "Indonesian and English", "Fixed prices, shown upfront"],
      chat: {
        business: "Spa Embun Pagi · Ubud",
        status: "AI assistant · replies in seconds",
        caption: "One WhatsApp line, four languages, nobody awake at the front desk.",
        staffNote: "Staff notified: new booking, tomorrow 16:00, 2 guests",
        typing: "Typing",
      },
    },
    languages: {
      caption: "Your customers write in their own language. Your assistant answers in it.",
    },
    pains: {
      title: "Does this sound *familiar?*",
      items: [
        {
          title: "Messages wait until morning",
          body: "A guest asks about a booking at 11 pm. By the time someone replies, they have booked somewhere else.",
        },
        {
          title: "The same ten questions, every day",
          body: "Opening hours, prices, location, availability. Your best people spend the day copying and pasting answers.",
        },
        {
          title: "Admin eats the evenings",
          body: "Invoices, payment reminders, daily recaps and stock lists get done after closing, by hand, across three spreadsheets.",
        },
        {
          title: "Customers write in languages nobody speaks",
          body: "Mandarin, Korean, Russian, French. The enquiry is real, but the reply is a guess from a translation app.",
        },
      ],
    },
    functions: {
      title: "What AI can take off your *team's plate*",
      intro:
        "Not robots replacing people. Helpers that handle the repetitive part, so your team has time for customers and for the work that needs a human.",
      cta: "See all services",
    },
    process: {
      title: "How *we work*",
      intro: "Four steps. You know the price before each one.",
      cta: "See the method in detail",
    },
    why: {
      title: "Why not just subscribe to a *chatbot?*",
      intro:
        "You can, and sometimes that is the right answer. We will tell you when it is. But most of the value is not in the tool.",
      points: [
        {
          title: "We start from your business, not from a product",
          body: "We are not tied to any product. We work with Claude, ChatGPT, Gemini, Grok and others, and recommend whichever fits your case, your budget and your data.",
        },
        {
          title: "We see what a form cannot",
          body: "How the front desk really takes bookings, which spreadsheet is the true one, what the owner checks at night. That is where the hours are, and you only find it on site.",
        },
        {
          title: "Your team stays in charge",
          body: "Every assistant we set up can hand over to a person, and your staff learn to correct and improve it. The accounts and the data remain yours.",
        },
      ],
    },
    sectors: {
      title: "Built for the businesses *we know*",
      intro: "Examples from the sectors we work with most. If yours is not here, the method is the same.",
    },
    try: {
      title: "See it before you *believe it*",
      demoTitle: "Talk to a live AI assistant",
      demoBody:
        "Chat with the assistant of a fictional spa, restaurant, clinic or supplier. Write in any language and try to make a booking.",
      demoCta: "Try the demo",
      quizTitle: "How ready is your business for AI?",
      quizBody:
        "Ten questions, two minutes. You get a score and three concrete ideas for your business. No email needed to see the result.",
      quizCta: "Take the quiz",
    },
    pricing: {
      title: "Clear prices from the *first step*",
      intro: "The audit fee is deducted in full from your implementation if you go ahead.",
      cta: "See full pricing",
    },
    faq: {
      title: "Questions owners *ask us*",
      items: [
        {
          q: "Will AI replace my staff?",
          a: "That is not what we set up. The assistants take over repetitive tasks such as answering the same questions or copying data between files. Your team keeps the work that needs judgement, and usually gets time back for customers.",
        },
        {
          q: "My team is not technical. Is that a problem?",
          a: "No. Most solutions work inside what your team already uses, such as WhatsApp and spreadsheets. Training is part of every implementation, in Indonesian or English.",
        },
        {
          q: "Is my customer data safe?",
          a: "Accounts are opened in your company's name, so you own them and the data. The audit report explains where each piece of data goes, and we recommend business plans that do not use your data to train AI models. Sensitive data such as health or payment details gets extra care, or stays out of AI entirely.",
        },
        {
          q: "What does it cost to run every month?",
          a: "It depends on the solution and the volume. Some run on a monthly subscription, others are billed by usage. The audit report gives an estimate for each recommendation before you decide anything.",
        },
        {
          q: "WhatsApp already offers free automatic replies. Why would I need you?",
          a: "For simple automatic replies a free tool may be enough, and we will say so. Things change when the assistant needs your real availability and prices, several languages, bookings, or a link to your other systems. That is also where most of the saved hours are.",
        },
        {
          q: "What if the AI gives a wrong answer?",
          a: "It can happen, as it does with a new member of staff. We limit it in three ways: the assistant answers only from information you approved, it hands over to a person when it is unsure, and your team reviews conversations in the first weeks so we can correct it.",
        },
        {
          q: "Do you work outside Bali and Jakarta?",
          a: "Our on-site work covers Bali and Greater Jakarta. For other locations in Indonesia, contact us: we can combine remote work with a shorter visit.",
        },
      ],
    },
    cta: {
      title: "Start with a 30-minute *conversation*",
      body: "Tell us about your business. If AI is not the answer to your problem, we will say so.",
    },
  },

  /** The six areas of work, shown on the home page (first three examples) and in full on the services page. */
  functions: {
    messages: {
      title: "Customer messages and bookings",
      body: "Instant, accurate replies on WhatsApp, Instagram and email, in the customer's language, around the clock.",
      examples: [
        "Answers questions on prices, hours and availability from your own information",
        "Takes bookings and changes, then notifies your staff",
        "Hands over to a person the moment it is unsure",
        "Replies in the customer's language, and summarises the chat for your team in yours",
        "Sends confirmations and reminders to reduce no-shows",
      ],
    },
    sales: {
      title: "Sales and marketing",
      body: "Follow up every lead and keep your channels active without adding to anyone's workload.",
      examples: [
        "Follows up enquiries that went quiet",
        "Drafts posts, captions and promotions in your tone, in Indonesian and English",
        "Asks happy customers for a review and drafts replies to the ones you receive",
        "Prepares quotes and proposals from a short brief",
        "Keeps product and menu descriptions consistent across every platform",
      ],
    },
    finance: {
      title: "Finance and admin",
      body: "Less typing, fewer mistakes, and numbers that are up to date when you need them.",
      examples: [
        "Reads receipts and supplier invoices into your spreadsheet or accounting software",
        "Prepares invoices and polite payment reminders",
        "Sends a daily sales and cash recap to the owner's WhatsApp",
        "Matches bank transfers with invoices and flags what is missing",
        "Collects the documents your accountant asks for every month",
      ],
    },
    operations: {
      title: "Operations and stock",
      body: "The daily routine, written down once and followed every time.",
      examples: [
        "Low-stock alerts and draft purchase orders",
        "Daily checklists and handover notes between shifts",
        "Turns voice notes from the field into structured reports",
        "Tracks supplier deliveries and chases late ones",
        "Schedules maintenance and housekeeping from your bookings",
      ],
    },
    team: {
      title: "Team and HR",
      body: "Give every member of staff the answer they need without waiting for the manager.",
      examples: [
        "Builds staff schedules and handles shift swaps",
        "Answers staff questions on your procedures and policies",
        "Creates onboarding guides and training material for new hires",
        "Translates instructions between Indonesian and English",
        "Prepares attendance and overtime summaries for payroll",
      ],
    },
    owner: {
      title: "Decisions for the owner",
      body: "See how the business is doing without opening five files.",
      examples: [
        "One weekly summary instead of five spreadsheets",
        "Ask questions about your own numbers in plain language",
        "Shows what sells, what does not and where time is lost",
        "Compares outlets, staff shifts or seasons side by side",
        "Warns you when a number moves outside its usual range",
      ],
    },
  },

  services: {
    metaTitle: "Services",
    metaDescription:
      "What Lancar AI sets up for small and medium businesses: customer replies and bookings, sales and marketing, finance and admin, operations, HR and owner reporting.",
    title: "What we can *set up* for you",
    intro:
      "Every business is different, which is why we start with an audit. These are the areas where we most often find hours to give back.",
    examplesLabel: "Typical examples",
    tools: {
      title: "We connect to what you already use",
      body: "There is no need to change your systems first. Typical connections:",
      items: [
        "WhatsApp Business, Instagram and email",
        "Google Sheets, Excel and Google Drive",
        "Booking and property management systems",
        "Point-of-sale and stock systems",
        "Accounting software",
        "Google Business Profile and review sites",
      ],
    },
    models: {
      title: "Which AI do you use?",
      body: "We work with Claude, ChatGPT, Gemini, Grok and others. The choice depends on the task, the languages, the cost and how sensitive the data is. Your audit report explains our pick for each solution, and what it costs to run.",
    },
    notFit: {
      title: "When we will tell you not to use AI",
      items: [
        "When a simple template or a free feature does the job",
        "When the process itself is unclear: we help you fix that first",
        "When a mistake would be costly and nobody could check the result",
      ],
    },
  },

  process: {
    metaTitle: "How we work",
    metaDescription:
      "The Lancar AI method: a free call, an on-site audit with a written report, implementation with staff training, and ongoing accompaniment.",
    title: "From a first call to a team that *runs it alone*",
    intro: "Four steps. Each has a clear deliverable and a price you know in advance.",
    steps: [
      {
        title: "Free call",
        body: "30 minutes by phone, video or WhatsApp. You tell us what takes your team's time, and we tell you honestly whether AI can help.",
        short: "You tell us what hurts. We tell you honestly whether AI can help.",
        bullets: [
          "We ask about your team, your customers and your daily routine",
          "You get a first opinion and the audit price for your size",
          "No obligation, and no sales pitch",
        ],
      },
      {
        title: "On-site audit",
        body: "We come to your business, talk to the people who do the work and follow it from the first customer message to the final invoice.",
        short: "We visit, talk to your team and follow the work. You get a written report with priorities, costs and time saved.",
        bullets: [],
      },
      {
        title: "Build and train",
        body: "You choose what to build from the report. We set it up, connect it to the tools you already use and train your staff until they are comfortable.",
        short: "We set up the solutions you choose, connect them to your tools and train your staff.",
        bullets: [
          "We start with the one or two solutions that pay back fastest",
          "Everything is tested on your real cases before it goes live",
          "Staff are trained on site and receive a short guide in their language",
          "A person can always take over from the assistant",
          "Accounts are opened in your company's name: the data and the set-up are yours",
        ],
      },
      {
        title: "Accompany",
        body: "A business changes: prices, menus, staff, seasons. We stay with you so the assistants keep up, and your team always has someone to call.",
        short: "We check in, adjust and improve as your business changes.",
        bullets: [
          "A regular review of what the assistants did, and of what they missed",
          "Adjustments when your prices, services or team change",
          "Training for new staff",
          "A direct WhatsApp line to someone who knows your set-up",
        ],
      },
    ],
    tags: { free: "Free", from: "From {price}", quote: "Fixed quote", monthly: "Monthly, optional" },
    audit: {
      lookTitle: "What we look at",
      look: [
        "How enquiries and bookings arrive, and who answers them",
        "How sales, payments and invoices are recorded",
        "How stock, suppliers and schedules are managed",
        "Which tools, spreadsheets and chat groups the team really uses",
        "Where staff lose time, and what they would love to stop doing",
      ],
      receiveTitle: "What you receive",
      receive: [
        "A written report in Indonesian or English, within seven working days of the visit",
        "A map of your main processes as they really run",
        "A ranked list of opportunities, each with estimated hours saved, set-up cost and monthly running cost",
        "Quick wins your team can apply straight away, for free",
        "A fixed-price quote for the solutions worth building",
      ],
      needTitle: "What we need from you",
      need: [
        "Access to the workplace during the visit",
        "Time with the owner or manager, and with the staff who do the daily work",
        "A look at the tools and files you use, under a confidentiality agreement signed beforehand",
      ],
    },
  },

  sectors: {
    metaTitle: "Sectors",
    metaDescription:
      "How Lancar AI helps hospitality and wellness, restaurants and retail, clinics and service firms, and trading and manufacturing businesses in Bali and Jakarta.",
    title: "Sectors we *work with*",
    intro: "The method is the same everywhere. The examples are not. Pick the one closest to your business.",
    painsTitle: "Where the hours go",
    solutionsTitle: "What we typically set up",
    scenarioLabel: "Illustrative example",
    demoCta: "Try a live assistant for this sector",
    otherTitle: "Other sectors",
    items: {
      hospitality: {
        name: "Hospitality and wellness",
        short: "Villas, hotels, spas, salons, tour and activity operators.",
        title: "AI for villas, hotels, spas and tour operators",
        intro:
          "Guests decide fast and write at all hours, in every language. The business that answers first, clearly, usually gets the booking.",
        pains: [
          "Enquiries arrive at night and on platforms nobody is watching",
          "The same questions about prices, location, transfers and availability, all day",
          "Bookings copied by hand between WhatsApp, the calendar and the booking system",
          "Reviews left unanswered because nobody has the time",
        ],
        solutions: [
          {
            title: "A multilingual booking assistant",
            body: "Replies on WhatsApp and Instagram in the guest's language, checks your real availability, takes the booking and notifies the front desk.",
          },
          {
            title: "Guest messages before, during and after the stay",
            body: "Check-in details, directions, house rules, upsell offers such as transfers or treatments, and a thank-you note with a review request.",
          },
          {
            title: "One calendar instead of three",
            body: "Bookings from direct chats and platforms land in the same place, with housekeeping and therapist schedules built from them.",
          },
          {
            title: "Review replies in your voice",
            body: "Drafts a personal reply to every review, in the language it was written in, for a manager to approve.",
          },
          {
            title: "A daily recap for the owner",
            body: "Occupancy, bookings, revenue and open issues, sent to your WhatsApp every morning.",
          },
        ],
        scenario:
          "A spa in Ubud receives a message in Mandarin at 22:40 asking about a couple massage for the next day. The assistant replies in Mandarin with the price and two free slots, confirms the booking, and the therapist schedule is updated before the team arrives in the morning.",
      },
      food: {
        name: "Restaurants, cafes and retail",
        short: "Reservations, orders, stock, suppliers, reviews and social media.",
        title: "AI for restaurants, cafes and shops",
        intro:
          "Margins are thin and the day is long. The gains are in the routine: reservations, orders, stock and the paperwork after closing.",
        pains: [
          "Reservations and orders scattered across WhatsApp, Instagram and phone calls",
          "Stock counted by hand, and ordered when it has already run out",
          "The daily sales recap typed up after closing time",
          "Social media that goes quiet whenever the team is busy",
        ],
        solutions: [
          {
            title: "Reservations and orders on WhatsApp",
            body: "Takes table bookings, catering and pre-orders, answers menu and allergy questions from your own menu, and sends the summary to the kitchen or the cashier.",
          },
          {
            title: "Stock alerts and purchase orders",
            body: "Compares sales with stock, warns you before an item runs out and drafts the order to your supplier.",
          },
          {
            title: "The closing report, written for you",
            body: "Reads the day's sales from your point-of-sale system or spreadsheet and sends the owner a recap by outlet.",
          },
          {
            title: "Content that keeps going",
            body: "A week of posts and captions prepared from your menu and promotions, in Indonesian and English, ready for you to approve.",
          },
          {
            title: "Supplier invoices without retyping",
            body: "A photo of the invoice becomes a line in your purchases file, with price changes flagged.",
          },
        ],
        scenario:
          "A restaurant in South Jakarta used to answer every reservation by hand between services. With an assistant on its WhatsApp line, guests get a confirmed table in under a minute, the private-room rules are explained the same way every time, and the manager only steps in for large events.",
      },
      services: {
        name: "Clinics and professional services",
        short: "Clinics, agencies, property, legal and accounting firms.",
        title: "AI for clinics, agencies and professional firms",
        intro:
          "Your time is what you sell. Every hour spent on scheduling, reminders and paperwork is an hour not spent with a patient or a client.",
        pains: [
          "Appointment requests and reschedules interrupt the front desk all day",
          "No-shows because nobody had time to send reminders",
          "Documents collected from clients one message at a time",
          "Proposals, reports and letters rewritten from scratch each time",
        ],
        solutions: [
          {
            title: "Appointments and reminders",
            body: "Books, reschedules and reminds patients or clients on WhatsApp, and passes anything medical or sensitive to your staff.",
          },
          {
            title: "Client intake and document collection",
            body: "Asks for the right documents, checks what is missing and files what arrives, so your team starts with a complete folder.",
          },
          {
            title: "First drafts in minutes",
            body: "Proposals, engagement letters, reports and meeting notes drafted from your own templates, for a professional to review and sign.",
          },
          {
            title: "An internal knowledge assistant",
            body: "Staff ask questions about your procedures, price list or past cases and get an answer with its source.",
          },
          {
            title: "Invoicing and follow-up",
            body: "Invoices prepared from completed work, and polite reminders sent when payment is late.",
          },
        ],
        scenario:
          "A dental clinic in Jakarta loses several appointments a week to no-shows. An assistant confirms each booking the day before, offers a new time to patients who cannot come and fills freed slots from the waiting list, while every question about treatment still goes to the clinic's staff.",
      },
      trading: {
        name: "Trading and manufacturing",
        short: "Distributors, importers, workshops and small factories.",
        title: "AI for distributors, importers and workshops",
        intro:
          "Orders come in by chat, prices live in a spreadsheet, and the owner is the only person who knows everything. That is the bottleneck we remove.",
        pains: [
          "Price and stock questions answered one by one, by the same two people",
          "Quotes that take a day because the price list is in someone's head",
          "Orders retyped from WhatsApp into the system, with errors",
          "Unpaid invoices nobody chases until cash gets tight",
        ],
        solutions: [
          {
            title: "Price and stock answers on WhatsApp",
            body: "Customers and sales staff ask for a price, a minimum order or stock level and get the answer from your own list, around the clock.",
          },
          {
            title: "Quotes in minutes",
            body: "A request in a chat becomes a formatted quote with your terms, ready for a salesperson to check and send.",
          },
          {
            title: "Orders without retyping",
            body: "Orders received by chat, email or PDF are read into your order sheet or system, with unclear lines flagged for a person.",
          },
          {
            title: "Receivables follow-up",
            body: "A weekly list of what is due, and reminders sent to customers in the right tone at the right time.",
          },
          {
            title: "Reports from the floor",
            body: "Production, delivery and quality notes sent as voice messages become a structured daily report.",
          },
        ],
        scenario:
          "A packaging supplier in East Jakarta answers dozens of price requests a day. With its price list and stock connected to an assistant, cafe owners get a quote on WhatsApp within a minute, and the sales team spends its time on large accounts and custom orders.",
      },
    },
  },

  pricing: {
    metaTitle: "Pricing",
    metaDescription:
      "Lancar AI pricing: a free 30-minute call, an on-site audit at a fixed price by company size and deducted from implementation, then fixed quotes per solution.",
    title: "Prices you know *in advance*",
    intro: "You always know the price before you commit to the next step.",
    call: { title: "Discovery call", price: "Free", body: "30 minutes by phone, video or WhatsApp. No obligation." },
    audit: {
      title: "On-site audit",
      credit: "Deducted in full from your implementation if you go ahead.",
      tiers: {
        micro: { name: "Small team", staff: "Up to 10 staff", visit: "Half-day visit" },
        small: { name: "Growing business", staff: "11 to 50 staff", visit: "One-day visit" },
        medium: { name: "Established company", staff: "51 to 200 staff", visit: "Two-day visit" },
      },
      includesTitle: "Every audit includes",
      includes: [
        "Interviews with the owner and the staff who do the daily work",
        "A written report in Indonesian or English",
        "A ranked list of opportunities with hours saved, set-up cost and running cost",
        "Free quick wins your team can apply straight away",
        "A fixed-price quote for the solutions worth building",
      ],
      cta: "Book the free call first",
    },
    implementation: {
      title: "Implementation",
      price: "Fixed quote",
      body: "Each solution in your audit report comes with a fixed price. You choose what to build and in which order. The audit fee is deducted from your first implementation invoice.",
    },
    accompaniment: {
      title: "Monthly accompaniment",
      price: "Optional",
      body: "Regular reviews, adjustments and staff training after go-live. Quoted with your proposal, according to how much support you want.",
    },
    notes: [
      "Prices are in rupiah and exclude applicable taxes.",
      "On-site visits in Bali and Greater Jakarta are included. Travel to other locations is quoted separately.",
      "AI subscriptions and usage fees are paid by you directly to the provider, on accounts in your name. We estimate them in the report.",
      "More than 200 staff, or several locations? Contact us for a tailored proposal.",
    ],
    faq: {
      title: "Pricing questions",
      items: [
        {
          q: "Why is the audit not free?",
          a: "A serious audit takes on-site time and several days of analysis. Charging for it keeps us independent: we are paid to give you an honest report, not to sell you a project. And if you go ahead, the fee comes off your implementation.",
        },
        {
          q: "What if the audit finds nothing worth building?",
          a: "Then the report says so, and tells you what to fix first. You still receive the process map and the free quick wins. We would rather tell you that than build something you do not need.",
        },
        {
          q: "Can I implement the recommendations myself, or with someone else?",
          a: "Yes. The report is yours. Many of the quick wins are written so that your team can apply them without us.",
        },
        {
          q: "How do I pay?",
          a: "By bank transfer against an invoice. Payment terms are stated in each quote.",
        },
      ],
    },
  },

  about: {
    metaTitle: "About",
    metaDescription:
      "Lancar AI is an on-site AI consultancy for small and medium businesses in Bali and Jakarta. We speak Indonesian and English.",
    title: "About *Lancar AI*",
    lead: "Lancar is the Indonesian word for smooth, flowing, without a hitch. It is what every owner wants from their business, and it is what we are here to help with.",
    story: [
      "Large companies have consultants who study their processes and bring in AI where it pays. Small and medium businesses usually get a software subscription and a tutorial video. Yet a spa with eight staff or a distributor with forty loses just as many hours to repetitive work, and feels it more.",
      "Lancar AI was created to close that gap in Bali and Jakarta. We are consultants who come on site, speak Indonesian and English, and stay with your team from the first conversation until the new way of working feels normal.",
    ],
    principlesTitle: "How we behave",
    principles: [
      {
        title: "We come to you",
        body: "We learn your business by being there: at the front desk, in the kitchen, in the warehouse, next to the person who does the work.",
      },
      {
        title: "Plain language",
        body: "No jargon. Reports, training and support are in Indonesian or English, written so that the whole team can use them.",
      },
      {
        title: "Honest recommendations",
        body: "We are not tied to any AI provider or software vendor. If a free tool is enough, or if AI is not the answer, we say so.",
      },
      {
        title: "You stay in control",
        body: "Your accounts, your data, your decisions. Every assistant can hand over to a person, and your team learns how to adjust it.",
      },
    ],
    whereTitle: "Where we work",
    where: "On site across Bali and Greater Jakarta. Elsewhere in Indonesia on request.",
  },

  contact: {
    metaTitle: "Contact",
    metaDescription: "Book a free 30-minute call with Lancar AI, by WhatsApp or with the contact form.",
    title: "Let's talk about *your business*",
    intro:
      "The first call is free and takes 30 minutes. Write to us on WhatsApp, or leave your details and we will call or message you back.",
    whatsappTitle: "Fastest: WhatsApp",
    whatsappBody: "Send us a message and tell us what kind of business you run.",
    emailTitle: "Email",
    formTitle: "Or leave your details",
  },

  form: {
    name: "Your name",
    business: "Business name",
    whatsapp: "WhatsApp number",
    whatsappHint: "With country code, for example +62 812 3456 7890",
    email: "Email (optional)",
    location: "Where is your business?",
    locations: { bali: "Bali", jakarta: "Jakarta area", other: "Elsewhere in Indonesia" },
    sector: "Type of business",
    sectors: {
      hospitality: "Hospitality and wellness",
      food: "Restaurant, cafe or retail",
      services: "Clinic or professional services",
      trading: "Trading or manufacturing",
      other: "Other",
    },
    team: "Team size",
    teams: { micro: "Up to 10 staff", small: "11 to 50 staff", medium: "51 to 200 staff" },
    message: "What takes most of your team's time? (optional)",
    consent: "I agree that Lancar AI may contact me about this enquiry and handle my details as described in the",
    consentLink: "privacy notice",
    submit: "Send",
    sending: "Sending",
    choose: "Choose",
    successTitle: "Thank you, we have received your details",
    successBody: "We will contact you on WhatsApp to arrange the call.",
    errorInvalid: "Please check the highlighted fields.",
    errorServer: "We could not save your message. Please write to us on WhatsApp or by email instead.",
    errorRate: "Too many attempts. Please try again in a few minutes.",
    required: "This field is required.",
    invalidWhatsapp: "Enter a phone number with its country code.",
    invalidEmail: "Enter a valid email address.",
    consentRequired: "Please tick the box so we can contact you.",
  },

  quiz: {
    metaTitle: "AI readiness quiz",
    metaDescription:
      "Ten questions, two minutes: find out how much AI could help your business and how ready you are to use it.",
    title: "How ready is your business *for AI?*",
    intro:
      "Ten questions, about two minutes. You get two scores and three concrete ideas for your business. No email needed to see the result.",
    progress: "Question {n} of {total}",
    back: "Back",
    next: "Next",
    seeResult: "See my result",
    multiHint: "Choose all that apply, or none.",
    restart: "Start again",
    questions: {
      sector: {
        q: "What kind of business do you run?",
        options: {
          hospitality: "Hospitality or wellness (villa, hotel, spa, tours)",
          food: "Restaurant, cafe or retail",
          services: "Clinic or professional services",
          trading: "Trading or manufacturing",
          other: "Something else",
        },
      },
      team: {
        q: "How many people work in the business?",
        options: { micro: "1 to 10", small: "11 to 50", medium: "51 to 200" },
      },
      channel: {
        q: "How do most customers contact you?",
        options: {
          whatsapp: "WhatsApp",
          social: "Instagram or other social media",
          phone: "Phone calls",
          platform: "Booking platforms or marketplaces",
          walkin: "They walk in",
        },
      },
      volume: {
        q: "How many messages and enquiries do you get on a normal day?",
        options: { lt10: "Fewer than 10", "10to50": "10 to 50", "50to200": "50 to 200", gt200: "More than 200" },
      },
      afterHours: {
        q: "A customer writes after closing time. When do they get a reply?",
        options: { minutes: "Within minutes", hours: "A few hours later", nextDay: "The next day" },
      },
      languages: {
        q: "Which languages do your customers use?",
        options: { one: "Indonesian only", two: "Indonesian and English", many: "Three languages or more" },
      },
      tasks: {
        q: "Which tasks take too much of your team's time?",
        options: {
          faq: "Answering the same questions again and again",
          booking: "Taking and changing bookings or orders",
          invoices: "Invoices and chasing payments",
          reports: "Daily recaps and reports",
          content: "Social media and marketing content",
          stock: "Stock and purchasing",
          hr: "Staff schedules and HR admin",
        },
      },
      data: {
        q: "Where do your prices, bookings and sales records live?",
        options: {
          paper: "Mostly on paper or in people's heads",
          sheets: "In Excel or Google Sheets",
          software: "In dedicated software (POS, booking system, accounting)",
          mixed: "A mix of everything",
        },
      },
      aiUse: {
        q: "Has your team used AI tools such as ChatGPT or Claude?",
        options: {
          never: "Not yet",
          personal: "Some of us, for personal use",
          work: "Yes, in our daily work",
        },
      },
      owner: {
        q: "Who would lead a change like this in your business?",
        options: {
          owner: "The owner",
          manager: "A manager we trust",
          nobody: "Nobody yet",
        },
      },
    },
    result: {
      title: "Your result",
      opportunity: "Opportunity",
      opportunityHint: "How much repetitive work AI could take over",
      readiness: "Readiness",
      readinessHint: "How easily your business can adopt it today",
      profiles: {
        ready: {
          title: "Ready to implement",
          body: "You have plenty of repetitive work and the foundations to automate it. A focused audit should find solutions that pay back quickly.",
        },
        foundations: {
          title: "Big gains, foundations first",
          body: "There is a lot to win, but some basics need attention first: where information lives, and who leads the change. That is exactly what an audit sorts out.",
        },
        tune: {
          title: "Well organised, room to fine-tune",
          body: "Your business is already in good order. AI will help on specific tasks rather than change everything. Start with one well-chosen quick win.",
        },
        start: {
          title: "Start small",
          body: "The volume is still modest and the basics are not in place yet. Begin with free tools and simple habits. We are happy to point you to them on a call.",
        },
      },
      recsTitle: "Three ideas for your business",
      recs: {
        digitize: {
          title: "Put your key information in one place",
          body: "Prices, services and availability in one shared file. It is the base every assistant needs, and it helps your staff from day one.",
        },
        training: {
          title: "A short AI session for your team",
          body: "Two hours of hands-on practice with the tools on tasks from your own business removes most of the fear and reveals the best ideas.",
        },
        autoReply: {
          title: "An assistant for customer messages",
          body: "Instant answers to the questions you receive every day, from your own information, with a handover to staff when needed.",
        },
        multilingual: {
          title: "Replies in your customers' languages",
          body: "The same assistant answers in Mandarin, Korean, Russian or French and summarises the chat for your team in Indonesian.",
        },
        booking: {
          title: "Bookings and orders taken automatically",
          body: "From the first message to a confirmed slot or order, written into your calendar or sheet, with a reminder to the customer.",
        },
        invoices: {
          title: "Invoices and payment reminders",
          body: "Invoices prepared from completed work and polite reminders sent on schedule, so nothing is forgotten.",
        },
        reports: {
          title: "A daily recap on your WhatsApp",
          body: "Sales, bookings and open issues summarised every morning from the files you already keep.",
        },
        content: {
          title: "A week of content in an hour",
          body: "Posts and captions drafted in your tone from your menu, services and promotions, ready for you to approve.",
        },
        stock: {
          title: "Stock alerts and draft orders",
          body: "A warning before an item runs out, with the supplier order already prepared.",
        },
        hr: {
          title: "Schedules and staff questions",
          body: "Shift plans drafted from your rules, and an assistant that answers staff questions on procedures.",
        },
      },
      tierTitle: "The audit for your size",
      tierBody: "{name}: {price}, deducted from your implementation if you go ahead.",
      leadTitle: "Want to go through this with us?",
      leadBody: "Leave your details and we will call you about your result. The first call is free.",
      whatsappCta: "Send my result on WhatsApp",
      whatsappText: "Hello Lancar AI, I took the readiness quiz. Opportunity: {opportunity}/100, readiness: {readiness}/100. I would like to book a free call.",
    },
  },

  demo: {
    metaTitle: "Live AI assistant demo",
    metaDescription:
      "Chat with a live AI assistant for a fictional spa, restaurant, clinic or supplier. Write in any language and try to make a booking.",
    title: "Talk to a *live* AI assistant",
    intro:
      "These four businesses are fictional. The assistant is real: it runs on Claude and answers only from the fact sheet of the business, the same way we set one up for a client. Write in any language.",
    choose: "Choose a business",
    personas: {
      spa: { name: "Spa Embun Pagi", place: "Ubud, Bali", kind: "Day spa" },
      restaurant: { name: "Dapur Kunyit", place: "South Jakarta", kind: "Indonesian restaurant" },
      clinic: { name: "Klinik Gigi Senyum Cerah", place: "North Jakarta", kind: "Dental clinic" },
      supplier: { name: "Kemasan Nusa Jaya", place: "East Jakarta", kind: "Packaging supplier" },
    },
    greeting: "Hello! I am the AI assistant of {name}. How can I help you today?",
    suggestionsLabel: "Try asking",
    placeholder: "Write a message in any language",
    send: "Send",
    typing: "Typing",
    reset: "New conversation",
    factSheet: "See everything the assistant knows",
    factSheetNote: "This fact sheet is all the assistant was given. For a client, it comes from the audit.",
    disclaimer:
      "Demonstration only: nothing is really booked. Please do not enter personal or payment details. Messages are sent to our AI provider to generate the replies.",
    offline: "The live demo is switched off at the moment. Below is a recorded example of the same assistant.",
    limit: "You have reached the limit for this demo. Thank you for trying it! Contact us to see more.",
    tooLong: "This conversation has reached its maximum length. Start a new one to continue.",
    error: "Something went wrong. Please try again.",
    ctaTitle: "Want one for *your business?*",
    ctaBody: "An assistant like this is one of the solutions we set up after an on-site audit, with your real prices, availability and rules.",
  },

  blog: {
    metaTitle: "Blog",
    metaDescription: "Practical articles on using AI in small and medium businesses in Indonesia.",
    title: "Blog",
    intro: "Practical notes on AI for small and medium businesses. No hype.",
    readMore: "Read the article",
    back: "All articles",
    published: "Published",
    minutes: "{n} min read",
    ctaTitle: "Want to know what applies to *your business?*",
  },

  privacy: {
    metaTitle: "Privacy notice",
    metaDescription: "How Lancar AI handles the personal data you share on this website.",
    title: "Privacy notice",
    updated: "Last updated: 17 November 2026",
    sections: [
      {
        title: "Who we are",
        body: [
          "This website is operated by Lancar AI, an AI consultancy serving small and medium businesses in Bali and Jakarta. For any question about your personal data, contact us using the details on the contact page.",
        ],
      },
      {
        title: "What we collect",
        body: [
          "Contact form and quiz: your name, business name, WhatsApp number, email address if you give one, location, type of business, team size, your message and your quiz answers.",
          "Live demo: the messages you type in the demo chat. Please do not enter personal or payment details there.",
          "Technical data: your IP address is used briefly to prevent abuse of the forms and the demo.",
        ],
      },
      {
        title: "Why we use it",
        body: [
          "We use your details only to reply to your enquiry, arrange a call and prepare a proposal if you ask for one. We do not sell your data and we do not send marketing messages without your consent.",
        ],
      },
      {
        title: "Who processes it",
        body: [
          "Your data is stored with our hosting and database providers and, for notifications, passes through our email provider. Demo chat messages are sent to Anthropic, the provider of the Claude AI model, to generate the replies. These providers act on our instructions and may process data outside Indonesia.",
        ],
      },
      {
        title: "How long we keep it",
        body: [
          "Enquiries are kept for as long as we are in contact with you and for up to two years afterwards, unless you ask us to delete them sooner. Demo chat messages are not stored by this website.",
        ],
      },
      {
        title: "Your rights",
        body: [
          "Under Indonesia's Personal Data Protection Law (Law No. 27 of 2022) you may ask to access, correct or delete your personal data, and withdraw your consent at any time. Write to us and we will act on your request.",
        ],
      },
    ],
  },

  notFound: {
    title: "Page not found",
    body: "The page you are looking for does not exist or has moved.",
    cta: "Back to the home page",
  },
};

export type Dictionary = typeof en;
