# Cloudflare 이전 가이드 (Render → Cloudflare Pages + Functions + D1)

콜드스타트(서버 깨우기) 문제를 영구 해결하기 위해 Render 무료 서버 → **Cloudflare Pages**로 이전합니다.
정적 페이지는 Pages가, `/api/*`는 **Pages Functions**(서버리스, 콜드스타트 0)가, 데이터는 **D1**(Cloudflare SQLite)이 담당합니다.

## 구조 요약
| 항목 | 기존(Render/Node) | 이전 후(Cloudflare) |
|---|---|---|
| 정적 파일 | server.js 서빙 | Pages 자동 서빙 |
| `/api/search` 등 | server.js 라우트 | `functions/api/*.js` |
| DB | sqlite3 + hira_data.db | D1 (`env.DB`) |
| 네이버 키 | 환경변수 | Pages 환경변수(암호화) |
| 클라이언트 | `API = "/api"` | **수정 불필요** (경로 동일) |

## 사전 준비 (최초 1회)
```bash
npm install -g wrangler      # 또는: npx wrangler ...
wrangler login               # 브라우저에서 Cloudflare 계정 인증
```

## 1단계 — D1 데이터베이스 생성
```bash
wrangler d1 create kjeb-db
```
출력된 `database_id` 값을 복사해 **wrangler.toml**의 `REPLACE_WITH_YOUR_D1_DATABASE_ID` 자리에 붙여넣으세요.

## 2단계 — 스키마 + 데이터 적재
```bash
# 스키마 생성
wrangler d1 execute kjeb-db --remote --file=./migrations/0001_init.sql
# 병원 데이터 77건 적재
wrangler d1 execute kjeb-db --remote --file=./migrations/0002_seed_hospitals.sql
# 확인
wrangler d1 execute kjeb-db --remote --command="SELECT COUNT(*) FROM hospitals;"
```

## 3단계 — 배포
**A. CLI 직접 배포**
```bash
wrangler pages deploy . --project-name=kjeb
```
**B. GitHub 자동배포(권장, 기존 Render처럼)**
- Cloudflare 대시보드 → Workers & Pages → Create → Pages → Connect to Git → 이 저장소 선택
- Build command: (비움) / Build output directory: `/`
- D1 바인딩: Settings → Functions → D1 bindings → 변수명 `DB` = `kjeb-db`

## 4단계 — 네이버 API 키 등록 (필수)
대시보드 → 프로젝트 → Settings → Environment variables (Production)에 추가:
- `NAVER_CLIENT_ID`
- `NAVER_CLIENT_SECRET`

CLI로도 가능:
```bash
wrangler pages secret put NAVER_CLIENT_ID --project-name=kjeb
wrangler pages secret put NAVER_CLIENT_SECRET --project-name=kjeb
```

## 5단계 — 로컬 테스트 (선택)
```bash
wrangler pages dev . --d1 DB=kjeb-db
# http://localhost:8788 접속 → 검색/제보 동작 확인
```

## 검증 체크리스트
- [ ] `GET /api/recommendations` → `{"items":[]}` (warmUp 핑)
- [ ] `GET /api/search?query=치과&display=5` → items + hiraData
- [ ] `GET /api/mentions?name=...` → pos/neg 집계
- [ ] `POST /api/recommend` → `{ok:true}` 후 목록 반영
- [ ] `GET /api/revgeo?lat=37.65&lng=126.77` → 지역명

## 참고
- Render(server.js)는 그대로 두어도 무방. Cloudflare 도메인이 정상 동작하면 DNS/링크만 교체.
- mention_cache는 캐시이므로 이전 안 함(24h TTL로 자동 재생성).
- 무료 한도: D1 5GB·하루 500만 read, Functions 하루 10만 요청 — 본 앱 규모에 충분.
