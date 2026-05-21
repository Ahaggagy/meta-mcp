import express from "express";
import axios from "axios";

const ACCESS_TOKEN = process.env.META_ACCESS_TOKEN;
const BASE_URL = "https://graph.facebook.com/v19.0";

const app = express();

app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "*");
  if (req.method === "OPTIONS") return res.sendStatus(200);
  next();
});

app.use(express.json());

const tools = [
  { name: "get_ad_accounts", description: "Get all Meta ad accounts", inputSchema: { type: "object", properties: {}, required: [] } },
  { name: "get_ad_campaigns", description: "Get campaigns with spend for an ad account", inputSchema: { type: "object", properties: { account_id: { type: "string" } }, required: ["account_id"] } },
  { name: "get_ad_insights", description: "Get account-level insights", inputSchema: { type: "object", properties: { account_id: { type: "string" }, date_preset: { type: "string" } }, required: ["account_id"] } },
  { name: "get_campaign_insights", description: "Get per-campaign spend breakdown", inputSchema: { type: "object", properties: { account_id: { type: "string" }, date_preset: { type: "string" } }, required: ["account_id"] } },
  { name: "get_my_pages", description: "Get all Facebook Pages", inputSchema: { type: "object", properties: {}, required: [] } },
  { name: "get_page_insights", description: "Get insights for a Facebook Page", inputSchema: { type: "object", properties: { page_id: { type: "string" } }, required: ["page_id"] } },
  { name: "get_page_posts", description: "Get recent posts from a Facebook Page", inputSchema: { type: "object", properties: { page_id: { type: "string" } }, required: ["page_id"] } },
  { name: "get_instagram_account", description: "Get Instagram Business account", inputSchema: { type: "object", properties: { page_id: { type: "string" } }, required: ["page_id"] } },
  { name: "get_instagram_media", description: "Get recent Instagram posts", inputSchema: { type: "object", properties: { instagram_account_id: { type: "string" } }, required: ["instagram_account_id"] } },
  { name: "get_instagram_insights", description: "Get Instagram insights", inputSchema: { type: "object", properties: { instagram_account_id: { type: "string" }, metric: { type: "string" }, period: { type: "string" } }, required: ["instagram_account_id"] } }
];

async function run(name, args) {
  try {
    let res;
    switch (name) {
      case "get_ad_accounts":
        res = await axios.get(`${BASE_URL}/me/adaccounts`, { params: { access_token: ACCESS_TOKEN, fields: "id,name,account_status,currency,spend_cap" } }); break;

      case "get_ad_campaigns":
        res = await axios.get(`${BASE_URL}/act_${args.account_id}/campaigns`, {
          params: { access_token: ACCESS_TOKEN, fields: "id,name,status,objective,daily_budget,lifetime_budget,budget_remaining" }
        }); break;

      case "get_ad_insights":
        res = await axios.get(`${BASE_URL}/act_${args.account_id}/insights`, {
          params: {
            access_token: ACCESS_TOKEN,
            date_preset: args.date_preset || "last_7d",
            fields: "impressions,clicks,spend,reach,ctr,cpc,cpm,actions,action_values,purchase_roas,outbound_clicks"
          }
        }); break;

      case "get_campaign_insights":
        // Get per-campaign spend breakdown — critical for correct CPP/ROAS
        res = await axios.get(`${BASE_URL}/act_${args.account_id}/campaigns`, {
          params: {
            access_token: ACCESS_TOKEN,
            fields: `id,name,status,objective,insights.date_preset(${args.date_preset || "last_7d"}){spend,impressions,clicks,actions,action_values,purchase_roas}`,
          }
        }); break;

      case "get_my_pages":
        res = await axios.get(`${BASE_URL}/me/accounts`, { params: { access_token: ACCESS_TOKEN, fields: "id,name,category,fan_count,followers_count" } }); break;

      case "get_page_insights":
        res = await axios.get(`${BASE_URL}/${args.page_id}/insights`, { params: { access_token: ACCESS_TOKEN, metric: "page_impressions,page_reach,page_engaged_users,page_fans", period: "day" } }); break;

      case "get_page_posts":
        res = await axios.get(`${BASE_URL}/${args.page_id}/posts`, { params: { access_token: ACCESS_TOKEN, fields: "id,message,created_time,likes.summary(true),comments.summary(true)" } }); break;

      case "get_instagram_account":
        res = await axios.get(`${BASE_URL}/${args.page_id}`, { params: { access_token: ACCESS_TOKEN, fields: "instagram_business_account{id,name,username,followers_count,media_count,biography}" } }); break;

      case "get_instagram_media":
        res = await axios.get(`${BASE_URL}/${args.instagram_account_id}/media`, { params: { access_token: ACCESS_TOKEN, fields: "id,caption,media_type,timestamp,like_count,comments_count,permalink" } }); break;

      case "get_instagram_insights":
        res = await axios.get(`${BASE_URL}/${args.instagram_account_id}/insights`, { params: { access_token: ACCESS_TOKEN, metric: args.metric || "impressions,reach,profile_views", period: args.period || "day" } }); break;

      default: return { error: `Unknown tool: ${name}` };
    }
    return res.data;
  } catch (e) {
    return { error: e.response?.data || e.message };
  }
}

app.post("/mcp", async (req, res) => {
  const { method, params, id } = req.body || {};
  console.log("→", method, params?.name);
  if (method === "initialize") return res.json({ jsonrpc: "2.0", id, result: { protocolVersion: "2024-11-05", capabilities: { tools: {} }, serverInfo: { name: "meta-mcp", version: "1.0.0" } } });
  if (method === "notifications/initialized") return res.sendStatus(204);
  if (method === "tools/list") return res.json({ jsonrpc: "2.0", id, result: { tools } });
  if (method === "tools/call") {
    const result = await run(params.name, params.arguments || {});
    return res.json({ jsonrpc: "2.0", id, result: { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] } });
  }
  return res.json({ jsonrpc: "2.0", id, error: { code: -32601, message: "Method not found" } });
});

app.get("/", (req, res) => res.send("✅ Meta MCP Server is running! Endpoint: POST /mcp"));
app.listen(process.env.PORT || 3000, () => console.log(`🚀 Running on port ${process.env.PORT || 3000}`));
