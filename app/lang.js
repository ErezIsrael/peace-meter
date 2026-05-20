/* ── Peace Meter — i18n (EN / HE) ──────────────────────── */

const LANG = {
  en: {
    title: '☮️ Peace Meter',
    subtitle: 'Middle East Peace Temperature',
    live: 'Live',
    nextUpdate: 'Next update',
    gaugeTitle: 'Middle East Peace Score',
    trendTitle: '📈 Trend (12 Hours)',
    pubTitle: '📚 Recent Think Tank Publications',
    footer1: 'Peace Meter is an experimental project for informational purposes only.',
    footer2: 'Scores are algorithmic aggregations of publicly available data, not predictions.',
    close: 'Close',

    levels: {
      frozen: '❄️ Frozen',
      thawing: '🌤 Thawing',
      growing: '🌱 Growing',
      flourishing: '🕊 Flourishing'
    },
    status: { live: 'Live', delayed: 'Delayed' },

    signals: {
      tone:        { icon:'🤝', name:'Political Tone',        weight:'20%', summary:'Statements by senior regional officials', detail:'Classifies statements as constructive (negotiate, peace plan, dialogue) or hostile (threaten, escalate). Score = ratio² × 150, clamped 5–95.', sources:['BBC World Service RSS','Al Jazeera English RSS','X/Twitter feeds of key leaders'], update:'Every 30 min' },
      news:        { icon:'📰', name:'Diplomatic News',       weight:'15%', summary:'Headline sentiment analysis',          detail:'Scans Middle East headlines for peace vs. war keywords. Score = peace_articles / total_ME_articles, quadratic curve.', sources:['BBC World Service RSS','Al Jazeera English RSS'], update:'Every 30 min' },
      aviation:     { icon:'✈️', name:'Commercial Aviation',    weight:'12%', summary:'Flight volume + airline policy',      detail:'40% flight count vs. pre-2023 baseline, 60% airline policy changes (route resumptions, overflight permissions).', sources:['OpenSky Network API','Airline press releases + RSS'], update:'Every 30 min' },
      prediction:   { icon:'💰', name:'Prediction Markets',     weight:'10%', summary:'Ceasefire odds on Polymarket',        detail:'Averages "Yes" probability across all active ceasefire/peace markets. Aggregated wisdom of thousands.', sources:['Polymarket API'], update:'Every hour' },
      credit:       { icon:'🏛', name:'Credit Ratings',         weight:'10%', summary:'Sovereign credit rating direction',   detail:'Tracks upgrades, downgrades, outlook changes. Direction matters more than absolute level — B+ → BB- is a peace signal.', sources:['Fitch Ratings',"S&P Global Ratings","Moody's",'Trading Economics'], update:'Weekly' },
      travel:       { icon:'🛂', name:'Travel Advisories',      weight:'10%', summary:'Foreign ministry risk levels',        detail:'Aggregates advisory levels (1-4) from multiple foreign ministries. Downward movement = peace. Score = (4 - avg)/3 × 100.', sources:['US State Department','UK FCDO','Government of Canada','Israel NSC'], update:'Daily' },
      thinktank:    { icon:'🧠', name:'Think Tank & Expert',    weight:'10%', summary:'Policy sentiment & consensus',        detail:'NLP sentiment scoring on publications, weighted by institute reliability. Note: reflects recommendations, not predictions.', sources:['Mitvim RSS','INSS RSS','JISS RSS','ICT RSS'], update:'Every 30 min' },
      shipping:     { icon:'🚢', name:'Gulf Shipping',          weight:'7%',  summary:'Red Sea / Gulf shipping status',      detail:'Scans shipping articles. Keywords: resumed shipping, port reopened, safe passage vs. attacked, seized, hijacked.', sources:['BBC World Service RSS','Al Jazeera English RSS'], update:'Every 30 min' },
      views:        { icon:'🌍', name:'VIEWS AI Forecast',      weight:'5%',  summary:'AI conflict prediction',              detail:'VIEWS uses AI to predict fatalities 1–36 months ahead. Declining predicted fatalities = peace signal.', sources:['VIEWS API / HDX (viewsforecasting.org)'], update:'Monthly' },
      humanitarian: { icon:'🏥', name:'Humanitarian',           weight:'1%',  summary:'Aid corridors & prisoner swaps',      detail:'Counts events: aid openings, releases, hospital access, refugee returns. Lagging indicator — happens after political decisions.', sources:['UN OCHA reports','ReliefWeb RSS','BBC/Al Jazeera humanitarian keywords'], update:'Daily' }
    },

    about: `<h2>About Peace Meter</h2>
<p>Peace Meter measures the "temperature of peace" across the Middle East using <strong>10 independent signals</strong>.</p>
<p>It is <strong>not a prediction</strong> — a structured aggregation of publicly available data to track positive momentum.</p>
<h3>Signals</h3>
<ul>
<li><strong>Political Tone</strong> (20%) — Senior official statement sentiment</li>
<li><strong>Diplomatic News</strong> (15%) — BBC + Al Jazeera headline analysis</li>
<li><strong>Commercial Aviation</strong> (12%) — Flight counts + airline policy</li>
<li><strong>Prediction Markets</strong> (10%) — Polymarket ceasefire odds</li>
<li><strong>Credit Ratings</strong> (10%) — Fitch/S&P/Moody's sovereign ratings</li>
<li><strong>Travel Advisories</strong> (10%) — Foreign ministry risk levels</li>
<li><strong>Think Tank & Expert</strong> (10%) — Mitvim, INSS, JISS publications</li>
<li><strong>Gulf Shipping</strong> (7%) — Red Sea / Gulf shipping</li>
<li><strong>VIEWS AI Forecast</strong> (5%) — PRIO/Uppsala AI prediction</li>
<li><strong>Humanitarian</strong> (1%) — Aid corridors, prisoner swaps</li>
</ul>
<h3>Scoring</h3>
<p>Each signal scored 0–100. Master score = weighted average. Asymmetric EMA: peace rises fast, decays slowly.</p>`,

    calc: `<h2>How the Score Is Calculated</h2>
<p><strong>Formula:</strong></p>
<p style="font-family:monospace;font-size:12px;background:#1e293b;padding:10px;border-radius:6px;margin:8px 0;">
Score = Tone×0.20 + News×0.15 + Aviation×0.12 + Predict×0.10 + Credit×0.10 + Travel×0.10 + ThinkTank×0.10 + Shipping×0.07 + VIEWS×0.05 + Humanitarian×0.01
</p>
<p><strong>Peace Multiplier:</strong> 3+ signals &gt; 60 → ×1.15. 5+ signals &gt; 60 → ×1.25. Capped at 100.</p>
<h3>Smoothing</h3>
<p>Asymmetric EMA: 3-hour half-life rising, 12-hour falling. Breakthroughs register fast; one bad day doesn't erase progress.</p>
<h3>Levels</h3>
<ul>
<li>0–25: ❄️ Frozen — Active conflict, no diplomacy</li>
<li>26–50: 🌤 Thawing — Back-channel talks</li>
<li>51–75: 🌱 Growing — Active negotiations</li>
<li>76–100: 🕊 Flourishing — Peace agreements</li>
</ul>`
  },

  he: {
    title: '☮️ מדד השלום',
    subtitle: 'מדידת טמפרטורת השלום במזרח התיכון',
    live: 'בשידור חי',
    nextUpdate: 'עדכון הבא',
    gaugeTitle: 'ציון שלום המזרח התיכון',
    trendTitle: '📈 מגמה (12 שעות)',
    pubTitle: '📚 פרסומים אחרונים של מכונים',
    footer1: 'מדד השלום הוא פרויקט ניסיוני למטרות מידע בלבד.',
    footer2: 'הציונים הם אגרגציה אלגוריתמית של נתונים ציבוריים, לא תחזיות.',
    close: 'סגור',

    levels: {
      frozen: '❄️ קפוא',
      thawing: '🌤 נמס',
      growing: '🌱 צומח',
      flourishing: '🕊 פורח'
    },
    status: { live: 'בשידור חי', delayed: 'מבוזמן' },

    signals: {
      tone:         { icon:'🤝', name:'גוון פוליטי',         weight:'20%', summary:'הצהרות של בכירים אזוריים', detail:'מסווגת הצהרות כבונות (משא ומתן, תוכנית שלום, דיאלוג) או עוינות (איום, הסלמה). ציון = יחס² × 150, חתוך 5-95.', sources:['RSS של BBC World Service','RSS של אל-ג׳אזירה','X/Twitter של מנהיגים מרכזיים'], update:'כל 30 דקות' },
      news:         { icon:'📰', name:'חדשות דיפלומטיות',    weight:'15%', summary:'ניתוח רגש של כותרות', detail:'סורק כותרות במזרח התיכון עבור מילות מפתח של שלום מול מלחמה. ציון = חדשות שלום / סך החדשות, עקומה ריבועית.', sources:['RSS של BBC World Service','RSS של אל-ג׳אזירה'], update:'כל 30 דקות' },
      aviation:      { icon:'✈️', name:'תעופה מסחרית',        weight:'12%', summary:'נפח טיסות + מדיניות חברות תעופה', detail:'40% ספירת טיסות מול קו בסיס 2023, 60% שינויי מדיניות (החזרת מסלולים, רשות מעבר אווירי).', sources:['API של OpenSky Network','הצהרות לעיתונות של חברות תעופה + RSS'], update:'כל 30 דקות' },
      prediction:    { icon:'💰', name:'שווקי תחזית',         weight:'10%', summary:'הסתברות לסיכום הפסקת אש', detail:'ממוצע הסתברות "כן" בכל שווקי הסיכום הפעילים. חכמתן של אלפי משקיעים.', sources:['API של Polymarket'], update:'כל שעה' },
      credit:        { icon:'🏛', name:'דירוגי אשראי',        weight:'10%', summary:'כיוון דירוגי אשראי מדינתיים', detail:'מעקב אחר שדרוגים, ירידות דירוג ושינויי תחזית. הכיוון חשוב יותר מהרמה המוחלטת.', sources:['Fitch Ratings','S&P Global Ratings',"Moody's",'Trading Economics'], update:'שבועי' },
      travel:        { icon:'🛂', name:'אזהרות נסיעות',       weight:'10%', summary:'רמות סיכון של משרדי חוץ', detail:'מאגד רמות אזהרה (1-4) ממספר משרדי חוץ. ירידה באזהרה = אות של שלום. ציון = (4 - ממוצע)/3 × 100.', sources:['משרד החוץ האמריקאי','FCDO בריטי','ממשלת קנדה','נציבות השלטון הישראלי'], update:'יומי' },
      thinktank:     { icon:'🧠', name:'מכוני מחקר',          weight:'10%', summary:'רגש מדיני וקונצנזוס', detail:'ניקוד רגש NLP של פרסומים, משוקלל לפי אמינות המכון. הערה: משקף המלצות מדיניות, לא תחזיות.', sources:['RSS של מיטבim','RSS של INSS','RSS של JISS','RSS של ICT'], update:'כל 30 דקות' },
      shipping:      { icon:'🚢', name:'ספנות מפרץ',          weight:'7%',  summary:'סטטוס ספנות בים האדום / המפרץ', detail:'סורק מודעות ספנות. מילות מפתח: חידוש ספנות, נמל נפתח, מעבר בטוח מול התקפה, חטיפה.', sources:['RSS של BBC World Service','RSS של אל-ג׳אזירה'], update:'כל 30 דקות' },
      views:         { icon:'🌍', name:'תחזית AI — VIEWS',    weight:'5%',  summary:'תחזית קונפליקט בינה מלאכותית', detail:'VIEWS משתמש ב-AI לחזות נפגטים בטווח של 1-36 חודשים. ירידה בניפגטים הצפויים = אות של שלום.', sources:['VIEWS API / HDX (viewsforecasting.org)'], update:'חודשי' },
      humanitarian:  { icon:'🏥', name:'הומניטרי',            weight:'1%',  summary:'מסדרונות סיוע והחלפת אסירים', detail:'סופר אירועים: פתיחת מסדרונות, שחרורים, גישה לבתי חולים, חזרת פליטים. מדד מאחר — מתרחש אחרי החלטות פוליטיות.', sources:['דוחות UN OCHA','RSS של ReliefWeb','מילות מפתח הומניטריות ב-BBC/אל-ג׳אזירה'], update:'יומי' }
    },

    about: `<h2>אודות מדד השלום</h2>
<p>מדד השלום הוא לוח בקרה בזמן אמת שממדד את "טמפרטורת השלום" במזרח התיכון באמצעות <strong>10 אותות בלתי תלויים</strong>.</p>
<p>זה <strong>אינו תחזית</strong> — אגרגציה מסודרת של נתונים ציבוריים למעקב אחר תנע חיובי.</p>
<h3>אותות</h3>
<ul>
<li><strong>גוון פוליטי</strong> (20%) — רגש של הצהרות בכירים</li>
<li><strong>חדשות דיפלומטיות</strong> (15%) — ניתוח כותרות BBC + אל-ג׳אזירה</li>
<li><strong>תעופה מסחרית</strong> (12%) — ספירת טיסות + מדיניות חברות תעופה</li>
<li><strong>שווקי תחזית</strong> (10%) — הסתברויות סיכום ב-Polymarket</li>
<li><strong>דירוגי אשראי</strong> (10%) — דירוגי Fitch/S&P/Moody's</li>
<li><strong>אזהרות נסיעות</strong> (10%) — רמות סיכון של משרדי חוץ</li>
<li><strong>מכוני מחקר</strong> (10%) — פרסומי MiTvim, INSS, JISS</li>
<li><strong>ספנות מפרץ</strong> (7%) — ספנות ים אדום / מפרץ</li>
<li><strong>VIEWS AI</strong> (5%) — תחזית AI של PRIO/Uppsala</li>
<li><strong>הומניטרי</strong> (1%) — מסדרונות סיוע, החלפת אסירים</li>
</ul>
<h3>ציון</h3>
<p>כל אות נצרב 0-100. הציון הראשי הוא ממוצע משוקלל. EMA א-סימטרית: שלום עולה מהר, דועך לאט.</p>`,

    calc: `<h2>איך הציון מחושב</h2>
<p><strong>נוסחה:</strong></p>
<p style="font-family:monospace;font-size:12px;background:#1e293b;padding:10px;border-radius:6px;margin:8px 0;direction:ltr;text-align:left;">
Score = Tone×0.20 + News×0.15 + Aviation×0.12 + Predict×0.10 + Credit×0.10 + Travel×0.10 + ThinkTank×0.10 + Shipping×0.07 + VIEWS×0.05 + Humanitarian×0.01
</p>
<p><strong>מכפיל שלום:</strong> כש-3+ אותות &gt; 60 → ×1.15. כש-5+ אותות &gt; 60 → ×1.25. תקרה ב-100.</p>
<h3>החלקה</h3>
<p>EMA א-סימטרית: חצי חיים של 3 שעות בעלייה, 12 שעות בירידה. פריצה רשומה מהר; יום רע אחד לא מוחק התקדמות.</p>
<h3>רמות</h3>
<ul>
<li>0-25: ❄️ קפוא — קונפליקט פעיל, ללא דיפלומטיה</li>
<li>26-50: 🌤 נמס — שיחות מסדרון צדדי</li>
<li>51-75: 🌱 צומח — משא ומתן פעיל</li>
<li>76-100: 🕊 פורח — הסכמי שלום</li>
</ul>`
  }
};

/* ── Language manager ──────────────────────────────────── */
let currentLang = localStorage.getItem('pm-lang') || 'en';

function t(key) {
  const keys = key.split('.');
  let obj = LANG[currentLang];
  for (const k of keys) {
    if (obj && obj[k] !== undefined) obj = obj[k];
    else return key;
  }
  return obj;
}

function setLanguage(lang) {
  if (!LANG[lang]) return;
  currentLang = lang;
  localStorage.setItem('pm-lang', lang);
  document.documentElement.lang = lang;
  document.documentElement.dir = lang === 'he' ? 'rtl' : 'ltr';
  applyTranslations();
}

function applyTranslations() {
  const L = LANG[currentLang];
  document.title = L.title + ' — ' + L.subtitle;
  document.querySelector('.logo').textContent = L.title;
  document.querySelector('.live-badge').childNodes[1].textContent = ' ' + L.live;
  document.querySelector('.gauge-title').textContent = L.gaugeTitle;
  document.querySelector('.chart-card h3').textContent = L.trendTitle;
  document.querySelector('.pub-card h3').textContent = L.pubTitle;
  document.getElementById('modalClose').textContent = L.close;
  const footer = document.querySelectorAll('.footer p');
  if (footer[0]) footer[0].textContent = L.footer1;
  if (footer[1]) footer[1].textContent = L.footer2;
}

window.LANG = LANG;
window.currentLang = currentLang;
window.t = t;
window.setLanguage = setLanguage;
window.applyTranslations = applyTranslations;

document.addEventListener('DOMContentLoaded', () => setLanguage(currentLang));