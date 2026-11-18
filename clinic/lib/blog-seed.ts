import type { Post } from "./blog";
import { site } from "./config";

/**
 * Three sample articles (the first also in Russian and French) to show how the blog looks and reads.
 * SAMPLES: they were written without a doctor. Before launch, have your doctor review, correct and sign each one
 * (fill in "Reviewed by"), or delete them. The sources linked are real and were checked in November 2026.
 */
type Seed = Omit<Post, "id" | "createdAt" | "updatedAt" | "status" | "author" | "reviewer">;

const IV_SOURCES = [
  { title: "Cleveland Clinic: IV vitamin therapy, does it work?", url: "https://health.clevelandclinic.org/iv-vitamin-therapy" },
  { title: "MSD Manual: Intravenous vitamin therapy (Myers' cocktail)", url: "https://www.msdmanuals.com/home/special-subjects/dietary-supplements-and-vitamins/intravenous-vitamin-therapy-myers-cocktail" },
];

const SEEDS: Seed[] = [
  {
    locale: "en", slug: "iv-drips-bali-what-they-do", translationKey: "iv-drips-guide", cover: "iv-bag", tags: ["IV therapy", "Hydration"],
    publishedAt: "2026-11-10T02:00:00.000Z",
    title: "IV drips in Bali: what they can and cannot do",
    excerpt: "An honest guide to IV therapy in Bali: what a drip really delivers, who benefits most, what the evidence says and what to ask before you book.",
    takeaways: [
      "An IV drip rehydrates faster than drinking, which matters most when you cannot keep fluids down.",
      "For healthy, well-fed people, evidence that vitamin drips improve energy, immunity or skin is limited.",
      "The main risks are bruising, vein irritation and, rarely, infection or fluid overload. Screening before the drip reduces them.",
      "A drip does not replace a doctor: fever, blood in the stool, chest pain or confusion need a hospital.",
    ],
    body: `IV drips are everywhere in Bali: in clinics, in lounges and at the door of your villa. Some of what is said about them is true, and some is marketing. This guide separates the two.

## What is in an IV drip?

Most wellness drips are built on the same base: half a litre to a litre of sterile fluid with salts (electrolytes) in the same balance as your blood. Vitamins and minerals are added to that base. The best-known recipe, the Myers' cocktail, combines magnesium, calcium, B vitamins and vitamin C.

Because the fluid goes straight into a vein, all of it reaches your bloodstream within the hour. Drinking the same amount works too, only more slowly, and only if your stomach cooperates.

## What does the evidence say?

The honest answer has two parts.

**Fluids work.** Replacing fluid and salts through a vein is standard medicine for dehydration when someone cannot drink enough. Nobody disputes this.

**Vitamins are less clear.** The Cleveland Clinic notes that research on the claimed benefits of IV vitamin therapy is limited. The MSD Manual goes further: very few studies have tested high-dose IV vitamins in people who are not deficient, and none of the claimed health effects has been confirmed. Injected vitamins are proven treatments for people who are actually deficient, which is a different situation.

Many people do report feeling better after a drip. Some of that is rehydration, some is an hour of rest, and some may be expectation. That does not make the feeling less real, but it is a reason to be sceptical of large promises.

## Who is most likely to benefit?

| Situation | How much a drip is likely to help |
|---|---|
| Vomiting or diarrhoea, unable to keep fluids down | A lot: this is what IV fluids are for |
| Dehydrated after heat, a long flight or a hard session | Noticeably, though drinking would also work |
| The day after heavy drinking | Eases dehydration; time does the rest |
| Healthy and hoping for more energy or immunity | Uncertain: the evidence is thin |

## What are the risks?

A drip is a medical procedure, even when it happens beside a pool.

- **Common and minor:** a bruise, or soreness along the vein.
- **Uncommon:** inflammation of the vein, or an allergic reaction to an ingredient.
- **Rare but serious:** infection from poor hygiene, or fluid overload in people with heart or kidney disease.

This is why a nurse should take your blood pressure and ask about your health and medication before starting, and should be willing to say no.

## What should you ask before booking in Bali?

1. Who will place the drip, and are they a registered nurse or doctor?
2. Will my blood pressure, pulse and medical history be checked first?
3. Exactly what is in the bag, and in what doses?
4. What happens if I feel unwell during the infusion?
5. Is everything single-use and opened in front of me?

A provider that answers these plainly is a good sign. One that avoids them is not.

## When is a drip the wrong choice?

Go to a hospital, not a lounge, if you have a high fever, blood in your stool, chest pain, difficulty breathing, confusion, or if you have not passed urine for many hours. These need a diagnosis, and a vitamin drip would only delay it. In an emergency in Indonesia, call 112.`,
    faq: [
      { q: "How long does an IV drip take?", a: "Most drips take 30 to 60 minutes. Slow infusions such as NAD+ take two to three hours, because giving them faster causes nausea and chest tightness." },
      { q: "Can I have a drip at my villa or hotel?", a: "Yes. A nurse brings everything needed, checks your vital signs first and stays for the whole infusion. All you need is a comfortable chair." },
      { q: "Does a drip cure a hangover?", a: "No. It eases the dehydration that causes part of the misery, but it does not lower your blood alcohol level or make it safe to drive. Time does the rest." },
    ],
    sources: IV_SOURCES,
    related: ["iv-hydration", "iv-myers", "iv-immune"],
  },
  {
    locale: "en", slug: "bpc-157-tb-500-evidence", translationKey: "bpc-tb-evidence", cover: "vials-syringe-light", tags: ["Peptides", "Recovery"],
    publishedAt: "2026-11-13T02:00:00.000Z",
    title: "BPC-157 and TB-500: what the evidence actually says",
    excerpt: "The two most requested recovery peptides, without the hype: what they are, what research exists in humans, their legal status and why a doctor reviews every request.",
    takeaways: [
      "BPC-157 and TB-500 are experimental peptides. Neither is an approved medicine.",
      "Almost all research on BPC-157 comes from laboratory and animal studies. A 2025 systematic review of 36 studies cautioned against clinical use until better human data exist.",
      "Both are prohibited at all times in tested sport under the World Anti-Doping Code.",
      "Long-term safety in humans is unknown, and products sold online are unregulated.",
    ],
    body: `BPC-157 and TB-500 are the peptides people ask us about most, usually after an injury that is healing slowly. They deserve a careful answer rather than a sales pitch.

## What are BPC-157 and TB-500?

**BPC-157** ("body protection compound") is a synthetic chain of 15 amino acids, modelled on part of a protein found in stomach juice. **TB-500** is a synthetic fragment of thymosin beta-4, a protein involved in cell movement and repair.

Both are usually injected under the skin. Both are sold widely online as "research chemicals", which is a way of saying that nobody has approved them for human use.

## What does the research show?

In animals and in cell cultures, BPC-157 has been studied for tendon, ligament, muscle and gut healing, with encouraging results. That is where the excitement comes from.

In humans, the picture is very different. A systematic review published in 2025 in the *HSS Journal* searched the medical literature through June 2024 and found 36 studies, almost all of them preclinical. Its authors concluded that BPC-157 might help musculoskeletal injuries heal, but that the safety of the peptide in humans remains unknown, and they cautioned against clinical use until high-quality trials exist.

For TB-500 the human evidence is thinner still: there are no completed large trials for injury recovery.

Promising animal results often fail to carry over to people. That is the normal fate of most experimental drugs, not a reason for cynicism, but it is a reason for caution.

## Are they legal and approved?

Neither peptide has been approved by a medicines regulator for human therapeutic use. That has practical consequences:

- There is no agreed dose, schedule or duration backed by trials.
- Products are not made under the controls that apply to licensed medicines, so purity and strength can vary.
- Side effects are not systematically collected.

## Are they allowed in sport?

No. BPC-157 is named on the World Anti-Doping Agency's Prohibited List under class S0, "non-approved substances", and has been explicitly listed since 2022. Thymosin beta-4 and its derivatives, including TB-500, are prohibited as growth factors. Both are banned at all times, in and out of competition. If you compete in a tested sport, do not use them.

## What are the known and unknown risks?

Known: pain or redness at the injection site, and the general risks of any injection. Unknown: almost everything long-term. Because these peptides act on tissue growth and blood-vessel formation, doctors are particularly careful with anyone who has, or has had, cancer.

## How does doctor review work here?

Every peptide request on this site goes to a licensed doctor before anything is supplied. You complete a health questionnaire; the doctor may approve, adjust or decline, and explains what is and is not known. You pay only after approval.

A doctor's review cannot remove the uncertainty described above. It can make sure there is no clear reason for you to avoid these products, and that you decide with the facts in front of you.`,
    faq: [
      { q: "Is BPC-157 approved as a medicine anywhere?", a: "No. It has no approval from a medicines regulator for human therapeutic use, which is why it sits in the World Anti-Doping Agency's class of non-approved substances." },
      { q: "Can I order peptides without a doctor?", a: "Not here. Every peptide requires a health questionnaire and a doctor's approval before payment and supply." },
      { q: "Do peptides work for tendon injuries?", a: "Nobody knows yet. Animal studies of BPC-157 are encouraging, but there are no high-quality human trials, and the authors of the main 2025 review caution against clinical use." },
    ],
    sources: [
      { title: "Vasireddi N. et al. Emerging use of BPC-157 in orthopaedic sports medicine: a systematic review. HSS Journal, 2025", url: "https://pubmed.ncbi.nlm.nih.gov/40756949/" },
      { title: "World Anti-Doping Agency: the Prohibited List", url: "https://www.wada-ama.org/en/prohibited-list" },
      { title: "UK Anti-Doping: major changes to the 2022 Prohibited List (BPC-157 added)", url: "https://network.ukad.org.uk/news/major-changes-2022-prohibited-list-what-you-need-know" },
    ],
    related: ["bpc-157", "tb-500", "recovery-stack"],
  },
  {
    locale: "en", slug: "bali-belly-drip-or-doctor", translationKey: "bali-belly-guide", cover: "bed-pool-view", tags: ["Travel health", "Hydration"],
    publishedAt: "2026-11-16T02:00:00.000Z",
    title: "Bali Belly: when a drip helps and when you need a doctor",
    excerpt: "Traveller's diarrhoea usually passes in a few days. How to treat it yourself, when an IV drip is worth it, and the warning signs that mean a doctor instead.",
    takeaways: [
      "Most traveller's diarrhoea gets better on its own within a few days. Replacing fluid and salts is the main treatment.",
      "Oral rehydration solution is the first choice. An IV drip helps when vomiting stops you drinking or dehydration is setting in.",
      "See a doctor for blood in the stool, fever, severe pain, or symptoms that last more than a few days.",
      "Antibiotics are for severe cases and should be a doctor's decision.",
    ],
    body: `"Bali Belly" is the local name for traveller's diarrhoea: loose stools, cramps and sometimes vomiting, usually caught from food or water carrying bacteria your gut has not met before. It is unpleasant and very common, and most of the time it is not dangerous.

## How long does Bali Belly last?

Most cases are mild and settle without treatment within three to five days. The illness itself is rarely the problem. The fluid you lose is.

## How do you treat it yourself?

1. **Drink, a little and often.** Water is good; oral rehydration solution (ORS) is better, because it replaces salts as well as water. Pharmacies across Bali sell it in sachets.
2. **Eat when you can.** Plain rice, bananas, toast and soup are easy on the stomach.
3. **Rest, and stay out of the heat.**
4. **Be careful with anti-diarrhoea tablets.** Loperamide can slow things down for a flight or a transfer, but it should not be used if you have a fever or blood in your stool. Ask a pharmacist or doctor.

According to the CDC, most otherwise healthy people recover with oral rehydration alone.

## When does an IV drip help?

A drip does one thing well: it puts fluid and salts back when your gut cannot. It is worth considering when:

- you are vomiting and cannot keep drinks down;
- you feel dizzy when you stand, your mouth is dry and you are passing little urine;
- you have been drinking ORS and are still losing more than you take in.

A drip does not kill the bacteria or shorten the infection. It makes you safer and more comfortable while your body deals with it.

## When should you see a doctor instead?

Skip the drip and see a doctor, or go to a hospital, if you have any of these:

- blood or mucus in your stool;
- a fever;
- severe abdominal pain;
- signs of dehydration that do not improve with fluids;
- diarrhoea that lasts more than a few days;
- a young child, an older person or someone with a chronic illness who is affected.

These can point to an infection that needs testing and specific treatment. Antibiotics are sometimes needed for severe cases, and that decision belongs to a doctor.

## How can you lower the risk?

- Wash or sanitise your hands before eating.
- Drink sealed or boiled water, and be cautious with ice of unknown origin.
- Choose food that is cooked fresh and served hot.
- Peel fruit yourself.

None of this is a guarantee. Plenty of careful travellers still get caught, so pack a few ORS sachets before you need them.`,
    faq: [
      { q: "Can an IV drip stop the diarrhoea?", a: "No. A drip replaces the fluid and salts you are losing, which makes you feel better and prevents dehydration, but it does not treat the infection itself." },
      { q: "Should I take loperamide for Bali Belly?", a: "It can reduce how often you need the toilet, which helps for travel, but do not take it if you have a fever or blood in your stool. Ask a pharmacist or doctor first." },
      { q: "When is Bali Belly an emergency?", a: "When there is blood in the stool, a high fever, severe pain, confusion, or no urine for many hours. Go to a hospital, or call 112." },
    ],
    sources: [
      { title: "CDC Yellow Book: Post-travel diarrhea", url: "https://www.cdc.gov/yellow-book/hcp/post-travel-evaluation/post-travel-diarrhea.html" },
      { title: "MSD Manual: Traveler's diarrhea", url: "https://www.msdmanuals.com/home/digestive-disorders/gastroenteritis/traveler-s-diarrhea" },
    ],
    related: ["iv-bali-belly", "iv-hydration", "electrolytes"],
  },
  {
    locale: "ru", slug: "kapelnitsy-na-bali-chto-oni-dayut", translationKey: "iv-drips-guide", cover: "iv-bag", tags: ["Капельницы", "Гидратация"],
    publishedAt: "2026-11-10T02:00:00.000Z",
    title: "Капельницы на Бали: что они дают и чего не дают",
    excerpt: "Честный разбор: что на самом деле даёт капельница, кому она полезна, что говорят исследования и какие вопросы задать перед записью.",
    takeaways: [
      "Капельница восполняет жидкость быстрее, чем питьё. Это особенно важно, когда вы не можете удержать выпитое.",
      "Для здоровых людей с нормальным питанием данных о том, что витаминные капельницы повышают энергию, иммунитет или улучшают кожу, мало.",
      "Основные риски: синяк, раздражение вены и, редко, инфекция или перегрузка жидкостью. Осмотр перед процедурой их снижает.",
      "Капельница не заменяет врача: температура, кровь в стуле, боль в груди или спутанность сознания требуют больницы.",
    ],
    body: `Капельницы на Бали предлагают везде: в клиниках, в лаунжах и с выездом на виллу. Часть того, что о них говорят, правда, а часть — маркетинг. Разберёмся, где что.

## Что входит в капельницу?

Основа почти всегда одна: от половины до литра стерильного раствора с солями (электролитами) в той же пропорции, что и в крови. К ней добавляют витамины и минералы. Самый известный состав, коктейль Майерса, включает магний, кальций, витамины группы B и витамин C.

Раствор попадает прямо в вену, поэтому в течение часа весь объём оказывается в кровотоке. Выпить столько же тоже можно, но это медленнее и только если желудок не против.

## Что говорят исследования?

Честный ответ состоит из двух частей.

**Жидкость работает.** Восполнение жидкости и солей через вену — обычная медицинская практика при обезвоживании, когда человек не может пить достаточно. Это никто не оспаривает.

**С витаминами всё менее ясно.** Клиника Кливленда отмечает, что исследований заявленной пользы внутривенных витаминов мало. Справочник MSD формулирует жёстче: высокие дозы витаминов внутривенно почти не изучались у людей без дефицита, и ни один из заявленных эффектов не подтверждён. Инъекции витаминов — доказанное лечение при реальном дефиците, но это другая ситуация.

Многие действительно чувствуют себя лучше после капельницы. Отчасти это регидратация, отчасти час отдыха, отчасти ожидание. Ощущение от этого не становится менее настоящим, но к громким обещаниям стоит относиться скептически.

## Кому капельница поможет скорее всего?

| Ситуация | Насколько вероятна польза |
|---|---|
| Рвота или диарея, жидкость не удерживается | Высокая: для этого растворы и существуют |
| Обезвоживание после жары, перелёта или тяжёлой тренировки | Заметная, хотя питьё тоже помогло бы |
| Утро после алкоголя | Снимает обезвоживание, остальное сделает время |
| Вы здоровы и хотите больше энергии или иммунитета | Неясно: данных мало |

## Какие есть риски?

Капельница — медицинская процедура, даже если её ставят у бассейна.

- **Часто и неопасно:** синяк или болезненность по ходу вены.
- **Нечасто:** воспаление вены или аллергическая реакция на компонент.
- **Редко, но серьёзно:** инфекция при плохой гигиене или перегрузка жидкостью у людей с болезнями сердца или почек.

Поэтому медсестра должна измерить давление и расспросить о здоровье и лекарствах до начала процедуры и быть готова отказать.

## О чём спросить перед записью на Бали?

1. Кто будет ставить капельницу: дипломированная медсестра или врач?
2. Измерят ли мне давление и пульс и уточнят ли историю болезни?
3. Что именно в пакете и в каких дозах?
4. Что будет, если мне станет плохо во время процедуры?
5. Всё ли одноразовое и вскрывается ли при мне?

Если на эти вопросы отвечают прямо, это хороший знак. Если уходят от ответа — плохой.

## Когда капельница — неправильный выбор?

Нужна больница, а не лаунж, если у вас высокая температура, кровь в стуле, боль в груди, затруднённое дыхание, спутанность сознания или много часов нет мочи. Здесь нужен диагноз, а витаминная капельница его только отсрочит. В экстренной ситуации в Индонезии звоните 112.`,
    faq: [
      { q: "Сколько длится капельница?", a: "Большинство капельниц занимает от 30 до 60 минут. Медленные инфузии, например NAD+, идут два–три часа: при быстром введении возникают тошнота и чувство сдавления в груди." },
      { q: "Можно ли поставить капельницу на вилле или в отеле?", a: "Да. Медсестра привозит всё необходимое, сначала проверяет показатели и остаётся до конца процедуры. Нужно только удобное кресло." },
      { q: "Лечит ли капельница похмелье?", a: "Нет. Она снимает обезвоживание, из-за которого отчасти так плохо, но не снижает уровень алкоголя в крови и не делает вождение безопасным. Остальное сделает время." },
    ],
    sources: IV_SOURCES,
    related: ["iv-hydration", "iv-myers", "iv-immune"],
  },
  {
    locale: "fr", slug: "perfusions-a-bali-ce-qu-elles-font", translationKey: "iv-drips-guide", cover: "iv-bag", tags: ["Perfusions", "Hydratation"],
    publishedAt: "2026-11-10T02:00:00.000Z",
    title: "Perfusions à Bali : ce qu’elles font et ne font pas",
    excerpt: "Un guide honnête des perfusions à Bali : ce qu’elles apportent vraiment, à qui elles profitent, ce que disent les études et les questions à poser avant de réserver.",
    takeaways: [
      "Une perfusion réhydrate plus vite que la boisson, ce qui compte surtout quand vous ne gardez plus les liquides.",
      "Chez les personnes en bonne santé et bien nourries, les preuves d’un effet des perfusions de vitamines sur l’énergie, l’immunité ou la peau restent limitées.",
      "Les principaux risques sont un bleu, une irritation de la veine et, rarement, une infection ou une surcharge en liquide. Un examen préalable les réduit.",
      "Une perfusion ne remplace pas un médecin : fièvre, sang dans les selles, douleur thoracique ou confusion relèvent de l’hôpital.",
    ],
    body: `À Bali, on propose des perfusions partout : en clinique, dans les lounges et jusqu’à la porte de votre villa. Une partie de ce qu’on en dit est vraie, une autre relève du marketing. Ce guide fait le tri.

## Que contient une perfusion ?

La base est presque toujours la même : un demi-litre à un litre de solution stérile contenant des sels (électrolytes) dans les mêmes proportions que le sang. On y ajoute des vitamines et des minéraux. La recette la plus connue, le cocktail de Myers, associe magnésium, calcium, vitamines B et vitamine C.

Le liquide passe directement dans une veine : en une heure, tout est dans la circulation. Boire la même quantité fonctionne aussi, mais plus lentement, et seulement si l’estomac suit.

## Que disent les études ?

La réponse honnête tient en deux parties.

**L’hydratation fonctionne.** Remplacer l’eau et les sels par voie veineuse est un traitement courant de la déshydratation quand on ne peut pas boire assez. Personne ne le conteste.

**Pour les vitamines, c’est moins clair.** La Cleveland Clinic note que les recherches sur les bénéfices annoncés sont limitées. Le Manuel MSD va plus loin : très peu d’études ont testé les vitamines à haute dose par voie veineuse chez des personnes sans carence, et aucun des effets annoncés n’a été confirmé. Les injections de vitamines sont un traitement éprouvé en cas de carence réelle, ce qui est une autre situation.

Beaucoup de gens se sentent réellement mieux après une perfusion. C’est en partie la réhydratation, en partie une heure de repos, en partie l’attente. Le ressenti n’en est pas moins réel, mais cela invite à se méfier des grandes promesses.

## À qui une perfusion profite-t-elle le plus ?

| Situation | Bénéfice probable |
|---|---|
| Vomissements ou diarrhée, impossible de garder les liquides | Important : c’est le rôle des solutés |
| Déshydratation après la chaleur, un long vol ou un effort intense | Net, même si boire suffirait aussi |
| Lendemain de soirée arrosée | Soulage la déshydratation ; le temps fait le reste |
| En bonne santé, pour plus d’énergie ou d’immunité | Incertain : les preuves sont minces |

## Quels sont les risques ?

Une perfusion est un acte médical, même au bord d’une piscine.

- **Fréquent et bénin :** un bleu ou une sensibilité le long de la veine.
- **Peu fréquent :** une inflammation de la veine ou une réaction allergique à un composant.
- **Rare mais grave :** une infection due à une mauvaise hygiène, ou une surcharge en liquide chez les personnes atteintes d’une maladie du cœur ou des reins.

C’est pourquoi l’infirmier doit prendre votre tension et vous interroger sur votre santé et vos médicaments avant de commencer, et savoir dire non.

## Quelles questions poser avant de réserver à Bali ?

1. Qui posera la perfusion : un infirmier diplômé ou un médecin ?
2. Ma tension, mon pouls et mes antécédents seront-ils vérifiés ?
3. Que contient exactement la poche, et à quelles doses ?
4. Que se passe-t-il si je me sens mal pendant la perfusion ?
5. Tout le matériel est-il à usage unique et ouvert devant moi ?

Un prestataire qui répond clairement est bon signe. Celui qui esquive ne l’est pas.

## Quand la perfusion n’est-elle pas la bonne réponse ?

Allez à l’hôpital, pas au lounge, en cas de forte fièvre, de sang dans les selles, de douleur thoracique, de gêne respiratoire, de confusion, ou si vous n’avez pas uriné depuis de nombreuses heures. Il faut alors un diagnostic, qu’une perfusion de vitamines ne ferait que retarder. En cas d’urgence en Indonésie, appelez le 112.`,
    faq: [
      { q: "Combien de temps dure une perfusion ?", a: "La plupart durent de 30 à 60 minutes. Les perfusions lentes comme le NAD+ prennent deux à trois heures, car un débit plus rapide provoque nausées et oppression thoracique." },
      { q: "Puis-je recevoir une perfusion dans ma villa ou mon hôtel ?", a: "Oui. Un infirmier apporte tout le nécessaire, vérifie d’abord vos constantes et reste pendant toute la perfusion. Il suffit d’un fauteuil confortable." },
      { q: "Une perfusion guérit-elle la gueule de bois ?", a: "Non. Elle soulage la déshydratation, qui explique une partie du malaise, mais elle ne fait pas baisser l’alcoolémie et ne rend pas la conduite sûre. Le temps fait le reste." },
    ],
    sources: IV_SOURCES,
    related: ["iv-hydration", "iv-myers", "iv-immune"],
  },
];

/** The sample articles as publishable posts. Ids are fixed, so adding the samples twice overwrites instead of duplicating. */
export function samplePosts(now = new Date()): Post[] {
  const stamp = now.toISOString();
  return SEEDS.map((s) => ({
    ...s,
    id: `sample-${s.locale}-${s.translationKey}`,
    author: `${site.name} team`,
    reviewer: "",
    status: "published" as const,
    createdAt: s.publishedAt ?? stamp,
    updatedAt: s.publishedAt ?? stamp,
  }));
}
