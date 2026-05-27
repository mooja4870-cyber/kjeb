const https = require('https');

const NAVER_CLIENT_ID = "PqOwK5a2oVVs6zmEOjWm";
const NAVER_CLIENT_SECRET = "SjK8rv8Nd7";
const query = "고양시 치과";
const apiUrl = `https://openapi.naver.com/v1/search/local.json?query=${encodeURIComponent(query)}&display=5&sort=comment`;

https.get(apiUrl, {
  headers: {
    "X-Naver-Client-Id": NAVER_CLIENT_ID,
    "X-Naver-Client-Secret": NAVER_CLIENT_SECRET,
  },
}, (res) => {
  let data = "";
  res.on("data", (chunk) => (data += chunk));
  res.on("end", () => {
    try {
      const parsed = JSON.parse(data);
      console.log("=== NAVER LOCAL SEARCH API RESPONSE ===");
      parsed.items.forEach((item, index) => {
        console.log(`[${index + 1}] Title:`, item.title);
        console.log(`    Category:`, item.category);
        console.log(`    Description:`, JSON.stringify(item.description));
        console.log();
      });
    } catch(e) {
      console.error("Parse error:", e);
    }
  });
}).on("error", (err) => {
  console.error("API error:", err);
});
