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
    bulb:'<svg viewBox="0 0 24 24" fill="none" width="18" height="18"><path d="M9 18h6M10 21h4M12 3a6 6 0 00-4 10.5c.6.6 1 1.3 1 2.1V16h6v-.4c0-.8.4-1.5 1-2.1A6 6 0 0012 3z" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/></svg>'
  };

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
    user:{ name:"", handle:"", credits:0, streak:0 },
    brands:[], brandId:null,
    reels:[], favs:{}, filter:"explosion",
    ideas:[], guiones:[],
    tab:"dashboard",                    // dashboard | ideas | guiones
    view:"feed",                        // feed(overlay off) | gen | script | result | prompter | fillweek
    reel:null, genKind:"script", resultKind:"hooks", done:{},
    _fillPhase:null, brandMenu:false,
    genStepTimer:null, fillTimer:null, toastTimer:null
  };
  function root(){ return document.getElementById("radarRoot"); }
  function brand(){ return S.brands.filter(function(b){return b.id===S.brandId;})[0] || S.brands[0] || {name:"Mi marca",level:1,voice:40,reelsAnalyzed:0,scripts:0,color:"#f97316"}; }

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

  function greetWord(){ var h=new Date().getHours(); return h<6?"Buenas noches":h<13?"Buenos días":h<21?"Buenas tardes":"Buenas noches"; }

  /* ════════════════════════════════════════════════════════════════
     TOPBAR + selector de marca + navegación
     ════════════════════════════════════════════════════════════════ */
  function topbarHTML(){
    var b=brand();
    var navTabs=[["dashboard","Dashboard",IC.grid],["ideas","Ideas",IC.bulb],["guiones","Guiones",IC.doc]];
    var nav=S.device==="desktop"?'<div class="rs-nav">'+navTabs.map(function(t){
      return '<button class="navchip'+(S.tab===t[0]?" on":"")+'" data-act="tab" data-k="'+t[0]+'">'+t[1]+'</button>';
    }).join("")+'</div>':'';
    var streak=(S.user.streak>0)?'<span class="navchip" style="color:var(--brand-500);cursor:default" title="Días seguidos creando">🔥 '+S.user.streak+'</span>':'';
    // selector de marca
    var others=S.brands.filter(function(x){return x.id!==S.brandId;});
    var menu=S.brandMenu?'<div class="brand-menu">'+
      others.map(function(x){return '<button class="brand-opt" data-act="brand" data-id="'+ESC(x.id)+'"><span class="brand-dot" style="background:'+ESC(x.color)+'"></span>'+ESC(x.name)+'<span class="brand-lvl">Nv '+x.level+'</span></button>';}).join("")+
      '<button class="brand-opt add" data-act="brand-add">'+IC.plus+' Añadir marca</button>'+
    '</div>':'';
    return ''+
    '<div class="topbar">'+
      '<button class="brand-switch" data-act="brand-toggle">'+
        '<span class="brand-dot" style="background:'+ESC(b.color)+'"></span>'+
        '<span class="brand-name">'+ESC(b.name)+'</span>'+
        '<span class="brand-chev">'+IC.chev+'</span>'+
      '</button>'+menu+
      nav+
      '<span class="grow"></span>'+streak+
      '<div class="spark" id="rsSpark" title="Créditos disponibles">'+IC.spark+'<span><b id="rsSparkN">'+S.user.credits+'</b></span></div>'+
    '</div>';
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

  function ideaInputHTML(){
    return ''+
    '<div class="idea-launch">'+
      '<div class="idea-launch-ic">'+IC.bulb+'</div>'+
      '<input class="idea-launch-input" id="rsIdeaSeed" placeholder="Tienes una idea suelta? Escríbela y la convertimos en guiones…" />'+
      '<button class="btn btn-md btn-primary" data-act="seed-go">'+IC.bolt+' Desarrollar</button>'+
    '</div>';
  }

  function whaleHTML(count){
    return '<div class="whale"><div class="wicon">⚡</div><div class="wtext"><h4>Llena mi semana</h4><p>Convierte los '+count+' reels más explosivos en '+count+' guiones con tu voz, listos para grabar. De golpe.</p></div><button class="btn btn-md btn-primary" data-act="fillweek">Hazlo</button></div>';
  }
  function filtersHTML(){
    var base=[["explosion","🔥 Explotando"],["recent","Recientes"],["fav","★ Favoritos"]];
    return '<div class="filters">'+base.map(function(f){return '<button class="fchip'+(S.filter===f[0]?" on":"")+'" data-act="filter" data-k="'+f[0]+'">'+f[1]+'</button>';}).join("")+
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
    var mega=(r.explosion||0)>=5, isFav=!!S.favs[r.id];
    var thumbInner=r.thumb?'<img src="'+ESC(r.thumb)+'" alt="">':'<div class="play"></div>';
    var badge=r.explosionTxt!=null?'<span class="badge badge-explode'+(mega?" mega":"")+'">🔥 '+ESC(r.explosionTxt)+'x su media</span>':'';
    return '<div class="reel"><div class="thumb">'+thumbInner+'<span class="dur">'+ESC(r.dur)+'</span><span class="thumb-tag">reel ·'+ESC(r.creator.handle.slice(0,6))+'</span></div>'+
      '<div class="body"><div class="crow"><div class="ava">'+ESC(r.creator.initials)+'</div><span class="who">@'+ESC(r.creator.handle)+'</span><span class="when">· '+ESC(r.when)+'</span></div>'+
      '<p class="cap">'+ESC(r.cap)+'</p>'+(r.sum?'<p class="sum">'+ESC(r.sum)+'</p>':'')+
      '<div class="metrics"><span>'+IC.eye+' '+ESC(r.views)+'</span><span>'+IC.heart+' '+ESC(r.likes)+'</span>'+badge+'</div>'+
      '<div class="actions"><button class="btn btn-md btn-primary" data-act="steal" data-id="'+ESC(r.id)+'">✨ Hazlo mío</button>'+
      '<button class="iconbtn'+(isFav?" on":"")+'" data-act="fav" data-id="'+ESC(r.id)+'" title="Guardar">'+(isFav?IC.star:IC.starO)+'</button></div></div></div>';
  }

  function dashboardHTML(){
    var reels=feedReels();
    var fc=reels.length===0?'<div class="rs-empty">'+(S.filter==="fav"?"Sin favoritos aún. Toca la estrella en un reel.":"Sin reels todavía. Añade competidores o pega un reel.")+'</div>':reels.map(reelCardHTML).join("");
    var fillCount=Math.min(5,S.reels.length)||5;
    var st=S.stats||{competitors:0,reels_week:0,exploded_week:0,stolen_today:0};
    var nudge=st.stolen_today===0?'<span class="nudge">Aún no has creado nada hoy.</span>':'<span class="nudge">Llevas '+st.stolen_today+' hoy — sigue.</span>';
    return '<div class="scroll"><div class="pad">'+
      '<div class="momentum"><h1 class="greet">'+ESC(greetWord())+(S.user.name?", "+ESC(S.user.name):"")+'</h1>'+
        '<p class="line">Esta semana tus <span class="hot">'+st.competitors+' rivales</span> publicaron '+st.reels_week+' reels. <span class="hot">'+st.exploded_week+' explotaron</span>. '+nudge+'</p></div>'+
      ecosystemHTML()+
      ideaInputHTML()+
      (S.reels.length?whaleHTML(fillCount):"")+
      filtersHTML()+
      '<div class="feed">'+fc+'</div>'+
    '</div></div>';
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

  function makeScript(ideaText, seed){
    var hook=pick(BANK_HOOKS,1,seed)[0];
    return { id:gid("sc"), hook:hook,
      beats:["Te lo cuento porque a mí me cambió la forma de trabajar.","Paso uno: lo más simple, lo que casi nadie hace.","Paso dos: aquí está el 80% del resultado.","Paso tres: lo dejas funcionando y te olvidas."],
      close:"Guárdate esto y dime en comentarios por dónde empiezas.",
      hooks:null, saved:false, expanded:false, idea:ideaText };
  }
  function makeIdea(text, seed){ return { id:gid("id"), text:text, scripts:[], expanded:true, seed:seed }; }

  function ideasHTML(){
    var head='<div class="pad ideas-pad">'+
      '<div class="ideas-head"><h1 class="greet" style="font-size:30px;margin:0 0 6px">Fábrica de ideas</h1>'+
      '<p class="line" style="margin:0 0 18px">Apunta una idea suelta y multiplícala. Idea → guiones → hooks. Guarda los que te convenzan.</p></div>'+
      '<div class="idea-launch"><div class="idea-launch-ic">'+IC.bulb+'</div>'+
        '<input class="idea-launch-input" id="rsIdeaSeed2" placeholder="Apunta una idea rápida…" />'+
        '<button class="btn btn-md btn-secondary" data-act="seed-add">Añadir</button>'+
        '<button class="btn btn-md btn-primary" data-act="gen5ideas">'+IC.spark+' 5 ideas</button>'+
      '</div>'+
      '<button class="explosion-btn" data-act="explosion">💥 Explosión creativa<span>5 ideas × 5 guiones × 5 hooks — '+COST.explosion+' créditos</span></button>';
    var list=S.ideas.length===0
      ? '<div class="rs-empty" style="margin-top:24px">Aún no hay ideas. Escribe una arriba o pulsa “5 ideas”.</div>'
      : '<div class="ideas-list">'+S.ideas.map(ideaBlockHTML).join("")+'</div>';
    return '<div class="scroll">'+head+list+'</div></div>';
  }
  function ideaBlockHTML(idea){
    var scripts=idea.scripts.map(scriptBlockHTML).join("");
    var genBtn=idea.scripts.length===0
      ? '<button class="btn btn-sm btn-primary" data-act="gen5scripts" data-id="'+idea.id+'">'+IC.bolt+' 5 guiones</button>'
      : '<button class="btn btn-sm btn-secondary" data-act="gen5scripts" data-id="'+idea.id+'">+ 5 guiones más</button>';
    return '<div class="idea-block">'+
      '<div class="idea-block-head"><div class="idea-ic">'+IC.bulb+'</div><div class="idea-text">'+ESC(idea.text)+'</div>'+genBtn+'</div>'+
      (idea.scripts.length?'<div class="idea-scripts">'+scripts+'</div>':'')+
    '</div>';
  }
  function scriptBlockHTML(sc){
    var hooks=sc.hooks?('<div class="sc-hooks">'+sc.hooks.map(function(h,i){return '<div class="sc-hook"><span class="hn">'+String(i+1).padStart(2,"0")+'</span><span>'+ESC(h)+'</span><button class="sc-hook-save" data-act="save-hook" data-id="'+sc.id+'" data-i="'+i+'">Guardar</button></div>';}).join("")+'</div>'):'';
    var hooksBtn=sc.hooks?'':'<button class="btn btn-sm btn-ghost" data-act="gen5hooks" data-id="'+sc.id+'">'+IC.hook+' 5 hooks</button>';
    var saved=sc.saved?'<span class="sc-saved">'+IC.check+' En Guiones</span>':'<button class="btn btn-sm btn-secondary" data-act="save-script" data-id="'+sc.id+'">Guardar guión</button>';
    return '<div class="sc-block">'+
      '<div class="sc-hook-line">'+ESC(sc.hook)+'</div>'+
      '<div class="sc-actions">'+hooksBtn+saved+'</div>'+
      hooks+
    '</div>';
  }

  /* ════════════════════════════════════════════════════════════════
     GUIONES — validados (guardados desde Ideas / robados)
     ════════════════════════════════════════════════════════════════ */
  function guionesHTML(){
    var items=S.guiones;
    var body=items.length===0
      ? '<div class="rs-empty" style="margin-top:24px">Aquí viven los guiones que validas. Crea en <b>Ideas</b> o roba uno del <b>Dashboard</b> y guárdalo.</div>'
      : '<div class="gui-list">'+items.map(function(g){
          var st=g.recording_status||"pending";
          var pill=st==="recorded"?'<span class="gui-pill done">'+IC.check+' Grabado</span>':'<span class="gui-pill">Por grabar</span>';
          return '<div class="gui-card"><div class="gui-main"><div class="gui-title">'+ESC(g.title||g.hook||"Guión")+'</div>'+
            '<div class="gui-meta">'+(g.from?'robado de @'+ESC(g.from)+' · ':'')+(g.assistant?'voz '+ESC(g.assistant):'')+'</div></div>'+
            pill+'<button class="iconbtn" data-act="gui-record" data-id="'+ESC(g.id)+'" title="Teleprompter">'+IC.mic+'</button></div>';
        }).join("")+'</div>';
    return '<div class="scroll"><div class="pad">'+
      '<div class="ideas-head"><h1 class="greet" style="font-size:30px;margin:0 0 6px">Tus guiones</h1>'+
      '<p class="line" style="margin:0 0 18px">Los que has validado. Listos para grabar con el teleprompter.</p></div>'+
      body+'</div></div>';
  }

  /* ════════════════════════════════════════════════════════════════
     OVERLAYS (gen / script / formatos / teleprompter / fillweek)
     ════════════════════════════════════════════════════════════════ */
  function generatingHTML(kind){ var steps=GEN_STEPS[kind]||GEN_STEPS.script; return '<div class="gen"><div class="orb"></div><div><div class="gtitle">'+ESC(GEN_TITLE[kind]||"Trabajando")+'</div><div class="gstep" id="rsGenStep">'+ESC(steps[0])+'</div></div></div>'; }
  function conveyorHTML(){
    var items=[["record",IC.mic,"Grábalo ahora","Teleprompter listo · gratis",true],["hooks",IC.hook,"5 hooks alternativos","El hook es el 80% del reel",false],["carousel",IC.layers,"Conviértelo en carrusel","La misma idea, en post",false],["linkedin",'<span style="font-weight:800;font-size:13px">in</span>',"Versión LinkedIn","Llega a otro público",false],["x",'<span style="font-weight:800;font-size:15px">𝕏</span>',"Hilo para X","Exprime el mismo ángulo",false],["serie",IC.repeat,"Genérame una serie de 3","Contenido para toda la semana",false]];
    var rows=items.map(function(it){ var k=it[0],d=!!S.done[k]; var lbl=d?(k==="record"?"Grabado ✓":"Hecho ✓"):it[2];
      return '<button class="chain'+(it[4]?" feature":"")+(d?" done":"")+'" '+(d?"":'data-act="chain" data-k="'+k+'"')+'><div class="cic">'+(d?IC.check:it[1])+'</div><div class="ctext"><div class="ct">'+ESC(lbl)+'</div><div class="cd">'+ESC(it[3])+'</div></div>'+(d?"":'<span class="arr">'+IC.arr+'</span>')+'</button>'; }).join("");
    return '<div class="belt"><div class="belt-h"><h4>¿Y ahora?</h4></div><p class="belt-sub">Ya tienes el guión. Multiplícalo en un toque — cada formato es una pieza más sin volver a pensar.</p><div class="belt-grid">'+rows+'</div></div>';
  }
  function scriptRevealHTML(){
    var r=S.reel,s=r.script||{hook:"",beats:[],close:""};
    var beats=(s.beats||[]).map(function(b,i){return '<div class="beat"><span class="n">'+String(i+1).padStart(2,"0")+'</span><span>'+ESC(b)+'</span></div>';}).join("");
    return '<div class="script-wrap fade-in"><div class="script-src"><span>Robado de <b style="color:var(--text-secondary)">@'+ESC(r.creator.handle)+'</b></span><span style="opacity:.4">·</span><span class="voice-tag">'+IC.spark+' En la voz de '+ESC(brand().name)+'</span></div>'+
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
  function overlayShellHTML(inner,title,backAct,closeIcon){ return '<div class="overlay"><div class="obar"><button class="back" data-act="'+backAct+'">'+(closeIcon?IC.x:IC.back)+'</button><span class="otitle">'+ESC(title)+'</span></div><div class="oscroll">'+inner+'</div></div>'; }
  function teleprompterHTML(){
    var r=S.reel,s=r.script||{hook:"",beats:[],close:""};
    var body='<p class="hook">'+ESC(s.hook)+'</p>'+(s.beats||[]).map(function(b){return '<p>'+ESC(b)+'</p>';}).join("")+'<p>'+ESC(s.close)+'</p>';
    return '<div class="overlay prompter"><div class="obar"><button class="back" data-act="tp-back">'+IC.back+'</button><span class="otitle">Teleprompter</span><span style="flex:1"></span><span style="font-size:12px;color:rgba(255,255,255,.5)">@'+ESC(r.creator.handle)+' · robado</span></div>'+
      '<div class="tp-scroll"><div class="tp-text">'+body+'</div></div>'+
      '<div class="tp-foot"><button class="btn btn-lg" style="background:rgba(255,255,255,.12);color:#fff;border:none;flex:0 0 auto" data-act="tp-back">Aún no</button><button class="btn btn-lg btn-primary" data-act="recorded">'+IC.check+' Ya lo grabé</button></div></div>';
  }
  function fillReels(){ return S.reels.slice().sort(function(a,b){return (b.explosion||0)-(a.explosion||0);}).slice(0,5); }
  function fillWeekHTML(reels,phase){
    var allDone=phase===-1;
    var head=allDone?"Tu semana está lista":"Llenando tu semana…";
    var sub=allDone?reels.length+" guiones con tu voz, listos para grabar. No vuelves a quedarte en blanco esta semana.":"Robando los "+reels.length+" reels más explosivos y reescribiéndolos en tu voz, uno a uno.";
    var rows=reels.map(function(r,i){ var state=allDone||i<phase?"done":(i===phase?"run":"wait"); var stat=state==="wait"?"En cola":state==="run"?'<span class="mini-spin"></span> Reescribiendo':IC.check+' Listo';
      return '<div class="batch-row'+(state==="done"?" is-done":"")+'"><div class="ava bava">'+ESC(r.creator.initials)+'</div><div class="binfo"><div class="bt">'+ESC(r.cap)+'</div><div class="bw">@'+ESC(r.creator.handle)+' · 🔥 '+ESC(r.explosionTxt!=null?r.explosionTxt:"")+'x</div></div><div class="bstat '+state+'">'+stat+'</div></div>'; }).join("");
    var foot=allDone?'<div class="cluster" style="margin-top:22px;gap:10px"><button class="btn btn-md btn-secondary" data-act="fw-radar">Ver en el Dashboard</button><button class="btn btn-md btn-primary" data-act="fw-record">'+IC.mic+' Grabar el primero</button></div>':'';
    return '<div class="batch fade-in"><h2 class="result-head serif" style="font-size:28px">'+ESC(head)+'</h2><p class="result-sub">'+ESC(sub)+'</p>'+rows+foot+'</div>';
  }

  /* ════════════════════════════════════════════════════════════════
     RENDER maestro
     ════════════════════════════════════════════════════════════════ */
  function render(){
    var el=root(); if(!el) return;
    el.className="rs app "+(S.device==="mobile"?"rs--mobile":"rs--desktop");
    el.setAttribute("data-theme",(document.documentElement.getAttribute("data-theme")==="light"?"light":"dark"));
    var html=topbarHTML();
    if(S.tab==="dashboard") html+=dashboardHTML();
    else if(S.tab==="ideas") html+=ideasHTML();
    else if(S.tab==="guiones") html+=guionesHTML();
    if(S.view==="gen") html+=overlayShellHTML(generatingHTML(S.genKind),"Trabajando…","close-feed",true);
    else if(S.view==="script") html+=overlayShellHTML(scriptRevealHTML(),"Tu guión, en tu voz","close-feed",true);
    else if(S.view==="result") html+=overlayShellHTML(formatResultHTML(S.resultKind),"Listo","back-script",false);
    else if(S.view==="prompter") html+=teleprompterHTML();
    else if(S.view==="fillweek") html+='<div class="overlay"><div class="obar"><button class="back" data-act="close-feed">'+IC.x+'</button><span class="otitle">Llena mi semana</span></div><div class="oscroll" id="rsFillHost">'+fillWeekHTML(fillReels(),S._fillPhase==null?0:S._fillPhase)+'</div></div>';
    html+='<div class="rs-toast" id="rsToast"><span class="tdot"></span><span id="rsToastMsg"></span></div>';
    el.innerHTML=html;
    if(S.view==="gen") startGenSteps();
  }

  /* ── animaciones ─────────────────────────────────────────────── */
  function startGenSteps(){ clearInterval(S.genStepTimer); var steps=GEN_STEPS[S.genKind]||GEN_STEPS.script,i=0; S.genStepTimer=setInterval(function(){ i=(i+1)%steps.length; var n=document.getElementById("rsGenStep"); if(n){ n.style.opacity=0; setTimeout(function(){ n.textContent=steps[i]; n.style.opacity=1; },150); } },700); }
  function flashSpark(delta){ var sp=document.getElementById("rsSpark"),nEl=document.getElementById("rsSparkN"); if(nEl) nEl.textContent=S.user.credits; if(sp&&delta<0){ sp.classList.add("flash"); var fly=document.createElement("span"); fly.className="spark-fly"; fly.textContent=delta; sp.appendChild(fly); setTimeout(function(){ sp.classList.remove("flash"); if(fly.parentNode) fly.parentNode.removeChild(fly); },1000); } }
  function showToast(msg){ var t=document.getElementById("rsToast"),m=document.getElementById("rsToastMsg"); if(!t||!m) return; m.textContent=msg; t.classList.add("show"); clearTimeout(S.toastTimer); S.toastTimer=setTimeout(function(){ t.classList.remove("show"); },2800); }
  function spend(n){ S.user.credits=Math.max(0,S.user.credits-n); }
  function bumpEco(scripts, reels){ var b=brand(); if(!b) return; b.scripts=(b.scripts||0)+(scripts||0); b.reelsAnalyzed=(b.reelsAnalyzed||0)+(reels||0); b.voice=Math.min(98,(b.voice||40)+(scripts||0)*1.5+(reels||0)); if(b.voice>=20*(b.level||1)+30) b.level=Math.min(5,(b.level||1)+1); }

  /* ════════════════════════════════════════════════════════════════
     ACCIONES
     ════════════════════════════════════════════════════════════════ */
  function switchTab(t){ S.tab=t; S.brandMenu=false; render(); }
  function switchBrand(id){ if(S.brandId===id){ S.brandMenu=false; return render(); } S.brandId=id; S.brandMenu=false; loadBrandData(); }
  function steal(id){
    var r=S.reels.filter(function(x){return x.id===id;})[0]; if(!r) return;
    S.reel=r; S.genKind="script"; S.done={}; S.view="gen"; render();
    ensureScript(r,function(){ spend(COST.script); bumpEco(1,1); S.view="script"; render(); flashSpark(-COST.script); });
  }
  function ensureScript(r,cb){
    if(r.script&&r.script.hook){ setTimeout(cb,1700); return; }
    if(isDemo()){ setTimeout(cb,1700); return; }
    var t0=Date.now();
    fetch("/api/competitors/reels/"+encodeURIComponent(r.id)+"/generate-script",{method:"POST",credentials:"same-origin"}).then(function(res){return res.json().catch(function(){return{};});}).then(function(d){ r.script=parseScript(d.script||d.result,r); setTimeout(cb,Math.max(0,1500-(Date.now()-t0))); }).catch(function(){ r.script=r.script||{hook:r.cap,beats:[],close:""}; setTimeout(cb,800); });
  }
  function parseScript(sc,r){ if(sc&&typeof sc==="object"&&sc.hook) return sc; if(typeof sc==="string"){ var l=sc.split(/\n+/).map(function(s){return s.replace(/^▸\s*/,"").trim();}).filter(Boolean); return {hook:l[0]||r.cap,beats:l.slice(1,-1),close:l.length>1?l[l.length-1]:""}; } return {hook:r.cap,beats:[],close:""}; }
  function chain(kind){ if(kind==="record"){ S.view="prompter"; render(); return; } S.genKind=kind; S.resultKind=kind; S.view="gen"; render(); setTimeout(function(){ spend(COST[kind]||1); S.done[kind]=true; S.view="result"; render(); flashSpark(-(COST[kind]||1)); },1500); }
  function recorded(){ S.done.record=true; if(S.stats) S.stats.stolen_today+=1; S.view="feed"; render(); showToast("Guión grabado. Te esperan más reels que explotaron hoy →"); }
  function startFillWeek(){ var reels=fillReels(); spend(reels.length); bumpEco(reels.length,reels.length); S.view="fillweek"; S._fillPhase=0; render(); flashSpark(-reels.length); runFillPhase(); }
  function runFillPhase(){ var reels=fillReels(); clearTimeout(S.fillTimer); S.fillTimer=setTimeout(function(){ if(S._fillPhase>=reels.length){ S._fillPhase=-1; updateFillHost(); return; } S._fillPhase++; updateFillHost(); runFillPhase(); },720); updateFillHost(); }
  function updateFillHost(){ var host=document.getElementById("rsFillHost"); if(host) host.innerHTML=fillWeekHTML(fillReels(),S._fillPhase==null?0:S._fillPhase); }
  function toggleFav(id){ S.favs[id]=!S.favs[id]; var m=S.favs[id]?"POST":"DELETE"; if(!isDemo()) fetch("/api/competitors/reels/"+encodeURIComponent(id)+"/favorite",{method:m,credentials:"same-origin"}).catch(function(){}); render(); }

  /* ── fábrica de ideas ────────────────────────────────────────── */
  function seedIdea(inputId, jumpToIdeas){
    var inp=document.getElementById(inputId); var txt=inp?inp.value.trim():"";
    if(!txt){ if(jumpToIdeas){ S.tab="ideas"; render(); } return; }
    S.ideas.unshift(makeIdea(txt, txt.length+S.ideas.length));
    if(jumpToIdeas) S.tab="ideas";
    render();
  }
  function addSeedIdea(){ var inp=document.getElementById("rsIdeaSeed2"); var txt=inp?inp.value.trim():""; if(!txt) return; S.ideas.unshift(makeIdea(txt, txt.length+S.ideas.length)); render(); }
  function gen5ideas(){ spend(COST.idea5); var seed=Date.now()%97; var fresh=pick(BANK_IDEAS,5,seed).map(function(t,i){return makeIdea(t,seed+i*7);}); S.ideas=fresh.concat(S.ideas); render(); flashSpark(-COST.idea5); showToast("5 ideas nuevas para expandir."); }
  function gen5scripts(ideaId){ var idea=findIdea(ideaId); if(!idea) return; spend(COST.scripts5); for(var i=0;i<5;i++) idea.scripts.push(makeScript(idea.text,(idea.seed||0)+idea.scripts.length+i)); bumpEco(5,0); render(); flashSpark(-COST.scripts5); showToast("5 guiones a partir de tu idea."); }
  function gen5hooks(scriptId){ var sc=findScript(scriptId); if(!sc) return; spend(COST.hooks5); sc.hooks=pick(BANK_HOOKS,5,(sc.hook||"").length+ Object.keys(S.ideas).length); render(); flashSpark(-COST.hooks5); }
  function explosion(){
    spend(COST.explosion); var seed=Date.now()%89;
    var ideas=pick(BANK_IDEAS,5,seed).map(function(t,i){ var idea=makeIdea(t,seed+i*5); for(var j=0;j<5;j++){ var sc=makeScript(t,seed+i*5+j); sc.hooks=pick(BANK_HOOKS,5,seed+i+j); idea.scripts.push(sc); } return idea; });
    S.ideas=ideas.concat(S.ideas); bumpEco(25,0); render(); flashSpark(-COST.explosion); showToast("💥 5 ideas × 5 guiones × 5 hooks. La semana entera, de un golpe.");
  }
  function findIdea(id){ return S.ideas.filter(function(x){return x.id===id;})[0]; }
  function findScript(id){ for(var i=0;i<S.ideas.length;i++){ var s=S.ideas[i].scripts.filter(function(x){return x.id===id;})[0]; if(s) return s; } return null; }
  function saveScript(scriptId){ var sc=findScript(scriptId); if(!sc||sc.saved) return; sc.saved=true; S.guiones.unshift({id:gid("g"),title:sc.hook,hook:sc.hook,from:null,assistant:brand().name,recording_status:"pending"}); bumpEco(0,0); render(); showToast("Guardado en Guiones."); }
  function saveHook(scriptId,i){ var sc=findScript(scriptId); if(!sc||!sc.hooks) return; var h=sc.hooks[i]; S.guiones.unshift({id:gid("g"),title:h,hook:h,from:null,assistant:brand().name,recording_status:"pending"}); render(); showToast("Hook guardado en Guiones."); }
  function addReelManual(){ var url=window.prompt("Pega la URL de un reel (Instagram/TikTok) para meterlo a tu ecosistema:"); if(!url) return; showToast("Reel en cola. Lo añadimos a tu ecosistema en unos segundos."); bumpEco(0,1); }

  /* ── delegación de eventos ───────────────────────────────────── */
  function onClick(e){
    var el=root(); if(!el||!el.contains(e.target)) return;
    var btn=e.target.closest("[data-act]"); if(!btn) return;
    var act=btn.getAttribute("data-act"), id=btn.getAttribute("data-id"), k=btn.getAttribute("data-k");
    if(act==="tab") return switchTab(k);
    if(act==="brand-toggle"){ S.brandMenu=!S.brandMenu; return render(); }
    if(act==="brand") return switchBrand(id);
    if(act==="brand-add"){ S.brandMenu=false; render(); return showToast("Nueva marca: disponible en plan Agencia."); }
    if(act==="steal") return steal(id);
    if(act==="fav") return toggleFav(id);
    if(act==="filter"){ S.filter=k; return render(); }
    if(act==="add-reel") return addReelManual();
    if(act==="fillweek") return startFillWeek();
    if(act==="seed-go") return seedIdea("rsIdeaSeed", true);
    if(act==="seed-add") return addSeedIdea();
    if(act==="gen5ideas") return gen5ideas();
    if(act==="gen5scripts") return gen5scripts(id);
    if(act==="gen5hooks") return gen5hooks(id);
    if(act==="explosion") return explosion();
    if(act==="save-script") return saveScript(id);
    if(act==="save-hook") return saveHook(id, parseInt(btn.getAttribute("data-i"),10));
    if(act==="chain") return chain(k);
    if(act==="record"){ S.view="prompter"; return render(); }
    if(act==="recorded") return recorded();
    if(act==="back-script"){ S.view="script"; return render(); }
    if(act==="close-feed"){ clearInterval(S.genStepTimer); clearTimeout(S.fillTimer); S.view="feed"; S._fillPhase=null; return render(); }
    if(act==="tp-back"){ S.view=Object.keys(S.done).length?"script":"feed"; return render(); }
    if(act==="fw-radar"){ S.view="feed"; S._fillPhase=null; render(); return showToast("Guiones añadidos a tus borradores."); }
    if(act==="fw-record"){ var r=fillReels()[0]; if(r){ S.reel=r; S.view="prompter"; render(); } return; }
    if(act==="gui-record"){ var g=S.guiones.filter(function(x){return x.id===id;})[0]; if(g){ S.reel={creator:{handle:g.from||brand().name.toLowerCase()},script:{hook:g.hook,beats:[],close:""}}; S.view="prompter"; render(); } return; }
    if(act==="copy"){ var txt=btn.getAttribute("data-txt"); if(navigator.clipboard) navigator.clipboard.writeText(txt); btn.textContent="✓"; setTimeout(function(){ btn.textContent="Copiar"; },1200); return; }
  }

  /* ════════════════════════════════════════════════════════════════
     CARGA DE DATOS
     ════════════════════════════════════════════════════════════════ */
  function setDevice(){ S.device=window.matchMedia("(max-width:720px)").matches?"mobile":"desktop"; }
  function skeletonHTML(){ return topbarHTML()+'<div class="scroll"><div class="pad"><div class="feed"><div class="rs-skel"></div><div class="rs-skel"></div></div></div></div>'; }

  function loadBrandData(){
    var el=root(); if(!el) return;
    el.innerHTML=skeletonHTML();
    var q=S.brandId?("?brand="+encodeURIComponent(S.brandId)):"";
    Promise.all([
      fetch("/api/radar/stats"+q,{credentials:"same-origin"}).then(function(r){return r.json();}).catch(function(){return{};}),
      fetch("/api/tracked-creators/reels"+(q?q+"&":"?")+"sort=explosion&limit=24",{credentials:"same-origin"}).then(function(r){return r.json();}).catch(function(){return{reels:[]};})
    ]).then(function(res){
      var stats=res[0]||{}, feed=res[1]||{};
      S.stats={ competitors:stats.competitors||0, reels_week:stats.reels_week||0, exploded_week:stats.exploded_week||0, stolen_today:stats.stolen_today!=null?stats.stolen_today:(stats.stolen_total||0) };
      S.reels=(feed.reels||[]).map(normReel);
      S.favs={}; S.reels.forEach(function(r){ if(r.fav) S.favs[r.id]=true; });
      render();
    });
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
      if(me.user){ S.user.name=me.user.name||(me.user.email||"").split("@")[0]||""; S.user.handle=me.user.handle||(me.user.email||"").split("@")[0]||""; }
      if(me.credits!=null) S.user.credits=me.credits; else if(me.credits_cents!=null) S.user.credits=Math.round(me.credits_cents/18);
      if(me.streak!=null) S.user.streak=me.streak;
      S.brands=(bd.brands&&bd.brands.length)?bd.brands:[{id:"default",name:(me.user&&me.user.name)?me.user.name:"Mi marca",handle:S.user.handle,color:"#f97316",level:1,voice:40,reelsAnalyzed:0,scripts:0}];
      S.brandId=S.brands[0].id;
      loadBrandData();
    });
  }

  window.RadarLoop={
    mount:function(){
      if(!root()) return;
      // Demo takeover: la isla ocupa todo el workspace y oculta la chrome vieja
      // (sidebar, subtabs). Solo en demo → producción mantiene su navegación.
      if(isDemo()){ try{ document.body.classList.add("rs-takeover"); }catch(e){} }
      if(!S._wired){ document.addEventListener("click", onClick); window.addEventListener("resize", function(){ var d=S.device; setDevice(); if(d!==S.device) render(); }); S._wired=true; }
      loadAll();
    }
  };
})();
