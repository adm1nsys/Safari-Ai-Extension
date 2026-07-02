// Content script for YouTube Better.
// Applies settings stored in browser.storage.local: a custom country-code
// label with an optional "Premium" suffix, ad removal, a recolored logo
// (solid, gradient with optional spin, or fully custom SVG fill), restored
// dislike counts, a custom search box placeholder, and a glassmorphism
// header redesign.

const DEFAULTS = {
  premiumEnabled: false,
  regionCode: '',

  colorMode: 'solid',
  solidColor: '#ff0033',
  gradientColor1: '#ff0033',
  gradientColor2: '#ff7a00',
  gradientAngle: 135,
  gradientAnimate: false,
  gradientSpeed: 3,
  customFill: '',
  customSvgCode: '',

  dislikesEnabled: false,

  searchPlaceholder: '',

  headerGlassEnabled: false,
  headerBlur: 12,
  headerColorLight: '#ffffff',
  headerColorDark: '#0f0f0f',
  headerOpacity: 0.6,
  headerMargin: 10,
  headerRadius: 16,
};

const HIDDEN_DEFS_ID = 'byt-hidden-defs';
const GRADIENT_ID = 'byt-logo-gradient';
const CUSTOM_DEFS_ID = 'byt-custom-defs';
const LOGO_STYLE_ID = 'byt-logo-style';
const LOGO_DEFAULT_FILL = '#ff0033';
const PREMIUM_ADBLOCK_STYLE_ID = 'byt-premium-adblock-style';
const HEADER_STYLE_ID = 'byt-header-style';
const VOTE_FIX_STYLE_ID = 'byt-vote-fix-style';

const AD_SELECTORS = [
  '.video-ads',
  '.ytp-ad-module',
  '.ytp-ad-overlay-container',
  '.ytp-ad-image-overlay',
  'ytd-ad-slot-renderer',
  'ytd-in-feed-ad-layout-renderer',
  'ytd-display-ad-renderer',
  'ytd-promoted-sparkles-web-renderer',
  'ytd-promoted-video-renderer',
  'ytd-companion-slot-renderer',
  'ytd-banner-promo-renderer',
  'ytd-statement-banner-renderer',
  '#masthead-ad',
  'ytd-ads-engagement-panel-content-renderer',
  '[panel-target-id="engagement-panel-ads"]',
  'panel-ad-header-image-lockup-view-model',
].join(', ');

const SEARCH_INPUT_SELECTOR = 'input.ytSearchboxComponentInput, input[name="search_query"]';
const SEARCH_SURFACE_SELECTOR = [
  '.ytSearchboxComponentInputBox',
  '.ytSearchboxComponentInputBoxDark',
  '.ytSearchboxComponentSearchButton',
  '.ytSearchboxComponentSearchButtonDark',
].join(', ');

const GLASS_EXTRA_SELECTOR = [
  '.ytPlayerQuickActionButtonsHost.ytPlayerQuickActionButtonsHostCompactControls.ytPlayerQuickActionButtonsHostDisableBackdropFilter',
  '.ytp-fullscreen-grid-expand-button.ytp-button',
  '.ytp-chapter-title.ytp-button',
  '.ytp-time-wrapper.ytp-time-wrapper-delhi',
  '.ytp-volume-area',
  '.ytp-play-button.ytp-button',
  '.ytp-delhi-modern .ytp-chrome-controls .ytp-right-controls',
].join(', ');

const DISLIKE_BUTTON_SELECTORS = [
  'button[aria-label*="dislike" i]',
  'dislike-button-view-model button',
  '#segmented-dislike-button button',
];

const LIKE_BUTTON_SELECTORS = [
  'like-button-view-model button',
  'button[aria-label^="like this video" i]',
];

const RATIO_BAR_CONTAINER_SELECTORS = [
  // Real <div> wrapper elements, not the custom view-model tags themselves —
  // those can default to inline/contents layout, which breaks the
  // position:relative + absolute-child trick used to draw the bar.
  '.ytSegmentedLikeDislikeButtonViewModelSegmentedButtonsWrapper',
  '.ytp-fullscreen-quick-actions',
];
const RATIO_BAR_CLASS = 'byt-like-ratio-bar';
const RATIO_LIKE_COLOR = '#3ea6ff';
const RATIO_DISLIKE_COLOR = 'rgba(255, 255, 255, 0.25)';

const STATS_PANEL_ID = 'byt-video-stats-panel';
const STATS_PANEL_CONTAINER_SELECTOR = '#related';

let settings = { ...DEFAULTS };
let lastCustomSvgCode = null;

function num(value, fallback) {
  return Number.isFinite(value) ? value : fallback;
}

function hexToRgba(hex, alpha) {
  const clean = (hex || '').replace('#', '');
  const full = clean.length === 3 ? clean.split('').map((c) => c + c).join('') : clean;
  const parsed = parseInt(full, 16);
  const r = (parsed >> 16) & 255;
  const g = (parsed >> 8) & 255;
  const b = parsed & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function ensureHiddenSvgDefs() {
  let defs = document.getElementById(HIDDEN_DEFS_ID);
  if (defs) return defs;
  const svgNS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(svgNS, 'svg');
  // A 0x0 SVG has no real viewport, and WebKit stops ticking SMIL animations
  // (animateTransform) inside SVGs it doesn't consider rendered. Give it a
  // real 1x1 box and hide it with opacity instead, so it keeps animating.
  svg.setAttribute('width', '1');
  svg.setAttribute('height', '1');
  svg.style.position = 'fixed';
  svg.style.top = '0';
  svg.style.left = '0';
  svg.style.opacity = '0';
  svg.style.pointerEvents = 'none';
  defs = document.createElementNS(svgNS, 'defs');
  defs.id = HIDDEN_DEFS_ID;
  svg.append(defs);
  document.documentElement.append(svg);
  return defs;
}

let spinAngle = 0;
let spinTimerId = null;
let lastSpinConfigKey = null;

function stepSpin() {
  spinAngle = (spinAngle + 1) % 360;
  const gradient = document.getElementById(GRADIENT_ID);
  if (gradient) gradient.setAttribute('gradientTransform', `rotate(${spinAngle} 0.5 0.5)`);
}

// SMIL (<animateTransform>) turned out not to tick reliably here, so the
// spin is just a plain timer that adds 1 degree and wraps past 360 — exactly
// as asked, mapped onto the existing "speed" setting (seconds per full turn).
function ensureSpinLoop() {
  const shouldSpin = settings.gradientAnimate && settings.colorMode === 'gradient';
  const speedSeconds = num(settings.gradientSpeed, DEFAULTS.gradientSpeed) || DEFAULTS.gradientSpeed;
  const key = shouldSpin ? `on:${speedSeconds}` : 'off';
  if (key === lastSpinConfigKey) return;
  lastSpinConfigKey = key;

  if (spinTimerId != null) {
    clearInterval(spinTimerId);
    spinTimerId = null;
  }
  if (shouldSpin) {
    const intervalMs = Math.max(16, (speedSeconds * 1000) / 360);
    spinTimerId = setInterval(stepSpin, intervalMs);
  }
}

function ensureGradientDef() {
  const defs = ensureHiddenSvgDefs();
  const svgNS = 'http://www.w3.org/2000/svg';
  let gradient = document.getElementById(GRADIENT_ID);
  if (!gradient) {
    gradient = document.createElementNS(svgNS, 'linearGradient');
    gradient.id = GRADIENT_ID;
    gradient.setAttribute('x1', '0%');
    gradient.setAttribute('y1', '0%');
    gradient.setAttribute('x2', '100%');
    gradient.setAttribute('y2', '0%');
    const stop1 = document.createElementNS(svgNS, 'stop');
    stop1.id = `${GRADIENT_ID}-stop1`;
    stop1.setAttribute('offset', '0%');
    const stop2 = document.createElementNS(svgNS, 'stop');
    stop2.id = `${GRADIENT_ID}-stop2`;
    stop2.setAttribute('offset', '100%');
    gradient.append(stop1, stop2);
    defs.append(gradient);
  }

  document.getElementById(`${GRADIENT_ID}-stop1`).setAttribute('stop-color', settings.gradientColor1);
  document.getElementById(`${GRADIENT_ID}-stop2`).setAttribute('stop-color', settings.gradientColor2);

  ensureSpinLoop();
  if (!settings.gradientAnimate) {
    gradient.setAttribute('gradientTransform', `rotate(${num(settings.gradientAngle, 0)} 0.5 0.5)`);
  }
}

function ensureCustomDefs() {
  const defs = ensureHiddenSvgDefs();
  let container = document.getElementById(CUSTOM_DEFS_ID);
  if (!container) {
    container = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    container.id = CUSTOM_DEFS_ID;
    defs.append(container);
  }
  if (settings.customSvgCode !== lastCustomSvgCode) {
    lastCustomSvgCode = settings.customSvgCode;
    try {
      container.innerHTML = settings.customSvgCode;
    } catch (error) {
      console.error('YouTube Better: invalid custom SVG code: ' + error);
    }
  }
}

function applyLogoColor() {
  let style = document.getElementById(LOGO_STYLE_ID);
  if (!style) {
    style = document.createElement('style');
    style.id = LOGO_STYLE_ID;
    document.documentElement.append(style);
  }

  let fill;
  if (settings.colorMode === 'gradient') {
    ensureGradientDef();
    fill = `url(#${GRADIENT_ID})`;
  } else if (settings.colorMode === 'custom') {
    ensureCustomDefs();
    fill = settings.customFill || LOGO_DEFAULT_FILL;
  } else {
    fill = settings.solidColor || LOGO_DEFAULT_FILL;
  }

  // A plain CSS rule beats YouTube's own presentation "fill" attribute and
  // keeps applying automatically whenever the logo re-renders, so this
  // doesn't need to be re-run from the mutation observer.
  style.textContent = `
    svg[id^="yt-ringo2-svg"] g:first-of-type path:first-child {
      fill: ${fill} !important;
    }
  `;
}

function applyRegionAndPremium() {
  const active = Boolean(settings.regionCode) || settings.premiumEnabled;
  document.querySelectorAll('#country-code').forEach((el) => {
    if (!active) {
      if (el.dataset.bytBase !== undefined) {
        el.textContent = el.dataset.bytBase;
        delete el.dataset.bytBase;
      }
      return;
    }

    if (el.dataset.bytBase === undefined) {
      el.dataset.bytBase = el.textContent.trim();
    }
    const base = settings.regionCode || el.dataset.bytBase;
    const text = settings.premiumEnabled ? `${base} Premium` : base;
    if (el.textContent.trim() !== text) {
      el.textContent = text;
    }
  });
}

function applyPremiumAdBlockCss() {
  const existing = document.getElementById(PREMIUM_ADBLOCK_STYLE_ID);
  if (settings.premiumEnabled) {
    if (!existing) {
      const style = document.createElement('style');
      style.id = PREMIUM_ADBLOCK_STYLE_ID;
      style.textContent = `${AD_SELECTORS} { display: none !important; }`;
      document.documentElement.append(style);
    }
  } else if (existing) {
    existing.remove();
  }
}

function removeAdElements() {
  if (!settings.premiumEnabled) return;
  document.querySelectorAll(AD_SELECTORS).forEach((el) => el.remove());
}

function skipAdsIfPlaying() {
  if (!settings.premiumEnabled) return;
  const skipButton = document.querySelector('.ytp-ad-skip-button, .ytp-ad-skip-button-modern');
  if (skipButton) {
    skipButton.click();
    return;
  }
  const adVideo = document.querySelector('.ad-showing video');
  if (adVideo && !Number.isNaN(adVideo.duration)) {
    adVideo.currentTime = adVideo.duration;
  }
}

function applySearchPlaceholder() {
  const input = document.querySelector(SEARCH_INPUT_SELECTOR);
  if (!input) return;

  if (settings.searchPlaceholder) {
    if (input.dataset.bytBasePlaceholder === undefined) {
      input.dataset.bytBasePlaceholder = input.placeholder;
    }
    if (input.placeholder !== settings.searchPlaceholder) {
      input.placeholder = settings.searchPlaceholder;
    }
  } else if (input.dataset.bytBasePlaceholder !== undefined) {
    input.placeholder = input.dataset.bytBasePlaceholder;
    delete input.dataset.bytBasePlaceholder;
  }
}

function applyHeaderDesign() {
  const existing = document.getElementById(HEADER_STYLE_ID);
  if (!settings.headerGlassEnabled) {
    if (existing) existing.remove();
    return;
  }

  const style = existing || document.createElement('style');
  style.id = HEADER_STYLE_ID;

  const blurPx = num(settings.headerBlur, DEFAULTS.headerBlur);
  const opacityVal = num(settings.headerOpacity, DEFAULTS.headerOpacity);
  const marginPx = num(settings.headerMargin, DEFAULTS.headerMargin);
  const radiusPx = num(settings.headerRadius, DEFAULTS.headerRadius);
  // YouTube marks dark theme with a "dark" attribute on <html>; pick the
  // matching glass color instead of a single fixed one.
  const isDark = document.documentElement.hasAttribute('dark');
  const color = (isDark ? settings.headerColorDark : settings.headerColorLight) || DEFAULTS.headerColorDark;
  const rgba = hexToRgba(color, opacityVal);

  style.textContent = `
    #background.style-scope.ytd-masthead,
    #frosted-glass.with-chipbar.ytd-app {
      display: none !important;
    }
    #container.style-scope.ytd-masthead {
      margin: ${marginPx}px !important;
      border-radius: ${radiusPx}px !important;
      overflow: hidden !important;
      background-color: ${rgba} !important;
      backdrop-filter: blur(${blurPx}px) !important;
      -webkit-backdrop-filter: blur(${blurPx}px) !important;
    }
    #chips.style-scope.ytd-feed-filter-chip-bar-renderer {
      margin-top: ${marginPx}px !important;
    }
    ${SEARCH_SURFACE_SELECTOR} {
      background-color: ${rgba} !important;
      border-color: transparent !important;
    }
    .ytSpecTouchFeedbackShapeTouchResponse .ytSpecTouchFeedbackShapeFill,
    .ytChipShapeInactive,
    ${GLASS_EXTRA_SELECTOR} {
      background-color: ${rgba} !important;
      backdrop-filter: blur(${blurPx}px) !important;
      -webkit-backdrop-filter: blur(${blurPx}px) !important;
    }
  `;
  if (!existing) document.documentElement.append(style);
}

function applyVoteButtonFix() {
  const existing = document.getElementById(VOTE_FIX_STYLE_ID);
  if (!settings.dislikesEnabled) {
    if (existing) existing.remove();
    return;
  }
  const style = existing || document.createElement('style');
  style.id = VOTE_FIX_STYLE_ID;
  style.textContent = `
    .ytPlayerQuickActionButtonsHost:not(:empty) .ytLikeButtonViewModelHost .ytSpecButtonShapeNextHost {
      width: auto !important;
    }
  `;
  if (!existing) document.documentElement.append(style);
}

function getVideoIdFromUrl() {
  try {
    return new URL(location.href).searchParams.get('v');
  } catch {
    return null;
  }
}

function formatCount(count) {
  if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
  if (count >= 1_000) return `${(count / 1_000).toFixed(1).replace(/\.0$/, '')}K`;
  return String(count);
}

async function fetchVoteData(videoId) {
  try {
    const response = await fetch(`https://returnyoutubedislikeapi.com/votes?videoId=${encodeURIComponent(videoId)}`);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    return {
      likes: typeof data.likes === 'number' ? data.likes : null,
      dislikes: typeof data.dislikes === 'number' ? data.dislikes : null,
    };
  } catch (error) {
    console.error('YouTube Better: failed to fetch like/dislike data: ' + error);
    return { likes: null, dislikes: null };
  }
}

function findButtonsBySelectors(selectors) {
  // YouTube can render more than one instance of a button at once (e.g. the
  // normal one below the video plus a separate one in the fullscreen
  // overlay), and only one is visible at a time depending on player state.
  // Collect every match so the badge lands on whichever one is shown.
  for (const selector of selectors) {
    const buttons = document.querySelectorAll(selector);
    if (buttons.length) return buttons;
  }
  return [];
}

function findDislikeButtons() {
  return findButtonsBySelectors(DISLIKE_BUTTON_SELECTORS);
}

function findLikeButtons() {
  return findButtonsBySelectors(LIKE_BUTTON_SELECTORS);
}

function removeDislikeBadges() {
  document.querySelectorAll('.byt-dislike-count').forEach((el) => el.remove());
}

function removeLikeBadges() {
  document.querySelectorAll('.byt-like-count').forEach((el) => el.remove());
}

function removeRatioBars() {
  document.querySelectorAll(`.${RATIO_BAR_CLASS}`).forEach((el) => el.remove());
}

function upsertBadge(button, className, text) {
  let badge = button.querySelector(`.${className}`);
  if (!badge) {
    badge = document.createElement('span');
    badge.className = className;
    badge.style.marginInlineStart = '6px';
    badge.style.fontSize = '12px';
    badge.style.fontWeight = '500';
    button.append(badge);
  }
  if (badge.textContent !== text) badge.textContent = text;
}

function applyDislikeCountToButton(button, text) {
  upsertBadge(button, 'byt-dislike-count', text);
}

function applyLikeCountToButton(button, text) {
  // The normal (non-fullscreen) like button already shows YouTube's own
  // native count text; only the icon-only fullscreen one needs our badge.
  if (button.querySelector('.ytSpecButtonShapeNextButtonTextContent')) return;
  upsertBadge(button, 'byt-like-count', text);
}

function applyRatioBarToContainer(container, likePercent) {
  let bar = container.querySelector(`.${RATIO_BAR_CLASS}`);
  if (!bar) {
    bar = document.createElement('div');
    bar.className = RATIO_BAR_CLASS;
    bar.style.position = 'absolute';
    bar.style.left = '0';
    bar.style.right = '0';
    bar.style.bottom = '-5px';
    bar.style.height = '3px';
    bar.style.borderRadius = '2px';
    bar.style.pointerEvents = 'none';
    container.style.position = 'relative';
    container.append(bar);
  }
  bar.style.background = `linear-gradient(to right, ${RATIO_LIKE_COLOR} ${likePercent}%, ${RATIO_DISLIKE_COLOR} ${likePercent}%)`;
}

let currentVoteVideoId = null;
let currentLikeCount = null;
let currentDislikeCount = null;

// Fetches vote data for the current video, independent of whether the
// like/dislike buttons have rendered yet. YouTube can re-create those button
// nodes after this runs (e.g. once metadata finishes loading on a slow
// connection), so inserting badges/bars is handled separately by
// ensureVoteBadges(), which runs on every mutation-driven applyAll() pass
// and re-inserts them if missing.
async function updateDislikeData() {
  if (!settings.dislikesEnabled) {
    currentVoteVideoId = null;
    currentLikeCount = null;
    currentDislikeCount = null;
    removeDislikeBadges();
    removeLikeBadges();
    removeRatioBars();
    return;
  }
  const videoId = getVideoIdFromUrl();
  if (!videoId || videoId === currentVoteVideoId) return;
  currentVoteVideoId = videoId;
  const { likes, dislikes } = await fetchVoteData(videoId);
  currentLikeCount = likes;
  currentDislikeCount = dislikes;
}

function ensureVoteBadges() {
  if (!settings.dislikesEnabled) return;
  if (getVideoIdFromUrl() !== currentVoteVideoId) return;

  if (currentDislikeCount != null) {
    const text = formatCount(currentDislikeCount);
    findDislikeButtons().forEach((button) => applyDislikeCountToButton(button, text));
  }
  if (currentLikeCount != null) {
    const text = formatCount(currentLikeCount);
    findLikeButtons().forEach((button) => applyLikeCountToButton(button, text));
  }
  if (currentLikeCount != null && currentDislikeCount != null) {
    const total = currentLikeCount + currentDislikeCount;
    if (total > 0) {
      const likePercent = (currentLikeCount / total) * 100;
      RATIO_BAR_CONTAINER_SELECTORS.forEach((selector) => {
        document.querySelectorAll(selector).forEach((container) => applyRatioBarToContainer(container, likePercent));
      });
    }
  }
}

function getMetaContent(itemprop) {
  const el = document.querySelector(`meta[itemprop="${itemprop}"]`);
  return el ? el.getAttribute('content') : null;
}

function getSubscriberCountText() {
  const el = document.querySelector('#owner-sub-count');
  return el ? el.textContent.trim() : null;
}

function getChannelId() {
  const fromMeta = getMetaContent('channelId');
  if (fromMeta) return fromMeta;
  const link = document.querySelector('link[itemprop="url"][href*="/channel/"]');
  if (!link) return null;
  const match = link.getAttribute('href').match(/\/channel\/([^/?#]+)/);
  return match ? match[1] : null;
}

function parseAbbreviatedNumber(text) {
  if (!text) return null;
  const match = text.replace(/,/g, '').match(/([\d.]+)\s*([KMB]?)/i);
  if (!match) return null;
  const num = parseFloat(match[1]);
  if (!Number.isFinite(num)) return null;
  const multiplier = { k: 1e3, m: 1e6, b: 1e9 }[match[2].toLowerCase()] || 1;
  return Math.round(num * multiplier);
}

const HISTORY_MAX_POINTS = 30;

// Builds a small, real (not modeled) time series by taking one snapshot per
// day per video/channel the user actually visits with this extension on.
// There is no legitimate public API for a video's or channel's historical
// day-by-day view/subscriber curve — that data is private YouTube Studio
// Analytics, visible only to the channel owner. This just starts observing
// from today forward instead of pretending to know the past.
async function recordHistoryPoint(storageKey, id, value) {
  if (!id || !Number.isFinite(value)) return;
  const todayKey = new Date().toISOString().slice(0, 10);
  const store = await browser.storage.local.get({ [storageKey]: {} });
  const all = store[storageKey];
  const series = all[id] || [];
  const last = series[series.length - 1];
  if (last && last.day === todayKey) {
    last.value = value;
  } else {
    series.push({ day: todayKey, value });
    if (series.length > HISTORY_MAX_POINTS) series.shift();
  }
  all[id] = series;
  await browser.storage.local.set({ [storageKey]: all });
}

async function getHistorySeries(storageKey, id) {
  if (!id) return [];
  const store = await browser.storage.local.get({ [storageKey]: {} });
  return store[storageKey][id] || [];
}

let historyRecordedVideoId = null;

async function maybeRecordHistory() {
  if (!settings.dislikesEnabled) return;
  const videoId = getVideoIdFromUrl();
  if (!videoId || videoId === historyRecordedVideoId) return;
  historyRecordedVideoId = videoId;

  const viewsNum = Number(getMetaContent('interactionCount'));
  if (Number.isFinite(viewsNum) && viewsNum > 0) {
    await recordHistoryPoint('bytViewHistory', videoId, viewsNum);
  }
  const channelId = getChannelId();
  const subsNum = parseAbbreviatedNumber(getSubscriberCountText());
  if (channelId && subsNum != null) {
    await recordHistoryPoint('bytSubHistory', channelId, subsNum);
  }
}

let cachedUploadDateVideoId = null;
let cachedUploadDateIso = null;

// The exact upload timestamp (with time-of-day and timezone) lives as a
// "publishDate"/"uploadDate" JSON field inside one of the page's own inline
// <script> tags (the same static data any crawler would read) — this just
// searches that text for the key directly, which is far more robust than
// trying to locate and parse the whole surrounding JSON blob.
function getPreciseUploadDate() {
  const videoId = getVideoIdFromUrl();
  if (videoId && videoId === cachedUploadDateVideoId) return cachedUploadDateIso;

  cachedUploadDateVideoId = videoId;
  cachedUploadDateIso = null;
  for (const script of document.querySelectorAll('script')) {
    const text = script.textContent;
    if (!text) continue;
    const match = text.match(/"publishDate"\s*:\s*"([^"]+)"/) || text.match(/"uploadDate"\s*:\s*"([^"]+)"/);
    if (match) {
      cachedUploadDateIso = match[1];
      break;
    }
  }
  return cachedUploadDateIso;
}

function formatPreciseDate(iso) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleString(undefined, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZoneName: 'short',
  });
}

function buildOverviewCards() {
  const cards = [];
  const viewsNum = Number(getMetaContent('interactionCount'));
  const hasViews = Number.isFinite(viewsNum) && viewsNum > 0;
  if (hasViews) cards.push({ icon: '👁', value: formatCount(viewsNum), label: 'Views' });

  if (currentLikeCount != null) cards.push({ icon: '👍', value: formatCount(currentLikeCount), label: 'Likes' });
  if (currentDislikeCount != null) cards.push({ icon: '👎', value: formatCount(currentDislikeCount), label: 'Dislikes' });

  const subsText = getSubscriberCountText();
  if (subsText) cards.push({ icon: '👤', value: subsText.replace(/\s*subscribers?/i, ''), label: 'Subscribers' });

  const uploadIso = getPreciseUploadDate();
  if (hasViews && uploadIso) {
    const uploadTime = new Date(uploadIso).getTime();
    if (!Number.isNaN(uploadTime)) {
      const days = Math.max(1, Math.round((Date.now() - uploadTime) / 86_400_000));
      cards.push({ icon: '⚡', value: formatCount(Math.round(viewsNum / days)), label: 'Views / day' });
    }
  }
  return cards;
}

function buildDetailRows() {
  const rows = [];
  const videoId = getVideoIdFromUrl();
  if (videoId) {
    rows.push(['Video ID', videoId]);
    rows.push(['Link', `youtu.be/${videoId}`]);
  }

  const uploadIso = getPreciseUploadDate();
  const uploaded = (uploadIso && formatPreciseDate(uploadIso)) || getMetaContent('datePublished');
  if (uploaded) rows.push(['Uploaded', uploaded]);

  if (currentLikeCount != null && currentDislikeCount != null) {
    const total = currentLikeCount + currentDislikeCount;
    if (total > 0) rows.push(['Like ratio', `${((currentLikeCount / total) * 100).toFixed(1)}%`]);
  }
  return rows;
}

function buildDonutChartSvg(likePercent) {
  const radius = 40;
  const circumference = 2 * Math.PI * radius;
  const likeLength = (likePercent / 100) * circumference;
  const svgNS = 'http://www.w3.org/2000/svg';

  const svg = document.createElementNS(svgNS, 'svg');
  svg.setAttribute('viewBox', '0 0 100 100');
  svg.setAttribute('width', '100');
  svg.setAttribute('height', '100');

  const bg = document.createElementNS(svgNS, 'circle');
  bg.setAttribute('cx', '50');
  bg.setAttribute('cy', '50');
  bg.setAttribute('r', String(radius));
  bg.setAttribute('fill', 'none');
  bg.setAttribute('stroke', RATIO_DISLIKE_COLOR);
  bg.setAttribute('stroke-width', '14');

  const fg = document.createElementNS(svgNS, 'circle');
  fg.setAttribute('cx', '50');
  fg.setAttribute('cy', '50');
  fg.setAttribute('r', String(radius));
  fg.setAttribute('fill', 'none');
  fg.setAttribute('stroke', RATIO_LIKE_COLOR);
  fg.setAttribute('stroke-width', '14');
  fg.setAttribute('stroke-dasharray', `${likeLength} ${circumference - likeLength}`);
  fg.setAttribute('stroke-dashoffset', String(circumference / 4));
  fg.setAttribute('transform', 'rotate(-90 50 50)');

  const label = document.createElementNS(svgNS, 'text');
  label.setAttribute('x', '50');
  label.setAttribute('y', '55');
  label.setAttribute('text-anchor', 'middle');
  label.setAttribute('font-size', '18');
  label.setAttribute('fill', 'currentColor');
  label.textContent = `${likePercent.toFixed(0)}%`;

  svg.append(bg, fg, label);
  return svg;
}

// YouTube's own --yt-spec-* CSS variables aren't reliable across builds, so
// the panel picks explicit colors from the same dark-attribute check used
// for the header glass, instead of depending on variables that may not
// exist (or may have been renamed) in this particular YouTube build.
const STATS_THEME = {
  light: {
    panelBg: 'rgba(0, 0, 0, 0.05)',
    cardBg: 'rgba(0, 0, 0, 0.045)',
    text: '#0f0f0f',
    secondary: 'rgba(0, 0, 0, 0.6)',
    divider: 'rgba(0, 0, 0, 0.12)',
  },
  dark: {
    panelBg: 'rgba(255, 255, 255, 0.07)',
    cardBg: 'rgba(255, 255, 255, 0.06)',
    text: '#f1f1f1',
    secondary: 'rgba(255, 255, 255, 0.65)',
    divider: 'rgba(255, 255, 255, 0.14)',
  },
};

function getStatsTheme() {
  return document.documentElement.hasAttribute('dark') ? STATS_THEME.dark : STATS_THEME.light;
}

function buildStatCard(theme, { icon, value, label }) {
  const card = document.createElement('div');
  card.style.cssText = `
    display:flex; flex-direction:column; align-items:center; justify-content:center;
    gap:2px; padding:10px 4px; border-radius:10px; background:${theme.cardBg};
  `;
  const iconEl = document.createElement('div');
  iconEl.textContent = icon;
  iconEl.style.fontSize = '16px';
  const valueEl = document.createElement('div');
  valueEl.textContent = value;
  valueEl.style.cssText = 'font-size:15px; font-weight:700;';
  const labelEl = document.createElement('div');
  labelEl.textContent = label;
  labelEl.style.cssText = `font-size:10px; color:${theme.secondary};`;
  card.append(iconEl, valueEl, labelEl);
  return card;
}

function buildHorizontalBarChart(series, theme, color) {
  const wrap = document.createElement('div');
  wrap.style.cssText = 'display:flex; flex-direction:column; gap:4px; width:100%;';

  if (series.length < 2) {
    const note = document.createElement('div');
    note.textContent = series.length
      ? 'Tracking started today — check back later to see growth.'
      : 'No data yet.';
    note.style.cssText = `font-size:11px; color:${theme.secondary};`;
    wrap.append(note);
    if (!series.length) return wrap;
  }

  const max = Math.max(...series.map((point) => point.value), 1);
  series.forEach((point) => {
    const row = document.createElement('div');
    row.style.cssText = 'display:flex; align-items:center; gap:6px; font-size:11px;';

    const dateEl = document.createElement('span');
    dateEl.textContent = point.day.slice(5);
    dateEl.style.cssText = `width:34px; flex:none; color:${theme.secondary};`;

    const track = document.createElement('div');
    track.style.cssText = `flex:1; background:${theme.cardBg}; border-radius:4px; overflow:hidden; height:14px;`;
    const bar = document.createElement('div');
    const pct = Math.max(4, (point.value / max) * 100);
    bar.style.cssText = `width:${pct}%; height:100%; background:${color}; border-radius:4px;`;
    track.append(bar);

    const valueEl = document.createElement('span');
    valueEl.textContent = formatCount(point.value);
    valueEl.style.cssText = 'width:42px; flex:none; text-align:right; font-weight:600;';

    row.append(dateEl, track, valueEl);
    wrap.append(row);
  });
  return wrap;
}

async function refreshHistoryBody(historyBody, theme) {
  const videoId = getVideoIdFromUrl();
  const channelId = getChannelId();
  const [viewSeries, subSeries] = await Promise.all([
    getHistorySeries('bytViewHistory', videoId),
    getHistorySeries('bytSubHistory', channelId),
  ]);

  historyBody.replaceChildren();

  const viewsHeading = document.createElement('div');
  viewsHeading.textContent = 'Views over time (tracked locally since you started watching with this extension)';
  viewsHeading.style.cssText = `font-size:11px; color:${theme.secondary}; margin-bottom:6px;`;
  historyBody.append(viewsHeading, buildHorizontalBarChart(viewSeries, theme, RATIO_LIKE_COLOR));

  const subsHeading = document.createElement('div');
  subsHeading.textContent = 'Subscribers over time';
  subsHeading.style.cssText = `font-size:11px; color:${theme.secondary}; margin:12px 0 6px;`;
  historyBody.append(subsHeading, buildHorizontalBarChart(subSeries, theme, '#ffb300'));
}

function ensureStatsPanel() {
  if (!settings.dislikesEnabled) {
    const existing = document.getElementById(STATS_PANEL_ID);
    if (existing) existing.remove();
    return;
  }

  const container = document.querySelector(STATS_PANEL_CONTAINER_SELECTOR);
  if (!container) return;

  const theme = getStatsTheme();
  let panel = document.getElementById(STATS_PANEL_ID);
  let cardGrid;
  let detailBody;
  let ratioBody;
  let historyBody;

  if (!panel) {
    panel = document.createElement('div');
    panel.id = STATS_PANEL_ID;
    panel.style.cssText = 'padding:12px; margin-bottom:12px; border-radius:12px; font-size:13px;';

    const tabRow = document.createElement('div');
    tabRow.className = 'byt-tab-row';
    tabRow.style.cssText = 'display:flex; gap:16px; margin-bottom:10px; padding-bottom:6px;';

    const overviewTabBtn = document.createElement('button');
    overviewTabBtn.type = 'button';
    overviewTabBtn.textContent = 'Overview';
    const ratioTabBtn = document.createElement('button');
    ratioTabBtn.type = 'button';
    ratioTabBtn.textContent = 'Ratio';
    const historyTabBtn = document.createElement('button');
    historyTabBtn.type = 'button';
    historyTabBtn.textContent = 'History';
    [overviewTabBtn, ratioTabBtn, historyTabBtn].forEach((btn) => {
      btn.className = 'byt-stats-tab-btn';
      btn.style.cssText = 'background:none; border:none; font:inherit; font-weight:700; cursor:pointer; padding:2px 0; color:inherit;';
    });
    tabRow.append(overviewTabBtn, ratioTabBtn, historyTabBtn);

    const overviewBody = document.createElement('div');
    overviewBody.className = 'byt-overview-body';
    cardGrid = document.createElement('div');
    cardGrid.className = 'byt-card-grid';
    cardGrid.style.cssText = 'display:grid; grid-template-columns:repeat(3, 1fr); gap:6px; margin-bottom:10px;';
    detailBody = document.createElement('div');
    detailBody.className = 'byt-detail-body';
    overviewBody.append(cardGrid, detailBody);

    ratioBody = document.createElement('div');
    ratioBody.className = 'byt-ratio-body';
    ratioBody.style.cssText = 'display:none; flex-direction:column; align-items:center; gap:8px;';

    historyBody = document.createElement('div');
    historyBody.className = 'byt-history-body';
    historyBody.style.cssText = 'display:none;';

    const setActiveTab = (tab) => {
      overviewBody.style.display = tab === 'overview' ? 'block' : 'none';
      ratioBody.style.display = tab === 'ratio' ? 'flex' : 'none';
      historyBody.style.display = tab === 'history' ? 'block' : 'none';
      overviewTabBtn.style.opacity = tab === 'overview' ? '1' : '0.55';
      ratioTabBtn.style.opacity = tab === 'ratio' ? '1' : '0.55';
      historyTabBtn.style.opacity = tab === 'history' ? '1' : '0.55';
    };
    overviewTabBtn.addEventListener('click', () => setActiveTab('overview'));
    ratioTabBtn.addEventListener('click', () => setActiveTab('ratio'));
    historyTabBtn.addEventListener('click', () => setActiveTab('history'));
    setActiveTab('overview');

    panel.append(tabRow, overviewBody, ratioBody, historyBody);
  } else {
    cardGrid = panel.querySelector('.byt-card-grid');
    detailBody = panel.querySelector('.byt-detail-body');
    ratioBody = panel.querySelector('.byt-ratio-body');
    historyBody = panel.querySelector('.byt-history-body');
  }

  if (panel.parentElement !== container) {
    container.prepend(panel);
  }

  // Re-applied every pass (not just on creation) so a live YouTube theme
  // switch updates the panel immediately.
  panel.style.background = theme.panelBg;
  panel.style.color = theme.text;
  panel.querySelector('.byt-tab-row').style.borderBottom = `1px solid ${theme.divider}`;

  cardGrid.replaceChildren();
  buildOverviewCards().forEach((card) => cardGrid.append(buildStatCard(theme, card)));

  detailBody.replaceChildren();
  buildDetailRows().forEach(([label, value]) => {
    const row = document.createElement('div');
    row.style.cssText = 'display:flex; justify-content:space-between; gap:8px; padding:3px 0;';
    const labelEl = document.createElement('span');
    labelEl.textContent = label;
    labelEl.style.color = theme.secondary;
    const valueEl = document.createElement('span');
    valueEl.textContent = value;
    row.append(labelEl, valueEl);
    detailBody.append(row);
  });

  ratioBody.replaceChildren();
  if (currentLikeCount != null && currentDislikeCount != null && currentLikeCount + currentDislikeCount > 0) {
    const likePercent = (currentLikeCount / (currentLikeCount + currentDislikeCount)) * 100;
    ratioBody.append(buildDonutChartSvg(likePercent));

    const legend = document.createElement('div');
    legend.style.cssText = 'display:flex; gap:12px; font-size:12px;';
    const likeLegend = document.createElement('span');
    likeLegend.textContent = `● Likes ${formatCount(currentLikeCount)}`;
    likeLegend.style.color = RATIO_LIKE_COLOR;
    const dislikeLegend = document.createElement('span');
    dislikeLegend.textContent = `● Dislikes ${formatCount(currentDislikeCount)}`;
    dislikeLegend.style.color = theme.secondary;
    legend.append(likeLegend, dislikeLegend);
    ratioBody.append(legend);
  } else {
    const empty = document.createElement('div');
    empty.textContent = 'No data yet';
    empty.style.opacity = '0.7';
    ratioBody.append(empty);
  }

  refreshHistoryBody(historyBody, theme);
}

function applyAll() {
  applyPremiumAdBlockCss();
  removeAdElements();
  applyRegionAndPremium();
  applyLogoColor();
  applySearchPlaceholder();
  applyHeaderDesign();
  applyVoteButtonFix();
  maybeRecordHistory();
  ensureVoteBadges();
  ensureStatsPanel();
}

let applyScheduled = false;
function scheduleApply() {
  if (applyScheduled) return;
  applyScheduled = true;
  requestAnimationFrame(() => {
    applyScheduled = false;
    applyAll();
  });
}

async function loadSettings() {
  try {
    settings = await browser.storage.local.get(DEFAULTS);
  } catch (error) {
    console.error('Failed to load YouTube Better settings: ' + error);
  }
}

async function refreshDislikes() {
  await updateDislikeData();
  scheduleApply();
}

async function init() {
  await loadSettings();
  applyAll();
  refreshDislikes();

  new MutationObserver(scheduleApply).observe(document.documentElement, {
    childList: true,
    subtree: true,
  });

  document.addEventListener('yt-navigate-finish', refreshDislikes);
  setInterval(skipAdsIfPlaying, 500);
  // Defensive fallback in case a navigation isn't caught by yt-navigate-finish.
  setInterval(refreshDislikes, 2000);
}

init();

browser.storage.onChanged.addListener(async (changes, area) => {
  if (area !== 'local') return;
  await loadSettings();
  applyAll();
  refreshDislikes();
});
