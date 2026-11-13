// Labelled test set for the store-product matcher: product titles in the style used by
// quick-commerce apps in India, with the correct canonical ingredient (or null when the
// product must NOT be mapped), the expected pack size, and safety markers that must be
// detected. Brand names appear only as text to match against; no catalogue data is copied.
import type { Allergen, UnitBasis } from '../../domain/types.ts';

export interface TitleGold {
  ingredientId: string | null;
  acceptable?: string[]; // other acceptable answers
  qty?: number; // in the ingredient's unit basis
  unit?: UnitBasis;
  egg?: boolean;
  meat?: boolean;
  fish?: boolean;
  allergens?: Allergen[]; // markers that MUST be detected from the title
}

export interface TitleCase {
  id: string;
  title: string;
  gold: TitleGold;
  trap?: string; // what makes this case hard
}

export const STORE_TITLES: TitleCase[] = [
  { id: 't01', title: 'Aashirvaad Shudh Chakki Atta 5 kg', gold: { ingredientId: 'wheat_atta', qty: 5000, unit: 'g' } },
  { id: 't02', title: 'Tata Sampann Unpolished Toor Dal 1 kg', gold: { ingredientId: 'toor_dal', qty: 1000, unit: 'g' } },
  { id: 't03', title: 'Amul Taaza Toned Milk 500 ml', gold: { ingredientId: 'milk', qty: 500, unit: 'ml', allergens: ['dairy'] } },
  { id: 't04', title: 'Amul Fresh Paneer 200 g', gold: { ingredientId: 'paneer', qty: 200, unit: 'g', allergens: ['dairy'] } },
  { id: 't05', title: 'Fortune Sunlite Refined Sunflower Oil 1 L', gold: { ingredientId: 'oil', qty: 910, unit: 'g' } },
  { id: 't06', title: 'Eggoz Nutrition Brown Eggs - Pack of 6', gold: { ingredientId: 'egg', qty: 6, unit: 'piece', egg: true, allergens: ['egg'] } },
  { id: 't07', title: 'Licious Chicken Breast Boneless 450 g', gold: { ingredientId: 'chicken', qty: 450, unit: 'g', meat: true } },
  { id: 't08', title: 'Maggi 2-Minute Masala Noodles 70 g', gold: { ingredientId: null }, trap: 'processed, contains "masala"' },
  { id: 't09', title: "Haldiram's Aloo Bhujia 200 g", gold: { ingredientId: null }, trap: 'snack containing "aloo"' },
  { id: 't10', title: 'MDH Chicken Masala 100 g', gold: { ingredientId: 'masala', qty: 100, unit: 'g', meat: false }, trap: 'spice mix named after chicken' },
  { id: 't11', title: "Ching's Egg Noodles 150 g", gold: { ingredientId: null, egg: true, allergens: ['egg'] }, trap: 'processed and contains egg' },
  { id: 't12', title: 'India Gate Basmati Rice Classic 1 kg', gold: { ingredientId: 'rice', qty: 1000, unit: 'g' }, trap: 'different rice variety' },
  { id: 't13', title: 'Daawat Brown Basmati Rice 1 kg', gold: { ingredientId: null }, trap: 'brown rice has different nutrition' },
  { id: 't14', title: 'Patanjali Cow Ghee 1 L', gold: { ingredientId: 'ghee', qty: 910, unit: 'g', allergens: ['dairy'] } },
  { id: 't15', title: 'Nandini Curd 500 g', gold: { ingredientId: 'curd', qty: 500, unit: 'g', allergens: ['dairy'] } },
  { id: 't16', title: 'Epigamia Greek Yogurt Natural 400 g', gold: { ingredientId: null, allergens: [] }, trap: 'greek yogurt is not curd' },
  { id: 't17', title: 'Fresho Onion 1 kg', gold: { ingredientId: 'onion', qty: 1000, unit: 'g' } },
  { id: 't18', title: 'Fresho Tomato - Local 500 g', gold: { ingredientId: 'tomato', qty: 500, unit: 'g' } },
  { id: 't19', title: 'Fresho Potato 1 kg', gold: { ingredientId: 'potato', qty: 1000, unit: 'g' } },
  { id: 't20', title: 'Fresh Bhindi 250 g', gold: { ingredientId: 'okra', qty: 250, unit: 'g' } },
  { id: 't21', title: 'Lady Finger 500 g', gold: { ingredientId: 'okra', qty: 500, unit: 'g' } },
  { id: 't22', title: 'Palak (Spinach) Bunch 250 g', gold: { ingredientId: 'spinach', qty: 250, unit: 'g' } },
  { id: 't23', title: 'Banana Robusta 6 pcs', gold: { ingredientId: 'banana', qty: 6, unit: 'piece' } },
  { id: 't24', title: 'Raw Banana 500 g', gold: { ingredientId: null }, trap: 'cooking plantain, not fruit banana' },
  { id: 't25', title: 'Raw Peanuts 500 g', gold: { ingredientId: 'peanuts', qty: 500, unit: 'g', allergens: ['peanut'] } },
  { id: 't26', title: 'Pintola Peanut Butter Creamy 350 g', gold: { ingredientId: null, allergens: ['peanut'] }, trap: 'processed, peanut allergen must still be flagged' },
  { id: 't27', title: 'Tata Sampann Chana Dal 1 kg', gold: { ingredientId: null }, trap: 'chana dal is not kabuli chana or besan' },
  { id: 't28', title: 'Kabuli Chana 1 kg', gold: { ingredientId: 'kabuli_chana', qty: 1000, unit: 'g' } },
  { id: 't29', title: 'Rajma Chitra 500 g', gold: { ingredientId: 'rajma', qty: 500, unit: 'g' } },
  { id: 't30', title: 'Yellow Moong Dal 500 g', gold: { ingredientId: 'moong_dal', qty: 500, unit: 'g' } },
  { id: 't31', title: 'Green Moong Whole 1 kg', gold: { ingredientId: 'moong_whole', qty: 1000, unit: 'g' } },
  { id: 't32', title: 'Masoor Dal Malka 1 kg', gold: { ingredientId: 'masoor_dal', qty: 1000, unit: 'g' } },
  { id: 't33', title: 'Urad Dal Split White 500 g', gold: { ingredientId: 'urad_dal', qty: 500, unit: 'g' } },
  { id: 't34', title: 'Rajdhani Besan 500 g', gold: { ingredientId: 'besan', qty: 500, unit: 'g' } },
  { id: 't35', title: 'Bombay Rava (Sooji) 1 kg', gold: { ingredientId: 'rava', qty: 1000, unit: 'g', allergens: ['gluten'] } },
  { id: 't36', title: 'Thick Poha 500 g', gold: { ingredientId: 'poha', qty: 500, unit: 'g' } },
  { id: 't37', title: 'Quaker Oats 1 kg', gold: { ingredientId: 'oats', qty: 1000, unit: 'g', allergens: ['gluten'] } },
  { id: 't38', title: 'Saffola Masala Oats Classic 500 g', gold: { ingredientId: null }, trap: 'flavoured instant oats' },
  { id: 't39', title: 'Ragi Flour 1 kg', gold: { ingredientId: 'ragi_flour', qty: 1000, unit: 'g' } },
  { id: 't40', title: 'Jowar Atta 1 kg', gold: { ingredientId: 'jowar_flour', qty: 1000, unit: 'g' }, trap: 'contains "atta" but is not wheat' },
  { id: 't41', title: 'Aashirvaad Multigrain Atta 5 kg', gold: { ingredientId: null }, trap: 'multigrain blend' },
  { id: 't42', title: 'Foxtail Millet (Korralu) 500 g', gold: { ingredientId: 'foxtail_millet', qty: 500, unit: 'g' } },
  { id: 't43', title: 'Nutrela Soya Chunks 200 g', gold: { ingredientId: 'soya_chunks', qty: 200, unit: 'g', allergens: ['soy'] } },
  { id: 't44', title: 'Firm Tofu 200 g', gold: { ingredientId: 'tofu', qty: 200, unit: 'g' } },
  { id: 't45', title: 'Sofit Soya Milk Plain 1 L', gold: { ingredientId: null, allergens: ['soy'] }, trap: 'soya milk is not dairy milk' },
  { id: 't46', title: 'Amul Butter 100 g', gold: { ingredientId: null, allergens: ['dairy'] } },
  { id: 't47', title: 'Mother Dairy Malai Paneer 200 g', gold: { ingredientId: 'paneer', qty: 200, unit: 'g', allergens: ['dairy'] } },
  { id: 't48', title: 'Fresh Grated Coconut 200 g', gold: { ingredientId: 'coconut', qty: 200, unit: 'g' } },
  { id: 't49', title: 'Parachute Coconut Oil 500 ml', gold: { ingredientId: null }, trap: 'contains "coconut" and "oil"' },
  { id: 't50', title: 'Tender Coconut Water 200 ml', gold: { ingredientId: null } },
  { id: 't51', title: 'Lemon 250 g', gold: { ingredientId: 'lemon', qty: 250, unit: 'g' } },
  { id: 't52', title: 'Papaya (approx. 1 kg)', gold: { ingredientId: 'papaya', qty: 1000, unit: 'g' } },
  { id: 't53', title: 'Carrot - Ooty 500 g', gold: { ingredientId: 'carrot', qty: 500, unit: 'g' } },
  { id: 't54', title: 'Beans French 250 g', gold: { ingredientId: 'beans', qty: 250, unit: 'g' } },
  { id: 't55', title: 'Capsicum Green 250 g', gold: { ingredientId: 'capsicum', qty: 250, unit: 'g' } },
  { id: 't56', title: 'Cucumber 500 g', gold: { ingredientId: 'cucumber', qty: 500, unit: 'g' } },
  { id: 't57', title: 'Bottle Gourd (Lauki) 1 pc', gold: { ingredientId: 'bottle_gourd' }, trap: 'pieces cannot be converted to grams' },
  { id: 't58', title: 'Safal Frozen Green Peas 500 g', gold: { ingredientId: 'peas', qty: 500, unit: 'g' } },
  { id: 't59', title: 'Phool Makhana 100 g', gold: { ingredientId: 'makhana', qty: 100, unit: 'g' } },
  { id: 't60', title: 'Tamarind Seedless 200 g', gold: { ingredientId: 'tamarind', qty: 200, unit: 'g' } },
  { id: 't61', title: 'Rohu Fish Curry Cut 500 g', gold: { ingredientId: 'fish_rohu', qty: 500, unit: 'g', fish: true, allergens: ['fish'] } },
  { id: 't62', title: 'Chicken Curry Cut with Skin 1 kg', gold: { ingredientId: 'chicken', qty: 1000, unit: 'g', meat: true }, trap: 'bone-in cut, related variety' },
  { id: 't63', title: 'Mutton Curry Cut 500 g', gold: { ingredientId: null, meat: true } },
  { id: 't64', title: 'Fresh Prawns Medium 250 g', gold: { ingredientId: null, allergens: ['shellfish'] } },
  { id: 't65', title: 'Whole Wheat Bread 400 g', gold: { ingredientId: 'bread_ww', qty: 400, unit: 'g', allergens: ['gluten'] } },
  { id: 't66', title: 'Britannia White Bread Sandwich 400 g', gold: { ingredientId: null, allergens: ['gluten'] } },
  { id: 't67', title: 'Eggless Chocolate Cake 500 g', gold: { ingredientId: null, egg: false }, trap: '"eggless" must not count as egg' },
  { id: 't68', title: 'Everest Egg Curry Masala 50 g', gold: { ingredientId: 'masala', qty: 50, unit: 'g', egg: false }, trap: 'spice mix named after egg' },
  { id: 't69', title: 'Toor Dal 2 x 500 g', gold: { ingredientId: 'toor_dal', qty: 1000, unit: 'g' }, trap: 'multipack' },
  { id: 't70', title: 'Almonds California 200 g', gold: { ingredientId: null, allergens: ['tree_nut'] } },
  { id: 't71', title: 'Saffola Gold Refined Oil 1 L', gold: { ingredientId: 'oil', acceptable: [], qty: 910, unit: 'g' }, trap: 'blended oil, related variety' },
  { id: 't72', title: 'Egg Tray White Eggs 30 pcs', gold: { ingredientId: 'egg', qty: 30, unit: 'piece', egg: true, allergens: ['egg'] } },
];
