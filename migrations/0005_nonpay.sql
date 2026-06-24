-- [비급여 1단계] 병원별 비급여 진료비 요약 (요양기호 기준)
-- data = 치료성 비급여 항목 JSON 배열 [{n: 항목명, p: 가격}], 행정수수료·예방접종 제외
CREATE TABLE IF NOT EXISTS hira_nonpay (
  ykiho TEXT PRIMARY KEY,
  data TEXT,
  ts INTEGER
);
