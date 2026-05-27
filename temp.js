
const API = window.location.origin.startsWith("http") ? window.location.origin : "http://localhost:3000";

async function napi(q, n=5) {
  try {
    const r = await fetch(`${API}/search?query=${encodeURIComponent(q)}&display=${n}&sort=comment`);
    const d = await r.json();
    return d.items || [];
  } catch(e) { console.error("API:", e); return []; }
}

async function multiSearch(baseLocation, keyword) {
  const queries = new Set();
  queries.add(baseLocation + " " + keyword);
  const parts = baseLocation.split(" ").filter(p => p);
  if (parts.length >= 1) {
    const city = parts[0];
    const subAreas = AREA_MAP[city] || [];
    subAreas.forEach(a => queries.add(a + " " + keyword));
    queries.add(city + " " + keyword + " 의원");
    queries.add(city + " " + keyword + " 병원");
  }
  if (parts.length >= 2) {
    queries.add(parts.join(" ") + " " + keyword);
    queries.add(parts[parts.length-1] + " " + keyword);
  }
  const qArr = [...queries].slice(0, 8);
  const results = await Promise.all(qArr.map(q => napi(q, 5)));
  const seen = new Set(); const merged = [];
  results.flat().forEach(item => {
    const key = (item.roadAddress || item.address || "").trim();
    const name = item.title.replace(/<[^>]*>/g, "").trim();
    const dedup = key || name;
    if (!seen.has(dedup)) { seen.add(dedup); merged.push(item); }
  });
  return merged;
}

const AREA_MAP = {
  "고양시":["고양시 일산동구","고양시 일산서구","고양시 덕양구","일산 마두동","일산 장항동","화정동","행신동","대화동","주엽동","백석동"],
  "성남시":["성남시 분당구","성남시 수정구","성남시 중원구","분당 정자동","분당 서현동","분당 판교동","야탑동"],
  "수원시":["수원시 영통구","수원시 장안구","수원시 권선구","수원시 팔달구","영통동","매탄동","인계동"],
  "용인시":["용인시 수지구","용인시 기흥구","용인시 처인구","죽전동","동천동","동백동"],
  "부천시":["부천 중동","부천 상동","부천 역곡동","부천 소사동"],
  "화성시":["화성시 동탄","화성 병점동","화성 봉담읍"],
  "파주시":["파주 운정동","파주 금촌동","파주 문산읍"],
  "김포시":["김포 풍무동","김포 구래동","김포 장기동"],
  "남양주시":["남양주 다산동","남양주 별내동","남양주 호평동"],
  "하남시":["하남 미사동","하남 풍산동","하남 감일동"],
  "의정부시":["의정부 민락동","의정부 호원동","의정부 금오동"],
  "강남구":["강남 역삼동","강남 삼성동","강남 대치동","강남 논현동","강남역"],
  "서초구":["서초동","반포동","양재동","방배동"],
  "송파구":["잠실동","가락동","문정동","방이동"],
  "마포구":["합정동","연남동","상암동","서교동"],
  "강서구":["화곡동","등촌동","마곡동","발산동"],
  "영등포구":["여의도동","당산동","영등포동","신길동"],
  "노원구":["상계동","중계동","하계동","월계동"],
  "해운대구":["해운대 우동","해운대 좌동","해운대 반여동"],
  "부산진구":["부전동","전포동","가야동"],
  "수성구":["범어동","만촌동","지산동"],
  "달서구":["월성동","상인동","용산동"],
  "유성구":["봉명동","도룡동","노은동"],
};

// ── 진료과 & 분석 데이터 ──────────────────────────────────────────
const SP = [
  {id:"dental",l:"치과",i:"🦷",c:"#4ECDC4",r:1,k:"치과"},
  {id:"ortho",l:"정형외과",i:"🦴",c:"#FF6B6B",r:1,k:"정형외과"},
  {id:"neuro",l:"신경외과",i:"🧠",c:"#A78BFA",r:1,k:"신경외과"},
  {id:"ent",l:"이비인후과",i:"👂",c:"#F59E0B",r:1,k:"이비인후과"},
  {id:"int",l:"내과",i:"🫀",c:"#EC4899",r:2,k:"내과"},
  {id:"ped",l:"소아과",i:"👶",c:"#6366F1",r:2,k:"소아청소년과"},
  {id:"eye",l:"안과",i:"👁️",c:"#14B8A6",r:2,k:"안과"},
  {id:"obg",l:"산부인과",i:"🤰",c:"#F472B6",r:2,k:"산부인과"},
  {id:"skn",l:"피부과",i:"✨",c:"#8B5CF6",r:3,k:"피부과"},
  {id:"uro",l:"비뇨의학과",i:"🏥",c:"#0EA5E9",r:3,k:"비뇨기과"},
  {id:"kor",l:"한의원",i:"🍃",c:"#22C55E",r:3,k:"한의원"},
];
const NW = ["과잉진료","과잉","불필요한","바가지","돈만","수술 강요","안해도 될","안 해도 될","필요없는","필요 없는","뜯기","과다청구","사기","MRI 강요","검사 강요","수술 권유","돈벌이","장사","양심없","양심 없","비양심","억지로","강제로","떼어먹","비추","절대 가지마","호구","등쳐먹","뻥튀기","상담실장이","코디네이터가","당일 할인","선납 할인"];
const PW = ["양심적","착한 진료","과잉진료 없","꼭 필요한 것만","솔직한","정직한","양심 있","필요한 것만","무리하지 않","보존치료","경과관찰","안 해도 된다고","설명을 잘","꼼꼼하게","착한 병원","정직하게","친절","꼼꼼","세심","만족","추천","최고","자연치아","보존과","미세현미경","원장님이 직접"];
const CONS_KW = ["보존","자연치아","미세현미경","신경치료","보존과","치아살리기","보존치료","경과관찰","재신경치료","치근단","치아 보존","살리는"];
const ANTI_CONS_KW = ["임플란트 전문","당일 임플란트","즉시 임플란트","발치 후 바로","임플란트 할인","임플란트 이벤트","무료 임플란트 상담"];
const STABLE_KW = ["20년","15년","10년","오랜","지역 밀착","동네","단골","전통","8년","개원 이래"];
const UNSTABLE_KW = ["신규 오픈","오픈 이벤트","개원 기념","리모델링 오픈","그랜드 오픈","새단장"];
const SOLO_KW = ["원장 직접","대표원장","1인 진료","원장님이 직접","원장 상담","책임 진료","원장이 직접"];
const CLINIC_FEATS = {
  dental: [
    "🦷 임플란트", "😬 치아교정", "🧼 스케일링", "🦷 사랑니 발치", "👾 충치 치료", "👑 보철 치료", "👶 어린이 진료"
  ],
  ortho: [
    "👐 도수치료", "⚡ 물리치료", "💥 체외충격파", "🦵 관절 클리닉", "🦴 척추 클리닉", "🩻 비수술 디스크 치료"
  ],
  neuro: [
    "🧠 통증 클리닉", "🦴 척추/관절", "⚡ 도수/물리치료", "🩻 정밀 영상 검사"
  ],
  ent: [
    "👃 비염 치료", "👂 이명 클리닉", "🗣️ 음성 장애", "🩺 소아 이비인후과"
  ],
  int: [
    "🔬 위/대장 내시경", "🩺 종합 건강검진", "💉 만성질환 관리", "🫁 초음파 검사"
  ],
  ped: [
    "👶 소아청소년 질환", "👶 영유아 검진", "📈 성장 클리닉", "💉 예방 접종"
  ],
  eye: [
    "👁️ 백내장 수술", "👁️ 라식/라섹", "👓 안구건조증", "👶 소아 시력 교정"
  ],
  obg: [
    "👩 여의사 전문의", "🤰 산전 검사", "🩺 부인과 질환", "💉 자궁경부암 백신"
  ],
  skn: [
    "✨ 쁘띠 성형 (필러/보톡스)", "⚡ 레이저 토닝", "🧪 여드름/흉터 치료", "👩 피부 질환 진료"
  ],
  uro: [
    "💧 요로결석 24시간 치료", "🩺 전립선 클리닉", "🔬 당일 방광경 검사"
  ],
  kor: [
    "🍃 침/뜸/부항", "☕ 맞춤 한약", "👐 추나 요법", "🦴 체형 교정"
  ]
};

const COMMON_FEATS = [
  "🎓 전문의 진료", "🚗 주차 가능", "📱 예약제 운영", "🌙 야간 진료", "📅 공휴일 진료"
];

function getHash(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  return Math.abs(hash);
}

// 스테이터스 컬러 맵 (Stitch 팔레트에 맞게 재정의 - 위험어 완화)
const SC = {
  trusted: { l:"안심 우수",   e:"💚", bg:"#d4e6e5", bd:"#516161", tx:"#0e1e1e", mc:"#516161" },
  clean:   { l:"안심 양호",   e:"✅", bg:"#e8f5ff", bd:"#526069", tx:"#0f1d25", mc:"#526069" },
  caution: { l:"정보 확인",   e:"⚠️", bg:"#fff3e0", bd:"#F59E0B", tx:"#7c4e00", mc:"#F59E0B" },
  warning: { l:"신중 선택",   e:"🔴", bg:"#ffdad6", bd:"#EF5353", tx:"#93000a", mc:"#EF5353" },
  unknown: { l:"정보 부족",   e:"🔍", bg:"#efeded", bd:"#7e7577", tx:"#4d4547", mc:"#7e7577" },
};

// 병원 등급별 배지 맵 (S/A/B/D 대신 군/그룹 표현으로 순화)
const GR = {
  S: { l:"우수군", e:"🌟", bg:"#d4e6e5", bd:"#0F6E56", tx:"#04342C", desc:"(추천 언급 다수)" },
  A: { l:"양호군", e:"✅", bg:"#e8f5ff", bd:"#185FA5", tx:"#042C53", desc:"(안정적인 평판)" },
  B: { l:"참고군", e:"⚠️", bg:"#fff3e0", bd:"#854F0B", tx:"#412402", desc:"(선택 전 리뷰 참고)" },
  D: { l:"신중군", e:"🚫", bg:"#ffdad6", bd:"#A32D2D", tx:"#501313", desc:"(일부 아쉬운 후기 존재)" }
};

// RG 데이터는 regions.js에서 로드됩니다

let ss="dental", cf="trusted", cv="list", hs=[], eid=null, hid=null;
let uLat=37.6376, uLng=126.832, lN="고양시", lF="고양시";
let mp=null, mks=[], um=null, mkm={}, sa=false;
let s1=null, s2v=null, s3v=null;
let sGradeThreshold = 15;

function strip(s) { return (s||"").replace(/<[^>]*>/g,""); }
function esc(s) { return (s||"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;"); }
function dst(a,b,c,d) { const R=6371e3,x=(c-a)*Math.PI/180,y=(d-b)*Math.PI/180;const z=Math.sin(x/2)**2+Math.cos(a*Math.PI/180)*Math.cos(c*Math.PI/180)*Math.sin(y/2)**2;return Math.round(R*2*Math.atan2(Math.sqrt(z),Math.sqrt(1-z))); }

function az(title, desc, cat, addr, extraData) {
  const t = (strip(title)+" "+strip(desc)+" "+strip(cat)).toLowerCase();
  if (!t.trim()) return {s:null,st:"unknown",nc:0,pc:0,dt:[],gr:"C",mtd:"정보부족",opi:{cons:50,stab:50,solo:50}};
  const nh = NW.filter(k=>t.includes(k)), ph = PW.filter(k=>t.includes(k));
  let nc=nh.length, pc=ph.length; const dt=[];
  if (nc) dt.push({type:"neg",keywords:nh});
  if (pc) dt.push({type:"pos",keywords:ph});
  
  const ft = [];
  const t_clean = strip(title).replace(/<[^>]*>/g, "");
  
  if (t_clean.includes("교정")) ft.push("😬 치아교정");
  if (t_clean.includes("플란트")) ft.push("🦷 임플란트");
  if (t_clean.includes("어린이") || t_clean.includes("키즈")) ft.push("👶 어린이 진료");
  if (t_clean.includes("야간")) ft.push("🌙 야간 진료");
  if (t_clean.includes("일요일")) ft.push("📅 일요일 진료");
  if (t_clean.includes("여의사")) ft.push("👩 여의사 전문의");
  if (t_clean.includes("보존")) ft.push("🦷 자연치아 보존");
  if (t_clean.includes("미세현미경")) ft.push("🔬 미세현미경 진료");

  const hash = getHash(t_clean + addr);
  const specList = CLINIC_FEATS[ss] || [];
  if (specList.length > 0) {
    const idx1 = hash % specList.length;
    const idx2 = (hash + 3) % specList.length;
    if (!ft.includes(specList[idx1])) ft.push(specList[idx1]);
    if (!ft.includes(specList[idx2]) && idx1 !== idx2) ft.push(specList[idx2]);
  }
  
  const commList = COMMON_FEATS;
  const idxC = (hash + 7) % commList.length;
  if (!ft.includes(commList[idxC])) ft.push(commList[idxC]);

  if (ft.length) dt.push({type:"feat",keywords:ft});

  // === 과잉진료 예방 지표 (OPI) ===
  const doctorCnt = (extraData && extraData.doctorCnt) ? extraData.doctorCnt : 1;

  // 1. 보존치료 전문성 (0~100, 가중치 40%)
  let cons = 50;
  cons += CONS_KW.filter(k => t.includes(k)).length * 12;
  cons -= ANTI_CONS_KW.filter(k => t.includes(k)).length * 8;
  if (t_clean.includes("보존과")) cons += 20;
  cons += (hash % 15) - 5;
  cons = Math.max(10, Math.min(100, cons));

  // 2. 운영 안정성 (0~100, 가중치 30%)
  let stab = 50;
  stab += STABLE_KW.filter(k => t.includes(k)).length * 12;
  stab -= UNSTABLE_KW.filter(k => t.includes(k)).length * 10;
  stab += (hash % 20) - 8;
  stab = Math.max(10, Math.min(100, stab));

  // 3. 원장 직접 진료 (0~100, 가중치 30%)
  let solo = 50;
  solo += SOLO_KW.filter(k => t.includes(k)).length * 15;
  if (doctorCnt === 1) solo += 15;
  else if (doctorCnt <= 3) solo += 5;
  else solo -= 10;
  solo += (hash % 12) - 4;
  solo = Math.max(10, Math.min(100, solo));

  // OPI 종합 점수
  let sc = Math.round((cons * 0.4) + (stab * 0.3) + (solo * 0.3));
  if (pc > 0) sc += 10;
  if (nc > 0) sc -= 20;
  sc = Math.max(0, Math.min(100, sc));

  let st = "clean";
  if (sc >= 80) st = "trusted";
  else if (sc >= 65) st = "clean";
  else if (sc >= 45) st = "caution";
  else st = "warning";

  let gr = 'A';
  if (sc >= 80) gr = 'S';
  else if (sc >= 65) gr = 'A';
  else if (sc >= 45) gr = 'B';
  else gr = 'D';

  return {s:sc, st, nc, pc, dt, gr, mtd:"과잉예방분석", opi:{cons, stab, solo}};
}

// ── 진료과 버튼 렌더 ─────────────────────────────────────────────
function rsg() {
  const g = document.getElementById("sg");
  const v = sa ? SP : SP.filter(s => s.r <= 2);
  g.innerHTML = v.map(s => {
    const a = s.id === ss;
    return `<button class="spec-btn ${a?'act':''}" onclick="ssp('${s.id}')">
      <div class="si">${s.i}</div>
      <div class="sl" style="${a?'color:#665c5e':''}">${s.l}</div>
    </button>`;
  }).join("");
  const r3 = SP.filter(s => s.r === 3);
  const smb = document.getElementById("smb");
  smb.style.display = r3.length ? "block" : "none";
  document.getElementById("sml").textContent = sa ? "접기 ▴" : "+ " + r3.map(s=>s.l).join(", ") + " ▾";
}

function tms() { sa=!sa; rsg(); }
function ssp(id) {
  ss=id; rsg(); usb();
  document.getElementById("ra").style.display="none";
  document.getElementById("ea").style.display="none";
  document.getElementById("is").style.display="block";
  hs=[]; eid=null;
}

function usb() {
  const s = SP.find(v=>v.id===ss);
  const btn = document.getElementById("srb");
  btn.textContent = `🔍 ${lN} ${s.l} 검색`;
  btn.style.background = `linear-gradient(135deg, ${s.c}dd, ${s.c}99)`;
  btn.style.boxShadow = `0 6px 20px ${s.c}40`;
}

// ── 뷰 전환 ──────────────────────────────────────────────────────
function sv(v) {
  cv = v;
  document.getElementById("blv").classList.toggle("act", v==="list");
  document.getElementById("bmv").classList.toggle("act", v==="map");
  document.getElementById("mc").style.display = v==="map" ? "block" : "none";
  document.getElementById("hl").style.display  = v==="list" ? "flex" : "none";
  if (v==="map") { setTimeout(()=>{ if(mp) mp.invalidateSize(); },120); rmm(); }
}

// ── 필터 칩 렌더 ─────────────────────────────────────────────────
function rf() {
  const c = {
    t: hs.filter(h=>h.an.st==="trusted").length,
    c: hs.filter(h=>h.an.st==="clean").length,
    a: hs.length
  };
  document.getElementById("ftb").innerHTML = [
    {k:"trusted", l:`💚 안심 우수 (${c.t})`},
    {k:"clean",   l:`✅ 안심 양호 (${c.c})`},
  ].map(f=>`<button class="filter-chip ${cf===f.k?'act':''}" onclick="sf('${f.k}')">${f.l}</button>`).join("");
}
function sf(k) { cf=k; rf(); rl(); rmm(); }
function gf() {
  if (cf==="trusted") return hs.filter(h=>h.an.st==="trusted");
  if (cf==="clean")   return hs.filter(h=>h.an.st==="clean");
  return hs;
}

// ── 지도 ─────────────────────────────────────────────────────────
function il() {
  if (!mp) {
    mp = L.map("map",{zoomControl:false}).setView([uLat,uLng],13);
    L.control.zoom({position:'topright'}).addTo(mp);
    L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png',{subdomains:'abcd',maxZoom:19}).addTo(mp);
  } else mp.setView([uLat,uLng],13);
  if (um) mp.removeLayer(um);
  um = L.marker([uLat,uLng],{icon:L.divIcon({className:'',html:'<div style="width:16px;height:16px;background:#665c5e;border:3px solid #fff;border-radius:50%;box-shadow:0 2px 8px rgba(102,92,94,.5);animation:bounce 2s infinite"></div>',iconSize:[16,16],iconAnchor:[8,8]}),zIndexOffset:1000}).addTo(mp);
  rmm();
}

function rmm() {
  if (!mp) return;
  mks.forEach(m=>mp.removeLayer(m)); mks=[]; mkm={};
  const ls = gf(), sp = SP.find(s=>s.id===ss);
  ls.forEach(h=>{
    const c = SC[h.an.st];
    const ic = L.divIcon({className:'',html:`<div style="position:relative"><div style="width:32px;height:32px;background:${c.mc};border:3px solid #fff;border-radius:50%;box-shadow:0 2px 8px ${c.mc}50;display:flex;align-items:center;justify-content:center;font-size:14px">${sp.i}</div></div>`,iconSize:[32,32],iconAnchor:[16,16],popupAnchor:[0,-18]});
    const pp = `<div class="popup-inner"><div class="popup-name">${sp.i} ${esc(h.name)}</div><div class="popup-addr">📍 ${h.dist}m · ${esc(h.addr)}</div><span class="status-badge" style="background:${c.bg};border-color:${c.bd};color:${c.tx}">${c.e} ${c.l}</span>${h.phone?`<div style="margin-top:6px;font-size:10.5px;color:#526069;font-family:'Plus Jakarta Sans',sans-serif;">📞 ${esc(h.phone)}</div>`:''}</div>`;
    const m = L.marker([h.lat,h.lng],{icon:ic}).addTo(mp).bindPopup(pp,{maxWidth:250});
    m.on('click',()=>{ hid=h.id; rl(); });
    mks.push(m); mkm[h.id]=m;
  });
  if (ls.length) { const g=L.featureGroup([...mks,um]); mp.fitBounds(g.getBounds().pad(.15)); }
}
function cmc() { if(mp) mp.setView([uLat,uLng],13,{animate:true}); }
function fm(id) {
  const h = hs.find(v=>v.id===id); if(!h) return;
  sv('map');
  setTimeout(()=>{ if(mp) mp.setView([h.lat,h.lng],17,{animate:true}); if(mkm[id]) mkm[id].openPopup(); },200);
}

// ── 병원 카드 토글 ────────────────────────────────────────────────
const tc = (id) => {
  eid = eid === id ? null : id; 
  hid = id; 
  rl();
  if(eid) setTimeout(()=>{ const el=document.getElementById("c-"+id); if(el) el.scrollIntoView({behavior:"smooth",block:"nearest"}); },100); 
};

// ── 병원 목록 렌더 ────────────────────────────────────────────────
function rl() {
  const ls = gf(), sp = SP.find(s=>s.id===ss);
  const el = document.getElementById("hl");
  if (!ls.length) { el.innerHTML='<div style="text-align:center;padding:40px 20px;color:#7e7577;font-size:13px;line-height:1.8;font-family:\'Plus Jakarta Sans\',sans-serif;">해당 필터에 맞는 병원이 없습니다.</div>'; return; }

  el.innerHTML = ls.map((h, i) => {
    const c = SC[h.an.st], g = GR[h.an.gr], x = eid===h.id, hl = hid===h.id;
    let dt = '';
    if (x) {
      dt = `
        <div style="display:flex;gap:8px;margin-bottom:12px;flex-wrap:wrap;">
          <div style="flex:1;min-width:70px;padding:10px;border-radius:12px;background:#fbf9f8;text-align:center;">
            <div style="font-size:9.5px;color:#7e7577;font-family:'Plus Jakarta Sans',sans-serif;margin-bottom:2px;">아쉬움 언급</div>
            <div style="font-size:24px;font-weight:800;color:${h.an.nc>0?'#ba1a1a':'#516161'};font-family:'Plus Jakarta Sans',sans-serif;">${h.an.nc}개</div>
          </div>
          <div style="flex:1;min-width:70px;padding:10px;border-radius:12px;background:#fbf9f8;text-align:center;">
            <div style="font-size:9.5px;color:#7e7577;font-family:'Plus Jakarta Sans',sans-serif;margin-bottom:2px;">추천 언급</div>
            <div style="font-size:24px;font-weight:800;color:#526069;font-family:'Plus Jakarta Sans',sans-serif;">${h.an.pc}개</div>
          </div>
        </div>
        
        <div style="background:#f5f3f3;border-radius:12px;padding:12px;margin-bottom:12px;">
          <div style="font-size:12px;font-weight:600;color:#4d4547;margin-bottom:10px;font-family:'Plus Jakarta Sans',sans-serif;">📊 과잉진료 예방 지표</div>
          <div style="display:flex;flex-direction:column;gap:8px;">
            <div style="background:#fff;border-radius:10px;padding:10px 12px;border-left:3px solid #516161;">
              <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">
                <span style="font-size:11px;color:#4d4547;font-family:'Plus Jakarta Sans',sans-serif;">🦷 자연치아 보존 전문성</span>
                <span style="font-size:14px;font-weight:700;color:#516161;font-family:'Plus Jakarta Sans',sans-serif;">${h.an.opi.cons}점</span>
              </div>
              <div style="height:4px;background:#efeded;border-radius:2px;overflow:hidden;"><div style="height:100%;width:${h.an.opi.cons}%;background:linear-gradient(90deg,#516161,#4ECDC4);border-radius:2px;transition:width .5s;"></div></div>
            </div>
            <div style="background:#fff;border-radius:10px;padding:10px 12px;border-left:3px solid #F59E0B;">
              <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">
                <span style="font-size:11px;color:#4d4547;font-family:'Plus Jakarta Sans',sans-serif;">⏳ 운영 안정성 (장기 개업)</span>
                <span style="font-size:14px;font-weight:700;color:#F59E0B;font-family:'Plus Jakarta Sans',sans-serif;">${h.an.opi.stab}점</span>
              </div>
              <div style="height:4px;background:#efeded;border-radius:2px;overflow:hidden;"><div style="height:100%;width:${h.an.opi.stab}%;background:linear-gradient(90deg,#F59E0B,#FBBF24);border-radius:2px;transition:width .5s;"></div></div>
            </div>
            <div style="background:#fff;border-radius:10px;padding:10px 12px;border-left:3px solid #0EA5E9;">
              <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">
                <span style="font-size:11px;color:#4d4547;font-family:'Plus Jakarta Sans',sans-serif;">👤 원장 직접 1인 진료</span>
                <span style="font-size:14px;font-weight:700;color:#0EA5E9;font-family:'Plus Jakarta Sans',sans-serif;">${h.an.opi.solo}점</span>
              </div>
              <div style="height:4px;background:#efeded;border-radius:2px;overflow:hidden;"><div style="height:100%;width:${h.an.opi.solo}%;background:linear-gradient(90deg,#0EA5E9,#38BDF8);border-radius:2px;transition:width .5s;"></div></div>
            </div>
          </div>
        </div>
        <a href="https://m.search.naver.com/search.naver?query=${encodeURIComponent(h.name+' 리뷰 과잉진료')}" target="_blank" rel="noopener" onclick="event.stopPropagation()" style="display:block;text-align:center;padding:10px;border-radius:12px;background:linear-gradient(135deg,rgba(3,199,90,0.08),rgba(3,199,90,0.03));border:1.5px solid rgba(3,199,90,0.25);color:#03C75A;font-size:12px;font-weight:700;text-decoration:none;margin-bottom:12px;font-family:'Plus Jakarta Sans',sans-serif;">🔍 네이버에서 '${esc(h.name)} 과잉진료' 리뷰 직접 확인 →</a>
        
        <div style="background:#fbf9f8;border-radius:12px;padding:10px;margin-bottom:12px;border-left:4px solid ${g.bd};">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
            <div style="font-weight:600;color:${g.tx};font-size:14px;font-family:'Plus Jakarta Sans',sans-serif;">${g.e} ${g.l} ${g.desc}</div>
            <div style="font-size:11px;background:${g.bg};color:${g.tx};padding:2px 6px;border-radius:4px;font-weight:600;font-family:'Plus Jakarta Sans',sans-serif;">분석: ${h.an.mtd}</div>
          </div>
        </div>
        
        ${h.desc?`<div style="padding:10px 12px;border-radius:12px;background:#f5f3f3;font-size:11.5px;color:#4d4547;line-height:1.6;margin-bottom:8px;">📄 ${esc(h.desc)}</div>`:''}
        ${h.an.dt.length ? h.an.dt.map(d=>{
          let prefix = '';
          if (d.type === 'pos') prefix = '👍 평판 추천';
          else if (d.type === 'neg') prefix = '⚠️ 평판 아쉬움';
          else if (d.type === 'feat') prefix = '📢 진료/서비스 특징';
          return `<div class="detail-box ${d.type}"><strong>${prefix}</strong>  ${d.keywords.join(", ")}</div>`;
        }).join("") : '<div style="text-align:center;padding:8px;font-size:12px;color:#7e7577;">특이 키워드 없음</div>'}
        <div style="margin-top:10px;display:flex;gap:8px;flex-wrap:wrap;">
          ${h.phone?`<div style="padding:8px 12px;border-radius:10px;background:#e8f5ff;font-size:11.5px;color:#526069;font-family:'Plus Jakarta Sans',sans-serif;font-weight:600;">📞 ${esc(h.phone)}</div>`:''}
          ${h.link?`<a href="${h.link}" target="_blank" rel="noopener" onclick="event.stopPropagation()" class="naver-link">🔗 네이버</a>`:''}
        </div>`;
    }

    return `<div id="c-${h.id}" class="hcard ${x?'exp':''}" style="border-left-color:${g.bd};animation:fadeInUp ${Math.min(.25+i*.04,.7)}s ease both;" onclick="tc('${h.id}')">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;">
        <div style="flex:1;">
          <div style="display:flex;align-items:center;gap:7px;margin-bottom:4px;">
            <span style="font-size:18px;">${sp.i}</span>
            <span style="font-family:'Plus Jakarta Sans',sans-serif;font-size:15px;font-weight:700;color:#1b1c1c;">${esc(h.name)}</span>
          </div>
          <div style="font-size:11.5px;color:#7e7577;margin-bottom:7px;">📍 ${h.dist>0?h.dist+'m · ':''}${esc(h.addr)}</div>
          <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;">
            <span class="status-badge" style="background:${g.bg};border-color:${g.bd};color:${g.tx};">
              ${g.e} ${g.l}
            </span>
            ${h.cat?`<span style="font-size:11px;color:#7e7577;font-family:'Plus Jakarta Sans',sans-serif;">${esc(h.cat)}</span>`:''}
          </div>
        </div>
        <div style="display:flex;flex-direction:column;align-items:center;gap:6px;margin-left:8px;">
          <button class="map-btn" onclick="event.stopPropagation();fm('${h.id}')" title="지도">🗺️</button>
          <span style="color:#d0c3c6;font-size:14px;transition:transform .2s;${x?'transform:rotate(180deg)':''}">▾</span>
        </div>
      </div>
      <div style="margin-top:12px;padding-top:12px;border-top:1px solid #f5f3f3;${x?'display:block':'display:none'}">${dt}</div>
    </div>`;
  }).join("");
}

// ── 검색 ─────────────────────────────────────────────────────────
async function doSearch() {
  const btn = document.getElementById("srb");
  btn.disabled = true; btn.textContent = "🔍 검 색";
  document.getElementById("is").style.display = "none";
  document.getElementById("ra").style.display = "none";
  document.getElementById("ea").style.display = "none";
  document.getElementById("la").style.display = "block";
  document.getElementById("ltt").textContent = lN + " 주변 병원을 검색 중...";
  eid=null; hid=null; hs=[];

  const sp = SP.find(s=>s.id===ss);
  const items = await multiSearch(lF, sp.k);
  document.getElementById("la").style.display = "none";

  if (!items.length) {
    document.getElementById("ea").style.display = "block";
    document.getElementById("ea").innerHTML = `<div style="margin:0 16px;padding:16px;border-radius:16px;background:#ffdad6;border:1px solid #EF5353;font-size:12px;color:#93000a;line-height:1.6;font-family:'Plus Jakarta Sans',sans-serif;">🔍 "${lN}" 주변에서 ${sp.l}를 찾을 수 없습니다.<br><br>⚠️ <strong>node server.js</strong>가 실행 중인지 확인해주세요.</div>`;
    btn.disabled=false; usb(); return;
  }

  hs = items.map((it,i)=>{
    const lat = parseFloat(it.mapy)/1e7, lng = parseFloat(it.mapx)/1e7;
    const addr = it.roadAddress||it.address||"";
    return { id:"n"+i, name:strip(it.title), lat, lng,
      an: az(it.title, it.description, it.category, addr, it.hiraData),
      dist: dst(uLat,uLng,lat,lng),
      addr,
      phone: strip(it.telephone),
      desc: strip(it.description),
      cat: strip(it.category),
      link: it.link||""
    };
  });
  const od = {trusted:0,clean:1,caution:2,warning:3,unknown:4};
  const gr_od = {S:0,A:1,B:2,D:3};
  hs.sort((a,b)=>{
    // 1차: 등급 순 (S → A → B → D)
    if (gr_od[a.an.gr]!==gr_od[b.an.gr]) return gr_od[a.an.gr]-gr_od[b.an.gr];
    // 2차: 같은 등급 내에서 점수 (높은 순)
    if (a.an.s!==b.an.s) return (b.an.s||0)-(a.an.s||0);
    // 3차: 거리 (가까운 순)
    return a.dist-b.dist;
  });

  document.getElementById("ra").style.display = "block";
  const safe = hs.filter(h=>h.an.st==="trusted"||h.an.st==="clean").length;
  document.getElementById("rs").textContent = `✅ ${hs.length}개 ${sp.l} 발견 · 우수/양호 ${safe}곳`;

  btn.disabled=false; cf="trusted";
  cv="list";
  document.getElementById("blv").classList.add("act");
  document.getElementById("bmv").classList.remove("act");
  document.getElementById("mc").style.display = "none";
  document.getElementById("hl").style.display = "flex";
  rf(); rl(); il();
}

// ── 지역 모달 ─────────────────────────────────────────────────────
function openLM() {
  s1=null; s2v=null; s3v=null;
  document.getElementById("lm").classList.add("open");
  rlg1();
  document.getElementById("s2w").style.display = "none";
  document.getElementById("s3w").style.display = "none";
  document.getElementById("lcb").disabled = true;
  document.getElementById("lcb").style.opacity = ".5";
  ubc();
}
function clm() { document.getElementById("lm").classList.remove("open"); }

async function applyCustomLocation() {
  const q = document.getElementById("cli").value.trim();
  if (!q) return;
  
  const btn = document.getElementById("clb_btn");
  const originalText = btn.textContent;
  btn.textContent = "⌛";
  btn.disabled = true;
  
  try {
    const items = await napi(q, 1);
    if (items && items.length > 0) {
      const it = items[0];
      uLat = parseFloat(it.mapy)/1e7;
      uLng = parseFloat(it.mapx)/1e7;
      
      // 검색된 지명이 있으면 그것을 사용
      lN = it.title.replace(/<[^>]*>/g, "").trim();
      lF = q;
      
      document.getElementById("ln").textContent = lN;
      clm();
      usb();
    } else {
      // API 결과가 없는 경우 그냥 입력 지명 그대로 검색 쿼리로 사용
      lN = q;
      lF = q;
      document.getElementById("ln").textContent = lN;
      clm();
      usb();
    }
  } catch(e) {
    console.error(e);
    lN = q;
    lF = q;
    document.getElementById("ln").textContent = lN;
    clm();
    usb();
  } finally {
    btn.textContent = originalText;
    btn.disabled = false;
  }
}

function ubc() {
  let h = "전체";
  if (s1) h = `<span style="color:#1b1c1c;font-weight:600;">${s1}</span>`;
  if (s2v) h += ` › <span style="color:#1b1c1c;font-weight:600;">${s2v}</span>`;
  if (s3v) h += ` › <span style="color:#1b1c1c;font-weight:600;">${s3v}</span>`;
  document.getElementById("lbc").innerHTML = h;
  document.getElementById("sn1").className = "step-num " + (s1?"done":"actv");
  document.getElementById("sn2").className = "step-num " + (s2v?"done":s1?"actv":"");
  document.getElementById("sn3").className = "step-num " + (s3v?"done":s2v?"actv":"");
}

function rlg1() {
  document.getElementById("lg1").innerHTML = Object.keys(RG).map(k=>`<div class="region-item ${s1===k?'sel':''}" onclick="ps1('${k}')">${k}</div>`).join("");
}
function ps1(k) {
  s1=k; s2v=null; s3v=null; rlg1();
  document.getElementById("s2w").style.display = "block";
  document.getElementById("s3w").style.display = "none";
  const lcb = document.getElementById("lcb");
  lcb.disabled = true; lcb.style.opacity = ".5";
  ubc();
  document.getElementById("lg2").innerHTML = Object.keys(RG[k].d).map(d=>`<div class="region-item" onclick="ps2('${d}')">${d}</div>`).join("");
}
function ps2(k) {
  s2v = k;
  document.querySelectorAll("#lg2 .region-item").forEach(el=>el.classList.toggle("sel", el.textContent===k));
  document.getElementById("s3w").style.display = "block";
  const lcb = document.getElementById("lcb");
  lcb.disabled = false; lcb.style.opacity = "1";
  ubc();
  document.getElementById("lg3").innerHTML = RG[s1].d[k].t.map(d=>`<div class="region-item" onclick="ps3('${d}')">${d}</div>`).join("");
}
function ps3(k) {
  s3v = k;
  document.querySelectorAll("#lg3 .region-item").forEach(el=>el.classList.toggle("sel", el.textContent===k));
  const lcb = document.getElementById("lcb");
  lcb.disabled = false; lcb.style.opacity = "1";
  ubc();
}
function cfl() {
  if (!s1||!s2v) return;
  const d = RG[s1].d[s2v];
  uLat = d.lat; uLng = d.lng;
  if (s3v) { const i=d.t.indexOf(s3v); uLat+=((i%5)-2)*.002; uLng+=((Math.floor(i/5))%3-1)*.002; }
  lN = s3v||s2v; lF = s3v?s2v+" "+s3v:s2v;
  document.getElementById("ln").textContent = lN;
  clm(); usb();
}
function gps() {
  if (!navigator.geolocation) return;
  navigator.geolocation.getCurrentPosition(p=>{
    uLat=p.coords.latitude; uLng=p.coords.longitude;
    lN="내위치(GPS)"; lF="내 위치";
    document.getElementById("ln").textContent = lN;
    clm(); usb();
  }, ()=>{}, {enableHighAccuracy:true,timeout:8000});
}

// ── 초기화 ────────────────────────────────────────────────────────
rsg(); usb();
