// Packaged-food labels for testing the label scan. All products and brand names are invented;
// the ingredient lists follow common Indian packaged foods (biscuits, namkeen, noodles,
// chocolate, sauces, sweets). Each case is rendered to an image by scripts/render-labels.ts in
// one of several photo-like styles, including hard ones (small print, tilt, blur, low contrast,
// cut-off list). Gold facts were written by hand from the ingredient text.
import type { Allergen } from '../../domain/types.ts';

export type LabelStyle = 'clean' | 'small' | 'tilted' | 'blurred' | 'lowcontrast' | 'cutoff' | 'bilingual';

export interface LabelCase {
  id: string;
  product: string;
  ingredients: string;
  contains?: string;
  mayContain?: string;
  mark: 'green' | 'brown' | 'none';
  style: LabelStyle;
  gold: {
    allergens: Allergen[]; // definitely in the product
    traces: Allergen[]; // only via "may contain"
    meatFish: boolean;
    egg: boolean;
    notVegan: boolean;
    maybeAnimal: boolean;
  };
  note?: string;
}

const none = { allergens: [] as Allergen[], traces: [] as Allergen[], meatFish: false, egg: false, notVegan: false, maybeAnimal: false };

export const LABELS: LabelCase[] = [
  { id: 'l01-glucose-biscuit', product: 'Sunrise Glucose Biscuits', style: 'clean', mark: 'green',
    ingredients: 'Refined Wheat Flour (Maida) (64%), Sugar, Edible Vegetable Oil (Palm), Invert Sugar Syrup, Milk Solids (1%), Leavening Agents [INS 503(ii), INS 500(ii)], Iodised Salt, Emulsifiers [INS 322(i) (Soy Lecithin), INS 471], Dough Conditioner (INS 223).',
    contains: 'Contains Wheat, Milk and Soy.', mayContain: 'May contain traces of Nuts.',
    gold: { ...none, allergens: ['gluten', 'dairy', 'soy'], traces: ['peanut', 'tree_nut'], notVegan: true, maybeAnimal: true } },
  { id: 'l02-masala-noodles', product: 'Quick Masala Noodles', style: 'small', mark: 'green',
    ingredients: 'Noodles: Refined Wheat Flour (Maida), Palm Oil, Iodised Salt, Wheat Gluten, Thickeners (INS 508, INS 412), Acidity Regulators (INS 501(i), INS 500(i)). Tastemaker: Mixed Spices (Onion Powder, Coriander, Chilli, Turmeric, Garlic, Cumin), Sugar, Hydrolysed Groundnut Protein, Flavour Enhancer (INS 635), Wheat Flour.',
    contains: 'Contains Wheat and Groundnut.',
    gold: { ...none, allergens: ['gluten', 'peanut'], maybeAnimal: true } },
  { id: 'l03-egg-noodles', product: 'Golden Egg Noodles', style: 'clean', mark: 'brown',
    ingredients: 'Wheat Flour (Atta) (80%), Egg Powder (5%), Salt, Edible Starch, Acidity Regulator (INS 500(ii)).',
    contains: 'Contains Wheat and Egg.',
    gold: { ...none, allergens: ['gluten', 'egg'], egg: true, notVegan: true } },
  { id: 'l04-milk-chocolate', product: 'Velvet Milk Chocolate', style: 'tilted', mark: 'green',
    ingredients: 'Sugar, Milk Solids (24%), Cocoa Butter, Cocoa Solids, Emulsifiers (INS 442, INS 476), Artificial Flavouring Substances (Vanilla).',
    mayContain: 'May contain almonds, cashews and wheat.',
    gold: { ...none, allergens: ['dairy'], traces: ['tree_nut', 'gluten'], notVegan: true } },
  { id: 'l05-dark-chocolate-vegan', product: 'Forest 70% Dark Chocolate', style: 'clean', mark: 'green',
    ingredients: 'Cocoa Solids (70%), Sugar, Cocoa Butter, Emulsifier (INS 322 (Sunflower Lecithin)), Natural Vanilla Flavour.',
    note: 'Cocoa butter is plant fat, not dairy. Sunflower lecithin is not soy.',
    gold: { ...none } },
  { id: 'l06-gummy-gelatin', product: 'Fruity Gummy Bears', style: 'blurred', mark: 'brown',
    ingredients: 'Sugar, Glucose Syrup, Gelatine, Acidity Regulator (INS 330), Fruit Juice Concentrate (Apple, Strawberry), Colours (INS 120, INS 133), Glazing Agent (INS 903).',
    gold: { ...none, meatFish: true, notVegan: true } },
  { id: 'l07-aloo-bhujia', product: 'Crunchy Aloo Bhujia', style: 'clean', mark: 'green',
    ingredients: 'Gram Pulse Flour (Besan) (40%), Potato (30%), Edible Vegetable Oil (Cottonseed, Palmolein), Moth Bean Flour, Spices and Condiments, Iodised Salt.',
    mayContain: 'Manufactured in a facility that also processes peanuts and sesame.',
    gold: { ...none, traces: ['peanut', 'sesame'] } },
  { id: 'l08-peanut-chikki', product: 'Lonavala Style Peanut Chikki', style: 'lowcontrast', mark: 'green',
    ingredients: 'Peanuts (60%), Jaggery (38%), Liquid Glucose, Ghee.',
    gold: { ...none, allergens: ['peanut', 'dairy'], notVegan: true } },
  { id: 'l09-mayo-eggless', product: 'Creamy Eggless Mayonnaise', style: 'clean', mark: 'green',
    ingredients: 'Edible Vegetable Oil (Soybean), Water, Sugar, Milk Solids, Vinegar, Iodised Salt, Thickener (INS 1422), Stabilizer (INS 415), Mustard, Acidity Regulator (INS 330).',
    note: '"Eggless" must not trigger egg; soybean oil is soy.',
    gold: { ...none, allergens: ['soy', 'dairy'], notVegan: true } },
  { id: 'l10-mayo-egg', product: 'Classic Mayonnaise', style: 'small', mark: 'brown',
    ingredients: 'Refined Soybean Oil, Water, Egg Yolk (6%), Sugar, Vinegar, Iodised Salt, Thickeners (INS 1422, INS 415), Mustard Powder.',
    contains: 'Contains Egg and Soy.',
    gold: { ...none, allergens: ['egg', 'soy'], egg: true, notVegan: true } },
  { id: 'l11-cutoff-cookies', product: 'Choco Chip Cookies', style: 'cutoff', mark: 'green',
    ingredients: 'Refined Wheat Flour (Maida), Sugar, Edible Vegetable Fat, Choco Chips (12%) [Sugar, Cocoa Solids, Cocoa Butter, Milk Solids, Emulsifier (Soy Lecithin)], Butter, Invert Syrup, Raising Agents, Hazelnut Paste, Salt.',
    note: 'The bottom of the list is cut off in the photo: the reader must say it could not read all of it.',
    gold: { ...none, allergens: ['gluten', 'dairy', 'soy', 'tree_nut'], notVegan: true } },
  { id: 'l12-soup-chicken', product: 'Instant Sweet Corn Chicken Soup', style: 'clean', mark: 'brown',
    ingredients: 'Corn Starch, Sweet Corn (15%), Sugar, Iodised Salt, Chicken Powder (5%), Flavour Enhancers (INS 627, INS 631), Wheat Flour, Soy Sauce Powder (Soybean, Wheat, Salt), Spices.',
    gold: { ...none, allergens: ['gluten', 'soy'], meatFish: true, notVegan: true, maybeAnimal: true } },
  { id: 'l13-soup-veg-ins', product: 'Instant Tomato Soup', style: 'tilted', mark: 'green',
    ingredients: 'Tomato Powder (30%), Sugar, Corn Starch, Iodised Salt, Milk Solids, Edible Vegetable Oil, Flavour Enhancers (INS 627, INS 631), Spices.',
    note: 'INS 627/631 can be animal-derived; label does not say: "check" for vegetarians.',
    gold: { ...none, allergens: ['dairy'], notVegan: true, maybeAnimal: true } },
  { id: 'l14-cake-egg', product: 'Vanilla Sponge Cake', style: 'clean', mark: 'brown',
    ingredients: 'Refined Wheat Flour, Sugar, Eggs (18%), Edible Vegetable Oil, Humectant (INS 422), Milk Solids, Raising Agents (INS 450, INS 500), Iodised Salt, Preservative (INS 202).',
    contains: 'Contains Wheat, Egg and Milk.',
    gold: { ...none, allergens: ['gluten', 'egg', 'dairy'], egg: true, notVegan: true } },
  { id: 'l15-rusk-bilingual', product: 'Toasty Suji Rusk', style: 'bilingual', mark: 'green',
    ingredients: 'Refined Wheat Flour (Maida), Semolina (Suji) (20%), Sugar, Edible Vegetable Oil (Palm), Yeast, Milk Solids, Cardamom, Iodised Salt.',
    mayContain: 'May contain sesame.',
    gold: { ...none, allergens: ['gluten', 'dairy'], traces: ['sesame'], notVegan: true } },
  { id: 'l16-honey-oats', product: 'Honey Oats Crunch', style: 'clean', mark: 'green',
    ingredients: 'Rolled Oats (55%), Sugar, Honey (8%), Rice Crisps, Edible Vegetable Oil (Sunflower), Almonds (3%), Iodised Salt.',
    mayContain: 'May contain wheat.',
    gold: { ...none, allergens: ['tree_nut'], traces: ['gluten'], notVegan: true } },
  { id: 'l17-fish-pickle', product: 'Coastal Prawn Pickle', style: 'small', mark: 'brown',
    ingredients: 'Prawns (50%), Gingelly Oil, Red Chilli Powder, Garlic, Ginger, Vinegar, Iodised Salt, Mustard, Fenugreek, Turmeric.',
    gold: { ...none, allergens: ['shellfish', 'sesame'], meatFish: true, notVegan: true } },
  { id: 'l18-paneer-tikka', product: 'Frozen Paneer Tikka', style: 'clean', mark: 'green',
    ingredients: 'Paneer (60%) [Milk, Citric Acid], Curd, Gram Flour, Edible Vegetable Oil, Onion, Capsicum, Spices, Iodised Salt, Kasuri Methi.',
    gold: { ...none, allergens: ['dairy'], notVegan: true } },
  { id: 'l19-coconut-cookies', product: 'Coconut Crunch Cookies', style: 'lowcontrast', mark: 'green',
    ingredients: 'Refined Wheat Flour, Sugar, Desiccated Coconut (12%), Edible Vegetable Oil (Palm), Coconut Milk Powder, Leavening Agents (INS 500(ii), INS 503(ii)), Salt.',
    note: 'Coconut milk is not dairy.',
    gold: { ...none, allergens: ['gluten'] } },
  { id: 'l20-jelly-dessert', product: 'Strawberry Jelly Crystals', style: 'clean', mark: 'brown',
    ingredients: 'Sugar, Gelling Agent (INS 441), Acidity Regulators (INS 296, INS 331), Strawberry Flavour, Colour (INS 129).',
    note: 'INS 441 is gelatine (non-vegetarian).',
    gold: { ...none, meatFish: true, notVegan: true } },
  { id: 'l21-soya-chunks', product: 'Protein Soya Chunks', style: 'tilted', mark: 'green',
    ingredients: 'Defatted Soya Flour (100%).',
    gold: { ...none, allergens: ['soy'] } },
  { id: 'l22-namkeen-cashew', product: 'Royal Kaju Mixture', style: 'blurred', mark: 'green',
    ingredients: 'Gram Flour, Cashew Nuts (10%), Peanuts, Edible Vegetable Oil, Rice Flakes, Curry Leaves, Sugar, Salt, Spices.',
    gold: { ...none, allergens: ['tree_nut', 'peanut'] } },
  { id: 'l23-ghee-cookies-small', product: 'Pure Ghee Nankhatai', style: 'small', mark: 'green',
    ingredients: 'Refined Wheat Flour, Sugar, Ghee (22%), Gram Flour, Semolina, Cardamom Powder, Raising Agent (INS 500(ii)).',
    mayContain: 'May contain traces of almonds.',
    gold: { ...none, allergens: ['gluten', 'dairy'], traces: ['tree_nut'], notVegan: true } },
  { id: 'l24-plain-poha', product: 'Thick Poha', style: 'clean', mark: 'green',
    ingredients: 'Flattened Rice (100%).',
    gold: { ...none } },
];
