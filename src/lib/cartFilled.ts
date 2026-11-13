// Remembers, in this browser only, that a real store cart was filled for a plan.
// The store owns the cart and the order, so there is nothing to save on our side.
const KEY = 'nourishcart.cartFilled';

export function markCartFilled(planId: string) {
  try {
    const ids = new Set<string>(JSON.parse(localStorage.getItem(KEY) ?? '[]'));
    ids.add(planId);
    localStorage.setItem(KEY, JSON.stringify([...ids].slice(-20)));
  } catch {
    /* storage blocked: Today just won't tick the step */
  }
}

export function cartFilled(planId: string): boolean {
  try {
    return (JSON.parse(localStorage.getItem(KEY) ?? '[]') as string[]).includes(planId);
  } catch {
    return false;
  }
}
