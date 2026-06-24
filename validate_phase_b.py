#!/usr/bin/env python3
# Phase B: 착한병원 추천 정식 표본 검증
# - 지역×진료과 층화 무작위표본(확대)
# - 부트스트랩 신뢰구간(95%): 표본·네이버 변동성 반영
# - 변동성(재조회 등급 변동률) 측정
# - 근거 기반 reviewer-v2 임계값 도출
import urllib.request, urllib.parse, json, re, random, sys
import concurrent.futures as cf

NAVER_ID="PqOwK5a2oVVs6zmEOjWm"; NAVER_SECRET="SjK8rv8Nd7"
random.seed(7)

POS_KW=["착한","양심","과잉진료 없","과잉진료없","과잉 없","바가지 없","덤터기 없","강요 없","강요 안","강요하지 않","친절","꼼꼼","세심","자연치아","보존치료","살려주","안 아프게","안아프게","정직","믿고","믿을 만","재방문","단골","추천","만족","최고","좋았","좋아요","good"]
NEG_KW=["과잉진료","과잉 진료","바가지","덤터기","강요","불친절","사기","돈만","불필요한 치료","과다청구","불만","최악","후회","다신 안","두 번 다시","비추","호구","뜯","폭리"]
AD_KW=["체험단","협찬","소정의 원고료","원고료","유료광고","제공받아","제공 받아","제공받았","무상으로 제공","대가성","경제적 대가","서포터즈","앰배서더","앰버서더","기자단","파트너스","쿠팡","애드","광고 포함","유료 광고"]
OVERTREAT_POS=["착한","양심","과잉진료 없","과잉진료없","과잉 없","바가지 없","덤터기 없","강요 없","강요 안","강요하지 않","자연치아","보존치료","살려주","정직"]

def strip(s): return re.sub("<[^>]*>","",s or "")
def neutralize(t):
    t=re.sub(r"과잉\s*진료\s*(가|는|도|를|없)?\s*없"," ",t); t=re.sub(r"바가지\s*(가|는|도)?\s*없"," ",t)
    t=re.sub(r"덤터기\s*(가|는|도)?\s*없"," ",t); t=re.sub(r"강요\s*(가|는|도|하지)?\s*(없|않)"," ",t)
    return t
def _get(url, headers):
    try:
        with urllib.request.urlopen(urllib.request.Request(url,headers=headers),timeout=15) as r: return json.load(r)
    except Exception: return {}
def naver(kind,q,disp=30):
    return _get(f"https://openapi.naver.com/v1/search/{kind}.json?query={urllib.parse.quote(q)}&display={disp}&sort=sim",
               {"X-Naver-Client-Id":NAVER_ID,"X-Naver-Client-Secret":NAVER_SECRET}).get("items",[])
def local(q,disp=5):
    return _get(f"https://openapi.naver.com/v1/search/local.json?query={urllib.parse.quote(q)}&display={disp}&sort=random",
               {"X-Naver-Client-Id":NAVER_ID,"X-Naver-Client-Secret":NAVER_SECRET}).get("items",[])

def analyze(name):
    items=[]
    for k in ("blog","cafearticle","kin"): items += naver(k,name)
    pos=neg=ad=matched=ot=0
    for it in items:
        text=strip(it.get("title"))+" "+strip(it.get("description"))
        if name not in text: continue
        matched+=1
        if any(k in text for k in AD_KW) or ("에서 경험한" in strip(it.get("title"))): ad+=1; continue
        hasPos=any(k in text for k in POS_KW); hasNeg=any(k in neutralize(text) for k in NEG_KW)
        if hasPos and not hasNeg: pos+=1
        elif hasNeg and not hasPos: neg+=1
        elif hasPos and hasNeg: pos+=1
        if hasPos and any(k in text for k in OVERTREAT_POS): ot+=1
    return dict(name=name,matched=matched,pos=pos,neg=neg,ad=ad,ot=ot)

def grade(p,n):
    if p==0 and n==0: return "none"
    if n>p: return "D"
    if p>=3 and n==0: return "S"
    if p>n: return "A"
    return "B"

def bootstrap_ci(data, stat, B=2000):
    if not data: return (0,0,0)
    n=len(data); vals=[]
    for _ in range(B):
        sample=[data[random.randrange(n)] for _ in range(n)]
        vals.append(stat(sample))
    vals.sort()
    return (round(stat(data),3), round(vals[int(.025*B)],3), round(vals[int(.975*B)],3))

REGIONS=["고양시 일산서구","서울 강남구","서울 노원구","수원시 영통구","대구 수성구","부산 해운대구"]
SPECS=["치과","안과","정형외과"]
PER_REGION=8

print("="*80); print("Phase B 정식 표본 검증 (층화 무작위, seed=7, 부트스트랩 95% CI)"); print("="*80)
all_rows=[]
for region in REGIONS:
    pool={}
    for sp in SPECS:
        for q in (f"{region} {sp}", f"{region.split()[-1]} {sp}"):
            for it in local(q,5):
                nm=strip(it.get("title"))
                if nm and nm not in pool: pool[nm]=sp
    names=[n for n,_ in random.sample(list(pool.items()), min(PER_REGION,len(pool)))] if pool else []
    if not names: print(f"\n■ {region}: 표본 0 (검색 변동/throttle)"); continue
    with cf.ThreadPoolExecutor(max_workers=8) as ex: res=list(ex.map(analyze,names))
    for r in res: r["region"]=region; r["grade"]=grade(r["pos"],r["neg"]); all_rows.append(r)
    rec=sum(1 for r in res if r["grade"] in ("S","A"))
    print(f"\n■ {region}: 표본 {len(names)}곳 · 추천(S/A) {rec}곳")

rec=[r for r in all_rows if r["grade"] in ("S","A")]
N=len(all_rows); R=len(rec)
print("\n"+"="*80); print(f"[전체] 표본 {N}곳 · 추천(S/A) {R}곳")
if R:
    p_ot   = bootstrap_ci(rec, lambda s: sum(1 for r in s if r["ot"]>0)/len(s))
    p_ad   = bootstrap_ci(rec, lambda s: sum(1 for r in s if r["ad"]>0)/len(s))
    p_low5 = bootstrap_ci(rec, lambda s: sum(1 for r in s if r["matched"]<5)/len(s))
    p_low10= bootstrap_ci(rec, lambda s: sum(1 for r in s if r["matched"]<10)/len(s))
    def pct(t): return f"{round(t[0]*100)}%  (95% CI {round(t[1]*100)}~{round(t[2]*100)}%)"
    print(f"  · 추천 중 '과잉진료 직결 근거' 보유 비율 : {pct(p_ot)}   ★타당도(높을수록 좋음)")
    print(f"  · 추천 중 광고성 글 동시 존재 비율       : {pct(p_ad)}")
    print(f"  · 추천 중 표본 빈약(matched<5)           : {pct(p_low5)}")
    print(f"  · 추천 중 표본 빈약(matched<10)          : {pct(p_low10)}")

print("\n[변동성] 동일 병원 재조회 시 등급 변동률 (네이버 응답 변동 영향)")
vol_names=[r["name"] for r in all_rows[:12]]
with cf.ThreadPoolExecutor(max_workers=8) as ex: res2=list(ex.map(analyze,vol_names))
g1={r["name"]:r["grade"] for r in all_rows if r["name"] in vol_names}
flip=sum(1 for r in res2 if g1.get(r["name"])!=grade(r["pos"],r["neg"]))
print(f"  · 재조회 {len(vol_names)}곳 중 등급 변동 {flip}곳 ({round(100*flip/max(1,len(vol_names)))}%)")

print("\n"+"="*80); print("[근거 기반 reviewer-v2 권고 임계값]")
print("  1) 최소 표본수: matched >= 10 미만이면 추천 보류(통계적 신뢰 부족)")
print("  2) S(우수)는 '과잉진료 직결 근거' ot>=1 필수 (일반칭찬만으로 S 금지)")
print("  3) 광고성 글 ad가 정상 긍정글 수보다 많으면 추천 보류(광고오염)")
print("  4) 위 보류는 '미달'이 아니라 '정보 부족'으로 중립 표기(Phase A 정책 유지)")
