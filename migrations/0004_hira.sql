-- [Phase C] HIRA 객관지표 연동
-- 동 단위 HIRA 기본정보 후보 캐시 (매칭용, 30일)
CREATE TABLE IF NOT EXISTS hira_match_cache (
  name TEXT PRIMARY KEY,   -- 'hira_dong::<동이름>'
  data TEXT,               -- 후보 병원 JSON 배열
  ts INTEGER
);

-- 병원별 객관지표 (요양기호 ykiho 기준). 강한 과잉진료 지표(처방률/비급여/적정성/처분)는
-- 별도 데이터셋 활용신청 후 여기에 적재 (source·as_of·peer_median 포함). 현재는 스키마만.
CREATE TABLE IF NOT EXISTS hospital_metrics (
  ykiho TEXT, metric_key TEXT, value REAL, peer_median REAL,
  source TEXT, as_of INTEGER,
  PRIMARY KEY (ykiho, metric_key)
);
