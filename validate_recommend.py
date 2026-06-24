#!/usr/bin/env python3
# 착한병원 추천 검증 시뮬레이션
# 목적: 앱이 '착한(S/A)'으로 추천하는 병원이 실제로 '과잉진료 없음' 근거를 가졌는지,
#       무작위 표본으로 정량 검증한다. (앱과 동일한 네이버 블로그/카페/지식인 집계 재현 +
#       긍정글을 '과잉진료 직결' vs '일반 만족도'로 분해)
import urllib.request, urllib.parse, json, re, random, ssl, sys
from collections import Counter
import concurrent.futures as cf

NAVER_ID="PqOwK5a2oVVs6zmEOjWm"; NAVER_SECRET="SjK8rv8Nd7"
random.seed(42)  # 재현성

# ── 앱과 동일 키워드 (server.js POS_KW/NEG_KW/AD_KW) ──
POS_KW=["착한","양심","과잉진료 없","과잉진료없","과잉 없","바가지 없","덤터기 없","강요 없","강요 안","강요하지 않","친절","꼼꼼","세심","자연치아","보존치료","살려주","안 아프게","안아프게","정직","믿고","믿을 만","재방문","단골","추천","만족","최고","좋았","좋아요","good"]
NEG_KW=["과잉진료","과잉 진료","바가지","덤터기","강요","불친절","사기","돈만","불필요한 치료","과다청구","불만","최악","후회","다신 안","두 번 다시","비추","호구","뜯","폭리"]
AD_KW=["체험단","협찬","소정의 원고료","원고료","유료광고","제공받아","제공 받아","제공받았","무상으로 제공","대가성","경제적 대가","서포터즈","앰배서더","앰버서더","기자단","파트너스","쿠팡","애드","광고 포함","유료 광고"]
# 앱 POS_KW 중 '과잉진료 없음'에 직결되는 부분집합 vs 일반 만족도
OVERTREAT_POS=["착한","양심","과잉진료 없","과잉진료없","과잉 없","바가지 없","덤터기 없","강요 없","강요 안","강요하지 않","자연치아","보존치료","살려주","정직"]
GENERIC_POS=["친절","꼼꼼","세심","안 아프게","안아프게","믿고","믿을 만","재방문","단골","추천","만족","최고","좋았","좋아요","good"]

def strip(s): return re.sub("<[^>]*>","",s or "")
def neutralize(t):
    t=re.sub(r"과잉\s*진료\s*(가|는|도|를|없)?\s*없"," ",t); t=re.sub(r"바가지\s*(가|는|도)?\s*없"," ",t)
    t=re.sub(r"덤터기\s*(가|는|도)?\s*없"," ",t); t=re.sub(r"강요\s*(가|는|도|하지)?\s*(없|않)"," ",t)
    return t

def naver(kind,q,disp=30):
    u=f"https://openapi.naver.com/v1/search/{kind}.json?query={urllib.parse.quote(q)}&display={disp}&sort=sim"
    req=urllib.request.Request(u,headers={"X-Naver-Client-Id":NAVER_ID,"X-Naver-Client-Secret":NAVER_SECRET})
    try:
        with urllib.request.urlopen(req,timeout=15) as r: return json.load(r).get("items",[])
    except Exception: return []

def local_search(q,disp=5):
    u=f"https://openapi.naver.com/v1/search/local.json?query={urllib.parse.quote(q)}&display={disp}&sort=random"
    req=urllib.request.Request(u,headers={"X-Naver-Client-Id":NAVER_ID,"X-Naver-Client-Secret":NAVER_SECRET})
    try:
        with urllib.request.urlopen(req,timeout=15) as r: return json.load(r).get("items",[])
    except Exception: return []

def analyze(name):
    """앱 /mentions 재현 + 긍정 분해"""
    items=[]
    for k in ("blog","cafearticle","kin"): items += naver(k,name)
    pos=neg=ad=matched=0; ot_pos=0; gen_pos=0; ot_titles=[]; gen_titles=[]
    for it in items:
        title=strip(it.get("title")); desc=strip(it.get("description")); text=title+" "+desc
        if name not in text: continue
        matched+=1
        if any(k in text for k in AD_KW) or ("에서 경험한" in title): ad+=1; continue
        hasPos=any(k in text for k in POS_KW)
        nt=neutralize(text); hasNeg=any(k in nt for k in NEG_KW)
        if hasPos and not hasNeg: pos+=1
        elif hasNeg and not hasPos: neg+=1
        elif hasPos and hasNeg: pos+=1
        if hasPos and not hasNeg or (hasPos and hasNeg):
            if any(k in text for k in OVERTREAT_POS): ot_pos+=1; (ot_titles.append(title[:40]) if len(ot_titles)<2 else None)
            elif any(k in text for k in GENERIC_POS): gen_pos+=1; (gen_titles.append(title[:40]) if len(gen_titles)<2 else None)
    return dict(name=name,matched=matched,pos=pos,neg=neg,ad=ad,ot_pos=ot_pos,gen_pos=gen_pos,ot_t=ot_titles,gen_t=gen_titles)

def grade(p,n):
    if p==0 and n==0: return "none"
    if n>p: return "D"
    if p>=3 and n==0: return "S"
    if p>n: return "A"
    return "B"

REGIONS=["고양시 일산서구","서울 강남구","부산 해운대구","대구 수성구"]
SPECS=["치과","안과","정형외과"]
PER_REGION=6

def build_pool(region):
    pool={}
    for sp in SPECS:
        for q in (f"{region} {sp}", f"{region.split()[-1]} {sp}"):
            for it in local_search(q,5):
                nm=strip(it.get("title")).split(" ")[0] if False else strip(it.get("title"))
                cat=strip(it.get("category"))
                if nm and nm not in pool: pool[nm]=(sp,cat)
    return pool

print("="*78)
print("착한병원 추천 검증 시뮬레이션 (무작위 표본, seed=42)")
print("="*78)
all_rows=[]
for region in REGIONS:
    pool=list(build_pool(region).items())
    sample=random.sample(pool, min(PER_REGION, len(pool)))
    names=[n for n,_ in sample]
    with cf.ThreadPoolExecutor(max_workers=6) as ex: res=list(ex.map(analyze,names))
    print(f"\n■ {region}  (pool {len(pool)}곳 중 {len(names)}곳 무작위 표본)")
    for r in res:
        g=grade(r["pos"],r["neg"]); chan = "✅추천" if g in ("S","A") else "  "
        r["grade"]=g; r["region"]=region; all_rows.append(r)
        ev = "과잉진료근거O" if r["ot_pos"]>0 else ("일반칭찬만" if r["pos"]>0 else "-")
        print(f"  [{g:4}]{chan} {r['name'][:18]:18} matched={r['matched']:2} pos={r['pos']:2}(과잉직결 {r['ot_pos']}/일반 {r['gen_pos']}) neg={r['neg']} 광고={r['ad']:2}  → {ev}")

# ── 집계 ──
rec=[r for r in all_rows if r["grade"] in ("S","A")]
print("\n"+"="*78); print(f"[집계] 표본 {len(all_rows)}곳, 추천(S/A) {len(rec)}곳")
if rec:
    low=sum(1 for r in rec if r["matched"]<5)
    no_ot=sum(1 for r in rec if r["ot_pos"]==0)
    has_ad=sum(1 for r in rec if r["ad"]>0)
    print(f"  · 추천인데 표본 빈약(matched<5): {low}/{len(rec)}  ({100*low//max(1,len(rec))}%) — 통계적 신뢰 낮음")
    print(f"  · 추천인데 '과잉진료 직결 근거' 0건(일반칭찬만): {no_ot}/{len(rec)}  ({100*no_ot//max(1,len(rec))}%) ★핵심")
    print(f"  · 추천인데 광고성 글 동시 존재: {has_ad}/{len(rec)}")
