// Store product matcher: maps a real retailer product title (Instamart, Zepto, a local
// shop) to one of our canonical ingredients, reads the pack size, and detects diet and
// allergen markers in the title itself.
//
// Design rules (each one is scored in src/eval):
//  1. Prefer "no match" over a wrong match. Processed or flavoured products (noodles,
//     masala oats, peanut butter, mixes) are rejected unless a rule says otherwise.
//  2. Longest phrase wins: "jowar atta" is jowar, never wheat; "chicken masala" is a
//     spice mix, never chicken.
//  3. Safety markers are detected independently of the match, so a title that says
//     "egg" can never be treated as vegetarian, even when the ingredient match fails.
import type { Allergen, Ingredient, UnitBasis } from '../types.ts';

export const MATCHER_VERSION = 'matcher-1.0.0';

interface Rule {
  ingredientId: string;
  phrases: string[]; // high-confidence phrases
  related?: string[]; // medium-confidence phrases (different variety, same food)
}

// Order does not matter: the longest matching phrase across all rules wins.
const RULES: Rule[] = [
  { ingredientId: 'rice', phrases: ['sona masoori', 'sona masuri', 'raw rice', 'rice'], related: ['basmati rice', 'basmati', 'kolam rice', 'ponni rice', 'hmt rice'] },
  { ingredientId: 'wheat_atta', phrases: ['whole wheat atta', 'chakki atta', 'wheat atta', 'gehu atta', 'whole wheat flour', 'atta'] },
  { ingredientId: 'jowar_flour', phrases: ['jowar atta', 'jowar flour', 'jonna pindi', 'sorghum flour', 'jowar'] },
  { ingredientId: 'ragi_flour', phrases: ['ragi atta', 'ragi flour', 'finger millet flour', 'ragi'] },
  { ingredientId: 'foxtail_millet', phrases: ['foxtail millet', 'korralu', 'kangni', 'navane'] },
  { ingredientId: 'rava', phrases: ['bombay rava', 'sooji', 'suji', 'semolina', 'rava'] },
  { ingredientId: 'poha', phrases: ['thick poha', 'thin poha', 'medium poha', 'poha', 'atukulu', 'flattened rice', 'aval'] },
  { ingredientId: 'oats', phrases: ['rolled oats', 'oats'] },
  { ingredientId: 'bread_ww', phrases: ['whole wheat bread', '100% whole wheat bread', 'atta bread'], related: ['brown bread'] },
  { ingredientId: 'moong_whole', phrases: ['green moong whole', 'whole moong', 'moong whole', 'green gram whole', 'green gram', 'sabut moong', 'pesalu'] },
  { ingredientId: 'moong_dal', phrases: ['moong dal', 'yellow moong', 'moong dal yellow', 'split moong'] },
  { ingredientId: 'toor_dal', phrases: ['toor dal', 'tur dal', 'arhar dal', 'kandi pappu', 'pigeon pea'] },
  { ingredientId: 'masoor_dal', phrases: ['masoor dal', 'masoor malka', 'red lentil', 'red lentils'] },
  { ingredientId: 'besan', phrases: ['besan', 'gram flour', 'chickpea flour'] },
  { ingredientId: 'kabuli_chana', phrases: ['kabuli chana', 'chole', 'white chana', 'chickpeas', 'garbanzo'] },
  { ingredientId: 'kala_chana', phrases: ['kala chana', 'black chana', 'brown chana', 'black chickpeas'] },
  { ingredientId: 'rajma', phrases: ['rajma', 'kidney beans', 'red kidney beans'] },
  { ingredientId: 'urad_dal', phrases: ['urad dal', 'urad split', 'minapa pappu', 'black gram split'] },
  { ingredientId: 'soya_chunks', phrases: ['soya chunks', 'soy chunks', 'soya nuggets', 'meal maker', 'soya granules'] },
  { ingredientId: 'tofu', phrases: ['tofu', 'soya paneer', 'bean curd'] },
  { ingredientId: 'paneer', phrases: ['malai paneer', 'fresh paneer', 'paneer', 'cottage cheese'] },
  { ingredientId: 'milk', phrases: ['toned milk', 'double toned milk', 'cow milk', 'buffalo milk', 'full cream milk', 'homogenised milk', 'milk'] },
  { ingredientId: 'curd', phrases: ['curd', 'dahi', 'set curd', 'perugu'] },
  { ingredientId: 'egg', phrases: ['eggs', 'egg tray', 'brown eggs', 'white eggs', 'farm eggs'] },
  { ingredientId: 'chicken', phrases: ['chicken breast', 'chicken boneless', 'boneless chicken', 'chicken breast boneless'], related: ['chicken curry cut', 'chicken curry-cut'] },
  { ingredientId: 'fish_rohu', phrases: ['rohu', 'rohu fish'] },
  { ingredientId: 'peanuts', phrases: ['raw peanuts', 'peanuts', 'groundnuts', 'groundnut', 'moongphali', 'palli'] },
  { ingredientId: 'onion', phrases: ['onion', 'onions', 'pyaz'] },
  { ingredientId: 'tomato', phrases: ['tomato', 'tomatoes', 'tamatar'] },
  { ingredientId: 'potato', phrases: ['potato', 'potatoes', 'aloo'] },
  { ingredientId: 'spinach', phrases: ['spinach', 'palak', 'palakura'] },
  { ingredientId: 'okra', phrases: ['bhindi', 'okra', 'lady finger', 'ladies finger', 'ladyfinger', 'bendakaya'] },
  { ingredientId: 'carrot', phrases: ['carrot', 'carrots', 'gajar'] },
  { ingredientId: 'beans', phrases: ['french beans', 'beans french', 'green beans', 'beans'] },
  { ingredientId: 'capsicum', phrases: ['capsicum', 'bell pepper', 'shimla mirch'] },
  { ingredientId: 'cucumber', phrases: ['cucumber', 'kheera', 'keera'] },
  { ingredientId: 'bottle_gourd', phrases: ['bottle gourd', 'lauki', 'sorakaya', 'dudhi', 'ghiya'] },
  { ingredientId: 'peas', phrases: ['green peas', 'frozen peas', 'matar', 'peas'] },
  { ingredientId: 'banana', phrases: ['banana robusta', 'robusta banana', 'yelakki banana', 'nendran banana', 'banana', 'bananas'] },
  { ingredientId: 'papaya', phrases: ['papaya'] },
  { ingredientId: 'lemon', phrases: ['lemon', 'lemons', 'nimbu'] },
  { ingredientId: 'coconut', phrases: ['grated coconut', 'fresh coconut', 'coconut grated', 'coconut'] },
  { ingredientId: 'oil', phrases: ['sunflower oil', 'refined sunflower oil', 'sunflower refined oil'], related: ['rice bran oil', 'groundnut oil', 'blended oil', 'refined oil'] },
  { ingredientId: 'ghee', phrases: ['cow ghee', 'desi ghee', 'buffalo ghee', 'ghee'] },
  { ingredientId: 'masala', phrases: ['garam masala', 'chicken masala', 'egg masala', 'egg curry masala', 'fish masala', 'meat masala', 'sambar masala', 'chole masala', 'pav bhaji masala', 'kitchen king', 'masala'] },
  { ingredientId: 'tamarind', phrases: ['tamarind', 'imli', 'chintapandu'] },
  { ingredientId: 'makhana', phrases: ['makhana', 'fox nut', 'fox nuts', 'phool makhana', 'lotus seeds'] },
];

/** Words that mean "this is a processed or different product", which we refuse to map. */
const BLOCKERS = [
  'noodles', 'pasta', 'biscuit', 'biscuits', 'cookies', 'cake', 'chips', 'bhujia', 'namkeen', 'mix', 'instant', 'ready to eat', 'ready to cook',
  'masala oats', 'flavoured', 'flavored', 'butter', 'spread', 'sauce', 'ketchup', 'pickle', 'achar', 'chocolate', 'candy', 'juice', 'drink', 'shake',
  'milk powder', 'soya milk', 'soy milk', 'almond milk', 'oat milk', 'coconut milk', 'coconut water', 'coconut oil', 'buttermilk', 'lassi', 'yogurt', 'yoghurt',
  'ice cream', 'paneer tikka', 'frozen paratha', 'multigrain', 'brown rice', 'brown basmati', 'red rice', 'raw banana', 'plantain', 'chana dal', 'mutton', 'prawn', 'prawns',
  'shrimp', 'nuggets', 'sausage', 'salami', 'cutlet', 'kebab', 'white bread', 'sandwich bread', 'popcorn', 'roasted chana', 'protein bar', 'powder',
];
/** Blockers that a full ingredient phrase is allowed to contain. */
const BLOCKER_EXCEPTIONS: Record<string, string[]> = {
  masala: ['masala'],
  soya_chunks: ['nuggets'],
};

/** Safety markers read from the title. "eggless" / "egg free" never count as egg. */
const MARKERS: { kind: 'egg' | 'meat' | 'fish' | 'dairy' | 'allergen'; allergen?: Allergen; re: RegExp }[] = [
  { kind: 'egg', allergen: 'egg', re: /\begg(?:s)?\b(?!\s*(?:less|free))/ },
  { kind: 'meat', re: /\b(chicken|mutton|lamb|pork|beef|meat|sausage|salami|ham)\b/ },
  { kind: 'fish', allergen: 'fish', re: /\b(fish|rohu|tuna|salmon|seer|pomfret|anchovy)\b/ },
  { kind: 'allergen', allergen: 'shellfish', re: /\b(prawns?|shrimps?|crabs?|lobsters?)\b/ },
  { kind: 'dairy', allergen: 'dairy', re: /\b(milk|paneer|curd|dahi|cheese|butter|ghee|cream|whey|buttermilk|lassi)\b/ },
  { kind: 'allergen', allergen: 'peanut', re: /\b(peanuts?|groundnuts?|moongphali)\b/ },
  { kind: 'allergen', allergen: 'tree_nut', re: /\b(almonds?|cashews?|walnuts?|pistachios?|badam|kaju|hazelnuts?)\b/ },
  { kind: 'allergen', allergen: 'soy', re: /\b(soy|soya)\b/ },
  { kind: 'allergen', allergen: 'gluten', re: /\b(wheat|maida|bread|semolina|sooji|suji|rava|oats)\b/ },
  { kind: 'allergen', allergen: 'sesame', re: /\b(sesame|til)\b/ },
];
const NOT_MARKERS: RegExp[] = [/\bmasala\b/]; // "chicken masala", "egg masala": spice mixes contain no chicken/egg

/** Pack size: "5 kg", "500 g", "1 L", "500 ml", "6 pcs", "pack of 6", "30 eggs", "2 x 500 g". */
export function parsePack(title: string): { qty: number; unit: UnitBasis | 'ml_or_g'; raw: string } | null {
  const t = title.toLowerCase().replace(/,/g, '');
  const multi = /(\d+)\s*[x×]\s*(\d+(?:\.\d+)?)\s*(kg|g|gm|gms|grams?|l|ltr|litres?|liters?|ml)\b/.exec(t);
  const one = /(\d+(?:\.\d+)?)\s*(kg|g|gm|gms|grams?|l|ltr|litres?|liters?|ml)\b/.exec(t);
  const pcs = /(?:pack of|set of)\s*(\d+)|(\d+)\s*(?:pcs|pieces|pc|nos|units|eggs)\b/.exec(t);
  const toBase = (n: number, u: string): { qty: number; unit: UnitBasis } =>
    /^kg$/.test(u) ? { qty: n * 1000, unit: 'g' } : /^(g|gm|gms|grams?)$/.test(u) ? { qty: n, unit: 'g' } : /^(l|ltr|litres?|liters?)$/.test(u) ? { qty: n * 1000, unit: 'ml' } : { qty: n, unit: 'ml' };
  if (multi) {
    const b = toBase(Number(multi[2]), multi[3]);
    return { qty: Number(multi[1]) * b.qty, unit: b.unit, raw: multi[0] };
  }
  if (one) {
    const b = toBase(Number(one[1]), one[2]);
    return { ...b, raw: one[0] };
  }
  if (pcs) return { qty: Number(pcs[1] ?? pcs[2]), unit: 'piece', raw: pcs[0] };
  return null;
}

/** Explicit ml -> g conversions for liquids our data stores by weight. */
export const DENSITY_G_PER_ML: Record<string, number> = { oil: 0.91, ghee: 0.91 };

export interface MatchResult {
  title: string;
  ingredientId: string | null;
  confidence: 'high' | 'medium' | 'none';
  matchedPhrase: string | null;
  blockedBy: string | null;
  pack: { qty: number; unit: UnitBasis } | null; // converted to the ingredient's unit basis where possible
  packNote: string | null;
  markers: { egg: boolean; meat: boolean; fish: boolean; dairy: boolean; allergens: Allergen[] };
  /** Markers the matched ingredient does not already carry; added to the product so filters see them. */
  extraAllergens: Allergen[];
  reasons: string[];
}

function containsPhrase(t: string, phrase: string): number {
  const m = new RegExp(`(?:^|[^a-z])${phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/ /g, '[\\s-]+')}(?:[^a-z]|$)`).exec(t);
  return m ? m.index : -1;
}

export function matchProductTitle(title: string, ingredients: Map<string, Ingredient>): MatchResult {
  const t = ` ${title.toLowerCase().replace(/[()[\],/]/g, ' ').replace(/\s+/g, ' ')} `;
  const reasons: string[] = [];

  // Safety markers first, independent of matching.
  const masked = NOT_MARKERS.reduce((acc, re) => (re.test(acc) ? acc.replace(/\b(chicken|egg|fish|meat|mutton)\s+(?:curry\s+)?masala\b/g, ' masala ') : acc), t).replace(/\bpeanut butter\b/g, ' peanut spread ');
  const markers = { egg: false, meat: false, fish: false, dairy: false, allergens: [] as Allergen[] };
  for (const mk of MARKERS) {
    if (mk.re.test(masked)) {
      if (mk.kind === 'egg') markers.egg = true;
      if (mk.kind === 'meat') markers.meat = true;
      if (mk.kind === 'fish') markers.fish = true;
      if (mk.kind === 'dairy') markers.dairy = true;
      if (mk.allergen && !markers.allergens.includes(mk.allergen)) markers.allergens.push(mk.allergen);
    }
  }

  // Longest phrase across all rules wins.
  let best: { rule: Rule; phrase: string; conf: 'high' | 'medium' } | null = null;
  for (const rule of RULES) {
    for (const [list, conf] of [[rule.phrases, 'high'], [rule.related ?? [], 'medium']] as const) {
      for (const ph of list) {
        if (containsPhrase(t, ph) >= 0 && (!best || ph.length > best.phrase.length)) best = { rule, phrase: ph, conf };
      }
    }
  }

  const pack0 = parsePack(title);
  const blocker = BLOCKERS.find((b) => containsPhrase(t, b) >= 0 && !(best && (BLOCKER_EXCEPTIONS[best.rule.ingredientId] ?? []).includes(b)) && !(best && best.phrase.includes(b)));
  if (!best || blocker) {
    if (blocker) reasons.push(`Not mapped: “${blocker}” means a processed or different product`);
    else reasons.push('Not mapped: no known ingredient name in the title');
    return { title, ingredientId: null, confidence: 'none', matchedPhrase: best?.phrase ?? null, blockedBy: blocker ?? null, pack: null, packNote: pack0 ? `Pack ${pack0.raw}` : null, markers, extraAllergens: markers.allergens, reasons };
  }

  const ing = ingredients.get(best.rule.ingredientId)!;
  reasons.push(`Matched “${best.phrase}” → ${ing.name}${best.conf === 'medium' ? ' (different variety, same food)' : ''}`);

  // Pack conversion into the ingredient's own unit basis.
  let pack: MatchResult['pack'] = null;
  let packNote: string | null = null;
  if (pack0) {
    if (pack0.unit === ing.unitBasis) pack = { qty: pack0.qty, unit: pack0.unit };
    else if (pack0.unit === 'ml' && ing.unitBasis === 'g' && DENSITY_G_PER_ML[ing.id]) {
      pack = { qty: Math.round(pack0.qty * DENSITY_G_PER_ML[ing.id]), unit: 'g' };
      packNote = `${pack0.raw} converted at ${DENSITY_G_PER_ML[ing.id]} g/ml`;
    } else if (pack0.unit === 'g' && ing.unitBasis === 'ml') {
      pack = { qty: pack0.qty, unit: 'ml' };
      packNote = `${pack0.raw} treated as ml (density ≈ 1)`;
    } else packNote = `Pack “${pack0.raw}” could not be converted to ${ing.unitBasis}`;
  } else packNote = 'Pack size not found in the title';

  // Markers the ingredient itself does not carry become extra product allergens.
  const extraAllergens = markers.allergens.filter((a) => !ing.allergens.includes(a));
  const dietClash = (markers.egg && ing.dietClass !== 'egg') || (markers.meat && ing.dietClass !== 'meat') || (markers.fish && ing.dietClass !== 'fish');
  if (dietClash) {
    reasons.push('Title mentions egg, meat or fish that the matched ingredient does not have, so it is not mapped');
    return { title, ingredientId: null, confidence: 'none', matchedPhrase: best.phrase, blockedBy: 'diet marker', pack, packNote, markers, extraAllergens, reasons };
  }
  if (extraAllergens.length) reasons.push(`Title also mentions ${extraAllergens.join(', ')}; added as product allergens`);
  return { title, ingredientId: ing.id, confidence: best.conf, matchedPhrase: best.phrase, blockedBy: null, pack, packNote, markers, extraAllergens, reasons };
}
