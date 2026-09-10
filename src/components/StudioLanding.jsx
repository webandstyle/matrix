import { useEffect, useRef, useState } from 'react'
import './StudioLanding.css'

const copy = {
  en: {
    nav: ['Work', 'Services', 'Studio'],
    location: 'Based in Greece · Working worldwide',
    eyebrow: 'Independent creative development studio',
    heroA: 'We make websites',
    heroB: 'worth remembering.',
    intro: 'Strategy, design and development in one direct collaboration. For brands that want a digital presence with a point of view — and the engineering to back it up.',
    cta: 'Start a project',
    scroll: 'Selected work ↓',
    workTitle: 'Not concepts for the drawer. Things you can enter.',
    workLead: 'A small selection across beauty, art, hospitality and intelligent services.',
    vanityType: 'Beauty · Immersive service site',
    vanityTitle: 'Vanity Mirror',
    vanityText: 'A makeup artist’s service site rebuilt as an atmospheric, interactive mirror — part portfolio, part booking journey.',
    neraType: 'Healthcare · AI service design',
    neraTitle: 'Néra',
    neraText: 'A fictional dental clinic demo with a multilingual AI receptionist for treatment questions, indicative prices and appointment requests.',
    matrixType: 'Studio experiment · WebGL',
    matrixTitle: 'The rabbit hole',
    matrixText: 'A continuous, scroll-driven browser world built with real-time 3D, cinematic transitions and a slightly unreasonable amount of care.',
    open: 'Open project ↗',
    enter: 'Enter experiment ↗',
    servicesTitle: 'What we can take off your desk.',
    servicesIntro: 'Choose one clear deliverable or bring the whole problem. The work stays direct, considered and built to ship.',
    services: [
      ['01', 'Web design & direction', 'Positioning, visual concept, information architecture and responsive interface design.'],
      ['02', 'Websites & landing pages', 'Fast, conversion-aware marketing sites for services, launches and growing brands.'],
      ['03', 'Interactive & 3D web', 'Scroll stories, WebGL worlds, product moments and motion systems that have a reason to exist.'],
      ['04', 'E-commerce', 'Distinctive storefronts and product journeys that keep shopping clear while the brand stays alive.'],
      ['05', 'AI & smart workflows', 'Useful assistants, lead qualification, multilingual support and business automations — quietly integrated.'],
      ['06', 'Build, launch & care', 'Frontend or full-stack development, deployment, performance, analytics and ongoing improvement.'],
    ],
    approachTitle: 'Small by design.',
    approachText: 'You work directly with Alex — creative technologist, designer and developer. Fewer handovers means the idea survives the journey from the first sketch to the live site.',
    globalTitle: 'Made in Greece. Built for wherever your customers are.',
    globalText: 'Remote collaboration is the default. Projects can run in English or Hungarian, across time zones and borders.',
    close: 'No inflated team. No mystery process. No template dressed up as strategy.',
    contactTitle: 'Have something worth making?',
    contactText: 'Send the rough version. A few honest lines about the business, the audience and what is not working yet are enough.',
    email: 'alex@webandstyle.com',
    footer: 'Independent creative development studio · Greece / Worldwide',
    top: 'Back to top ↑',
    menu: 'Menu',
  },
  hu: {
    nav: ['Munkák', 'Szolgáltatások', 'Stúdió'],
    location: 'Görögországi bázis · Világszerte dolgozunk',
    eyebrow: 'Független creative development stúdió',
    heroA: 'Weboldalakat építünk,',
    heroB: 'amik megmaradnak.',
    intro: 'Stratégia, design és fejlesztés egy közvetlen együttműködésben. Márkáknak, amelyek saját hangú digitális jelenlétet akarnak — valódi technikai háttérrel.',
    cta: 'Indítsunk egy projektet',
    scroll: 'Kiválasztott munkák ↓',
    workTitle: 'Nem fióknak készült koncepciók. Beléphető munkák.',
    workLead: 'Néhány projekt a szépség, a művészet, a vendéglátás és az intelligens szolgáltatások világából.',
    vanityType: 'Beauty · Immerzív szolgáltatói oldal',
    vanityTitle: 'Vanity Mirror',
    vanityText: 'Egy sminkes szolgáltatói oldala atmoszferikus, interaktív tükörként — egyszerre portfólió és foglalási útvonal.',
    neraType: 'Egészségügy · AI service design',
    neraTitle: 'Néra',
    neraText: 'Fiktív fogászati demó többnyelvű AI recepcióssal: kezelési kérdések, tájékoztató árak és időpontkérés egy helyen.',
    matrixType: 'Stúdiókísérlet · WebGL',
    matrixTitle: 'A nyúl ürege',
    matrixText: 'Egyetlen folyamatos, görgetés-vezérelt böngészős világ valós idejű 3D-vel, filmes átmenetekkel és indokolatlanul sok odafigyeléssel.',
    open: 'Projekt megnyitása ↗',
    enter: 'Belépés az élménybe ↗',
    servicesTitle: 'Amit levehetünk a válladról.',
    servicesIntro: 'Jöhetsz egy pontos feladattal vagy az egész problémával. A munka közvetlen, átgondolt és mindig az élesítésig tart.',
    services: [
      ['01', 'Webdesign & kreatív irány', 'Pozicionálás, vizuális koncepció, információs architektúra és reszponzív felülettervezés.'],
      ['02', 'Weboldalak & landingek', 'Gyors, konverziót támogató oldalak szolgáltatásokhoz, indulásokhoz és növekvő márkákhoz.'],
      ['03', 'Interaktív & 3D web', 'Scroll-történetek, WebGL-világok, termékpillanatok és olyan mozgás, aminek oka van.'],
      ['04', 'E-kereskedelem', 'Karakteres webshopok és termékutak, ahol a vásárlás tiszta marad, a márka pedig él.'],
      ['05', 'AI & okos folyamatok', 'Hasznos asszisztensek, lead-minősítés, többnyelvű támogatás és háttérautomatizmusok.'],
      ['06', 'Fejlesztés, élesítés & gondozás', 'Frontend vagy full-stack fejlesztés, deployment, teljesítmény, analitika és folyamatos javítás.'],
    ],
    approachTitle: 'Szándékosan kicsi.',
    approachText: 'Közvetlenül Alexszel dolgozol — kreatív technológussal, designerrel és fejlesztővel. Kevesebb átadás, így az ötlet nem kopik el az első vázlattól az éles oldalig.',
    globalTitle: 'Görögországban készül. Oda dolgozik, ahol az ügyfeleid vannak.',
    globalText: 'A távoli együttműködés nálunk alap. Angolul vagy magyarul, időzónákon és országhatárokon át is dolgozunk.',
    close: 'Nincs felfújt csapat. Nincs ködös folyamat. Nincs stratégiának öltöztetett sablon.',
    contactTitle: 'Van valami, amit érdemes megépíteni?',
    contactText: 'Küldd el a nyers verziót. Pár őszinte mondat a vállalkozásról, a közönségről és arról, ami most nem működik, elég a kezdéshez.',
    email: 'alex@webandstyle.com',
    footer: 'Független creative development stúdió · Görögország / Világszerte',
    top: 'Vissza az elejére ↑',
    menu: 'Menü',
  },
  el: {
    nav: ['Έργα', 'Υπηρεσίες', 'Στούντιο'],
    location: 'Βάση στην Ελλάδα · Συνεργασίες παγκοσμίως',
    eyebrow: 'Ανεξάρτητο studio δημιουργικού σχεδιασμού και ανάπτυξης',
    heroA: 'Δημιουργούμε ιστοσελίδες',
    heroB: 'που μένουν αξέχαστες.',
    intro: 'Στρατηγική, σχεδιασμός και ανάπτυξη μέσα από μία άμεση συνεργασία. Για brands που θέλουν ψηφιακή παρουσία με ξεκάθαρη άποψη — και την τεχνολογία που τη στηρίζει.',
    cta: 'Ας ξεκινήσουμε',
    scroll: 'Επιλεγμένα έργα ↓',
    workTitle: 'Όχι ιδέες που μένουν στο συρτάρι. Εμπειρίες στις οποίες μπαίνεις.',
    workLead: 'Μια μικρή επιλογή από τον χώρο της ομορφιάς, της τέχνης, της φιλοξενίας και των έξυπνων υπηρεσιών.',
    vanityType: 'Ομορφιά · Διαδραστική ιστοσελίδα υπηρεσιών',
    vanityTitle: 'Vanity Mirror',
    vanityText: 'Η ιστοσελίδα μιας makeup artist μεταμορφώθηκε σε έναν ατμοσφαιρικό, διαδραστικό καθρέφτη — ταυτόχρονα portfolio και διαδρομή προς την κράτηση.',
    neraType: 'Υγεία · Σχεδιασμός υπηρεσίας με AI',
    neraTitle: 'Néra',
    neraText: 'Ένα demo φανταστικής οδοντιατρικής κλινικής με πολύγλωσση AI receptionist για ερωτήσεις θεραπειών, ενδεικτικές τιμές και αιτήματα ραντεβού.',
    matrixType: 'Πείραμα του studio · WebGL',
    matrixTitle: 'Η φωλιά του κουνελιού',
    matrixText: 'Ένας ενιαίος, scroll-driven κόσμος στον browser, φτιαγμένος με real-time 3D, κινηματογραφικές μεταβάσεις και λίγο περισσότερη φροντίδα απ’ όση θεωρείται λογική.',
    open: 'Άνοιγμα έργου ↗',
    enter: 'Είσοδος στην εμπειρία ↗',
    servicesTitle: 'Όσα μπορούμε να αναλάβουμε για σένα.',
    servicesIntro: 'Έλα με ένα συγκεκριμένο ζητούμενο ή με ολόκληρο το πρόβλημα. Η δουλειά παραμένει άμεση, μελετημένη και φτάνει πάντα μέχρι το launch.',
    services: [
      ['01', 'Web design & δημιουργική κατεύθυνση', 'Τοποθέτηση, οπτική ιδέα, αρχιτεκτονική πληροφορίας και responsive σχεδιασμός διεπαφής.'],
      ['02', 'Ιστοσελίδες & landing pages', 'Γρήγορες, conversion-aware ιστοσελίδες για υπηρεσίες, launches και brands που αναπτύσσονται.'],
      ['03', 'Διαδραστικό & 3D web', 'Scroll stories, κόσμοι WebGL, product moments και κίνηση που υπάρχει για κάποιον λόγο.'],
      ['04', 'E-commerce', 'Χαρακτηριστικά storefronts και product journeys, όπου η αγορά παραμένει ξεκάθαρη χωρίς να χάνεται η ταυτότητα του brand.'],
      ['05', 'AI & έξυπνες ροές', 'Χρήσιμοι assistants, lead qualification, πολύγλωσση υποστήριξη και αυτοματισμοί που ενσωματώνονται διακριτικά.'],
      ['06', 'Ανάπτυξη, launch & υποστήριξη', 'Frontend ή full-stack ανάπτυξη, deployment, απόδοση, analytics και συνεχής βελτίωση.'],
    ],
    approachTitle: 'Μικρό studio, από επιλογή.',
    approachText: 'Συνεργάζεσαι απευθείας με τον Alex — creative technologist, designer και developer. Λιγότερες παραδόσεις από χέρι σε χέρι σημαίνουν ότι η ιδέα παραμένει αναλλοίωτη από το πρώτο σκίτσο μέχρι το live site.',
    globalTitle: 'Σχεδιασμένο στην Ελλάδα. Για πελάτες όπου κι αν βρίσκονται.',
    globalText: 'Η απομακρυσμένη συνεργασία είναι ο κανόνας. Αναλαμβάνουμε projects στα αγγλικά, ελληνικά ή ουγγρικά, πέρα από ζώνες ώρας και σύνορα.',
    close: 'Χωρίς φουσκωμένες ομάδες. Χωρίς ασαφείς διαδικασίες. Χωρίς templates μεταμφιεσμένα σε στρατηγική.',
    contactTitle: 'Έχεις κάτι που αξίζει να δημιουργηθεί;',
    contactText: 'Στείλε την ακατέργαστη εκδοχή. Μερικές ειλικρινείς γραμμές για την επιχείρηση, το κοινό και αυτό που δεν λειτουργεί σήμερα αρκούν για να ξεκινήσουμε.',
    email: 'alex@webandstyle.com',
    footer: 'Ανεξάρτητο creative development studio · Ελλάδα / Παγκοσμίως',
    top: 'Επιστροφή στην κορυφή ↑',
    menu: 'Μενού',
  },
}

function Arrow() {
  return <span aria-hidden="true">↗</span>
}

function NeraPreview() {
  return (
    <div className="nera-preview" aria-hidden="true">
      <div className="nera-preview__top">
        <span className="nera-preview__avatar">N</span>
        <span><b>Néra</b><small>virtual receptionist</small></span>
        <em>AI demo</em>
      </div>
      <p className="nera-preview__question">How much is a cleaning?</p>
      <div className="nera-preview__answer">
        <span>NÉRA · AI</span>
        Professional cleaning: €60–90 in this fictional example, with a 45-minute appointment.
      </div>
      <div className="nera-preview__input">Ask about a price or appointment… <i>↑</i></div>
    </div>
  )
}

export default function StudioLanding() {
  const [lang, setLang] = useState('en')
  const [menuOpen, setMenuOpen] = useState(false)
  const cursor = useRef(null)
  const c = copy[lang]

  useEffect(() => {
    document.documentElement.lang = lang
    const onMove = (event) => {
      if (cursor.current) {
        cursor.current.style.opacity = '1'
        cursor.current.style.transform = `translate3d(${event.clientX}px, ${event.clientY}px, 0)`
      }
    }
    window.addEventListener('pointermove', onMove, { passive: true })
    return () => window.removeEventListener('pointermove', onMove)
  }, [lang])

  const go = (id) => {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' })
    setMenuOpen(false)
  }

  return (
    <main className="studio-page">
      <div className="studio-cursor" ref={cursor} aria-hidden="true" />
      <header className="studio-nav">
        <a className="studio-mark" href="#top" aria-label="Web and Style home">W<span>&</span>S</a>
        <p className="studio-nav__descriptor">Web & Style<br /><span>{c.location}</span></p>
        <nav className={menuOpen ? 'is-open' : ''} aria-label="Primary navigation">
          <button onClick={() => go('work')}>{c.nav[0]}</button>
          <button onClick={() => go('services')}>{c.nav[1]}</button>
          <button onClick={() => go('studio')}>{c.nav[2]}</button>
        </nav>
        <button className="lang-switch" onClick={() => setLang(lang === 'en' ? 'el' : lang === 'el' ? 'hu' : 'en')} aria-label="Change language">
          <span className={lang === 'en' ? 'active' : ''}>EN</span><i>/</i><span className={lang === 'el' ? 'active' : ''}>EL</span><i>/</i><span className={lang === 'hu' ? 'active' : ''}>HU</span>
        </button>
        <button className="menu-toggle" onClick={() => setMenuOpen(!menuOpen)} aria-expanded={menuOpen}>{c.menu}</button>
      </header>

      <section className="studio-hero" id="top">
        <p className="studio-eyebrow">{c.eyebrow}</p>
        <h1><span>{c.heroA}</span><em>{c.heroB}</em></h1>
        <div className="studio-hero__bottom">
          <p>{c.intro}</p>
          <a className="studio-cta" href={`mailto:${c.email}?subject=New%20project%20%E2%80%94%20Web%20%26%20Style`}>{c.cta}<Arrow /></a>
          <button className="studio-scroll" onClick={() => go('work')}>{c.scroll}</button>
        </div>
        <div className="studio-orbit" aria-hidden="true"><span>DESIGN</span><span>BUILD</span><span>MOTION</span></div>
      </section>

      <section className="studio-work" id="work">
        <div className="studio-section-head">
          <span>01 / WORK</span>
          <h2>{c.workTitle}</h2>
          <p>{c.workLead}</p>
        </div>
        <article className="work-item work-item--vanity">
          <a className="work-visual" href="https://pallacintiamakeup.hu" target="_blank" rel="noreferrer">
            <img src="/assets/work/vanity-desktop.jpg" alt="Vanity Mirror website for Palla Cintia Makeup" loading="lazy" />
            <span className="work-index">01</span>
          </a>
          <div className="work-copy">
            <p>{c.vanityType}</p><h3>{c.vanityTitle}</h3><span>{c.vanityText}</span>
            <a href="https://pallacintiamakeup.hu" target="_blank" rel="noreferrer">{c.open}</a>
          </div>
        </article>
        <article className="work-item work-item--nera">
          <a className="work-visual" href="https://demo.webandstyle.com/?lang=en" target="_blank" rel="noreferrer">
            <NeraPreview /><span className="work-index">02</span>
          </a>
          <div className="work-copy">
            <p>{c.neraType}</p><h3>{c.neraTitle}</h3><span>{c.neraText}</span>
            <a href="https://demo.webandstyle.com/?lang=en" target="_blank" rel="noreferrer">{c.open}</a>
          </div>
        </article>
        <article className="work-item work-item--matrix">
          <a className="work-visual" href="/?experience=1">
            <img src="/assets/hero-sprite/hero-poster.jpg" alt="Web and Style immersive 3D experiment" loading="lazy" />
            <div className="matrix-stamp">W&S<br /><small>experiment 03</small></div><span className="work-index">03</span>
          </a>
          <div className="work-copy">
            <p>{c.matrixType}</p><h3>{c.matrixTitle}</h3><span>{c.matrixText}</span>
            <a href="/?experience=1">{c.enter}</a>
          </div>
        </article>
      </section>

      <section className="studio-services" id="services">
        <div className="studio-section-head studio-section-head--light">
          <span>02 / SERVICES</span>
          <h2>{c.servicesTitle}</h2>
          <p>{c.servicesIntro}</p>
        </div>
        <div className="service-list">
          {c.services.map(([n, title, serviceText]) => (
            <article key={n}><span>{n}</span><h3>{title}</h3><p>{serviceText}</p></article>
          ))}
        </div>
      </section>

      <section className="studio-about" id="studio">
        <div className="about-intro"><span>03 / STUDIO</span><h2>{c.approachTitle}</h2><p>{c.approachText}</p></div>
        <div className="about-global"><div className="about-sun" aria-hidden="true" /><h3>{c.globalTitle}</h3><p>{c.globalText}</p></div>
        <p className="about-close">{c.close}</p>
      </section>

      <section className="studio-contact" id="contact">
        <p>04 / CONTACT</p>
        <h2>{c.contactTitle}</h2>
        <span>{c.contactText}</span>
        <a href={`mailto:${c.email}?subject=New%20project%20%E2%80%94%20Web%20%26%20Style`}>{c.email}<Arrow /></a>
      </section>

      <footer className="studio-footer"><span>© {new Date().getFullYear()} Web & Style</span><span>{c.footer}</span><button onClick={() => go('top')}>{c.top}</button></footer>
    </main>
  )
}
