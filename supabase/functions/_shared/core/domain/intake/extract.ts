// Profile extractor: turns a spoken or typed description ("I'm 26, desk job, gym 3 times
// a week, vegetarian but I eat eggs, allergic to peanuts, ₹1500 a week") into profile
// fields. It is deterministic and rule-based, so it runs offline, costs nothing, sends no
// health data anywhere, and can be scored against a labelled test set (src/eval).
//
// Safety rules built in:
//  - Nothing is guessed. A field is only filled when the text says it, and each filled
//    field carries the words it came from ("evidence") so the user can check it.
//  - Diet: if the text contains conflicting diet statements, the STRICTER pattern wins
//    and a warning is shown (vegan > vegetarian > eggetarian > non-vegetarian).
//  - Allergies and health conditions are only ever added, never removed, by the parser.
//  - Silence is not "none": "no allergies" / "no health issues" must be said explicitly.
import type { Allergen, ClinicalFlag, DietPattern, Goal, Intensity, MovementBand, OccupationClass, Sex } from '../types.ts';
import { INGREDIENTS } from '../../data/ingredients.ts';
import { round } from '../units.ts';

export const EXTRACTOR_VERSION = 'rules-1.0.0';

export interface Found<T> {
  value: T;
  evidence: string; // the words in the text that produced this value
}

export interface Extraction {
  name?: Found<string>;
  ageYears?: Found<number>;
  sex?: Found<Sex>;
  heightCm?: Found<number>;
  weightKg?: Found<number>;
  occupation?: Found<OccupationClass>;
  movement?: Found<MovementBand>;
  workoutsPerWeek?: Found<number>;
  workoutMinutes?: Found<number>;
  workoutType?: Found<'strength' | 'cardio' | 'mixed' | 'sport' | 'yoga' | 'none'>;
  intensity?: Found<Intensity>;
  dietPattern?: Found<DietPattern>;
  allergies?: Found<Allergen[]>;
  noAllergies?: Found<true>;
  hardExclusions?: Found<string[]>; // ingredient ids
  dislikes?: Found<string[]>; // ingredient ids
  goal?: Found<Goal>;
  budgetInr?: Found<number>;
  budgetPeriod?: Found<'weekly' | 'monthly'>;
  mealsPerDay?: Found<3 | 4>;
  clinicalFlags?: Found<ClinicalFlag[]>;
  noClinical?: Found<true>;
  warnings: string[];
  unknownFoods: string[]; // foods mentioned that are not in our ingredient list
}

// ------------------------------------------------------------------ text helpers

const NUMBER_WORDS: Record<string, number> = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19,
  twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90,
  once: 1, twice: 2, thrice: 3,
};

/** Lower-case, unify quotes/dashes, and turn number words ("twenty six") into digits. */
export function normalise(text: string): string {
  let t = ` ${text.toLowerCase()} `
    .replace(/[’‘`]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, '-')
    .replace(/₹\s*/g, ' rs ')
    .replace(/(\d),(\d{3})/g, '$1$2') // 10,000 -> 10000
    .replace(/\s+/g, ' ');
  // "twenty six" -> 26, "fifteen hundred" -> 1500
  t = t.replace(/\b(twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety)[ -](one|two|three|four|five|six|seven|eight|nine)\b/g, (_, a, b) => String(NUMBER_WORDS[a] + NUMBER_WORDS[b]));
  t = t.replace(/\b(\w+) hundred\b/g, (m, a) => (a in NUMBER_WORDS ? String(NUMBER_WORDS[a] * 100) : /^\d+$/.test(a) ? String(Number(a) * 100) : m));
  t = t.replace(/\b(\d+(?:\.\d+)?)\s*k\b/g, (_, a) => String(Math.round(Number(a) * 1000)));
  t = t.replace(/\b(zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety)\b/g, (w) => String(NUMBER_WORDS[w]));
  return t;
}

/** True when a negation word appears shortly before position `idx` ("not diabetic", "no peanut allergy"). */
function negatedAt(t: string, idx: number): boolean {
  const before = t.slice(Math.max(0, idx - 28), idx);
  return /\b(no|not|never|without|don't|dont|do not|isn't|am not|i'm not|nahi|nahin)\b[^.,;]*$/.test(before);
}

/** Find the first match of any pattern that is not negated. */
function findPositive(t: string, patterns: RegExp[]): RegExpExecArray | null {
  for (const p of patterns) {
    const re = new RegExp(p.source, p.flags.includes('g') ? p.flags : p.flags + 'g');
    let m: RegExpExecArray | null;
    while ((m = re.exec(t))) {
      if (!negatedAt(t, m.index)) return m;
    }
  }
  return null;
}

const clip = (s: string) => s.trim().replace(/\s+/g, ' ');

// ------------------------------------------------------------------ food vocabulary

/** Extra words people use for our canonical ingredients (English, Hindi, Telugu transliterations). */
const FOOD_SYNONYMS: Record<string, string[]> = {
  okra: ['okra', 'bhindi', 'lady finger', 'ladyfinger', 'ladies finger', 'bendakaya'],
  paneer: ['paneer', 'cottage cheese'],
  egg: ['egg', 'eggs', 'anda', 'guddu'],
  chicken: ['chicken'],
  fish_rohu: ['fish', 'rohu'],
  milk: ['milk', 'doodh'],
  curd: ['curd', 'dahi', 'yogurt', 'yoghurt', 'perugu'],
  peanuts: ['peanut', 'peanuts', 'groundnut', 'groundnuts', 'palli', 'moongphali'],
  rajma: ['rajma', 'kidney beans', 'kidney bean'],
  kabuli_chana: ['chole', 'chickpea', 'chickpeas', 'kabuli chana'],
  soya_chunks: ['soya chunks', 'soya', 'soy chunks', 'meal maker'],
  tofu: ['tofu'],
  spinach: ['spinach', 'palak', 'palakura'],
  bottle_gourd: ['bottle gourd', 'lauki', 'sorakaya', 'dudhi'],
  capsicum: ['capsicum', 'bell pepper', 'shimla mirch'],
  potato: ['potato', 'potatoes', 'aloo'],
  onion: ['onion', 'onions', 'pyaz'],
  tomato: ['tomato', 'tomatoes'],
  rice: ['rice', 'chawal', 'biyyam'],
  wheat_atta: ['wheat', 'roti', 'chapati', 'atta'],
  oats: ['oats'],
  ragi_flour: ['ragi', 'finger millet'],
  coconut: ['coconut'],
  banana: ['banana', 'bananas'],
  papaya: ['papaya'],
  mushroom_unknown: ['mushroom', 'mushrooms'],
  brinjal_unknown: ['brinjal', 'eggplant', 'baingan', 'vankaya'],
  bitter_gourd_unknown: ['bitter gourd', 'karela', 'kakarakaya'],
};

const KNOWN_IDS = new Set(INGREDIENTS.map((i) => i.id));

function foodsIn(fragment: string): { ids: string[]; unknown: string[] } {
  const ids = new Set<string>();
  const unknown = new Set<string>();
  // longest phrases first so "kidney beans" wins over "beans"
  const entries = Object.entries(FOOD_SYNONYMS).flatMap(([id, words]) => words.map((w) => [id, w] as const)).sort((a, b) => b[1].length - a[1].length);
  let rest = ` ${fragment} `;
  for (const [id, w] of entries) {
    const re = new RegExp(`\\b${w.replace(/ /g, '\\s+')}\\b`);
    if (re.test(rest)) {
      if (id.endsWith('_unknown')) unknown.add(w);
      else if (KNOWN_IDS.has(id)) ids.add(id);
      rest = rest.replace(re, ' ');
    }
  }
  // Plain ingredient names from the data set too ("toor dal", "jowar")
  for (const ing of INGREDIENTS) {
    const base = ing.name.toLowerCase().replace(/\s*\(.*\)/, '').split(',')[0].trim();
    if (base.length > 3 && new RegExp(`\\b${base.replace(/ /g, '\\s+')}\\b`).test(rest)) ids.add(ing.id);
  }
  return { ids: [...ids], unknown: [...unknown] };
}

// ------------------------------------------------------------------ main extractor

export function extractProfile(raw: string, today: Date = new Date()): Extraction {
  const t = normalise(raw);
  const out: Extraction = { warnings: [], unknownFoods: [] };

  // ---- name
  const nm = /\b(?:my name is|this is|i am called|call me)\s+([a-z][a-z]+)/.exec(t);
  if (nm && !['a', 'an', 'the', 'vegetarian', 'vegan'].includes(nm[1])) out.name = { value: nm[1][0].toUpperCase() + nm[1].slice(1), evidence: clip(nm[0]) };

  // ---- age (also "born in 1999")
  const age =
    /\b(\d{1,3})\s*(?:years?|yrs?|yr)\s*(?:old|of age)?\b/.exec(t) ??
    /\b(?:age|aged|age is)\s*(?:is\s*)?(\d{1,3})\b/.exec(t) ??
    /\b(?:i am|i'm|im)\s+(\d{2})\b(?!\s*(?:kg|kgs|kilo|cm|lb|lbs|%|feet|ft|minutes|mins|times|days|steps))/.exec(t) ??
    /\b(\d{2})\s*,?\s*(?:male|female|girl|boy|man|woman|guy|lady)\b/.exec(t) ??
    /\b(?:male|female|girl|boy|man|woman|guy|lady)\s*,?\s*(\d{2})\b(?!\s*(?:kg|kgs|kilo|cm|lb|lbs|feet|ft|minutes|mins|times|days|steps))/.exec(t);
  if (age) {
    const a = Number(age[1]);
    if (a >= 10 && a <= 110) out.ageYears = { value: a, evidence: clip(age[0]) };
  } else {
    const born = /\bborn in (\d{4})\b/.exec(t);
    if (born) {
      const a = today.getFullYear() - Number(born[1]);
      if (a >= 10 && a <= 110) {
        out.ageYears = { value: a, evidence: clip(born[0]) };
        out.warnings.push(`Age worked out from birth year ${born[1]}; it may be one year off.`);
      }
    }
  }

  // ---- sex (first-person statements only, so "my wife" or "my brother" never set it)
  const sex =
    /\b(?:i am|i'm|im)\s+(?:a\s+)?(?:\d{2}\s*(?:years?|yr)?\s*(?:old)?\s*)?(male|female|man|woman|guy|girl|boy|lady)\b/.exec(t) ??
    /\b(?:gender|sex)\s*(?:is|:)?\s*(male|female)\b/.exec(t) ??
    /\b\d{2}\s*(?:years?|yrs?|yr)?[\s-]*(?:old)?\s+(man|woman|male|female|guy|girl|boy|lady)\b/.exec(t) ??
    /(?:^|[\s,.])(male|female)(?:[\s,.]|$)/.exec(t) ??
    /\b\d{2}\s*,?\s*(girl|boy|man|woman|guy|lady)\b/.exec(t) ??
    /(?:^|[\s,.])(girl|boy|guy|lady)\s*,\s*\d{2}\b/.exec(t);
  if (sex) {
    const w = sex[1];
    out.sex = { value: ['male', 'man', 'guy', 'boy'].includes(w) ? 'male' : 'female', evidence: clip(sex[0]) };
  }
  if (/\bprefer not to say\b/.test(t) && /\b(gender|sex)\b/.test(t)) out.sex = { value: 'prefer_not_to_say', evidence: 'prefer not to say' };

  // ---- height: "170 cm", "5 ft 8 in", "5'8", "5 feet 8", "5.8 feet" (Indian usage = 5 ft 8 in)
  const cm = /\b(\d{3}(?:\.\d)?)\s*(?:cm|cms|centimet(?:er|re)s?)\b/.exec(t);
  const ftin = /\b([4-7])\s*(?:'|ft|feet|foot)\s*(?:and\s*)?(\d{1,2})?\s*(?:"|in|inch|inches)?/.exec(t);
  const ftdec = /\b([4-7])\.(\d{1,2})\s*(?:ft|feet|foot)\b/.exec(t);
  if (cm) out.heightCm = { value: Number(cm[1]), evidence: clip(cm[0]) };
  else if (ftdec) {
    const inch = Number(ftdec[2]);
    if (inch <= 11) {
      out.heightCm = { value: round((Number(ftdec[1]) * 12 + inch) * 2.54, 1), evidence: clip(ftdec[0]) };
      out.warnings.push(`Read “${clip(ftdec[0])}” as ${ftdec[1]} ft ${inch} in. Change it if you meant something else.`);
    }
  } else if (ftin) {
    const inch = ftin[2] ? Number(ftin[2]) : 0;
    if (inch <= 11) out.heightCm = { value: round((Number(ftin[1]) * 12 + inch) * 2.54, 1), evidence: clip(ftin[0]) };
  } else {
    const h = /\bheight\s*(?:is\s*)?(\d{3})\b/.exec(t);
    if (h) out.heightCm = { value: Number(h[1]), evidence: clip(h[0]) };
  }

  // ---- weight
  const kg = /\b(\d{2,3}(?:\.\d)?)\s*(?:kg|kgs|kilo|kilos|kilograms?)\b/.exec(t);
  const lb = /\b(\d{2,3}(?:\.\d)?)\s*(?:lb|lbs|pounds)\b/.exec(t);
  if (kg) out.weightKg = { value: Number(kg[1]), evidence: clip(kg[0]) };
  else if (lb) out.weightKg = { value: round(Number(lb[1]) / 2.20462262, 1), evidence: clip(lb[0]) };
  else {
    const w = /\bweigh(?:t is|s|)\s*(?:around|about)?\s*(\d{2,3})\b/.exec(t);
    if (w) out.weightKg = { value: Number(w[1]), evidence: clip(w[0]) };
  }

  // ---- occupation (most physical wins if several are mentioned)
  const OCC: [OccupationClass, RegExp][] = [
    ['heavy', /\b(construction|labou?r(?:er)?|farm(?:er|ing)?|loading|mason|porter|manual work|hard physical)\b/],
    ['moderate', /\b(delivery|nurse|nursing staff|on my feet|field work|field job|waiter|cook in a|chef|housework|homemaker|housewife|sales rep)\b/],
    ['light', /\b(teacher|teaching|shop|retail|lab work|standing job|cashier|tailor|salon)\b/],
    ['sedentary', /\b(office|desk|it job|it company|software|developer|programmer|engineer|student|studying|college|work from home|wfh|computer|accountant|analyst|banker|call cent(?:er|re)|sitting)\b/],
  ];
  for (const [cls, re] of OCC) {
    const m = findPositive(t, [re]);
    if (m) {
      out.occupation = { value: cls, evidence: clip(m[0]) };
      break;
    }
  }

  // ---- everyday movement
  const steps = /\b(\d{3,5})\s*steps\b/.exec(t);
  if (steps) {
    const s = Number(steps[1]);
    out.movement = { value: s < 5000 ? 'low' : s <= 10000 ? 'medium' : 'high', evidence: clip(steps[0]) };
  } else {
    const hi = findPositive(t, [/\b(very active|always on the move|walk a lot|lot of walking|on my feet all day)\b/]);
    const mid = findPositive(t, [/\b(walk(?:s|ing)? (?:daily|every ?day|to work|in the evening|in the morning)|daily walk|morning walk|evening walk)\b/]);
    const lo = /\b(don't walk much|dont walk much|hardly walk|mostly sit|not very active|sedentary)\b/.exec(t);
    if (hi) out.movement = { value: 'high', evidence: clip(hi[0]) };
    else if (mid) out.movement = { value: 'medium', evidence: clip(mid[0]) };
    else if (lo) out.movement = { value: 'low', evidence: clip(lo[0]) };
  }

  // ---- workouts
  const noEx = /\b(no exercise|don't exercise|dont exercise|do not exercise|don't work ?out|dont work ?out|no workouts?|no gym|not into gym)\b/.exec(t);
  const freq =
    /\b(\d{1,2})\s*(?:times|x|days|sessions)\s*(?:a|per|in a|every)\s*week\b/.exec(t) ??
    /\b(\d{1,2})\s*(?:days|times)\s*weekly\b/.exec(t) ??
    /\b(?:gym|workout|work out|exercise|train(?:ing)?|run|running|yoga|cycling|swim(?:ming)?)\s+(daily|every ?day)\b/.exec(t) ??
    /\b(daily|every ?day)\s+(?:gym|workout|exercise|yoga|run|walk and gym)\b/.exec(t);
  if (noEx) {
    out.workoutsPerWeek = { value: 0, evidence: clip(noEx[0]) };
    out.workoutType = { value: 'none', evidence: clip(noEx[0]) };
  } else if (freq) {
    const n = /daily|every ?day/.test(freq[1]) ? 7 : Number(freq[1]);
    if (n >= 0 && n <= 14) out.workoutsPerWeek = { value: n, evidence: clip(freq[0]) };
  }
  const mins = /\b(\d{1,3})\s*(?:min|mins|minutes)\b/.exec(t);
  const hrs = /\b(an|one|1|1\.5|two|2)\s*(?:hour|hr|hours|hrs)\b/.exec(t);
  if (out.workoutsPerWeek && out.workoutsPerWeek.value > 0) {
    if (mins) out.workoutMinutes = { value: Math.min(240, Number(mins[1])), evidence: clip(mins[0]) };
    else if (hrs) out.workoutMinutes = { value: hrs[1] === '1.5' ? 90 : ['two', '2'].includes(hrs[1]) ? 120 : 60, evidence: clip(hrs[0]) };
    const strength = /\b(gym|weights?|weight training|lifting|strength|bodybuilding)\b/.test(t);
    const cardio = /\b(run|running|jog(?:ging)?|cycling|cardio|swim(?:ming)?|zumba)\b/.test(t);
    const yoga = /\b(yoga|pilates)\b/.test(t);
    const sport = /\b(cricket|football|badminton|tennis|basketball|volleyball|kabaddi|sports?)\b/.test(t);
    const kinds = [strength && 'strength', cardio && 'cardio', yoga && 'yoga', sport && 'sport'].filter(Boolean) as ('strength' | 'cardio' | 'yoga' | 'sport')[];
    if (kinds.length === 1) out.workoutType = { value: kinds[0], evidence: kinds[0] };
    else if (kinds.length > 1) out.workoutType = { value: 'mixed', evidence: kinds.join(' and ') };
    const vig = /\b(intense|intensely|hard|heavy|vigorous|hiit|crossfit|high intensity)\b/.exec(t);
    const mod = /\b(moderate|moderately|medium intensity)\b/.exec(t);
    const light = /\b(light|lightly|easy|gentle)\b(?!\s*(?:breakfast|meal|dinner|food))/.exec(t);
    if (vig) out.intensity = { value: 'vigorous', evidence: clip(vig[0]) };
    else if (mod) out.intensity = { value: 'moderate', evidence: clip(mod[0]) };
    else if (light) out.intensity = { value: 'light', evidence: clip(light[0]) };
  }

  // ---- diet pattern (stricter wins on conflict)
  const diets: { d: DietPattern; ev: string }[] = [];
  const eggOk = /\b(vegetarian|veg)\b[^.;]{0,25}\b(but|and|plus|\+)\b[^.;]{0,15}\b(eat|have|take|include)?\s*eggs?\b|\beggetarian\b|\beggitarian\b|\beat eggs? but no meat\b|\bveg plus eggs?\b/.exec(t);
  const nonVeg = /\b(non[- ]?veg(?:etarian)?|eat (?:chicken|meat|fish|mutton)|i eat everything|eat everything)\b/.exec(t);
  const vegan = findPositive(t, [/\b(vegan|plant[- ]based)\b/]);
  const veg = /\b(pure veg|vegetarian|shakahari|i am veg|i'm veg|only veg|\bveg\b(?! ?(?:etables|gies|gie)))\b/.exec(t.replace(/non[- ]?veg(?:etarian)?/g, ' '));
  const noMeat = /\b(no meat|don't eat meat|dont eat meat|no non[- ]?veg)\b/.exec(t);
  if (vegan) diets.push({ d: 'vegan', ev: clip(vegan[0]) });
  if (eggOk) diets.push({ d: 'eggetarian', ev: clip(eggOk[0]) });
  if (veg && !eggOk) diets.push({ d: 'vegetarian', ev: clip(veg[0]) });
  if (noMeat && !veg && !eggOk && !vegan) diets.push({ d: 'vegetarian', ev: clip(noMeat[0]) });
  if (nonVeg && !/\bno non[- ]?veg\b/.test(t)) diets.push({ d: 'non_vegetarian', ev: clip(nonVeg[0]) });
  const order: DietPattern[] = ['vegan', 'vegetarian', 'eggetarian', 'non_vegetarian'];
  if (diets.length) {
    diets.sort((a, b) => order.indexOf(a.d) - order.indexOf(b.d));
    out.dietPattern = { value: diets[0].d, evidence: diets[0].ev };
    const distinct = [...new Set(diets.map((x) => x.d))];
    if (distinct.length > 1) out.warnings.push(`You mentioned more than one food pattern (${distinct.join(', ').replace(/_/g, '-')}). We used the stricter one, ${diets[0].d.replace(/_/g, '-')}. Change it if that is wrong.`);
  }
  // "no eggs" said by a vegetarian is already covered; by a non-vegetarian it becomes an exclusion below.

  // ---- allergies (clauses that mention allergy/intolerance)
  const ALLERGEN_WORDS: [Allergen, RegExp][] = [
    ['peanut', /\b(peanuts?|groundnuts?|moongphali|palli)\b/],
    ['tree_nut', /\b(tree nuts?|nuts|almonds?|cashews?|walnuts?|pistachios?|badam|kaju)\b/],
    ['dairy', /\b(milk|dairy|lactose|paneer|curd|cheese)\b/],
    ['egg', /\beggs?\b/],
    ['gluten', /\b(gluten|wheat)\b/],
    ['soy', /\b(soy|soya)\b/],
    ['fish', /\bfish\b/],
    ['shellfish', /\b(shellfish|prawns?|shrimps?|crabs?|lobsters?)\b/],
    ['sesame', /\b(sesame|til|gingelly)\b/],
  ];
  const noAllergy = /\b(no (?:food )?allerg(?:y|ies)|not allergic to anything|don't have any allerg|dont have any allerg|no known allerg|zero allerg|allergic to nothing)\w*/.exec(t);
  if (noAllergy) out.noAllergies = { value: true, evidence: clip(noAllergy[0]) };
  const found = new Set<Allergen>();
  const evid: string[] = [];
  const clauseRe = /[^.;!?]*\b(allerg\w*|intoleran\w*|can't digest|cannot digest|react to)\b[^.;!?]*/g;
  let cm2: RegExpExecArray | null;
  while ((cm2 = clauseRe.exec(t))) {
    let clause = cm2[0];
    // "No allergies, oh wait, I'm allergic to fish": only the part after the correction counts.
    const none = /\bno (?:food )?allerg\w*|not allergic to anything|allergic to nothing|no known allerg\w*/.exec(clause);
    if (none) {
      // Only a correction AFTER "no allergies" counts; text before it is about other things.
      const corr = /\b(?:wait|actually|sorry|except|but)\b(.*)$/.exec(clause.slice(none.index + none[0].length));
      if (!corr || !/\ballerg|intoleran/.test(corr[1])) continue;
      clause = corr[1];
    }
    // "nuts" inside "peanuts" must not double count
    const c = clause.replace(/\bpea\s?nuts?\b/g, ' peanut ');
    for (const [a, re] of ALLERGEN_WORDS) if (re.test(c)) found.add(a);
    evid.push(clip(clause));
  }
  if (/\blactose intoleran/.test(t)) found.add('dairy');
  if (found.size) {
    out.allergies = { value: [...found], evidence: evid.join('; ') };
    if (out.noAllergies) {
      out.warnings.push('You said you have no allergies but also named one. We kept the allergy to be safe.');
      delete out.noAllergies;
    }
  }

  // ---- exclusions and dislikes
  const excl = new Set<string>();
  const dis = new Set<string>();
  const exclEv: string[] = [];
  const hardRe = /\b(?:never eat|don't eat|dont eat|do not eat|can't eat|cannot eat|can't have|avoid|no|without|skip)\s+([^.;!?]+?)(?=[.;!?]|\bbut\b|$)/g;
  let hm: RegExpExecArray | null;
  // Spoken text has no full stops, so cut each phrase at the next pronoun or verb:
  // "no eggs i love paneer" must exclude eggs only.
  const cut = (f: string) => f.split(/\b(?:i|i'm|im|my|me|we|want|wants|love|like|prefer|am|is|are|was|but|because|so|also|please|budget|goal|and i|then)\b|\d/)[0];
  while ((hm = hardRe.exec(t))) {
    hardRe.lastIndex = hm.index + 1; // allow overlapping phrases: "no allergies i never eat bhindi"
    const frag = cut(hm[1]);
    if (/\b(allerg|exercise|workout|gym|health|medical|condition|issues?|problems?|meat|non[- ]?veg|breakfast|meals?|sugar)\b/.test(frag) && !/\b(egg|paneer|chicken|fish)\b/.test(frag)) continue;
    const { ids, unknown } = foodsIn(frag);
    ids.forEach((i) => excl.add(i));
    unknown.forEach((u) => out.unknownFoods.push(u));
    if (ids.length) exclEv.push(clip(hm[0]));
  }
  const softRe = /\b(?:don't like|dont like|do not like|dislike|hate|not a fan of|not fond of)\s+([^.;!?]+?)(?=[.;!?]|\bbut\b|$)/g;
  let sm: RegExpExecArray | null;
  while ((sm = softRe.exec(t))) {
    softRe.lastIndex = sm.index + 1;
    const { ids, unknown } = foodsIn(cut(sm[1]));
    ids.forEach((i) => dis.add(i));
    unknown.forEach((u) => out.unknownFoods.push(u));
  }
  // Diet-class words are handled by the diet pattern, not as single-food exclusions,
  // except eggs for a non-vegetarian or eggetarian who says "no eggs".
  for (const id of ['chicken', 'fish_rohu']) if (out.dietPattern && out.dietPattern.value !== 'non_vegetarian') excl.delete(id);
  if (excl.has('egg') && out.dietPattern && (out.dietPattern.value === 'vegetarian' || out.dietPattern.value === 'vegan')) excl.delete('egg');
  if (excl.has('egg') && out.dietPattern?.value === 'eggetarian') {
    out.dietPattern = { value: 'vegetarian', evidence: `${out.dietPattern.evidence}; no eggs` };
    excl.delete('egg');
    out.warnings.push('You said “no eggs”, so we set the food pattern to vegetarian.');
  }
  excl.forEach((i) => dis.delete(i));
  if (excl.size) out.hardExclusions = { value: [...excl], evidence: exclEv.join('; ') };
  if (dis.size) out.dislikes = { value: [...dis], evidence: 'dislike' };
  out.unknownFoods = [...new Set(out.unknownFoods)];

  // ---- goal (first one mentioned)
  const GOALS: [Goal, RegExp][] = [
    ['muscle_fitness', /\b(build muscle|gain muscle|muscle gain|bulk(?:ing)?|get stronger|strength gain|muscles?|lean mass|fitness goals?)\b/],
    ['weight_management', /\b(lose weight|weight loss|lose fat|fat loss|reduce weight|cut weight|slim down|manage (?:my )?weight|maintain (?:my )?weight|lose some weight|lose \d+ ?kg)\b/],
    ['budget_first', /\b(save money|on a budget|cheap(?:est)?|low budget|spend less|tight budget|affordable)\b/],
    ['general', /\b(eat healthy|healthy eating|eat better|balanced diet|eat balanced|eat healthier|stay healthy|general health)\b/],
  ];
  let best: { g: Goal; i: number; ev: string } | null = null;
  for (const [g, re] of GOALS) {
    const m = re.exec(t);
    if (m && (!best || m.index < best.i)) best = { g, i: m.index, ev: clip(m[0]) };
  }
  if (best) out.goal = { value: best.g, evidence: best.ev };

  // ---- budget
  const bud =
    /\b(?:rs\.?|inr|rupees)\s*(\d{3,6})\b[^.;]{0,25}?\b(week|weekly|month|monthly)?\b/.exec(t) ??
    /\b(\d{3,6})\s*(?:rs|rupees|inr|bucks)\b[^.;]{0,25}?\b(week|weekly|month|monthly)?\b/.exec(t) ??
    /\bbudget\s*(?:is|of|around|about)?\s*(?:rs\.?|inr)?\s*(\d{3,6})\b[^.;]{0,25}?\b(week|weekly|month|monthly)?\b/.exec(t);
  if (bud) {
    out.budgetInr = { value: Number(bud[1]), evidence: clip(bud[0]) };
    const tail = t.slice(bud.index, bud.index + bud[0].length + 30);
    const per = bud[2] ?? /\b(week|weekly|month|monthly)\b/.exec(tail)?.[1];
    if (per) out.budgetPeriod = { value: per.startsWith('week') ? 'weekly' : 'monthly', evidence: per };
  }

  // ---- meals per day
  const meals = /\b(3|4)\s*meals?\s*(?:a|per)\s*day\b/.exec(t);
  if (meals) out.mealsPerDay = { value: meals[1] === '3' ? 3 : 4, evidence: clip(meals[0]) };
  else if (/\b(no snacks?|don't snack|dont snack)\b/.test(t)) out.mealsPerDay = { value: 3, evidence: 'no snacks' };

  // ---- health scope (out-of-scope situations; negation-aware)
  const CLIN: [ClinicalFlag, RegExp][] = [
    ['pregnancy', /\b(pregnant|pregnancy|expecting a baby)\b/],
    ['lactation', /\b(breastfeeding|breast feeding|lactating|nursing (?:my|a) baby)\b/],
    ['eating_disorder', /\b(eating disorder|anorexia|anorexic|bulimia|bulimic|binge eating)\b/],
    ['kidney_disease', /\b(kidney disease|ckd|dialysis|kidney problem)\b/],
    ['diabetes_clinical_diet', /\b(diabetes|diabetic|sugar patient|type 1|type 2)\b/],
    ['bariatric_surgery', /\b(bariatric|gastric bypass|gastric sleeve)\b/],
    ['other_medical_condition', /\b(thyroid|hypothyroid|pcos|pcod|blood pressure|hypertension|heart (?:disease|condition|problem)|cholesterol|celiac|coeliac|liver disease|cancer|on medication for)\b/],
  ];
  const flags = new Set<ClinicalFlag>();
  const flagEv: string[] = [];
  for (const [f, re] of CLIN) {
    const m = findPositive(t, [re]);
    if (m) {
      flags.add(f);
      flagEv.push(clip(m[0]));
    }
  }
  if (flags.size) out.clinicalFlags = { value: [...flags], evidence: flagEv.join('; ') };
  const noClin = /\b(no (?:health|medical) (?:issues?|problems?|conditions?)|no (?:known )?(?:diseases?|conditions)|(?:i am|i'm|im) (?:completely |perfectly )?healthy|in good health|no health concerns)\b/.exec(t);
  if (noClin && !flags.size) out.noClinical = { value: true, evidence: clip(noClin[0]) };

  return out;
}

/** Fields the quick setup still needs to ask about after extraction. */
export type FollowUp = 'age' | 'sex' | 'height' | 'weight' | 'occupation' | 'movement' | 'workouts' | 'workoutDetails' | 'diet' | 'allergies' | 'goal' | 'budget' | 'clinical';

export function missingFollowUps(e: Extraction): FollowUp[] {
  const m: FollowUp[] = [];
  if (!e.ageYears) m.push('age');
  if (!e.sex) m.push('sex');
  if (!e.heightCm) m.push('height');
  if (!e.weightKg) m.push('weight');
  if (!e.occupation) m.push('occupation');
  if (!e.movement) m.push('movement');
  if (!e.workoutsPerWeek) m.push('workouts');
  else if (e.workoutsPerWeek.value > 0 && (!e.intensity || !e.workoutMinutes)) m.push('workoutDetails');
  if (!e.dietPattern) m.push('diet');
  if (!e.allergies && !e.noAllergies) m.push('allergies');
  if (!e.goal) m.push('goal');
  if (!e.budgetInr || !e.budgetPeriod) m.push('budget');
  if (!e.clinicalFlags && !e.noClinical) m.push('clinical');
  return m;
}
