// Privacy policy, terms of use and health disclaimer. Public pages (no sign-in needed).
// Written for India: Digital Personal Data Protection Act 2023 (DPDP), IT Act 2000 and the
// IT (Intermediary Guidelines) Rules 2021 (grievance officer). Text in [square brackets]
// must be filled in by the company before launch; see LEGAL_TODO in the README.
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { Logo } from '../../components/Logo.tsx';

const UPDATED = '14 November 2026';
const ENTITY = '[Legal entity name], a company registered in India at [registered address]';
const CONTACT = '[privacy@your-domain.in]';
const GRIEVANCE = '[Name of Grievance Officer], [grievance@your-domain.in], [phone], [office address]';

type Doc = { title: string; sections: [string, string[]][] };

const DOCS: Record<string, Doc> = {
  privacy: {
    title: 'Privacy policy',
    sections: [
      ['Who we are', [`NourishCart is run by ${ENTITY} ("we", "us"). For anything about your data, write to ${CONTACT}.`]],
      [
        'What we collect',
        [
          'Your account: your email address, used only to send sign-in codes.',
          'For each person you add: age or date of birth, sex, height, weight, daily activity, what they eat, allergies, foods to avoid, goal, nutrition targets, nutrients they want more of, which meals they eat, grocery budget, an optional photo and how they are related to you.',
          'What you do in the app: meal plans, meals you log, pantry items, shopping lists and practice orders.',
          'We do not ask for medical diagnoses, medicines, government ID, your exact location or payment details. If you say a doctor manages your diet, we store only that a personal plan is not available, not the condition.',
        ],
      ],
      [
        'Why we use it',
        [
          'To work out nutrition targets, plan meals, make shopping lists, compare store prices you ask us to compare, and show your progress.',
          'We do not sell your data, show ads, or use your data to profile you for anyone else.',
        ],
      ],
      [
        'Consent',
        [
          'We process your personal data with your consent, which you give before adding any details (DPDP Act 2023, section 6). You can withdraw it at any time in Settings; we then stop processing and you can delete your account.',
        ],
      ],
      [
        'Who else handles it',
        [
          'Our database and sign-in provider (servers in Mumbai, India), our website host, and our email provider for sign-in codes. They act only on our instructions.',
          'AI services, only for these jobs and only with the minimum needed: reading a setup answer we could not understand (only if you allow it), reading the text on a packet photo, reading store search pages, translating the cook menu, and speaking text aloud. Your name, email and profile are never sent with these.',
          'Setup answers go to a provider that does not keep them or train on them. Packet photos and store pages go to a provider whose free service may use inputs to improve its models, so do not photograph anything personal; these never include your details. Text to be spoken is sent only to turn it into audio.',
          'Store prices are read inside your own browser by our browser helper; we do not receive your store login.',
          'A list of providers is available on request.',
        ],
      ],
      ['How long we keep it', ['Until you delete it or delete your account. After deletion, data is removed from our live systems within 30 days and from backups within 90 days.']],
      [
        'Your rights',
        [
          'You can see, correct and download your data (Settings → Download my data), withdraw consent, delete your account, and nominate someone to act for you if you cannot.',
          'If you are unhappy with how we handle a request, you can complain to our Grievance Officer and, after that, to the Data Protection Board of India.',
        ],
      ],
      ['Children', ['NourishCart is for adults aged 18 and over. We do not knowingly collect data about children, and personal plans are refused for anyone under 18.']],
      ['Security', ['Data is encrypted in transit. Each account can only read its own rows in our database (row-level security). No system is perfectly secure; if a breach affects you, we will tell you and the Data Protection Board as the law requires.']],
      ['Cookies and storage', ['No advertising or tracking cookies. The app stores your sign-in session and a few settings in your browser so it works offline.']],
      ['Grievance Officer', [GRIEVANCE, 'We acknowledge complaints within 24 hours and resolve them within 15 days.']],
      ['Changes', [`We will tell you in the app before any change that affects how your data is used. Last updated ${UPDATED}.`]],
    ],
  },
  terms: {
    title: 'Terms of use',
    sections: [
      ['Agreement', [`These terms are between you and ${ENTITY}. By using NourishCart you agree to them.`]],
      ['Who can use it', ['You must be 18 or older. You may add other adults in your home only with their permission.']],
      ['Not medical advice', ['NourishCart gives general wellness meal planning for healthy adults. It is not a diagnosis, treatment or a substitute for a doctor or registered dietitian. See the health disclaimer.']],
      [
        'Shopping and stores',
        [
          'NourishCart is not a store. Prices, stock and delivery come from the stores (for example Zepto or Swiggy Instamart) and can change. You place and pay for orders in the store\'s own app or website, under that store\'s terms.',
          'Our browser helper only acts when you ask it to: it reads search results and, after you confirm, adds the items you chose to your cart. It never pays.',
        ],
      ],
      ['AI features', ['AI is used to read answers, packet labels and store pages and to translate and speak menus. Our checks reduce mistakes but cannot remove them. For allergies, always read the packet yourself.']],
      ['Your account', ['Keep access to your email secure; anyone who can read your sign-in codes can open your account. Tell us if you think someone else has.']],
      ['Fair use', ['Do not misuse the service, try to access other people\'s data, or use it for anything unlawful.']],
      ['Liability', ['We provide NourishCart "as is". To the extent the law allows, we are not liable for indirect losses, store pricing or delivery, or decisions you make based on the app. Nothing here limits rights you have under the Consumer Protection Act 2019.']],
      ['Law and disputes', ['Indian law applies. Courts in Hyderabad, Telangana have jurisdiction. Contact us first; most problems can be fixed quickly.']],
      ['Contact', [`${CONTACT}. Grievance Officer: ${GRIEVANCE}. Last updated ${UPDATED}.`]],
    ],
  },
  health: {
    title: 'Health disclaimer',
    sections: [
      ['For healthy adults', ['Plans are for healthy adults aged 18 and over. We do not make plans for pregnancy, breastfeeding, eating disorders, kidney disease, diabetes needing a clinical diet, recent bariatric surgery or any doctor-managed diet.']],
      ['Estimates, not prescriptions', ['Calorie and protein numbers are estimates from published equations and Indian reference values (ICMR-NIN 2020). Your real needs can differ. Nutrition values in this version are sample data.']],
      ['Limits we keep', ['We never plan below your resting energy, below 1,200 kcal (women) or 1,500 kcal (men), or more than 20% under your maintenance, whatever number is typed. We do not plan water fasts, juice-only, fruit-only or other very low-calorie diets.']],
      ['Allergies', ['We filter recipes and products for the allergies you tell us about, and the label scan reads ingredients, but recipes and packaging change. With a serious allergy, always check the packet.']],
      ['When to see a doctor', ['If you have a health condition, take regular medicine, are planning a big weight change, or feel unwell on a plan, talk to a doctor or registered dietitian.']],
    ],
  },
};

export function LegalPage() {
  const { doc = 'privacy' } = useParams();
  const nav = useNavigate();
  const d = DOCS[doc] ?? DOCS.privacy;
  return (
    <div className="min-h-dvh bg-surface">
      <header className="mx-auto flex max-w-2xl items-center justify-between px-5 py-5">
        <button onClick={() => (window.history.length > 1 ? nav(-1) : nav('/'))} className="inline-flex items-center gap-1.5 text-sm text-on-surface-variant hover:text-on-surface">
          <ArrowLeft className="h-4 w-4" aria-hidden /> Back
        </button>
        <Logo />
      </header>
      <main className="mx-auto max-w-2xl px-5 pb-16">
        <h1 className="text-3xl">{d.title}</h1>
        <p className="mt-1 text-sm text-on-surface-variant">Last updated {UPDATED}</p>
        <nav className="mt-4 flex flex-wrap gap-2 text-sm" aria-label="Legal pages">
          {Object.entries(DOCS).map(([k, v]) => (
            <Link key={k} to={`/legal/${k}`} aria-current={k === doc ? 'page' : undefined} className={k === doc ? 'chip border-primary bg-primary text-on-primary' : 'chip'}>
              {v.title}
            </Link>
          ))}
        </nav>
        {d.sections.map(([h, ps]) => (
          <section key={h} className="mt-7">
            <h2 className="text-xl">{h}</h2>
            {ps.map((p) => (
              <p key={p} className="mt-2 leading-relaxed text-on-surface-variant">{p}</p>
            ))}
          </section>
        ))}
      </main>
    </div>
  );
}
