export interface ServiceData {
  slug: string
  key: string
  icon: string
  label: string
  tagline: string
  color: string
  heroDesc: string
  stats: { num: string; label: string }[]
  features: { title: string; desc: string }[]
  process: { n: string; title: string; desc: string }[]
  portfolio: { youtube_id: string; title: string; client: string }[]
  shorts?: { youtube_id: string; title: string }[]
  faq: { q: string; a: string }[]
}

export const SERVICES_DATA: ServiceData[] = [
  {
    slug: 'brand-video',
    key: 'brand',
    icon: '▶',
    label: 'Brand & Commercial Video',
    tagline: 'Cinematic films that define your identity',
    color: '#E8452A',
    heroDesc: 'From brand story films and product launches to company culture videos and award-winning campaign spots — we produce broadcast-quality commercial content that elevates your brand across every channel. Our films don\'t just look beautiful; they move audiences and drive measurable business results.',
    stats: [
      { num: '97%', label: 'of viewers retain brand video messages' },
      { num: '80%', label: 'higher engagement vs. static ads' },
      { num: '12+', label: 'years producing brand content' },
      { num: '48h', label: 'turnaround available' },
    ],
    features: [
      { title: 'Brand Story Films', desc: 'Compelling founder stories, company culture films, and origin narratives that humanise your brand and build lasting emotional connection with your audience.' },
      { title: 'Product Launch Videos', desc: 'High-impact launch films that generate buzz, drive pre-orders, and position your product as a must-have from day one — built for both broadcast and social channels.' },
      { title: 'TV & Online Commercials', desc: 'Broadcast-quality commercial spots crafted for TV, YouTube pre-roll, and programmatic display — with full scripting, casting, and post-production included.' },
      { title: 'Corporate Culture & Profiles', desc: 'Authentic behind-the-scenes content that attracts top talent, builds investor trust, and differentiates your brand in a crowded market.' },
      { title: 'Event & Campaign Coverage', desc: 'Full-crew event capture with same-day turnaround capability — product reveals, conferences, launches, and activations filmed and edited to share immediately.' },
      { title: 'Documentary-Style Brand Films', desc: 'Long-form cinematic storytelling for brands with a deeper story to tell. These are the films that win awards and drive earned media coverage.' },
    ],
    process: [
      { n: '01', title: 'Discovery & Creative Brief', desc: 'We deep-dive into your brand, audience, competitors, and goals. Every project starts with a strategic creative brief that aligns vision with measurable outcomes.' },
      { n: '02', title: 'Script & Storyboard', desc: 'Our creative team develops a full script, shot-by-shot storyboard, and mood board — so you see exactly what the film will look and feel like before a single frame is shot.' },
      { n: '03', title: 'Production Day(s)', desc: 'On-location or studio shoot with our full crew. Professional lighting, broadcast audio, and direction by our senior team. Nothing left to chance.' },
      { n: '04', title: 'Post & Delivery', desc: 'Full edit, colour grade, motion graphics, and sound design. Delivered in every format you need with revision rounds included and 48h turnaround available.' },
    ],
    portfolio: [
      { youtube_id: 'SgHHbWp64cE', title: 'Perfume Brand Film', client: 'Fragrance Brand' },
      { youtube_id: 'HAHj0TDQZcg', title: 'A Steampunk Princess', client: 'Creative Direction' },
      { youtube_id: 'EZUJiL9MeLw', title: 'Virus House Teaser', client: 'Film Project' },
    ],
    faq: [
      { q: 'How long does a brand film typically take to produce?', a: 'Most brand films take 2–4 weeks from brief to final delivery. Rush 48h turnarounds are available for post-production-only projects. We\'ll give you a detailed timeline in your free quote.' },
      { q: 'Do you handle scripting and creative direction?', a: 'Yes — scripting, storyboarding, location scouting, casting, and all creative direction is handled by our team. You\'ll approve everything before shoot day.' },
      { q: 'Can you work with our existing brand guidelines?', a: 'Absolutely. We immerse ourselves in your brand identity, tone of voice, and visual language before a single frame is planned. Your brand guidelines are our starting point.' },
      { q: 'What\'s included in the post-production process?', a: 'Full edit, professional colour grading, motion graphics and titles, sound design, music licensing, and delivery in all required formats (broadcast, web, social cutdowns).' },
    ],
  },

  {
    slug: 'ai-video',
    key: 'ai',
    icon: '◈',
    label: 'AI-Powered Video',
    tagline: 'Human creativity, machine speed',
    color: '#C9A96E',
    heroDesc: 'We leverage Runway, Sora, Stable Diffusion, and proprietary AI workflows to create video campaigns that were previously impossible — or prohibitively expensive. AI doesn\'t replace our creative team; it amplifies what they can achieve. The result: faster production, lower cost per asset, and content that performs at scale.',
    stats: [
      { num: '3×', label: 'more response rates with AI video outreach' },
      { num: '60%', label: 'faster production vs traditional workflows' },
      { num: '10×', label: 'more content variants per campaign budget' },
      { num: '48h', label: 'AI campaign delivery available' },
    ],
    features: [
      { title: 'AI-Driven Editing & Post-Production', desc: 'Automated rough cuts, scene selection, and AI-powered colour grading that deliver broadcast-quality results in a fraction of the time — without sacrificing the human creative eye.' },
      { title: 'Script & Storyboard Generation', desc: 'We use large language models to rapidly generate, iterate, and stress-test scripts and creative concepts — then our team refines them into winning narratives.' },
      { title: 'Personalised Video at Scale', desc: 'Create hundreds of personalised video variants from a single master — customised by name, company, product, or offer. The future of outreach and retargeting.' },
      { title: 'AI Avatar Production', desc: 'Photorealistic AI presenters and brand spokespersons that speak in dozens of languages — without scheduling a shoot. Ideal for explainers, training, and international campaigns.' },
      { title: 'Generative B-Roll & Visual FX', desc: 'Stunning generative imagery and AI-created B-roll sequences that fill production gaps, extend scenes, and create visuals that cameras can\'t capture.' },
      { title: 'AI-Powered Campaign Analysis', desc: 'We run AI-driven performance analysis on your existing video content to identify what\'s working, what isn\'t, and where creative optimisation will have the highest ROI.' },
    ],
    process: [
      { n: '01', title: 'Brief & AI Strategy', desc: 'We map your campaign goals to the right AI tools and workflows. Not every project needs AI everywhere — we apply it strategically where it creates the most value.' },
      { n: '02', title: 'Human-Led Creative Development', desc: 'Our creative team develops the concept, script, and visual direction. AI accelerates ideation — but human judgement drives the strategy.' },
      { n: '03', title: 'AI-Augmented Production', desc: 'We combine traditional filming with AI-generated assets, avatars, and generative sequences. The best of both worlds in a single seamless workflow.' },
      { n: '04', title: 'Optimise & Scale', desc: 'Post-launch, we use AI analytics to identify top-performing variants and scale what works — turning one campaign into an always-on content engine.' },
    ],
    portfolio: [
      { youtube_id: '_fbHbplDCwo', title: 'Gen AI Video Production', client: 'Imba Production' },
      { youtube_id: 'EtBSTn9hKuY', title: 'AI Corporate Video', client: 'Tech Company' },
    ],
    faq: [
      { q: 'What AI tools do you use?', a: 'Our stack includes Runway Gen-3, OpenAI Sora, Stable Diffusion XL, ElevenLabs, HeyGen, Kling, and a range of proprietary automation workflows. We select the right tool for each specific brief.' },
      { q: 'Will AI video look cheap or fake?', a: 'Not with our approach. We always combine AI-generated assets with human direction, colour grading, and sound design. The output is indistinguishable from — and often surpasses — traditional production quality.' },
      { q: 'Can AI video really personalise at scale?', a: 'Yes. We can produce 500+ personalised video variants from a single shoot, customising name, company, offer, and more. Clients using personalised AI video see 2–3× higher response rates in outreach campaigns.' },
      { q: 'Is AI video cheaper than traditional production?', a: 'For the volume of content produced, yes — significantly. A traditional campaign producing 10 assets might cost the same as an AI-augmented campaign producing 100+. We\'ll show you the comparison in your quote.' },
    ],
  },

  {
    slug: 'product-video',
    key: 'product',
    icon: '▣',
    label: 'Product & Ecommerce Video',
    tagline: 'Videos that convert browsers into buyers',
    color: '#6C7AE0',
    heroDesc: 'Product videos are the single highest-ROI content investment for ecommerce brands. We produce conversion-focused product content built to stop the scroll, communicate value instantly, and drive purchases on Amazon, Shopify, and across social platforms — combining technical expertise with genuine commercial understanding.',
    stats: [
      { num: '80%', label: 'increase in conversions with product video' },
      { num: '2/3', label: 'of shoppers say video influenced a purchase' },
      { num: '3.5×', label: 'sales lift for Amazon listings with video' },
      { num: '12M+', label: 'views on client product content' },
    ],
    features: [
      { title: 'Product Demonstration Videos', desc: 'Clear, compelling demos that show exactly how your product works, solves a problem, or improves a life. Built to eliminate purchase hesitation and answer buyer objections before they arise.' },
      { title: 'Amazon & Marketplace Listing Videos', desc: 'Optimised for Amazon A+ content, Etsy, and other marketplaces — the right aspect ratios, pacing, and messaging to maximise click-through and conversion on your listings.' },
      { title: 'eCommerce Ad Spots (15s / 30s)', desc: 'Short, punchy paid social ads designed for Meta, TikTok, and YouTube — with multiple aspect ratio cutdowns and variant testing built into the production package.' },
      { title: 'Unboxing & Reveal Videos', desc: 'The unboxing experience is as important as the product itself. We produce premium unboxing content that drives social sharing, influencer seeding, and repeat purchases.' },
      { title: 'Shopify & DTC Brand Videos', desc: 'Homepage hero videos, collection page features, and full-funnel video content built for direct-to-consumer brands that want to lead with story before the sale.' },
      { title: 'Customer Testimonial Integration', desc: 'Real customers, professionally filmed — woven into your product pages for maximum social proof. We handle pre-interview prep, filming, and strategic integration across your site.' },
    ],
    process: [
      { n: '01', title: 'Product Deep-Dive', desc: 'We study your product, your customer, and your competitive landscape. What objections does the buyer have? What emotion should the video trigger? What\'s the one thing it must communicate?' },
      { n: '02', title: 'Creative Concept & Shot List', desc: 'Concept approval, props sourcing, product preparation, and a detailed shot list. We plan every angle, hero shot, and lifestyle moment before production day.' },
      { n: '03', title: 'Studio or On-Location Shoot', desc: 'Professional product photography lighting, macro lenses, food-safe equipment for consumables, and a full crew. Or on-location if lifestyle context is key to the brief.' },
      { n: '04', title: 'Edit, Cutdowns & Delivery', desc: 'Full master edit plus all social cutdowns (9:16, 1:1, 16:9) in every format you need. Platform-optimised for max performance wherever your audience lives.' },
    ],
    portfolio: [
      { youtube_id: 'PHxMQ6FSiks', title: 'Food Social Media Ad', client: 'Food Brand' },
      { youtube_id: '9k5w1iG_JHM', title: 'Cooking Video Reel #3', client: 'Food Platform' },
      { youtube_id: 'PhjpiJ5jcBo', title: 'Natural Soap Social Ad', client: 'Kozica Soaps' },
    ],
    faq: [
      { q: 'Do you shoot in-studio or on location?', a: 'Both. We have a full studio setup for product-only shoots, and we regularly shoot on location for lifestyle and context-driven content. Many projects combine both.' },
      { q: 'What formats and aspect ratios do you deliver?', a: 'Every project includes the master format plus all required cutdowns — 16:9 for YouTube and websites, 1:1 for feed posts, 9:16 for Stories, Reels, and TikTok. We deliver in H.264 and ProRes.' },
      { q: 'Can you handle food and beverage products?', a: 'Yes — our team has specialist expertise in cooking and food video production. We understand food styling, food-safe equipment, and how to make food look irresistible on camera.' },
      { q: 'How many product SKUs can you film per day?', a: 'Typically 5–15 SKUs per shoot day depending on complexity. We\'ll plan the production schedule in detail during pre-production to maximise efficiency and output.' },
    ],
  },

  {
    slug: 'social-video',
    key: 'social',
    icon: '◉',
    label: 'Short & Social Video',
    tagline: 'Native to every algorithm, built to perform',
    color: '#3CBFAE',
    heroDesc: 'TikTok, Instagram Reels, and YouTube Shorts aren\'t just platforms — they\'re entire economies. We produce natively-crafted short-form content with the storytelling, pacing, and visual language that algorithms reward and audiences love. No repurposed landscape video. Content built from the ground up for vertical, social-first distribution.',
    stats: [
      { num: '2B+', label: 'monthly YouTube users reachable' },
      { num: '1B+', label: 'monthly active TikTok users' },
      { num: '2×', label: 'higher engagement vs. horizontal content' },
      { num: '92%', label: 'of mobile video watched without sound — we design for that' },
    ],
    features: [
      { title: 'TikTok Brand & Product Videos', desc: 'Native-feeling TikTok content with trending formats, authentic energy, and strategic hooks in the first 2 seconds — built for both organic reach and paid amplification.' },
      { title: 'Instagram Reels & Stories', desc: 'Visually stunning Reels optimised for the Instagram algorithm, plus Story sequences designed for swipe-through engagement and link taps that drive DMs and website visits.' },
      { title: 'YouTube Shorts', desc: 'Short-form YouTube content that converts subscribers and feeds your long-form funnel — optimised for the Shorts feed algorithm and cross-promotion with your main channel.' },
      { title: 'Promotional Teasers & Ad Spots', desc: '6–30 second paid social spots built for Meta, TikTok, and YouTube Ads — with multiple creative variants for A/B testing and audience-specific messaging.' },
      { title: 'Trending Sound & Format Integration', desc: 'We monitor platform trends in real time and integrate proven formats, sounds, and creative hooks into your branded content without sacrificing brand identity.' },
      { title: 'Content Series Production', desc: 'Monthly or weekly content series — consistent, high-quality short-form content delivered on a production retainer so your brand stays present and growing on every platform.' },
    ],
    process: [
      { n: '01', title: 'Platform & Audience Strategy', desc: 'Which platforms, which formats, which content types for your specific audience and goals. We build a content strategy before we produce a single frame.' },
      { n: '02', title: 'Creative Concepts & Scripts', desc: 'Multiple creative concepts developed around proven short-form formats — hook, body, CTA. We write scripts designed for the platform\'s native viewer behaviour.' },
      { n: '03', title: 'Shoot & Edit (Vertical-First)', desc: 'Every shoot is framed, lit, and directed for vertical output. Quick-cut editing, on-screen text, and sound design built for the scroll-first viewer.' },
      { n: '04', title: 'Format Delivery & Scheduling', desc: 'All platform-optimised exports plus optional content calendar and scheduling support. We can produce enough to keep you consistently active for weeks or months.' },
    ],
    portfolio: [
      { youtube_id: 'PhjpiJ5jcBo', title: 'Natural Soap Social Ad', client: 'Kozica Soaps' },
      { youtube_id: 'PHxMQ6FSiks', title: 'Food Social Media Ad', client: 'Food Brand' },
    ],
    faq: [
      { q: 'Do you produce vertical (9:16) content natively?', a: 'Yes — all our social content is shot and edited vertical-first. We don\'t repurpose landscape footage. Everything is framed, lit, and edited specifically for 9:16 output.' },
      { q: 'How many videos are in a typical package?', a: 'Packages range from 3–5 videos for a campaign to 8–20 for a monthly retainer. We\'ll recommend the right volume for your goals and budget in your free quote.' },
      { q: 'Can you handle the whole strategy or just production?', a: 'Both. We offer production-only services if you have an in-house strategy team, or full-service including content strategy, scripting, production, and performance reporting.' },
      { q: 'Do you post and manage the content for us?', a: 'Production and delivery is our core service. We can also provide scheduling support and content calendars, and we work closely with social media managers and agencies.' },
    ],
  },

  {
    slug: 'cooking-video',
    key: 'cooking',
    icon: '◎',
    label: 'Cooking & Food Video',
    tagline: 'Culinary cinematography that makes food sell itself',
    color: '#E87A2A',
    heroDesc: 'Food video is one of the most powerful content formats on earth — and the most technically demanding to get right. We are specialist food and cooking video producers, blending technical filmmaking expertise with genuine culinary passion. From step-by-step recipe tutorials to high-end restaurant campaign films, we make food utterly irresistible on screen.',
    stats: [
      { num: '12M+', label: 'views on client cooking content' },
      { num: '50%', label: 'higher purchase intent from food video' },
      { num: '12+', label: 'years of specialist food production' },
      { num: '500+', label: 'cooking videos delivered' },
    ],
    features: [
      { title: 'Recipe & Tutorial Videos', desc: 'Step-by-step cooking videos from quick social clips to long-form YouTube tutorials — styled, lit, and shot to make every dish look achievable and utterly delicious.' },
      { title: 'Restaurant & Brand Promo Films', desc: 'Atmospheric restaurant films and brand campaigns that capture the essence of your food, your space, and your story. The kind of content that fills tables and drives bookings.' },
      { title: 'Social Media Food Content (TikTok / Reels)', desc: 'Viral-format cooking content natively built for TikTok, Instagram Reels, and YouTube Shorts — with the pacing, hooks, and visual energy that food content demands.' },
      { title: 'eCommerce Food Product Videos', desc: 'Conversion-focused videos for food brands selling on Amazon, Shopify, or direct — communicating taste, texture, quality, and key selling points in 30 seconds or less.' },
      { title: 'Food Styling & Preparation', desc: 'We handle all food styling, preparation, and ingredient sourcing for our shoots. No need to bring your own food stylist — our team knows how to make every dish camera-ready.' },
      { title: 'Culinary Brand Identity Films', desc: 'Long-form brand films for restaurants, food brands, and culinary entrepreneurs — the kind of content that goes on your homepage, wins press coverage, and defines your brand for years.' },
    ],
    process: [
      { n: '01', title: 'Recipe & Brief Development', desc: 'We review the dishes, the brand story, and the platform destinations. We plan every shot, every prop, every hero moment — and we source ingredients and props before shoot day.' },
      { n: '02', title: 'Food Styling & Prep', desc: 'Our team preps and styles the food to look its absolute best on camera. We use food-safe lighting, hero dish preparation, and multiple batch cooking to get every shot perfect.' },
      { n: '03', title: 'Cinematic Food Production', desc: 'Macro lenses, motion sliders, precise lighting rigs, and overhead rigs for top-down shots. We bring every technique needed to capture food at its most irresistible.' },
      { n: '04', title: 'Edit, Grade & Deliver', desc: 'Warm colour grading that makes food look rich, fresh, and appetising. Cut to the right pace for each platform, with music licensed to match the culinary mood.' },
    ],
    portfolio: [
      { youtube_id: 'cBJoEGPMHoE', title: 'Cooking Video Reel #1', client: 'Culinary Brand' },
      { youtube_id: 'rzfWrv3ERxk', title: 'French Fries — Cooking Video', client: 'Restaurant Brand' },
      { youtube_id: 'SOt1I5u0yvE', title: 'Sandwiches with Hummus', client: 'Food Creator' },
      { youtube_id: 'jBPNnr-j0c8', title: 'Pumpkin Soup in a Wooden Bowl', client: 'Culinary Brand' },
    ],
    shorts: [
      { youtube_id: 'rzfWrv3ERxk', title: 'French Fries Short' },
      { youtube_id: 'SOt1I5u0yvE', title: 'Hummus & Sandwiches' },
      { youtube_id: 'jBPNnr-j0c8', title: 'Pumpkin Soup Reel' },
      { youtube_id: 'cBJoEGPMHoE', title: 'Cooking Reel' },
    ],
    faq: [
      { q: 'Do you handle food styling and ingredient sourcing?', a: 'Yes — food styling, prep, and ingredient sourcing are all included in our food video packages. You don\'t need to hire a separate food stylist. Our team has years of specialist experience.' },
      { q: 'What equipment do you use for food video?', a: 'We use professional cameras with macro lens rigs, motorised sliders, overhead camera arms, Dedolight and LED panel lighting setups, and specialised food photography lighting techniques.' },
      { q: 'Can you produce cooking content for multiple dishes in one shoot day?', a: 'Yes — we typically produce 3–8 dishes per full shoot day depending on complexity. We plan the shoot schedule to maximise output without sacrificing quality for any single dish.' },
      { q: 'Do you produce for YouTube long-form as well as short social clips?', a: 'Absolutely — we produce everything from 60-second social clips to 10–15 minute YouTube tutorial formats. Many clients get both from the same shoot day, maximising value.' },
    ],
  },

  {
    slug: 'post-production',
    key: 'post',
    icon: '◫',
    label: 'Post Production',
    tagline: 'Where raw footage becomes a masterpiece',
    color: '#6C7AE0',
    heroDesc: 'You shoot it — we transform it. Our in-house post-production studio provides full-service editing, colour grading, motion graphics, sound design, and VFX for clients worldwide. We work with footage shot by any team, on any camera, in any format. Send us your files and we\'ll send back broadcast-quality content that performs.',
    stats: [
      { num: '500+', label: 'projects delivered' },
      { num: '48h', label: 'turnaround available for editing' },
      { num: '4K', label: 'and 8K native delivery capability' },
      { num: '100%', label: 'in-house — no outsourcing' },
    ],
    features: [
      { title: 'Advanced Editing & Assembly', desc: 'From rough assembly to precision multi-track editing — we understand pacing, narrative structure, and emotional arc. Every cut is intentional. Nothing stays that doesn\'t serve the story.' },
      { title: 'Expert Colour Grading & HDR', desc: 'Professional colour grading in DaVinci Resolve — from natural correction to bold cinematic looks. We deliver in Rec.709, Rec.2020 HDR, and P3 DCI depending on your distribution needs.' },
      { title: 'Motion Graphics & 3D Animation', desc: 'Logo animations, lower thirds, kinetic typography, infographic sequences, and full 3D motion work — all created in-house in Adobe After Effects and Cinema 4D.' },
      { title: 'Sound Design & Music Licensing', desc: 'Full sound design, dialogue cleanup, ambient soundscapes, and Foley where needed. We also handle music licensing from Artlist, Musicbed, and custom composer briefs.' },
      { title: 'VFX & Compositing', desc: 'Green screen compositing, object removal, sky replacement, creature effects, and practical-effect enhancement — handled in-house by our VFX team.' },
      { title: 'Platform-Optimised Export & Delivery', desc: 'Every deliverable exported to exact platform specs — YouTube, Vimeo, broadcast, TikTok, Instagram, Facebook. Multiple aspect ratios and file formats included as standard.' },
    ],
    process: [
      { n: '01', title: 'Footage Review & Sync', desc: 'We review all incoming footage, sync multi-cam and audio sources, organise the project, and create a clear edit plan based on your brief and any existing selects.' },
      { n: '02', title: 'Rough Cut & Story Assembly', desc: 'A complete rough cut assembled to time and story — sent for your review and notes before we move into fine cut. Full collaboration at every stage.' },
      { n: '03', title: 'Fine Cut, Grade & Sound', desc: 'Picture lock, then colour grade, motion graphics, sound design, and music — all completed to broadcast standard before the final export stage.' },
      { n: '04', title: 'QC, Revisions & Delivery', desc: 'Full technical QC on every deliverable. Revisions included. Final delivery via our secure client portal, Dropbox, Vimeo review links, or direct transfer to your platform.' },
    ],
    portfolio: [
      { youtube_id: '_eCIYm1_Hpo', title: 'Creature Transformation VFX', client: 'Creative Project' },
      { youtube_id: 'EZUJiL9MeLw', title: 'Virus House Teaser', client: 'Film Project' },
    ],
    faq: [
      { q: 'Can you edit footage that was shot by someone else or a different crew?', a: 'Absolutely — this is a significant part of our post-production work. Send us your raw files and a brief, and we\'ll deliver broadcast-quality edited content regardless of who shot it.' },
      { q: 'What editing software do you use?', a: 'DaVinci Resolve Studio for editing and colour grading, Adobe Premiere Pro for complex multi-cam projects, After Effects for motion graphics, Cinema 4D for 3D, and a full Avid suite for broadcast deliverables.' },
      { q: 'How does the revision process work?', a: 'All projects include structured revision rounds — typically two rounds of revisions on the rough cut and one on the fine cut. Additional rounds can be added to any project for a small fee.' },
      { q: 'Do you offer ongoing post-production retainers?', a: 'Yes — monthly retainers are available for brands and agencies that have a regular volume of content to edit. Retainer clients receive priority turnaround and discounted rates.' },
    ],
  },

  {
    slug: 'elearning-video',
    key: 'elearning',
    icon: '◰',
    label: 'eLearning & Corporate Training Video',
    tagline: 'Education that actually engages and sticks',
    color: '#C9A96E',
    heroDesc: 'Text-based training has an average retention rate of 10%. Video-based learning achieves 95%. We produce professional eLearning and corporate training video content for MOOCs, LMS platforms, and internal training programmes — handling scripting, filming, animation, and SCORM-ready delivery so your learners actually learn.',
    stats: [
      { num: '95%', label: 'knowledge retention with video vs. 10% text' },
      { num: '80%', label: 'of companies now require video training' },
      { num: '72%', label: 'of employees prefer learning via video' },
      { num: '40%', label: 'reduction in training time with video' },
    ],
    features: [
      { title: 'Lecture & Tutorial Videos', desc: 'Professional presenter-to-camera content with studio lighting, broadcast audio, and teleprompter support — the quality learners expect from premium educational platforms.' },
      { title: 'Screen-Recorded Walkthroughs', desc: 'Software demos, process walkthroughs, and technical tutorials with professional screen capture, annotation overlays, and expert voiceover narration.' },
      { title: 'Animated Explainers & Infographics', desc: 'Complex concepts made clear through 2D and 3D animation, kinetic typography, and infographic sequences — fully branded to your organisation\'s identity.' },
      { title: 'Corporate Onboarding & Compliance', desc: 'Onboarding programmes, HR policy training, compliance modules, and safety briefings — produced to the exact standard your legal and HR teams require.' },
      { title: 'SCORM-Ready LMS Integration', desc: 'All content delivered SCORM 1.2 and 2004 compliant, with xAPI support. We test compatibility with Moodle, TalentLMS, Cornerstone, Docebo, and all major LMS platforms.' },
      { title: 'Interactive Video Modules', desc: 'Branching scenarios, knowledge check overlays, clickable hotspots, and interactive decision trees — turning passive viewers into active learners.' },
    ],
    process: [
      { n: '01', title: 'Learning Needs Analysis', desc: 'What do learners need to know, do, or believe after completing this module? We align every creative decision to your specific learning outcomes and organisational goals.' },
      { n: '02', title: 'Script & Storyboard Development', desc: 'Full script writing or editing, storyboard development, and learning design review. All scripts go through our instructional design checklist before production begins.' },
      { n: '03', title: 'Production & Animation', desc: 'Presenter filming, screen recording, and animation produced in parallel for maximum efficiency. Professional voiceover sourcing and recording if required.' },
      { n: '04', title: 'LMS Packaging & QA', desc: 'Full SCORM packaging, LMS compatibility testing, and technical QA. Delivered as a complete, working module you can upload directly to your platform.' },
    ],
    portfolio: [
      { youtube_id: 'EtBSTn9hKuY', title: 'AI Corporate Video', client: 'Tech Company' },
    ],
    faq: [
      { q: 'Do you handle SCORM packaging and LMS integration?', a: 'Yes — SCORM 1.2 and 2004 packaging is included in all eLearning projects. We test on all major LMS platforms and provide technical support for the upload and configuration process.' },
      { q: 'Can you write the script and develop the course content?', a: 'Yes — full instructional design and script writing is available. We work from your existing content (slides, PDFs, SME interviews) or from scratch if you\'re building a new course.' },
      { q: 'Do you provide voiceover artists?', a: 'We source and direct professional voiceover artists in any language and accent. We have an existing roster of VO talent we trust, or we can audition new voices to your spec.' },
      { q: 'How do you handle updates to existing courses?', a: 'We offer course maintenance retainers and on-demand update packages. Content you produce with us remains yours — we keep project files available for update work indefinitely.' },
    ],
  },

  {
    slug: 'fashion-video',
    key: 'fashion',
    icon: '◇',
    label: 'Fashion & Lifestyle Video',
    tagline: 'Style that moves — fashion film for brands that lead',
    color: '#FF5A3D',
    heroDesc: 'Fashion is the most visual industry in the world — and video is the medium that does it justice. We produce fashion films, lookbooks, and lifestyle content for brands, designers, and creative directors who refuse to compromise on quality. Cinematic framing, intentional styling, and storytelling that captures not just the clothes, but the world they inhabit.',
    stats: [
      { num: '4×', label: 'higher purchase intent from fashion video' },
      { num: '2×', label: 'faster social following growth with video content' },
      { num: '78%', label: 'of luxury buyers research via video before purchase' },
      { num: '48h', label: 'social content turnaround available' },
    ],
    features: [
      { title: 'Lookbook & Collection Films', desc: 'Cinematic seasonal lookbooks and collection launch films — the kind of content that establishes your brand as a leader and gets picked up by fashion press and publications.' },
      { title: 'Product Demonstration & Detail Shots', desc: 'Close-up product films that showcase fabric, texture, movement, and construction — the details that convert fashion browsers into committed buyers.' },
      { title: 'Social Media Fashion Content', desc: 'Platform-native fashion content for TikTok, Instagram Reels, and Pinterest — styled for the scroll, built for engagement, optimised for algorithmic reach.' },
      { title: 'Brand Story & Campaign Videos', desc: 'Full-length brand films that communicate your aesthetic, values, and vision — the foundational content that defines your brand\'s visual identity for seasons to come.' },
      { title: 'Model Direction & Casting', desc: 'We handle model casting (working with established agencies and independent talent), wardrobe direction, and on-set styling — or collaborate with your existing team.' },
      { title: 'International & Location Production', desc: 'We produce fashion content globally — bringing a full crew to your location or scouting and securing locations that match your aesthetic vision wherever in the world you need us.' },
    ],
    process: [
      { n: '01', title: 'Creative Direction & Mood Board', desc: 'We develop a detailed mood board, colour palette, and shot list that defines the visual language of your campaign — aligned to your brand DNA and seasonal direction.' },
      { n: '02', title: 'Casting & Pre-Production', desc: 'Model casting, location scouting or studio booking, wardrobe prep, hair and makeup sourcing, and prop curation. Every detail confirmed before shoot day.' },
      { n: '03', title: 'Fashion Film Production', desc: 'Full crew shoot with cinema-grade cameras, professional lighting, and an experienced fashion director. We move fast without ever compromising the shot.' },
      { n: '04', title: 'Edit, Grade & Deliver', desc: 'Colour grading that matches your brand aesthetic, music selection from premium libraries, and delivery in every format — from website hero to social stories.' },
    ],
    portfolio: [
      { youtube_id: 'HAHj0TDQZcg', title: 'A Steampunk Princess', client: 'Creative Direction' },
      { youtube_id: 'SgHHbWp64cE', title: 'Perfume Brand Film', client: 'Fragrance Brand' },
    ],
    faq: [
      { q: 'Do you work with your own models or ours?', a: 'Both. We have established relationships with model agencies and independent talent in multiple markets. We can also direct your existing brand ambassadors or influencer partners.' },
      { q: 'Can you shoot fashion content internationally?', a: 'Yes — we produce globally. We\'ve shot in Serbia, across Europe, and in destination locations. We bring our core creative team and source local crew and support where needed.' },
      { q: 'What camera systems do you use for fashion production?', a: 'We shoot on ARRI Alexa, RED DSMC2, and Sony FX9 depending on the brief. All systems deliver the shallow depth of field and skin tone accuracy that fashion production demands.' },
      { q: 'Do you handle hair and makeup for fashion shoots?', a: 'We can source and coordinate H&MU artists as part of the full-service production package, or work with your existing H&MU team. We\'ll confirm the best approach for your budget.' },
    ],
  },

  {
    slug: 'testimonial-video',
    key: 'testimonial',
    icon: '◐',
    label: 'Testimonial & Case Study Video',
    tagline: 'Social proof that converts — at every stage of the funnel',
    color: '#C9A96E',
    heroDesc: 'Ninety-two percent of buyers trust peer recommendations over brand advertising. Testimonial videos are the highest-trust content you can produce — and the most consistently underinvested. We produce authentic, professionally filmed testimonial and case study videos that build credibility, handle objections, and turn hesitant prospects into confident buyers.',
    stats: [
      { num: '92%', label: 'of buyers trust peer recommendations' },
      { num: '34%', label: 'increase in conversions with testimonial video' },
      { num: '5×', label: 'more effective than brand ads at building trust' },
      { num: '2/3', label: 'of buyers are influenced by testimonial content' },
    ],
    features: [
      { title: 'Customer Testimonial Films', desc: 'Authentic, professionally filmed testimonials that capture real customer emotion and specific, credible results — not scripted corporate speak. The kind of social proof that actually works.' },
      { title: 'Case Study Videos', desc: 'Full before-and-after case study films showing the problem, the solution, and the measurable results — your strongest sales tool for high-consideration and B2B purchasing decisions.' },
      { title: 'Short-Form Social Testimonials', desc: 'Testimonial snippets cut for TikTok, Instagram, and LinkedIn — designed to stop the scroll with a compelling hook and deliver social proof in under 60 seconds.' },
      { title: 'Pre-Interview Prep & Scripting', desc: 'We handle full pre-interview preparation with your customers — briefing them on key messages, helping them articulate their experience, and building their confidence before the camera rolls.' },
      { title: 'Remote & Hybrid Filming Options', desc: 'Professional testimonials don\'t require your customer to travel. We produce high-quality remote testimonials using directed self-filming kits or partnered local crews worldwide.' },
      { title: 'Strategic Placement & Distribution', desc: 'We advise on where and how to deploy your testimonial content across the funnel — landing pages, email sequences, paid social, sales decks, and proposals.' },
    ],
    process: [
      { n: '01', title: 'Customer Selection & Brief', desc: 'We help you identify the best customer advocates for each use case — the right industry, the right results, the right story to convert your target buyer.' },
      { n: '02', title: 'Pre-Interview Prep', desc: 'We brief and prepare your customer contacts before filming — helping them articulate their genuine experience confidently and naturally on camera, without anything feeling scripted.' },
      { n: '03', title: 'Professional Filming', desc: 'On-location at your customer\'s premises, in our studio, or via our high-quality remote filming kit. Professional lighting, broadcast audio, and experienced direction.' },
      { n: '04', title: 'Edit, Cutdowns & Deployment', desc: 'A master testimonial film plus all social cutdowns — with strategic advice on placement across your website, paid campaigns, and sales process for maximum conversion impact.' },
    ],
    portfolio: [
      { youtube_id: 'LqPEeYQUaeQ', title: 'Irving Scott — Book Trailer', client: 'Irving Books' },
      { youtube_id: 'PhjpiJ5jcBo', title: 'Natural Soap Social Ad', client: 'Kozica Soaps' },
    ],
    faq: [
      { q: 'What if our customers are camera shy?', a: 'This is the most common concern — and our pre-production process is specifically designed to address it. We brief, prepare, and coach customers before the camera rolls. The result is authentic, confident testimonials every time.' },
      { q: 'Can you film testimonials at our customers\' locations?', a: 'Yes — we travel to your customer\'s office, factory, home, or retail location. Filming in the customer\'s own environment adds authenticity and context that studio filming can\'t replicate.' },
      { q: 'Do you offer remote testimonial filming?', a: 'Yes — we produce high-quality remote testimonials using professionally directed self-filming kits we send to your customers, or by coordinating with local filming partners in their city.' },
      { q: 'How do we get the most out of our testimonial content?', a: 'We provide a distribution strategy with every testimonial project — where to place each piece, how to use clips in paid ads, how to integrate into your sales process, and how to test performance.' },
    ],
  },
]

export function getServiceBySlug(slug: string): ServiceData | undefined {
  return SERVICES_DATA.find(s => s.slug === slug)
}
