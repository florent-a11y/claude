/**
 * The conversation shown in the hero and as the recorded example when the live demo is off. It is the same in
 * every site language on purpose: the point is one assistant answering each guest in their own language.
 */
export type ScriptedMessage =
  | { from: "guest" | "assistant"; lang: string; text: string }
  /** A system line in the chat: the hand-off to staff. Its text comes from the site dictionary. */
  | { from: "note" };

export const HERO_CHAT: ScriptedMessage[] = [
  { from: "guest", lang: "en", text: "Hi! Can I book a couple massage tomorrow at 4 pm? My name is Emma." },
  {
    from: "assistant",
    lang: "en",
    text: "Hi Emma! You are booked: couple massage tomorrow at 4:00 pm, 90 minutes, IDR 850,000 for two. See you then!",
  },
  { from: "note" },
  { from: "guest", lang: "zh", text: "你好，你们周日营业吗？" },
  { from: "assistant", lang: "zh", text: "您好！我们每天营业，包括周日，时间是上午9点到晚上9点。需要帮您预约吗？" },
  { from: "guest", lang: "fr", text: "Bonsoir, peut-on payer par carte ?" },
  {
    from: "assistant",
    lang: "fr",
    text: "Bonsoir ! Oui, nous acceptons les cartes, le QRIS et les espèces. Souhaitez-vous réserver un soin ?",
  },
  { from: "guest", lang: "id", text: "Kak, bisa pindah booking saya ke hari Jumat?" },
  { from: "assistant", lang: "id", text: "Bisa, Kak. Jumat masih kosong pukul 10.00 dan 14.00. Mau yang mana?" },
];
