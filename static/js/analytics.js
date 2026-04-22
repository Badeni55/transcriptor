// ReelScript analytics wrapper around PostHog.
// Loaded early from <head>. Exposes window.track, window.isInAppBrowser,
// window.getBrowserContext. Buffers calls made before PostHog is ready.

(function () {
  'use strict';

  var APP_VERSION = '0.13.1';

  var STYLE_MAP = {
    viral:        'viral',
    divertido:    'funny',
    linkedin:     'linkedin',
    storytelling: 'story',
    hooks:        'hooks5',
    custom:       'custom'
  };

  // ── In-app browser detection ────────────────────────────────────
  function getBrowserContext() {
    var ua = (navigator.userAgent || '').toLowerCase();
    var appName = null;

    if (/instagram/.test(ua))                               appName = 'instagram';
    else if (/tiktok|bytedancewebview|musical_ly/.test(ua)) appName = 'tiktok';
    else if (/fbav|fban|fbios|fb_iab/.test(ua))             appName = 'facebook';
    else if (/linkedinapp/.test(ua))                        appName = 'linkedin';
    else if (/twitter|twitterandroid/.test(ua))             appName = 'twitter';
    else if (/threads/.test(ua))                            appName = 'threads';

    return { inApp: appName !== null, appName: appName };
  }

  function isInAppBrowser() { return getBrowserContext().inApp; }

  window.isInAppBrowser   = isInAppBrowser;
  window.getBrowserContext = getBrowserContext;

  // ── Buffer for calls made before PostHog is fully loaded ────────
  var _buffer = [];
  var _ready  = false;

  function _phReady() {
    return !!(window.posthog && window.posthog.__loaded);
  }

  function _enqueue(fn) {
    if (_ready && _phReady()) { try { fn(); } catch (e) {} }
    else                       { _buffer.push(fn); }
  }

  function _flushBuffer() {
    while (_buffer.length) {
      try { _buffer.shift()(); } catch (e) {}
    }
  }

  function _initWhenReady() {
    if (_ready || !_phReady()) return;
    _ready = true;

    var ctx = getBrowserContext();
    try {
      window.posthog.register({
        app_version:   APP_VERSION,
        in_app_browser: ctx.inApp,
        app_name:       ctx.appName,
        user_language:  document.documentElement.lang || 'es'
      });
    } catch (e) {}

    if (ctx.inApp && !sessionStorage.getItem('rs_in_app_detected')) {
      _capture('in_app_browser_detected', { app_name: ctx.appName });
      try { sessionStorage.setItem('rs_in_app_detected', '1'); } catch (e) {}
    }

    _flushBuffer();
  }

  // PostHog's snippet creates window.posthog as a stub immediately and loads
  // array.js async; __loaded flips true after the real script runs. Poll until
  // ready, then stop.
  var _pollId = setInterval(function () {
    if (_phReady()) {
      _initWhenReady();
      clearInterval(_pollId);
    }
  }, 50);
  setTimeout(function () {
    clearInterval(_pollId);
    if (!_ready) {
      // PostHog never loaded (blocked / offline / slow). Clear buffer so we
      // don't leak memory on a long-lived tab.
      _buffer.length = 0;
    }
  }, 10000);

  // ── Debug ───────────────────────────────────────────────────────
  function _debug(name, props) {
    try {
      if (new URLSearchParams(location.search).has('posthog_debug')) {
        console.log('📊', name, props || {});
      }
    } catch (e) {}
  }

  function _capture(name, props) {
    _debug(name, props);
    _enqueue(function () {
      try { window.posthog.capture(name, props || {}); } catch (e) {}
    });
  }

  // ── track API ───────────────────────────────────────────────────
  var track = {

    // ── Funnel de transcripción (pre-signup) ──
    urlPasted: function (props)          { _capture('url_pasted', props || {}); },
    // Single transcription tracker. If the user fires two transcribes in
    // parallel without the first completing, the second overrides the
    // timestamp and the first transcribe_completed will report a negative
    // or skewed durationMs. Acceptable at current scale.
    transcribeClicked: function (props) {
      window.__rs_transcribe_start = Date.now();
      _capture('transcribe_clicked', props || {});
    },
    transcribeCompleted: function (props) {
      var p = Object.assign({}, props || {});
      if (window.__rs_transcribe_start) {
        p.durationMs = Date.now() - window.__rs_transcribe_start;
        window.__rs_transcribe_start = null;
      }
      _capture('transcribe_completed', p);
    },
    resultViewed: function (props)       { _capture('result_viewed', props || {}); },

    // ── Funnel de signup ──
    signupPrompted: function (props)     { _capture('signup_prompted', props || {}); },
    signupStarted: function (props)      { _capture('signup_started', props || {}); },
    signupCompleted: function (props)    { _capture('signup_completed', props || {}); },

    // ── Identity helpers (llamar ANTES del redirect tras login) ──
    identifyUser: function (userId, props) {
      _enqueue(function () {
        try { window.posthog.identify(userId, props || {}); } catch (e) {}
      });
    },
    resetUser: function () {
      _enqueue(function () {
        try { window.posthog.reset(); } catch (e) {}
      });
    },

    // ── Funnel de activación (POST-v0.13.0) ──
    workspaceEntered: function (props)    { _capture('workspace_entered', props || {}); },
    workspaceTabClicked: function (props) { _capture('workspace_tab_clicked', props || {}); },
    featureDiscovered: function (props)   { _capture('feature_discovered', props || {}); },
    featureUsed: function (props)         { _capture('feature_used', props || {}); },

    // ── Interacciones UI del rediseño v0.13.0 ──
    ctaWorkspaceClicked: function ()     { _capture('cta_workspace_clicked', {}); },
    avatarDropdownOpened: function ()    { _capture('avatar_dropdown_opened', {}); },
    avatarDropdownAction: function (props) { _capture('avatar_dropdown_action', props || {}); },
    ideaFabClicked: function ()          { _capture('idea_fab_clicked', {}); },

    // ── Generador de guión ──
    styleSelected: function (props) {
      var p = Object.assign({}, props || {});
      var raw = p.style || null;
      if (raw && Object.prototype.hasOwnProperty.call(STYLE_MAP, raw)) {
        p.style = STYLE_MAP[raw];
      } else if (raw) {
        p.style = 'custom_assistant';
      }
      _capture('style_selected', p);
    },
    styleCustomUsed: function (props)    { _capture('style_custom_used', props || {}); },

    // ── In-app browser (banner + detection) ──
    inAppBrowserDetected: function (props) { _capture('in_app_browser_detected', props || {}); },
    inAppBannerShown: function ()        { _capture('in_app_banner_shown', {}); },
    inAppBannerClicked: function ()      { _capture('in_app_banner_clicked', {}); },
    inAppBannerDismissed: function ()    { _capture('in_app_banner_dismissed', {}); },

    _debug: _debug
  };

  window.track = track;
})();
