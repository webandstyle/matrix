export const BRAND = {
  name: 'Web & Style',
  position: { hu: 'Creative Web Experience Studio', en: 'Creative Web Experience Studio' },
}

export const NAV = [
  { id: 'experiences', label: { hu: 'Élmények', en: 'Experiences' } },
  { id: 'worlds', label: { hu: 'Világok', en: 'Worlds' } },
  { id: 'method', label: { hu: 'Folyamat', en: 'Method' } },
  { id: 'engine', label: { hu: 'Gépház', en: 'Engine' } },
  { id: 'contact', label: { hu: 'Kapcsolat', en: 'Contact' } },
]

export const HERO = {
  phase1: { hu: 'A web tele van oldalakkal.', en: 'The web is full of websites.' },
  phase2: { hu: 'A legtöbb nem rossz. Csak nem marad meg.', en: 'Most are not broken. They are forgettable.' },
  headline: { hu: 'Weboldalból web-élmény.', en: 'From website to web experience.' },
  subheadline: {
    hu: 'A zajból nem elég kilógni. Olyan webes élményt kell építeni, ami magához húz.',
    en: 'Standing out is not enough. Build a web experience people are pulled into.',
  },
  ctaPrimary: { hu: 'Fedezd fel az élményeket', en: 'Explore the experiences' },
  ctaSecondary: { hu: 'Kezdjünk egy projektet', en: "Start a project" },
}

// the two proof points that surface with the splash waves during the & fall
export const WAVE_FACTS = {
  fact1: {
    kicker: { hu: '// tény_01 — nem ígérjük, csináljuk', en: '// fact_01 — shipped, not promised' },
    text: {
      hu: 'Valós idejű 3D és scrollra épülő történetmesélés — a böngészőben.',
      en: 'Real-time 3D and scroll-driven storytelling — in the browser.',
    },
  },
  fact2: {
    kicker: { hu: '// tény_02 — nem ígérjük, csináljuk', en: '// fact_02 — shipped, not promised' },
    text: {
      hu: 'Weboldalak, amiket elfelejtenek. Élmények, amikre emlékeznek.',
      en: 'Websites people forget. Experiences they remember.',
    },
  },
}

export const CHOOSE = {
  pathTitle: { hu: 'Válaszd az utad', en: 'Choose your Path' },
  kicker: { hu: 'Megérkeztél.', en: 'You have arrived.' },
  lead: {
    hu: 'Két út nyílik innen. Mindkettő megmutatja, mit értünk web-élmény alatt.',
    en: 'Two paths open from here. Both show what we mean by a web experience.',
  },
  pillLine: {
    hu: 'Válassz: melyik pirulát veszed be?',
    en: 'Choose your pill.',
  },
  optionExperience: {
    pill: { hu: 'Piros pirula', en: 'Red pill' },
    title: { hu: 'Immerzív webélmény', en: 'Immersive web experience' },
    text: {
      hu: 'Nézd meg, milyen mély a nyúl ürege — ajtók és szobák világa, amit bejársz, nem görgetsz.',
      en: 'See how deep the rabbit hole goes — a world of doors and rooms you explore, not scroll.',
    },
    cta: { hu: 'Belépés', en: 'Enter' },
  },
  optionAgency: {
    pill: { hu: 'Kék pirula', en: 'Blue pill' },
    title: { hu: 'Agency oldal', en: 'Agency site' },
    text: {
      hu: 'A történet itt véget ér — ismerd meg a stúdiót: folyamat, esettanulmányok, kapcsolat.',
      en: 'The story ends here — meet the studio: method, case studies, contact.',
    },
    cta: { hu: 'Felfedezés', en: 'Explore' },
  },
}

export const WHAT_SECTION = {
  heading: { hu: 'Mit lehet web-élménnyé alakítani?', en: 'What can become a web experience?' },
  cards: [
    {
      key: 'service',
      title: { hu: 'Szolgáltatás', en: 'Service' },
      text: {
        hu: 'Egy szolgáltatás nem csak árlista és galéria. Lehet bizalomépítő élmény.',
        en: 'A service is not just a price list and a gallery. It can become a trust-building experience.',
      },
    },
    {
      key: 'product',
      title: { hu: 'Termék', en: 'Product' },
      text: {
        hu: 'Egy termék nem csak kosár gomb. Lehet eredet, textúra, vágy és történet.',
        en: 'A product is not just an add-to-cart button. It can become origin, texture, desire and story.',
      },
    },
    {
      key: 'stay',
      title: { hu: 'Szállás', en: 'Stay' },
      text: {
        hu: 'Egy szállás nem csak fotógaléria. Lehet előérzet, atmoszféra és foglalás előtti élmény.',
        en: 'A stay is not just a photo gallery. It can become atmosphere, anticipation and a feeling before booking.',
      },
    },
    {
      key: 'campaign',
      title: { hu: 'Kampány', en: 'Campaign' },
      text: {
        hu: 'Egy kampány nem csak landing page. Lehet limitált online esemény.',
        en: 'A campaign is not just a landing page. It can become a limited online event.',
      },
    },
  ],
}

// THE BLUE PILL — the #agency page (2026-07-26). The grounded, "the system
// resolves into order" counterpart to the red pill's immersive rabbit hole:
// a calm, premium studio page — services, method, work, about, contact.
export const AGENCY = {
  kicker: { hu: '// kék_pirula — a stúdió', en: '// blue_pill — the studio' },
  title: {
    hu: 'A rendszer mögött\negy stúdió áll.',
    en: 'Behind the system,\na studio.',
  },
  intro: {
    hu: 'Bevetted a kék pirulát — itt a földet érés. A Web & Style Alex creative development stúdiója: immerzív, koncepcióvezérelt digitális világokat építek, amelyek nem csak jól néznek ki, hanem éreztetnek, mesélnek és megmaradnak.',
    en: 'You took the blue pill — this is the landing. Web & Style is Alex’s creative development studio: I build immersive, concept-driven digital worlds that don’t just look good — they make you feel, they tell a story, and they stay with you.',
  },

  servicesTitle: { hu: 'Amit építek', en: 'What I build' },
  services: [
    { n: '01', title: { hu: 'Immerzív & interaktív oldalak', en: 'Immersive & interactive sites' },
      text: { hu: 'Görgetés-vezérelt, narratív webélmények, ahová a látogató belép — nem csak végigolvassa.', en: 'Scroll-driven, narrative web experiences the visitor steps into — not just reads through.' } },
    { n: '02', title: { hu: 'Kreatív webdesign', en: 'Creative web design' },
      text: { hu: 'Karakteres vizuális rendszerek, amelyek első pillantásra sajátok — nem sablon, nem generikus.', en: 'Characterful visual systems that read as your own at a glance — never a template, never generic.' } },
    { n: '03', title: { hu: '3D & WebGL élmények', en: '3D & WebGL experiences' },
      text: { hu: 'Valós idejű 3D, shaderek és filmes kameramozgás a böngészőben, mobilra is tudatosan tervezve.', en: 'Real-time 3D, shaders and cinematic camera work in the browser — designed for mobile on purpose too.' } },
    { n: '04', title: { hu: 'AI-alapú megoldások', en: 'AI-driven solutions' },
      text: { hu: 'Generált vizuálok, videók és intelligens funkciók, az élménybe simulva — nem ráaggatva.', en: 'Generated visuals, video and intelligent features woven into the experience — not bolted on.' } },
    { n: '05', title: { hu: 'Landing page-ek & szolgáltatói oldalak', en: 'Landing pages & service sites' },
      text: { hu: 'Konverzióra hangolt, gyors, tiszta oldalak — a látvány sosem megy a használhatóság rovására.', en: 'Fast, clean, conversion-tuned pages — spectacle never at the cost of usability.' } },
    { n: '06', title: { hu: 'Márkaépítés & vizuális koncepció', en: 'Branding & visual concept' },
      text: { hu: 'A világ, a narratíva és az interakciós nyelv előbb — a felület csak utána.', en: 'The world, the narrative and the interaction language first — the interface only after.' } },
    { n: '07', title: { hu: 'Automatizációk & intelligens rendszerek', en: 'Automations & intelligent systems' },
      text: { hu: 'Háttérfolyamatok, amelyek dolgoznak helyetted — a marketingtől az ügyfélkezelésig.', en: 'Background systems that work for you — from marketing to client handling.' } },
    { n: '08', title: { hu: 'Frontend & full-stack fejlesztés', en: 'Frontend & full-stack development' },
      text: { hu: 'A koncepciótól az élesig egy kézben: teljesítmény, hozzáférhetőség, karbantarthatóság.', en: 'From concept to production in one pair of hands: performance, accessibility, maintainability.' } },
  ],

  processTitle: { hu: 'Hogyan dolgozom', en: 'How I work' },
  processLead: {
    hu: 'Nem sablon köré tervezek. Előbb a világ, a történet és az interakciós nyelv — a felület csak ezután.',
    en: 'I don’t design around a template. The world, the story and the interaction language come first — the interface only after.',
  },
  process: [
    { n: '01', title: { hu: 'Felfedezés', en: 'Discovery' },
      text: { hu: 'Megértem a márkát, a célt és a közönséget. Mit érezzen a látogató az első öt másodpercben?', en: 'I map the brand, the goal and the audience. What should the visitor feel in the first five seconds?' } },
    { n: '02', title: { hu: 'Koncepció', en: 'Concept' },
      text: { hu: 'Világ, narratíva és fő interakció — egy határozott kreatív irány, nem véletlenszerű ötletek.', en: 'World, narrative and core interaction — one decisive creative direction, not scattered ideas.' } },
    { n: '03', title: { hu: 'Élmény-architektúra', en: 'Experience architecture' },
      text: { hu: 'A teljes látogatói útvonal: jelenetek, átmenetek, desktop és mobil stratégia, fallback.', en: 'The full visitor journey: scenes, transitions, desktop and mobile strategy, fallbacks.' } },
    { n: '04', title: { hu: 'Vizuális rendszer', en: 'Visual system' },
      text: { hu: 'Szín, tipográfia, anyagok, fény, mozgásnyelv — egy összefüggő, prémium egész.', en: 'Colour, typography, materials, light, motion language — one coherent, premium whole.' } },
    { n: '05', title: { hu: 'Megvalósítás', en: 'Build' },
      text: { hu: 'Kis, ellenőrizhető mérföldkövek, folyamatos vizuális kontroll, majd élesítés és mérés.', en: 'Small, verifiable milestones, continuous visual review, then launch and measurement.' } },
  ],

  workTitle: { hu: 'Kiválasztott munkák', en: 'Selected work' },
  workLead: {
    hu: 'Minden projekt egy külön szál a stúdió DNS-ében — más márka, más világ, ugyanaz a kézjegy.',
    en: 'Each project is its own strand in the studio’s DNA — a different brand, a different world, the same signature.',
  },
  work: [
    { key: 'vanity', title: { hu: 'Vanity Mirror', en: 'Vanity Mirror' },
      role: { hu: 'Koncepció · 3D · Fejlesztés', en: 'Concept · 3D · Development' },
      text: { hu: 'Egy szépségmárka tükre interaktív portállá alakítva — katalógus helyett beléphető, atmoszferikus tér.', en: 'A beauty brand’s mirror reimagined as an interactive portal — an atmospheric space you step into, not a catalogue.' },
      desktop: '/assets/work/vanity-desktop.jpg',
      desktopVideo: '/assets/work/vanity-desktop.mp4',
      mobile: '/assets/work/vanity-mobile.jpg',
      href: 'https://pallacintiamakeup.hu' },
    { key: 'cliff', title: { hu: 'House on the Cliff', en: 'House on the Cliff' },
      role: { hu: 'Koncepció · 3D · WebGL', en: 'Concept · 3D · WebGL' },
      text: { hu: 'Egy tengerparti villa filmes 3D-térként — a látogató bejárja a helyet, mielőtt valaha odautazna.', en: 'A clifftop villa as a cinematic 3D space — the visitor walks the place long before they ever travel there.' } },
    { key: 'olive', title: { hu: 'The Story of the Olive', en: 'The Story of the Olive' },
      role: { hu: 'Márka · Vizuális koncepció · Fejlesztés', en: 'Brand · Visual concept · Development' },
      text: { hu: 'Egy prémium olívaolaj eredettörténete görgetés-vezérelt utazásként — a fától az üvegig.', en: 'A premium olive oil’s origin story as a scroll-driven journey — from the tree to the bottle.' } },
    { key: 'wsx', title: { hu: 'Web & Style — immerzív élmény', en: 'Web & Style — immersive experience' },
      role: { hu: 'Koncepció · 3D · Shaderek · Fejlesztés', en: 'Concept · 3D · Shaders · Development' },
      text: { hu: 'Ez az oldal — egyetlen összefüggő Matrix-ihletésű világ: kódeső, portál, kromatikus utazás, kert, pirula-választás.', en: 'This site — one continuous Matrix-inspired world: code rain, portal, chromatic journey, garden, and the pill choice.' } },
  ],
  workNote: {
    hu: 'A teljes esettanulmányok készülnek — írj, és megmutatom élőben, mi hogyan épült.',
    en: 'Full case studies are in the works — write to me and I’ll walk you through how each was built.',
  },

  aboutTitle: { hu: 'Ki áll mögötte', en: 'Who’s behind it' },
  about: {
    hu: 'Alex vagyok — kreatív technológus, webdesigner és full-stack fejlesztő egy személyben. A Web & Style nem ügynökség-gyár: közvetlen munka, egy összeszokott creative development stúdió szakértelmével, ügynökség-túlár nélkül. A Matrix az inspiráció — a látható felület mögötti rendszer, az „ébredés" élménye —, de a cél mindig a te márkád saját, emlékezetes világa.',
    en: 'I’m Alex — a creative technologist, web designer and full-stack developer in one. Web & Style isn’t an agency factory: direct work, with the craft of a seasoned creative-development studio, without the agency markup. The Matrix is the inspiration — the system beneath the visible surface, the feeling of “waking up” — but the goal is always your brand’s own, memorable world.',
  },

  contactTitle: { hu: 'Kezdjünk bele', en: 'Let’s begin' },
  contactText: {
    hu: 'Van egy ötleted, ami több egy sablonoldalnál? Írj — pár mondat is elég a kezdéshez.',
    en: 'Got an idea that’s more than a template? Write to me — a few sentences is enough to start.',
  },
  formName: { hu: 'Neved', en: 'Your name' },
  formEmail: { hu: 'Email címed', en: 'Your email' },
  formMessage: { hu: 'Mesélj az ötletedről', en: 'Tell me about your idea' },
  formSend: { hu: 'Üzenet küldése', en: 'Send message' },
  formSending: { hu: 'Küldés…', en: 'Sending…' },
  formSent: { hu: 'Köszönöm — hamarosan válaszolok.', en: 'Thank you — I’ll reply soon.' },
  formError: { hu: 'Valami hiba történt. Írj közvetlenül:', en: 'Something went wrong. Reach me directly:' },
  emailLabel: { hu: 'vagy közvetlenül', en: 'or directly' },
  email: 'alex@webandstyle.com',
  back: { hu: '↑ Vissza az élménybe', en: '↑ Back to the experience' },
}
