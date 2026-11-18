import { site } from "./config";

/**
 * Legal pages, in English (the authoritative version). TEMPLATES: have them reviewed by an Indonesian health-law
 * adviser before launch and adjust the commercial terms (cancellation windows, return periods) to what you really offer.
 */
export interface LegalDoc { key: "terms" | "privacy" | "medical" | "refunds"; updated: string; sections: Array<{ h: string; p?: string[]; ul?: string[] }> }

const operator = () => site.company || site.name;

export const LEGAL_DOCS = ["terms", "privacy", "medical", "refunds"] as const;
export type LegalKey = (typeof LEGAL_DOCS)[number];

export function legalDoc(key: LegalKey): LegalDoc {
  const UPDATED = "2026-11-18";
  switch (key) {
    case "terms":
      return { key, updated: UPDATED, sections: [
        { h: "1. Who we are", p: [`This website is operated by ${operator()} ("we", "us"). We arrange wellness infusions, doctor-reviewed peptide and prescription protocols, supplements and memberships for customers in Bali, Indonesia. By placing an order you accept these terms.`] },
        { h: "2. Who can order", ul: ["You must be 18 or older.", "We deliver and visit only within the service areas in Bali listed on the delivery page.", "You must give true, complete information about yourself and your health."] },
        { h: "3. Prescription items and doctor review", p: ["Items marked \"Doctor review required\" are supplied only after a licensed doctor has reviewed your health questionnaire. The doctor may approve, adjust or decline your request, and may contact you for more information. A request is not a guarantee of supply. You are not charged for prescription items before approval.", "Prescription items are for your personal use only. You must not resell them or give them to anyone else."] },
        { h: "4. Sessions given by a nurse", p: ["Before an infusion or injection the nurse checks your vital signs and history, and may adjust, postpone or decline the treatment on safety grounds. If a treatment is declined on site for a medical reason, you are refunded for that treatment."] },
        { h: "5. Prices and payment", p: ["Prices are in Indonesian rupiah and include the taxes that apply. Delivery and call-out fees are shown before you confirm. If you pay by international card, your card is charged in the foreign currency shown at checkout, at a rate we set; your bank may add its own fees.", "Card and e-wallet details are entered on the secure pages of our payment providers and never reach our servers."] },
        { h: "6. Delivery and visits", p: ["We agree a two-hour arrival window with you on WhatsApp. Traffic and weather in Bali can cause delays; we will keep you informed. Someone aged 18 or older must receive the order. Temperature-sensitive items must be refrigerated on arrival."] },
        { h: "7. Cancellations and refunds", p: ["See the Cancellations and refunds page, which forms part of these terms."] },
        { h: "8. Competitive sport", p: ["Several peptides are prohibited under the World Anti-Doping Code. You are responsible for checking the rules of your sport before ordering."] },
        { h: "9. Liability", p: ["Nothing in these terms limits liability that cannot be limited under Indonesian law. Subject to that, we are not liable for loss arising from inaccurate information you gave us, from use of a product against the instructions provided, or from storage after delivery."] },
        { h: "10. Law", p: ["These terms are governed by the laws of the Republic of Indonesia."] },
        { h: "11. Contact", p: [`Questions about these terms: ${site.email}.`] },
      ] };
    case "privacy":
      return { key, updated: UPDATED, sections: [
        { h: "What we collect", ul: ["Contact details: name, email, WhatsApp number.", "Order details: items, address in Bali, requested time, payment method and status, proof of transfer if you upload one.", "Health information you give in the health questionnaire: date of birth, sex, weight, medical conditions, allergies, medication and goals.", "We do not receive or store card or e-wallet details; those go directly to our payment providers."] },
        { h: "Why we use it", ul: ["To review, prepare, deliver and follow up your order.", "Health information: so a doctor and nurse can decide whether a treatment is safe for you. We process it on the basis of your explicit consent, given at checkout.", "To meet legal, tax and medical record-keeping obligations."] },
        { h: "Who sees it", p: ["Health questionnaires are visible only to the medical team. The care team that schedules and delivers sees your contact, address and order, not your health answers. We use service providers for hosting, database storage, payments and email; they process data on our instructions. We do not sell your data and we do not use advertising trackers."] },
        { h: "How long we keep it", p: ["Order and payment records are kept for as long as tax and accounting law requires. Medical records are kept for the period required by Indonesian health regulations. Contact-form messages are deleted after twelve months."] },
        { h: "Your rights", p: [`Under Indonesia's Personal Data Protection Law (Law No. 27 of 2022) you may ask for access to your data, for corrections, for deletion where the law allows, and you may withdraw consent. Write to ${site.email}.`] },
        { h: "On your device", p: ["Your basket is saved in your browser's local storage so it survives a page reload. We set no advertising or analytics cookies."] },
      ] };
    case "medical":
      return { key, updated: UPDATED, sections: [
        { h: "Information, not advice", p: ["The content of this website is general information. It is not medical advice and does not create a doctor-patient relationship. Decisions about prescription items are made by a licensed doctor after reviewing your individual health questionnaire."] },
        { h: "Experimental and unapproved products", p: ["Several peptides offered through this site are not approved medicines. For these, most evidence comes from laboratory and animal studies; benefits in humans are not established and long-term risks are not known. Where a product is a registered medicine, it is prescribed only for an appropriate medical indication. Ask the doctor any question before you decide; you are free to decline."] },
        { h: "Risks of infusions and injections", ul: ["Bruising, pain or irritation at the injection or infusion site.", "Inflammation of the vein, and rarely infection.", "Light-headedness, nausea, flushing or headache.", "Rarely, an allergic reaction, which can be serious."], p: ["Tell the nurse immediately if you feel unwell during or after a treatment."] },
        { h: "Who should not be treated", p: ["We do not treat anyone under 18. Most products are unsuitable during pregnancy and breastfeeding. Some are unsuitable with heart, kidney or liver disease, a history of cancer, G6PD deficiency or certain medication. Complete the questionnaire fully so the doctor can assess this."] },
        { h: "No guaranteed results", p: ["Individual responses vary. Wellness infusions and food supplements are not intended to diagnose, treat, cure or prevent any disease."] },
        { h: "Emergencies", p: ["We are not an emergency service. For chest pain, difficulty breathing, fainting, severe allergic reaction or any emergency, call 112 or go to the nearest hospital."] },
      ] };
    case "refunds":
      return { key, updated: UPDATED, sections: [
        { h: "If the doctor declines", p: ["You are not charged for prescription items before approval. If the doctor declines your request, the order is closed at no cost. If only part of a request is approved, you pay only for what was approved."] },
        { h: "Rescheduling and cancelling a visit", ul: ["Free of charge up to three hours before the start of your arrival window.", "Later cancellations, or nobody present at the address: the call-out fee is charged.", "If a nurse declines a treatment on site for a medical reason, that treatment is refunded in full."] },
        { h: "Products", ul: ["Supplements: unopened, in their original seal, may be returned within seven days of delivery for a refund of the product price.", "Prescription and chilled items cannot be returned once delivered, for safety reasons.", "Anything that arrives damaged, warm when it should be chilled, or different from what was ordered: tell us the same day with a photo and we replace or refund it."] },
        { h: "Memberships", p: ["A membership can be cancelled for a full refund within seven days of payment if no session has been used. After that it runs to the end of the paid month and is not renewed automatically."] },
        { h: "How refunds are paid", p: [`Refunds are made to the original payment method within fourteen days, or by bank transfer if you paid in cash. To request one, reply to your order confirmation or write to ${site.email}.`] },
      ] };
  }
}
