const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, 'hira_data.db');
const db = new sqlite3.Database(dbPath);

db.serialize(() => {
  db.run("INSERT OR REPLACE INTO hospitals (ykiho, yadmNm, addr, clCdNm, drTotCnt) VALUES ('t1', '연세', '경기도 고양시', '의원', 3)");
  db.run("INSERT OR REPLACE INTO hospitals (ykiho, yadmNm, addr, clCdNm, drTotCnt) VALUES ('t2', '사과나무', '경기도 고양시', '의원', 5)");
  db.run("INSERT OR REPLACE INTO hospitals (ykiho, yadmNm, addr, clCdNm, drTotCnt) VALUES ('t3', '서울', '경기도 고양시', '의원', 1)");
  db.run("INSERT OR REPLACE INTO hospitals (ykiho, yadmNm, addr, clCdNm, drTotCnt) VALUES ('t4', '유디', '경기도 고양시', '의원', 10)");
  db.run("INSERT OR REPLACE INTO hospitals (ykiho, yadmNm, addr, clCdNm, drTotCnt) VALUES ('t5', '삼성', '경기도 고양시', '의원', 4)");
});

db.close(() => {
  console.log("Seeding complete.");
});
