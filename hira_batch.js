const https = require('https');
const http = require('http');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const HIRA_KEY = "d1872140b5c5731a0901e66e2fd1c219318063a5b9735a83e47efae4567352a6";
const serviceKey = encodeURIComponent(HIRA_KEY);

const dbPath = path.join(__dirname, 'hira_data.db');
const db = new sqlite3.Database(dbPath);

db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS hospitals (
      ykiho TEXT PRIMARY KEY,
      yadmNm TEXT,
      addr TEXT,
      clCdNm TEXT,
      drTotCnt INTEGER,
      last_updated DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
});

const fetchAPI = (urlStr) => {
  const client = urlStr.startsWith('https') ? https : http;
  return new Promise((resolve, reject) => {
    client.get(urlStr, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(data));
    }).on('error', reject);
  });
};

const parseXML = (xml) => {
  const items = xml.split('<item>').slice(1).map(i => i.split('</item>')[0]);
  return items.map(item => {
    return {
      ykiho: (item.match(/<ykiho>(.*?)<\/ykiho>/) || [])[1] || '',
      yadmNm: (item.match(/<yadmNm>(.*?)<\/yadmNm>/) || [])[1] || '',
      addr: (item.match(/<addr>(.*?)<\/addr>/) || [])[1] || '',
      clCdNm: (item.match(/<clCdNm>(.*?)<\/clCdNm>/) || [])[1] || '',
      drTotCnt: parseInt((item.match(/<drTotCnt>(.*?)<\/drTotCnt>/) || [])[1] || "1", 10)
    };
  }).filter(i => i.ykiho);
};

const batchProcess = async () => {
  console.log("=== HIRA 병원 정보 배치 다운로드 시작 ===");
  try {
    const basisUrl = `http://apis.data.go.kr/B551182/hospInfoServicev2/getHospBasisList?ServiceKey=${serviceKey}&pageNo=1&numOfRows=1000`;
    
    console.log("데이터 다운로드 중...");
    const xml = await fetchAPI(basisUrl);
    const hospitals = parseXML(xml);
    
    console.log(`파싱 완료: ${hospitals.length}개의 병원 데이터 획득.`);

    const stmt = db.prepare(`
      INSERT INTO hospitals (ykiho, yadmNm, addr, clCdNm, drTotCnt, last_updated) 
      VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(ykiho) DO UPDATE SET 
        yadmNm=excluded.yadmNm,
        addr=excluded.addr,
        clCdNm=excluded.clCdNm,
        drTotCnt=excluded.drTotCnt,
        last_updated=CURRENT_TIMESTAMP
    `);

    db.serialize(() => {
      db.run("BEGIN TRANSACTION");
      hospitals.forEach(h => {
        stmt.run(h.ykiho, h.yadmNm, h.addr, h.clCdNm, h.drTotCnt);
      });
      db.run("COMMIT", () => {
        console.log("=== DB 적재 완료! ===");
        db.close();
      });
    });

  } catch (err) {
    console.error("배치 에러:", err);
    db.close();
  }
};

batchProcess();
