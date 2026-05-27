const https = require("https");
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const NAVER_CLIENT_ID = process.env.NAVER_CLIENT_ID || "PqOwK5a2oVVs6zmEOjWm";
const NAVER_CLIENT_SECRET = process.env.NAVER_CLIENT_SECRET || "SjK8rv8Nd7";

// Vercel Serverless Function entry point
module.exports = (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  const query = req.query.query || "";
  const display = req.query.display || "20";
  const sort = req.query.sort || "comment";
  const apiUrl = `https://openapi.naver.com/v1/search/local.json?query=${encodeURIComponent(query)}&display=${display}&sort=${sort}`;

  https.get(apiUrl, {
    headers: {
      "X-Naver-Client-Id": NAVER_CLIENT_ID,
      "X-Naver-Client-Secret": NAVER_CLIENT_SECRET,
    },
  }, (apiRes) => {
    let data = "";
    apiRes.on("data", (chunk) => (data += chunk));
    apiRes.on("end", async () => {
      try {
        const naverData = JSON.parse(data);
        if (naverData.items && naverData.items.length > 0) {
          // Initialize DB connection inside the handler to ensure it works in Vercel
          const dbPath = path.join(process.cwd(), 'hira_data.db');
          const db = new sqlite3.Database(dbPath, sqlite3.OPEN_READONLY);

          const promises = naverData.items.map(item => {
            return new Promise((resolve) => {
              const cleanName = item.title.replace(/<[^>]+>/g, '').split(' ')[0];
              db.get(`SELECT * FROM hospitals WHERE yadmNm LIKE ?`, [`%${cleanName}%`], (err, row) => {
                if (!err && row) {
                  item.hiraData = { doctorCnt: row.drTotCnt };
                } else {
                  item.hiraData = { doctorCnt: 1 }; // fallback
                }
                resolve();
              });
            });
          });

          await Promise.all(promises);
          db.close();
        }
        res.status(200).json(naverData);
      } catch (e) {
        // If DB fails or JSON parse fails, return raw data or error
        res.status(200).send(data);
      }
    });
  }).on("error", (err) => {
    res.status(500).json({ error: err.message });
  });
};
