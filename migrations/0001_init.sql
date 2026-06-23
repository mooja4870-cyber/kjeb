-- D1 schema for kjeb (Cloudflare 이전) — server.js의 sqlite3 테이블과 동일
CREATE TABLE IF NOT EXISTS hospitals (
  ykiho TEXT PRIMARY KEY,
  yadmNm TEXT,
  addr TEXT,
  clCdNm TEXT,
  drTotCnt INTEGER,
  last_updated TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS mention_cache (
  name TEXT PRIMARY KEY,
  data TEXT,
  ts INTEGER
);

CREATE TABLE IF NOT EXISTS user_recos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT, region TEXT, specialty TEXT,
  reasons TEXT, comment TEXT, ip TEXT, ts INTEGER
);

CREATE INDEX IF NOT EXISTS idx_hospitals_name ON hospitals(yadmNm);
CREATE INDEX IF NOT EXISTS idx_recos_ip ON user_recos(ip);
CREATE INDEX IF NOT EXISTS idx_recos_ts ON user_recos(ts);
