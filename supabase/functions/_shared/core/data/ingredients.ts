// Canonical ingredients with ILLUSTRATIVE per-100 g values (source SAMPLE_FOODS_V1).
// null means "not available" and is shown as unknown, never as zero.
// These values are rounded approximations for testing the engines and are NOT verified
// nutrition facts. Replace with a licensed dataset before any public advice.
import type { Ingredient, NutrientValues } from '../domain/types.ts';

type Row = [
  id: string,
  name: string,
  group: Ingredient['foodGroup'],
  diet: Ingredient['dietClass'],
  allergens: Ingredient['allergens'],
  n: [number | null, number | null, number | null, number | null, number | null, number | null, number | null],
  perishability: Ingredient['perishability'],
  extra?: Partial<Pick<Ingredient, 'unitBasis' | 'gramsPerPiece' | 'state' | 'localNames' | 'substitutes'>>,
];

// n = [kcal, protein g, carbs g, fat g, fibre g, iron mg, calcium mg] per 100 g edible portion
const ROWS: Row[] = [
  ['rice', 'Rice (Sona Masoori, raw)', 'cereal', 'plant', [], [350, 7, 78, 0.5, 0.6, 0.6, 10], 'staple', { localNames: ['biyyam', 'chawal'], state: 'dry' }],
  ['wheat_atta', 'Whole wheat atta', 'cereal', 'plant', ['gluten'], [340, 12, 70, 1.7, 11, 4, 35], 'staple', { state: 'dry' }],
  ['jowar_flour', 'Jowar (sorghum) flour', 'millet', 'plant', [], [350, 10.5, 72, 1.7, 9.7, 3.9, 25], 'staple', { localNames: ['jonna pindi'], state: 'dry' }],
  ['ragi_flour', 'Ragi (finger millet) flour', 'millet', 'plant', [], [330, 7.3, 72, 1.4, 11, 3.9, 344], 'staple', { localNames: ['ragi pindi'], state: 'dry' }],
  ['foxtail_millet', 'Foxtail millet', 'millet', 'plant', [], [350, 12, 63, 4, null, 2.8, 31], 'staple', { localNames: ['korralu'], state: 'dry' }],
  ['rava', 'Semolina (rava / sooji)', 'cereal', 'plant', ['gluten'], [360, 12, 73, 1, 3.9, 1.2, 17], 'staple', { state: 'dry' }],
  ['poha', 'Poha (flattened rice)', 'cereal', 'plant', [], [350, 6.6, 77, 1.2, null, null, 20], 'staple', { localNames: ['atukulu'], state: 'dry' }],
  ['oats', 'Rolled oats', 'cereal', 'plant', ['gluten'], [380, 13, 67, 7, 10, 4.2, 54], 'staple', { state: 'dry', substitutes: [{ ingredientId: 'poha', ratio: 1, note: 'Lower fibre, cheaper per kg' }] }],
  ['bread_ww', 'Whole wheat bread', 'cereal', 'plant', ['gluten'], [250, 9, 43, 3.5, 6, 2.5, null], 'packaged', { state: 'cooked' }],
  ['moong_whole', 'Green gram, whole (moong)', 'pulse', 'plant', [], [340, 24, 59, 1.2, 16, 4.4, 124], 'staple', { localNames: ['pesalu'], state: 'dry' }],
  ['moong_dal', 'Moong dal, split', 'pulse', 'plant', [], [350, 24, 60, 1.2, 8, 3.9, 75], 'staple', { state: 'dry', substitutes: [{ ingredientId: 'masoor_dal', ratio: 1, note: 'Similar protein, usually cheaper' }] }],
  ['toor_dal', 'Toor dal (pigeon pea)', 'pulse', 'plant', [], [340, 22, 58, 1.5, 15, 2.7, 73], 'staple', { localNames: ['kandi pappu'], state: 'dry', substitutes: [{ ingredientId: 'masoor_dal', ratio: 1, note: 'Similar protein, usually cheaper' }] }],
  ['masoor_dal', 'Masoor dal (red lentil)', 'pulse', 'plant', [], [350, 24, 60, 1, 11, 7.5, 56], 'staple', { state: 'dry' }],
  ['besan', 'Besan (gram flour)', 'pulse', 'plant', [], [390, 22, 58, 6.7, 11, 4.9, 45], 'staple', { state: 'dry' }],
  ['kabuli_chana', 'Chickpeas (kabuli chana)', 'pulse', 'plant', [], [360, 19, 61, 6, 17, 6.2, 105], 'staple', { state: 'dry', substitutes: [{ ingredientId: 'kala_chana', ratio: 1, note: 'Black chana, similar protein, cheaper' }] }],
  ['kala_chana', 'Black chana', 'pulse', 'plant', [], [360, 20, 58, 5, 15, 6, null], 'staple', { state: 'dry' }],
  ['rajma', 'Rajma (kidney beans)', 'pulse', 'plant', [], [340, 23, 60, 0.8, 15, 8.2, 143], 'staple', { state: 'dry', substitutes: [{ ingredientId: 'kabuli_chana', ratio: 1, note: 'Similar protein; different taste' }] }],
  ['urad_dal', 'Urad dal', 'pulse', 'plant', [], [340, 25, 59, 1.6, 18, 7.6, 138], 'staple', { localNames: ['minapa pappu'], state: 'dry' }],
  ['soya_chunks', 'Soya chunks (dry)', 'soy', 'plant', ['soy'], [345, 52, 33, 0.5, 13, null, 350], 'packaged', { state: 'dry' }],
  ['tofu', 'Tofu (firm)', 'soy', 'plant', ['soy'], [76, 8, 1.9, 4.8, 0.3, 1.5, null], 'fresh', { substitutes: [{ ingredientId: 'paneer', ratio: 1, note: 'Higher fat, contains dairy' }] }],
  ['paneer', 'Paneer', 'dairy', 'dairy', ['dairy'], [265, 18, 1.2, 21, 0, null, 480], 'fresh', { substitutes: [{ ingredientId: 'tofu', ratio: 1, note: 'Lower fat and protein per gram; contains soy' }, { ingredientId: 'soya_chunks', ratio: 0.35, note: 'Dry soya rehydrates ~3x; similar protein, much cheaper; contains soy' }] }],
  ['milk', 'Toned milk', 'dairy', 'dairy', ['dairy'], [58, 3.2, 4.7, 3, 0, null, 120], 'daily', { unitBasis: 'ml' }],
  ['curd', 'Curd (dahi)', 'dairy', 'dairy', ['dairy'], [60, 3.5, 4.5, 3, 0, null, 120], 'daily', { localNames: ['perugu'] }],
  ['egg', 'Egg', 'egg', 'egg', ['egg'], [143, 12.6, 0.7, 9.5, 0, 1.8, 56], 'fresh', { unitBasis: 'piece', gramsPerPiece: 50, localNames: ['guddu', 'anda'] }],
  ['chicken', 'Chicken, boneless (raw)', 'meat', 'meat', [], [120, 22.5, 0, 2.6, 0, 0.4, 11], 'fresh', { substitutes: [{ ingredientId: 'soya_chunks', ratio: 0.45, note: 'Dry soya; similar protein, far cheaper; contains soy' }] }],
  ['fish_rohu', 'Fish, rohu (raw)', 'fish', 'fish', ['fish'], [97, 16.6, 0, 1.4, 0, null, null], 'fresh', { substitutes: [{ ingredientId: 'chicken', ratio: 1, note: 'Higher protein per gram' }] }],
  ['peanuts', 'Peanuts', 'nut_seed', 'plant', ['peanut'], [567, 26, 16, 49, 8.5, 4.6, 92], 'staple', { localNames: ['palli'], state: 'dry', substitutes: [{ ingredientId: 'kala_chana', ratio: 1.2, note: 'Roasted chana; less fat, peanut-free' }] }],
  ['onion', 'Onion', 'vegetable', 'plant', [], [40, 1.1, 9, 0.1, 1.7, 0.2, 23], 'fresh'],
  ['tomato', 'Tomato', 'vegetable', 'plant', [], [18, 0.9, 3.9, 0.2, 1.2, 0.3, 10], 'fresh'],
  ['potato', 'Potato', 'vegetable', 'plant', [], [77, 2, 17, 0.1, 2.2, 0.8, 12], 'fresh'],
  ['spinach', 'Spinach (palak)', 'vegetable', 'plant', [], [23, 2.9, 3.6, 0.4, 2.2, 2.7, 99], 'fresh', { localNames: ['palakura'] }],
  ['okra', 'Okra (bhindi)', 'vegetable', 'plant', [], [33, 1.9, 7.5, 0.2, 3.2, 0.6, 82], 'fresh', { localNames: ['bendakaya'] }],
  ['carrot', 'Carrot', 'vegetable', 'plant', [], [41, 0.9, 9.6, 0.2, 2.8, 0.3, 33], 'fresh'],
  ['beans', 'French beans', 'vegetable', 'plant', [], [31, 1.8, 7, 0.2, 2.7, 1, 37], 'fresh', { substitutes: [{ ingredientId: 'bottle_gourd', ratio: 1, note: 'Cheaper vegetable; less protein' }] }],
  ['capsicum', 'Capsicum', 'vegetable', 'plant', [], [20, 0.9, 4.6, 0.2, 1.7, 0.3, 10], 'fresh', { substitutes: [{ ingredientId: 'carrot', ratio: 1, note: 'Cheaper; different texture' }] }],
  ['cucumber', 'Cucumber', 'vegetable', 'plant', [], [15, 0.7, 3.6, 0.1, 0.5, 0.3, 16], 'fresh'],
  ['bottle_gourd', 'Bottle gourd (lauki)', 'vegetable', 'plant', [], [15, 0.6, 3.4, 0.1, 0.5, 0.2, 26], 'fresh', { localNames: ['sorakaya'] }],
  ['peas', 'Green peas (frozen)', 'vegetable', 'plant', [], [81, 5.4, 14, 0.4, 5, 1.5, 25], 'packaged'],
  ['banana', 'Banana', 'fruit', 'plant', [], [89, 1.1, 23, 0.3, 2.6, 0.3, 5], 'fresh', { unitBasis: 'piece', gramsPerPiece: 118 }],
  ['papaya', 'Papaya', 'fruit', 'plant', [], [43, 0.5, 11, 0.3, 1.7, 0.3, 20], 'fresh'],
  ['lemon', 'Lemon', 'fruit', 'plant', [], [29, 1.1, 9.3, 0.3, 2.8, 0.6, 26], 'fresh'],
  ['coconut', 'Coconut, fresh grated', 'nut_seed', 'plant', [], [354, 3.3, 15, 33, 9, 2.4, 14], 'fresh'],
  ['oil', 'Sunflower oil', 'fat', 'plant', [], [884, 0, 0, 100, 0, 0, 0], 'staple'],
  ['ghee', 'Ghee', 'fat', 'dairy', ['dairy'], [900, 0, 0, 99.5, 0, null, null], 'staple', { substitutes: [{ ingredientId: 'oil', ratio: 1, note: 'Same fat; dairy-free; cheaper' }] }],
  ['masala', 'Everyday spice mix', 'condiment', 'plant', [], [300, 12, 45, 10, null, null, null], 'staple'],
  ['tamarind', 'Tamarind', 'condiment', 'plant', [], [239, 2.8, 62, 0.6, 5.1, 2.8, 74], 'staple', { state: 'dry' }],
  ['makhana', 'Makhana (fox nut)', 'nut_seed', 'plant', [], [350, 9.7, 77, 0.1, null, 1.4, 60], 'packaged', { state: 'dry' }],
];

export const INGREDIENTS: Ingredient[] = ROWS.map(([id, name, foodGroup, dietClass, allergens, n, perishability, extra]) => {
  const nutrientsPer100: NutrientValues = {
    energyKcal: n[0],
    proteinG: n[1],
    carbsG: n[2],
    fatG: n[3],
    fibreG: n[4],
    ironMg: n[5],
    calciumMg: n[6],
  };
  return {
    id,
    name,
    localNames: extra?.localNames ?? [],
    foodGroup,
    unitBasis: extra?.unitBasis ?? 'g',
    gramsPerPiece: extra?.gramsPerPiece,
    state: extra?.state ?? 'raw',
    dietClass,
    allergens,
    nutrientsPer100,
    sourceId: 'SAMPLE_FOODS_V1',
    confidence: 'low',
    verified: false,
    perishability,
    substitutes: extra?.substitutes ?? [],
  };
});

export const INGREDIENT_MAP = new Map(INGREDIENTS.map((i) => [i.id, i]));
