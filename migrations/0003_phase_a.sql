-- [Phase A] 방어 가능 골격: 정정·이의제기 + 추천 감사로그
CREATE TABLE IF NOT EXISTS data_corrections (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT, region TEXT, kind TEXT, message TEXT, contact TEXT,
  status TEXT DEFAULT 'open', ip TEXT, ts INTEGER
);

CREATE TABLE IF NOT EXISTS reco_audit (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT, formula_ver TEXT, source TEXT, evidence TEXT, decision TEXT, as_of INTEGER, ts INTEGER
);

CREATE INDEX IF NOT EXISTS idx_corrections_ip ON data_corrections(ip);
CREATE INDEX IF NOT EXISTS idx_corrections_ts ON data_corrections(ts);
