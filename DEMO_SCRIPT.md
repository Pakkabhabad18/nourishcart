# Demo script (about 8 minutes)

The idea to say first: **the AI suggests, our code checks, and we measure both.**
Every AI feature below has a check that runs on every answer, and a score on the Evaluation page.

Before the demo: on the laptop, install the NourishCart Shopper extension (Groceries → Compare prices → Download), set a delivery location on zepto.com and swiggy.com/instamart, and log in to Instamart. Have one packet of biscuits or namkeen ready.

## 1. Onboarding by voice (1.5 min)
1. Sign in on https://nourishcart.vercel.app (the code appears on screen in demo mode).
2. Tick **Let AI read my description**, tap the mic and say something messy, e.g.:
   "I'm thirty two, guy, around five eleven, seventy eight kilos, drive a cab all day, don't work out, eat everything, allergic to prawns, want to lose weight, about six thousand a month, no health problems."
3. Point at **Read by AI, checked by NourishCart**, the **AI** tags and the quoted words beside each field. Say: if the AI claims something that isn't in what I said, it's rejected; it can never make the diet or allergies looser.

## 2. Plan and groceries (1 min)
Save → targets → **Show me three plans** → choose one → **Build this week's groceries**.

## 3. Price comparison (2 min)
1. **Compare prices on Zepto and Instamart** → **Compare N items now**. Tabs open in the background of this browser.
2. Show the totals (Zepto only, Instamart only, cheapest per item) and open a "left out" list. Sponsored green moong and chana dal were refused for toor dal.
3. Say: the AI reads the store pages; every product name and price must really be on that product's card, so a page can't plant a ₹1 price.
4. Optional: **Add N items to my Zepto cart** → confirm → watch it click Add → open Zepto's cart. Nothing is paid.

No extension (phone)? Use **Try it on saved store pages**.

## 4. Label scan (1 min)
**Scan** → photograph the packet. Show each person's verdict and the quoted label words.

## 5. Cook note (30 s)
Plans → **Menu for the cook** → Telugu → **Make the note** → **Read aloud** / **Send on WhatsApp**. Every quantity is checked against the English.

## 6. Evaluation (2 min) — the most important part
Open **Evaluation**:
- 384 made-up people, 28,000+ meals re-checked by an independent checker: 0 diet, allergy or exclusion violations.
- Onboarding AI: on descriptions it never saw, details captured rise from 55–70% (rules) to ~95%, with 0 unsafe errors. A held-out batch was written before the prompt fix, so the test stayed clean.
- Store pages: 43/43 products read, 0 wrong prices, not fooled by planted text; 0 of 54 fake answers survive the checks.
- Labels: 0 "fine when it wasn't" in 264 verdicts.
- Cook note: 12/12 translations kept every quantity.
- "What this does not prove": sample data, few real store pages, no delivery fees.
