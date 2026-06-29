<!doctype html>
<html lang="en" class="dark">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>EMulator Studio</title>
<style>
:root{
  --bg:#f3f4f6; --panel:#ffffff; --panel-2:#f7f8fa; --line:#e3e6ea; --line-2:#eceef1;
  --ink:#181b21; --ink-2:#3c424c; --muted:#697078; --faint:#9aa1ab;
  --accent:#0e8f6e; --accent-2:#0b7a5e; --accent-ink:#ffffff; --accent-soft:#e3f4ee;
  --err:#cf3030; --warn:#9a6a12; --ok:#0e8f6e; --info:#2563c9;
  --stage:#d9dde2; --chip:#eef0f3; --shadow:0 1px 2px rgba(17,20,28,.06),0 8px 24px -12px rgba(17,20,28,.14);
  --radius:11px;
  --mono:ui-monospace,"SF Mono",SFMono-Regular,"JetBrains Mono",Menlo,Consolas,monospace;
  --sans:-apple-system,system-ui,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;
}
html.dark{
  --bg:#0b0d11; --panel:#13161c; --panel-2:#191d24; --line:#262b34; --line-2:#1f242c;
  --ink:#e8ebef; --ink-2:#c2c8d0; --muted:#878e99; --faint:#5b626d;
  --accent:#34d399; --accent-2:#2bbd86; --accent-ink:#04221a; --accent-soft:#11241e;
  --err:#ff7066; --warn:#fbbf24; --ok:#34d399; --info:#6aa3ff;
  --stage:#06070a; --chip:#1d222a; --shadow:0 1px 2px rgba(0,0,0,.4),0 16px 40px -16px rgba(0,0,0,.6);
}
*{box-sizing:border-box}
html,body{height:100%}
body{margin:0;background:var(--bg);color:var(--ink);font-family:var(--sans);font-size:13px;-webkit-font-smoothing:antialiased;overflow:hidden}
button{font-family:inherit;cursor:pointer}
input,select,textarea{font-family:inherit}
::-webkit-scrollbar{width:10px;height:10px}
::-webkit-scrollbar-thumb{background:var(--line);border-radius:6px;border:2px solid transparent;background-clip:padding-box}
::-webkit-scrollbar-thumb:hover{background:var(--faint)}

#app{display:flex;flex-direction:column;height:100vh}
.dragging::after{content:"Drop .apk / .ipa / .html / build folder to load";position:fixed;inset:14px;border:2px dashed var(--accent);border-radius:16px;background:color-mix(in oklab,var(--accent) 8%,transparent);z-index:60;display:flex;align-items:center;justify-content:center;color:var(--accent);font-weight:600;font-size:18px;pointer-events:none}

/* ---------- topbar ---------- */
.topbar{display:flex;align-items:center;gap:10px;padding:9px 14px;background:var(--panel);border-bottom:1px solid var(--line);flex-wrap:wrap}
.brand{display:flex;align-items:center;gap:9px;font-weight:680;letter-spacing:-.02em;font-size:14px;padding-right:6px}
.brand .logo{width:24px;height:24px;border-radius:7px;background:linear-gradient(150deg,var(--accent),var(--accent-2));display:grid;place-items:center;color:var(--accent-ink);font-weight:800;font-size:13px;box-shadow:inset 0 1px 0 rgba(255,255,255,.3)}
.brand small{color:var(--muted);font-weight:500;font-size:11px;letter-spacing:0}
.sep{width:1px;height:22px;background:var(--line);margin:0 2px}
.src{display:flex;align-items:center;gap:0;flex:1;min-width:230px;max-width:560px}
.src input{flex:1;min-width:0;background:var(--panel-2);border:1px solid var(--line);border-right:0;color:var(--ink);padding:8px 11px;border-radius:8px 0 0 8px;font-size:12.5px;outline:none}
.src input:focus{border-color:var(--accent)}
.btn{display:inline-flex;align-items:center;gap:6px;background:var(--panel-2);border:1px solid var(--line);color:var(--ink);padding:8px 12px;border-radius:8px;font-size:12.5px;font-weight:550;white-space:nowrap;transition:.12s}
.btn:hover{border-color:var(--faint);background:var(--panel)}
.btn:active{transform:translateY(.5px)}
.btn[disabled]{opacity:.45;cursor:not-allowed}
.btn.primary{background:var(--accent);border-color:var(--accent);color:var(--accent-ink)}
.btn.primary:hover{background:var(--accent-2)}
.btn.go{border-radius:0 8px 8px 0}
.btn.icon{padding:8px 10px}
.spacer{flex:1}
.topbar select{background:var(--panel-2);border:1px solid var(--line);color:var(--ink);padding:8px 9px;border-radius:8px;font-size:12.5px;outline:none}
.topbar select:focus{border-color:var(--accent)}

/* ---------- main ---------- */
.main{flex:1;display:flex;min-height:0}
.stagecol{flex:1;display:flex;flex-direction:column;min-width:0;background:var(--stage);position:relative}
.stage-toolbar{position:absolute;top:12px;left:50%;transform:translateX(-50%);z-index:20;display:flex;align-items:center;gap:6px;background:color-mix(in oklab,var(--panel) 86%,transparent);backdrop-filter:blur(10px);border:1px solid var(--line);padding:5px 7px;border-radius:11px;box-shadow:var(--shadow)}
.stage-toolbar .mini{background:none;border:0;color:var(--ink-2);padding:5px 7px;border-radius:7px;font-size:14px;line-height:1;display:grid;place-items:center}
.stage-toolbar .mini:hover{background:var(--chip);color:var(--ink)}
.stage-toolbar .mini[disabled]{opacity:.4}
.stage-toolbar .lbl{font:600 11px/1 var(--mono);color:var(--muted);padding:0 5px;min-width:38px;text-align:center}
#stageWrap{flex:1;position:relative;display:flex;align-items:center;justify-content:center;overflow:hidden;padding:20px}
#stage{flex:1;display:flex;align-items:center;justify-content:center;height:100%}
.stage-ph{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;padding:40px;pointer-events:none}
.ph-card{max-width:340px;text-align:center;background:var(--panel);border:1px solid var(--line);border-radius:16px;padding:26px 24px;box-shadow:var(--shadow);pointer-events:auto}
.ph-card .ph-ic{font-size:34px;color:var(--warn)}
.ph-card h3{margin:8px 0 6px;font-size:16px}
.ph-card p{margin:0;color:var(--muted);line-height:1.55;font-size:12.5px}
.ph-card b{color:var(--ink)}
.src-warn{display:none;position:absolute;bottom:12px;left:50%;transform:translateX(-50%);max-width:90%;background:var(--panel);border:1px solid var(--line);border-radius:9px;padding:7px 12px;font-size:11.5px;color:var(--muted);box-shadow:var(--shadow);z-index:15}
.src-warn b{color:var(--ink)}

/* ---------- device frame ---------- */
.dev-frame{position:relative;background:linear-gradient(155deg,#2a2c30,#161719 60%);padding:var(--bezel);border-radius:calc(var(--rad) + 8px);box-shadow:0 0 0 2px rgba(0,0,0,.35),0 40px 70px -22px rgba(0,0,0,.55),inset 0 0 0 1.5px rgba(255,255,255,.08)}
.dev-frame.os-android{background:linear-gradient(155deg,#3a3d42,#202225 60%)}
.dev-frame.frame-home{padding-top:46px;padding-bottom:46px}
.dev-screen{position:relative;border-radius:var(--rad);overflow:hidden;background:#000}
.dev-iframe{display:block;width:100%;height:100%;border:0;background:#fff}
.dev-island{position:absolute;top:10px;left:50%;transform:translateX(-50%);width:31%;max-width:124px;height:30px;background:#000;border-radius:16px;z-index:6}
.dev-notch{position:absolute;top:0;left:50%;transform:translateX(-50%);width:52%;height:26px;background:#000;border-radius:0 0 18px 18px;z-index:6}
.dev-punch{position:absolute;top:13px;left:50%;transform:translateX(-50%);width:11px;height:11px;background:#000;border-radius:50%;z-index:7}
.os-android .dev-punch{left:auto;right:46%}
.dev-homebar{position:absolute;bottom:7px;left:50%;transform:translateX(-50%);width:36%;max-width:140px;height:5px;border-radius:3px;background:rgba(120,120,130,.55);z-index:6}
.dev-homebtn{position:absolute;bottom:9px;left:50%;transform:translateX(-50%);width:30px;height:30px;border-radius:50%;border:2px solid rgba(255,255,255,.25);z-index:6}
.dev-foldseam{position:absolute;top:0;bottom:0;left:50%;width:14px;transform:translateX(-50%);background:linear-gradient(90deg,transparent,rgba(0,0,0,.16) 40%,rgba(0,0,0,.16) 60%,transparent);z-index:4;pointer-events:none}
.landscape .dev-island,.landscape .dev-notch,.landscape .dev-punch{display:none}
/* status bar */
.dev-statusbar{position:absolute;top:0;left:0;right:0;height:44px;display:flex;align-items:center;justify-content:space-between;padding:0 26px;font-size:13px;font-weight:600;z-index:5;pointer-events:none}
.os-android .dev-statusbar{height:30px;padding:0 16px;font-size:12px}
.sb-light{color:#0b0b0d}
.sb-dark{color:#fff}
.dev-statusbar .sb-right{display:flex;align-items:center;gap:6px}
.dev-statusbar .sb-wifi,.dev-statusbar .sb-batt{display:inline-block}
.dev-statusbar .sb-wifi{width:16px;height:11px;border-radius:2px;background:currentColor;-webkit-mask:radial-gradient(circle at 50% 120%,#000 30%,transparent 31%);mask:radial-gradient(circle at 50% 120%,#000 36%,transparent 37%)}
.dev-statusbar .sb-batt{width:23px;height:11px;border:1.5px solid currentColor;border-radius:3px;position:relative;opacity:.9}
.dev-statusbar .sb-batt::before{content:"";position:absolute;inset:1.5px;width:70%;background:currentColor;border-radius:1px}
.dev-statusbar .sb-batt::after{content:"";position:absolute;right:-3px;top:3px;width:2px;height:4px;background:currentColor;border-radius:0 1px 1px 0}
.dev-statusbar .sb-net,.dev-statusbar .sb-mob{font-size:11px;font-weight:700}

/* ---------- side panel ---------- */
.side{width:430px;min-width:430px;background:var(--panel);border-left:1px solid var(--line);display:flex;flex-direction:column;min-height:0}
#tabs{display:flex;gap:2px;padding:7px 8px 0;border-bottom:1px solid var(--line);overflow-x:auto}
.tab{position:relative;background:none;border:0;color:var(--muted);padding:8px 11px;border-radius:8px 8px 0 0;font-size:12.5px;font-weight:560;white-space:nowrap;display:flex;align-items:center;gap:6px}
.tab:hover{color:var(--ink);background:var(--panel-2)}
.tab.active{color:var(--ink)}
.tab.active::after{content:"";position:absolute;left:10px;right:10px;bottom:-1px;height:2px;background:var(--accent);border-radius:2px}
.badge{font:700 9.5px/1 var(--mono);padding:2px 5px;border-radius:9px;background:var(--chip);color:var(--muted)}
.badge-err{background:color-mix(in oklab,var(--err) 18%,transparent);color:var(--err)}
.badge-warn{background:color-mix(in oklab,var(--warn) 20%,transparent);color:var(--warn)}
.panes{flex:1;min-height:0;position:relative}
.pane{position:absolute;inset:0;display:none;flex-direction:column;overflow:auto;padding:16px}
.pane.active{display:flex}
.empty{color:var(--muted);text-align:center;padding:30px 16px;line-height:1.6}

/* inspect */
.insp-head{display:flex;gap:14px;align-items:center;margin-bottom:16px}
.insp-icon{width:58px;height:58px;border-radius:14px;background:var(--chip);display:grid;place-items:center;font-size:24px;font-weight:700;color:var(--muted);overflow:hidden;flex:none;box-shadow:inset 0 0 0 1px var(--line)}
.insp-icon img{width:100%;height:100%;object-fit:cover}
.insp-name{font-size:17px;font-weight:680;letter-spacing:-.01em}
.insp-sub{color:var(--muted);font-size:12px;margin:1px 0 7px;font-family:var(--mono)}
.chips{display:flex;flex-wrap:wrap;gap:5px}
.chip{font-size:11px;font-weight:560;padding:3px 8px;border-radius:7px;background:var(--chip);color:var(--ink-2)}
.chip.crun{background:color-mix(in oklab,var(--ok) 16%,transparent);color:var(--ok)}
.chip.cnative{background:color-mix(in oklab,var(--warn) 16%,transparent);color:var(--warn)}
.chip.ckit{background:color-mix(in oklab,var(--info) 15%,transparent);color:var(--info)}
.chip.cperm{font-family:var(--mono);font-size:10.5px}
.kv{display:grid;grid-template-columns:auto 1fr;gap:7px 14px;padding:13px 0;border-top:1px solid var(--line);border-bottom:1px solid var(--line)}
.kv .k{color:var(--muted);font-size:12px}
.kv .v{font-size:12px;font-family:var(--mono);word-break:break-word;text-align:right}
.insp-h{font-size:11px;font-weight:680;text-transform:uppercase;letter-spacing:.05em;color:var(--faint);margin:16px 0 8px}
.insp-sub2{color:var(--muted);font-size:12px;margin-bottom:8px}
.bars{display:flex;flex-direction:column;gap:6px}
.bar-row{display:grid;grid-template-columns:90px 1fr auto;align-items:center;gap:8px;font-size:11.5px}
.bar-l{font-family:var(--mono);color:var(--ink-2);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.bar-track{height:7px;background:var(--chip);border-radius:4px;overflow:hidden}
.bar-fill{display:block;height:100%;background:var(--accent);border-radius:4px}
.bar-v{color:var(--muted);font-family:var(--mono);font-size:10.5px}
.note-line{font-size:12px;color:var(--muted);line-height:1.5;padding:5px 0;border-bottom:1px dotted var(--line)}
.note-line.warn{color:var(--warn)}

/* console */
.pane-tools{display:flex;align-items:center;gap:6px;margin-bottom:8px;flex-wrap:wrap}
.chip.filter{cursor:pointer;user-select:none;border:1px solid transparent}
.chip.filter.off{opacity:.4;text-decoration:line-through}
#consoleList,#netList{flex:1;min-height:0;overflow:auto;background:var(--panel-2);border:1px solid var(--line);border-radius:10px;font-family:var(--mono)}
.log{display:grid;grid-template-columns:46px 1fr;gap:8px;padding:5px 11px;border-bottom:1px solid var(--line-2);font-size:11.5px;line-height:1.45;align-items:start}
.log:last-child{border-bottom:0}
.log-lv{font-size:8.5px;font-weight:700;text-transform:uppercase;letter-spacing:.04em;padding-top:2px;color:var(--muted)}
.log-tx{white-space:pre-wrap;word-break:break-word;color:var(--ink-2)}
.log-error{background:color-mix(in oklab,var(--err) 9%,transparent)}
.log-error .log-lv,.log-error .log-tx{color:var(--err)}
.log-warn .log-lv,.log-warn .log-tx{color:var(--warn)}
.log-info .log-lv{color:var(--info)}
.hide-log .log-log,.hide-info .log-info,.hide-warn .log-warn,.hide-error .log-error,.hide-debug .log-debug{display:none}
.console-foot{display:flex;gap:14px;padding:9px 2px 0;font-size:11px;color:var(--muted)}
.console-foot b{color:var(--ink);font-family:var(--mono)}
.console-foot .e{color:var(--err)} .console-foot .w{color:var(--warn)}
/* network */
.net{display:grid;grid-template-columns:42px 38px 1fr auto;gap:8px;padding:6px 11px;border-bottom:1px solid var(--line-2);font-size:11px;align-items:center}
.net-m{color:var(--muted);font-weight:600}
.net-s{font-weight:700}
.net-ok .net-s{color:var(--ok)} .net-err .net-s{color:var(--err)}
.net-u{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--ink-2)}
.net-t{color:var(--faint)}

/* report */
.field{margin-bottom:13px}
.field>label{display:block;font-size:11px;font-weight:680;text-transform:uppercase;letter-spacing:.05em;color:var(--faint);margin-bottom:7px}
.checks{display:grid;grid-template-columns:1fr 1fr;gap:6px 12px}
.checks label{display:flex;align-items:center;gap:7px;font-size:12.5px;color:var(--ink-2)}
.checks input{accent-color:var(--accent);width:15px;height:15px}
.shot-strip{display:flex;gap:8px;overflow-x:auto;padding:2px 0 6px}
.shot{position:relative;margin:0;flex:none;width:78px}
.shot img{width:78px;height:138px;object-fit:cover;border-radius:8px;border:1px solid var(--line);cursor:pointer;background:#fff}
.shot figcaption{font-size:9px;color:var(--muted);text-align:center;margin-top:3px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.shot-x{position:absolute;top:-6px;right:-6px;width:18px;height:18px;border-radius:50%;border:1px solid var(--line);background:var(--panel);color:var(--ink);font-size:12px;line-height:1;display:grid;place-items:center}
.shot-empty{color:var(--muted);font-size:12px;padding:10px 0}
.row{display:flex;gap:8px;flex-wrap:wrap;margin:4px 0 12px}
#reportPreview{display:none;flex:1;min-height:120px;white-space:pre-wrap;font-family:var(--mono);font-size:11px;line-height:1.5;background:var(--panel-2);border:1px solid var(--line);border-radius:10px;padding:12px;color:var(--ink-2);overflow:auto}

/* push */
.field input[type=text],.field input[type=password]{width:100%;background:var(--panel-2);border:1px solid var(--line);color:var(--ink);padding:9px 11px;border-radius:8px;font-size:12.5px;outline:none}
.field input:focus{border-color:var(--accent)}
.hint{font-size:11px;color:var(--muted);margin-top:5px;line-height:1.5}
.hint a{color:var(--accent)}
.two{display:grid;grid-template-columns:1fr 1fr;gap:10px}
.push-status{margin-top:12px;font-size:12px;min-height:18px;font-family:var(--mono)}
.push-status.ok{color:var(--ok)} .push-status.err{color:var(--err)} .push-status.warn{color:var(--warn)}
#pushLink{display:none;margin-top:8px;font-size:12px;color:var(--accent);text-decoration:none}

/* help */
.help h4{margin:16px 0 7px;font-size:13px}
.help h4:first-child{margin-top:0}
.help p,.help li{color:var(--ink-2);line-height:1.6;font-size:12.5px}
.help ul{margin:6px 0;padding-left:18px}
.help .ok{color:var(--ok);font-weight:600}
.help .no{color:var(--warn);font-weight:600}
textarea#snippetBox{width:100%;height:120px;background:var(--panel-2);border:1px solid var(--line);border-radius:9px;color:var(--ink-2);font-family:var(--mono);font-size:10.5px;padding:10px;resize:vertical;outline:none}

/* overlays */
#busy{display:none;position:fixed;inset:0;background:color-mix(in oklab,var(--bg) 70%,transparent);backdrop-filter:blur(2px);z-index:80;align-items:center;justify-content:center;flex-direction:column;gap:14px}
.spinner{width:34px;height:34px;border:3px solid var(--line);border-top-color:var(--accent);border-radius:50%;animation:spin .8s linear infinite}
@keyframes spin{to{transform:rotate(360deg)}}
#busyMsg{color:var(--ink-2);font-size:13px}
#toast{position:fixed;bottom:22px;left:50%;transform:translateX(-50%) translateY(20px);background:var(--ink);color:var(--bg);padding:10px 18px;border-radius:10px;font-size:12.5px;font-weight:550;opacity:0;pointer-events:none;transition:.25s;z-index:90;box-shadow:var(--shadow)}
#toast.show{opacity:1;transform:translateX(-50%) translateY(0)}
.hidden-input{position:absolute;width:1px;height:1px;opacity:0;pointer-events:none}
@media(max-width:920px){.side{width:360px;min-width:360px}}
</style>
</head>
<body>
<div id="app">
  <header class="topbar">
    <div class="brand"><span class="logo">E</span><span>EMulator&nbsp;Studio <small>device test lab</small></span></div>
    <div class="sep"></div>
    <div class="src">
      <input id="srcInput" type="text" placeholder="https://your-app.com  ·  PWA / web build URL  ·  localhost:3000" spellcheck="false" autocomplete="off">
      <button class="btn go primary" id="btnLoad">Load</button>
    </div>
    <button class="btn" id="btnOpenPkg" title="Inspect an Android or iOS package">⤓ APK / IPA</button>
    <button class="btn" id="btnOpenBuild" title="Run a web build folder">⌥ Web build</button>
    <button class="btn" id="btnDemo" title="Load demo">◷ Demo</button>
    <div class="spacer"></div>
    <select id="deviceSelect" title="Device"></select>
    <button class="btn icon" id="themeToggle" title="Toggle theme">☾</button>
  </header>

  <main class="main">
    <section class="stagecol">
      <div class="stage-toolbar">
        <button class="mini" id="btnRotate" title="Rotate">⟳</button>
        <button class="mini" id="btnReload" title="Reload">↻</button>
        <span class="lbl" id="dimLabel"></span>
        <span class="lbl" id="scaleLabel">100%</span>
        <button class="mini" id="btnShot" title="Screenshot">◉</button>
      </div>
      <div id="stageWrap"><div id="stage"></div></div>
      <div class="src-warn" id="srcWarn">Framing a live URL? Sites that send <b>X-Frame-Options</b> / CSP <b>frame-ancestors</b> may refuse to load. Your own apps, localhost, GitHub Pages & uploaded builds work fully. <span id="captureHint">Screenshots & console capture need an uploaded build or the bridge snippet (see Help).</span></div>
    </section>

    <aside class="side">
      <nav id="tabs">
        <button class="tab active" data-tab="inspect">Inspect</button>
        <button class="tab" data-tab="console">Console <span class="badge" id="tabConsoleBadge" style="display:none">0</span></button>
        <button class="tab" data-tab="network">Network <span class="badge" id="tabNetBadge" style="display:none">0</span></button>
        <button class="tab" data-tab="report">Report</button>
        <button class="tab" data-tab="push">Push</button>
        <button class="tab" data-tab="help">Help</button>
      </nav>
      <div class="panes">
        <div id="pane-inspect" class="pane active"></div>

        <div id="pane-console" class="pane">
          <div class="pane-tools" id="consoleFilters">
            <span class="chip filter" data-lv="log">log</span>
            <span class="chip filter" data-lv="info">info</span>
            <span class="chip filter" data-lv="warn">warn</span>
            <span class="chip filter" data-lv="error">error</span>
            <span class="spacer" style="flex:1"></span>
            <button class="btn icon" id="btnClearConsole" title="Clear">✕</button>
          </div>
          <div id="consoleList"></div>
          <div class="console-foot"><span class="e">● <b id="errCount">0</b> errors</span><span class="w">● <b id="warnCount">0</b> warnings</span><span>Σ <b id="logCount">0</b> logs</span></div>
        </div>

        <div id="pane-network" class="pane">
          <div class="pane-tools"><span style="color:var(--muted);font-size:12px">fetch / XHR from the running app</span><span style="flex:1"></span><button class="btn icon" id="btnClearNet" title="Clear">✕</button></div>
          <div id="netList"></div>
        </div>

        <div id="pane-report" class="pane">
          <div class="field">
            <label>Sections to include</label>
            <div class="checks">
              <label><input type="checkbox" id="rep-meta" checked> App metadata</label>
              <label><input type="checkbox" id="rep-perms" checked> Permissions</label>
              <label><input type="checkbox" id="rep-files" checked> Package contents</label>
              <label><input type="checkbox" id="rep-errors" checked> Errors & warnings</label>
              <label><input type="checkbox" id="rep-all"> Full console log</label>
              <label><input type="checkbox" id="rep-net"> Network log</label>
              <label><input type="checkbox" id="rep-shots" checked> Screenshots</label>
            </div>
          </div>
          <div class="field">
            <label>Screenshots</label>
            <div class="shot-strip" id="shotStrip"></div>
            <div class="shot-empty" id="shotEmpty">None yet — hit ◉ in the device toolbar to capture the running screen.</div>
          </div>
          <div class="row">
            <button class="btn" id="btnBuildReport">Preview</button>
            <button class="btn primary" id="btnDownloadMd">↓ report.md</button>
            <button class="btn" id="btnDownloadZip">↓ .zip (md + shots)</button>
          </div>
          <div id="reportPreview"></div>
        </div>

        <div id="pane-push" class="pane">
          <div class="field">
            <label>GitHub token</label>
            <input type="password" id="ghToken" placeholder="github_pat_… (fine-grained, Contents: read+write)" autocomplete="off">
            <div class="hint">Stored only in this browser (localStorage). Create one at <a href="https://github.com/settings/tokens?type=beta" target="_blank" rel="noopener">github.com/settings/tokens</a> with <b>Contents → Read and write</b> on the target repo.</div>
          </div>
          <div class="field"><label>Repository</label><input type="text" id="ghRepo" placeholder="owner/name  (e.g. zitch-systems/Emulator)" autocomplete="off"></div>
          <div class="two">
            <div class="field"><label>Branch</label><input type="text" id="ghBranch" placeholder="(default)" autocomplete="off"></div>
            <div class="field"><label>Folder</label><input type="text" id="ghPath" placeholder="emulator-reports" autocomplete="off"></div>
          </div>
          <div class="row">
            <button class="btn" id="btnCheckToken">Verify token</button>
            <button class="btn primary" id="btnPush">⤴ Push report</button>
          </div>
          <div class="push-status" id="pushStatus"></div>
          <a id="pushLink" href="#" target="_blank" rel="noopener"></a>
          <div class="hint" style="margin-top:14px">Pushes the same report shown under <b>Report</b> (Markdown + screenshot PNGs) into <code>folder/timestamp/</code> on the chosen branch.</div>
        </div>

        <div id="pane-help" class="pane help">
          <h4>What runs vs. what gets inspected</h4>
          <ul>
            <li><span class="ok">Runs live:</span> web apps, PWAs, localhost, uploaded HTML builds, and <b>hybrid</b> apps (Capacitor / Cordova / Ionic) — their web bundle is extracted from the .apk/.ipa and executed in the frame.</li>
            <li><span class="no">Inspect-only:</span> native Android/iOS binaries (Flutter, React Native, Java/Kotlin, Swift). Browsers can’t execute native code — you get full metadata, and can frame a web build instead.</li>
          </ul>
          <h4>Capturing console & errors from a live URL</h4>
          <p>Cross-origin pages can’t be read for security. Paste this bridge before <code>&lt;/head&gt;</code> in your app and its logs, errors & network stream into the panels here:</p>
          <textarea id="snippetBox" readonly></textarea>
          <button class="btn" id="btnCopySnippet" style="margin-top:8px">⧉ Copy snippet</button>
          <h4>Export & ship</h4>
          <p>Capture screenshots, pick report sections, then <b>download</b> the Markdown/zip or <b>push</b> it straight to a GitHub repo from the Push tab.</p>
        </div>
      </div>
    </aside>
  </main>
</div>

<input type="file" id="fileInputPkg" class="hidden-input" accept=".apk,.ipa,.zip">
<input type="file" id="fileInputDir" class="hidden-input" webkitdirectory directory multiple>
<div id="busy"><div class="spinner"></div><div id="busyMsg">Working…</div></div>
<div id="toast"></div>

<script src="https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js"></script>
<script src="emu/devices.js"></script>
<script src="emu/zip.js"></script>
<script src="emu/axml.js"></script>
<script src="emu/bplist.js"></script>
<script src="emu/inspect.js"></script>
<script src="emu/runner.js"></script>
<script src="emu/shot.js"></script>
<script src="emu/report.js"></script>
<script src="emu/github.js"></script>
<script src="emu/zipw.js"></script>
<script src="emu/demo.js"></script>
<script src="emu/app.js"></script>
</body>
</html>
