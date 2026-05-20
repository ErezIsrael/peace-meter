/* ── Peace Meter — i18n (EN / HE) ──────────────────────── */
/* VERSION: 2.1.1 */

const LANG = {
  en: {
    title: '☮️ Peace Meter',
    subtitle: 'Middle East Peace Temperature',
    live: 'Live',
    nextUpdate: 'Next update',
    gaugeTitle: 'Middle East Peace Score',
    trendTitle: '📈 Trend (12 Hours)',
    pubTitle: '📚 Recent Civil Society & Think Tank Publications',
    footer1: 'Peace Meter is an experimental project for informational purposes only.',
    footer2: 'Scores are algorithmic aggregations of publicly available data, not predictions.',
    donate: '☕ Buy Me Coffee',
    errorCached: 'Could not reach server. Showing cached data.',
    errorOffline: 'Could not load data. Please retry.',
    retry: 'Retry',
    close: 'Close',

    levels: {
      frozen: '❄️ Frozen',
      thawing: '🌤 Thawing',
      growing: '🌱 Growing',
      flourishing: '🕊 Flourishing'
    },
    status: { live: 'Live', delayed: 'Delayed' },

    signals: {
      tone:        { icon:'🤝', name:'Political Tone',        weight:'20%', summary:'GDELT event tone scoring',             detail:'Uses GDELT 2.0 Event Database. Goldstein Scale (-10 to +10) per event. Score = 50 + (avgGoldstein/10)×50, clamped 0–100. Falls back to RSS sentiment if GDELT unavailable.', sources:['GDELT 2.0 Event Database','RSS feeds (fallback)'], update:'Every 15 min' },
      news:        { icon:'📰', name:'Diplomatic News',       weight:'15%', summary:'CAMEO diplomatic event ratio',        detail:'Counts CAMEO diplomatic event codes vs. total events in GDELT. Score = (constructiveRatio)² × 150, clamped 3–95. Falls back to RSS headline analysis.', sources:['GDELT 2.0 Event Database','RSS feeds (fallback)'], update:'Every 15 min' },
      aviation:     { icon:'✈️', name:'Commercial Aviation',    weight:'12%', summary:'Flight volume + airline policy',      detail:'40% flight count vs. pre-2023 baseline, 60% airline policy changes (route resumptions, overflight permissions).', sources:['OpenSky Network API','Airline press releases + RSS'], update:'Every 30 min' },
      prediction:   { icon:'💰', name:'Prediction Markets',     weight:'10%', summary:'Ceasefire odds on Polymarket',        detail:'Averages "Yes" probability across all active ceasefire/peace markets. Aggregated wisdom of thousands.', sources:['Polymarket API'], update:'Every hour' },
      credit:       { icon:'🏛', name:'Credit Ratings',         weight:'10%', summary:'Sovereign credit rating direction',   detail:'Tracks upgrades, downgrades, outlook changes. Direction matters more than absolute level — B+ → BB- is a peace signal.', sources:['Fitch Ratings',"S&P Global Ratings","Moody's",'Trading Economics'], update:'Weekly' },
      travel:       { icon:'🛂', name:'Travel Advisories',      weight:'10%', summary:'Foreign ministry risk levels',        detail:'Aggregates advisory levels (1-4) from multiple foreign ministries. Downward movement = peace. Score = (4 - avg)/3 × 100.', sources:['US State Department','UK FCDO','Government of Canada','Israel NSC'], update:'Daily' },
      thinktank:    { icon:'🧠', name:'Think Tank & Expert',    weight:'10%', summary:'Policy sentiment & consensus',        detail:'NLP sentiment scoring on publications, weighted by institute reliability. Note: reflects recommendations, not predictions.', sources:['Mitvim RSS','EcoPeace RSS','JISS RSS'], update:'Every 30 min' },
      conflict:     { icon:'💥', name:'Conflict Events',        weight:'8%',  summary:'Violence vs. diplomacy ratio',         detail:'Uses GDELT 2.0 Event Database. Counts hostile events vs. constructive events. Inverted: more hostility = lower peace score. 0 hostile → 100, all hostile → 0.', sources:['GDELT 2.0 Event Database'], update:'Every 15 min' },
      views:        { icon:'🌍', name:'VIEWS AI Forecast',      weight:'5%',  summary:'AI conflict prediction',              detail:'VIEWS uses AI to predict fatalities 1–36 months ahead. Declining predicted fatalities = peace signal.', sources:['VIEWS API / HDX (viewsforecasting.org)'], update:'Monthly' },
      humanitarian: { icon:'🏥', name:'Humanitarian',           weight:'1%',  summary:'Aid corridors & prisoner swaps',      detail:'Counts events: aid openings, releases, hospital access, refugee returns. Lagging indicator — happens after political decisions.', sources:['UN OCHA reports','ReliefWeb RSS','BBC/Al Jazeera humanitarian keywords'], update:'Daily' }
    },

    privacy: `<h2>Privacy Policy</h2>
<p><em>Last updated: May 2026</em></p>

<h3>1. Data We Collect</h3>
<p>Peace Meter does <strong>not collect personal data</strong>. There are no accounts, forms, or tracking.</p>
<p>The only data stored is:</p>
<ul>
<li>Language preference in localStorage (<code>pm-lang</code>)</li>
>Cached data in localStorage (<code>pm-cache</code>) — server responses, auto-deleted on next successful fetch</li>
</ul>

<h3>2. No Cookies</h3>
<p>Peace Meter does not use cookies.</p>

<h3>3. Third-Party Services</h3>
<p>Peace Meter loads two external services:</p>
<ul>
<li><strong>Cloudflare Pages</strong> — Hosting provider. Logs IP, timestamp, user-agent for security (7–30 days retention). <a href="https://www.cloudflare.com/privacypolicy/" target="_blank">See their policy</a>.</li>
<li><strong>Google Fonts</strong> — Inter &amp; Space Grotesk typefaces. <a href="https://policies.google.com/privacy" target="_blank">See their policy</a>.</li>
</ul>

<h3>4. Data Deletion</h3>
<p>You can delete all stored data at any time by:</p>
<ul>
<li>Clearing your browser's site data</li>
<li>Using your browser's "Clear browsing data" feature</li>
</ul>

<h3>5. Legal Basis</h3>
<p>This policy complies with Israel's Privacy Protection Law (Amendment 13) and GDPR.</p>

<h3>6. Contact</h3>
<p>For questions, contact us via <a href="https://github.com/ErezIsrael/peace-meter/issues" target="_blank">GitHub Issues</a>.</p>`,

    terms: `<h2>Terms of Service</h2>
<p><em>Last updated: May 2026</em></p>

<h3>1. Nature of the Service</h3>
<p>Peace Meter is an informational dashboard aggregating publicly available data about Middle East geopolitical indicators.</p>

<h3>2. No Predictions or Advice</h3>
<p>Peace Meter does not make predictions, and is not financial, political, or security advice.</p>

<h3>3. No Guarantees</h3>
<p>Scores and data are provided without accuracy guarantee. Sources include public RSS feeds and APIs that may change or become unavailable.</p>

<h3>4. User Data</h3>
<p>All stored data resides locally in your browser. No data is transmitted to us.</p>

<h3>5. Open Source</h3>
<p>Peace Meter is an open-source project. Code is available on <a href="https://github.com/ErezIsrael/peace-meter" target="_blank">GitHub</a>.</p>

<h3>6. Limitation of Liability</h3>
<p>Peace Meter is provided "as is" without warranty of any kind.</p>

<h3>7. Governing Law</h3>
<p>These terms are governed by the laws of Israel.</p>

<h3>8. Changes to These Terms</h3>
<p>These terms may be updated from time to time. Check this page for the latest version.</p>`,

    accessibility: `<h2>Accessibility Statement</h2>
<p><em>Last updated: May 2026</em></p>

<h3>1. Our Commitment</h3>
<p>Peace Meter is committed to digital accessibility for users of all abilities.</p>

<h3>2. Current Accessibility Features</h3>
<ul>
<li>Semantic HTML with proper heading hierarchy</li>
<li>Keyboard accessibility for all interactive elements</li>
<li>Visible focus indicators</li>
<li>WCAG AA color contrast (4.5:1+)</li>
<li>Responsive design for all screen sizes</li>
<li>Language declaration (lang attribute)</li>
<li>RTL layout support for Hebrew</li>
<li>Screen reader compatibility</li>
</ul>

<h3>3. Known Limitations</h3>
<ul>
<li>SVG gauge chart may present challenges for screen readers (score provided textually)</li>
<li>Sparkline trend charts are visual-only; values shown as text</li>
</ul>

<h3>4. Feedback</h3>
<p>We welcome your feedback. Please <a href="https://github.com/ErezIsrael/peace-meter/issues" target="_blank">open an issue on GitHub</a>.</p>

<h3>5. Evaluation</h3>
<p>The evaluation process includes:</p>
<ul>
<li>Self-review against WCAG 2.1 AA and IS 5568</li>
<li>Automated accessibility testing tools</li>
<li>Manual testing with keyboard and screen readers</li>
</ul>`,

    about: `<h2>About Peace Meter</h2>
<p>Peace Meter measures the "temperature of peace" across the Middle East using <strong>10 independent signals</strong>.</p>
<p>It is <strong>not a prediction</strong> — a structured aggregation of publicly available data to track positive momentum.</p>
<h3>Signals</h3>
<ul>
<li><strong>Political Tone</strong> (20%) — GDELT event tone scoring</li>
<li><strong>Diplomatic News</strong> (15%) — GDELT CAMEO diplomatic event ratio</li>
<li><strong>Commercial Aviation</strong> (12%) — Flight counts + airline policy</li>
<li><strong>Prediction Markets</strong> (10%) — Polymarket ceasefire odds</li>
<li><strong>Credit Ratings</strong> (10%) — Fitch/S&P/Moody's sovereign ratings</li>
<li><strong>Travel Advisories</strong> (10%) — Foreign ministry risk levels</li>
<li><strong>Think Tank & Expert</strong> (10%) — Mitvim, EcoPeace ME publications</li>
<li><strong>Conflict Events</strong> (8%) — GDELT hostile vs constructive event ratio</li>
<li><strong>VIEWS AI Forecast</strong> (5%) — PRIO/Uppsala AI prediction</li>
<li><strong>Humanitarian</strong> (1%) — Aid corridors, prisoner swaps</li>
</ul>
<h3>Scoring</h3>
<p>Each signal scored 0–100. Master score = weighted average. Asymmetric EMA: peace rises fast, decays slowly.</p>`,

    calc: `<h2>How the Score Is Calculated</h2>
<p><strong>Formula:</strong></p>
<p style="font-family:monospace;font-size:12px;background:#1e293b;padding:10px;border-radius:6px;margin:8px 0;">
Score = Tone×0.20 + News×0.15 + Aviation×0.12 + Predict×0.10 + Credit×0.10 + Travel×0.10 + ThinkTank×0.10 + Conflict×0.08 + VIEWS×0.05 + Humanitarian×0.01
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
    gaugeTitle: 'ציון שלום במזרח התיכון',
    trendTitle: '📈 מגמה (12 שעות)',
    pubTitle: '📚 פרסומי חברה אזרחית ומכונים',
    footer1: 'מדד השלום הוא פרויקט ניסיוני למטרות מידע בלבד.',
    footer2: 'הציונים הם אגרגציה אלגוריתמית של נתונים ציבוריים, לא תחזיות.',
    donate: '☕ קנו לי קפה',
    errorCached: 'לא ניתן להגיע לשרת. מוצגים נתונים מהזיכרון.',
    errorOffline: 'נכשל בטעינת הנתונים. אנא נסה שוב.',
    retry: 'נסה שוב',
    close: 'סגור',

    levels: {
      frozen: '❄️ קפוא',
      thawing: '🌤 נמס',
      growing: '🌱 צומח',
      flourishing: '🕊 פורח'
    },
    status: { live: 'בשידור חי', delayed: 'מושהה' },

    signals: {
      tone:         { icon:'🤝', name:'גוון פוליטי',         weight:'20%', summary:'ניקוד רגש אירועים GDELT',         detail:'משתמש במסד GDELT 2.0. סולם גולדשטיין (-10 עד +10) לאירוע. ציון = 50 + (ממוצעGoldstein/10)×50, חתוך 0-100. חוזר ל-RSS אם GDELT לא זמין.', sources:['GDELT 2.0 Event Database','RSS feeds (גיבוי)'], update:'כל 15 דקות' },
      news:         { icon:'📰', name:'חדשות דיפלומטיות',    weight:'15%', summary:'יחס אירועים דיפלומטיים CAMEO', detail:'סופר קודי אירועים דיפלומטיים CAMEO לעומת סך האירועים ב-GDELT. ציון = (יחסבני)² × 150, חתוך 3-95. חוזר לניתוח כותרות RSS.', sources:['GDELT 2.0 Event Database','RSS feeds (גיבוי)'], update:'כל 15 דקות' },
      aviation:      { icon:'✈️', name:'תעופה מסחרית',        weight:'12%', summary:'נפח טיסות + מדיניות חברות תעופה', detail:'40% ספירת טיסות מול קו בסיס 2023, 60% שינויי מדיניות (החזרת מסלולים, רשות מעבר אווירי).', sources:['API של OpenSky Network','הצהרות לעיתונות של חברות תעופה + RSS'], update:'כל 30 דקות' },
      prediction:    { icon:'💰', name:'שווקי תחזית',         weight:'10%', summary:'הסתברות לסיכום הפסקת אש', detail:'ממוצע הסתברות "כן" בכל שווקי הסיכום הפעילים. חכמתן של אלפי משקיעים.', sources:['API של Polymarket'], update:'כל שעה' },
      credit:        { icon:'🏛', name:'דירוגי אשראי',        weight:'10%', summary:'כיוון דירוגי אשראי מדינתיים', detail:'מעקב אחר שדרוגים, ירידות דירוג ושינויי תחזית. הכיוון חשוב יותר מהרמה המוחלטת.', sources:['Fitch Ratings','S&P Global Ratings',"Moody's",'Trading Economics'], update:'שבועי' },
      travel:        { icon:'🛂', name:'אזהרות נסיעות',       weight:'10%', summary:'רמות סיכון של משרדי חוץ', detail:'מאגד רמות אזהרה (1-4) ממספר משרדי חוץ. ירידה באזהרה = אות של שלום. ציון = (4 - ממוצע)/3 × 100.', sources:['משרד החוץ האמריקאי','FCDO בריטי','ממשלת קנדה','נציבות השלטון הישראלי'], update:'יומי' },
      thinktank:     { icon:'🧠', name:'מכוני מחקר',          weight:'10%', summary:'רגש מדיני וקונצנזוס', detail:'ניקוד רגש NLP של פרסומים, משוקלל לפי אמינות המכון. הערה: משקף המלצות מדיניות, לא תחזיות.', sources:['RSS של מיטבim','RSS של INSS','RSS של JISS','RSS של ICT'], update:'כל 30 דקות' },
      conflict:      { icon:'💥', name:'אירועי קונפליקט',      weight:'8%',  summary:'יחס אלימות לעומת דיפלומטיה',     detail:'משתמש במסד GDELT 2.0. סופר אירועים עוינים מול אירועים בונים. הפוך: יותר עוינות = ציון נמוך יותר. 0 עוינות → 100, הכל עוינות → 0.', sources:['GDELT 2.0 Event Database'], update:'כל 15 דקות' },
      views:         { icon:'🌍', name:'תחזית AI — VIEWS',    weight:'5%',  summary:'תחזית קונפליקט בינה מלאכותית', detail:'VIEWS משתמש ב-AI לחזות נפגטים בטווח של 1-36 חודשים. ירידה בניפגטים הצפויים = אות של שלום.', sources:['VIEWS API / HDX (viewsforecasting.org)'], update:'חודשי' },
      humanitarian:  { icon:'🏥', name:'הומניטרי',            weight:'1%',  summary:'מסדרונות סיוע והחלפת אסירים', detail:'סופר אירועים: פתיחת מסדרונות, שחרורים, גישה לבתי חולים, חזרת פליטים. מדד מאחר — מתרחש אחרי החלטות פוליטיות.', sources:['דוחות UN OCHA','RSS של ReliefWeb','מילות מפתח הומניטריות ב-BBC/אל-ג׳אזירה'], update:'יומי' }
    },

    privacy: `<h2>מדיניות פרטיות</h2>
<p><em>עודכן לאחרונה: מאי 2026</em></p>

<h3>1. נתונים שאנו אוספים</h3>
<p>מדד השלום <strong>לא אוסף נתונים אישיים</strong>. אין חשבונות, טפסים או מעקב.</p>
<p>הנתונים היחידים הנשמרים הם:</p>
<ul>
<li>העדפת שפה ב-localStorage (<code>pm-lang</code>)</li>
<li>נתונים ממטמון ב-localStorage (<code>pm-cache</code>) — תגובות שרת, נמחקים אוטומטית בעת טעינה מוצלחת</li>
</ul>

<h3>2. ללא עוגיות</h3>
<p>מדד השלום אינו משתמש בעוגיות.</p>

<h3>3. שירותי צד שלישי</h3>
<p>מדד השלום טוען שני שירותים חיצוניים:</p>
<ul>
<li><strong>Cloudflare Pages</strong> — ספק אחסון. מקליד IP, חותמת זמן, סוכן משתמש לצורכי אבטחה (שמירה 7-30 ימים). <a href="https://www.cloudflare.com/privacypolicy/" target="_blank">מדיניות פרטיות</a>.</li>
<li><strong>גופני Google</strong> — Inter ו-Space Grotesk. <a href="https://policies.google.com/privacy" target="_blank">מדיניות פרטיות</a>.</li>
</ul>

<h3>4. מחיקת נתונים</h3>
<p>אתה יכול למחוק את כל הנתונים בכל עת:</p>
<ul>
<li>ניקוי נתוני האתר בדפדפן</li>
<li>שימוש בפונקציית "ניקוי נתוני גלישה" בדפדפן</li>
</ul>

<h3>5. בסיס משפטי</h3>
<p>מדיניות זו עומדת בדרישות חוק הגנת הפרטיות (תיקון 13) ו-GDPR.</p>

<h3>6. יצירת קשר</h3>
<p>לשאלות, פנה דרך <a href="https://github.com/ErezIsrael/peace-meter/issues" target="_blank">GitHub Issues</a>.</p>`,

    terms: `<h2>תנאי שימוש</h2>
<p><em>עודכן לאחרונה: מאי 2026</em></p>

<h3>1. אופי השירות</h3>
<p>מדד השלום הוא לוח בקרה מידעי המאגד נתונים ציבוריים על אינדיקטורים גיאופוליטיים במזרח התיכון.</p>

<h3>2. ללא תחזיות או ייעוץ</h3>
<p>מדד השלום אינו עושה תחזיות ואינו מהווה ייעוץ פיננסי, פוליטי או ביטחוני.</p>

<h3>3. ללא אחריות</h3>
<p>הציונים והנתונים מסופקים ללא התחייבות לדיוק. המקורות כוללים RSS ציבורי ו-APIs שעלולים להשתנות.</p>

<h3>4. נתוני משתמש</h3>
<p>כל הנתונים נשמרים מקומית בדפדפן שלך. אף נתון אינו מועבר אלינו.</p>

<h3>5. קוד פתוח</h3>
<p>מדד השלום הוא פרויקט קוד פתוח. הקוד זמין ב-<a href="https://github.com/ErezIsrael/peace-meter" target="_blank">GitHub</a>.</p>

<h3>6. הגבלת אחריות</h3>
<p>מדד השלום מסופק "כפי שהוא" ללא אחריות כלשהי.</p>

<h3>7. דיני חלופה</h3>
<p>תנאים אלו כפופים לחוקי מדינת ישראל.</p>

<h3>8. שינויים בתנאים</h3>
<p>תנאים אלו עשויים להתעדכן מעת לעת. בדוק דף זה לגרסה העדכנית ביותר.</p>`,


    accessibility: `<h2>הצהרת נגישות</h2>
<p><em>עודכן לאחרונה: מאי 2026</em></p>

<h3>1. המחשת שלנו</h3>
<p>מדד השלום מחויב לנגישות דיגיטלית למשתמשים מכל הסוגים.</p>

<h3>2. תכונות נגישות נוכחיות</h3>
<ul>
<li>HTML סמנטי עם ירושת כותרות תקינה</li>
<li>נגישות במקלדת לכל אלמנטים אינטראקטיביים</li>
<li>מראי מיקוד גלויים</li>
<li>ניגודיות צבעי WCAG AA (4.5:1+)</li>
<li>עיצוב רספונסיבי לכל גדלי מסך</li>
<li>הצהרת שפה (שיוך lang)</li>
<li>תמיכה ב-RTL לעברית</li>
<li>תאימות לקוראי מסך</li>
</ul>

<h3>3. מגבלות ידועות</h3>
<ul>
<li>מד SVG עשוי להציג אתגרים לקוראי מסך (הציון מוצג כטקסט)</li>
<li>גרפי Sparkline ויזואליים בלבד; ערכים מוצגים כטקסט</li>
</ul>

<h3>4. משוב</h3>
<p>אנו מכבדים את משובך. אנא <a href="https://github.com/ErezIsrael/peace-meter/issues" target="_blank">פתח פנייה ב-GitHub</a>.</p>

<h3>5. הערכה</h3>
<p>תהליך ההערכה כולל:</p>
<ul>
<li>בדיקה עצמית מול WCAG 2.1 AA ו-IS 5568</li>
<li>כלי בדיקת נגישות אוטומטיים</li>
<li>בדיקה ידנית עם מקלדת וקוראי מסך</li>
</ul>`,

    about: `<h2>אודות מדד השלום</h2>
<p>מדד השלום הוא לוח בקרה בזמן אמת שממדד את "טמפרטורת השלום" במזרח התיכון באמצעות <strong>10 אותות בלתי תלויים</strong>.</p>
<p>זה <strong>אינו תחזית</strong> — אגרגציה מסודרת של נתונים ציבוריים למעקב אחר תנע חיובי.</p>
<h3>אותות</h3>
<ul>
<li><strong>גוון פוליטי</strong> (20%) — ניקוד רגש אירועים GDELT</li>
<li><strong>חדשות דיפלומטיות</strong> (15%) — יחס אירועים דיפלומטיים CAMEO</li>
<li><strong>תעופה מסחרית</strong> (12%) — ספירת טיסות + מדיניות חברות תעופה</li>
<li><strong>שווקי תחזית</strong> (10%) — הסתברויות סיכום ב-Polymarket</li>
<li><strong>דירוגי אשראי</strong> (10%) — דירוגי Fitch/S&P/Moody's</li>
<li><strong>אזהרות נסיעות</strong> (10%) — רמות סיכון של משרדי חוץ</li>
<li><strong>מכוני מחקר</strong> (10%) — פרסומי Mitvim, EcoPeace ME</li>
<li><strong>אירועי קונפליקט</strong> (8%) — יחס אירועים עוינים לבונים מ-GDELT</li>
<li><strong>VIEWS AI</strong> (5%) — תחזית AI של PRIO/Uppsala</li>
<li><strong>הומניטרי</strong> (1%) — מסדרונות סיוע, החלפת אסירים</li>
</ul>
<h3>ציון</h3>
<p>כל אות נצרב 0-100. הציון הראשי הוא ממוצע משוקלל. EMA א-סימטרית: שלום עולה מהר, דועך לאט.</p>`,

    calc: `<h2>איך הציון מחושב</h2>
<p><strong>נוסחה:</strong></p>
<p style="font-family:monospace;font-size:12px;background:#1e293b;padding:10px;border-radius:6px;margin:8px 0;direction:ltr;text-align:left;">
Score = Tone×0.20 + News×0.15 + Aviation×0.12 + Predict×0.10 + Credit×0.10 + Travel×0.10 + ThinkTank×0.10 + Conflict×0.08 + VIEWS×0.05 + Humanitarian×0.01
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
let currentLang = (() => {
  // Check URL parameter first (?lang=he)
  const params = new URLSearchParams(window.location.search);
  const urlLang = params.get('lang');
  if (urlLang && LANG[urlLang]) {
    localStorage.setItem('pm-lang', urlLang);
    return urlLang;
  }
  return localStorage.getItem('pm-lang') || 'en';
})();

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
  document.getElementById('retryBtn').textContent = L.retry;
  const footer = document.querySelectorAll('.footer p');
  if (footer[0]) footer[0].textContent = L.footer1;
  if (footer[1]) footer[1].textContent = L.footer2;

  // Translate footer links by href/data attribute (skip #versionTag)
  const linkMap = currentLang === 'en'
    ? {
        '#': ['Privacy Policy', 'Terms of Service', 'Accessibility'], // privacy, terms, accessibility
        'https://github.com/ErezIsrael/peace-meter/issues': '🐛 Report a Bug',
        'https://ko-fi.com/erezse': '☕ Buy Me Coffee',
      }
    : {
        '#': ['מדיניות פרטיות', 'תנאי שימוש', 'נגישות'],
        'https://github.com/ErezIsrael/peace-meter/issues': '🐛 דווח על באג',
        'https://ko-fi.com/erezse': '☕ קנו לי קפה',
      };
  const links = document.querySelectorAll('.footer-links a.footer-link');
  const hashCounter = { count: 0 };
  links.forEach((el) => {
    if (el.id === 'versionTag') return;
    const href = el.getAttribute('href');
    if (href === '#') {
      el.textContent = linkMap['#'][hashCounter.count++];
    } else {
      el.textContent = linkMap[href];
    }
  });
}

window.LANG = LANG;
window.currentLang = currentLang;
window.t = t;
window.setLanguage = setLanguage;
window.applyTranslations = applyTranslations;

document.addEventListener('DOMContentLoaded', () => setLanguage(currentLang));