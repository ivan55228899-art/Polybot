import { useState, useEffect, useRef, useCallback } from "react";
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, AreaChart, Area } from "recharts";

// ─── Constants ────────────────────────────────────────────────────────────────
const STARTING_BALANCE = 10000;
const CAT_COLORS = { Economics:"#f59e0b", Crypto:"#3b82f6", Politics:"#ef4444", AI:"#8b5cf6", Science:"#10b981", Finance:"#06b6d4", Sports:"#f97316", "其他":"#64748b" };
const TABS = ["markets","analytics","backtest","wallets","learning","settings","log"];
const TAB_LABELS = { markets:"📊 市場", analytics:"📈 盈虧", backtest:"🔬 回測", wallets:"👛 錢包", learning:"🧠 策略", settings:"⚙️ 設定", log:"⌨️ 日誌" };

// ─── Utilities ────────────────────────────────────────────────────────────────
const fmt = n => { if(Math.abs(n)>=1e6) return `$${(n/1e6).toFixed(2)}M`; if(Math.abs(n)>=1000) return `$${(n/1000).toFixed(1)}K`; return `$${n.toFixed(2)}`; };
const pct = n => `${(n*100).toFixed(0)}%`;
const pctE = n => `${(n*100).toFixed(1)}%`;
const clamp = (v,a,b) => Math.max(a,Math.min(b,v));

// ─── API helpers ──────────────────────────────────────────────────────────────
async function callClaude(apiKey, system, user, maxTokens=1200) {
  const r = await fetch("/.netlify/functions/claude", {
    method:"POST",
    headers:{"Content-Type":"application/json","x-api-key":apiKey,"anthropic-version":"2023-06-01"},
    body:JSON.stringify({model:"claude-haiku-4-5-20251001",max_tokens:maxTokens,system,messages:[{role:"user",content:user}]}),
  });
  const d = await r.json();
  if(d.error) throw new Error(d.error.message);
  return d.content?.[0]?.text||"";
}
function parseJ(raw) { try{return JSON.parse(raw.replace(/```json|```/g,"").trim());}catch{return null;} }

// ─── Polymarket API ───────────────────────────────────────────────────────────
function detectCategory(title="") {
  const t = title.toLowerCase();
  if(/bitcoin|crypto|eth|btc|sol|coin|token|blockchain|defi|nft/.test(t)) return "Crypto";
  if(/fed|rate|gdp|inflation|economy|recession|unemployment|cpi|interest/.test(t)) return "Economics";
  if(/election|president|senate|congress|vote|party|democrat|republican|minister|political|trump|biden|harris|mayor/.test(t)) return "Politics";
  if(/ai|gpt|openai|anthropic|llm|model|artificial|machine learning/.test(t)) return "AI";
  if(/nba|nfl|mlb|nhl|soccer|football|basketball|sport|champion|league|cup|team|tennis|golf/.test(t)) return "Sports";
  if(/stock|s&p|nasdaq|dow|market|ipo|shares|etf/.test(t)) return "Finance";
  if(/spacex|nasa|rocket|orbit|moon|mars|launch|satellite/.test(t)) return "Science";
  return "其他";
}
async function fetchPolymarkets(limit=24) {
  const res = await fetch(`/.netlify/functions/markets?limit=${limit}`);
  const data = await res.json();
  return data
    .filter(m => { const p=JSON.parse(m.outcomePrices||'["0","0"]'); const y=parseFloat(p[0]); return y>0.03&&y<0.97&&parseFloat(m.volume24hr||0)>10000; })
    .slice(0,limit)
    .map((m,i) => {
      const prices=JSON.parse(m.outcomePrices||'["0","0"]'); const yes=parseFloat(prices[0]);
      return { id:m.id||i+1, conditionId:m.conditionId, title:m.question||m.title||"Unknown", category:detectCategory(m.question||m.title||""), yesPrice:yes, noPrice:1-yes, volume:parseFloat(m.volume||0), volume24hr:parseFloat(m.volume24hr||0), endDate:m.endDate||"", trending:parseFloat(m.volume24hr||0)>500000, slug:m.slug||"" };
    });
}

// ─── Technical Indicators ─────────────────────────────────────────────────────
function calcRSI(prices, period=14) {
  if(prices.length<period+1) return null;
  let gains=0,losses=0;
  for(let i=prices.length-period;i<prices.length;i++){const d=prices[i]-prices[i-1];if(d>0)gains+=d;else losses+=Math.abs(d);}
  const rs=gains/(losses||0.0001); return 100-100/(1+rs);
}
function calcMomentum(prices) {
  if(prices.length<3) return 0;
  return((prices[prices.length-1]-prices[0])/(prices[0]||0.01))*100;
}
function calcSMA(prices,period=5) {
  if(prices.length<period) return null;
  return prices.slice(-period).reduce((s,v)=>s+v,0)/period;
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const card = { background:"rgba(255,255,255,0.025)", border:"1px solid rgba(255,255,255,0.07)", borderRadius:12 };
const cardGlow = c => ({ background:`rgba(${c},0.04)`, border:`1px solid rgba(${c},0.18)`, borderRadius:12, boxShadow:`0 0 24px rgba(${c},0.07)` });
const inp = { background:"rgba(0,0,0,0.4)", border:"1px solid rgba(255,255,255,0.1)", borderRadius:8, padding:"10px 12px", color:"#b0bec5", fontSize:12, fontFamily:"inherit", width:"100%", boxSizing:"border-box" };
const btn = (color,active=true) => ({ padding:"7px 16px", borderRadius:6, border:`1px solid ${color}44`, background:active?`${color}18`:"rgba(255,255,255,0.04)", color:active?color:"#475569", cursor:active?"pointer":"not-allowed", fontSize:11, fontWeight:700, letterSpacing:0.5, fontFamily:"inherit", transition:"all 0.2s" });
const tagStyle = cat => ({ fontSize:9, fontWeight:700, padding:"2px 8px", borderRadius:20, background:(CAT_COLORS[cat]||"#64748b")+"22", color:CAT_COLORS[cat]||"#64748b", border:`1px solid ${(CAT_COLORS[cat]||"#64748b")}33`, letterSpacing:0.5 });
const TT = { background:"#0d1117", border:"1px solid rgba(255,255,255,0.1)", borderRadius:8, fontSize:11, color:"#b0bec5" };
const CSS = `
@import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;600;700;800&display=swap');
*{box-sizing:border-box;margin:0;padding:0}
body{background:#07090f;color:#cfd8dc;font-family:'JetBrains Mono',monospace}
::-webkit-scrollbar{width:4px;height:4px}::-webkit-scrollbar-track{background:#0d1117}::-webkit-scrollbar-thumb{background:#1e293b;border-radius:2px}
input:focus,select:focus{outline:none;border-color:rgba(0,229,255,0.4)!important}
button:hover{filter:brightness(1.15)}button:active{transform:scale(0.97)}
@keyframes fadeIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
@keyframes fadeUp{from{opacity:0;transform:translateY(20px)}to{opacity:1;transform:translateY(0)}}
@keyframes blink{0%,100%{opacity:1}50%{opacity:0.3}}
@keyframes pulse{0%,100%{opacity:1;transform:scale(1)}50%{opacity:0.7;transform:scale(0.95)}}
@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}
@keyframes glow{0%,100%{box-shadow:0 0 8px rgba(0,229,255,0.3)}50%{box-shadow:0 0 20px rgba(0,229,255,0.6)}}
`;

// ─── Reusable components ──────────────────────────────────────────────────────
function StatBox({label,value,sub,color="#00e5ff",onClick}) {
  return (
    <div onClick={onClick} style={{...card,padding:"14px 18px",cursor:onClick?"pointer":"default",transition:"all 0.2s"}} onMouseEnter={e=>{if(onClick)e.currentTarget.style.borderColor=`${color}44`}} onMouseLeave={e=>{if(onClick)e.currentTarget.style.borderColor="rgba(255,255,255,0.07)"}}>
      <div style={{fontSize:9,color:"#475569",letterSpacing:1.5,marginBottom:6,textTransform:"uppercase"}}>{label}</div>
      <div style={{fontSize:20,fontWeight:800,color,letterSpacing:-0.5,lineHeight:1}}>{value}</div>
      {sub&&<div style={{fontSize:10,color:"#334155",marginTop:4}}>{sub}</div>}
    </div>
  );
}

function PriceBar({yes}) {
  return (
    <div style={{height:4,borderRadius:2,background:"#1e293b",overflow:"hidden",marginBottom:8,position:"relative"}}>
      <div style={{position:"absolute",left:0,top:0,height:"100%",width:`${yes*100}%`,background:`linear-gradient(90deg,#10b981,#34d399)`,transition:"width 0.8s ease",borderRadius:2}}/>
      <div style={{position:"absolute",right:0,top:0,height:"100%",width:`${(1-yes)*100}%`,background:`linear-gradient(90deg,#dc2626,#ef4444)`,transition:"width 0.8s ease",borderRadius:2}}/>
    </div>
  );
}

function MiniSparkline({history,height=36}) {
  if(!history||history.length<2) return <div style={{height,display:"flex",alignItems:"center",justifyContent:"center",fontSize:9,color:"#1e293b"}}>累積數據中…</div>;
  const vals=history.map(h=>h.yes);
  const mn=Math.min(...vals),mx=Math.max(...vals);
  const range=mx-mn||0.001;
  const W=200,H=height;
  const pts=vals.map((v,i)=>`${(i/(vals.length-1)*W).toFixed(1)},${(H-(v-mn)/range*(H-6)-3).toFixed(1)}`).join(" ");
  const trend=vals[vals.length-1]>=vals[0];
  const col=trend?"#10b981":"#ef4444";
  const lastPt=pts.split(" ").pop().split(",");
  return (
    <svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
      <defs>
        <linearGradient id={`sg${history[0]?.t||0}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={col} stopOpacity="0.3"/>
          <stop offset="100%" stopColor={col} stopOpacity="0"/>
        </linearGradient>
      </defs>
      <polygon points={`0,${H} ${pts} ${W},${H}`} fill={`url(#sg${history[0]?.t||0})`}/>
      <polyline points={pts} fill="none" stroke={col} strokeWidth="1.5" strokeLinejoin="round"/>
      <circle cx={lastPt[0]} cy={lastPt[1]} r="2.5" fill={col}/>
    </svg>
  );
}

// ─── API Key Screen ───────────────────────────────────────────────────────────
function ApiKeyScreen({onSubmit}) {
  const [key,setKey]=useState(""); const [err,setErr]=useState(""); const [loading,setLoading]=useState(false);
  const submit=async()=>{
    if(!key.startsWith("sk-ant-")){setErr("應以 sk-ant- 開頭");return;}
    setLoading(true);setErr("");
    try{
      const r=await fetch("/.netlify/functions/claude",{method:"POST",headers:{"Content-Type":"application/json","x-api-key":key,"anthropic-version":"2023-06-01"},body:JSON.stringify({model:"claude-haiku-4-5-20251001",max_tokens:5,messages:[{role:"user",content:"hi"}]})});
      const d=await r.json();
      if(d.error)throw new Error(d.error.message);
      try{sessionStorage.setItem("pm_key",key);}catch{}
      onSubmit(key);
    }catch(e){setErr(e.message);setLoading(false);}
  };
  return (
    <div style={{minHeight:"100vh",background:"#07090f",display:"flex",alignItems:"center",justifyContent:"center"}}>
      <style>{CSS}</style>
      <div style={{width:460,animation:"fadeUp 0.5s ease"}}>
        <div style={{textAlign:"center",marginBottom:40}}>
          <div style={{fontSize:52,marginBottom:12,animation:"pulse 3s infinite"}}>⚡</div>
          <div style={{fontSize:24,fontWeight:800,color:"#00e5ff",letterSpacing:4}}>POLYMARKET BOT</div>
          <div style={{fontSize:9,color:"#1e3a4a",marginTop:6,letterSpacing:5}}>V3 · 智能預測交易系統 · 模擬模式</div>
        </div>
        <div style={{...cardGlow("0,229,255"),padding:36}}>
          <div style={{fontSize:11,color:"#475569",marginBottom:24,lineHeight:1.9}}>輸入 Anthropic API Key 啟動 AI 交易引擎。Key 僅存於瀏覽器 Session，關閉即清除。</div>
          <div style={{fontSize:9,color:"#334155",letterSpacing:2,marginBottom:8}}>ANTHROPIC API KEY</div>
          <input type="password" value={key} onChange={e=>{setKey(e.target.value);setErr("");}} onKeyDown={e=>e.key==="Enter"&&submit()} placeholder="sk-ant-api03-..." style={{...inp,marginBottom:err?8:20,border:`1px solid ${err?"#ef4444":"rgba(0,229,255,0.2)"}`}}/>
          {err&&<div style={{fontSize:11,color:"#ef4444",marginBottom:14}}>⚠ {err}</div>}
          <button onClick={submit} disabled={loading||!key} style={{...btn("#00e5ff",!loading&&!!key),width:"100%",padding:"14px 0",fontSize:12,letterSpacing:2}}>
            {loading?"▸ 驗證中...":"▶  啟動交易系統"}
          </button>
          <div style={{marginTop:24,borderTop:"1px solid rgba(255,255,255,0.04)",paddingTop:20}}>
            <div style={{fontSize:9,color:"#1e3a4a",letterSpacing:2,marginBottom:10}}>取得 API KEY</div>
            {["前往 console.anthropic.com","登入或註冊帳號","API Keys → Create Key","複製 sk-ant-... 貼上"].map((s,i)=>(
              <div key={i} style={{fontSize:10,color:"#1e3a4a",lineHeight:2.2}}><span style={{color:"#00e5ff"}}>{i+1}.</span> {s}</div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Market Card ──────────────────────────────────────────────────────────────
function MarketCard({market,onAnalyze,analyzing,lastTrade,strategyNote,priceHist}) {
  const isActive=analyzing===market.id;
  const hist=priceHist||[];
  const prices=hist.map(h=>h.yes);
  const rsi=calcRSI(prices);
  const momentum=calcMomentum(prices);
  const sma=calcSMA(prices);
  const curP=market.yesPrice;
  const smaSignal=sma!==null?(curP>sma?"高於均線":"低於均線"):null;
  const rsiColor=rsi===null?"#334155":rsi>70?"#ef4444":rsi<30?"#10b981":"#f59e0b";
  const momColor=momentum>3?"#10b981":momentum<-3?"#ef4444":"#64748b";
  const endDays=market.endDate?Math.ceil((new Date(market.endDate)-Date.now())/86400000):null;
  const signal=rsi!==null?(rsi<30?"強買":rsi<45?"買入":rsi>70?"強賣":rsi>55?"賣出":"觀望"):"待機";
  const signalColor=signal.includes("買")?"#10b981":signal.includes("賣")?"#ef4444":"#64748b";

  return (
    <div style={{...card,padding:0,border:`1px solid ${isActive?"rgba(0,229,255,0.4)":"rgba(255,255,255,0.06)"}`,transition:"all 0.3s",transform:isActive?"translateY(-3px)":"none",boxShadow:isActive?"0 12px 40px rgba(0,229,255,0.1)":"none",overflow:"hidden",display:"flex",flexDirection:"column"}}>
      {/* Header stripe */}
      <div style={{height:3,background:`linear-gradient(90deg,${CAT_COLORS[market.category]||"#64748b"},transparent)`}}/>
      <div style={{padding:14,display:"flex",flexDirection:"column",gap:0,flex:1}}>
        {/* Top row */}
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
          <span style={tagStyle(market.category)}>{market.category}</span>
          <div style={{display:"flex",gap:6,alignItems:"center"}}>
            {market.trending&&<span style={{fontSize:9,color:"#f59e0b"}}>🔥</span>}
            {endDays!==null&&endDays>0&&<span style={{fontSize:9,color:endDays<7?"#ef4444":endDays<30?"#f59e0b":"#1e3a4a",fontWeight:700}}>{endDays}d</span>}
            {market.volume24hr>0&&<span style={{fontSize:9,color:"#1e3a4a"}}>{fmt(market.volume24hr)}</span>}
          </div>
        </div>

        {/* Title */}
        <div style={{fontSize:12,fontWeight:600,color:"#b0bec5",lineHeight:1.5,marginBottom:10,minHeight:36,flex:"none"}}>{market.title}</div>

        {/* Price display */}
        <PriceBar yes={market.yesPrice}/>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
          <div><div style={{fontSize:22,fontWeight:800,color:"#10b981",letterSpacing:-1,lineHeight:1}}>{pct(market.yesPrice)}</div><div style={{fontSize:9,color:"#334155",marginTop:2}}>YES</div></div>
          <div style={{textAlign:"center"}}>
            <div style={{fontSize:9,color:"#334155"}}>成交量</div>
            <div style={{fontSize:11,color:"#475569",fontWeight:700}}>{fmt(market.volume)}</div>
          </div>
          <div style={{textAlign:"right"}}><div style={{fontSize:22,fontWeight:800,color:"#ef4444",letterSpacing:-1,lineHeight:1}}>{pct(market.noPrice)}</div><div style={{fontSize:9,color:"#334155",marginTop:2,textAlign:"right"}}>NO</div></div>
        </div>

        {/* Sparkline */}
        <div style={{background:"rgba(0,0,0,0.3)",borderRadius:8,padding:"6px 8px",marginBottom:8}}>
          <div style={{display:"flex",justifyContent:"space-between",fontSize:9,color:"#1e3a4a",marginBottom:4}}>
            <span>價格走勢</span>
            <span style={{color:momColor}}>{momentum>=0?"+":""}{momentum.toFixed(1)}%</span>
          </div>
          <MiniSparkline history={hist} height={40}/>
        </div>

        {/* Technical indicators */}
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:5,marginBottom:10}}>
          {[
            {l:"RSI",v:rsi!==null?rsi.toFixed(0):"—",c:rsiColor,sub:rsi!==null?(rsi>70?"超買":rsi<30?"超賣":"中性"):"待數據"},
            {l:"動量",v:`${momentum>=0?"+":""}${momentum.toFixed(1)}%`,c:momColor,sub:hist.length+"點"},
            {l:"信號",v:signal,c:signalColor,sub:smaSignal||"SMA"},
          ].map(({l,v,c,sub})=>(
            <div key={l} style={{background:"rgba(0,0,0,0.25)",borderRadius:6,padding:"6px 8px",textAlign:"center"}}>
              <div style={{fontSize:8,color:"#334155",letterSpacing:1,marginBottom:3}}>{l}</div>
              <div style={{fontSize:12,fontWeight:800,color:c,lineHeight:1}}>{v}</div>
              <div style={{fontSize:8,color:"#1e3a4a",marginTop:2}}>{sub}</div>
            </div>
          ))}
        </div>

        {/* Strategy note */}
        {strategyNote&&<div style={{background:"rgba(139,92,246,0.07)",border:"1px solid rgba(139,92,246,0.15)",borderRadius:6,padding:"5px 8px",marginBottom:8,fontSize:10,color:"#a78bfa",lineHeight:1.5}}>🧠 {strategyNote}</div>}

        {/* Last AI decision */}
        {lastTrade&&(
          <div style={{background:lastTrade.action==="BUY_YES"?"rgba(16,185,129,0.07)":lastTrade.action==="BUY_NO"?"rgba(239,68,68,0.07)":"rgba(0,0,0,0.2)",border:`1px solid ${lastTrade.action==="BUY_YES"?"rgba(16,185,129,0.18)":lastTrade.action==="BUY_NO"?"rgba(239,68,68,0.18)":"rgba(255,255,255,0.05)"}`,borderRadius:6,padding:"7px 10px",marginBottom:8,fontSize:11}}>
            <div style={{display:"flex",justifyContent:"space-between",marginBottom:3}}>
              <span style={{fontWeight:700,color:lastTrade.action==="BUY_YES"?"#10b981":lastTrade.action==="BUY_NO"?"#ef4444":"#475569",fontSize:10}}>
                {lastTrade.action==="BUY_YES"?"▲ 買漲":lastTrade.action==="BUY_NO"?"▼ 買跌":"— 觀望"}
              </span>
              {lastTrade.action!=="HOLD"&&<span style={{color:"#f59e0b",fontSize:10}}>${lastTrade.amount} · {pct(lastTrade.confidence)}</span>}
            </div>
            <div style={{color:"#475569",lineHeight:1.5,fontSize:10}}>{lastTrade.reasoning}</div>
          </div>
        )}

        <button onClick={()=>onAnalyze(market)} disabled={!!analyzing} style={{...btn("#f59e0b",!analyzing),width:"100%",padding:"8px 0",marginTop:"auto"}}>
          {isActive?<span style={{animation:"pulse 1s infinite",display:"inline-block"}}>🤖 分析中...</span>:"🤖 AI 分析"}
        </button>
      </div>
    </div>
  );
}

// ─── Analytics Panel ──────────────────────────────────────────────────────────
function AnalyticsPanel({trades,portfolio,closedTrades,markets,strategyVersions}) {
  const closed=closedTrades||[];
  if(!trades.length&&!closed.length) return (
    <div style={{textAlign:"center",padding:80,color:"#1e293b"}}>
      <div style={{fontSize:48,marginBottom:16,opacity:0.3}}>📊</div>
      <div style={{fontSize:14}}>尚無交易數據</div>
      <div style={{fontSize:11,marginTop:8,color:"#1e3a4a"}}>執行 AI 分析後數據將顯示於此</div>
    </div>
  );
  const openPnl=portfolio.map(t=>{const m=markets.find(mk=>mk.id===t.marketId);const curr=m?(t.action==="BUY_YES"?m.yesPrice:m.noPrice):t.price;return{...t,currPnl:t.shares*curr-t.amount};});
  const realisedPnl=closed.reduce((s,t)=>s+t.realPnl,0);
  const unrealisedPnl=openPnl.reduce((s,t)=>s+t.currPnl,0);
  const totalPnl=realisedPnl+unrealisedPnl;
  const pnlData=[...closed.map(t=>({...t,currPnl:t.realPnl})),...openPnl];
  const wins=pnlData.filter(t=>t.currPnl>0).length;
  const winRate=pnlData.length?wins/pnlData.length:0;
  const rets=pnlData.map(t=>t.currPnl/(t.amount||1));
  const mean=rets.reduce((s,r)=>s+r,0)/(rets.length||1);
  const std=Math.sqrt(rets.reduce((s,r)=>s+(r-mean)**2,0)/(rets.length||1));
  const sharpe=std>0?mean/std:0;
  let peak=STARTING_BALANCE,dd=0,running=STARTING_BALANCE;
  pnlData.forEach(t=>{running+=t.currPnl;if(running>peak)peak=running;dd=Math.max(dd,(peak-running)/peak);});
  const catStats={};
  pnlData.forEach(t=>{const m=markets.find(mk=>mk.id===t.marketId);const cat=m?.category||"其他";if(!catStats[cat])catStats[cat]={w:0,n:0,pnl:0};catStats[cat].n++;catStats[cat].pnl+=t.currPnl;if(t.currPnl>0)catStats[cat].w++;});
  let runV=STARTING_BALANCE;
  const curve=pnlData.map((t,i)=>{runV+=t.currPnl;return{i:i+1,v:parseFloat(runV.toFixed(2))};});
  const svData=strategyVersions.map((sv,i)=>({name:`v${i+1}`,勝率:parseFloat((sv.winRate*100).toFixed(1))}));
  return (
    <div style={{display:"flex",flexDirection:"column",gap:16,animation:"fadeIn 0.3s ease"}}>
      <div style={{display:"grid",gridTemplateColumns:"repeat(6,1fr)",gap:10}}>
        <StatBox label="總損益" value={`${totalPnl>=0?"+":""}${fmt(totalPnl)}`} sub={`報酬 ${pctE(totalPnl/STARTING_BALANCE)}`} color={totalPnl>=0?"#10b981":"#ef4444"}/>
        <StatBox label="已實現" value={`${realisedPnl>=0?"+":""}${fmt(realisedPnl)}`} sub={`${closed.length}筆已平`} color={realisedPnl>=0?"#10b981":"#ef4444"}/>
        <StatBox label="未實現" value={`${unrealisedPnl>=0?"+":""}${fmt(unrealisedPnl)}`} sub={`${openPnl.length}筆持倉`} color={unrealisedPnl>=0?"#34d399":"#f87171"}/>
        <StatBox label="勝率" value={pctE(winRate)} sub={`${wins}/${pnlData.length}筆`} color="#00e5ff"/>
        <StatBox label="最大回撤" value={pctE(dd)} sub="峰谷比" color="#f59e0b"/>
        <StatBox label="夏普比率" value={sharpe.toFixed(2)} sub={`信心 ${pctE(trades.reduce((s,t)=>s+(t.confidence||0),0)/(trades.length||1))}`} color="#8b5cf6"/>
      </div>
      <div style={{display:"grid",gridTemplateColumns:"2fr 1fr",gap:14}}>
        <div style={{...card,padding:20}}>
          <div style={{fontSize:9,color:"#475569",letterSpacing:1.5,marginBottom:14,textTransform:"uppercase"}}>累計損益曲線</div>
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={curve}>
              <defs><linearGradient id="pnlGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#00e5ff" stopOpacity={0.2}/><stop offset="95%" stopColor="#00e5ff" stopOpacity={0}/></linearGradient></defs>
              <XAxis dataKey="i" tick={{fontSize:9,fill:"#334155"}}/>
              <YAxis tick={{fontSize:9,fill:"#334155"}} tickFormatter={v=>fmt(v)}/>
              <Tooltip contentStyle={TT} formatter={v=>[fmt(v),"帳戶"]}/>
              <Area type="monotone" dataKey="v" stroke="#00e5ff" strokeWidth={2} fill="url(#pnlGrad)" dot={false}/>
            </AreaChart>
          </ResponsiveContainer>
        </div>
        <div style={{...card,padding:20}}>
          <div style={{fontSize:9,color:"#475569",letterSpacing:1.5,marginBottom:14,textTransform:"uppercase"}}>類別勝率</div>
          {Object.entries(catStats).map(([cat,s])=>(
            <div key={cat} style={{marginBottom:10}}>
              <div style={{display:"flex",justifyContent:"space-between",fontSize:10,marginBottom:3}}>
                <span style={{color:CAT_COLORS[cat]||"#64748b"}}>{cat}</span>
                <span style={{color:"#334155"}}>{pctE(s.n?s.w/s.n:0)} · {s.n}筆</span>
              </div>
              <div style={{height:3,borderRadius:2,background:"#1e293b"}}><div style={{height:"100%",width:`${s.n?(s.w/s.n)*100:0}%`,background:CAT_COLORS[cat]||"#64748b",borderRadius:2,transition:"width 0.6s"}}/></div>
            </div>
          ))}
        </div>
      </div>
      <div style={{display:"grid",gridTemplateColumns:"2fr 1fr",gap:14}}>
        <div style={{...card,padding:20}}>
          <div style={{fontSize:9,color:"#475569",letterSpacing:1.5,marginBottom:14,textTransform:"uppercase"}}>每筆交易損益</div>
          <ResponsiveContainer width="100%" height={170}>
            <BarChart data={pnlData.map((t,i)=>({n:`#${i+1}`,p:parseFloat(t.currPnl.toFixed(2))}))}>
              <XAxis dataKey="n" tick={{fontSize:8,fill:"#334155"}}/><YAxis tick={{fontSize:8,fill:"#334155"}} tickFormatter={v=>fmt(v)}/>
              <Tooltip contentStyle={TT} formatter={v=>[fmt(v),"損益"]}/>
              <Bar dataKey="p" radius={[3,3,0,0]}>{pnlData.map((t,i)=><Cell key={i} fill={t.currPnl>=0?"#10b981":"#ef4444"}/>)}</Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div style={{...card,padding:20}}>
          <div style={{fontSize:9,color:"#475569",letterSpacing:1.5,marginBottom:14,textTransform:"uppercase"}}>策略版本對比</div>
          {svData.length<2?<div style={{fontSize:11,color:"#1e293b",textAlign:"center",paddingTop:50}}>需累積更多版本</div>:(
            <ResponsiveContainer width="100%" height={170}><BarChart data={svData}><XAxis dataKey="name" tick={{fontSize:10,fill:"#334155"}}/><YAxis tick={{fontSize:10,fill:"#334155"}}/><Tooltip contentStyle={TT}/><Bar dataKey="勝率" fill="#8b5cf6" radius={[3,3,0,0]}/></BarChart></ResponsiveContainer>
          )}
        </div>
      </div>
      <div style={{...card,padding:20}}>
        <div style={{fontSize:9,color:"#475569",letterSpacing:1.5,marginBottom:12,textTransform:"uppercase"}}>交易記錄</div>
        <div style={{display:"grid",gridTemplateColumns:"2.5fr 0.7fr 0.7fr 0.7fr 0.8fr 1.5fr",gap:8,fontSize:9,color:"#334155",letterSpacing:1,padding:"0 8px",marginBottom:8}}>
          <span>市場</span><span>方向</span><span>投入</span><span>成本</span><span>損益</span><span>原因</span>
        </div>
        <div style={{maxHeight:220,overflowY:"auto",display:"flex",flexDirection:"column",gap:3}}>
          {pnlData.map((t,idx)=>(
            <div key={t.id||idx} style={{display:"grid",gridTemplateColumns:"2.5fr 0.7fr 0.7fr 0.7fr 0.8fr 1.5fr",gap:8,padding:"8px",borderRadius:6,background:"rgba(255,255,255,0.02)",fontSize:11,alignItems:"center"}}>
              <span style={{color:"#b0bec5",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{(t.marketTitle||"").substring(0,28)}…</span>
              <span style={{color:t.action==="BUY_YES"?"#10b981":"#ef4444",fontWeight:700}}>{t.action==="BUY_YES"?"▲":"▼"}</span>
              <span style={{color:"#f59e0b"}}>${t.amount}</span>
              <span style={{color:"#64748b"}}>{pct(t.price)}</span>
              <span style={{color:t.currPnl>=0?"#10b981":"#ef4444",fontWeight:700}}>{t.currPnl>=0?"+":""}{fmt(t.currPnl)}</span>
              <span style={{color:"#475569",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",fontSize:10}}>{(t.reasoning||t.sellReason||"").substring(0,35)}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Backtest Panel ───────────────────────────────────────────────────────────
const BACKTEST_STRATEGIES = {
  "RSI逆勢": (hist) => {
    const p=hist.map(h=>h.yes),rsi=calcRSI(p);
    if(rsi===null)return null;
    if(rsi<28)return{action:"BUY_YES",conf:0.75,reason:`RSI超賣 ${rsi.toFixed(0)}`};
    if(rsi>72)return{action:"BUY_NO",conf:0.72,reason:`RSI超買 ${rsi.toFixed(0)}`};
    return null;
  },
  "動量追蹤": (hist) => {
    const p=hist.map(h=>h.yes),mom=calcMomentum(p);
    if(mom>5)return{action:"BUY_YES",conf:0.65,reason:`正動量 +${mom.toFixed(1)}%`};
    if(mom<-5)return{action:"BUY_NO",conf:0.65,reason:`負動量 ${mom.toFixed(1)}%`};
    return null;
  },
  "均值回歸": (hist) => {
    if(hist.length<5)return null;
    const p=hist.map(h=>h.yes),avg=p.reduce((s,v)=>s+v,0)/p.length,cur=p[p.length-1],dev=(cur-avg)/avg;
    if(dev<-0.07)return{action:"BUY_YES",conf:0.68,reason:`低於均值 ${(dev*100).toFixed(1)}%`};
    if(dev>0.07)return{action:"BUY_NO",conf:0.68,reason:`高於均值 +${(dev*100).toFixed(1)}%`};
    return null;
  },
  "量價突破": (hist) => {
    if(hist.length<4)return null;
    const p=hist.map(h=>h.yes),vols=hist.map(h=>h.vol||0);
    const avgVol=vols.reduce((s,v)=>s+v,0)/(vols.length||1);
    const volSpike=vols[vols.length-1]>avgVol*1.5;
    const mom=calcMomentum(p);
    if(volSpike&&mom>3)return{action:"BUY_YES",conf:0.72,reason:"成交量放大+正動量"};
    if(volSpike&&mom<-3)return{action:"BUY_NO",conf:0.72,reason:"成交量放大+負動量"};
    return null;
  },
  "RSI+動量複合": (hist) => {
    const p=hist.map(h=>h.yes),rsi=calcRSI(p),mom=calcMomentum(p);
    if(rsi===null)return null;
    if(rsi<35&&mom>1)return{action:"BUY_YES",conf:0.78,reason:`RSI ${rsi.toFixed(0)}+動量確認`};
    if(rsi>65&&mom<-1)return{action:"BUY_NO",conf:0.78,reason:`RSI ${rsi.toFixed(0)}+動量確認`};
    return null;
  },
};

function BacktestPanel({markets,priceHistory,addLog}) {
  const [running,setRunning]=useState(false);
  const [results,setResults]=useState(null);
  const [strategy,setStrategy]=useState("RSI逆勢");
  const [startBal,setStartBal]=useState(10000);
  const [tradeAmt,setTradeAmt]=useState(200);
  const [tp,setTp]=useState(20);
  const [sl,setSl]=useState(15);
  const [btLog,setBtLog]=useState([]);
  const [compareMode,setCompareMode]=useState(false);
  const [compareResults,setCompareResults]=useState({});

  const runOne=(stratName,mkts,hist)=>{
    const stratFn=BACKTEST_STRATEGIES[stratName];
    let bal=startBal,openPos=[],closedPos=[];
    mkts.forEach(m=>{
      const mhist=hist[m.id]||[];
      for(let i=4;i<mhist.length;i++){
        const slicedHist=mhist.slice(0,i+1),curPrice=mhist[i].yes;
        openPos=openPos.filter(pos=>{
          if(pos.marketId!==m.id)return true;
          const pnlPct=(curPrice-pos.entryPrice)/pos.entryPrice*(pos.action==="BUY_YES"?1:-1);
          if(pnlPct>=tp/100){const pnl=pos.amount*(tp/100);bal+=pos.amount+pnl;closedPos.push({...pos,exitPrice:curPrice,pnl,reason:"止盈"});return false;}
          if(pnlPct<=-sl/100){const pnl=-pos.amount*(sl/100);bal+=pos.amount+pnl;closedPos.push({...pos,exitPrice:curPrice,pnl,reason:"止損"});return false;}
          return true;
        });
        const hasPos=openPos.some(p=>p.marketId===m.id);
        if(!hasPos&&bal>=tradeAmt){
          const sig=stratFn(slicedHist,m);
          if(sig){bal-=tradeAmt;openPos.push({id:Date.now()+i+Math.random(),marketId:m.id,title:m.title,action:sig.action,amount:tradeAmt,entryPrice:curPrice,reason:sig.reason});}
        }
      }
    });
    openPos.forEach(pos=>{
      const m=mkts.find(mk=>mk.id===pos.marketId);if(!m)return;
      const lastP=m.yesPrice,pnlPct=(lastP-pos.entryPrice)/pos.entryPrice*(pos.action==="BUY_YES"?1:-1);
      const pnl=pos.amount*pnlPct;bal+=pos.amount+pnl;closedPos.push({...pos,exitPrice:lastP,pnl,reason:"期末"});
    });
    const totalPnl=bal-startBal,wins=closedPos.filter(p=>p.pnl>0).length,winRate=closedPos.length?wins/closedPos.length:0;
    let peak=startBal,maxDD=0,run=startBal;closedPos.forEach(p=>{run+=p.pnl;if(run>peak)peak=run;maxDD=Math.max(maxDD,(peak-run)/peak);});
    const curve=closedPos.map((p,i)=>({i:i+1,v:parseFloat((startBal+closedPos.slice(0,i+1).reduce((s,t)=>s+t.pnl,0)).toFixed(2))}));
    return{totalPnl,finalBal:bal,winRate,trades:closedPos.length,wins,maxDD,curve,closedPos};
  };

  const runBacktest=()=>{
    setRunning(true);setBtLog([]);
    const mkts=markets.filter(m=>priceHistory[m.id]&&priceHistory[m.id].length>=5);
    if(mkts.length===0){setBtLog(["⚠ 數據不足，請等待系統累積價格記錄（每30秒一次）"]);setRunning(false);return;}
    if(compareMode){
      const cmp={};
      Object.keys(BACKTEST_STRATEGIES).forEach(s=>{cmp[s]=runOne(s,mkts,priceHistory);});
      setCompareResults(cmp);
      const best=Object.entries(cmp).sort((a,b)=>b[1].totalPnl-a[1].totalPnl)[0];
      setBtLog([`📊 比較完成 · 最佳策略: ${best[0]} (${fmt(best[1].totalPnl)})`,...Object.entries(cmp).map(([s,r])=>`  ${s}: ${r.trades}筆 勝率${pctE(r.winRate)} ${r.totalPnl>=0?"+":""}${fmt(r.totalPnl)}`)]);
      setResults(cmp[strategy]);
    } else {
      const r=runOne(strategy,mkts,priceHistory);
      setResults(r);
      setBtLog([`完成 [${strategy}] · ${mkts.length}個市場 · ${r.trades}筆交易`,`勝率 ${pctE(r.winRate)} · 損益 ${r.totalPnl>=0?"+":""}${fmt(r.totalPnl)} · 最大回撤 ${pctE(r.maxDD)}`,...r.closedPos.slice(-8).reverse().map(p=>`${p.pnl>=0?"✅":"🔴"} ${p.title?.substring(0,22)} ${p.pnl>=0?"+":""}${fmt(p.pnl)} [${p.reason}]`)]);
      addLog(`🔬 回測[${strategy}]: ${r.trades}筆 勝率${pctE(r.winRate)} ${r.totalPnl>=0?"+":""}${fmt(r.totalPnl)}`);
    }
    setRunning(false);
  };

  const histCount=markets.filter(m=>priceHistory[m.id]&&priceHistory[m.id].length>=5).length;
  const avgPts=Object.keys(priceHistory).length?Math.round(Object.values(priceHistory).reduce((s,h)=>s+h.length,0)/Object.keys(priceHistory).length):0;

  return (
    <div style={{display:"flex",flexDirection:"column",gap:16,animation:"fadeIn 0.3s ease"}}>
      <div style={{...cardGlow("139,92,246"),padding:20}}>
        <div style={{fontSize:9,color:"#8b5cf6",letterSpacing:2,marginBottom:16,textTransform:"uppercase"}}>🔬 回測設定</div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:10,marginBottom:16}}>
          {[["起始資金","startBal",startBal,setStartBal,100,100000,1000,"$"],["每單金額","ta",tradeAmt,setTradeAmt,10,5000,10,"$"],["止盈","tp",tp,setTp,1,100,1,"%"],["止損","sl",sl,setSl,1,50,1,"%"]].map(([label,key,val,setter,mn,mx,step,sfx])=>(
            <div key={key} style={{background:"rgba(0,0,0,0.3)",borderRadius:8,padding:"12px"}}>
              <div style={{fontSize:9,color:"#475569",letterSpacing:1,marginBottom:6}}>{label}</div>
              <div style={{display:"flex",alignItems:"center",gap:4}}>
                <input type="number" value={val} min={mn} max={mx} step={step} onChange={e=>setter(Number(e.target.value))} style={{...inp,padding:"5px 8px",fontSize:14,fontWeight:700,color:"#8b5cf6",width:80}}/>
                <span style={{fontSize:11,color:"#334155"}}>{sfx}</span>
              </div>
            </div>
          ))}
        </div>
        <div style={{marginBottom:14}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
            <div style={{fontSize:9,color:"#475569",letterSpacing:1,textTransform:"uppercase"}}>策略選擇</div>
            <button onClick={()=>setCompareMode(!compareMode)} style={{...btn("#8b5cf6",compareMode),padding:"4px 12px",fontSize:10}}>
              {compareMode?"✓ 全策略對比":"全策略對比"}
            </button>
          </div>
          <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
            {Object.keys(BACKTEST_STRATEGIES).map(s=>(
              <button key={s} onClick={()=>{setStrategy(s);setCompareMode(false);}} style={{...btn("#8b5cf6",!compareMode&&strategy===s),padding:"6px 14px",fontSize:10}}>
                {!compareMode&&strategy===s?"✓ ":""}{s}
              </button>
            ))}
          </div>
        </div>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <div style={{fontSize:10,color:"#334155"}}>
            可用數據：{histCount} 個市場 · 平均 {avgPts} 點
            {histCount===0&&<span style={{color:"#f59e0b",marginLeft:8}}>⚡ 等待數據累積中</span>}
          </div>
          <button onClick={runBacktest} disabled={running||histCount===0} style={{...btn("#8b5cf6",!running&&histCount>0),padding:"10px 28px",fontSize:11}}>
            {running?"⏳ 回測中...":compareMode?"▶ 全策略對比":"▶ 執行回測"}
          </button>
        </div>
      </div>

      {compareMode&&Object.keys(compareResults).length>0&&(
        <div style={{...card,padding:20}}>
          <div style={{fontSize:9,color:"#475569",letterSpacing:2,marginBottom:14,textTransform:"uppercase"}}>策略對比結果</div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(5,1fr)",gap:10}}>
            {Object.entries(compareResults).sort((a,b)=>b[1].totalPnl-a[1].totalPnl).map(([s,r],i)=>(
              <div key={s} onClick={()=>{setStrategy(s);setCompareMode(false);setResults(r);}} style={{...card,padding:14,cursor:"pointer",border:`1px solid ${i===0?"rgba(139,92,246,0.4)":"rgba(255,255,255,0.06)"}`,transition:"all 0.2s"}} onMouseEnter={e=>e.currentTarget.style.borderColor="rgba(139,92,246,0.3)"} onMouseLeave={e=>e.currentTarget.style.borderColor=i===0?"rgba(139,92,246,0.4)":"rgba(255,255,255,0.06)"}>
                {i===0&&<div style={{fontSize:9,color:"#8b5cf6",marginBottom:6}}>🏆 最佳</div>}
                <div style={{fontSize:11,fontWeight:700,color:"#b0bec5",marginBottom:8}}>{s}</div>
                <div style={{fontSize:16,fontWeight:800,color:r.totalPnl>=0?"#10b981":"#ef4444"}}>{r.totalPnl>=0?"+":""}{fmt(r.totalPnl)}</div>
                <div style={{fontSize:10,color:"#334155",marginTop:4}}>勝率 {pctE(r.winRate)}</div>
                <div style={{fontSize:10,color:"#334155"}}>{r.trades}筆 · 回撤{pctE(r.maxDD)}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {results&&(
        <div style={{display:"flex",flexDirection:"column",gap:14}}>
          <div style={{display:"grid",gridTemplateColumns:"repeat(5,1fr)",gap:10}}>
            {[
              {l:"最終餘額",v:fmt(results.finalBal),sub:`起始 $${startBal.toLocaleString()}`,c:"#00e5ff"},
              {l:"總損益",v:`${results.totalPnl>=0?"+":""}${fmt(results.totalPnl)}`,sub:`報酬率 ${pctE(results.totalPnl/startBal)}`,c:results.totalPnl>=0?"#10b981":"#ef4444"},
              {l:"勝率",v:pctE(results.winRate),sub:`${results.wins}/${results.trades}筆`,c:"#f59e0b"},
              {l:"交易筆數",v:results.trades,sub:"已平倉",c:"#8b5cf6"},
              {l:"最大回撤",v:pctE(results.maxDD),sub:"峰谷比",c:results.maxDD>0.2?"#ef4444":"#64748b"},
            ].map(({l,v,sub,c})=><StatBox key={l} label={l} value={v} sub={sub} color={c}/>)}
          </div>
          <div style={{display:"grid",gridTemplateColumns:"2fr 1fr",gap:14}}>
            <div style={{...card,padding:20}}>
              <div style={{fontSize:9,color:"#475569",letterSpacing:1.5,marginBottom:12,textTransform:"uppercase"}}>回測損益曲線</div>
              <ResponsiveContainer width="100%" height={190}>
                <AreaChart data={results.curve}>
                  <defs><linearGradient id="btGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor={results.totalPnl>=0?"#10b981":"#ef4444"} stopOpacity={0.25}/><stop offset="95%" stopColor={results.totalPnl>=0?"#10b981":"#ef4444"} stopOpacity={0}/></linearGradient></defs>
                  <XAxis dataKey="i" tick={{fontSize:9,fill:"#334155"}}/><YAxis tick={{fontSize:9,fill:"#334155"}} tickFormatter={v=>fmt(v)}/>
                  <Tooltip contentStyle={TT} formatter={v=>[fmt(v),"帳戶"]}/>
                  <Area type="monotone" dataKey="v" stroke={results.totalPnl>=0?"#10b981":"#ef4444"} strokeWidth={2} fill="url(#btGrad)" dot={false}/>
                </AreaChart>
              </ResponsiveContainer>
            </div>
            <div style={{...card,padding:20}}>
              <div style={{fontSize:9,color:"#475569",letterSpacing:1.5,marginBottom:12,textTransform:"uppercase"}}>最近交易</div>
              <div style={{display:"flex",flexDirection:"column",gap:4,maxHeight:190,overflowY:"auto"}}>
                {results.closedPos.slice(-10).reverse().map((t,i)=>(
                  <div key={i} style={{fontSize:10,padding:"6px 8px",borderRadius:5,background:"rgba(255,255,255,0.02)",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                    <span style={{color:"#475569",flex:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",fontSize:9}}>{t.title?.substring(0,20)}</span>
                    <span style={{color:t.pnl>=0?"#10b981":"#ef4444",fontWeight:700,marginLeft:6,flexShrink:0}}>{t.pnl>=0?"+":""}{fmt(t.pnl)}</span>
                    <span style={{color:"#334155",fontSize:9,marginLeft:6,flexShrink:0}}>{t.reason}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {btLog.length>0&&(
        <div style={{...card,padding:16}}>
          <div style={{fontSize:9,color:"#475569",letterSpacing:1.5,marginBottom:10,textTransform:"uppercase"}}>回測日誌</div>
          <div style={{maxHeight:140,overflowY:"auto",display:"flex",flexDirection:"column",gap:3}}>
            {btLog.map((msg,i)=><div key={i} style={{fontSize:10,color:"#475569",padding:"2px 0",lineHeight:1.6}}>{msg}</div>)}
          </div>
        </div>
      )}

      {!results&&btLog.length===0&&(
        <div style={{textAlign:"center",padding:60,color:"#1e293b"}}>
          <div style={{fontSize:44,marginBottom:14,opacity:0.25}}>🔬</div>
          <div style={{fontSize:13,color:"#334155",marginBottom:8}}>選擇策略後執行回測</div>
          <div style={{fontSize:10,color:"#1e3a4a",lineHeight:1.8}}>系統每30秒從 Polymarket 抓取真實價格<br/>累積足夠數據點後即可進行歷史模擬</div>
        </div>
      )}
    </div>
  );
}

// ─── Wallet Panel ─────────────────────────────────────────────────────────────
function WalletPanel({addLog}) {
  const [wallets,setWallets]=useState([]);
  const [inputAddr,setInputAddr]=useState(""); const [inputLabel,setInputLabel]=useState("");
  const [monitoring,setMonitoring]=useState({}); const [activity,setActivity]=useState({});

  const fetchActivity=useCallback(async(addr)=>{
    addLog(`👛 掃描: ${addr.substring(0,14)}...`);
    const mocks=Array.from({length:Math.floor(Math.random()*5+2)},(_,i)=>({id:Date.now()+i,market:["Fed降息市場","BTC突破10萬","台灣大選","OpenAI GPT-5","標普500"][Math.floor(Math.random()*5)],action:Math.random()>0.5?"BUY_YES":"BUY_NO",amount:Math.floor(Math.random()*400+50),price:parseFloat((Math.random()*0.7+0.15).toFixed(2)),time:new Date(Date.now()-Math.random()*86400000).toLocaleTimeString("zh-TW"),pnl:parseFloat(((Math.random()-0.4)*120).toFixed(2))}));
    setActivity(prev=>({...prev,[addr]:mocks}));
    addLog(`✅ ${addr.substring(0,14)}... ${mocks.length}筆記錄`);
  },[addLog]);

  const addWallet=()=>{if(!inputAddr.trim())return;const addr=inputAddr.trim();if(wallets.find(w=>w.addr===addr))return;setWallets(prev=>[...prev,{addr,label:inputLabel||`錢包 ${wallets.length+1}`,copying:false}]);setInputAddr("");setInputLabel("");addLog(`➕ 新增: ${addr.substring(0,14)}...`);fetchActivity(addr);};
  const toggleMon=(addr)=>{const wasOn=monitoring[addr];setMonitoring(prev=>({...prev,[addr]:!wasOn}));addLog(`${wasOn?"⏹":"▶"} 監控: ${addr.substring(0,14)}...`);};
  const toggleCopy=(addr)=>{setWallets(prev=>prev.map(w=>w.addr===addr?{...w,copying:!w.copying}:w));};
  const removeW=(addr)=>{setWallets(prev=>prev.filter(w=>w.addr!==addr));setActivity(prev=>{const n={...prev};delete n[addr];return n;});};

  return (
    <div style={{display:"flex",flexDirection:"column",gap:16}}>
      <div style={{...card,padding:20}}>
        <div style={{fontSize:9,color:"#475569",letterSpacing:2,marginBottom:14,textTransform:"uppercase"}}>新增監控錢包</div>
        <div style={{display:"flex",gap:8,marginBottom:8}}>
          <input value={inputLabel} onChange={e=>setInputLabel(e.target.value)} placeholder="標籤（選填）" style={{...inp,width:140,flexShrink:0}}/>
          <input value={inputAddr} onChange={e=>setInputAddr(e.target.value)} onKeyDown={e=>e.key==="Enter"&&addWallet()} placeholder="錢包地址 0x... 或任意測試地址" style={inp}/>
          <button onClick={addWallet} style={{...btn("#00e5ff",true),flexShrink:0,padding:"10px 18px"}}>+ 新增</button>
        </div>
        <div style={{fontSize:10,color:"#1e3a4a"}}>💡 模擬模式：輸入任意地址測試監控功能</div>
      </div>
      {wallets.length===0&&<div style={{textAlign:"center",padding:60,color:"#1e293b"}}><div style={{fontSize:40,marginBottom:12,opacity:0.3}}>👛</div><div>尚未新增錢包</div></div>}
      {wallets.map(w=>{
        const acts=activity[w.addr]||[],totalPnlW=acts.reduce((s,a)=>s+a.pnl,0),wins=acts.filter(a=>a.pnl>0).length,isMon=monitoring[w.addr];
        return (
          <div key={w.addr} style={{...cardGlow(isMon?"0,229,255":"255,255,255"),padding:20}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:14}}>
              <div style={{display:"flex",alignItems:"center",gap:10}}>
                <div style={{width:8,height:8,borderRadius:"50%",background:isMon?"#00e5ff":"#1e293b",boxShadow:isMon?"0 0 8px #00e5ff":"none",flexShrink:0,animation:isMon?"glow 2s infinite":"none"}}/>
                <div><div style={{fontSize:13,fontWeight:700,color:"#b0bec5"}}>{w.label}</div><div style={{fontSize:9,color:"#334155",marginTop:2,wordBreak:"break-all"}}>{w.addr}</div></div>
              </div>
              <div style={{display:"flex",gap:6,flexShrink:0,marginLeft:12}}>
                <button onClick={()=>toggleMon(w.addr)} style={{...btn(isMon?"#ef4444":"#00e5ff",true),fontSize:10}}>{isMon?"⏹":"▶"}</button>
                <button onClick={()=>toggleCopy(w.addr)} style={{...btn(w.copying?"#f59e0b":"#10b981",true),fontSize:10}}>{w.copying?"⏹":"📋"}</button>
                <button onClick={()=>fetchActivity(w.addr)} style={{...btn("#8b5cf6",true),fontSize:10}}>🔄</button>
                <button onClick={()=>removeW(w.addr)} style={{...btn("#ef4444",true),fontSize:10,padding:"7px 10px"}}>✕</button>
              </div>
            </div>
            <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:10,marginBottom:14}}>
              {[["交易筆數",acts.length,"#00e5ff"],["勝率",acts.length?pctE(wins/acts.length):"—","#10b981"],["損益",`${totalPnlW>=0?"+":""}${fmt(totalPnlW)}`,totalPnlW>=0?"#10b981":"#ef4444"],["狀態",w.copying?"複製中":isMon?"監控中":"待機",w.copying?"#f59e0b":isMon?"#00e5ff":"#334155"]].map(([l,v,c])=>(
                <div key={l} style={{background:"rgba(0,0,0,0.3)",borderRadius:8,padding:"10px"}}>
                  <div style={{fontSize:9,color:"#334155",letterSpacing:1}}>{l}</div>
                  <div style={{fontSize:14,fontWeight:800,color:c,marginTop:4}}>{v}</div>
                </div>
              ))}
            </div>
            {acts.length>0&&<div style={{display:"flex",flexDirection:"column",gap:3}}>{acts.slice(0,4).map(a=>(
              <div key={a.id} style={{display:"flex",gap:10,background:"rgba(255,255,255,0.02)",borderRadius:6,padding:"6px 10px",fontSize:10,alignItems:"center"}}>
                <span style={{color:"#475569",flex:2,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{a.market}</span>
                <span style={{color:a.action==="BUY_YES"?"#10b981":"#ef4444",fontWeight:700,flexShrink:0}}>{"▲▼"[a.action==="BUY_YES"?0:1]}</span>
                <span style={{color:"#f59e0b",flexShrink:0}}>${a.amount}</span>
                <span style={{color:a.pnl>=0?"#10b981":"#ef4444",fontWeight:700,flexShrink:0}}>{a.pnl>=0?"+":""}{fmt(a.pnl)}</span>
              </div>
            ))}</div>}
          </div>
        );
      })}
    </div>
  );
}

// ─── Learning Panel ───────────────────────────────────────────────────────────
function LearningPanel({apiKey,trades,portfolio,closedTrades,markets,strategyVersions,currentStrategy,onStrategyUpdate,addLog,autoLearning}) {
  const [reviewing,setReviewing]=useState(false);
  const closed=closedTrades||[];
  const nextLearnAt=Math.ceil((closed.length+1)/3)*3;
  const progress=closed.length>0?(closed.length%3)/3*100:0;

  const runReview=async()=>{
    if(reviewing)return;setReviewing(true);addLog("🧠 手動策略回顧...");
    const allData=[...closed,...portfolio.map(t=>{const m=markets.find(mk=>mk.id===t.marketId);const curr=m?(t.action==="BUY_YES"?m.yesPrice:m.noPrice):t.price;return{...t,realPnl:t.shares*curr-t.amount,sellReason:"持倉中"};})];
    const wins=allData.filter(t=>t.realPnl>0).length,winRate=allData.length?wins/allData.length:0;
    const summary=allData.slice(-10).map(t=>`[${t.action}] ${(t.marketTitle||"").substring(0,22)} | $${t.amount} | ${(t.realPnl||0)>=0?"+":""}${(t.realPnl||0).toFixed(0)} | ${t.sellReason||""}`).join("\n");
    try{
      const raw=await callClaude(apiKey,`你是預測市場AI策略分析師。只回傳合法JSON，不要markdown。`,`當前策略:"${currentStrategy}"\n勝率:${pctE(winRate)}\n\n近期交易:\n${summary}\n\nJSON:{"mistakes":["..."],"improvements":["..."],"newStrategy":"繁體中文50字內","categoryInsights":{"類別":"洞察"},"version":${strategyVersions.length+1}}`,1500);
      const result=parseJ(raw);
      if(result){onStrategyUpdate(result);addLog(`✅ 策略更新 v${result.version}`);}
      else addLog("⚠ 解析失敗");
    }catch(e){addLog(`❌ ${e.message}`);}
    setReviewing(false);
  };

  return (
    <div style={{display:"flex",flexDirection:"column",gap:16,animation:"fadeIn 0.3s ease"}}>
      <div style={{...cardGlow("16,185,129"),padding:20}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
          <div>
            <div style={{fontSize:9,color:"#10b981",letterSpacing:2,marginBottom:4,textTransform:"uppercase"}}>🤖 自動策略學習</div>
            <div style={{fontSize:11,color:"#475569"}}>每 3 筆平倉後自動分析並進化策略</div>
          </div>
          <div style={{display:"flex",alignItems:"center",gap:10}}>
            {autoLearning&&<span style={{fontSize:11,color:"#10b981",animation:"blink 1s infinite"}}>🧠 學習中...</span>}
            <div style={{textAlign:"right"}}>
              <div style={{fontSize:9,color:"#334155",letterSpacing:1}}>下次學習</div>
              <div style={{fontSize:16,fontWeight:800,color:"#10b981"}}>{nextLearnAt-closed.length}筆後</div>
            </div>
          </div>
        </div>
        <div style={{height:4,borderRadius:2,background:"#1e293b",marginBottom:6}}><div style={{height:"100%",width:`${progress}%`,background:"linear-gradient(90deg,#10b981,#34d399)",borderRadius:2,transition:"width 0.5s"}}/></div>
        <div style={{display:"flex",justifyContent:"space-between",fontSize:9,color:"#334155"}}><span>已平倉 {closed.length} 筆</span><span>v{strategyVersions.length+1}</span><span>下次 v{strategyVersions.length+2} 於第 {nextLearnAt} 筆</span></div>
      </div>
      <div style={{...cardGlow("139,92,246"),padding:24}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:12}}>
          <div style={{flex:1,marginRight:20}}>
            <div style={{fontSize:9,color:"#8b5cf6",letterSpacing:2,marginBottom:6,textTransform:"uppercase"}}>當前策略 v{strategyVersions.length+1}</div>
            <div style={{fontSize:13,color:"#cfd8dc",lineHeight:1.9}}>{currentStrategy}</div>
          </div>
          <button onClick={runReview} disabled={reviewing||autoLearning} style={{...btn("#8b5cf6",!reviewing&&!autoLearning),padding:"10px 18px",flexShrink:0}}>
            {reviewing?"🧠 分析中...":"🔄 手動回顧"}
          </button>
        </div>
      </div>
      {strategyVersions.length>0&&(
        <div style={{...card,padding:20}}>
          <div style={{fontSize:9,color:"#475569",letterSpacing:2,marginBottom:14,textTransform:"uppercase"}}>版本歷史</div>
          <div style={{display:"flex",flexDirection:"column",gap:8}}>
            {strategyVersions.map((sv,i)=>(
              <div key={i} style={{background:"rgba(255,255,255,0.02)",borderRadius:8,padding:"12px 16px",borderLeft:`3px solid ${i===strategyVersions.length-1?"#8b5cf6":"#1e293b"}`}}>
                <div style={{display:"flex",justifyContent:"space-between",marginBottom:5}}>
                  <span style={{fontSize:11,fontWeight:700,color:i===strategyVersions.length-1?"#8b5cf6":"#334155"}}>v{i+1}</span>
                  <span style={{fontSize:10,color:"#334155"}}>勝率 {pctE(sv.winRate)} · {sv.tradeCount}筆</span>
                </div>
                <div style={{fontSize:10,color:"#475569",lineHeight:1.6}}>{sv.summary}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Settings Panel ───────────────────────────────────────────────────────────
function SettingsPanel({cfg,updateCfg,toggleCategory,balance,trades,closedTrades}) {
  const ALL_CATS=["Economics","Crypto","Politics","AI","Science","Finance","Sports"];
  const CAT_ZH={Economics:"經濟",Crypto:"加密",Politics:"政治",AI:"人工智慧",Science:"科學",Finance:"金融",Sports:"體育"};
  const totalPnlR=closedTrades.reduce((s,t)=>s+t.realPnl,0);
  const drawdownPct=((STARTING_BALANCE-(balance+totalPnlR))/STARTING_BALANCE*100).toFixed(1);
  const TPPC=0.0000008,TPC=350,catCount=cfg.enabledCategories.length||1;
  const scansPerHour=cfg.smartTrigger?(3600/cfg.scanInterval)*0.15:3600/cfg.scanInterval;
  const costPerHour=scansPerHour*catCount*TPC*TPPC;
  const costPerDay=costPerHour*24,costPerMonth=costPerDay*30;
  const riskColor=costPerHour>0.5?"#ef4444":costPerHour>0.1?"#f59e0b":"#10b981";

  const Section=({title,color,children})=>(<div style={{...cardGlow(color==="purple"?"139,92,246":color==="green"?"16,185,129":color==="yellow"?"245,158,11":"0,229,255"),padding:20}}><div style={{fontSize:9,color:color==="purple"?"#8b5cf6":color==="green"?"#10b981":color==="yellow"?"#f59e0b":"#00e5ff",letterSpacing:2,marginBottom:16,textTransform:"uppercase",fontWeight:700}}>{title}</div><div style={{display:"flex",flexDirection:"column",gap:14}}>{children}</div></div>);
  const Row=({label,sub,children})=>(<div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:12}}><div style={{flex:1}}><div style={{fontSize:11,color:"#b0bec5",fontWeight:600}}>{label}</div>{sub&&<div style={{fontSize:10,color:"#334155",marginTop:2}}>{sub}</div>}</div><div style={{flexShrink:0}}>{children}</div></div>);
  const NumInput=({val,onChange,min,max,step=1,suffix=""})=>(<div style={{display:"flex",alignItems:"center",gap:6}}><input type="number" value={val} min={min} max={max} step={step} onChange={e=>onChange(Number(e.target.value))} style={{...inp,width:80,textAlign:"right",padding:"6px 10px"}}/>{suffix&&<span style={{fontSize:11,color:"#475569",minWidth:20}}>{suffix}</span>}</div>);
  const Toggle=({val,onChange,onLabel="開",offLabel="關"})=>(<button onClick={()=>onChange(!val)} style={{...btn(val?"#10b981":"#475569",true),padding:"5px 14px",minWidth:52}}>{val?onLabel:offLabel}</button>);

  return (
    <div style={{display:"flex",flexDirection:"column",gap:14,animation:"fadeIn 0.3s ease"}}>
      <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:10}}>
        <StatBox label="當前餘額" value={fmt(balance)} sub={`起始 $${STARTING_BALANCE.toLocaleString()}`} color="#00e5ff"/>
        <StatBox label="已實現損益" value={`${totalPnlR>=0?"+":""}${fmt(totalPnlR)}`} sub={`${closedTrades.length}筆已平`} color={totalPnlR>=0?"#10b981":"#ef4444"}/>
        <StatBox label="當前回撤" value={`${drawdownPct}%`} sub={`上限 ${cfg.maxDrawdown}%`} color={parseFloat(drawdownPct)>cfg.maxDrawdown*0.7?"#f59e0b":"#64748b"}/>
        <StatBox label="交易筆數" value={trades.length} sub={`已平 ${closedTrades.length}`} color="#8b5cf6"/>
      </div>

      {/* Cost Dashboard */}
      <div style={{...cardGlow("0,229,255"),padding:20}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
          <div><div style={{fontSize:9,color:"#00e5ff",letterSpacing:2,marginBottom:4,textTransform:"uppercase"}}>💰 API 費用即時估算</div><div style={{fontSize:10,color:"#334155"}}>{catCount} 類別 · {cfg.scanInterval}秒{cfg.smartTrigger?` · 智能觸發 >${cfg.smartTriggerPct}%`:""}</div></div>
          <div style={{background:`${riskColor}18`,border:`1px solid ${riskColor}44`,borderRadius:8,padding:"6px 14px",fontSize:12,fontWeight:700,color:riskColor}}>{costPerHour>0.5?"⚠ 高費用":costPerHour>0.1?"⚡ 中等":"✅ 省費"}</div>
        </div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:10,marginBottom:14}}>
          {[{l:"每次掃描",v:`$${(catCount*TPC*TPPC).toFixed(4)}`,sub:`${catCount}次呼叫`},{l:"每小時",v:`$${costPerHour.toFixed(3)}`,sub:`${Math.round(scansPerHour*catCount)}次/hr`},{l:"每日",v:`$${costPerDay.toFixed(2)}`,sub:costPerDay>1?"💸 偏高":"✅ 合理"},{l:"每月",v:`$${costPerMonth.toFixed(1)}`,sub:costPerMonth>30?"建議調整":"經濟"}].map(({l,v,sub})=>(
            <div key={l} style={{background:"rgba(0,0,0,0.3)",borderRadius:8,padding:"12px"}}><div style={{fontSize:9,color:"#334155",letterSpacing:1.5,marginBottom:6}}>{l}</div><div style={{fontSize:17,fontWeight:800,color:"#00e5ff"}}>{v}</div><div style={{fontSize:9,color:"#1e3a4a",marginTop:3}}>{sub}</div></div>
          ))}
        </div>
        <div style={{fontSize:9,color:"#334155",marginBottom:8}}>各間隔每日費用比較（點擊切換）</div>
        <div style={{display:"flex",gap:5,alignItems:"flex-end",height:52}}>
          {[{s:1,l:"1s"},{s:5,l:"5s"},{s:10,l:"10s"},{s:30,l:"30s"},{s:60,l:"1m"},{s:120,l:"2m"},{s:300,l:"5m"}].map(({s,l})=>{
            const c2=(cfg.smartTrigger?0.15:1)*(3600/s)*catCount*TPC*TPPC*24;
            const maxC=(cfg.smartTrigger?0.15:1)*3600*catCount*TPC*TPPC*24;
            const barH=Math.max(4,(c2/maxC)*44);
            const isA=cfg.scanInterval===s;
            const bc=c2>1?"#ef4444":c2>0.1?"#f59e0b":"#10b981";
            return (<div key={s} onClick={()=>updateCfg("scanInterval",s)} style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",gap:2,cursor:"pointer"}}>
              <div style={{fontSize:8,color:isA?"#00e5ff":"#1e3a4a"}}>${c2.toFixed(2)}</div>
              <div style={{width:"100%",height:barH,borderRadius:"2px 2px 0 0",background:isA?"#00e5ff":bc,opacity:isA?1:0.5,transition:"all 0.3s",border:isA?"1px solid #00e5ff":""}}/>
              <div style={{fontSize:9,color:isA?"#00e5ff":"#334155",fontWeight:isA?700:400}}>{l}</div>
            </div>);
          })}
        </div>
      </div>

      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14}}>
        <Section title="🛡 風險管理" color="yellow">
          <Row label="止盈目標" sub="達此%自動賣出"><NumInput val={cfg.takeProfit} onChange={v=>updateCfg("takeProfit",clamp(v,5,100))} min={5} max={100} suffix="%"/></Row>
          <Row label="止損上限" sub="虧損此%自動賣出"><NumInput val={cfg.stopLoss} onChange={v=>updateCfg("stopLoss",clamp(v,1,50))} min={1} max={50} suffix="%"/></Row>
          <Row label="最大回撤" sub="帳戶虧損此%停止交易"><NumInput val={cfg.maxDrawdown} onChange={v=>updateCfg("maxDrawdown",clamp(v,5,80))} min={5} max={80} suffix="%"/></Row>
          <Row label="最長持倉" sub="超過此時間自動到期賣出"><NumInput val={cfg.maxHoldMin} onChange={v=>updateCfg("maxHoldMin",clamp(v,1,60))} min={1} max={60} suffix="分鐘"/></Row>
        </Section>
        <Section title="💰 每單金額" color="green">
          <Row label="金額模式" sub={cfg.amountMode==="fixed"?"固定金額":"餘額百分比"}>
            <div style={{display:"flex",gap:6}}><button onClick={()=>updateCfg("amountMode","fixed")} style={{...btn("#10b981",cfg.amountMode==="fixed"),padding:"5px 12px",fontSize:10}}>固定</button><button onClick={()=>updateCfg("amountMode","percent")} style={{...btn("#10b981",cfg.amountMode==="percent"),padding:"5px 12px",fontSize:10}}>百分比</button></div>
          </Row>
          {cfg.amountMode==="fixed"?<Row label="固定金額"><NumInput val={cfg.fixedAmount} onChange={v=>updateCfg("fixedAmount",clamp(v,10,5000))} min={10} max={5000} step={10} suffix="$"/></Row>:<Row label="百分比" sub={`≈ $${(balance*cfg.percentAmount/100).toFixed(0)}`}><NumInput val={cfg.percentAmount} onChange={v=>updateCfg("percentAmount",clamp(v,1,50))} min={1} max={50} suffix="%"/></Row>}
          <Row label="最低金額"><NumInput val={cfg.minAmount} onChange={v=>updateCfg("minAmount",clamp(v,10,cfg.maxAmount-10))} min={10} max={490} suffix="$"/></Row>
          <Row label="最高金額"><NumInput val={cfg.maxAmount} onChange={v=>updateCfg("maxAmount",clamp(v,cfg.minAmount+10,10000))} min={60} max={10000} suffix="$"/></Row>
          <Row label="最大持倉數"><NumInput val={cfg.maxOpenPositions} onChange={v=>updateCfg("maxOpenPositions",clamp(v,1,20))} min={1} max={20} suffix="筆"/></Row>
        </Section>
        <Section title="🎯 市場篩選" color="default">
          <Row label="最低成交量"><NumInput val={cfg.minVolume/1000} onChange={v=>updateCfg("minVolume",v*1000)} min={0} max={5000} step={100} suffix="K"/></Row>
          <Row label="最低AI信心"><NumInput val={Math.round(cfg.minConfidence*100)} onChange={v=>updateCfg("minConfidence",v/100)} min={0} max={95} suffix="%"/></Row>
          <Row label="交易類別" sub="點擊開關各類別"><div/></Row>
          <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:6}}>
            {ALL_CATS.map(cat=>(
              <button key={cat} onClick={()=>toggleCategory(cat)} style={{padding:"7px 4px",borderRadius:7,border:`1px solid ${(CAT_COLORS[cat]||"#64748b")}${cfg.enabledCategories.includes(cat)?"66":"22"}`,background:cfg.enabledCategories.includes(cat)?`${CAT_COLORS[cat]||"#64748b"}15`:"rgba(0,0,0,0.3)",color:cfg.enabledCategories.includes(cat)?CAT_COLORS[cat]||"#64748b":"#334155",fontSize:9,fontWeight:700,cursor:"pointer",fontFamily:"inherit",transition:"all 0.2s",textAlign:"center"}}>
                {cfg.enabledCategories.includes(cat)?"✓ ":""}{CAT_ZH[cat]||cat}
              </button>
            ))}
          </div>
        </Section>
        <Section title="🤖 自動化" color="purple">
          <Row label="掃描間隔" sub={<span style={{color:cfg.scanInterval<=5?"#ef4444":cfg.scanInterval<=10?"#f59e0b":"#64748b"}}>每日 ≈ <b style={{color:riskColor}}>${costPerDay.toFixed(2)}</b></span>}>
            <div style={{display:"flex",gap:4,flexWrap:"wrap",justifyContent:"flex-end"}}>
              {[1,5,10,30,60,120,300].map(s=>{const cd=((cfg.smartTrigger?0.15:1)*(3600/s)*catCount*TPC*TPPC*24).toFixed(s<=5?"1":"2");return(<div key={s} style={{display:"flex",flexDirection:"column",alignItems:"center",gap:1}}><button onClick={()=>updateCfg("scanInterval",s)} style={{...btn(s<=5?"#ef4444":s<=10?"#f59e0b":"#8b5cf6",cfg.scanInterval===s),padding:"4px 8px",fontSize:9,minWidth:32}}>{s<60?`${s}s`:s===60?"1m":s===120?"2m":"5m"}</button><span style={{fontSize:7,color:"#1e3a4a"}}>${cd}/日</span></div>);})}
            </div>
          </Row>
          {cfg.scanInterval<=10&&<div style={{background:"rgba(239,68,68,0.07)",border:"1px solid rgba(239,68,68,0.15)",borderRadius:7,padding:"8px 12px",fontSize:10,color:"#fca5a5"}}>⚠ {cfg.scanInterval}秒費用較高，建議開啟智能觸發省 ~85%</div>}
          <Row label="智能觸發" sub={cfg.smartTrigger?`價格變動 >${cfg.smartTriggerPct}% 才掃描`:"關閉：固定間隔掃描"}><Toggle val={cfg.smartTrigger} onChange={v=>updateCfg("smartTrigger",v)} onLabel="開啟" offLabel="關閉"/></Row>
          {cfg.smartTrigger&&<Row label="觸發閾值"><div style={{display:"flex",gap:6}}>{[1,2,3,5,10].map(p=>(<button key={p} onClick={()=>updateCfg("smartTriggerPct",p)} style={{...btn("#8b5cf6",cfg.smartTriggerPct===p),padding:"5px 9px",fontSize:10}}>{p}%</button>))}</div></Row>}
          <Row label="自動學習頻率" sub={`每 ${cfg.autoLearnEvery} 筆平倉學習`}><div style={{display:"flex",gap:6}}>{[2,3,5,10].map(n=>(<button key={n} onClick={()=>updateCfg("autoLearnEvery",n)} style={{...btn("#8b5cf6",cfg.autoLearnEvery===n),padding:"5px 9px",fontSize:10}}>{n}筆</button>))}</div></Row>
        </Section>
      </div>
      <div style={{...card,padding:14,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
        <div style={{fontSize:10,color:"#334155"}}>重置所有設定至預設值</div>
        <button onClick={()=>{if(window.confirm("確認重置？"))updateCfg("__reset__",true);}} style={{...btn("#ef4444",true),padding:"6px 16px",fontSize:10}}>🔄 重置設定</button>
      </div>
    </div>
  );
}

// ─── Main App ─────────────────────────────────────────────────────────────────
export default function App() {
  const [apiKey,setApiKey]=useState(()=>{try{return sessionStorage.getItem("pm_key")||"";}catch{return "";}});
  const [markets,setMarkets]=useState([]);
  const [marketsLoading,setMarketsLoading]=useState(true);
  const [marketsError,setMarketsError]=useState(null);
  const [lastFetchTime,setLastFetchTime]=useState(null);
  const [balance,setBalance]=useState(STARTING_BALANCE);
  const [portfolio,setPortfolio]=useState([]);
  const [closedTrades,setClosedTrades]=useState([]);
  const [trades,setTrades]=useState([]);
  const [analyzing,setAnalyzing]=useState(null);
  const [reassessing,setReassessing]=useState(false);
  const [lastTrades,setLastTrades]=useState({});
  const [strategyNotes,setStrategyNotes]=useState({});
  const [priceHistory,setPriceHistory]=useState({});
  const [tab,setTab]=useState("markets");
  const [autoRunning,setAutoRunning]=useState(false);
  const [autoCycle,setAutoCycle]=useState(false);
  const [cycleInterval,setCycleInterval]=useState(60);
  const [botLog,setBotLog]=useState([]);
  const [currentStrategy,setCurrentStrategy]=useState("基礎策略：評估市場定價偏差，分析成交量趨勢，以RSI與動量指標輔助判斷，優先選擇高確定性機會。");
  const [strategyVersions,setStrategyVersions]=useState([]);
  const [autoLearning,setAutoLearning]=useState(false);
  const [searchQuery,setSearchQuery]=useState("");
  const [filterCategory,setFilterCategory]=useState("全部");
  const [sortBy,setSortBy]=useState("volume24hr");

  const [cfg,setCfg]=useState({
    takeProfit:20,stopLoss:15,maxDrawdown:30,maxHoldMin:5,
    amountMode:"fixed",fixedAmount:200,percentAmount:5,minAmount:50,maxAmount:500,maxOpenPositions:5,
    enabledCategories:["Economics","Crypto","Politics","AI","Science","Finance","Sports"],
    minVolume:50000,minConfidence:0.55,autoLearnEvery:3,
    scanInterval:60,smartTrigger:false,smartTriggerPct:3,
  });

  const cfgRef=useRef(cfg); cfgRef.current=cfg;
  const portfolioRef=useRef([]); portfolioRef.current=portfolio;
  const marketsRef=useRef([]); marketsRef.current=markets;
  const autoCycleRef=useRef(false);
  const autoLearnRef=useRef(false);
  const prevPricesRef=useRef({});
  const logEndRef=useRef(null);
  const tradesRef=useRef([]); tradesRef.current=trades;
  const closedTradesRef=useRef([]); closedTradesRef.current=closedTrades;
  const currentStrategyRef=useRef(currentStrategy); currentStrategyRef.current=currentStrategy;
  const strategyVersionsRef=useRef([]); strategyVersionsRef.current=strategyVersions;

  const updateCfg=(key,val)=>{
    if(key==="__reset__"){setCfg({takeProfit:20,stopLoss:15,maxDrawdown:30,maxHoldMin:5,amountMode:"fixed",fixedAmount:200,percentAmount:5,minAmount:50,maxAmount:500,maxOpenPositions:5,enabledCategories:["Economics","Crypto","Politics","AI","Science","Finance","Sports"],minVolume:50000,minConfidence:0.55,autoLearnEvery:3,scanInterval:60,smartTrigger:false,smartTriggerPct:3});setCycleInterval(60);return;}
    setCfg(prev=>({...prev,[key]:val}));
    if(key==="scanInterval")setCycleInterval(val);
  };
  const toggleCategory=cat=>setCfg(prev=>({...prev,enabledCategories:prev.enabledCategories.includes(cat)?prev.enabledCategories.filter(c=>c!==cat):[...prev.enabledCategories,cat]}));

  const addLog=useCallback(msg=>setBotLog(prev=>[...prev,{msg,time:new Date().toLocaleTimeString("zh-TW"),id:Date.now()+Math.random()}]),[]);

  // Load real markets
  const loadMarkets=useCallback(async(silent=false)=>{
    if(!silent)setMarketsLoading(true);
    setMarketsError(null);
    try{
      const fetched=await fetchPolymarkets(24);
      if(fetched.length===0)throw new Error("無法取得市場數據");
      setMarkets(fetched);
      const now=Date.now();
      setPriceHistory(prev=>{const next={...prev};fetched.forEach(m=>{const hist=prev[m.id]||[];next[m.id]=[...hist.slice(-59),{t:now,yes:m.yesPrice,vol:m.volume24hr||0}];});return next;});
      setLastFetchTime(new Date());
      if(!silent)addLog(`🌐 載入 ${fetched.length} 個真實市場 · Polymarket`);
    }catch(e){setMarketsError(e.message);if(!silent)addLog(`❌ 市場載入失敗: ${e.message}`);}
    setMarketsLoading(false);
  },[addLog]);

  useEffect(()=>{loadMarkets();},[]);
  useEffect(()=>{const iv=setInterval(()=>loadMarkets(true),30000);return()=>clearInterval(iv);},[loadMarkets]);
  useEffect(()=>{logEndRef.current?.scrollIntoView({behavior:"smooth"});},[botLog]);

  // Sell logic
  const sellPosition=useCallback((trade,reason,currentPrice)=>{
    const proceeds=trade.shares*currentPrice;
    const realPnl=proceeds-trade.amount;
    setBalance(b=>b+proceeds);
    setPortfolio(prev=>prev.filter(t=>t.id!==trade.id));
    setClosedTrades(prev=>[{...trade,sellPrice:currentPrice,sellReason:reason,realPnl,closedAt:new Date().toLocaleTimeString("zh-TW")},...prev]);
    addLog(`${realPnl>=0?"💰":"🔴"} ${reason}: ${trade.marketTitle?.substring(0,22)} ${realPnl>=0?"+":""}${fmt(realPnl)}`);
  },[addLog]);

  // Rule-based sell check
  useEffect(()=>{
    if(!apiKey)return;
    const iv=setInterval(()=>{
      const mks=marketsRef.current,c=cfgRef.current;
      portfolioRef.current.forEach(t=>{
        const m=mks.find(mk=>mk.id===t.marketId);if(!m)return;
        const currPrice=t.action==="BUY_YES"?m.yesPrice:m.noPrice;
        const pnlPct=(currPrice-t.price)/t.price;
        const age=Date.now()-t.id;
        if(pnlPct>=c.takeProfit/100){sellPosition(t,"止盈 TP",currPrice);return;}
        if(pnlPct<=-c.stopLoss/100){sellPosition(t,"止損 SL",currPrice);return;}
        if(age>=c.maxHoldMin*60000){sellPosition(t,"到期 EXP",currPrice);}
      });
    },5000);
    return()=>clearInterval(iv);
  },[apiKey,sellPosition]);

  // AI reassess
  const reassessPositions=useCallback(async()=>{
    if(reassessing||!portfolioRef.current.length)return;
    setReassessing(true);
    const mks=marketsRef.current;
    for(const t of portfolioRef.current){
      const m=mks.find(mk=>mk.id===t.marketId);if(!m)continue;
      const currPrice=t.action==="BUY_YES"?m.yesPrice:m.noPrice;
      const pnlPct=(currPrice-t.price)/t.price;
      try{
        const raw=await callClaude(apiKey,`你是Polymarket交易機器人。當前持倉評估。只回傳合法JSON：{"action":"HOLD"|"SELL","reasoning":"繁體中文"}`,`持倉:${t.action} ${m.title.substring(0,40)} 成本:${pct(t.price)} 現價:${pct(currPrice)} 損益:${pnlPct>=0?"+":""}${pctE(pnlPct)}`);
        const d=parseJ(raw);
        if(d?.action==="SELL"){sellPosition(t,"AI建議賣出",currPrice);}
        else addLog(`   ⏸ 持有 ${m.title.substring(0,20)}… — ${d?.reasoning||""}`);
      }catch{}
      await new Promise(r=>setTimeout(r,500));
    }
    setReassessing(false);
  },[apiKey,addLog,sellPosition]);

  useEffect(()=>{if(!apiKey)return;const iv=setInterval(()=>{if(portfolioRef.current.length)reassessPositions();},30000);return()=>clearInterval(iv);},[apiKey,reassessPositions]);

  // Strategy auto-learn
  const handleStrategyUpdate=useCallback(review=>{
    const closed=closedTradesRef.current,allTrades=tradesRef.current;
    const wins=closed.filter(t=>t.realPnl>0).length;
    setStrategyVersions(prev=>[...prev,{summary:currentStrategyRef.current.substring(0,100),winRate:closed.length?wins/closed.length:0,tradeCount:allTrades.length,avgConf:allTrades.reduce((s,t)=>s+(t.confidence||0),0)/(allTrades.length||1)}]);
    if(review.newStrategy){setCurrentStrategy(review.newStrategy);addLog(`🧠 策略進化 → v${strategyVersionsRef.current.length+2}`);}
  },[addLog]);

  const runAutoLearn=useCallback(async()=>{
    if(autoLearnRef.current)return;
    const closed=closedTradesRef.current,allTrades=tradesRef.current,strat=currentStrategyRef.current,svLen=strategyVersionsRef.current.length;
    if(allTrades.length<2)return;
    autoLearnRef.current=true;setAutoLearning(true);
    addLog(`🧠 自動策略學習（已平倉${closed.length}筆）...`);
    const wins=closed.filter(t=>t.realPnl>0).length,winRate=closed.length?wins/closed.length:0;
    const summary=closed.slice(-10).map(t=>`[${t.action}] ${(t.marketTitle||"").substring(0,22)} | ${t.realPnl>=0?"+":""}${t.realPnl.toFixed(0)} | ${t.sellReason||""}`).join("\n");
    try{
      const raw=await callClaude(apiKey,`你是預測市場AI策略分析師。只回傳合法JSON。`,`策略:"${strat}"\n勝率:${pctE(winRate)}\n交易:${allTrades.length}\n\n近期:\n${summary}\n\nJSON:{"mistakes":["..."],"improvements":["..."],"newStrategy":"繁體中文50字內","categoryInsights":{},"version":${svLen+2}}`,1200);
      const result=parseJ(raw);
      if(result){handleStrategyUpdate(result);addLog(`✅ 策略自動進化 v${svLen+2}`);(result.improvements||[]).slice(0,2).forEach(imp=>addLog(`   💡 ${imp}`));}
      else addLog("⚠ 自動學習解析失敗");
    }catch(e){addLog(`❌ 自動學習失敗: ${e.message}`);}
    autoLearnRef.current=false;setAutoLearning(false);
  },[apiKey,addLog,handleStrategyUpdate]);

  useEffect(()=>{if(!apiKey)return;if(closedTrades.length>0&&closedTrades.length%(cfgRef.current.autoLearnEvery||3)===0)runAutoLearn();},[closedTrades.length]);

  // Max drawdown halt
  const totalPnl=closedTrades.reduce((s,t)=>s+t.realPnl,0)+portfolio.reduce((s,t)=>{const m=markets.find(mk=>mk.id===t.marketId);if(!m)return s;return s+(t.shares*(t.action==="BUY_YES"?m.yesPrice:m.noPrice)-t.amount);},0);
  useEffect(()=>{
    if(!autoCycle)return;
    const dd=(STARTING_BALANCE-(balance+totalPnl))/STARTING_BALANCE*100;
    if(dd>=cfgRef.current.maxDrawdown){setAutoCycle(false);autoCycleRef.current=false;addLog(`🚨 最大回撤${dd.toFixed(1)}%！自動停止`);}
  },[balance,totalPnl,autoCycle]);

  // Analyze single market
  const analyzeMarket=useCallback(async(market)=>{
    const c=cfgRef.current;
    if(!c.enabledCategories.includes(market.category)){addLog(`⏭ 跳過 [${market.category}]`);return;}
    if(market.volume<c.minVolume){addLog(`⏭ 成交量不足 ${fmt(market.volume)}`);return;}
    if(portfolioRef.current.length>=c.maxOpenPositions){addLog(`⏭ 持倉數已達上限 ${c.maxOpenPositions}`);return;}
    setAnalyzing(market.id);addLog(`🔍 ${market.title.substring(0,36)}...`);
    const tradeAmt=c.amountMode==="percent"?Math.floor(balance*c.percentAmount/100):c.fixedAmount;
    const clampedAmt=Math.max(c.minAmount,Math.min(c.maxAmount,tradeAmt));
    try{
      const raw=await callClaude(apiKey,`你是Polymarket AI交易機器人。\n當前策略:"${currentStrategyRef.current}"\n只回傳合法JSON：{"action":"BUY_YES"|"BUY_NO"|"HOLD","confidence":0-1,"amount":${c.minAmount}-${c.maxAmount},"reasoning":"繁體中文1-2句","edge":"繁體中文","strategyNote":"策略說明"}`,`市場:"${market.title}" 類別:${market.category} YES:${pct(market.yesPrice)} NO:${pct(market.noPrice)} 成交量:${fmt(market.volume)} 餘額:$${balance.toFixed(0)} 建議金額:$${clampedAmt}`);
      const d=parseJ(raw);
      if(!d){addLog("⚠ 解析失敗");setAnalyzing(null);return;}
      setLastTrades(prev=>({...prev,[market.id]:d}));
      if(d.strategyNote)setStrategyNotes(prev=>({...prev,[market.id]:d.strategyNote}));
      if(d.confidence<c.minConfidence){addLog(`⏸ 信心不足 ${pct(d.confidence)} < ${pct(c.minConfidence)}`);setAnalyzing(null);return;}
      if(d.action!=="HOLD"&&clampedAmt>0&&balance>=clampedAmt){
        const isYes=d.action==="BUY_YES";
        const price=isYes?market.yesPrice:market.noPrice;
        const finalAmt=c.amountMode==="percent"?clampedAmt:Math.min(d.amount||clampedAmt,c.maxAmount);
        const shares=finalAmt/price;
        const trade={id:Date.now(),marketId:market.id,marketTitle:market.title,action:d.action,amount:finalAmt,price,shares,reasoning:d.reasoning,confidence:d.confidence,time:new Date().toLocaleTimeString("zh-TW")};
        setBalance(b=>b-finalAmt);setTrades(prev=>[trade,...prev]);setPortfolio(prev=>[...prev,trade]);
        addLog(`✅ ${isYes?"▲":"▼"} ${market.title.substring(0,24)} $${finalAmt} @ ${pct(price)} 信心:${pct(d.confidence)}`);
        addLog(`   📝 ${d.reasoning}`);
        setTimeout(()=>reassessPositions(),1500);
      }else{addLog(`⏸ 觀望 — ${d.reasoning}`);}
    }catch(e){addLog(`❌ ${e.message}`);}
    setAnalyzing(null);
  },[apiKey,balance,addLog,reassessPositions]);

  // Scan + auto-cycle
  const runOneScan=useCallback(async(triggeredMarkets=null)=>{
    setAutoRunning(true);
    const mks=triggeredMarkets||marketsRef.current;
    for(const m of mks){
      if(!autoCycleRef.current&&!autoRunning)break;
      const bal=await new Promise(r=>{setBalance(b=>{r(b);return b;});});
      if(bal<50){addLog("💸 餘額不足");break;}
      await analyzeMarket(m);
      await new Promise(r=>setTimeout(r,600));
    }
    setAutoRunning(false);
  },[analyzeMarket,addLog]);

  const runAutoBot=async()=>{if(autoRunning)return;addLog("🚀 單次掃描...");await runOneScan();addLog("✅ 掃描完成");};

  const toggleAutoCycle=useCallback(()=>{
    setAutoCycle(prev=>{const next=!prev;autoCycleRef.current=next;const c=cfgRef.current;if(next)addLog(`🔁 循環開啟 · ${c.scanInterval}秒${c.smartTrigger?` · 智能觸發>${c.smartTriggerPct}%`:""}`);else addLog("⏹ 循環停止");return next;});
  },[addLog]);

  useEffect(()=>{
    if(!autoCycle||!apiKey)return;
    let cancelled=false;
    const loop=async()=>{
      while(autoCycleRef.current&&!cancelled){
        const c=cfgRef.current;
        if(c.smartTrigger){
          const mks=marketsRef.current;
          const changed=mks.filter(m=>{const prev=prevPricesRef.current[m.id];if(!prev)return true;return Math.abs(m.yesPrice-prev)/prev*100>=c.smartTriggerPct;});
          if(changed.length>0){addLog(`⚡ 智能觸發 ${changed.length}個市場`);changed.forEach(m=>{prevPricesRef.current[m.id]=m.yesPrice;});await runOneScan(changed);}
          mks.forEach(m=>{if(!prevPricesRef.current[m.id])prevPricesRef.current[m.id]=m.yesPrice;});
        }else{addLog(`🔁 定時掃描 (${c.scanInterval}s)`);await runOneScan();}
        if(!autoCycleRef.current)break;
        await new Promise(r=>setTimeout(r,cfgRef.current.scanInterval*1000));
      }
    };
    loop();
    return()=>{cancelled=true;};
  },[autoCycle]);

  const manualSell=t=>{const m=markets.find(mk=>mk.id===t.marketId);const p=m?(t.action==="BUY_YES"?m.yesPrice:m.noPrice):t.price;sellPosition(t,"手動賣出",p);};
  const logout=()=>{try{sessionStorage.removeItem("pm_key");}catch{}setApiKey("");};

  if(!apiKey)return <ApiKeyScreen onSubmit={setApiKey}/>;

  // Filtered markets
  const filteredMarkets=markets.filter(m=>filterCategory==="全部"||m.category===filterCategory).filter(m=>!searchQuery||m.title.toLowerCase().includes(searchQuery.toLowerCase())).sort((a,b)=>{if(sortBy==="volume24hr")return(b.volume24hr||0)-(a.volume24hr||0);if(sortBy==="yesPrice")return b.yesPrice-a.yesPrice;if(sortBy==="noPrice")return b.noPrice-a.noPrice;return(b.trending?1:0)-(a.trending?1:0);});

  return (
    <div style={{minHeight:"100vh",background:"#07090f",fontFamily:"'JetBrains Mono',monospace"}}>
      <style>{CSS}</style>

      {/* Header */}
      <div style={{background:"rgba(0,0,0,0.6)",borderBottom:"1px solid rgba(255,255,255,0.05)",padding:"0 24px",position:"sticky",top:0,zIndex:100,backdropFilter:"blur(16px)"}}>
        <div style={{display:"flex",alignItems:"center",gap:16,height:52}}>
          <div style={{display:"flex",alignItems:"center",gap:10}}>
            <div style={{width:8,height:8,borderRadius:"50%",background:autoCycle?"#10b981":autoRunning?"#f59e0b":"#1e3a4a",boxShadow:autoCycle?"0 0 10px #10b981":autoRunning?"0 0 10px #f59e0b":"none",animation:autoCycle?"glow 2s infinite":autoRunning?"pulse 1s infinite":"none",flexShrink:0}}/>
            <div>
              <div style={{display:"flex",alignItems:"center",gap:8}}>
                <span style={{fontSize:13,fontWeight:800,color:"#00e5ff",letterSpacing:2}}>POLYMARKET BOT</span>
                <span style={{fontSize:8,color:"#1e3a4a",letterSpacing:3}}>V3</span>
                {autoCycle&&<span style={{fontSize:9,color:"#10b981",background:"rgba(16,185,129,0.1)",border:"1px solid rgba(16,185,129,0.2)",borderRadius:4,padding:"2px 6px"}}>🔁 {cfg.scanInterval}s</span>}
              </div>
            </div>
          </div>
          <div style={{marginLeft:"auto",display:"flex",gap:16,alignItems:"center"}}>
            {[{l:"餘額",v:fmt(balance),c:"#00e5ff"},{l:"損益",v:`${totalPnl>=0?"+":""}${fmt(totalPnl)}`,c:totalPnl>=0?"#10b981":"#ef4444"},{l:"倉/已平",v:`${portfolio.length}/${closedTrades.length}`,c:"#f59e0b"},{l:"策略",v:`v${strategyVersions.length+1}`,c:"#8b5cf6"}].map(({l,v,c})=>(
              <div key={l} style={{textAlign:"right"}}>
                <div style={{fontSize:9,color:"#334155",letterSpacing:1}}>{l}</div>
                <div style={{fontSize:13,fontWeight:800,color:c}}>{v}</div>
              </div>
            ))}
            <div style={{width:"1px",height:24,background:"rgba(255,255,255,0.05)"}}/>
            <button onClick={logout} style={{...btn("#ef4444",true),padding:"5px 10px",fontSize:9}}>登出</button>
          </div>
        </div>

        {/* Tabs */}
        <div style={{display:"flex",gap:0,borderTop:"1px solid rgba(255,255,255,0.04)"}}>
          {TABS.map(t=><button key={t} onClick={()=>setTab(t)} style={{padding:"10px 16px",background:"none",border:"none",borderBottom:tab===t?"2px solid #00e5ff":"2px solid transparent",color:tab===t?"#00e5ff":"#334155",fontSize:10,fontWeight:700,cursor:"pointer",letterSpacing:0.5,fontFamily:"inherit",transition:"color 0.2s",whiteSpace:"nowrap"}}>{TAB_LABELS[t]}</button>)}
          <div style={{marginLeft:"auto",display:"flex",gap:6,alignItems:"center",paddingRight:0}}>
            <select value={cfg.scanInterval} onChange={e=>updateCfg("scanInterval",Number(e.target.value))} disabled={autoCycle} style={{background:"rgba(0,0,0,0.4)",border:"1px solid rgba(255,255,255,0.08)",borderRadius:5,padding:"5px 8px",color:"#64748b",fontSize:9,fontFamily:"inherit",cursor:autoCycle?"not-allowed":"pointer"}}>
              {[1,5,10,30,60,120,300].map(s=><option key={s} value={s}>{s<60?`${s}秒`:s===60?"1分":s===120?"2分":"5分"}</option>)}
            </select>
            <button onClick={toggleAutoCycle} style={{...btn(autoCycle?"#ef4444":"#10b981",true),padding:"5px 12px",fontSize:9,minWidth:88}}>{autoCycle?"⏹ 停止循環":"🔁 自動循環"}</button>
            <button onClick={runAutoBot} disabled={autoRunning||!!analyzing||autoCycle} style={{...btn("#00e5ff",!autoRunning&&!analyzing&&!autoCycle),padding:"5px 12px",fontSize:9}}>{autoRunning?"⏳":"▶ 掃描"}</button>
          </div>
        </div>
      </div>

      {/* Content */}
      <div style={{padding:20,overflowY:"auto",maxHeight:"calc(100vh - 108px)"}}>

        {/* Markets Tab */}
        {tab==="markets"&&<div style={{display:"flex",flexDirection:"column",gap:16,animation:"fadeIn 0.3s ease"}}>
          {/* Open positions */}
          {portfolio.length>0&&<div>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
              <div style={{fontSize:9,color:"#475569",letterSpacing:2,textTransform:"uppercase"}}>📂 開倉持倉 ({portfolio.length})</div>
              <button onClick={()=>{const m=markets.find(mk=>mk.id===portfolio[0]?.marketId);if(m)reassessPositions();}} disabled={reassessing||!portfolio.length} style={{...btn("#8b5cf6",!reassessing),padding:"4px 10px",fontSize:9}}>{reassessing?"🔄 評估中...":"🔄 AI重評"}</button>
            </div>
            <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(280px,1fr))",gap:10,marginBottom:16}}>
              {portfolio.map(t=>{
                const m=markets.find(mk=>mk.id===t.marketId);
                const curr=m?(t.action==="BUY_YES"?m.yesPrice:m.noPrice):t.price;
                const pnl=t.shares*curr-t.amount,pnlP=pnl/t.amount;
                return(<div key={t.id} style={{...card,padding:14,borderLeft:`3px solid ${pnl>=0?"#10b981":"#ef4444"}`}}>
                  <div style={{fontSize:10,color:"#b0bec5",fontWeight:600,marginBottom:6,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{t.marketTitle}</div>
                  <div style={{display:"flex",justifyContent:"space-between",fontSize:11,marginBottom:8}}>
                    <span style={{color:t.action==="BUY_YES"?"#10b981":"#ef4444",fontWeight:700}}>{t.action==="BUY_YES"?"▲":"▼"} {t.action==="BUY_YES"?"買漲":"買跌"}</span>
                    <span style={{color:"#f59e0b"}}>${t.amount} @ {pct(t.price)}</span>
                    <span style={{color:pnl>=0?"#10b981":"#ef4444",fontWeight:700}}>{pnl>=0?"+":""}{fmt(pnl)} ({pnlP>=0?"+":""}{pctE(pnlP)})</span>
                  </div>
                  <div style={{marginBottom:8}}><div style={{height:3,borderRadius:2,background:"#1e293b"}}><div style={{height:"100%",width:`${Math.min(100,Math.max(0,(pnlP+cfg.stopLoss/100)/(cfg.takeProfit/100+cfg.stopLoss/100)*100))}%`,background:pnl>=0?"#10b981":"#ef4444",borderRadius:2,transition:"width 0.5s"}}/></div><div style={{display:"flex",justifyContent:"space-between",fontSize:9,color:"#334155",marginTop:2}}><span>止損 -{cfg.stopLoss}%</span><span>止盈 +{cfg.takeProfit}%</span></div></div>
                  <button onClick={()=>manualSell(t)} style={{...btn("#ef4444",true),width:"100%",padding:"6px 0",fontSize:9}}>💰 手動賣出</button>
                </div>);
              })}
            </div>
          </div>}

          {/* Search/filter bar */}
          <div style={{display:"flex",flexDirection:"column",gap:8}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <div style={{display:"flex",alignItems:"center",gap:8}}>
                <span style={{fontSize:9,color:"#475569",letterSpacing:2,textTransform:"uppercase"}}>📊 真實市場</span>
                {lastFetchTime&&<span style={{fontSize:9,color:"#1e3a4a"}}>· {lastFetchTime.toLocaleTimeString("zh-TW")}</span>}
                <span style={{display:"inline-flex",alignItems:"center",gap:3,fontSize:8,background:"rgba(16,185,129,0.1)",border:"1px solid rgba(16,185,129,0.18)",borderRadius:4,padding:"2px 6px",color:"#10b981"}}><span style={{width:4,height:4,borderRadius:"50%",background:"#10b981",display:"inline-block",animation:"blink 2s infinite"}}/>LIVE</span>
              </div>
              <button onClick={()=>loadMarkets(false)} disabled={marketsLoading} style={{...btn("#00e5ff",!marketsLoading),padding:"4px 10px",fontSize:9}}>{marketsLoading?"⏳":"🔄 刷新"}</button>
            </div>
            <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
              <input value={searchQuery} onChange={e=>setSearchQuery(e.target.value)} placeholder="🔍 搜尋市場..." style={{...inp,flex:1,minWidth:160,padding:"6px 12px",fontSize:10}}/>
              <select value={filterCategory} onChange={e=>setFilterCategory(e.target.value)} style={{background:"rgba(0,0,0,0.4)",border:"1px solid rgba(255,255,255,0.08)",borderRadius:6,padding:"6px 10px",color:"#64748b",fontSize:10,fontFamily:"inherit"}}>
                {["全部","Economics","Crypto","Politics","AI","Sports","Finance","Science","其他"].map(c=><option key={c} value={c}>{c==="全部"?"全部類別":c}</option>)}
              </select>
              <select value={sortBy} onChange={e=>setSortBy(e.target.value)} style={{background:"rgba(0,0,0,0.4)",border:"1px solid rgba(255,255,255,0.08)",borderRadius:6,padding:"6px 10px",color:"#64748b",fontSize:10,fontFamily:"inherit"}}>
                <option value="volume24hr">24h 成交量</option>
                <option value="yesPrice">YES 價格</option>
                <option value="noPrice">NO 價格</option>
                <option value="trending">熱門</option>
              </select>
            </div>
          </div>

          {marketsError&&<div style={{background:"rgba(239,68,68,0.08)",border:"1px solid rgba(239,68,68,0.2)",borderRadius:8,padding:"10px 14px",fontSize:11,color:"#fca5a5"}}>⚠ {marketsError} — <span style={{cursor:"pointer",textDecoration:"underline"}} onClick={()=>loadMarkets()}>重試</span></div>}

          {marketsLoading&&markets.length===0?(
            <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(300px,1fr))",gap:14}}>
              {Array.from({length:6}).map((_,i)=><div key={i} style={{...card,padding:16,height:320,opacity:0.3,animation:"pulse 2s infinite"}}><div style={{height:10,background:"#1e293b",borderRadius:4,marginBottom:10,width:"35%"}}/><div style={{height:14,background:"#1e293b",borderRadius:4,marginBottom:6}}/><div style={{height:14,background:"#1e293b",borderRadius:4,marginBottom:14,width:"70%"}}/><div style={{height:5,background:"#1e293b",borderRadius:3,marginBottom:10}}/><div style={{height:52,background:"#1e293b",borderRadius:8,marginBottom:10}}/><div style={{height:50,background:"#1e293b",borderRadius:8}}/></div>)}
            </div>
          ):(
            <>
              <div style={{fontSize:9,color:"#334155"}}>顯示 {filteredMarkets.length} / {markets.length}</div>
              <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(300px,1fr))",gap:14}}>
                {filteredMarkets.map(m=><MarketCard key={m.id} market={m} onAnalyze={analyzeMarket} analyzing={analyzing} lastTrade={lastTrades[m.id]} strategyNote={strategyNotes[m.id]} priceHist={priceHistory[m.id]}/>)}
              </div>
            </>
          )}
        </div>}

        {tab==="analytics"&&<AnalyticsPanel trades={trades} portfolio={portfolio} closedTrades={closedTrades} markets={markets} strategyVersions={strategyVersions}/>}
        {tab==="backtest"&&<BacktestPanel markets={markets} priceHistory={priceHistory} addLog={addLog}/>}
        {tab==="wallets"&&<WalletPanel addLog={addLog}/>}
        {tab==="learning"&&<LearningPanel apiKey={apiKey} trades={trades} portfolio={portfolio} closedTrades={closedTrades} markets={markets} strategyVersions={strategyVersions} currentStrategy={currentStrategy} onStrategyUpdate={handleStrategyUpdate} addLog={addLog} autoLearning={autoLearning}/>}
        {tab==="settings"&&<SettingsPanel cfg={cfg} updateCfg={updateCfg} toggleCategory={toggleCategory} balance={balance} trades={trades} closedTrades={closedTrades}/>}

        {tab==="log"&&(
          <div style={{animation:"fadeIn 0.3s ease"}}>
            <div style={{...cardGlow("0,229,255"),padding:"16px 20px",height:"calc(100vh - 160px)",overflowY:"auto"}}>
              {botLog.length===0?
                <span style={{color:"#1e293b",fontSize:12}}><span style={{color:"#00e5ff"}}>$</span> 系統就緒<span style={{animation:"blink 1s infinite",display:"inline-block",marginLeft:2}}>▌</span></span>
                :botLog.map(e=><div key={e.id} style={{marginBottom:4,animation:"fadeIn 0.2s ease"}}><span style={{color:"#1e3a4a"}}>[{e.time}]</span><span style={{fontSize:11,color:"#64748b",marginLeft:8,lineHeight:1.8}}>{e.msg}</span></div>)
              }
              <div ref={logEndRef}/>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
