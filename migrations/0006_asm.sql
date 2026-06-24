-- [적정성평가] 병원평가정보(약제 적정성평가) 등급 — 요양기호 기준
-- data = {코드:등급} JSON, 과잉진료 직결 약제 항목(감기항생제07·주사제08·약품목수09·기관지염항생제23) 중심
CREATE TABLE IF NOT EXISTS hira_asm (
  ykiho TEXT PRIMARY KEY,
  data TEXT,
  ts INTEGER
);
