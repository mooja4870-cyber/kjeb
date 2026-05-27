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

const fetchAPI = (urlStr, timeoutMs = 10000, retries = 3) => {
  const client = urlStr.startsWith('https') ? https : http;
  
  const attempt = (attemptNum) => {
    return new Promise((resolve, reject) => {
      const req = client.get(urlStr, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          if (res.statusCode !== 200) {
            reject(new Error(`Server returned status code ${res.statusCode}`));
          } else {
            resolve(data);
          }
        });
      });
      
      req.on('error', reject);
      
      req.setTimeout(timeoutMs, () => {
        req.destroy();
        reject(new Error('Request timed out'));
      });
    });
  };

  return new Promise(async (resolve, reject) => {
    let lastErr;
    for (let i = 1; i <= retries; i++) {
      try {
        console.log(`다운로드 시도 ${i}/${retries}...`);
        const result = await attempt(i);
        return resolve(result);
      } catch (err) {
        lastErr = err;
        console.warn(`시도 ${i} 실패: ${err.message}`);
        if (i < retries) {
          await new Promise(r => setTimeout(r, 2000));
        }
      }
    }
    reject(lastErr);
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
  let dbClosed = false;
  let stmt;
  
  const closeDB = () => {
    if (dbClosed) return;
    dbClosed = true;
    if (stmt) {
      try {
        stmt.finalize();
      } catch (e) {
        console.error("Statement finalize error:", e);
      }
    }
    db.close((err) => {
      if (err) console.error("DB close error:", err);
      else console.log("DB connection closed successfully.");
    });
  };

  try {
    let pageNo = 1;
    const numOfRows = 100;
    let allHospitals = [];
    let hasMore = true;
    
    // Fetch up to 5 pages (500 items) or until no more items
    while (hasMore && pageNo <= 5) {
      console.log(`페이지 ${pageNo} 가져오는 중 (페이지당 ${numOfRows}개)...`);
      const basisUrl = `http://apis.data.go.kr/B551182/hospInfoServicev2/getHospBasisList?ServiceKey=${serviceKey}&pageNo=${pageNo}&numOfRows=${numOfRows}`;
      
      const xml = await fetchAPI(basisUrl, 10000, 3);
      
      if (xml.includes("<html>") || xml.includes("<!DOCTYPE html>")) {
        throw new Error("Received HTML error response instead of XML");
      }
      
      const hospitals = parseXML(xml);
      console.log(`페이지 ${pageNo}: ${hospitals.length}개의 병원 데이터 파싱 완료.`);
      
      if (hospitals.length === 0) {
        hasMore = false;
      } else {
        allHospitals = allHospitals.concat(hospitals);
        if (hospitals.length < numOfRows) {
          hasMore = false;
        } else {
          pageNo++;
          await new Promise(r => setTimeout(r, 1000));
        }
      }
    }
    
    console.log(`총 ${allHospitals.length}개의 병원 데이터 수집 완료.`);
    
    if (allHospitals.length === 0) {
      console.log("수집된 데이터가 없습니다. DB 업데이트를 건너뜁니다.");
      closeDB();
      return;
    }

    stmt = db.prepare(`
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
      allHospitals.forEach(h => {
        stmt.run(h.ykiho, h.yadmNm, h.addr, h.clCdNm, h.drTotCnt);
      });
      db.run("COMMIT", (err) => {
        if (err) {
          console.error("Commit failed:", err);
        } else {
          console.log("=== DB 적재 완료! ===");
        }
        closeDB();
      });
    });

  } catch (err) {
    console.error("배치 에러 발생:", err.message);
    closeDB();
  }
};

batchProcess();

