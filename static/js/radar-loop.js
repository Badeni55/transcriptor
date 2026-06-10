/* ═══════════════════════════════════════════════════════════════════════════
   RADAR LOOP — motor de contenido multi-marca (v0.17.x)
   App vanilla dentro de la isla .rs (#radarRoot). Vistas: Dashboard | Ideas |
   Guiones, con selector de marca y ecosistema de contexto creciente. Overlays:
   gen → script → formatos → teleprompter → fillweek. Demo usa shim de fetch.
   ═══════════════════════════════════════════════════════════════════════════ */
(function(){
  "use strict";
  var ESC = (window.esc || function(s){ return String(s==null?"":s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#39;"); });
  function isDemo(){ return !!window.__DEMO__; }

  /* ── prod API helpers (solo se usan en la rama !isDemo()) ─────────────
     Mismo estilo que el resto del archivo (fetch same-origin + .json()).
     apiPost/apiGet resuelven a {ok, status, d} para distinguir 402/409/502. */
  function rsLang(){ try{ var l=(document.documentElement.lang||"es").toLowerCase(); return l.indexOf("en")===0?"en":"es"; }catch(e){ return "es"; } }
  function apiPost(url, body){
    return fetch(url,{method:"POST",credentials:"same-origin",headers:{"Content-Type":"application/json"},body:JSON.stringify(body||{})})
      .then(function(res){ return res.json().catch(function(){return{};}).then(function(d){ return {ok:res.ok, status:res.status, d:d}; }); })
      .catch(function(){ return {ok:false, status:0, d:{error:"network"}}; });
  }
  function apiPatch(url, body){
    return fetch(url,{method:"PATCH",credentials:"same-origin",headers:{"Content-Type":"application/json"},body:JSON.stringify(body||{})})
      .then(function(res){ return res.json().catch(function(){return{};}).then(function(d){ return {ok:res.ok, status:res.status, d:d}; }); })
      .catch(function(){ return {ok:false, status:0, d:{error:"network"}}; });
  }
  function apiGet(url){
    return fetch(url,{credentials:"same-origin"})
      .then(function(res){ return res.json().catch(function(){return null;}).then(function(d){ return {ok:res.ok, status:res.status, d:d}; }); })
      .catch(function(){ return {ok:false, status:0, d:null}; });
  }
  function apiDelete(url){
    return fetch(url,{method:"DELETE",credentials:"same-origin"})
      .then(function(res){ return res.json().catch(function(){return{};}).then(function(d){ return {ok:res.ok, status:res.status, d:d||{}}; }); })
      .catch(function(){ return {ok:false, status:0, d:{error:"network"}}; });
  }
  // En prod el backend es la FUENTE DE VERDAD de créditos: las respuestas de
  // generación traen `credits` (= credits_available). Reflejamos ese saldo en la
  // pill sin descontar local (evita doble-cobro). flashSpark queda cosmético.
  function applyCredits(d, costForFlash){
    if(d && d.credits!=null){ S.user.credits=d.credits; }
    if(costForFlash){ flashSpark(-costForFlash); }
  }
  // El backend guarda `script` como texto plano (hook\n…body…\nclose). Lo
  // partimos a la shape {hook,beats,close} que pinta la isla (igual que parseScript).
  function scriptToParts(scriptStr){
    var l=String(scriptStr||"").split(/\n+/).map(function(s){return s.replace(/^▸\s*/,"").trim();}).filter(Boolean);
    if(!l.length) return {hook:"",beats:[],close:""};
    return {hook:l[0]||"", beats:l.slice(1,-1), close:l.length>1?l[l.length-1]:""};
  }
  // Mapea una fila de GET /scripts (backend) → guión local de la isla.
  function normScript(s){
    var p=scriptToParts(s.script);
    var alt=Array.isArray(s.alt_hooks)?s.alt_hooks:[];
    return { id:gid("g"), seq:++_gseq, _sid:s.id,
      title:s.title||p.hook||"Guión", hook:p.hook, beats:p.beats, close:p.close,
      hooks:alt, expanded:false,
      from:s.from_competitor_username?("@"+s.from_competitor_username):null,
      brand:brand().name, type:"guión",
      status:(s.recording_status==="recorded"?"recorded":(s.recording_status==="discarded"?"discarded":"draft")) };
  }
  // Mapea una fila de GET /ideas (backend) → idea local (con script_draft como
  // primer "guión" si lo hay; los scripts reales se cargan aparte por idea_id).
  function normIdea(i){
    return { id:i.id, text:i.raw_text||i.title||"", scripts:[], expanded:false, seed:0, _server:true, _scriptsLoaded:false, _brand:(i.project_id||"default") };
  }

  /* ── iconos ──────────────────────────────────────────────────── */
  var IC = {
    spark:'<svg viewBox="0 0 24 24" fill="none" width="14" height="14"><path d="M12 2l2.4 6.6L21 11l-6.6 2.4L12 20l-2.4-6.6L3 11l6.6-2.4L12 2z" fill="currentColor"/></svg>',
    eye:'<svg viewBox="0 0 24 24" fill="none" width="14" height="14"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z" stroke="currentColor" stroke-width="1.8"/><circle cx="12" cy="12" r="2.6" stroke="currentColor" stroke-width="1.8"/></svg>',
    heart:'<svg viewBox="0 0 24 24" fill="none" width="14" height="14"><path d="M12 20s-7-4.6-7-9.6A3.9 3.9 0 0112 7a3.9 3.9 0 017 3.4C19 15.4 12 20 12 20z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>',
    star:'<svg viewBox="0 0 24 24" width="20" height="20"><path d="M12 3l2.6 5.6 6 .7-4.5 4.1 1.2 6L12 16.9 6.7 19.4l1.2-6L3.4 9.3l6-.7L12 3z" fill="currentColor"/></svg>',
    starO:'<svg viewBox="0 0 24 24" fill="none" width="20" height="20"><path d="M12 3l2.6 5.6 6 .7-4.5 4.1 1.2 6L12 16.9 6.7 19.4l1.2-6L3.4 9.3l6-.7L12 3z" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/></svg>',
    mic:'<svg viewBox="0 0 24 24" fill="none" width="17" height="17"><rect x="9" y="3" width="6" height="11" rx="3" stroke="currentColor" stroke-width="1.8"/><path d="M5 11a7 7 0 0014 0M12 18v3" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
    layers:'<svg viewBox="0 0 24 24" fill="none" width="18" height="18"><path d="M12 3l9 5-9 5-9-5 9-5z" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/><path d="M3 13l9 5 9-5" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/></svg>',
    hook:'<svg viewBox="0 0 24 24" fill="none" width="18" height="18"><path d="M18 4v8a6 6 0 11-12 0" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><circle cx="18" cy="3.5" r="2" stroke="currentColor" stroke-width="1.7"/></svg>',
    repeat:'<svg viewBox="0 0 24 24" fill="none" width="18" height="18"><path d="M3 11V9a4 4 0 014-4h11M21 7l-3-2 3-2M21 13v2a4 4 0 01-4 4H6M3 17l3 2-3 2" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    arr:'<svg viewBox="0 0 24 24" fill="none" width="18" height="18"><path d="M5 12h14M13 6l6 6-6 6" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    back:'<svg viewBox="0 0 24 24" fill="none" width="20" height="20"><path d="M15 6l-6 6 6 6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    x:'<svg viewBox="0 0 24 24" fill="none" width="18" height="18"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
    check:'<svg viewBox="0 0 24 24" fill="none" width="18" height="18"><path d="M5 12l5 5 9-10" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    plus:'<svg viewBox="0 0 24 24" fill="none" width="16" height="16"><path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
    chev:'<svg viewBox="0 0 24 24" fill="none" width="16" height="16"><path d="M6 9l6 6 6-6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    bolt:'<svg viewBox="0 0 24 24" fill="none" width="16" height="16"><path d="M13 2L4 14h6l-1 8 9-12h-6l1-8z" fill="currentColor"/></svg>',
    doc:'<svg viewBox="0 0 24 24" fill="none" width="18" height="18"><path d="M7 3h7l5 5v13H7z" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/><path d="M14 3v5h5M9.5 13h6M9.5 16.5h4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>',
    grid:'<svg viewBox="0 0 24 24" fill="none" width="18" height="18"><rect x="4" y="4" width="6" height="6" rx="1" stroke="currentColor" stroke-width="1.8"/><rect x="14" y="4" width="6" height="6" rx="1" stroke="currentColor" stroke-width="1.8"/><rect x="4" y="14" width="6" height="6" rx="1" stroke="currentColor" stroke-width="1.8"/><rect x="14" y="14" width="6" height="6" rx="1" stroke="currentColor" stroke-width="1.8"/></svg>',
    bulb:'<svg viewBox="0 0 24 24" fill="none" width="18" height="18"><path d="M9 18h6M10 21h4M12 3a6 6 0 00-4 10.5c.6.6 1 1.3 1 2.1V16h6v-.4c0-.8.4-1.5 1-2.1A6 6 0 0012 3z" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/></svg>',
    chart:'<svg viewBox="0 0 24 24" fill="none" width="18" height="18"><path d="M4 19h16M7 16v-5M12 16V8M17 16v-3" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/></svg>',
    ig:'<svg viewBox="0 0 24 24" fill="none" width="18" height="18"><rect x="3" y="3" width="18" height="18" rx="5" stroke="currentColor" stroke-width="1.8"/><circle cx="12" cy="12" r="3.6" stroke="currentColor" stroke-width="1.8"/><circle cx="17" cy="7" r="1.1" fill="currentColor"/></svg>',
    brain:'<svg viewBox="0 0 24 24" fill="none" width="18" height="18"><path d="M9 4a3 3 0 00-3 3 3 3 0 00-1 5.8A2.5 2.5 0 007 17a3 3 0 005 1 3 3 0 005-1 2.5 2.5 0 002-4.2A3 3 0 0015 4a2.5 2.5 0 00-6 0z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg>',
    chat:'<svg viewBox="0 0 24 24" fill="none" width="14" height="14"><path d="M21 12a8 8 0 01-11.5 7.2L4 20l.9-5.2A8 8 0 1121 12z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>',
    users:'<svg viewBox="0 0 24 24" fill="none" width="18" height="18"><circle cx="9" cy="8" r="3" stroke="currentColor" stroke-width="1.7"/><path d="M3.5 20a5.5 5.5 0 0111 0" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/><path d="M16 6.2a3 3 0 010 5.6M20.5 19.5a5 5 0 00-3.2-4.4" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>',
    gear:'<svg viewBox="0 0 24 24" fill="none" width="18" height="18"><circle cx="12" cy="12" r="3" stroke="currentColor" stroke-width="1.8"/><path d="M19.4 13a1.7 1.7 0 00.3 1.9l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-2.9 1.2V19a2 2 0 11-4 0v-.1a1.7 1.7 0 00-2.9-1.2l-.1.1a2 2 0 11-2.8-2.8l.1-.1A1.7 1.7 0 004.6 13H4.5a2 2 0 110-4h.1a1.7 1.7 0 001.2-2.9l-.1-.1a2 2 0 112.8-2.8l.1.1A1.7 1.7 0 0011 4.6V4.5a2 2 0 114 0v.1a1.7 1.7 0 002.9 1.2l.1-.1a2 2 0 112.8 2.8l-.1.1A1.7 1.7 0 0019.4 11h.1a2 2 0 110 4h-.1a1.7 1.7 0 00-1.6 1z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/></svg>',
    logout:'<svg viewBox="0 0 24 24" fill="none" width="16" height="16"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>'
  };

  // Spinner CSS inyectado una vez.
  (function(){
    if(document.getElementById("rs-ldr-style")) return;
    var s=document.createElement("style"); s.id="rs-ldr-style";
    s.textContent="@keyframes rs-spin{to{transform:rotate(360deg)}}.rs-ldr{display:inline-block;width:11px;height:11px;border:2px solid currentColor;border-top-color:transparent;border-radius:50%;animation:rs-spin .7s linear infinite;vertical-align:middle;margin-right:5px;flex-shrink:0}";
    document.head.appendChild(s);
  })();

  var GEN_STEPS = {
    script:["Leyendo el reel de tu rival…","Extrayendo la estructura que funcionó…","Reescribiéndolo en TU voz…","Puliendo el hook…"],
    hooks:["Analizando el ángulo…","Probando 5 entradas distintas…","Ordenando por gancho…"],
    carousel:["Troceando la idea en slides…","Escribiendo cada tarjeta…","Diseñando la portada…"],
    linkedin:["Cambiando el registro a LinkedIn…","Alargando con tu experiencia…","Rematando con pregunta…"],
    x:["Partiendo en tuits…","Cuidando cada salto de línea…","Cerrando el hilo…"],
    serie:["Buscando 3 ángulos que encadenan…","Escribiendo la continuidad…","Dejándolos listos para grabar…"]
  };
  var GEN_TITLE = { script:"Haciéndolo tuyo", hooks:"Buscando tu hook", carousel:"Montando el carrusel", linkedin:"Pasando a LinkedIn", x:"Tejiendo el hilo", serie:"Creando tu serie" };
  var COST = { script:1, hooks:1, carousel:1, linkedin:1, x:1, serie:3, record:0, idea5:1, scripts5:5, hooks5:1, explosion:30 };

  /* ── estado ──────────────────────────────────────────────────── */
  var S = {
    device:"desktop", _wired:false,
    user:{ name:"", handle:"", email:"", credits:0, streak:0, plan:"", freeLeft:0 },
    brands:[], brandId:null,
    plan:"creador",                     // creador | agencia (de /auth/me; en demo, toggle)
    scope:"brand",                      // brand (radar de 1 marca) | portfolio (todas — solo agencia)
    reels:[], favs:{}, filter:"explosion", feedExpanded:false,
    ideas:[], guiones:[], activeGuionId:null, guiFilter:"all", _fillGuionIds:[],
    igConnected:false, metrics:null, metricSort:"recent", metricChart:"views",
    tab:"dashboard",                    // dashboard | ideas | guiones
    view:"feed",                        // feed(overlay off) | gen | script | result | prompter | fillweek
    reel:null, genKind:"script", resultKind:"hooks", done:{},
    _fillPhase:null, brandMenu:false, acctMenu:false,
    genStepTimer:null, fillTimer:null, toastTimer:null
  };
  function root(){ return document.getElementById("radarRoot"); }
  function brand(){ return S.brands.filter(function(b){return b.id===S.brandId;})[0] || S.brands[0] || {name:"Mi marca",level:1,voice:40,reelsAnalyzed:0,scripts:0,color:"#f97316"}; }
  function isAgency(){ return S.plan==="agencia"; }
  // MACRO = portfolio de todas las marcas (solo agencia). MICRO = radar de una marca.
  function isMacro(){ return isAgency() && S.tab==="portfolio"; }

  /* ── marcas demo (solo demo): un portfolio de agencia con stats por marca.
     En prod esto vendrá de /api/brands con sus stats agregadas. ── */
  function demoBrands(){
    return [
      {id:"b1", name:"David Automatiza", handle:"davidautomatiza", color:"#4f7cff", level:3, voice:64, reels:23, exploded:4, competitors:4, reelsAnalyzed:42, scripts:12},
      {id:"b2", name:"Clínica Nórdica",  handle:"clinicanordica",  color:"#12a37c", level:2, voice:41, reels:9,  exploded:1, competitors:3, reelsAnalyzed:18, scripts:4},
      {id:"b3", name:"Estudio Lumen",    handle:"estudiolumen",    color:"#6d6bf6", level:4, voice:78, reels:6,  exploded:0, competitors:5, reelsAnalyzed:67, scripts:21},
      {id:"b4", name:"Bufete Vidal",     handle:"bufetevidal",     color:"#e0556b", level:2, voice:52, reels:14, exploded:5, competitors:6, reelsAnalyzed:23, scripts:7}
    ];
  }
  // una marca "pide atención" si tiene mucho explosivo sin capitalizar o voz baja.
  function brandNeedsAttention(b){ return (b.exploded||0)>=5 || ((b.exploded||0)>=2 && (b.voice||0)<50); }

  /* ── formato ─────────────────────────────────────────────────── */
  function initialsOf(h){ h=(h||"").replace(/[^a-zA-Z0-9]/g,""); return (h.slice(0,2)||"··").toUpperCase(); }
  function fmtNum(n){ n=Number(n||0); if(n>=1e6) return (n/1e6).toFixed(n>=1e7?0:1).replace(".",",")+" M"; if(n>=1e3) return Math.round(n/1e3)+" K"; return String(n); }
  function relTime(iso){ if(window.ovRelTime) return window.ovRelTime(iso); if(!iso) return ""; var d=(Date.now()-new Date(iso).getTime())/3600000; if(d<1) return "hace "+Math.max(1,Math.round(d*60))+" min"; if(d<24) return "hace "+Math.round(d)+" h"; return "hace "+Math.round(d/24)+" días"; }
  function durFmt(sec){ sec=Number(sec||0); if(!sec) return "0:30"; var m=Math.floor(sec/60),s=sec%60; return m+":"+String(s).padStart(2,"0"); }

  function normReel(r){
    var handle=(r.creator&&r.creator.ig_username)||r.username||"creador";
    var exp=r.explosion_score!=null?r.explosion_score:(r.explosion!=null?r.explosion:null);
    return { id:r.id, creator:{handle:handle, initials:r.initials||initialsOf(handle)},
      when:r.when||relTime(r.posted_at), explosion:exp,
      explosionTxt: exp!=null?(exp>=10?Math.round(exp):(Math.round(exp*10)/10)):null,
      views: typeof r.views==="string"?r.views:fmtNum(r.views),
      likes: typeof r.likes==="string"?r.likes:fmtNum(r.likes),
      dur:r.dur||durFmt(r.video_duration_sec), cap:r.cap||r.caption||"", sum:r.sum||"",
      thumb:r.thumb_b64||r.thumb_url||r.thumb||null, fav:!!(r.is_favorite||r.fav),
      script:r.script||null, hooks:r.hooks||null };
  }

  // Mapea una fila cruda de /metrics/videos (tabla ig_videos: caption/thumbnail_b64/
  // duration/published_at/tag…) a la shape que metricGridHTML/metricStatsHTML leen
  // (cap/thumb/dur/date/top/viral). from_guion/vsMedian no vienen de este endpoint
  // (la atribución vive en scripts) → quedan vacíos y el grid muestra "orgánico".
  function normMetricVideo(v){
    var tag=(v.tag||"")+"";
    return {
      cap: v.cap||v.caption||"",
      views: v.views||0, likes: v.likes||0, comments: v.comments||0,
      thumb: v.thumb||v.thumbnail_b64||v.thumbnail_url||null,
      dur: v.dur||durFmt(v.duration),
      date: v.date||relTime(v.published_at),
      top: !!(v.top || tag==="top"),
      viral: !!(v.viral || tag==="viral"),
      from_guion: v.from_guion||null, vsMedian: v.vsMedian||null
    };
  }

  function greetWord(){ var h=new Date().getHours(); return h<6?"Buenas noches":h<13?"Buenos días":h<21?"Buenas tardes":"Buenas noches"; }

  /* ════════════════════════════════════════════════════════════════
     TOPBAR + selector de marca + navegación
     ════════════════════════════════════════════════════════════════ */
  // v2 SIGNAL: el topbar se parte en RAIL (izquierda, 64px, iconos) + COMMAND BAR (arriba).
  function brandSwitchHTML(){
    var b=brand();
    var portfolio = isMacro();
    var label = portfolio ? "Todas las marcas" : b.name;
    var dot = portfolio ? '<span class="brand-dot multi"></span>' : '<span class="brand-dot" style="background:'+ESC(b.color)+'"></span>';
    var menu="";
    if(S.brandMenu){
      var items="";
      if(isAgency()) items+='<button class="brand-opt'+(portfolio?" on":"")+'" data-act="all-brands"><span class="brand-dot multi"></span>Todas las marcas</button>';
      items+=S.brands.map(function(x){ var on=(!portfolio && x.id===S.brandId); return '<button class="brand-opt'+(on?" on":"")+'" data-act="brand" data-id="'+ESC(x.id)+'"><span class="brand-dot" style="background:'+ESC(x.color)+'"></span>'+ESC(x.name)+'<span class="brand-lvl">Nv '+x.level+'</span></button>';}).join("");
      if(isAgency()) items+='<button class="brand-opt add" data-act="brand-add">'+IC.plus+' Añadir marca</button>';
      menu='<div class="brand-menu">'+items+'</div>';
    }
    return '<button class="brand-switch" data-act="brand-toggle">'+dot+
        '<span class="brand-name">'+ESC(label)+'</span>'+
        '<span class="brand-chev">'+IC.chev+'</span>'+
      '</button>'+menu;
  }
  // Creador: una sola marca → sin selector. Etiqueta estática (no clicable).
  function brandStaticHTML(){
    var b=brand();
    return '<span class="brand-static"><span class="brand-dot" style="background:'+ESC(b.color||"#4f7cff")+'"></span><span class="brand-name">'+ESC(b.name)+'</span></span>';
  }
  // ── Menú de cuenta (rail, abajo): email + plan + Configuración + Cerrar sesión.
  //    El logout reusa la función global logout() de la chrome (POST /auth/logout). ──
  function _planLabel(p){ p=(p||"").toLowerCase(); return ({free:"Free",pro:"Pro",creator:"Creator",creador:"Creator",agency:"Agency",agencia:"Agency"})[p] || (p?p.charAt(0).toUpperCase()+p.slice(1):"Free"); }
  function _planClass(p){ p=(p||"").toLowerCase(); if(p==="creador")p="creator"; if(p==="agencia")p="agency"; return ({free:"free",pro:"pro",creator:"creator",agency:"agency"})[p]||"free"; }
  function acctMenuHTML(){
    if(!S.acctMenu) return '';
    var av=ESC(initialsOf(S.user.handle||S.user.name||S.user.email||"U"));
    var email=ESC(S.user.email||S.user.name||"");
    var pl=S.user.plan||"";
    return '<div class="rs-acct-backdrop" data-act="acct-close"></div>'+
      '<div class="rs-acct-menu" role="menu">'+
        '<div class="rs-acct-head">'+
          '<span class="rs-acct-av">'+av+'</span>'+
          '<span class="rs-acct-id">'+
            '<span class="rs-acct-email" title="'+email+'">'+(email||"—")+'</span>'+
            '<span class="plan-badge '+_planClass(pl)+'">'+_planLabel(pl)+'</span>'+
          '</span>'+
        '</div>'+
        '<button class="brand-opt" data-act="acct-settings" role="menuitem">'+IC.gear+' Configuración</button>'+
        '<button class="brand-opt rs-acct-logout" data-act="acct-logout" role="menuitem">'+IC.logout+' Cerrar sesión</button>'+
      '</div>';
  }
  function railHTML(){
    // Ideas ya no es un tab suelto: la "Fábrica de ideas" vive dentro de Radar
    // (dashboardHTML → ideasZoneHTML), bajo las señales del día.
    var navTabs = isAgency()
      ? [["portfolio",IC.layers,"Portfolio"],["dashboard",IC.grid,"Radar"],["guiones",IC.doc,"Guiones"],["metrics",IC.chart,"Métricas"],["brain",IC.brain,"Cerebro"],["team",IC.users,"Equipo"]]
      : [["dashboard",IC.grid,"Radar"],["guiones",IC.doc,"Guiones"],["metrics",IC.chart,"Métricas"],["brain",IC.brain,"Cerebro"]];
    return '<nav class="rail">'+
      '<img class="rail-logo" src="/static/img/branding/isotipo-128.png" srcset="/static/img/branding/isotipo-128.png 1x, /static/img/branding/isotipo-256.png 2x" alt="Reelscript">'+
      navTabs.map(function(t){return '<button class="rail-btn'+(S.tab===t[0]&&!S.legacy?" on":"")+'" data-act="tab" data-k="'+t[0]+'">'+t[1]+'<span class="tip">'+t[2]+'</span></button>';}).join("")+
      // Accesos a las secciones legacy reutilizadas (no son S.tab internos).
      '<button class="rail-btn'+(S.legacy==="transc"?" on":"")+'" data-act="legacy" data-k="transc" aria-label="Analizar">'+IC.mic+'<span class="tip">Analizar</span></button>'+
      '<button class="rail-btn'+(S.legacy==="settings"?" on":"")+'" data-act="legacy" data-k="settings" aria-label="Configuración">'+IC.gear+'<span class="tip">Configuración</span></button>'+
      // El spacer empuja el botón de cuenta al fondo del rail.
      '<span class="rail-spacer"></span>'+
      '<button class="rail-acct'+(S.acctMenu?" on":"")+'" data-act="acct-toggle" aria-label="Tu cuenta" aria-haspopup="menu" aria-expanded="'+(S.acctMenu?"true":"false")+'">'+ESC(initialsOf(S.user.handle||S.user.name||S.user.email||"U"))+'</button>'+
    '</nav>'+
    // El menú va FUERA del <nav> (su z-index queda por encima de #rsLegacy, etc.).
    acctMenuHTML();
  }
  function cmdHTML(){
    var tabName=({dashboard:"RADAR",ideas:"IDEAS",guiones:"GUIONES",metrics:"MÉTRICAS",brain:"CEREBRO",team:"EQUIPO"})[S.tab]||"";
    var crumb;
    if(isMacro()) crumb='<span class="crumb">/ PORTFOLIO</span>';
    else if(isAgency()) crumb='<button class="crumb crumb-link" data-act="all-brands">Todas las marcas</button><span class="crumb">/ '+tabName+'</span>';
    else crumb='<span class="crumb">/ '+tabName+'</span>';
    var streak=(S.user.streak>0)?'<span class="cmd-streak" title="Días seguidos creando">'+IC.spark+' Racha '+S.user.streak+'</span>':'';
    var demoToggle=isDemo()?'<div class="demo-plan" title="Solo demo: cambia de plan"><span class="dp-k">DEMO</span><button class="dp'+(S.plan==="creador"?" on":"")+'" data-act="demo-plan" data-k="creador">Creador</button><button class="dp'+(S.plan==="agencia"?" on":"")+'" data-act="demo-plan" data-k="agencia">Agencia</button></div>':'';
    return '<div class="cmd">'+
      (isAgency()?brandSwitchHTML():brandStaticHTML())+
      crumb+
      '<span class="grow"></span>'+
      '<div class="searchbox">'+IC.eye+'<span>Buscar señal o creador</span></div>'+   // T3 (IDI): sin pista ⌘K — no prometemos un atajo que no existe
      // T1 (IDI): captura de ideas siempre a mano, en cualquier vista de la isla.
      '<button class="cmd-idea" data-act="idea-capture" title="Apunta una idea — se desarrolla en Guiones" aria-label="Apunta una idea"><span class="cmd-idea-bulb">'+IC.bulb+'</span><span class="cmd-idea-t">Apunta una idea</span></button>'+
      demoToggle+
      streak+
      ((S.user.plan==="free" && !S.user.credits)
        ? '<div class="spark pill-stat credits" id="rsSpark" title="«Hazlo mío» gratis restantes">'+IC.spark+'<span class="num"><b id="rsSparkN">'+S.user.freeLeft+'</b></span> «Hazlo mío»</div>'
        : '<div class="spark pill-stat credits" id="rsSpark" title="Créditos disponibles">'+IC.spark+'<span class="num"><b id="rsSparkN">'+S.user.credits+'</b></span> créditos</div>')+
    '</div>';
  }

  // Cabecera Signal reutilizable (eyebrow mono + h-title Space Grotesk + sub).
  function pheadHTML(eye, title, sub, right){
    return '<header class="phead"><div>'+
      '<div class="eyebrow"><span class="pip"></span>'+ESC(eye)+'</div>'+
      '<h1 class="h-title">'+ESC(title)+'</h1>'+
      (sub?'<p class="h-sub">'+ESC(sub)+'</p>':'')+
    '</div>'+(right?'<div class="phead-right">'+right+'</div>':'')+'</header>';
  }

  /* ════════════════════════════════════════════════════════════════
     DASHBOARD (= Radar): ecosistema + idea-input + whale + feed + manual
     ════════════════════════════════════════════════════════════════ */
  function ecosystemHTML(){
    var b=brand();
    var pct=Math.max(6,Math.min(100,b.voice||40));
    return ''+
    '<div class="eco">'+
      '<div class="eco-top">'+
        '<div class="eco-lvl"><span class="eco-lvl-n">Nivel '+(b.level||1)+'</span><span class="eco-lvl-name">'+ESC(ecoLevelName(b.level))+'</span></div>'+
        '<div class="eco-stats">'+
          '<span><b>'+(b.reelsAnalyzed||0)+'</b> reels en el ecosistema</span>'+
          '<span><b>'+(b.scripts||0)+'</b> guiones</span>'+
        '</div>'+
      '</div>'+
      '<div class="eco-bar"><div class="eco-fill" style="width:'+pct+'%"></div></div>'+
      '<div class="eco-foot">Tu voz al <b>'+pct+'%</b>. Cuanto más creas, más se afina — cada guión sale más tuyo.</div>'+
    '</div>';
  }
  function ecoLevelName(l){ return ({1:"Calentando",2:"Cogiendo forma",3:"En racha",4:"Afinado",5:"Imparable"})[l||1]||"Calentando"; }

  /* B1: "tu próxima serie" — sugerencia del Cerebro a partir de lo que petó en TU
     cuenta (S.metrics.insights.next = {title, views, message}). Surface como CARD
     HERO en el Dashboard y bajo "Lo que funciona" en el Cerebro. Si no hay next,
     no renderiza nada (sin hueco). Misma tarjeta en ambos sitios. */
  function nextSeries(){ return (S.metrics && S.metrics.insights && S.metrics.insights.next) || null; }
  // T1 (IDI): una sola acción primaria por pantalla. En el Dashboard el CTA es
  // secundario (el primario es el «Hazlo mío» de la Oportunidad #1); en el
  // Cerebro sigue primario porque ahí ES la acción principal. ctx: "brain"|"dash".
  function nextSeriesHTML(ctx){
    var nx=nextSeries(); if(!nx || !(nx.title||nx.message)) return '';
    var views=nx.views!=null?(typeof nx.views==="string"?nx.views:fmtNum(nx.views)):"";
    var btnCls=(ctx==="brain")?"btn-primary":"btn-secondary";
    return '<article class="next-series">'+
      '<div class="ns-eyebrow">'+IC.brain+'<span>Tu próxima serie</span>'+(views?'<span class="ns-views" title="Lo que hizo el reel que la inspira">'+IC.eye+' '+ESC(views)+'</span>':'')+'</div>'+
      '<h3 class="ns-title">'+ESC(nx.title||"")+'</h3>'+
      (nx.message?'<p class="ns-msg">'+ESC(nx.message)+'</p>':'')+
      '<div class="ns-actions"><button class="btn btn-md '+btnCls+'" data-act="next-series-go" data-title="'+ESC(nx.title||"")+'">'+IC.bolt+' Desarrollar esta serie</button></div>'+
    '</article>';
  }

  // Gestión de competidores seguidos desde el Radar (acordeón plegado): borrar
  // reusa data-act="untrack" (mismo handler + confirm que en Cerebro).
  function trackedManageHTML(){
    var t=Array.isArray(S.tracked)?S.tracked:[];
    if(!t.length) return "";
    var rows=t.map(function(tt){
      var h=(tt.creator&&tt.creator.ig_username)||tt.ig_username||"";
      var n=(tt.reels_count!=null)?(tt.reels_count+' reel'+(tt.reels_count===1?'':'es')):'';
      return '<div class="brain-comp"><div class="ava bava">'+ESC(initialsOf(h))+'</div>'+
        '<span class="brain-comp-h">@'+ESC(h)+'</span>'+
        '<span class="brain-comp-n">'+ESC(n)+'</span>'+
        '<button class="brain-comp-x" data-act="untrack" data-id="'+ESC(String(tt.id))+'" data-handle="'+ESC(h)+'" title="Dejar de seguir a @'+ESC(h)+'" aria-label="Dejar de seguir a @'+ESC(h)+'">'+IC.x+'</button>'+
      '</div>';
    }).join("");
    return '<details class="comp-manage"><summary>Tus competidores · '+t.length+'</summary><div class="comp-manage-list">'+rows+'</div></details>';
  }

  function whaleHTML(count){
    return '<div class="whale"><div class="wicon">⚡</div><div class="wtext"><h4>Llena mi semana</h4><p>Convierte los '+count+' reels más explosivos en '+count+' guiones con tu voz, listos para grabar. De golpe.</p></div><button class="btn btn-md btn-secondary" data-act="fillweek">Hazlo</button></div>';
  }
  function filtersHTML(){
    var base=[["explosion","🔥 Explotando"],["recent","Recientes"],["fav","★ Favoritos"]];
    return '<div class="filters">'+base.map(function(f){return '<button class="fchip'+(S.filter===f[0]?" on":"")+'" data-act="filter" data-k="'+f[0]+'">'+f[1]+'</button>';}).join("")+
      '<button class="fchip ghost" data-act="add-comp" title="Sigue a un creador para ver sus reels en el Radar">'+IC.plus+' Añadir competidor</button>'+
      '<button class="fchip ghost" data-act="add-reel" title="Pega la URL de un reel para meterlo al ecosistema">'+IC.plus+' Añadir reel</button>'+
    '</div>';
  }

  function feedReels(){
    var a=S.reels.slice();
    if(S.filter==="fav") a=a.filter(function(r){return S.favs[r.id];});
    else if(S.filter==="recent"){}
    else a.sort(function(x,y){return (y.explosion||0)-(x.explosion||0);});
    return a;
  }
  function reelCardHTML(r){
    var hi=(r.explosion||0)>=3, isFav=!!S.favs[r.id];
    var thumbInner=r.thumb?'<img src="'+ESC(r.thumb)+'" alt="">':'<div class="play"></div>';
    return '<div class="row">'+
      '<div class="row-score'+(hi?" hi":"")+'"><span class="sv">'+(r.explosionTxt!=null?ESC(r.explosionTxt):"–")+'×</span><span class="sx">'+(hi?"🔥 explota":"media")+'</span></div>'+   // T8 (IDI): el "explosivo" se lee por etiqueta, no solo por color
      '<div class="row-thumb"><div class="thumb">'+thumbInner+'<span class="dur">'+ESC(r.dur)+'</span></div></div>'+
      '<div class="row-mid"><div class="row-crow"><span class="ava">'+ESC(r.creator.initials)+'</span><span class="row-who">@'+ESC(r.creator.handle)+'</span><span class="row-when">'+ESC(r.when)+'</span></div><p class="row-cap">'+ESC(r.cap)+'</p></div>'+
      '<div class="row-metrics"><span>'+IC.eye+' '+ESC(r.views)+'</span><span>'+IC.heart+' '+ESC(r.likes)+'</span></div>'+
      '<div class="row-actions"><button class="iconbtn'+(isFav?" on":"")+'" data-act="fav" data-id="'+ESC(r.id)+'" title="Guardar">'+(isFav?IC.star:IC.starO)+'</button>'+
        '<button class="btn btn-sm btn-primary" data-act="steal" data-id="'+ESC(r.id)+'">'+IC.bolt+' Hazlo mío</button></div>'+
    '</div>';
  }

  /* card destacada — "tu oportunidad de hoy" (principio I: una respuesta) */
  function opportunityHTML(r){
    var mega=(r.explosion||0)>=5;
    var thumbInner=r.thumb?'<img src="'+ESC(r.thumb)+'" alt="">':'<div class="play"></div>';
    var why = mega
      ? "Está reventando: "+ (r.explosionTxt!=null?r.explosionTxt:"")+"× lo normal de @"+r.creator.handle+". Si hay uno que robar hoy, es este."
      : "Por encima de la media de @"+r.creator.handle+". Buen punto de partida para hoy.";
    var expPct=Math.min(100,(r.explosion||0)/6*100);
    return '<article class="feature">'+
      '<div class="feature-thumb"><div class="thumb">'+thumbInner+'<span class="thumb-tag">reel · '+ESC(r.creator.handle.slice(0,6))+'</span><span class="dur">'+ESC(r.dur)+'</span></div></div>'+
      '<div class="feature-main">'+
        '<div class="feature-eyebrow">Oportunidad #1 <span class="who">· @'+ESC(r.creator.handle)+' · '+ESC(r.when)+'</span></div>'+
        '<h2 class="feature-cap">'+ESC(r.cap)+'</h2>'+
        (r.sum?'<p class="feature-sum">'+ESC(r.sum)+'</p>':'')+
        '<div class="feature-why">'+IC.spark+'<span>'+ESC(why)+'</span></div>'+
        '<div class="feature-actions"><button class="btn btn-lg btn-primary" data-act="steal" data-id="'+ESC(r.id)+'">'+IC.bolt+' Hazlo mío</button>'+
          '<button class="iconbtn'+(S.favs[r.id]?" on":"")+'" data-act="fav" data-id="'+ESC(r.id)+'" title="Guardar">'+(S.favs[r.id]?IC.star:IC.starO)+'</button></div>'+
      '</div>'+
      '<div class="feature-data">'+
        '<div class="dmetric big"><div class="dk">Explosión</div><div class="dv">'+(r.explosionTxt!=null?ESC(r.explosionTxt):"–")+'×</div><div class="dbar"><i style="width:'+expPct+'%"></i></div></div>'+
        '<div class="dmetric"><div class="dk">Views</div><div class="dv">'+ESC(r.views)+'</div></div>'+
        '<div class="dmetric"><div class="dk">Likes</div><div class="dv">'+ESC(r.likes)+'</div></div>'+
      '</div>'+
    '</article>';
  }

  /* ════════════════════════════════════════════════════════════════
     PORTFOLIO (solo Agencia) — resumen de TODAS las marcas → zoom.
     ════════════════════════════════════════════════════════════════ */
  function brandRowHTML(b){
    var att=brandNeedsAttention(b);
    var sig = (b.exploded||0)>0
      ? '<span class="hot">🔥 '+b.exploded+' explosivo'+(b.exploded>1?"s":"")+' hoy</span>'
      : '<span class="muted">— sin novedad</span>';
    return '<button class="brow'+(att?" attn":"")+'" data-act="open-brand" data-id="'+ESC(b.id)+'">'+
      '<span class="brow-dot" style="background:'+ESC(b.color||"#4f7cff")+'"></span>'+
      '<div class="brow-id"><div class="brow-name">'+ESC(b.name)+'</div><div class="brow-handle">@'+ESC(b.handle||"")+' · Nivel '+(b.level||1)+'</div></div>'+
      '<div class="brow-sig">'+sig+'</div>'+
      '<div class="brow-voice"><span class="bv-k">VOZ</span><span class="bv-v">'+(b.voice||40)+'%</span></div>'+
      (att?'<span class="brow-attn">⚠ Atención</span>':'<span class="brow-attn ok"></span>')+
      '<span class="brow-open">Abrir '+IC.arr+'</span>'+
    '</button>';
  }
  function portfolioHTML(){
    var bs=S.brands||[];
    var totReels=bs.reduce(function(s,b){return s+(b.reels||0);},0);
    var totExp=bs.reduce(function(s,b){return s+(b.exploded||0);},0);
    var attn=bs.filter(brandNeedsAttention).length;
    var stats=[
      ["Marcas", bs.length, "", ""],
      ["Reels · 7 días", totReels, "", ""],
      ["Explosivos", totExp, "en todo el portfolio", "acc"],
      ["Piden atención", attn, attn>0?"revísalas hoy":"todo al día", attn>0?"warn":""]
    ];
    var statbar='<div class="statbar">'+stats.map(function(s){
      return '<div class="stat"><div class="stat-k">'+ESC(s[0])+'</div><div class="stat-v">'+ESC(s[1])+'</div>'+(s[2]?'<div class="stat-d '+s[3]+'">'+ESC(s[2])+'</div>':'')+'</div>';
    }).join("")+'</div>';
    var head='<header class="phead">'+
      '<div><div class="eyebrow"><span class="pip"></span>Portfolio · '+bs.length+' marcas</div>'+
      '<h1 class="h-title">Tus marcas</h1>'+
      '<p class="h-sub">Lo que pasó hoy en cada una. Entra donde haya algo que capitalizar.</p></div>'+
      '<div class="phead-right">'+(S.user.streak>0?'<span class="streak">'+IC.spark+' Racha '+S.user.streak+' días</span>':'')+'</div>'+
    '</header>';
    return '<div class="scroll"><div class="canvas">'+
      head+statbar+
      '<div class="feed-head"><span class="feed-title">Marcas <span class="ct">· '+bs.length+'</span></span></div>'+
      '<div class="brow-list">'+bs.map(brandRowHTML).join("")+'</div>'+
    '</div></div>';
  }

  // Tira de pestañas de marca — SOLO en el Radar de Agencia. Salto rápido entre
  // los dashboards de cada marca + "Todas" para volver al macro (portfolio).
  function brandTabsHTML(){
    return '<div class="brand-tabs">'+
      '<button class="btab btab-all" data-act="all-brands" title="Ver todas las marcas">'+IC.layers+' Todas</button>'+
      S.brands.map(function(b){
        var on=b.id===S.brandId;
        return '<button class="btab'+(on?" on":"")+'" data-act="open-brand" data-id="'+ESC(b.id)+'">'+
          '<span class="btab-dot" style="background:'+ESC(b.color||"#4f7cff")+'"></span>'+ESC(b.name)+
          ((b.exploded||0)>0?'<span class="btab-n">'+b.exploded+'</span>':'')+
        '</button>';
      }).join("")+
    '</div>';
  }
  function statbarHTML(){
    var st=S.stats||{competitors:0,reels_week:0,exploded_week:0,stolen_today:0}; var b=brand();
    var stats=[
      ["Rivales activos", st.competitors, "", ""],
      ["Reels · 7 días", st.reels_week, (st.exploded_week>0?st.exploded_week+" explotaron":""), "up"],
      ["Explosivos", st.exploded_week, "sobre su media", "acc"],
      ["Tu voz", (b.voice||40)+"%", "nivel "+(b.level||1), ""]
    ];
    return '<div class="statbar">'+stats.map(function(s){
      return '<div class="stat"><div class="stat-k">'+ESC(s[0])+'</div><div class="stat-v">'+ESC(s[1])+'</div>'+(s[2]?'<div class="stat-d '+s[3]+'">'+ESC(s[2])+'</div>':'')+'</div>';
    }).join("")+'</div>';
  }
  function dashboardHTML(){
    var st=S.stats||{competitors:0,reels_week:0,exploded_week:0,stolen_today:0}; var b=brand();
    var sorted=feedReels();
    var line = st.exploded_week>0
      ? 'Mientras no mirabas, <b>'+st.exploded_week+' reel'+(st.exploded_week>1?"s":"")+' explotaron</b> en tu nicho. Esto es lo que merece tu próximo guion.'
      : 'Tus <b>'+st.competitors+' rivales</b> publicaron '+st.reels_week+' reels esta semana. Esto es lo que merece tu próximo guion.';
    var head='<header class="phead">'+
      '<div><div class="eyebrow"><span class="pip"></span>Radar · @'+ESC(b.handle||S.user.handle||"tu_cuenta")+'</div>'+
      '<h1 class="h-title">Señales de hoy</h1>'+
      '<p class="h-sub">'+line+'</p></div>'+
      '<div class="phead-right">'+(S.user.streak>0?'<span class="streak">'+IC.spark+' Racha '+S.user.streak+' días</span>':'')+'</div>'+
    '</header>';

    if(sorted.length===0){
      return '<div class="scroll"><div class="canvas">'+head+(isAgency()?brandTabsHTML():"")+statbarHTML()+
        trackedManageHTML()+
        voiceOnboardCardHTML()+   // B6: en first-run sin reels, el banner de voz es lo primero que aporta
        nextSeriesHTML("dash")+   // B1+T1: CTA secundario en el Dashboard
        '<div class="rs-empty">'+(S.filter==="fav"?"Sin favoritos aún. Toca la estrella en una señal.":"Sin reels todavía. Añade un competidor o pega un reel para empezar.")+'</div>'+
      '</div></div>';
    }

    var hero=sorted[0], rest=sorted.slice(1);
    var fillCount=Math.min(5,S.reels.length)||5;
    var shown = S.feedExpanded ? rest : rest.slice(0,5);
    var rows = shown.map(reelCardHTML).join("");
    var moreToggle = (!S.feedExpanded && rest.length>5)
      ? '<button class="see-all" data-act="expand-feed">'+IC.repeat+' Ver las '+rest.length+' oportunidades</button>'
      : '';

    return '<div class="scroll"><div class="canvas">'+
      head+
      (isAgency()?brandTabsHTML():"")+
      statbarHTML()+
      trackedManageHTML()+
      opportunityHTML(hero)+
      voiceOnboardCardHTML()+   // B6+T1: banner de voz BAJO la oportunidad — no empuja el hero bajo el fold
      nextSeriesHTML("dash")+   // B1+T1: "tu próxima serie" con CTA secundario en el Dashboard
      (S.reels.length?'<div class="plays">'+whaleHTML(fillCount)+'</div>':'')+
      (rest.length?('<div class="feed-head"><span class="feed-title">Más señales <span class="ct">· '+rest.length+'</span></span>'+filtersHTML()+'</div><div class="feed">'+rows+'</div>'+moreToggle):"")+
    '</div></div>';
  }

  /* T1 · Fábrica de ideas embebida en Radar — input suelto + generadores +
     lista acordeón (idea → guiones → hooks). Reutiliza ideaBlockHTML y los
     handlers existentes (seed-go, gen5ideas, explosion, gen5scripts, gen5hooks).
     Una sola acción primaria en Radar sigue siendo «Hazlo mío»: aquí todo es
     secundario/ghost. */
  // T1+refino: la fábrica de ideas vive en GUIONES, en DOS grupos por estado:
  //   · "Sin desarrollar" — ideas en bruto (gratis), sin guiones. Botón Desarrollar (cuesta).
  //   · "Desarrolladas"   — acordeón idea→guiones→hooks.
  // Una idea es la MISMA entidad: al desarrollarla gana guiones y cambia de grupo
  // en el mismo sitio (no se duplica). Clasificamos por tener guiones/scripts.
  function ideaIsDeveloped(idea){ return !!(idea && idea.scripts && idea.scripts.length>0); }
  // Marca/cliente ⇄ project_id. "default" (marca única sin project) → project_id null.
  function _pidOf(bid){ return (bid && bid!=="default") ? bid : null; }
  function brandNameOf(bid){ var b=(S.brands||[]).filter(function(x){return x.id===bid;})[0]; return b?b.name:null; }
  // La fábrica muestra solo las ideas de la marca activa (en prod /ideas ya viene
  // filtrado por project_id; esto además aísla las ideas en memoria del demo).
  function ideaBelongsToActiveBrand(idea){ return (idea._brand||"default") === (S.brandId||"default"); }
  function ideasZoneHTML(){
    var ideas=(S.ideas||[]).filter(ideaBelongsToActiveBrand);   // solo la marca activa
    var raw=ideas.filter(function(i){ return !ideaIsDeveloped(i); });
    var dev=ideas.filter(ideaIsDeveloped);
    var rawList=raw.length
      ? '<div class="ideas-list">'+raw.map(rawIdeaHTML).join("")+'</div>'
      : '<div class="rs-empty" style="margin-top:10px">Nada pendiente. Apunta una idea con 💡 «Apunta una idea» (arriba).</div>';
    var devList=dev.length
      ? '<div class="ideas-list">'+dev.map(ideaBlockHTML).join("")+'</div>'
      : '<div class="rs-empty" style="margin-top:10px">Aún ninguna desarrollada. Desarrolla una de arriba o genera 5 de golpe.</div>';
    return '<section class="ideas-zone">'+
      '<div class="feed-head"><span class="feed-title">'+IC.bulb+' Sin desarrollar'+(raw.length?' <span class="ct">· '+raw.length+'</span>':'')+'</span>'+
        '<button class="btn btn-sm btn-secondary" data-act="gen5ideas">'+IC.spark+' 5 ideas</button>'+
      '</div>'+
      '<p class="ideas-zone-sub">Ideas en bruto, guardadas gratis. Desarrolla cuando quieras (cuesta '+COST.scripts5+' créditos).</p>'+
      '<button class="explosion-btn" data-act="explosion">💥 Explosión creativa<span>5 ideas × 5 guiones × 5 hooks — '+COST.explosion+' créditos</span></button>'+
      rawList+
      '<div class="feed-head" style="margin-top:30px"><span class="feed-title">'+IC.doc+' Desarrolladas'+(dev.length?' <span class="ct">· '+dev.length+'</span>':'')+'</span></div>'+
      devList+
    '</section>';
  }
  // Idea en bruto (sin desarrollar): texto + Desarrollar (indica el coste).
  function rawIdeaHTML(idea){
    var saving=!!idea._saving;
    return '<div class="idea-block idea-raw"'+(saving?' style="opacity:.55"':'')+'>'+
      '<div class="idea-block-head">'+
        '<div class="idea-ic">'+IC.bulb+'</div>'+
        '<div class="idea-text">'+ESC(idea.text)+'</div>'+
        (saving
          ? '<span class="idea-count"><span class="rs-ldr"></span>Guardando…</span>'
          : '<button class="btn btn-sm btn-secondary" data-act="gen5scripts" data-id="'+idea.id+'" title="Genera 5 guiones a partir de esta idea (cuesta '+COST.scripts5+' créditos)">'+IC.bolt+' Desarrollar · '+COST.scripts5+' créd.</button>')+
      '</div>'+
    '</div>';
  }

  /* ════════════════════════════════════════════════════════════════
     IDEAS — fábrica multi-generación (idea → guiones → hooks)
     ════════════════════════════════════════════════════════════════ */
  var BANK_IDEAS=[
    "El error que todos cometen al empezar con esto",
    "Lo que nadie te cuenta antes de automatizar tu negocio",
    "3 señales de que lo estás haciendo mal (y cómo arreglarlo)",
    "Cómo conseguí el mismo resultado en la mitad de tiempo",
    "La herramienta gratis que sustituye a 5 de pago",
    "Por qué dejé de hacerlo a mano (y tú también deberías)",
    "El sistema de 1 persona que parece un equipo de 10",
    "Lo probé una semana y esto fue lo que pasó"
  ];
  var BANK_HOOKS=[
    "Llevo semanas sin hacer esto a mano. Y no, no lo he abandonado.",
    "Si pierdes más de 30 min al día en esto, para y mira.",
    "Nadie te lo dice, pero seguir haciéndolo así te cuesta dinero.",
    "Hay una forma de hacerlo en 1 paso. Casi nadie la usa.",
    "El 90% lo hace mal. Y se arregla con una sola decisión.",
    "Antes de pagar por la próxima herramienta, mira esto.",
    "Esto me devolvió 6 horas a la semana. Montarlo, una tarde.",
    "Te lo enseño en 3 pasos y sin escribir una línea de código."
  ];
  function pick(arr,n,seed){ var a=arr.slice(); var out=[]; for(var i=0;i<n;i++){ var idx=(seed+i*3)%a.length; out.push(a.splice(idx%a.length,1)[0]||arr[(seed+i)%arr.length]); } return out; }
  var _gid=0; function gid(p){ return p+(++_gid); }

  /* ── modelo unificado de pieza/guión: TODO lo creado aterriza aquí ─────
     (robar un reel, llena-mi-semana, guardar desde ideas). Nada se pierde. */
  var _gseq=0;
  function addGuion(p){
    var g={ id:gid("g"), seq:++_gseq, title:(p.title||p.hook||"Guión"),
      hook:p.hook||"", beats:p.beats||[], close:p.close||"",
      hooks:p.hooks||[], expanded:false,
      from:p.from||null, brand:brand().name, type:p.type||"guión", status:"draft" };
    S.guiones.unshift(g); return g.id;
  }
  function guionById(id){ return S.guiones.filter(function(x){return x.id===id;})[0]; }

  function makeScript(ideaText, seed){
    var hook=pick(BANK_HOOKS,1,seed)[0];
    return { id:gid("sc"), hook:hook,
      beats:["Te lo cuento porque a mí me cambió la forma de trabajar.","Paso uno: lo más simple, lo que casi nadie hace.","Paso dos: aquí está el 80% del resultado.","Paso tres: lo dejas funcionando y te olvidas."],
      close:"Guárdate esto y dime en comentarios por dónde empiezas.",
      hooks:null, savedHooks:{}, guionId:null, saved:false, expanded:false, idea:ideaText };
  }
  // _brand: marca/cliente al que pertenece la idea (project_id). Por defecto la
  // marca activa; se puede forzar otra (apuntar para el cliente B desde el A).
  function makeIdea(text, seed, brandId){ return { id:gid("id"), text:text, scripts:[], expanded:true, seed:seed, _brand:(brandId||S.brandId||"default") }; }

  function ideaBlockHTML(idea){
    var n=idea.scripts.length;
    var open=idea.expanded!==false;
    var scripts=idea.scripts.map(scriptBlockHTML).join("");
    var genBtn=n===0
      ? '<button class="btn btn-sm btn-primary" data-act="gen5scripts" data-id="'+idea.id+'">'+IC.bolt+' 5 guiones</button>'
      : '<button class="btn btn-sm btn-secondary" data-act="gen5scripts" data-id="'+idea.id+'">+ 5 guiones más</button>';
    var count=n?'<span class="idea-count">'+n+' guion'+(n===1?"":"es")+'</span>':'';
    var caret=n?'<button class="idea-caret'+(open?" open":"")+'" data-act="idea-toggle" data-id="'+idea.id+'" title="'+(open?"Plegar":"Desplegar")+'">'+IC.chev+'</button>':'';
    return '<div class="idea-block">'+
      '<div class="idea-block-head"><div class="idea-ic">'+IC.bulb+'</div><div class="idea-text">'+ESC(idea.text)+'</div>'+count+genBtn+caret+'</div>'+
      ((n&&open)?'<div class="idea-scripts">'+scripts+'</div>':'')+
    '</div>';
  }
  function scriptBlockHTML(sc){
    var open=!!sc.expanded;
    var hooks=sc.hooks?('<div class="sc-hooks">'+sc.hooks.map(function(h,i){
      var done=sc.savedHooks&&sc.savedHooks[i];
      var act=done?'<span class="sc-hook-done">'+IC.check+' Añadido</span>'
                  :'<button class="sc-hook-save" data-act="save-hook" data-id="'+sc.id+'" data-i="'+i+'">'+IC.plus+' Añadir</button>';
      return '<div class="sc-hook"><span class="hn">'+String(i+1).padStart(2,"0")+'</span><span>'+ESC(h)+'</span>'+act+'</div>';
    }).join("")+'</div>'):'';
    var hooksBtn=sc.hooks?'':'<button class="btn btn-sm btn-ghost" data-act="gen5hooks" data-id="'+sc.id+'">'+IC.hook+' 5 hooks</button>';
    var saved=sc.saved?'<span class="sc-saved">'+IC.check+' En Guiones</span>':'<button class="btn btn-sm btn-secondary" data-act="save-script" data-id="'+sc.id+'">Guardar guión</button>';
    // Acordeón: el texto completo (cuerpo + cierre) ya vive en el objeto (sc.beats/sc.close);
    // se despliega in situ, SIN fetch. Mismo markup que scriptRevealHTML. Mismo patrón que
    // el caret de las ideas (.idea-caret + .open). Colapsado por defecto.
    var beats=(sc.beats||[]).map(function(b,i){return '<div class="beat"><span class="n">'+String(i+1).padStart(2,"0")+'</span><span>'+ESC(b)+'</span></div>';}).join("");
    var full=(open&&(beats||sc.close))?('<div class="sc-full">'+
        (beats?'<div class="script-body">'+beats+'</div>':'')+
        (sc.close?'<div class="script-close">'+ESC(sc.close)+'</div>':'')+
      '</div>'):'';
    var caret='<button class="idea-caret sc-caret'+(open?" open":"")+'" data-act="sc-toggle" data-id="'+sc.id+'" aria-expanded="'+(open?"true":"false")+'" title="'+(open?"Plegar":"Ver guión completo")+'" aria-label="'+(open?"Plegar guión":"Ver guión completo")+'">'+IC.chev+'</button>';
    return '<div class="sc-block'+(sc.saved?" is-saved":"")+(open?" open":"")+'">'+
      '<div class="sc-hook-line" data-act="sc-toggle" data-id="'+sc.id+'"><span class="sc-hook-t">'+ESC(sc.hook)+'</span>'+caret+'</div>'+
      full+
      '<div class="sc-actions">'+hooksBtn+saved+'</div>'+
      hooks+
    '</div>';
  }

  /* ════════════════════════════════════════════════════════════════
     GUIONES — validados (guardados desde Ideas / robados)
     ════════════════════════════════════════════════════════════════ */
  // Curva de retención de MUESTRA (demo). La real vendrá de Instagram Insights (OAuth).
  function retentionPts(vsMedian){
    return (vsMedian||1) >= 3 ? [100,94,87,80,74,69,65,62] : [100,80,65,54,46,41,37,34];
  }
  // Vista "Rendimiento del guion": cómo traccionó el reel publicado → entrena el Cerebro.
  function guiPerfHTML(){
    var g=guionById(S.perfGuion); if(!g) return '<div class="pad">—</div>';
    var p=g.published||{}; var pts=retentionPts(p.vsMedian); var hold=pts[3];
    var W=560,H=150,n=pts.length;
    var co=pts.map(function(v,i){ return [Math.round(i/(n-1)*W), Math.round(H-(v/100)*(H-10)-5)]; });
    var line=co.map(function(c,i){ return (i?"L":"M")+c[0]+" "+c[1]; }).join(" ");
    var area=line+" L"+W+" "+H+" L0 "+H+" Z";
    var dots=co.map(function(c){ return '<circle cx="'+c[0]+'" cy="'+c[1]+'" r="3"/>'; }).join("");
    var dur=p.dur||"0:40";
    var metrics=[["VIEWS",fmtNum(p.views||0)],["LIKES",fmtNum(p.likes||0)],["RETENCIÓN","~"+hold+"%"],["VS TU MEDIA",(p.vsMedian||1)+"×"]];
    var voicePct=brand().voice||40;
    return '<div class="perf">'+
      '<div class="perf-eyebrow">'+IC.chart+' Reel publicado'+(g.from?' · de tu guion robado a '+ESC(g.from):'')+'</div>'+
      '<h2 class="perf-title">'+ESC(g.title)+'</h2>'+
      '<div class="perf-metrics">'+metrics.map(function(m){ return '<div class="pm"><div class="pm-k">'+m[0]+'</div><div class="pm-v">'+ESC(m[1])+'</div></div>'; }).join("")+'</div>'+
      '<div class="perf-ret">'+
        '<div class="perf-ret-h">Retención <span class="muted">· '+hold+'% sigue a la mitad del reel</span> <span class="perf-sample">muestra</span></div>'+
        '<svg class="ret-svg" viewBox="0 0 '+W+' '+H+'" preserveAspectRatio="none"><path class="ret-area" d="'+area+'"/><path class="ret-line" d="'+line+'"/>'+dots+'</svg>'+
        '<div class="perf-ret-x"><span>0s</span><span>'+ESC(dur)+'</span></div>'+
      '</div>'+
      '<div class="brain-section-t" style="margin-top:6px">Qué funcionó aquí</div>'+
      '<div class="learn"><div class="learn-list">'+
        ['<div class="learn-item">'+IC.check+'<span>El hook retiene al <b>'+pts[1]+'%</b> en los primeros segundos — gancho fuerte.</span></div>',
         '<div class="learn-item">'+IC.check+'<span>Duración <b>'+ESC(dur)+'</b>'+((p.vsMedian||1)>=3?' — en tu punto dulce.':'.')+'</span></div>',
         '<div class="learn-item">'+IC.check+'<span>Superó tu media <b>'+(p.vsMedian||1)+'×</b>.</span></div>'].join("")+
      '</div></div>'+
      '<div class="perf-foot">'+IC.brain+' Esto <b>entrena tu Cerebro</b> (voz al '+voicePct+'%): cada semana analizo cómo traccionan tus reels y genero más en la línea de los que petan.</div>'+
    '</div>';
  }
  function guiCardHTML(g){
    var rec=g.status==="recorded";
    var pill=rec?'<span class="gui-pill done">'+IC.check+' Grabado</span>':'<span class="gui-pill">Por grabar</span>';
    var nh=(g.hooks&&g.hooks.length)||0;
    var meta=(g.from?'robado de '+ESC(g.from)+' · ':'')+'voz '+ESC(g.brand);
    var pub;
    if(g.published && g.published.pending){
      pub='<span class="gui-pub pending" title="Vinculado · pendiente de análisis">'+IC.repeat+' reel vinculado · se analiza en el próximo refresco</span>';
    } else if(g.published){
      pub='<button class="gui-pub'+((g.published.vsMedian||0)>=3?" hot":"")+'" data-act="gui-perf" data-id="'+g.id+'" title="Ver rendimiento y retención">'+IC.chart+' '+fmtNum(g.published.views)+' views · '+(g.published.vsMedian||1)+'× tu media · ver →</button>';
    } else if(g.status==="recorded"){
      pub='<button class="gui-link" data-act="gui-link-reel" data-id="'+g.id+'" title="Pega el link del reel publicado en Instagram para analizarlo y entrenar tu Cerebro">'+IC.repeat+' Vincular reel publicado</button>';
    } else { pub=''; }
    var toggle=nh?'<button class="gui-hooks-toggle'+(g.expanded?" open":"")+'" data-act="gui-hooks" data-id="'+g.id+'">'+IC.hook+' '+nh+' hook'+(nh===1?"":"s")+' alternativo'+(nh===1?"":"s")+' '+IC.chev+'</button>':'';
    var hooksList=(nh&&g.expanded)?'<div class="gui-hooks">'+g.hooks.map(function(h,i){
      return '<div class="gui-hook"><span class="hn">'+String(i+1).padStart(2,"0")+'</span><span class="gui-hook-t">'+ESC(h)+'</span>'+
        '<button class="gui-hook-use" data-act="gui-use-hook" data-id="'+g.id+'" data-i="'+i+'" title="Usar como apertura">Usar</button>'+
        '<button class="gui-hook-del" data-act="gui-del-hook" data-id="'+g.id+'" data-i="'+i+'" title="Quitar variante">'+IC.x+'</button>'+
      '</div>';
    }).join("")+'</div>':'';
    return '<div class="gui-card-wrap">'+
      '<div class="gui-card'+(rec?" is-rec":"")+'">'+
        '<div class="ava bava">'+ESC(initialsOf(g.from||g.brand))+'</div>'+
        '<div class="gui-main"><div class="gui-title">'+ESC(g.title)+'</div><div class="gui-meta">'+meta+'</div>'+pub+toggle+'</div>'+
        pill+
        '<div class="gui-acts">'+
          '<button class="iconbtn" data-act="gui-record" data-id="'+g.id+'" title="Grabar (teleprompter)">'+IC.mic+'</button>'+
          '<button class="iconbtn'+(rec?" on":"")+'" data-act="gui-toggle-rec" data-id="'+g.id+'" title="'+(rec?"Marcar por grabar":"Marcar grabado")+'">'+IC.check+'</button>'+
          '<button class="iconbtn danger" data-act="gui-discard" data-id="'+g.id+'" title="Descartar">'+IC.x+'</button>'+
        '</div>'+
      '</div>'+
      hooksList+
    '</div>';
  }
  function guionesHTML(){
    var all=S.guiones.filter(function(g){return g.status!=="discarded";});
    var filt=S.guiFilter||"all";
    var items=all.filter(function(g){ if(filt==="draft") return g.status==="draft"; if(filt==="recorded") return g.status==="recorded"; return true; });
    var cAll=all.length, cDraft=all.filter(function(g){return g.status==="draft";}).length, cRec=all.filter(function(g){return g.status==="recorded";}).length;
    var chips='<div class="filters">'+[["all","Todos",cAll],["draft","Por grabar",cDraft],["recorded","Grabados",cRec]].map(function(f){
      return '<button class="fchip'+(filt===f[0]?" on":"")+'" data-act="gui-filter" data-k="'+f[0]+'">'+f[1]+' '+f[2]+'</button>';
    }).join("")+'</div>';
    var body=items.length===0
      ? '<div class="rs-empty" style="margin-top:24px">'+(cAll===0
          ? 'Aún no tienes guiones. Roba un reel en el <b>Radar</b> o apunta una idea (💡 arriba) — todo lo que generes aterriza aquí.'
          : 'Nada en este filtro.')+'</div>'
      : '<div class="gui-list">'+items.map(guiCardHTML).join("")+'</div>';
    return '<div class="scroll"><div class="canvas">'+
      pheadHTML("Guiones · @"+(brand().handle||S.user.handle||""), "Tus guiones", "Todo lo que creas vive aquí. Ordena, descarta lo que no, y graba cuando quieras.")+
      chips+body+
      ideasZoneHTML()+          // T1: fábrica de ideas (idea→guiones→hooks) junto a los guiones
    '</div></div>';
  }

  /* ════════════════════════════════════════════════════════════════
     MÉTRICAS — conexión a Instagram + el círculo de aprendizaje
     (reels publicados ↔ guiones que los originaron → la IA aprende qué
      funciona en TU cuenta y mejora tus sugerencias y tu voz).
     ════════════════════════════════════════════════════════════════ */
  function connectIgHTML(){
    return '<div class="scroll"><div class="pad">'+
      '<div class="ig-connect">'+
        '<div class="ig-connect-ic">'+IC.ig+'</div>'+
        '<h2 class="ig-connect-h serif">Conecta tu Instagram</h2>'+
        '<p class="ig-connect-p">Aquí se cierra el círculo. El sistema mira lo que <b>publicas</b> y aprende qué hooks, qué temas y qué duración funcionan <b>en tu cuenta</b> — y con eso te da reels cada vez más tuyos. Cuanto más publicas, más te conoce.</p>'+
        '<button class="btn btn-lg btn-primary" data-act="ig-connect">'+IC.ig+' Conectar Instagram</button>'+
        '<p class="ig-connect-note">Solo lectura de tus métricas públicas. Sin contraseñas.</p>'+
      '</div>'+
    '</div></div>';
  }
  function fmtK(n){ n=Number(n||0); if(n>=1000){ var v=n/1000; return (v>=10?Math.round(v):v.toFixed(1).replace(/\.0$/,"")).toString().replace(".",",")+"k"; } return String(n); }
  function _mean(a){ if(!a.length) return 0; return Math.round(a.reduce(function(s,x){return s+x;},0)/a.length); }
  function _median(a){ if(!a.length) return 0; var b=a.slice().sort(function(x,y){return x-y;}); var n=b.length; return n%2?b[(n-1)/2]:Math.round((b[n/2-1]+b[n/2])/2); }
  function metricVideos(){ return (S.metrics&&S.metrics.videos)||[]; }
  function sortedVideos(){
    var v=metricVideos().slice(), s=S.metricSort||"recent";
    if(s==="views") v.sort(function(a,b){return (b.views||0)-(a.views||0);});
    else if(s==="likes") v.sort(function(a,b){return (b.likes||0)-(a.likes||0);});
    else if(s==="comments") v.sort(function(a,b){return (b.comments||0)-(a.comments||0);});
    return v;
  }
  function metricStatsHTML(){
    var v=metricVideos(); var views=v.map(function(x){return x.views||0;}), likes=v.map(function(x){return x.likes||0;}), comments=v.map(function(x){return x.comments||0;});
    var totalV=views.reduce(function(s,x){return s+x;},0), totalL=likes.reduce(function(s,x){return s+x;},0), totalC=comments.reduce(function(s,x){return s+x;},0);
    var eng = totalV>0 ? ((totalL+totalC)/totalV*100) : 0;
    var cards=[
      [fmtK(_mean(views)), "MEDIA VIEWS", fmtK(totalV)+" total", "var(--brand-500)"],
      [fmtK(_median(views)), "MEDIANA VIEWS", "", "#6f93ff"],
      [String(totalL), "TOTAL LIKES", "", "#12a37c"],
      [String(totalC), "TOTAL COMENTARIOS", "", "#5e7d97"],
      [eng.toFixed(1).replace(".",",")+"%", "ENGAGEMENT", "", "#46b277"]
    ];
    return '<div class="met-cards">'+cards.map(function(c){ return '<div class="met-card" style="--c:'+c[3]+'"><div class="met-card-n">'+ESC(c[0])+'</div>'+(c[2]?'<div class="met-card-sub">'+ESC(c[2])+'</div>':'')+'<div class="met-card-l">'+c[1]+'</div></div>'; }).join("")+'</div>';
  }
  function metricChartHTML(){
    var v=metricVideos(), metric=S.metricChart||"views";
    var vals=v.map(function(x){return x[metric]||0;}); var max=Math.max.apply(null,vals.concat([1]));
    var md=_mean(vals), mdn=_median(vals);
    var tabs=[["views","Views"],["likes","Likes"],["comments","Comments"]].map(function(t){ return '<button class="chip-sm'+(metric===t[0]?" on":"")+'" data-act="metric-chart" data-k="'+t[0]+'">'+t[1]+'</button>'; }).join("");
    var rows=v.slice(0,10).map(function(x){
      var val=x[metric]||0, pct=Math.max(2,Math.round(val/max*100));
      var lbl=((x.date||"")+" "+(x.cap||"")).slice(0,22);
      return '<div class="bar-row"><div class="bar-lbl">'+ESC(lbl)+'</div><div class="bar-track"><div class="bar-fill'+(x.top?" is-top":"")+'" style="width:'+pct+'%"></div></div><div class="bar-val">'+fmtK(val)+'</div></div>';
    }).join("");
    var medPct=Math.round(md/max*100), mdnPct=Math.round(mdn/max*100);
    // Alinear el marcador con el ÁREA de barras (track empieza tras el label 180px y deja 60px de valor a la derecha).
    function lpos(p){ return 'calc(180px + (100% - 240px) * '+(p/100)+')'; }
    var lines='<div class="bar-line media" style="left:'+lpos(medPct)+'"><span>Media '+fmtK(md)+'</span></div><div class="bar-line mediana" style="left:'+lpos(mdnPct)+'"><span>Mediana '+fmtK(mdn)+'</span></div>';
    return '<div class="met-chart"><div class="met-chart-head"><div class="chips-sm">'+tabs+'</div></div><div class="bars">'+lines+rows+'</div></div>';
  }
  function metricGridHTML(){
    var v=sortedVideos();
    var sortTabs=[["recent","Recientes"],["views","Vistas"],["likes","Likes"],["comments","Comentarios"]].map(function(t){ return '<button class="fchip'+((S.metricSort||"recent")===t[0]?" on":"")+'" data-act="metric-sort" data-k="'+t[0]+'">'+t[1]+'</button>'; }).join("");
    var cards=v.map(function(x){
      var thumbInner=x.thumb?'<img src="'+ESC(x.thumb)+'" alt="">':'<div class="play"></div>';
      var badges=(x.top?'<span class="vid-badge top">TOP</span>':"")+(x.viral?'<span class="vid-badge viral">VIRAL</span>':"");
      var link=x.from_guion
        ? '<div class="pub-link"'+(x.vsMedian?' title="'+x.vsMedian+'× tu media"':'')+'>'+IC.doc+' de tu guion «'+ESC(x.from_guion)+'»'+(x.vsMedian?' · <b>'+x.vsMedian+'×</b> tu media':'')+'</div>'
        : '<div class="pub-link organic">○ orgánico · sin guion</div>';
      return '<div class="vid-card"><div class="vid-thumb thumb">'+thumbInner+'<span class="dur">'+ESC(x.dur||"0:30")+'</span>'+(badges?'<div class="vid-badges">'+badges+'</div>':"")+'</div>'+
        '<div class="vid-body"><div class="vid-cap">'+ESC(x.cap)+'</div>'+
        '<div class="vid-metrics"><span>'+IC.eye+' '+fmtK(x.views)+'</span><span>'+IC.heart+' '+fmtK(x.likes)+'</span><span>'+IC.chat+' '+(x.comments||0)+'</span></div>'+
        '<div class="vid-date">'+ESC(x.date||"")+'</div>'+link+'</div></div>';
    }).join("");
    return '<div class="more-head" style="margin-top:8px"><span class="more-title">Tus reels publicados</span><div class="filters">'+sortTabs+'</div></div><div class="vid-grid">'+cards+'</div>';
  }
  function metricsHTML(){
    if(!S.igConnected) return connectIgHTML();
    var m=S.metrics||{}; var b=brand();
    var learned=(m.learned||[]).map(function(l){ return '<div class="learn-item">'+IC.check+'<span>'+ESC(l)+'</span></div>'; }).join("");
    var top=m.top?('<div class="met-top">🏆 <b>Top:</b> '+ESC(m.top.title)+' — '+ESC(m.top.views)+' views ↗</div>'):"";
    var hasVideos=metricVideos().length>0;
    return '<div class="scroll"><div class="canvas">'+
      pheadHTML("Métricas · @"+(b.handle||S.user.handle||""), "Métricas", "Tus reels al detalle — y lo que el sistema aprende de ellos para crear mejor.")+
      '<div class="met-acct"><span class="met-acct-ig">'+IC.ig+' @'+ESC(b.handle||"tu_cuenta")+'</span>'+
        '<button class="btn btn-sm btn-primary" data-act="metric-refresh">Actualizar reels</button>'+
        '<span class="met-acct-info">'+ESC(m.analyses_left||"1/1")+' análisis restantes esta semana</span>'+
        '<span style="flex:1"></span><button class="btn btn-sm btn-ghost" data-act="ig-disconnect">Desvincular</button></div>'+
      (hasVideos?metricStatsHTML():"")+
      '<div class="learn"><div class="learn-head">'+IC.brain+'<span>Lo que el sistema aprendió de ti</span></div>'+
        '<div class="learn-list">'+(learned||'<div class="learn-item" style="opacity:.6">Publica un par de reels creados aquí y empezaré a ver patrones.</div>')+'</div>'+
        '<div class="learn-foot">Esto afina tu voz (al '+(b.voice||40)+'%) y reordena tus oportunidades del Dashboard. El círculo se cierra.</div>'+
      '</div>'+
      top+
      (hasVideos?(metricChartHTML()+metricGridHTML()):'<div class="rs-empty">Pulsa “Actualizar reels” para traer tus métricas.</div>')+
    '</div></div>';
  }

  /* ════════════════════════════════════════════════════════════════
     CEREBRO — la base de conocimiento de la marca: lo que el sistema
     sabe de ti y cómo crece (voz + métricas + competidores + historial).
     Es el moat hecho visible (principio II del manifiesto).
     ════════════════════════════════════════════════════════════════ */
  function hasRealVoice(){ return !!(S.voice && S.voice.has_profile); }
  function brainVoice(b){
    // v0.19: perfil de voz REAL (GET /api/voice) si existe; si no, demo del nicho.
    var vp=S.voice;
    if(vp && vp.has_profile){
      return {
        tono: vp.tone||"",
        frases: (vp.phrases||[]).map(function(p){ return '"'+p+'"'; }),
        estructura: vp.structure||"",
        duracion: vp.avg_duration ? ("~"+vp.avg_duration+"s objetivo") : "",
        evita: vp.avoid||""
      };
    }
    if(b && b.voice_profile) return b.voice_profile;
    if(!isDemo()){
      // Prod sin perfil aún: no mostrar voz ajena — invitar a enseñarla.
      return { tono:"Aún no conozco tu voz. Enséñamela arriba ↑", frases:[], estructura:"—", duracion:"—", evita:"—" };
    }
    return {
      tono:"Directo y sin postureo. Cuentas las cosas como a un colega en un audio de WhatsApp.",
      frases:['"te lo cuento porque a mí…"','"paso uno… paso dos…"','"guárdate esto"','"y no, no es lo que crees"'],
      estructura:"Hook directo (sin 'hola') → 3 pasos concretos → CTA de guardar/comentar.",
      duracion:"30–45s es tu punto dulce: ahí retienes el doble.",
      evita:"Nada de 'en el panorama actual', 'es fundamental', ni motivacional vacío."
    };
  }
  // Tarjeta de CAPTURA del moat: el creador pega 1-2 reels suyos → aprendemos su voz.
  function voiceCaptureHTML(){
    return '<div class="brain-section-t">Enséñame tu voz</div>'+
      '<div class="voice-capture">'+
        '<p class="vc-lead">Pega lo que dices en <b>1-2 reels TUYOS</b>. Aprendo a sonar como tú — y tu próximo «Hazlo mío» ya saldrá con tu voz, no genérico.</p>'+
        '<textarea class="vc-ta" id="rsVoiceText" rows="5" placeholder="Pega aquí la transcripción de tus reels (lo que dices)…"></textarea>'+
        '<button class="btn btn-md btn-primary" data-act="voice-onboard">'+IC.spark+' Aprender mi voz</button>'+
      '</div>';
  }
  /* B6 + T1 (IDI): onboarding de voz como 2º punto de entrada — en el Dashboard
     es un BANNER delgado (no una card con CTA primario): no compite con la
     Oportunidad #1 ni la empuja bajo el fold. El CTA (secundario) lleva al
     Cerebro, donde vive el formulario completo (voiceCaptureHTML). Si ya hay
     perfil de voz, no renderiza nada. */
  function voiceOnboardCardHTML(){
    if(hasRealVoice()) return '';
    return '<div class="voice-banner">'+
      '<span class="vb-ic">'+IC.mic+'</span>'+
      '<span class="vb-text"><b>Enséñame tu voz</b> — pega 1-2 reels tuyos y tu próximo «Hazlo mío» saldrá sonando a ti, no genérico.</span>'+
      '<button class="btn btn-sm btn-secondary" data-act="tab" data-k="brain">Enseñar mi voz</button>'+
    '</div>';
  }
  function voiceEvidenceHTML(){
    var ev=(S.voice&&S.voice.evidence)||[];
    if(!ev.length) return '';
    return '<div class="brain-section-t">Lo que he aprendido de ti <span class="brain-tag">de '+(S.voice.source_count||0)+' reels tuyos</span></div>'+
      '<div class="learn" style="margin-bottom:14px"><div class="learn-list">'+
        ev.map(function(e){ return '<div class="learn-item">'+IC.check+'<span>'+ESC(e)+'</span></div>'; }).join("")+
      '</div></div>'+
      // Refinar: acumula más reels tuyos → sube confianza (POST /api/voice/refine).
      '<div class="voice-refine" style="margin-bottom:18px"><button class="btn btn-sm btn-secondary" data-act="voice-refine">'+IC.spark+' Refinar mi voz</button><span class="vr-hint" style="margin-left:10px;color:var(--text-tertiary);font-size:12.5px">Pega más reels tuyos y subo el % de voz.</span></div>';
  }
  function brainCompetitors(){
    var by={}; (S.reels||[]).forEach(function(r){ var h=r.creator&&r.creator.handle; if(!h) return; by[h]=(by[h]||0)+1; });
    return Object.keys(by).map(function(h){ return {handle:h, n:by[h]}; }).sort(function(a,b){return b.n-a.n;});
  }
  // T3: lista REAL de competidores seguidos (con id de tracking → permite dejar de
  // seguir). Se carga aparte del feed; al resolver, repinta las vistas que la
  // muestran (Cerebro y Radar — trackedManageHTML) si están abiertas.
  function loadTracked(){
    apiGet("/api/tracked-creators").then(function(r){
      if(r.ok && r.d && Array.isArray(r.d.tracked)){ S.tracked=r.d.tracked; if(S.tab==="brain"||S.tab==="dashboard") render(); }
    });
  }
  function brainHTML(){
    var b=brand();
    var v=brainVoice(b);
    var voicePct = hasRealVoice() ? Math.max(6,Math.min(100,S.voice.confidence||0)) : Math.max(6,Math.min(100,b.voice||40));
    var nextLevel=Math.min(5,(b.level||1)+1);
    var toNext=Math.max(2,Math.round((20*(b.level||1)+30 - voicePct)/1.5));
    var comps=brainCompetitors();
    var nGuiones=S.guiones.filter(function(g){return g.status!=="discarded";}).length;
    var nPublished=(S.metrics&&S.metrics.videos)?S.metrics.videos.length:0;
    var learned=(S.metrics&&S.metrics.learned)||[];
    // userAssistants es global (index.html); typeof-guard por si aún no cargó.
    var nAsst=0; try{ if(typeof userAssistants!=="undefined" && Array.isArray(userAssistants)) nAsst=userAssistants.length; }catch(e){}

    var sources=[
      [b.reelsAnalyzed||0,"reels tuyos leídos","de aquí modelo tu voz","var(--brand-500)"],
      [comps.length,"competidores vigilados","de aquí saco qué funciona en tu nicho","#3b82f6"],
      [nGuiones,"guiones creados","cada uno refina tu estilo","#22c55e"],
      [nPublished,"publicados con métricas","cierran el círculo de aprendizaje","#ff2d55"]
    ].map(function(s){ return '<div class="brain-src" style="--c:'+s[3]+'"><div class="brain-src-n">'+s[0]+'</div><div class="brain-src-t">'+s[1]+'</div><div class="brain-src-d">'+s[2]+'</div></div>'; }).join("");

    var frases=v.frases.map(function(f){ return '<span class="voice-chip">'+ESC(f)+'</span>'; }).join("");
    var learnList=learned.length
      ? learned.map(function(l){ return '<div class="learn-item">'+IC.check+'<span>'+ESC(l)+'</span></div>'; }).join("")
      : '<div class="learn-item" style="opacity:.6">Conecta Instagram en Métricas y empezaré a ver qué funciona en tu cuenta.</div>';
    // T3: si tenemos la lista REAL de seguidos (con id), la mostramos con acción de
    // dejar de seguir. Sin ella aún (cargando), caemos al derivado de reels (read-only).
    var tracked = Array.isArray(S.tracked) ? S.tracked : null;
    var compList;
    if(tracked){
      compList = tracked.length
        ? tracked.map(function(t){
            var h=(t.creator&&t.creator.ig_username)||t.ig_username||"";
            var n=(t.reels_count!=null)?(t.reels_count+' reel'+(t.reels_count===1?'':'es')):'';
            return '<div class="brain-comp"><div class="ava bava">'+ESC(initialsOf(h))+'</div>'+
              '<span class="brain-comp-h">@'+ESC(h)+'</span>'+
              '<span class="brain-comp-n">'+ESC(n)+'</span>'+
              '<button class="brain-comp-x" data-act="untrack" data-id="'+ESC(String(t.id))+'" data-handle="'+ESC(h)+'" title="Dejar de seguir a @'+ESC(h)+'" aria-label="Dejar de seguir a @'+ESC(h)+'">'+IC.x+'</button>'+
            '</div>';
          }).join("")
        : '<div class="rs-empty" style="padding:20px">Aún no sigues a ningún competidor. Añádelos desde el Radar o un análisis.</div>';
    } else {
      compList = comps.length
        ? comps.map(function(c){ return '<div class="brain-comp"><div class="ava bava">'+ESC(initialsOf(c.handle))+'</div><span class="brain-comp-h">@'+ESC(c.handle)+'</span><span class="brain-comp-n">'+c.n+' reels analizados</span></div>'; }).join("")
        : '<div class="rs-empty" style="padding:20px">Aún no sigues a nadie. Añade competidores en el Dashboard.</div>';
    }

    return '<div class="scroll"><div class="canvas">'+
      pheadHTML("Cerebro · @"+(b.handle||S.user.handle||""), "El cerebro de "+b.name, "Todo lo que el sistema sabe de esta marca, y cómo crece. Cuanto más creas y publicas, más tuyo suena todo.")+
      // hero de nivel + voz
      '<div class="brain-hero">'+
        '<div class="brain-orb">'+IC.brain+'</div>'+
        '<div class="brain-hero-body">'+
          '<div class="brain-lvl">Nivel '+(b.level||1)+' · '+ESC(ecoLevelName(b.level))+'</div>'+
          '<div class="brain-voiceline">Te conozco al <b>'+voicePct+'%</b></div>'+
          '<div class="eco-bar" style="margin:10px 0 8px"><div class="eco-fill" style="width:'+voicePct+'%"></div></div>'+
          '<div class="brain-next">Te faltan ~'+toNext+' piezas para el <b>Nivel '+nextLevel+'</b>, donde tus guiones salen casi sin retoques.</div>'+
        '</div>'+
      '</div>'+
      // CAPTURA del moat (si aún no hay voz) o EVIDENCIA real (si ya aprendió)
      (hasRealVoice() ? voiceEvidenceHTML() : voiceCaptureHTML())+
      // fuentes del conocimiento
      '<div class="brain-section-t">De qué me alimento</div>'+
      '<div class="brain-sources">'+sources+'</div>'+
      // lo que sé de tu voz
      '<div class="brain-section-t">Lo que sé de tu voz</div>'+
      '<div class="brain-voice">'+
        '<div class="voice-row"><span class="voice-k">Tono</span><span class="voice-val">'+ESC(v.tono)+'</span></div>'+
        '<div class="voice-row"><span class="voice-k">Tus frases</span><span class="voice-val">'+frases+'</span></div>'+
        '<div class="voice-row"><span class="voice-k">Estructura</span><span class="voice-val">'+ESC(v.estructura)+'</span></div>'+
        '<div class="voice-row"><span class="voice-k">Duración</span><span class="voice-val">'+ESC(v.duracion)+'</span></div>'+
        '<div class="voice-row"><span class="voice-k">Evito</span><span class="voice-val">'+ESC(v.evita)+'</span></div>'+
      '</div>'+
      // T2: tus asistentes — estilos propios para guionizar, LISTADOS inline
      // (visibilidad del estado, reconocer>recordar). Reusa los CRUD globales
      // (openAssistantModal/editAssistant/deleteAssistant + el modal existente).
      // «Gestionar» abre el panel legacy completo (reparentado, data-act=legacy).
      '<div class="brain-section-t">Tus asistentes'+(nAsst?' <span class="brain-tag">'+nAsst+'</span>':'')+'</div>'+
      brainAsstListHTML(nAsst)+
      '<div class="cluster cluster-sm" style="margin:12px 0 18px;gap:10px">'+
        '<button class="btn btn-md btn-secondary" onclick="openAssistantModal()">'+IC.bulb+' Nuevo asistente</button>'+
        '<button class="btn btn-md btn-ghost" data-act="legacy" data-k="assistants">'+IC.gear+' Gestionar</button>'+
      '</div>'+
      // lo que funciona (métricas)
      '<div class="brain-section-t">Lo que funciona en tu cuenta'+(learned.length?' <span class="brain-tag">de tus métricas</span>':'')+'</div>'+
      '<div class="learn" style="margin-bottom:18px"><div class="learn-list">'+learnList+'</div></div>'+
      nextSeriesHTML("brain")+   // B1: la sugerencia de próxima serie, justo bajo lo que funciona (aquí SÍ primaria — T1)
      // de quién aprendo
      '<div class="brain-section-t">De quién aprendo</div>'+
      '<div class="brain-comps">'+compList+'</div>'+
    '</div></div>';
  }

  // T2: lista inline de asistentes en Cerebro. Lee el global userAssistants
  // (cargado por loadAssistants en el arranque y refrescado tras cada CRUD vía
  // RadarLoop.refresh). Editar/Borrar usan los handlers globales + su modal.
  function brainAsstListHTML(n){
    var arr=[]; try{ if(typeof userAssistants!=="undefined" && Array.isArray(userAssistants)) arr=userAssistants; }catch(e){}
    if(!arr.length){
      return '<div class="rs-empty" style="padding:18px;margin-top:4px">Aún no tienes asistentes. Crea tu primer estilo con tu tono y tus reglas.</div>';
    }
    return '<div class="brain-asst-list">'+arr.map(function(a){
      var name=ESC(a.name||"Asistente");
      var prev=(a.instructions||"").trim();
      var prevTxt=ESC(prev.slice(0,90))+(prev.length>90?"…":"");
      var aid=ESC(String(a.id));
      return '<div class="brain-asst-item">'+
        '<div class="ava bava">'+ESC(initialsOf(a.name||"A"))+'</div>'+
        '<div class="brain-asst-meta"><div class="brain-asst-name">'+name+(a.is_default?' <span class="brain-tag">default</span>':'')+'</div>'+
          (prevTxt?'<div class="brain-asst-prev">'+prevTxt+'</div>':'')+'</div>'+
        '<button class="brain-asst-act" onclick="editAssistant(\''+aid+'\')" aria-label="Editar '+name+'">Editar</button>'+
        '<button class="brain-asst-act del" onclick="deleteAssistant(\''+aid+'\')" aria-label="Borrar '+name+'">Borrar</button>'+
      '</div>';
    }).join("")+'</div>';
  }

  /* ════════════════════════════════════════════════════════════════
     EQUIPO (solo Agencia) — miembros, roles y marcas asignadas.
     Pool de créditos compartido de cuenta (sin reparto por marca).
     ════════════════════════════════════════════════════════════════ */
  function teamMembers(){
    var bn=S.brands.map(function(b){return b.name;});
    return [
      {name:"Bernat C.", role:"Owner",        initials:"BC", color:"#4f7cff", brands:bn},
      {name:"María L.",  role:"Editor",       initials:"ML", color:"#12a37c", brands:bn.slice(1,3)},
      {name:"Jordi P.",  role:"Editor",       initials:"JP", color:"#e0556b", brands:bn.slice(3,4)},
      {name:"Aïda R.",   role:"Solo lectura", initials:"AR", color:"#6d6bf6", brands:bn.slice(0,1)}
    ];
  }
  function teamHTML(){
    // En prod pinta los miembros reales (S.team, cargado por loadTeam); en demo, el pool demo.
    var members=(!isDemo() && Array.isArray(S.team)) ? S.team : teamMembers();
    var roleCls={"Owner":"owner","Editor":"editor","Solo lectura":"viewer"};
    var stats=[
      ["Miembros", members.length, "", ""],
      ["Marcas", S.brands.length, "", ""],
      ["Editores", members.filter(function(m){return m.role==="Editor";}).length, "", ""],
      ["Créditos", "pool", "compartido de cuenta", "acc"]
    ];
    var statbar='<div class="statbar">'+stats.map(function(s){
      return '<div class="stat"><div class="stat-k">'+ESC(s[0])+'</div><div class="stat-v">'+ESC(s[1])+'</div>'+(s[2]?'<div class="stat-d '+s[3]+'">'+ESC(s[2])+'</div>':'')+'</div>';
    }).join("")+'</div>';
    var rows=members.map(function(m){
      var chips=(m.brands||[]).map(function(bn){return '<span class="mchip">'+ESC(bn)+'</span>';}).join("")||'<span class="mchip muted">sin marcas</span>';
      return '<div class="mrow">'+
        '<span class="mava" style="background:'+ESC(m.color)+'">'+ESC(m.initials)+'</span>'+
        '<div class="mrow-id"><div class="mrow-name">'+ESC(m.name)+'</div><span class="mrole role-'+(roleCls[m.role]||"viewer")+'">'+ESC(m.role)+'</span></div>'+
        '<div class="mrow-brands">'+chips+'</div>'+
        '<button class="iconbtn" data-act="team-edit" title="Gestionar miembro">'+IC.chev+'</button>'+
      '</div>';
    }).join("");
    return '<div class="scroll"><div class="canvas">'+
      pheadHTML("Equipo · Agencia", "Tu equipo", "Quién puede tocar qué marca. Los créditos son un pool compartido de la cuenta.")+
      statbar+
      '<div class="feed-head"><span class="feed-title">Miembros <span class="ct">· '+members.length+'</span></span><button class="btn btn-sm btn-primary" data-act="team-invite">'+IC.plus+' Invitar miembro</button></div>'+
      '<div class="mrow-list">'+rows+'</div>'+
    '</div></div>';
  }

  /* ════════════════════════════════════════════════════════════════
     OVERLAYS (gen / script / formatos / teleprompter / fillweek)
     ════════════════════════════════════════════════════════════════ */
  /* T6 (IDI): espera honesta. Los pasos cosméticos venden valor ~8s; si el robo
     real sigue sin responder, pasamos a mensajes HONESTOS (rotación lenta) y
     ofrecemos seguir navegando — la generación termina en segundo plano y avisa
     con un toast. Flow: «reacción directa» + «sentido de control». */
  var HONEST_MSGS=[
    "Tu rival hablaba mucho — dame unos segundos más…",
    "Sigo en ello. Reescribir bien lleva un momento…",
    "Ya casi. Puliendo tu versión…"
  ];
  function generatingHTML(kind){
    var steps=S._genSlow?HONEST_MSGS:(GEN_STEPS[kind]||GEN_STEPS.script);
    return '<div class="gen"><div class="orb"></div><div><div class="gtitle">'+ESC(GEN_TITLE[kind]||"Trabajando")+'</div><div class="gstep" id="rsGenStep">'+ESC(steps[0])+'</div>'+
      (S._genSlow?'<div class="gen-bg"><div class="gen-bg-hint">No hace falta que esperes aquí: el guion aterriza en Guiones igualmente.</div><button class="btn btn-md btn-secondary" data-act="gen-background">Seguir navegando — te aviso al terminar</button></div>':'')+
    '</div></div>';
  }
  function conveyorHTML(){
    var items=[["record",IC.mic,"Grábalo ahora","Teleprompter listo · gratis",true],["hooks",IC.hook,"5 hooks alternativos","El hook es el 80% del reel",false],["carousel",IC.layers,"Conviértelo en carrusel","La misma idea, en post",false],["linkedin",'<span style="font-weight:800;font-size:13px">in</span>',"Versión LinkedIn","Llega a otro público",false],["x",'<span style="font-weight:800;font-size:15px">𝕏</span>',"Hilo para X","Exprime el mismo ángulo",false],["serie",IC.repeat,"Genérame una serie de 3","Contenido para toda la semana",false]];
    var rows=items.map(function(it){ var k=it[0],d=!!S.done[k]; var lbl=d?(k==="record"?"Grabado ✓":"Hecho ✓"):it[2];
      return '<button class="chain'+(it[4]?" feature":"")+(d?" done":"")+'" '+(d?"":'data-act="chain" data-k="'+k+'"')+'><div class="cic">'+(d?IC.check:it[1])+'</div><div class="ctext"><div class="ct">'+ESC(lbl)+'</div><div class="cd">'+ESC(it[3])+'</div></div>'+(d?"":'<span class="arr">'+IC.arr+'</span>')+'</button>'; }).join("");
    return '<div class="belt"><div class="belt-h"><h4>¿Y ahora?</h4></div><p class="belt-sub">Ya tienes el guión. Multiplícalo en un toque — cada formato es una pieza más sin volver a pensar.</p><div class="belt-grid">'+rows+'</div></div>';
  }
  function scriptRevealHTML(){
    var r=S.reel,s=r.script||{hook:"",beats:[],close:""};
    var beats=(s.beats||[]).map(function(b,i){return '<div class="beat"><span class="n">'+String(i+1).padStart(2,"0")+'</span><span>'+ESC(b)+'</span></div>';}).join("");
    return '<div class="script-wrap fade-in"><div class="script-src"><span>Robado de <b style="color:var(--text-secondary)">@'+ESC(r.creator.handle)+'</b></span><span style="opacity:.4">·</span><span class="voice-tag">'+IC.spark+' En la voz de '+ESC(brand().name)+'</span><span style="opacity:.4">·</span><span class="saved-tag">'+IC.check+' Guardado en Guiones</span></div>'+
      '<h2 class="script-hook">'+ESC(s.hook)+'</h2><div class="script-body">'+beats+'</div>'+(s.close?'<div class="script-close">'+ESC(s.close)+'</div>':'')+conveyorHTML()+'</div>';
  }
  function formatResultHTML(kind){
    var r=S.reel,s=r.script||{hook:"",beats:[],close:""};
    var meta={hooks:["5 hooks, listos para elegir","Tu mismo guión empieza de 5 formas. Cambia el primero y cambia todo."],carousel:["Tu carrusel, slide a slide","Desliza para ver las tarjetas. La idea del reel, ahora también en feed."],linkedin:["Tu post de LinkedIn","Mismo ángulo, registro profesional. Otro público, cero esfuerzo extra."],x:["Tu hilo de X","El guión partido en tuits que encadenan. Copia y publica."],serie:["Tu serie de 3 está lista","Tres días de contenido que se sostienen entre sí. La semana resuelta."]}[kind]||["Listo",""];
    var inner="";
    if(kind==="hooks"){ var hk=r.hooks&&r.hooks.length?r.hooks:[s.hook].concat(s.beats||[]).slice(0,5); inner='<div class="stagger">'+hk.map(function(h,i){return '<div class="hook-item"><span class="hn">'+String(i+1).padStart(2,"0")+'</span><span class="htext">'+ESC(h)+'</span><span class="copy" data-act="copy" data-txt="'+ESC(h)+'">Copiar</span></div>';}).join("")+'</div>'; }
    else if(kind==="carousel"){ var sl='<div class="slide cover"><div class="sidx">PORTADA</div><div class="stext">'+ESC(s.hook)+'</div></div>'; sl+=(s.beats||[]).map(function(b,i){return '<div class="slide"><div class="sidx">'+String(i+1).padStart(2,"0")+'/'+(s.beats.length)+'</div><div class="stext">'+ESC(b)+'</div></div>';}).join(""); sl+='<div class="slide"><div class="sidx">CIERRE</div><div class="stext">'+ESC(s.close)+'</div></div>'; inner='<div class="slides">'+sl+'</div>'; }
    else if(kind==="linkedin"){ inner='<div class="fade-in" style="font-size:15.5px;line-height:1.6;color:var(--text-primary)"><p style="margin:0 0 14px;font-weight:600">'+ESC(s.hook)+'</p>'+(s.beats||[]).map(function(b){return '<p style="margin:0 0 12px">'+ESC(b)+'</p>';}).join("")+'<p style="margin:0 0 12px">'+ESC(s.close)+'</p><p style="margin:0;color:var(--text-tertiary)">#automatización #IA #productividad</p></div>'; }
    else if(kind==="x"){ var tw=[s.hook].concat(s.beats||[],[s.close]); inner='<div class="stagger">'+tw.map(function(t,i){return '<div class="hook-item" style="align-items:flex-start"><span class="hn">'+(i+1)+'/'+tw.length+'</span><span class="htext" style="font-weight:400">'+ESC(t)+'</span></div>';}).join("")+'</div>'; }
    else if(kind==="serie"){ var days=[[r.cap,"El guión que acabas de robar — tu pieza ancla."],["El error que casi todos cometen con esto","Giro: enseña el fallo típico antes de la solución."],["Cómo lo llevé al siguiente nivel","Cierre de serie: tu resultado real + llamada a seguirte."]]; inner='<div class="stagger">'+days.map(function(d,i){return '<div class="serie-item"><div class="sday"><div class="dnum">'+(i+1)+'</div><div class="dlbl">DÍA '+(i+1)+'</div></div><div class="sinfo"><div class="stitle">'+ESC(d[0])+'</div><div class="sdesc">'+ESC(d[1])+'</div></div></div>';}).join("")+'</div>'; }
    var foot='<div class="cluster" style="margin-top:24px;gap:10px"><button class="btn btn-md btn-secondary" data-act="back-script">← Volver al guión</button>'+((kind==="hooks"||kind==="carousel")?'<button class="btn btn-md btn-primary" data-act="record">'+IC.mic+' Grábalo</button>':'')+'</div>';
    return '<div class="script-wrap fade-in"><h2 class="result-head serif">'+ESC(meta[0])+'</h2><p class="result-sub">'+ESC(meta[1])+'</p>'+inner+foot+'</div>';
  }
  // T5 (IDI): todo overlay es un diálogo accesible — role=dialog + aria-modal +
  // aria-label (el título). El foco entra al abrir y vuelve al disparador al
  // cerrar (gestión en render) y Tab no escapa al fondo (trap en onKeydown).
  function overlayShellHTML(inner,title,backAct,closeIcon,extraCls){ return '<div class="overlay'+(extraCls?' '+extraCls:'')+'" role="dialog" aria-modal="true" aria-label="'+ESC(title)+'"><div class="obar"><button class="back" data-act="'+backAct+'" aria-label="'+(closeIcon?"Cerrar":"Volver")+'">'+(closeIcon?IC.x:IC.back)+'</button><span class="otitle">'+ESC(title)+'</span></div><div class="oscroll">'+inner+'</div></div>'; }

  /* T2 (IDI): promptSheet — el sustituto de window.prompt. Un sheet (overlay)
     con label + campo + helper + error inline (primitivos .field del design
     system), validación antes de entregar y coherente en demo y prod.
     promptSheet({title,label,placeholder,helper,multiline,initial,submitLabel,
     validate,onSubmit}) — validate(v) devuelve un string de error (o nada si ok);
     onSubmit(v) recibe el valor ya validado. */
  function sheetHTML(){
    var sh=S.sheet; if(!sh) return '';
    var field = sh.multiline
      ? '<textarea class="field-textarea" id="rsSheetInput" rows="5" placeholder="'+ESC(sh.placeholder||"")+'">'+ESC(sh.initial||"")+'</textarea>'
      : '<input class="field-input" id="rsSheetInput" type="text" placeholder="'+ESC(sh.placeholder||"")+'" value="'+ESC(sh.initial||"")+'">';
    var inner='<div class="sheet-body">'+
      '<div class="field'+(sh.error?' has-error':'')+'">'+
        '<label class="field-label" for="rsSheetInput">'+ESC(sh.label||"")+'</label>'+
        field+
        (sh.helper?'<div class="field-helper">'+ESC(sh.helper)+'</div>':'')+
        (sh.error?'<div class="field-error" role="alert">'+ESC(sh.error)+'</div>':'')+
      '</div>'+
      (sh.extraHTML||'')+   // campo extra opcional (p.ej. selector de marca/cliente)
      '<div class="sheet-actions">'+
        '<button class="btn btn-md btn-ghost" data-act="sheet-close">Cancelar</button>'+
        // Acción secundaria opcional (p.ej. «Desarrollar ahora» que CUESTA créditos),
        // a la izquierda de la primaria para que la primaria gratis sea la prominente.
        (sh.secondaryLabel?'<button class="btn btn-md btn-secondary" data-act="sheet-secondary">'+ESC(sh.secondaryLabel)+'</button>':'')+
        '<button class="btn btn-md btn-primary" data-act="sheet-submit">'+ESC(sh.submitLabel||"Aceptar")+'</button>'+
      '</div>'+
    '</div>';
    return overlayShellHTML(inner, sh.title||"", "sheet-close", true, "sheet");
  }
  function promptSheet(opts){
    S.sheet={ title:opts.title, label:opts.label, placeholder:opts.placeholder, helper:opts.helper,
      multiline:!!opts.multiline, initial:opts.initial||"", submitLabel:opts.submitLabel,
      secondaryLabel:opts.secondaryLabel||null, extraHTML:opts.extraHTML||null,
      _validate:opts.validate||null, _readExtra:opts.readExtra||null,
      _onSubmit:opts.onSubmit||null, _onSecondary:opts.onSecondary||null, error:null };
    render();
    var inp=document.getElementById("rsSheetInput"); if(inp) inp.focus();
  }
  function closeSheet(){ S.sheet=null; render(); }
  // Lee+valida el input del sheet y, si pasa, lo cierra y ejecuta `cb(valor, extra)`.
  // `extra` se lee ANTES de desmontar el sheet (p.ej. el valor del selector de marca).
  function _resolveSheet(cb){
    var sh=S.sheet; if(!sh) return;
    var inp=document.getElementById("rsSheetInput"); var v=inp?inp.value:"";
    var err=sh._validate?sh._validate(v):null;
    if(err){ sh.error=err; sh.initial=v; render(); var i2=document.getElementById("rsSheetInput"); if(i2) i2.focus(); return; }
    var extra=sh._readExtra?sh._readExtra():null;
    S.sheet=null; render();
    if(cb) cb(v, extra);
  }
  function submitSheet(){ var sh=S.sheet; if(sh) _resolveSheet(sh._onSubmit); }
  function submitSheetSecondary(){ var sh=S.sheet; if(sh) _resolveSheet(sh._onSecondary); }
  function teleprompterHTML(){
    var r=S.reel||{creator:{handle:""},script:{hook:"",beats:[],close:""}};
    var s=r.script||{hook:"",beats:[],close:""};
    var body='<p class="hook">'+ESC(s.hook)+'</p>'+(s.beats||[]).map(function(b){return '<p>'+ESC(b)+'</p>';}).join("")+(s.close?'<p>'+ESC(s.close)+'</p>':"");
    var src=(r.creator&&r.creator.handle)?'@'+ESC(r.creator.handle)+' · en tu voz':'en tu voz';
    return '<div class="overlay prompter" role="dialog" aria-modal="true" aria-label="Teleprompter"><div class="obar"><button class="back" data-act="tp-back" aria-label="Volver">'+IC.back+'</button><span class="otitle">Teleprompter</span><span style="flex:1"></span><span style="font-size:12px;color:rgba(255,255,255,.5)">'+src+'</span></div>'+
      '<div class="tp-scroll"><div class="tp-text">'+body+'</div></div>'+
      '<div class="tp-foot"><button class="btn btn-lg" style="background:rgba(255,255,255,.12);color:#fff;border:none;flex:0 0 auto" data-act="tp-back">Aún no</button><button class="btn btn-lg btn-primary" data-act="recorded">'+IC.check+' Ya lo grabé</button></div></div>';
  }
  function fillReels(){ return S.reels.slice().sort(function(a,b){return (b.explosion||0)-(a.explosion||0);}).slice(0,5); }
  function fillWeekHTML(reels,phase){
    var allDone=phase===-1;
    var head=allDone?"Tu semana está lista":"Llenando tu semana…";
    var sub=allDone?reels.length+" guiones en tu voz, guardados en Guiones. Ordénalos, descarta lo que no te valga, y graba cuando quieras.":"Robando los "+reels.length+" reels más explosivos y reescribiéndolos en tu voz, uno a uno.";
    var rows=reels.map(function(r,i){ var state=allDone||i<phase?"done":(i===phase?"run":"wait"); var stat=state==="wait"?"En cola":state==="run"?'<span class="mini-spin"></span> Reescribiendo':IC.check+' Guardado';
      return '<div class="batch-row'+(state==="done"?" is-done":"")+'"><div class="ava bava">'+ESC(r.creator.initials)+'</div><div class="binfo"><div class="bt">'+ESC(r.cap)+'</div><div class="bw">@'+ESC(r.creator.handle)+' · 🔥 '+ESC(r.explosionTxt!=null?r.explosionTxt:"")+'x</div></div><div class="bstat '+state+'">'+stat+'</div></div>'; }).join("");
    var foot=allDone?'<div class="cluster" style="margin-top:22px;gap:10px"><button class="btn btn-md btn-primary" data-act="fw-guiones">'+IC.doc+' Ver mis guiones</button><button class="btn btn-md btn-secondary" data-act="fw-record">Grabar el primero ahora</button></div>':'';
    return '<div class="batch fade-in"><h2 class="result-head serif" style="font-size:28px">'+ESC(head)+'</h2><p class="result-sub">'+ESC(sub)+'</p>'+rows+foot+'</div>';
  }

  /* ════════════════════════════════════════════════════════════════
     RENDER maestro
     ════════════════════════════════════════════════════════════════ */
  function render(){
    var el=root(); if(!el) return;
    el.className="rs app "+(S.device==="mobile"?"rs--mobile":"rs--desktop");
    el.setAttribute("data-theme",(document.documentElement.getAttribute("data-theme")==="light"?"light":"dark"));
    // Fix review (T2/T6): si hay un sheet abierto con texto sin enviar, consérvalo —
    // un render de fondo (p.ej. robo en background al resolver) no debe borrarlo.
    if(S.sheet){ var _si=document.getElementById("rsSheetInput"); if(_si) S.sheet.initial=_si.value; }
    // Fix review (T4/a11y): #rsToast/#rsErr deben ser nodos PERSISTENTES — una región
    // aria-live solo se anuncia cuando su contenido MUTA estando ya en el DOM. Si se
    // recrean en cada innerHTML, el patrón render()+showToast() no se anuncia. La vista
    // se pinta en #rsView (display:contents → transparente al layout) y el toast/error
    // viven fuera, estables.
    var view=document.getElementById("rsView");
    if(!view || view.parentNode!==el){
      el.innerHTML='<div class="rs-view" id="rsView"></div>'+
        // Host estable (hermano de #rsView, no se re-renderiza) para montar dentro
        // una sección legacy (Analizar/Configuración) reparentando su contenedor.
        '<div class="rs-legacy" id="rsLegacy" style="display:none"></div>'+
        '<div class="rs-toast" id="rsToast" role="status" aria-live="polite"><span class="tdot"></span><span id="rsToastMsg"></span><button class="rs-toast-act" id="rsToastAct" style="display:none"></button></div>'+
        '<div class="rs-toast rs-err" id="rsErr" role="alert" aria-live="assertive"><span class="tdot err"></span><span id="rsErrMsg"></span><button class="rs-err-x" data-act="err-close" title="Cerrar" aria-label="Cerrar el error">'+IC.x+'</button></div>';
      view=document.getElementById("rsView");
    }
    // T1: "ideas" dejó de ser una vista propia — la Fábrica de ideas vive dentro
    // de Radar. Normalizamos cualquier ruta/deep-link heredado (/profile/ideas, ?t=ideas).
    if(S.tab==="ideas") S.tab="dashboard";
    var html='';
    html+=railHTML()+'<div class="work">'+cmdHTML();
    if(S.tab==="portfolio") html+=(isAgency()?portfolioHTML():dashboardHTML());
    else if(S.tab==="dashboard") html+=dashboardHTML();
    else if(S.tab==="guiones") html+=guionesHTML();
    else if(S.tab==="metrics") html+=metricsHTML();
    else if(S.tab==="brain") html+=brainHTML();
    else if(S.tab==="team") html+=teamHTML();
    html+='</div>';  // /.work
    if(S.view==="gen") html+=overlayShellHTML(generatingHTML(S.genKind),"Trabajando…","close-feed",true);
    else if(S.view==="script") html+=overlayShellHTML(scriptRevealHTML(),"Tu guión, en tu voz","close-feed",true);
    else if(S.view==="result") html+=overlayShellHTML(formatResultHTML(S.resultKind),"Listo","back-script",false);
    else if(S.view==="perf") html+=overlayShellHTML(guiPerfHTML(),"Rendimiento del guion","close-feed",true);
    else if(S.view==="prompter") html+=teleprompterHTML();
    else if(S.view==="fillweek") html+='<div class="overlay" role="dialog" aria-modal="true" aria-label="Llena mi semana"><div class="obar"><button class="back" data-act="close-feed" aria-label="Cerrar">'+IC.x+'</button><span class="otitle">Llena mi semana</span></div><div class="oscroll" id="rsFillHost">'+fillWeekHTML(fillReels(),S._fillPhase==null?0:S._fillPhase)+'</div></div>';
    if(S.sheet) html+=sheetHTML();   // T2: el sheet de entrada va SOBRE cualquier overlay
    view.innerHTML=html;
    // T4: el error persistente sobrevive a los re-render mutando el nodo estable.
    var errN=document.getElementById("rsErr"),errM=document.getElementById("rsErrMsg");
    if(errN&&errM){ if(S.errMsg){ errM.textContent=S.errMsg; errN.classList.add("show"); } else { errN.classList.remove("show"); } }
    if(S.view==="gen") startGenSteps();
    // Sección legacy pendiente de la URL (/profile/transcriptions|settings): se abre
    // una vez que #rsLegacy ya existe (primer render). openLegacy consume el flag.
    if(S._pendingLegacy && document.getElementById("rsLegacy")){ var _pl=S._pendingLegacy; S._pendingLegacy=null; openLegacy(_pl); }
    manageOverlayFocus(el);
  }

  /* T5 (IDI): gestión de foco de los diálogos. Al ABRIR un overlay/sheet, el foco
     entra (primer campo o el botón de cerrar). Mientras está abierto, cada
     re-render (innerHTML destruye el nodo enfocado) lo re-ancla dentro. Al
     CERRAR, el foco vuelve al elemento que lo abrió (selector capturado en
     onClick — las referencias a nodos no sobreviven al re-render, un selector sí). */
  function topOverlay(el){ var ovs=el.querySelectorAll(".overlay"); return ovs.length?ovs[ovs.length-1]:null; }
  function manageOverlayFocus(el){
    var open=(S.view && S.view!=="feed") || !!S.sheet;
    var was=!!S._overlayOpen;
    if(open){
      if(!was) S._returnSel=S._lastClickSel||null;   // recuerda el disparador al abrir
      var ov=topOverlay(el);
      if(ov && !ov.contains(document.activeElement)){
        var f=ov.querySelector("input,textarea") || ov.querySelector(".back") || ov;
        try{ f.focus(); }catch(e){}
      }
    } else if(was && S._returnSel){
      var rt=null; try{ rt=el.querySelector(S._returnSel); }catch(e){}
      if(rt){ try{ rt.focus(); }catch(e){} }
      S._returnSel=null;
    }
    S._overlayOpen=open;
  }
  // Selector estable de un botón [data-act] (para devolverle el foco tras un re-render).
  function actSelector(btn){
    var s='[data-act="'+(btn.getAttribute("data-act")||"")+'"]';
    if(btn.getAttribute("data-id")) s+='[data-id="'+btn.getAttribute("data-id")+'"]';
    if(btn.getAttribute("data-k")) s+='[data-k="'+btn.getAttribute("data-k")+'"]';
    return s;
  }

  /* ── animaciones ─────────────────────────────────────────────── */
  // T6: con S._genSlow los mensajes honestos rotan LENTO (no es teatro, es espera real).
  function startGenSteps(){ clearInterval(S.genStepTimer); var steps=S._genSlow?HONEST_MSGS:(GEN_STEPS[S.genKind]||GEN_STEPS.script),i=0; S.genStepTimer=setInterval(function(){ i=(i+1)%steps.length; var n=document.getElementById("rsGenStep"); if(n){ n.style.opacity=0; setTimeout(function(){ n.textContent=steps[i]; n.style.opacity=1; },150); } },S._genSlow?9000:700); }
  function flashSpark(delta){ var sp=document.getElementById("rsSpark"),nEl=document.getElementById("rsSparkN"); if(nEl) nEl.textContent=(S.user.plan==="free" && !S.user.credits)?S.user.freeLeft:S.user.credits; if(sp&&delta<0){ sp.classList.add("flash"); var fly=document.createElement("span"); fly.className="spark-fly"; fly.textContent=delta; sp.appendChild(fly); setTimeout(function(){ sp.classList.remove("flash"); if(fly.parentNode) fly.parentNode.removeChild(fly); },1000); } }
  // T9 (IDI): showToast acepta una acción opcional («Deshacer») — con acción el
  // toast dura más (6s) para dar tiempo a reaccionar.
  function showToast(msg, actionLabel, actionAct){
    var t=document.getElementById("rsToast"),m=document.getElementById("rsToastMsg"),a=document.getElementById("rsToastAct");
    if(!t||!m) return;
    m.textContent=msg;
    if(a){
      if(actionLabel&&actionAct){ a.textContent=actionLabel; a.setAttribute("data-act",actionAct); a.style.display=""; }
      else { a.style.display="none"; a.removeAttribute("data-act"); }
    }
    t.classList.add("show"); clearTimeout(S.toastTimer);
    S.toastTimer=setTimeout(function(){ t.classList.remove("show"); },actionLabel?6000:2800);
  }
  // T4 (IDI): los errores NO se esfuman — persisten hasta que el usuario los
  // cierra (data-act="err-close"). S.errMsg sobrevive a los re-render.
  function showError(msg){
    S.errMsg=msg;
    var t=document.getElementById("rsErr"),m=document.getElementById("rsErrMsg");
    if(t&&m){ m.textContent=msg; t.classList.add("show"); } else { render(); }
  }
  function spend(n){ S.user.credits=Math.max(0,S.user.credits-n); }
  function bumpEco(scripts, reels){ var b=brand(); if(!b) return; b.scripts=(b.scripts||0)+(scripts||0); b.reelsAnalyzed=(b.reelsAnalyzed||0)+(reels||0); b.voice=Math.min(98,(b.voice||40)+(scripts||0)*1.5+(reels||0)); if(b.voice>=20*(b.level||1)+30) b.level=Math.min(5,(b.level||1)+1); }

  /* ════════════════════════════════════════════════════════════════
     ACCIONES
     ════════════════════════════════════════════════════════════════ */
  function switchTab(t){
    if(S.legacy) _exitLegacy();   // salir de Analizar/Configuración al cambiar de tab
    S.tab=t; S.brandMenu=false; S.view="feed";
    // Vistas de marca (no macro/equipo) refrescan stats+feed de la marca activa.
    if(isDemo() && t!=="portfolio" && t!=="team") applyDemoBrand();
    // T2: al entrar en Cerebro, asegura la lista de asistentes fresca (loadAssistants
    // refresca la isla vía RadarLoop.refresh al resolver).
    if(t==="brain"){ try{ if(typeof loadAssistants==="function") loadAssistants(); }catch(e){} loadTracked(); }
    render();
  }

  /* ── Secciones legacy reutilizadas (Analizar = #profPanelTransc, Configuración =
     #profPanelSettings). No son S.tab internos: reparentamos su contenedor de la
     chrome a un host estable de la isla (#rsLegacy), lo activamos con el JS legacy
     vía window.rsActivateLegacySection, y lo devolvemos a su sitio al salir. Así la
     isla expone el acceso sin reescribir esas vistas. ── */
  function _legacyPanelId(k){ return k==="transc" ? "profPanelTransc" : (k==="settings" ? "profPanelSettings" : (k==="assistants" ? "profPanelAssistants" : null)); }
  function mountLegacy(k){
    var host=document.getElementById("rsLegacy"); if(!host) return;
    var pid=_legacyPanelId(k); var panel=pid&&document.getElementById(pid); if(!panel) return;
    S._legacyNode=panel; S._legacyHome=panel.parentNode;   // recordar de dónde vino
    host.innerHTML='<div class="rs-legacy-bar"><button class="btn btn-sm btn-secondary" data-act="legacy-back" aria-label="Volver al radar">'+IC.back+' Volver al radar</button></div>';
    panel.style.display="";          // el chrome lo deja en display:none por defecto
    host.appendChild(panel);
    host.style.display="";
    try{ if(typeof window.rsActivateLegacySection==="function") window.rsActivateLegacySection(k); }catch(e){}
  }
  function _exitLegacy(){
    if(!S.legacy && !S._legacyNode) return;
    if(S._legacyNode){
      S._legacyNode.style.display="none";   // restaurar estado chrome (oculto)
      var home=S._legacyHome||document.getElementById("profMain")||document.body;
      home.appendChild(S._legacyNode);
      S._legacyNode=null; S._legacyHome=null;
    }
    var host=document.getElementById("rsLegacy"); if(host){ host.style.display="none"; host.innerHTML=""; }
    S.legacy=null;
  }
  function closeLegacy(){ _exitLegacy(); S.tab="dashboard"; S.view="feed"; render(); }   // "Volver al radar" → Radar (dashboard)
  function openLegacy(k){
    if(S.legacy===k) return closeLegacy();   // toggle: re-pulsar cierra
    _exitLegacy();                           // por si había otra sección legacy abierta
    S.legacy=k;
    render();                                // el rail marca el botón activo
    mountLegacy(k);                          // #rsLegacy es estable → sobrevive al render
  }
  function switchBrand(id){ if(S.brandId===id){ S.brandMenu=false; return render(); } S.brandId=id; S.brandMenu=false; loadBrandData(); }
  // Zoom de portfolio → radar de una marca. En demo no recarga (reusa el feed),
  // solo ajusta stats de la marca; en prod recarga sus datos reales.
  // En demo: ajusta stats + feed a la marca activa (cada marca ve cosas distintas).
  // En prod esto vendrá de /api/radar/stats?brand= y /api/tracked-creators/reels?brand=.
  function applyDemoBrand(){
    var b=brand();
    S.stats={competitors:b.competitors||4, reels_week:b.reels||0, exploded_week:b.exploded||0, stolen_today:0};
    if(S._reelPool&&S._reelPool.length){
      var ids=S.brands.map(function(x){return x.id;}); var idx=ids.indexOf(b.id); if(idx<0) idx=0;
      var pool=S._reelPool.slice();
      var rot=pool.slice(idx%pool.length).concat(pool.slice(0,idx%pool.length));
      var n=Math.max(2,Math.min(pool.length,Math.round((b.reels||pool.length)/3)+1));
      S.reels=rot.slice(0,n);
      S.favs={}; S.reels.forEach(function(r){ if(r.fav) S.favs[r.id]=true; });
    }
  }
  function openBrand(id){
    S.brandId=id; S.brandMenu=false; S.tab="dashboard"; S.view="feed"; S.feedExpanded=false;   // micro
    if(isDemo()){ applyDemoBrand(); render(); }
    else { loadBrandData(); }
  }
  // Toggle de plan SOLO en demo, para ver las dos experiencias.
  function setDemoPlan(k){
    if(S.plan===k){ return; } S.plan=k; S.brandMenu=false; S.view="feed"; S.feedExpanded=false;
    if(k==="agencia"){ S.brands=demoBrands(); S.brandId=S.brands[0].id; S.tab="portfolio"; }   // macro
    else { S.brands=[demoBrands()[0]]; S.brandId=S.brands[0].id; S.tab="dashboard"; applyDemoBrand(); }
    render();
  }
  function steal(id){
    var r=S.reels.filter(function(x){return x.id===id;})[0]; if(!r) return;
    // Fix review (T6): si ESTE reel ya tiene un robo en vuelo (lo mandó a background
    // con X/Esc/«seguir navegando»), no relanzamos — reabrimos el orbe del que ya
    // corre. Evita guiones duplicados y, en demo, el doble descuento de crédito.
    if(S._stealInFlight===id){ S.reel=r; S.genKind="script"; S._genBg=false; S.view="gen"; render(); return; }
    S.reel=r; S.genKind="script"; S.done={}; S.view="gen";
    // T6: token de generación — si el usuario lanza otro robo o sigue navegando,
    // este robo pasa a "background": guarda el guion y avisa, sin secuestrar la vista.
    S._genSeq=(S._genSeq||0)+1; var tok=S._genSeq;
    S._stealInFlight=id;
    S._genBg=false; S._genSlow=false; clearTimeout(S._genHonestTimer);
    render();
    // T6: a los ~8s sin respuesta, el orbe deja el teatro y habla claro.
    S._genHonestTimer=setTimeout(function(){ if(S.view==="gen" && tok===S._genSeq){ S._genSlow=true; render(); } },8000);
    ensureScript(r,function(err){
      var bg=S._genBg || tok!==S._genSeq;   // cerró el orbe, siguió navegando o lanzó otro robo
      if(tok===S._genSeq){ clearTimeout(S._genHonestTimer); S._genSlow=false; S._genBg=false; S._stealInFlight=null; }
      else if(S._stealInFlight===id) S._stealInFlight=null;   // robo superado: libera el guard de ESTE reel
      if(err){
        if(bg){
          if(err==="free_limit_reached"||err==="no_credits") showPaywall(err);
          else showError("No pude terminar tu guion. Inténtalo de nuevo.");   // persistente (T4): el usuario está en otra vista
          return;
        }
        S.view="feed"; render(); showPaywall(err); return;
      }
      // El guión generado se guarda SIEMPRE en Guiones (draft). No se pierde nada.
      var s=r.script||{}; var gidNew=addGuion({title:s.hook, hook:s.hook, beats:s.beats, close:s.close, from:"@"+r.creator.handle, type:"guión"});
      if(!isDemo() && r._sid){ var g=guionById(gidNew); if(g) g._sid=r._sid; }
      if(bg){ render(); showToast("Tu guion ya está listo — te espera en Guiones."); }
      else { S.activeGuionId=gidNew; S.view="script"; render(); }
      // Demo: descuento local cosmético. Prod: el backend ya cobró server-side →
      // refrescamos el saldo real (/auth/me) sin descontar local (evita doble-cobro).
      if(isDemo()){ spend(COST.script); bumpEco(1,1); flashSpark(-COST.script); }
      else { refreshCredits().then(function(){ flashSpark(0); }); }
    });
  }
  // Re-lee el saldo real de créditos del servidor y lo refleja en la pill.
  function refreshCredits(){
    return apiGet("/auth/me").then(function(r){
      var me=r.d||{};
      if(me.credits!=null) S.user.credits=me.credits;
      else if(me.credits_cents!=null) S.user.credits=Math.round(me.credits_cents/18);
      if(me.free_lifetime_left!=null) S.user.freeLeft=me.free_lifetime_left;
    });
  }
  // Muro: free agotó sus 5 «Hazlo mío» (o sin créditos). Abre el modal de planes.
  function showPaywall(err){
    var msg = (err==="free_limit_reached")
      ? "Has usado tus 5 «Hazlo mío» gratis. Sube a Creador para seguir creando."
      : "Necesitas créditos para generar este guion.";
    showToast(msg);
    if(typeof window.openUpgradeModal==="function"){ try{ window.openUpgradeModal("hazlo_mio_free_limit"); }catch(e){} }
  }
  function ensureScript(r,cb){
    if(r.script&&r.script.hook){ setTimeout(function(){cb();},1700); return; }
    if(isDemo()){ setTimeout(function(){cb();},1700); return; }
    var t0=Date.now();
    apiPost("/api/competitors/reels/"+encodeURIComponent(r.id)+"/generate-script",{}).then(function(rr){
      // Duplicado reciente (409) → reusamos el guion existente (sin re-cobro). Traemos su texto.
      if(rr.status===409 && rr.d && rr.d.script_id){ return fetchScriptText(rr.d.script_id, r, t0, cb); }
      if(!rr.ok){ var ec=(rr.d&&rr.d.error)||"error"; return setTimeout(function(){ cb(ec); },300); }
      // Sync (200): el script viene en la respuesta.
      if(rr.d && (rr.d.mode==="sync" || rr.d.script || rr.d.result)){
        r._sid=rr.d.script_id||r._sid; r.script=parseScript(rr.d.script||rr.d.result,r);
        return setTimeout(function(){cb();},Math.max(0,1500-(Date.now()-t0)));
      }
      // Async (202): pollear /task/script/<id> hasta SUCCESS, luego traer el texto.
      if(rr.d && rr.d.task_id){ return pollScriptTask(rr.d.task_id, r, t0, cb); }
      // Respuesta inesperada → fallback al caption.
      r.script=r.script||{hook:r.cap,beats:[],close:""}; setTimeout(function(){cb();},600);
    }).catch(function(){ r.script=r.script||{hook:r.cap,beats:[],close:""}; setTimeout(function(){cb();},800); });
  }
  // Polling del task de generación async (steal cache-miss). Máx ~90s.
  function pollScriptTask(taskId, r, t0, cb){
    var tries=0, MAX=45;
    (function loop(){
      tries++;
      apiGet("/task/script/"+encodeURIComponent(taskId)).then(function(rr){
        var d=rr.d||{};
        if(d.state==="success"){ return fetchScriptText(d.script_id, r, t0, cb); }
        if(d.state==="failed"){ return cb(d.error||"error"); }
        if(tries>=MAX){ return cb("timeout"); }
        setTimeout(loop, 2000);
      }).catch(function(){ if(tries>=MAX) return cb("error"); setTimeout(loop,2000); });
    })();
  }
  // El task/dup solo devuelve script_id; el texto vive en /scripts → lo buscamos ahí.
  function fetchScriptText(sid, r, t0, cb){
    if(!sid){ r.script=r.script||{hook:r.cap,beats:[],close:""}; return cb(); }
    apiGet("/scripts").then(function(rr){
      var rows=Array.isArray(rr.d)?rr.d:[];
      var row=rows.filter(function(s){return s.id===sid;})[0];
      r._sid=sid;
      r.script=row?scriptToParts(row.script):{hook:r.cap,beats:[],close:""};
      setTimeout(function(){cb();},Math.max(0,1200-(Date.now()-t0)));
    }).catch(function(){ r.script=r.script||{hook:r.cap,beats:[],close:""}; cb(); });
  }
  function parseScript(sc,r){ if(sc&&typeof sc==="object"&&sc.hook) return sc; if(typeof sc==="string"){ var l=sc.split(/\n+/).map(function(s){return s.replace(/^▸\s*/,"").trim();}).filter(Boolean); return {hook:l[0]||r.cap,beats:l.slice(1,-1),close:l.length>1?l[l.length-1]:""}; } return {hook:r.cap,beats:[],close:""}; }
  function chain(kind){ if(kind==="record"){ S.view="prompter"; render(); return; } S.genKind=kind; S.resultKind=kind; S.view="gen"; render(); setTimeout(function(){ spend(COST[kind]||1); S.done[kind]=true; S.view="result"; render(); flashSpark(-(COST[kind]||1)); },1500); }
  function recorded(){
    // Cierra el loop (momento 4): marca el guión activo como grabado en Guiones.
    if(S.activeGuionId){ var g=guionById(S.activeGuionId); if(g){ g.status="recorded"; persistRecStatus(g); } }
    S.done.record=true; if(S.stats) S.stats.stolen_today+=1; S.activeGuionId=null;
    S.view="feed"; S.tab="dashboard"; render();
    showToast("Grabado y marcado en Guiones. Te esperan más oportunidades hoy →");
  }
  // Prod: persiste el estado de grabación del guion (PATCH /scripts/<id>). La isla
  // usa draft|recorded|discarded; el backend pending|recorded|discarded (draft→pending).
  function persistRecStatus(g){
    if(isDemo() || !g || !g._sid) return;
    var rs=(g.status==="recorded")?"recorded":(g.status==="discarded"?"discarded":"pending");
    apiPatch("/scripts/"+encodeURIComponent(g._sid), {recording_status:rs});
  }
  function startFillWeek(){
    var reels=fillReels();
    S._fillGuionIds=[]; S._fillResult=null; S._fillErr=null; S.view="fillweek"; S._fillPhase=0; render();
    if(isDemo()){ spend(reels.length); bumpEco(reels.length,reels.length); flashSpark(-reels.length); runFillPhase(); return; }
    // Prod: dispara el lote real (/reels/steal-batch). La animación corre en
    // paralelo; al completar la fase, aterrizamos los guiones REALES del backend.
    apiPost("/reels/steal-batch",{count:Math.max(1,reels.length)||5}).then(function(r){
      if(!r.ok || !r.d || !Array.isArray(r.d.scripts)){
        S._fillErr=r;
        // No abortamos la animación a media; al cerrar fase, mostramos el error.
        return;
      }
      S._fillResult=r.d; applyCredits(r.d, r.d.scripts.length);
    });
    runFillPhase();
  }
  function runFillPhase(){
    var reels=fillReels(); clearTimeout(S.fillTimer);
    S.fillTimer=setTimeout(function(){
      if(S._fillPhase>=reels.length){
        // Prod: si el lote falló, salimos al feed con el error (no dejamos guiones a medias).
        if(!isDemo() && S._fillErr){ var er=S._fillErr; S._fillErr=null; S.view="feed"; S._fillPhase=null; render(); return showPaywallOrError(er); }
        // Prod: si el lote aún no volvió, esperamos un tick más (sin completar).
        if(!isDemo() && !S._fillResult){ S.fillTimer=setTimeout(runFillPhase,400); return; }
        S._fillPhase=-1;
        // Al completar: los guiones aterrizan en Guiones (draft). El usuario
        // decide allí cuáles graba/descarta. Nada se pierde.
        if(!S._fillGuionIds.length){
          if(!isDemo() && S._fillResult){
            // Guiones REALES del backend (ya persistidos en scripts; llevan _sid).
            S._fillGuionIds=S._fillResult.scripts.map(function(s){
              var gidL=addGuion({title:s.hook||s.from||"Guión", hook:s.hook||"", beats:s.beats||[], close:s.close||"", from:s.from||null, type:"guión"});
              var g=guionById(gidL); if(g) g._sid=s.id||s.script_id||null; return gidL;
            });
          } else {
            S._fillGuionIds=reels.map(function(r){ var s=r.script||{hook:r.cap,beats:[],close:""}; return addGuion({title:s.hook||r.cap, hook:s.hook||r.cap, beats:s.beats, close:s.close, from:"@"+r.creator.handle, type:"guión"}); });
          }
        }
        updateFillHost(); return;
      }
      S._fillPhase++; updateFillHost(); runFillPhase();
    },720);
    updateFillHost();
  }
  function updateFillHost(){ var host=document.getElementById("rsFillHost"); if(host) host.innerHTML=fillWeekHTML(fillReels(),S._fillPhase==null?0:S._fillPhase); }
  function toggleFav(id){ S.favs[id]=!S.favs[id]; var m=S.favs[id]?"POST":"DELETE"; if(!isDemo()) fetch("/api/competitors/reels/"+encodeURIComponent(id)+"/favorite",{method:m,credentials:"same-origin"}).catch(function(){}); render(); }

  /* ── fábrica de ideas ────────────────────────────────────────── */
  function seedIdea(inputId, jumpToIdeas){
    var inp=document.getElementById(inputId); var txt=inp?inp.value.trim():"";
    if(!txt){ if(jumpToIdeas){ S.tab="ideas"; render(); } return; }
    if(isDemo()){
      S.ideas.unshift(makeIdea(txt, txt.length+S.ideas.length));
      if(jumpToIdeas) S.tab="ideas";
      render(); return;
    }
    // Prod: persiste como draft (develop:false) → POST /ideas. El id real vuelve
    // del backend para poder generar guiones después (/ideas/{id}/scripts/...).
    if(txt.length<5){ showToast("Escribe una idea un poco más larga."); return; }
    if(inp) inp.value="";
    if(jumpToIdeas) S.tab="ideas";
    var tmp=makeIdea(txt, txt.length+S.ideas.length); tmp._saving=true; S.ideas.unshift(tmp); render();
    apiPost("/ideas",{raw_text:txt, language:rsLang(), develop:false}).then(function(r){
      if(r.ok && r.d && r.d.id){ tmp.id=r.d.id; tmp._server=true; tmp._scriptsLoaded=true; tmp._saving=false; render(); }
      else { tmp._saving=false; showToast((r.d&&r.d.error)||"No pude guardar la idea."); render(); }
    });
  }
  // T1: captura global de ideas (bombilla de la command bar). Modal mínimo
  // reusando promptSheet (Esc cierra, Enter envía). Al desarrollar, la idea
  // aterriza en Guiones, donde vive la fábrica.
  // Captura global de ideas (bombilla). Dos caminos claros:
  //  · Primaria «Guardar idea» → GRATIS, la apunta en bruto (status draft) y la deja
  //    en Guiones › Sin desarrollar. Enter dispara esta (la segura/gratis).
  //  · Secundaria «Desarrollar ahora» → CUESTA créditos: la genera ya (5 guiones).
  function openIdeaCapture(){
    // Agency con >1 marca: selector de marca/cliente (default = la activa) para poder
    // apuntar para el cliente B mientras ves el A (visibilidad + control). Creator
    // (1 marca): sin selector, se asigna sola (IDI: no pidas elegir si solo hay 1).
    var multi = isAgency() && (S.brands||[]).length>1;
    var extraHTML = multi
      ? '<div class="field" style="margin-top:12px"><label class="field-label" for="rsSheetBrand">Marca / cliente</label>'+
          '<select class="field-input" id="rsSheetBrand">'+
            (S.brands||[]).map(function(b){ return '<option value="'+ESC(b.id)+'"'+(b.id===S.brandId?' selected':'')+'>'+ESC(b.name)+'</option>'; }).join("")+
          '</select></div>'
      : null;
    promptSheet({
      title:"Apunta una idea",
      label:"Tu idea",
      placeholder:"Una idea suelta… guárdala ahora, desarróllala cuando quieras",
      multiline:false,   // input de una línea → Enter envía (el handler salta textareas)
      helper:"Guardar es gratis. Desarrollar ahora cuesta "+COST.scripts5+" créditos.",
      submitLabel:"Guardar idea · gratis",
      secondaryLabel:"Desarrollar ahora · "+COST.scripts5+" créd.",
      extraHTML:extraHTML,
      readExtra:function(){ var s=document.getElementById("rsSheetBrand"); return { brand: s ? s.value : null }; },
      validate:function(v){ return (v||"").trim().length<5 ? "Escribe una idea un poco más larga." : null; },
      onSubmit:function(v, x){ saveIdeaRaw(v, x&&x.brand); },        // gratis
      onSecondary:function(v, x){ developIdeaNow(v, x&&x.brand); }   // cuesta créditos
    });
  }
  // T3: dejar de seguir un competidor, CON confirmación (control y libertad +
  // prevención de errores). Reusa el confirmModal global (mismo patrón que borrar
  // asistente). Optimista: lo quita de la lista y archiva en backend (204).
  function untrackCreator(tid, handle){
    var doIt=function(){
      S.tracked=(S.tracked||[]).filter(function(x){ return String(x.id)!==String(tid); });
      if(S.stats && S.stats.competitors>0) S.stats.competitors-=1;
      render();
      showToast("Dejaste de seguir a @"+handle+".");
      apiDelete("/api/tracked-creators/"+encodeURIComponent(tid)).then(function(r){
        if(!r.ok && !isDemo()){ showError("No pude dejar de seguir a @"+handle+". Reintenta."); loadTracked(); }
      });
    };
    if(typeof window!=="undefined" && typeof window.confirmModal==="function"){
      window.confirmModal({ title:"Dejar de seguir", body:"¿Dejar de seguir a @"+handle+"? Sus reels dejarán de aparecer en tu Radar.", confirmText:"Dejar de seguir", cancelText:"Cancelar", danger:true })
        .then(function(ok){ if(ok) doIt(); });
    } else { doIt(); }
  }
  // GRATIS: guarda la idea en bruto (status draft) sin desarrollar ni cobrar. No
  // navega — captura sin fricción desde cualquier vista; el toast dice dónde quedó.
  // Sufijo de marca para el toast (solo agency multi-marca, para visibilidad).
  function _brandToastSuffix(bid){ var n=(isAgency() && (S.brands||[]).length>1) ? brandNameOf(bid) : null; return n?(" · "+n):""; }
  function saveIdeaRaw(txt, bid){
    txt=(txt||"").trim(); if(!txt) return;
    bid=bid||S.brandId;
    if(isDemo()){ S.ideas.unshift(makeIdea(txt, txt.length+S.ideas.length, bid)); render(); showToast("Idea guardada (gratis) · Sin desarrollar"+_brandToastSuffix(bid)+"."); return; }
    var tmp=makeIdea(txt, txt.length+S.ideas.length, bid); tmp._saving=true; S.ideas.unshift(tmp); render();
    showToast("Idea guardada (gratis) · Sin desarrollar"+_brandToastSuffix(bid)+".");
    apiPost("/ideas",{raw_text:txt, language:rsLang(), develop:false, project_id:_pidOf(bid)}).then(function(r){
      if(r.ok && r.d && r.d.id){ tmp.id=r.d.id; tmp._server=true; tmp._scriptsLoaded=true; tmp._saving=false; render(); }
      else { tmp._saving=false; showToast((r.d&&r.d.error)||"No pude guardar la idea."); render(); }
    });
  }
  // CUESTA créditos: guarda la idea y la desarrolla ya (5 guiones). Navega a Guiones
  // para ver el resultado. Reutiliza gen5scripts (cobro + persistencia reales).
  function developIdeaNow(txt, bid){
    txt=(txt||"").trim(); if(!txt) return;
    bid=bid||S.brandId;
    // Desarrollar SÍ navega a Guiones a ver el resultado → conmutamos a la marca
    // elegida para que la fábrica (filtrada por marca activa) lo muestre. La vista
    // Guiones no depende de reels/stats, así que basta con fijar S.brandId.
    if(bid && bid!==S.brandId){ S.brandId=bid; S.brandMenu=false; if(isDemo()) applyDemoBrand(); }
    if(isDemo()){
      var idea=makeIdea(txt, txt.length+S.ideas.length, bid); S.ideas.unshift(idea);
      spend(COST.scripts5); for(var i=0;i<5;i++) idea.scripts.push(makeScript(idea.text,(idea.seed||0)+i));
      bumpEco(5,0); S.tab="guiones"; render(); flashSpark(-COST.scripts5);
      showToast("Idea desarrollada · 5 guiones listos"+_brandToastSuffix(bid)+"."); return;
    }
    var tmp=makeIdea(txt, txt.length+S.ideas.length, bid); tmp._saving=true; S.ideas.unshift(tmp); S.tab="guiones"; render();
    showToast("Guardando y desarrollando"+_brandToastSuffix(bid)+"…");
    apiPost("/ideas",{raw_text:txt, language:rsLang(), develop:false, project_id:_pidOf(bid)}).then(function(r){
      if(r.ok && r.d && r.d.id){ tmp.id=r.d.id; tmp._server=true; tmp._scriptsLoaded=true; tmp._saving=false; render(); gen5scripts(tmp.id); }
      else { tmp._saving=false; showToast((r.d&&r.d.error)||"No pude guardar la idea."); render(); }
    });
  }
  function addSeedIdea(){
    var inp=document.getElementById("rsIdeaSeed2"); var txt=inp?inp.value.trim():""; if(!txt) return;
    if(isDemo()){ S.ideas.unshift(makeIdea(txt, txt.length+S.ideas.length)); render(); return; }
    if(txt.length<5){ showToast("Escribe una idea un poco más larga."); return; }
    if(inp) inp.value="";
    var tmp=makeIdea(txt, txt.length+S.ideas.length); tmp._saving=true; S.ideas.unshift(tmp); render();
    apiPost("/ideas",{raw_text:txt, language:rsLang(), develop:false}).then(function(r){
      if(r.ok && r.d && r.d.id){ tmp.id=r.d.id; tmp._server=true; tmp._scriptsLoaded=true; tmp._saving=false; render(); }
      else { tmp._saving=false; showToast((r.d&&r.d.error)||"No pude guardar la idea."); render(); }
    });
  }
  // Un "script block" de Ideas a partir de una fila de scripts del backend
  // (generate-batch / explosion). Lleva _sid para los endpoints por-guión.
  function makeScriptFromServer(s, ideaText){
    var p=scriptToParts(s.script);
    return { id:gid("sc"), _sid:s.id, hook:p.hook||s.title||"", beats:p.beats, close:p.close,
      hooks:(Array.isArray(s.alt_hooks)&&s.alt_hooks.length)?s.alt_hooks:null, savedHooks:{},
      guionId:null, saved:false, expanded:false, idea:ideaText||"", title:s.title||p.hook||"" };
  }
  function _btnLoading(btn){
    if(!btn) return function(){};
    var orig=btn.innerHTML, dis=btn.disabled;
    btn.disabled=true;
    btn.innerHTML='<span class="rs-ldr"></span>Generando…';
    return function(){ btn.disabled=dis; btn.innerHTML=orig; };
  }

  function gen5ideas(btn){
    if(isDemo()){ spend(COST.idea5); var seed=Date.now()%97; var fresh=pick(BANK_IDEAS,5,seed).map(function(t,i){return makeIdea(t,seed+i*7);}); S.ideas=fresh.concat(S.ideas); render(); flashSpark(-COST.idea5); showToast("5 ideas nuevas para expandir."); return; }
    var restore=_btnLoading(btn);
    showToast("Generando 5 ideas…");
    apiPost("/ideas/generate-batch",{count:5, project_id:S.brandId&&S.brandId!=="default"?S.brandId:null, language:rsLang()}).then(function(r){
      if(!r.ok || !r.d || !Array.isArray(r.d.ideas)){ restore(); return showPaywallOrError(r); }
      var fresh=r.d.ideas.map(function(i){ var it=normIdea(i); it.expanded=true; it._scriptsLoaded=true; it._brand=(i.project_id||S.brandId||"default"); return it; });
      S.ideas=fresh.concat(S.ideas); applyCredits(r.d, COST.idea5); render(); showToast("5 ideas nuevas para expandir.");
    });
  }
  function gen5scripts(ideaId, btn){
    var idea=findIdea(ideaId); if(!idea) return;
    if(isDemo()){ spend(COST.scripts5); for(var i=0;i<5;i++) idea.scripts.push(makeScript(idea.text,(idea.seed||0)+idea.scripts.length+i)); bumpEco(5,0); render(); flashSpark(-COST.scripts5); showToast("5 guiones a partir de tu idea."); return; }
    if(idea._saving){ return showToast("Espera, estoy guardando esa idea…"); }
    if(!idea._server){ return showToast("Esa idea aún no está guardada. Recarga e inténtalo."); }
    var restore=_btnLoading(btn);
    showToast("Generando 5 guiones…");
    apiPost("/ideas/"+encodeURIComponent(idea.id)+"/scripts/generate-batch",{count:5, language:rsLang()}).then(function(r){
      if(!r.ok || !r.d || !Array.isArray(r.d.scripts)){ restore(); return showPaywallOrError(r); }
      idea.expanded=true;
      r.d.scripts.forEach(function(s){ idea.scripts.push(makeScriptFromServer(s, idea.text)); });
      applyCredits(r.d, COST.scripts5); render(); showToast("5 guiones a partir de tu idea.");
    });
  }
  function gen5hooks(scriptId, btn){
    var sc=findScript(scriptId); if(!sc) return;
    if(isDemo()){ spend(COST.hooks5); sc.hooks=pick(BANK_HOOKS,5,(sc.hook||"").length+ Object.keys(S.ideas).length); render(); flashSpark(-COST.hooks5); return; }
    if(!sc._sid){ return showToast("Este guion aún no está persistido."); }
    var restore=_btnLoading(btn);
    showToast("Generando 5 hooks…");
    apiPost("/scripts/"+encodeURIComponent(sc._sid)+"/hooks/generate-batch",{count:5}).then(function(r){
      if(!r.ok || !r.d || !Array.isArray(r.d.hooks)){ restore(); return showPaywallOrError(r); }
      sc.hooks=r.d.hooks.slice();
      // Si ya estaba guardado en Guiones, su alt_hooks del backend = r.d.alt_hooks.
      if(sc.saved && sc.guionId){ var g=guionById(sc.guionId); if(g && Array.isArray(r.d.alt_hooks)){ g.hooks=r.d.alt_hooks.slice(); } }
      applyCredits(r.d, COST.hooks5); render(); showToast("5 hooks nuevos para tu guion.");
    });
  }
  function explosion(btn){
    if(isDemo()){
      spend(COST.explosion); var seed=Date.now()%89;
      var ideasD=pick(BANK_IDEAS,5,seed).map(function(t,i){ var idea=makeIdea(t,seed+i*5); for(var j=0;j<5;j++){ var sc=makeScript(t,seed+i*5+j); sc.hooks=pick(BANK_HOOKS,5,seed+i+j); idea.scripts.push(sc); } return idea; });
      S.ideas=ideasD.concat(S.ideas); bumpEco(25,0); render(); flashSpark(-COST.explosion); showToast("💥 5 ideas × 5 guiones × 5 hooks. La semana entera, de un golpe."); return;
    }
    var restore=_btnLoading(btn);
    showToast("💥 Explosión en marcha… esto tarda un poco.");
    apiPost("/ideas/explosion",{project_id:S.brandId&&S.brandId!=="default"?S.brandId:null, language:rsLang()}).then(function(r){
      if(!r.ok || !r.d || !Array.isArray(r.d.ideas)){ restore(); return showPaywallOrError(r); }
      // Reconstruye el árbol idea→guiones→hooks desde la respuesta (scripts traen idea_id).
      var byIdea={};
      (r.d.scripts||[]).forEach(function(s){ var k=s.idea_id||"_"; (byIdea[k]=byIdea[k]||[]).push(s); });
      var fresh=r.d.ideas.map(function(i){
        var it=normIdea(i); it.expanded=true; it._scriptsLoaded=true; it._brand=(i.project_id||S.brandId||"default");
        (byIdea[i.id]||[]).forEach(function(s){ it.scripts.push(makeScriptFromServer(s, it.text)); });
        return it;
      });
      S.ideas=fresh.concat(S.ideas); applyCredits(r.d, COST.explosion); render();
      showToast("💥 5 ideas × 5 guiones × 5 hooks. La semana entera, de un golpe.");
    });
  }
  // Distingue muro de pago (402/free_limit) de error genérico, reusando showPaywall.
  function showPaywallOrError(r){
    var ec=(r.d&&r.d.error)||"error";
    if(r.status===402 || ec==="free_limit_reached" || ec==="no_credits"){ return showPaywall(ec); }
    showToast((r.d&&r.d.message)||(r.d&&r.d.error)||"No se pudo completar. Inténtalo de nuevo.");
  }
  function findIdea(id){ return S.ideas.filter(function(x){return x.id===id;})[0]; }
  function findScript(id){ for(var i=0;i<S.ideas.length;i++){ var s=S.ideas[i].scripts.filter(function(x){return x.id===id;})[0]; if(s) return s; } return null; }
  // En prod, ensureGuion persiste el guion en /scripts si aún no tiene _sid (script
  // generado por gen5scripts ya viene con _sid → no re-crea). Devuelve guionId local.
  function ensureGuion(sc){
    if(sc.saved&&sc.guionId&&guionById(sc.guionId)) return sc.guionId;
    sc.saved=true; sc.guionId=addGuion({title:sc.hook, hook:sc.hook, beats:sc.beats, close:sc.close, from:null, type:"guión"});
    var g=guionById(sc.guionId);
    if(!isDemo()){
      if(sc._sid){
        // Ya persistido (vino de generate-batch): solo enlazamos el _sid al guión.
        if(g) g._sid=sc._sid;
      } else {
        // Guion local (idea suelta sin batch): lo creamos en /scripts ahora.
        var flat=[sc.hook].concat(sc.beats||[],[sc.close]).filter(Boolean).join("\n");
        apiPost("/scripts",{title:sc.hook||"Guión", script:flat, project_id:S.brandId&&S.brandId!=="default"?S.brandId:null}).then(function(r){
          if(r.ok && r.d && r.d.id){ sc._sid=r.d.id; if(g) g._sid=r.d.id; }
        });
      }
    } else { bumpEco(0,0); }
    return sc.guionId;
  }
  function saveScript(scriptId){ var sc=findScript(scriptId); if(!sc||sc.saved) return; ensureGuion(sc); render(); showToast("Guardado en Guiones."); }
  function saveHook(scriptId,i){
    var sc=findScript(scriptId); if(!sc||!sc.hooks) return;
    var h=sc.hooks[i]; if(h==null) return;
    var g=guionById(ensureGuion(sc)); if(!g){ render(); return; }
    g.hooks=g.hooks||[];
    if(g.hooks.indexOf(h)===-1){ g.hooks.push(h); g.expanded=true; }
    sc.savedHooks=sc.savedHooks||{}; sc.savedHooks[i]=true;
    render(); showToast("Hook añadido al guión.");
    // Prod: persiste el hook en el banco del guion (alt_hooks). Si el _sid aún no
    // llegó (POST /scripts en vuelo desde ensureGuion), reintenta una vez.
    if(!isDemo()){
      var doPost=function(sid){ apiPost("/scripts/"+encodeURIComponent(sid)+"/hooks",{hook:h}).then(function(r){ if(r.ok && r.d && Array.isArray(r.d.alt_hooks) && g){ g.hooks=r.d.alt_hooks.slice(); } }); };
      if(g._sid) doPost(g._sid);
      else setTimeout(function(){ if(g._sid) doPost(g._sid); },900);
    }
  }
  // T2 (IDI): sheet con validación en vez de window.prompt.
  function addReelManual(){
    promptSheet({
      title:"Añadir reel", label:"URL del reel",
      placeholder:"https://www.instagram.com/reel/…",
      helper:"Pega la URL de un reel (Instagram/TikTok) para meterlo a tu ecosistema.",
      submitLabel:"Añadir al ecosistema",
      validate:function(v){ if(!/^https?:\/\/\S+\.\S+/i.test(v.trim())) return "Pega una URL válida (empieza por http)."; },
      onSubmit:function(){ showToast("Reel en cola. Lo añadimos a tu ecosistema en unos segundos."); bumpEco(0,1); }
    });
  }

  // Captura del moat: el creador pega sus reels → derivamos su VoiceProfile.
  function onboardVoice(){
    var ta=document.getElementById("rsVoiceText"); var txt=ta?ta.value.trim():"";
    if(!txt){ showToast("Pega el texto de al menos 1 reel tuyo."); return; }
    // B8: en DEMO no llamamos al backend real (POST /api/voice/onboard + GET /api/voice).
    // Sembramos un VoiceProfile dummy fijo para que la demo enseñe el "después" del moat
    // (Cerebro con voz aprendida, confianza 62%, evidencia) sin claves ni red. NO ELIMINAR:
    // la demo lo necesita para que el flujo de onboarding se vea completo. La integración
    // REAL (transcripción → derivar voz → persistir) solo se ejercita en el branch de prod
    // de abajo — este branch nunca la prueba a propósito.
    if(isDemo()){
      S.voice={ has_profile:true, tone:"Directo, sin postureo — como un audio a un colega.",
        phrases:["te lo cuento porque","paso uno… paso dos","guárdate esto"], structure:"hook directo → 3 pasos → CTA",
        avg_duration:40, avoid:"tecnicismos y motivacional vacío", confidence:62, source_count:1,
        evidence:["abres con una afirmación tajante","frases cortas (<12 palabras)","cierras pidiendo guardar/comentar"] };
      var b=brand(); b.voice=62; render(); showToast("Voz aprendida — te conozco al 62%."); return;
    }
    showToast("Aprendiendo tu voz…");
    fetch("/api/voice/onboard",{method:"POST",credentials:"same-origin",headers:{"Content-Type":"application/json"},body:JSON.stringify({texts:[txt]})})
      .then(function(r){ return r.json().catch(function(){return{};}); })
      .then(function(d){
        if(d&&d.ok){
          return fetch("/api/voice",{credentials:"same-origin"}).then(function(r){return r.json();}).then(function(v){
            S.voice=v; render(); showToast("Voz aprendida — te conozco al "+(v.confidence||0)+"%.");
          });
        }
        showError((d&&d.error)||"No pude aprender tu voz. Prueba con otro reel.");
      })
      .catch(function(){ showError("Error de red. Inténtalo de nuevo."); });
  }

  // Refinar el moat: acumula reels NUEVOS sobre la voz ya aprendida.
  // El backend (POST /api/voice/refine) suma source_count y sube confidence.
  // Mirror de onboardVoice: mismo auth (credentials same-origin), mismo refresh
  // (GET /api/voice → re-pinta Cerebro), mismo branch demo (en demo NO postea).
  // T2 (IDI): sheet con textarea (igual que el onboarding) en vez de window.prompt.
  function refineVoice(){
    promptSheet({
      title:"Refinar mi voz", label:"Transcripción de tus reels",
      placeholder:"Pega aquí lo que dices en 1-2 reels TUYOS más…",
      helper:"Los sumo a tu voz y subo el % que te conozco.",
      multiline:true, submitLabel:"Refinar mi voz",
      validate:function(v){ if(!v.trim()) return "Pega el texto de al menos 1 reel tuyo."; },
      onSubmit:refineVoiceWith
    });
  }
  function refineVoiceWith(txt){
    txt=(txt||"").trim();
    if(!txt){ showToast("Pega el texto de al menos 1 reel tuyo."); return; }
    // En DEMO no llamamos al backend real: subimos la confianza localmente
    // y sumamos una fuente, para que el "después" del refino se vea sin red ni claves.
    if(isDemo()){
      S.voice=S.voice||{ has_profile:true };
      S.voice.has_profile=true;
      S.voice.source_count=(S.voice.source_count||1)+1;
      S.voice.confidence=Math.min(100,(S.voice.confidence||62)+11);
      brand().voice=S.voice.confidence; render();
      showToast("Voz refinada — ahora te conozco al "+S.voice.confidence+"%."); return;
    }
    showToast("Refinando tu voz…");
    fetch("/api/voice/refine",{method:"POST",credentials:"same-origin",headers:{"Content-Type":"application/json"},body:JSON.stringify({texts:[txt]})})
      .then(function(r){ return r.json().catch(function(){return{};}); })
      .then(function(d){
        if(d&&d.ok){
          return fetch("/api/voice",{credentials:"same-origin"}).then(function(r){return r.json();}).then(function(v){
            S.voice=v; render(); showToast("Voz refinada — ahora te conozco al "+(v.confidence||0)+"%.");
          });
        }
        showError((d&&d.error)||"No pude refinar tu voz. Prueba con otro reel.");
      })
      .catch(function(){ showError("Error de red. Inténtalo de nuevo."); });
  }

  // Refresca métricas + insights de la marca activa (summary + insights) y re-pinta.
  // Devuelve la promesa para encadenar toasts. Solo prod (en demo las métricas son sembradas).
  function refreshMetrics(){
    var q=S.brandId?("?brand="+encodeURIComponent(S.brandId)):"";
    return Promise.all([
      fetch("/metrics/summary"+q,{credentials:"same-origin"}).then(function(r){return r.ok?r.json():null;}).catch(function(){return null;}),
      fetch("/api/metrics/insights",{credentials:"same-origin"}).then(function(r){return r.ok?r.json():null;}).catch(function(){return null;}),
      fetch("/metrics/videos"+q,{credentials:"same-origin"}).then(function(r){return r.ok?r.json():null;}).catch(function(){return null;})
    ]).then(function(res){
      var met=res[0], ins=res[1], vids=res[2];
      if(met){ S.metrics=met; S.igConnected=!!(met && met.connected); }
      if(ins){ S.metrics=S.metrics||{}; S.metrics.insights={ what_works:ins.what_works||[], next:ins.next||null }; }
      // Los reels reales viven en /metrics/videos (summary solo trae agregados).
      if(vids){ S.metrics=S.metrics||{}; S.metrics.videos=(vids.videos||[]).map(normMetricVideo); }
      render();
    });
  }

  // B3 (prod): al vincular un reel publicado a su guion, lo analizamos por audio
  // (POST /metrics/analyze-one) y refrescamos las métricas del guion.
  function linkReelPublished(g, url){
    showToast("Analizando tu reel… esto entrena tu Cerebro.");
    fetch("/metrics/analyze-one",{method:"POST",credentials:"same-origin",headers:{"Content-Type":"application/json"},body:JSON.stringify({url:url})})
      .then(function(r){ return r.json().catch(function(){return{};}); })
      .then(function(d){
        if(d&&d.ok){
          if(g) g.published={pending:false, url:url};
          return refreshMetrics().then(function(){ showToast("Reel analizado. Tu Cerebro acaba de aprender de él."); });
        }
        showError((d&&d.error)||"No pude analizar el reel. Revisa el link.");
      })
      .catch(function(){ showError("Error de red al analizar el reel."); });
  }

  // B4 (prod): conectar la cuenta de Instagram (POST /metrics/ig-profile) y luego
  // traer/actualizar los reels (POST /metrics/analyze → scrape + attribute_and_learn).
  // T2 (IDI): sheet con validación (usuario sin @, sin espacios) en vez de window.prompt.
  function igConnectProfile(){
    promptSheet({
      title:"Conectar Instagram", label:"Tu usuario de Instagram",
      placeholder:"tu_usuario",
      helper:"Sin @. Leo solo tus métricas públicas — sin contraseñas.",
      submitLabel:"Conectar",
      validate:function(v){ v=v.trim().replace(/^@/,""); if(!v) return "Escribe tu usuario de Instagram."; if(/\s/.test(v)) return "El usuario no lleva espacios."; },
      onSubmit:function(v){ igConnectWith(v.trim().replace(/^@/,"")); }
    });
  }
  function igConnectWith(u){
    showToast("Conectando @"+u+"…");
    fetch("/metrics/ig-profile",{method:"POST",credentials:"same-origin",headers:{"Content-Type":"application/json"},body:JSON.stringify({username:u})})
      .then(function(r){ return r.json().catch(function(){return{};}); })
      .then(function(d){
        if(d&&d.ok){
          S.igConnected=true; render();
          showToast("Instagram conectado. Trayendo tus reels…");
          return refreshReels();
        }
        showError((d&&d.error)||"No pude conectar tu Instagram.");
      })
      .catch(function(){ showError("Error de red al conectar Instagram."); });
  }
  function refreshReels(){
    showToast("Actualizando tus reels…");
    return fetch("/metrics/analyze",{method:"POST",credentials:"same-origin",headers:{"Content-Type":"application/json"},body:JSON.stringify({})})
      .then(function(r){ return r.json().catch(function(){return{};}); })
      .then(function(d){
        if(d&&d.ok){
          return refreshMetrics().then(function(){ showToast("Reels actualizados ("+(d.videos_updated||0)+"). Tu Cerebro ha aprendido."); });
        }
        showError((d&&d.error)||"No pude actualizar tus reels.");
      })
      .catch(function(){ showError("Error de red al actualizar tus reels."); });
  }

  /* ── Equipo (Agencia): invitar + cargar miembros reales ──────────
     Mirror del estilo de igConnectProfile/refreshReels (fetch same-origin).
     Backend: POST /agency/invite {email}→{invite_url,token}; GET /agency/members→[]. */
  // T2 (IDI): sheet con validación de email en vez de window.prompt.
  function teamInvite(){
    if(isDemo()){ return showToast("En la demo no se envían invitaciones reales. En tu cuenta Agencia generarías un enlace de invitación."); }
    promptSheet({
      title:"Invitar miembro", label:"Email del miembro",
      placeholder:"nombre@equipo.com",
      helper:"Le creo un enlace de invitación para unirse a tu equipo.",
      submitLabel:"Crear invitación",
      validate:function(v){ v=v.trim(); if(!v) return "Escribe un email para invitar."; if(v.indexOf("@")<1 || v.indexOf("@")===v.length-1) return "Eso no parece un email válido."; },
      onSubmit:function(v){ teamInviteWith(v.trim()); }
    });
  }
  function teamInviteWith(em){
    showToast("Creando invitación…");
    fetch("/agency/invite",{method:"POST",credentials:"same-origin",headers:{"Content-Type":"application/json"},body:JSON.stringify({email:em})})
      .then(function(r){ return r.json().catch(function(){return{};}); })
      .then(function(d){
        if(d&&d.invite_url){
          try{ if(navigator.clipboard&&navigator.clipboard.writeText) navigator.clipboard.writeText(d.invite_url); }catch(e){}
          loadTeam();
          showToast("Invitación creada · enlace copiado");
          return;
        }
        showError((d&&d.error)||"No pude crear la invitación.");
      })
      .catch(function(){ showError("Error de red al crear la invitación."); });
  }
  function loadTeam(){
    if(isDemo()) return;
    fetch("/agency/members",{credentials:"same-origin"})
      .then(function(r){ return r.json().catch(function(){return[];}); })
      .then(function(rows){
        if(!Array.isArray(rows)) rows=[];
        S.team=rows.map(function(m){
          var email=m.invited_email||"miembro";
          var active=m.status==="active";
          return {
            name: email,
            role: active?"Miembro":"Invitado · pendiente",
            initials: (m.invited_email||"M").slice(0,2).toUpperCase(),
            color: active?"#12a37c":"#6d6bf6",
            brands: []
          };
        });
        if(S.tab==="team") render();
      })
      .catch(function(){});
  }

  /* ── teclado (T3, IDI): Esc cierra, Enter envía — como la chrome legacy ── */
  // T6: cerrar el orbe NO cancela el robo — sigue en background y avisa al acabar.
  function closeOverlay(){ if(S.view==="gen") S._genBg=true; clearInterval(S.genStepTimer); clearTimeout(S.fillTimer); S.view="feed"; S._fillPhase=null; render(); }
  function tpBack(){ if(S.tab==="guiones"){ S.view="feed"; } else { S.view=(S.reel&&S.reel.script)?"script":"feed"; } render(); }
  // Cierra lo más "encima" primero: sheet → menú de marca → overlay activo.
  // Equivalencias: result→volver al guión; prompter→tp-back; resto→close-feed.
  function onKeydown(e){
    var el=root(); if(!el || !el.offsetParent) return;   // isla no montada/visible → no interceptar
    if(e.key==="Escape"){
      if(S.sheet){ e.preventDefault(); return closeSheet(); }
      if(S.acctMenu){ e.preventDefault(); S.acctMenu=false; return render(); }
      if(S.brandMenu){ e.preventDefault(); S.brandMenu=false; return render(); }
      if(S.view && S.view!=="feed"){
        e.preventDefault();
        if(S.view==="result"){ S.view="script"; return render(); }
        if(S.view==="prompter") return tpBack();
        return closeOverlay();
      }
      return;   // nada que cerrar → que lo gestione la chrome legacy
    }
    if(e.key==="Enter" && !e.shiftKey && (e.target.tagName||"").toLowerCase()!=="textarea"){
      if(S.sheet && e.target.id==="rsSheetInput"){ e.preventDefault(); return submitSheet(); }
      if(e.target.id==="rsIdeaSeed"){ e.preventDefault(); return seedIdea("rsIdeaSeed", true); }
      if(e.target.id==="rsIdeaSeed2"){ e.preventDefault(); return addSeedIdea(); }
    }
    // T5: trap de foco — con un diálogo abierto, Tab circula dentro y no escapa al fondo.
    if(e.key==="Tab" && (S.sheet || (S.view && S.view!=="feed"))){
      var ov=topOverlay(el); if(!ov) return;
      var foc=ov.querySelectorAll('button,[href],input,textarea,select,[tabindex]:not([tabindex="-1"])');
      if(!foc.length) return;
      var first=foc[0], last=foc[foc.length-1], a=document.activeElement;
      if(!ov.contains(a)){ e.preventDefault(); first.focus(); return; }
      if(e.shiftKey && a===first){ e.preventDefault(); last.focus(); }
      else if(!e.shiftKey && a===last){ e.preventDefault(); first.focus(); }
    }
  }

  /* ── delegación de eventos ───────────────────────────────────── */
  function onClick(e){
    var el=root(); if(!el||!el.contains(e.target)) return;
    var btn=e.target.closest("[data-act]"); if(!btn) return;
    var act=btn.getAttribute("data-act"), id=btn.getAttribute("data-id"), k=btn.getAttribute("data-k");
    S._lastClickSel=actSelector(btn);   // T5: por si esta acción abre un diálogo — saber a quién devolver el foco
    if(act==="sheet-close") return closeSheet();
    if(act==="sheet-submit") return submitSheet();
    if(act==="sheet-secondary") return submitSheetSecondary();
    if(act==="err-close"){ S.errMsg=null; var _te=document.getElementById("rsErr"); if(_te) _te.classList.remove("show"); return; }
    if(act==="tab") return switchTab(k);
    if(act==="legacy") return openLegacy(k);
    if(act==="acct-toggle"){ S.acctMenu=!S.acctMenu; S.brandMenu=false; return render(); }
    if(act==="acct-close"){ S.acctMenu=false; return render(); }
    if(act==="acct-settings"){ S.acctMenu=false; return openLegacy("settings"); }
    if(act==="acct-logout"){ S.acctMenu=false;
      // Reusa el logout real de la chrome (POST /auth/logout + reset tracking + redirect).
      if(typeof window.logout==="function") return window.logout();
      try{ fetch("/auth/logout",{method:"POST",credentials:"same-origin"}); }catch(e){}
      window.location.href="/"+(document.documentElement.lang||"es")+"/"; return;
    }
    if(act==="legacy-back") return closeLegacy();
    if(act==="brand-toggle"){ S.brandMenu=!S.brandMenu; return render(); }
    if(act==="brand") return openBrand(id);
    if(act==="all-brands"){ S.tab="portfolio"; S.brandMenu=false; S.view="feed"; return render(); }
    if(act==="open-brand") return openBrand(id);
    if(act==="demo-plan") return setDemoPlan(k);
    if(act==="team-invite") return teamInvite();
    if(act==="team-edit") return showToast("Gestión de roles y marcas por miembro: próximamente.");
    if(act==="brand-add"){ S.brandMenu=false; render(); return showToast("Nueva marca: disponible en plan Agencia."); }
    if(act==="steal") return steal(id);
    if(act==="fav") return toggleFav(id);
    if(act==="filter"){ S.filter=k; return render(); }
    if(act==="expand-feed"){ S.feedExpanded=true; return render(); }
    if(act==="add-reel") return addReelManual();
    // Reusa el modal legacy global (index.html); al añadir, submitAddCompetitor
    // recarga el Radar vía window.RS_reloadRadar (puente en loadBrandData).
    if(act==="add-comp"){ if(typeof window.openAddCompetitorModal==="function") window.openAddCompetitorModal(); return; }
    if(act==="voice-onboard") return onboardVoice();
    if(act==="voice-refine") return refineVoice();
    if(act==="next-series-go"){ var nt=btn.getAttribute("data-title")||(nextSeries()&&nextSeries().title)||""; S.tab="ideas"; S.view="feed";
      if(nt && !isDemo()){ var tmpNs=makeIdea(nt, nt.length+S.ideas.length); tmpNs._saving=true; S.ideas.unshift(tmpNs); render();
        apiPost("/ideas",{raw_text:nt, language:rsLang(), develop:false}).then(function(r){
          if(r.ok && r.d && r.d.id){ tmpNs.id=r.d.id; tmpNs._server=true; tmpNs._scriptsLoaded=true; tmpNs._saving=false; render(); }
          else { tmpNs._saving=false; render(); } });
      } else { if(nt){ S.ideas.unshift(makeIdea(nt, nt.length+S.ideas.length)); } render(); }
      return showToast("Tu próxima serie, lista para multiplicar en Ideas."); }
    if(act==="fillweek") return startFillWeek();
    if(act==="idea-capture") return openIdeaCapture();
    if(act==="untrack") return untrackCreator(id, btn.getAttribute("data-handle")||"");
    if(act==="seed-go") return seedIdea("rsIdeaSeed", true);
    if(act==="seed-add") return addSeedIdea();
    if(act==="gen5ideas") return gen5ideas(btn);
    if(act==="gen5scripts") return gen5scripts(id, btn);
    if(act==="gen5hooks") return gen5hooks(id, btn);
    if(act==="explosion") return explosion(btn);
    if(act==="save-script") return saveScript(id);
    if(act==="save-hook") return saveHook(id, parseInt(btn.getAttribute("data-i"),10));
    if(act==="idea-toggle"){ var idt=findIdea(id); if(idt){ idt.expanded=(idt.expanded===false); } return render(); }
    if(act==="sc-toggle"){ var sct=findScript(id); if(sct){ sct.expanded=!sct.expanded; } return render(); }
    if(act==="gui-hooks"){ var gh=guionById(id); if(gh){ gh.expanded=!gh.expanded; } return render(); }
    if(act==="gui-use-hook"){ var gu=guionById(id); if(gu&&gu.hooks){ var ix=parseInt(btn.getAttribute("data-i"),10); var nv=gu.hooks[ix]; if(nv!=null){ gu.hooks[ix]=gu.hook; gu.hook=nv; gu.title=nv; } } render(); return showToast("Apertura actualizada."); }
    if(act==="gui-del-hook"){ var gd=guionById(id); if(gd&&gd.hooks){ gd.hooks.splice(parseInt(btn.getAttribute("data-i"),10),1); if(!gd.hooks.length) gd.expanded=false; } return render(); }
    if(act==="gen-background") return closeOverlay();   // T6: seguir navegando (el robo sigue detrás)
    if(act==="chain") return chain(k);
    if(act==="record"){ S.view="prompter"; return render(); }
    if(act==="recorded") return recorded();
    if(act==="back-script"){ S.view="script"; return render(); }
    if(act==="close-feed") return closeOverlay();
    if(act==="tp-back") return tpBack();
    if(act==="ig-connect"){ if(!isDemo()) return igConnectProfile(); S.igConnected=true; bumpEco(0,0); render(); return showToast("Instagram conectado. El sistema empezará a aprender de lo que publicas."); }
    if(act==="ig-disconnect"){ S.igConnected=false; render(); return showToast("Instagram desvinculado."); }
    if(act==="metric-sort"){ S.metricSort=k; return render(); }
    if(act==="metric-chart"){ S.metricChart=k; return render(); }
    if(act==="metric-refresh"){ if(!isDemo()) return refreshReels(); render(); return showToast("Métricas actualizadas."); }
    if(act==="fw-guiones"){ S.view="feed"; S._fillPhase=null; S.tab="guiones"; S.guiFilter="all"; return render(); }
    if(act==="fw-record"){ var fid=S._fillGuionIds&&S._fillGuionIds[0]; var g0=fid?guionById(fid):null; if(g0){ S.activeGuionId=g0.id; S.reel={creator:{handle:(g0.from||"").replace("@","")},script:{hook:g0.hook,beats:g0.beats,close:g0.close}}; S.view="prompter"; render(); } return; }
    if(act==="gui-filter"){ S.guiFilter=k; return render(); }
    if(act==="gui-record"){ var g=guionById(id); if(g){ S.activeGuionId=g.id; S.reel={creator:{handle:(g.from||"").replace("@","")},script:{hook:g.hook,beats:g.beats,close:g.close}}; S.view="prompter"; render(); } return; }
    if(act==="gui-toggle-rec"){ var g2=guionById(id); if(g2){ g2.status=(g2.status==="recorded")?"draft":"recorded"; if(g2.status==="recorded"&&S.stats) S.stats.stolen_today+=1; render(); showToast(g2.status==="recorded"?"Marcado como grabado.":"Vuelto a borrador."); persistRecStatus(g2); } return; }
    if(act==="gui-discard"){ var g3=guionById(id); if(g3){ g3.status="discarded"; S._lastDiscarded=id; render(); showToast("Descartado.","Deshacer","undo-discard"); persistRecStatus(g3); } return; }   // T9: descartar siempre con vuelta atrás
    if(act==="undo-discard"){ var gU=S._lastDiscarded?guionById(S._lastDiscarded):null; S._lastDiscarded=null; if(gU){ gU.status="draft"; persistRecStatus(gU); render(); showToast("Recuperado — vuelve a «Por grabar»."); } return; }
    if(act==="gui-perf"){ S.perfGuion=id; S.view="perf"; return render(); }
    if(act==="gui-link-reel"){ var gl=guionById(id); if(gl){
      // T2 (IDI): sheet con validación de URL en vez de window.prompt.
      promptSheet({
        title:"Vincular reel publicado", label:"Link del reel en Instagram",
        placeholder:"https://www.instagram.com/reel/…",
        helper:"Lo analizo y entrena tu Cerebro: aprendo de cómo tracciona lo que publicas.",
        submitLabel:"Vincular y analizar",
        validate:function(v){ if(!/^https?:\/\/\S+\.\S+/i.test(v.trim())) return "Pega el link completo del reel (empieza por http)."; },
        onSubmit:function(u){ u=u.trim(); gl.published={pending:true, url:u}; gl.status="recorded"; render(); if(isDemo()){ showToast("Reel vinculado. Se analizará en el próximo refresco y entrenará tu Cerebro."); } else { linkReelPublished(gl, u); } }
      });
    } return; }
    if(act==="copy"){ var txt=btn.getAttribute("data-txt"); if(navigator.clipboard) navigator.clipboard.writeText(txt); btn.textContent="✓"; setTimeout(function(){ btn.textContent="Copiar"; },1200); return; }
  }

  /* ════════════════════════════════════════════════════════════════
     CARGA DE DATOS
     ════════════════════════════════════════════════════════════════ */
  function setDevice(){ S.device=window.matchMedia("(max-width:720px)").matches?"mobile":"desktop"; }
  function skeletonHTML(){ return railHTML()+'<div class="work">'+cmdHTML()+'<div class="scroll"><div class="canvas"><div class="statbar"><div class="stat"></div><div class="stat"></div><div class="stat"></div><div class="stat"></div></div><div class="rs-skel" style="height:200px;margin-bottom:14px"></div><div class="rs-skel"></div><div class="rs-skel"></div></div></div></div>'; }

  // DEMO MVP: siembra guiones (con HOOKS agrupados + métricas de publicación) y un
  // perfil de métricas con reels VINCULADOS a sus guiones — para ver el loop completo.
  function seedDemoContent(){
    if(!S._seeded){
      S._seeded=true;
      S.guiones=[
        { id:"gd1", seq:1, title:"Llevo 3 semanas sin tocar mi bandeja de entrada",
          hook:"Llevo 3 semanas sin tocar mi bandeja de entrada. Y no, no la estoy ignorando.",
          beats:["Te lo cuento porque me devolvió 6 horas a la semana.","Paso uno: conectas tu correo a una herramienta.","Paso dos: la IA etiqueta cada email.","Paso tres: te deja el borrador escrito."],
          close:"Guárdate esto, que mañana subo la plantilla.",
          from:"@nick_saraev", brand:brand().name, type:"guión", status:"recorded", expanded:true,
          hooks:["Si pasas más de 30 min al día en el correo, esto es para ti.","Mi IA respondió 212 emails este mes. Yo revisé 11.","Te enseño el flujo que borró el correo de mi lista de tareas."],
          published:{ views:1400000, likes:112000, dur:"0:41", vsMedian:5.8 } },
        { id:"gd2", seq:2, title:"El prompt de 9 palabras que arregla ChatGPT",
          hook:"Hay 9 palabras que cambian por completo cómo te responde ChatGPT.",
          beats:["El problema no es la IA, es cómo le pides las cosas.","Las 9 palabras: «antes de responder, hazme las preguntas que necesites».","De repente deja de inventar."],
          close:"Copia esta frase y cuéntame qué cambió.",
          from:"@aiwithanna", brand:brand().name, type:"guión", status:"recorded",
          hooks:["Llevas usando ChatGPT mal todo este tiempo.","Deja de pedirle cosas como si fuera Google."],
          published:{ views:680000, likes:54000, dur:"0:38", vsMedian:3.2 } },
        { id:"gd3", seq:3, title:"Automaticé mi facturación de freelance en una tarde",
          hook:"El año pasado perdí 2.000€ en facturas que olvidé enviar. Este año, imposible.",
          beats:["Monté un sistema de la propuesta a la factura cobrada.","Se genera sola y manda recordatorios.","Yo solo me entero cuando entra el dinero."],
          close:"Si facturas a mano, guárdate esto.",
          from:"@marcbuilds", brand:brand().name, type:"guión", status:"draft", hooks:[] }
      ];
    }
    S.igConnected=true;
    S.metrics={
      connected:true, analyses_left:"1/1",
      // B1 (demo): sugerencia de próxima serie sembrada (en prod sale de /api/metrics/insights).
      insights:{ what_works:[], next:{ title:"Tu sistema de correo en 3 partes — uno por día", views:1400000, message:"Tu reel del correo petó (5,8× tu media). Estíralo en una miniserie: el problema, el montaje y el resultado. Misma vena, tres piezas." } },
      top:{ title:"Llevo 3 semanas sin tocar mi bandeja", views:"1,4 M" },
      learned:["Tus reels de ~40s superan tu media de vistas","Abrir con pregunta te funciona (3 de tus mejores lo hacen)","Los hooks de «yo hice X y pasó Y» rinden 2,4× más que los de pregunta"],
      videos:[
        { cap:"Llevo 3 semanas sin tocar mi bandeja…", views:1400000, likes:112000, comments:840, dur:"0:41", date:"hace 6 d", top:true, viral:true, from_guion:"Llevo 3 semanas sin tocar mi bandeja de entrada", vsMedian:5.8 },
        { cap:"El prompt de 9 palabras que arregla ChatGPT", views:680000, likes:54000, comments:420, dur:"0:38", date:"hace 12 d", top:true, from_guion:"El prompt de 9 palabras que arregla ChatGPT", vsMedian:3.2 },
        { cap:"Mi setup de creador en 2026 (tour)", views:90000, likes:5400, comments:80, dur:"1:10", date:"hace 18 d" },
        { cap:"3 automatizaciones que deberías tener ya", views:210000, likes:16000, comments:190, dur:"0:33", date:"hace 22 d", from_guion:"Automaticé mi facturación de freelance en una tarde", vsMedian:1.6 }
      ]
    };
  }

  function loadBrandData(){
    var el=root(); if(!el) return;
    try{ window.RS_reloadRadar=loadBrandData; }catch(e){}   // puente: el chrome legacy recarga el Radar tras añadir competidor
    el.innerHTML=skeletonHTML();
    var q=S.brandId?("?brand="+encodeURIComponent(S.brandId)):"";
    var _pq=(S.brandId&&S.brandId!=="default")?("?project_id="+encodeURIComponent(S.brandId)):"";
    Promise.all([
      fetch("/api/radar/stats"+q,{credentials:"same-origin"}).then(function(r){return r.json();}).catch(function(){return{};}),
      fetch("/api/tracked-creators/reels"+(q?q+"&":"?")+"sort=explosion&limit=24",{credentials:"same-origin"}).then(function(r){return r.json();}).catch(function(){return{reels:[]};}),
      fetch("/metrics/summary"+q,{credentials:"same-origin"}).then(function(r){return r.ok?r.json():null;}).catch(function(){return null;}),
      fetch("/api/voice",{credentials:"same-origin"}).then(function(r){return r.ok?r.json():null;}).catch(function(){return null;}),
      fetch("/api/metrics/insights",{credentials:"same-origin"}).then(function(r){return r.ok?r.json():null;}).catch(function(){return null;}),
      fetch("/metrics/videos"+q,{credentials:"same-origin"}).then(function(r){return r.ok?r.json():null;}).catch(function(){return null;}),
      // Contenido REAL del usuario (solo prod): ideas guardadas + guiones persistidos.
      // /ideas y /scripts filtran por project_id (no por "brand"); la marca de la isla
      // es un project. Marca "default" (sin projects) → sin filtro (todo el user).
      isDemo()?Promise.resolve(null):fetch("/ideas"+_pq,{credentials:"same-origin"}).then(function(r){return r.ok?r.json():null;}).catch(function(){return null;}),
      isDemo()?Promise.resolve(null):fetch("/scripts"+_pq,{credentials:"same-origin"}).then(function(r){return r.ok?r.json():null;}).catch(function(){return null;})
    ]).then(function(res){
      var stats=res[0]||{}, feed=res[1]||{}, met=res[2], ins=res[4], vids=res[5], ideasRows=res[6], scriptRows=res[7];
      if(res[3]) S.voice=res[3];   // perfil de voz real (moat) — null en demo dummy
      S.stats={ competitors:stats.competitors||0, reels_week:stats.reels_week||0, exploded_week:stats.exploded_week||0, stolen_today:stats.stolen_today!=null?stats.stolen_today:(stats.stolen_total||0) };
      S.reels=(feed.reels||[]).map(normReel);
      loadTracked();   // T3: lista de competidores seguidos (manejable en Cerebro)
      S.favs={}; S.reels.forEach(function(r){ if(r.fav) S.favs[r.id]=true; });
      S._reelPool=S.reels.slice();   // pool base para variar feed por-marca en demo
      if(met){ S.metrics=met; S.igConnected=!!(met && met.connected); }
      else { S.metrics=null; }
      // /metrics/summary solo trae agregados; los reels reales viven en /metrics/videos.
      // Volcamos a S.metrics.videos (shape que lee metricGridHTML). En demo lo pisa seedDemoContent.
      if(vids){ S.metrics=S.metrics||{}; S.metrics.videos=(vids.videos||[]).map(normMetricVideo); }
      // Insights del Cerebro (lo que funciona en TU cuenta + el siguiente de la serie).
      if(ins){ S.metrics=S.metrics||{}; S.metrics.insights={ what_works:ins.what_works||[], next:ins.next||null }; }
      // Prod: hidrata Ideas (con sus guiones por idea_id) y Guiones desde el backend.
      // Guiones = TODOS los scripts del user; los que tienen idea_id también cuelgan
      // de su idea en la fábrica de Ideas. _sid preserva el id de backend para PATCH/hooks.
      if(!isDemo()){
        var rows=Array.isArray(scriptRows)?scriptRows:[];
        S.guiones=rows.filter(function(s){return s.recording_status!=="discarded";}).map(normScript);
        // _sid → guionId local, para enlazar las script-cards de Ideas con su guión ya
        // persistido (así saveHook no duplica el guión: reusa el existente).
        var guBySid={}; S.guiones.forEach(function(g){ if(g._sid) guBySid[g._sid]=g.id; });
        var byIdea={}; rows.forEach(function(s){ if(s.idea_id){ (byIdea[s.idea_id]=byIdea[s.idea_id]||[]).push(s); } });
        var irows=Array.isArray(ideasRows)?ideasRows:[];
        S.ideas=irows.map(function(i){
          var it=normIdea(i); it._scriptsLoaded=true;
          (byIdea[i.id]||[]).forEach(function(s){
            var sb=makeScriptFromServer(s, it.text);
            if(s.recording_status!=="discarded" && guBySid[s.id]){ sb.saved=true; sb.guionId=guBySid[s.id]; }
            it.scripts.push(sb);
          });
          if(it.scripts.length) it.expanded=true;
          return it;
        });
      }
      if(isDemo()) seedDemoContent();   // MVP demo: SIEMPRE siembra guiones+hooks+reels vinculados
      if(isDemo() && !(isAgency() && S.tab==="portfolio")) applyDemoBrand();
      if(!isDemo() && isAgency()){ S.team=[]; loadTeam(); }   // S.team=[] antes de render: evita que teamHTML caiga al pool demo mientras loadTeam (async) resuelve; loadTeam re-renderiza al volver
      render();
    });
  }

  // Lee la sección de la URL (/profile/<x>) y la traduce al rail de la isla:
  //   radar/overview/dashboard → Radar (deja el default)  ·  scripts → Guiones
  //   ideas → Ideas · metrics → Métricas · brain → Cerebro · transc(riptions) → Analizar
  //   settings → Configuración · sin equivalente → Radar (default).
  // Los deep-links del demo (?plan/?t=) se aplican DESPUÉS y siguen mandando.
  function _routeFromPath(){
    var seg=""; try{ var m=(location.pathname||"").match(/^\/profile\/([^\/?#]+)/); seg=m?m[1].toLowerCase():""; }catch(e){}
    if(!seg) return;
    if(seg==="transc"||seg==="transcriptions"){ S._pendingLegacy="transc"; return; }
    if(seg==="settings"){ S._pendingLegacy="settings"; return; }
    // Cualquier /profile/<x> con sección → tab del rail. Sin equivalente → "dashboard" (Radar).
    S.tab = ({scripts:"guiones", guiones:"guiones", ideas:"dashboard", metrics:"metrics",
              brain:"brain", cerebro:"brain", portfolio:"portfolio", team:"team",
              radar:"dashboard", overview:"dashboard", dashboard:"dashboard"})[seg] || "dashboard";
  }
  function loadAll(){
    setDevice();
    var el=root(); if(!el) return;
    el.innerHTML=skeletonHTML();
    Promise.all([
      fetch("/auth/me",{credentials:"same-origin"}).then(function(r){return r.json();}).catch(function(){return{};}),
      fetch("/api/brands",{credentials:"same-origin"}).then(function(r){return r.ok?r.json():{brands:[]};}).catch(function(){return{brands:[]};})
    ]).then(function(res){
      var me=res[0]||{}, bd=res[1]||{};
      if(me.user){ S.user.name=me.user.name||(me.user.email||"").split("@")[0]||""; S.user.handle=me.user.handle||(me.user.email||"").split("@")[0]||""; S.user.email=me.user.email||""; }
      if(me.credits!=null) S.user.credits=me.credits; else if(me.credits_cents!=null) S.user.credits=Math.round(me.credits_cents/18);
      if(me.streak!=null) S.user.streak=me.streak;
      // Plan crudo de /auth/me (puede ser "free") + «Hazlo mío» de por vida restantes.
      S.user.plan=(me.plan||(me.user&&me.user.plan))||"";
      if(me.free_lifetime_left!=null) S.user.freeLeft=me.free_lifetime_left;
      // Plan: en demo arranca en Agencia para ver el portfolio (toggle lo cambia);
      // en prod sale de /auth/me (profiles.plan).
      // Normaliza el plan crudo de /auth/me → modos de la isla. Prod guarda valores en
      // INGLÉS (verificado en DB: free, agency); la isla razona en creador|agencia. Sin esto
      // los Agency (plan="agency") fallaban isAgency() y perdían Portfolio/Equipo en prod.
      var _rawPlan = (me.plan||(me.user&&me.user.plan))||"free";
      S.plan = isDemo() ? "agencia" : (_rawPlan === "agency" ? "agencia" : "creador");
      S.brands=(bd.brands&&bd.brands.length)?bd.brands:[{id:"default",name:(me.user&&me.user.name)?me.user.name:"Mi marca",handle:S.user.handle,color:"#f97316",level:1,voice:40,reelsAnalyzed:0,scripts:0}];
      if(isDemo()){ S.brands = isAgency() ? demoBrands() : [demoBrands()[0]]; }
      S.brandId=S.brands[0].id;
      S.tab = isAgency() ? "portfolio" : "dashboard";   // agencia entra en MACRO
      _routeFromPath();   // la isla muestra la sección de /profile/<x> en el rail
      // Demo deep-link: ?plan= ?t=<tab> ?b=<brandId> para previsualizar cualquier vista.
      if(isDemo()){ try{ var qs=new URLSearchParams(location.search);
        var qp=qs.get("plan"); if(qp==="creador"){ S.plan="creador"; S.brands=[demoBrands()[0]]; S.brandId=S.brands[0].id; S.tab="dashboard"; } else if(qp==="agencia"){ S.plan="agencia"; S.brands=demoBrands(); S.brandId=S.brands[0].id; S.tab="portfolio"; }
        var qb=qs.get("b"); if(qb && S.brands.some(function(x){return x.id===qb;})){ S.brandId=qb; S.tab="dashboard"; }
        var qt=qs.get("t"); if(qt==="perf"){ S.tab="guiones"; S.view="perf"; S.perfGuion="gd1"; } else if(qt){ S.tab=qt; }
      }catch(e){} }
      loadBrandData();
    });
  }

  window.RadarLoop={
    mount:function(){
      if(!root()) return;
      // Takeover definitivo: la isla ocupa todo el workspace y oculta la chrome
      // vieja (sidebar, subtabs). Las secciones legacy (Analizar/Configuración) se
      // alcanzan desde el rail. Siempre activo (ya no solo en demo).
      try{ document.body.classList.add("rs-takeover"); }catch(e){}
      if(!S._wired){ document.addEventListener("click", onClick); document.addEventListener("keydown", onKeydown); window.addEventListener("resize", function(){ var d=S.device; setDevice(); if(d!==S.device) render(); }); S._wired=true; }
      loadAll();
    },
    // T2: puente para que el CRUD legacy de asistentes (modal en index.html)
    // repinte la isla tras crear/editar/borrar. Seguro si la isla no está montada.
    refresh:function(){ try{ render(); }catch(e){} }
  };
})();
