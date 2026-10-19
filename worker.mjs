import { handleMapRequest } from './server/edge-handler.mjs';

// ============================================================
// 오피넷 유가 워커 (wakefuel)
// 휘발유/고급휘발유/경유/LPG 4종 지원
// ============================================================



const PRODUCT_MAP = {
  "B027": "gasoline",         // 휘발유
  "B034": "premiumGasoline",  // 고급휘발유 (신규 추가)
  "D047": "diesel",           // 자동차용경유
  "K015": "lpg"               // 자동차용부탄(LPG)
};

const originalFuelWorker = {
  async fetch(request, env, ctx) {
    const OPINET_API_KEY = env.OPINET_API_KEY;
    const url = new URL(request.url);
    const path = url.pathname;
    
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    };

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    if (path === "/opinet") {
      try {
        const requestedDate = url.searchParams.get("date");

        let useRecent = false;
        let fallback = false;
        let fallbackReason = "";

        if (requestedDate) {
          const today = new Date();
          today.setHours(0, 0, 0, 0);
          
          const y = parseInt(requestedDate.slice(0, 4));
          const m = parseInt(requestedDate.slice(4, 6)) - 1;
          const d = parseInt(requestedDate.slice(6, 8));
          const reqDate = new Date(y, m, d);
          reqDate.setHours(0, 0, 0, 0);

          const diffDays = Math.floor((today - reqDate) / (1000 * 60 * 60 * 24));

          if (diffDays < 0) {
            fallback = true;
            fallbackReason = "future_date";
          } else if (diffDays === 0) {
            useRecent = false;
          } else if (diffDays <= 7) {
            useRecent = true;
          } else {
            fallback = true;
            fallbackReason = "exceeds_7days";
          }
        }

        const apiUrl = useRecent
          ? `https://www.opinet.co.kr/api/avgRecentPrice.do?out=json&certkey=${OPINET_API_KEY}`
          : `https://www.opinet.co.kr/api/avgAllPrice.do?out=json&certkey=${OPINET_API_KEY}`;

        const res = await fetch(apiUrl);
        if (!res.ok) {
          throw new Error(`Opinet API HTTP ${res.status}`);
        }
        const data = await res.json();

        if (!data.RESULT || !data.RESULT.OIL) {
          throw new Error("Invalid Opinet response");
        }

        const oilArr = Array.isArray(data.RESULT.OIL) ? data.RESULT.OIL : [data.RESULT.OIL];
        
        if (oilArr.length === 0) {
          throw new Error("Empty OIL array - check API key or endpoint");
        }

        const prices = {};
        let tradeDate = "";

        if (useRecent && requestedDate) {
          if (oilArr[0].DATA && Array.isArray(oilArr[0].DATA)) {
            for (const item of oilArr) {
              const productKey = PRODUCT_MAP[item.PRODCD];
              if (!productKey) continue;
              
              let match = item.DATA.find(d => (d.DATE || d.TRADE_DT) === requestedDate);
              if (!match) {
                const sorted = [...item.DATA].sort((a, b) => {
                  const aDate = a.DATE || a.TRADE_DT;
                  const bDate = b.DATE || b.TRADE_DT;
                  return Math.abs(parseInt(aDate) - parseInt(requestedDate)) - 
                         Math.abs(parseInt(bDate) - parseInt(requestedDate));
                });
                match = sorted[0];
              }
              if (match) {
                prices[productKey] = Math.round(parseFloat(match.PRICE));
                tradeDate = match.DATE || match.TRADE_DT;
              }
            }
          } else {
            const byDate = {};
            for (const item of oilArr) {
              const dt = item.TRADE_DT || item.DATE;
              if (!byDate[dt]) byDate[dt] = {};
              const productKey = PRODUCT_MAP[item.PRODCD];
              if (productKey) {
                byDate[dt][productKey] = Math.round(parseFloat(item.PRICE));
              }
            }
            
            let targetDateKey = requestedDate;
            if (!byDate[targetDateKey] || Object.keys(byDate[targetDateKey]).length === 0) {
              const dates = Object.keys(byDate).sort();
              targetDateKey = dates.reduce((closest, dt) => {
                if (!closest) return dt;
                return Math.abs(parseInt(dt) - parseInt(requestedDate)) < 
                       Math.abs(parseInt(closest) - parseInt(requestedDate)) ? dt : closest;
              }, null);
            }
            
            if (targetDateKey && byDate[targetDateKey]) {
              Object.assign(prices, byDate[targetDateKey]);
              tradeDate = targetDateKey;
            }
          }
        } else {
          for (const item of oilArr) {
            const productKey = PRODUCT_MAP[item.PRODCD];
            if (productKey) {
              prices[productKey] = Math.round(parseFloat(item.PRICE));
            }
            if (item.TRADE_DT) tradeDate = item.TRADE_DT;
          }
        }

        return new Response(JSON.stringify({
          success: true,
          prices,
          tradeDate,
          requestedDate: requestedDate || null,
          fallback,
          fallbackReason,
          updatedAt: new Date().toISOString(),
          source: "한국석유공사 오피넷 전국평균"
        }, null, 2), {
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });

      } catch (e) {
        return new Response(JSON.stringify({
          success: false,
          error: e.message,
          updatedAt: new Date().toISOString()
        }, null, 2), {
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }
    }

    return new Response("Not Found", { status: 404, headers: corsHeaders });
  }
};

export default {
  async fetch(request, env, ctx) {
    const path = new URL(request.url).pathname;
    if (path === '/taxi/compare' || path === '/geocode') return handleMapRequest(request, env);
    return originalFuelWorker.fetch(request, env, ctx);
  }
};

