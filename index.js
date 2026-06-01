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
  {
    name: "get_ad_accounts",
    description: "Get all Meta ad accounts",
    inputSchema: { type: "object", properties: {}, required: [] }
  },
  {
    name: "get_ad_campaigns",
    description: "Get campaigns for an ad account",
    inputSchema: { type: "object", properties: { account_id: { type: "string" } }, required: ["account_id"] }
  },
  {
    name: "get_ad_insights",
    description: "Get account-level insights",
    inputSchema: { type: "object", properties: { account_id: { type: "string" }, date_preset: { type: "string" } }, required: ["account_id"] }
  },
  {
    name: "get_campaign_insights",
    description: "Get per-campaign spend breakdown with conversions",
    inputSchema: { type: "object", properties: { account_id: { type: "string" }, date_preset: { type: "string" } }, required: ["account_id"] }
  },
  {
    name: "get_adsets",
    description: "Get all ad sets inside a campaign with full performance data",
    inputSchema: { type: "object", properties: { campaign_id: { type: "string" }, date_preset: { type: "string" } }, required: ["campaign_id"] }
  },
  {
    name: "get_adset_insights",
    description: "Get detailed insights for a specific ad set",
    inputSchema: { type: "object", properties: { adset_id: { type: "string" }, date_preset: { type: "string" } }, required: ["adset_id"] }
  },
  {
    name: "get_ads",
    description: "Get all ads inside a specific ad set with creative performance — spend, ROAS, CPP, CTR, purchases per creative",
    inputSchema: { type: "object", properties: { adset_id: { type: "string" }, date_preset: { type: "string" } }, required: ["adset_id"] }
  },
  {
    name: "get_ads_by_campaign",
    description: "Get all ads inside a campaign (all ad sets) with creative performance data",
    inputSchema: { type: "object", properties: { campaign_id: { type: "string" }, date_preset: { type: "string" } }, required: ["campaign_id"] }
  },
  {
    name: "get_ad_creative",
    description: "Get creative details for a specific ad — thumbnail, title, body, call to action, media type",
    inputSchema: { type: "object", properties: { ad_id: { type: "string" } }, required: ["ad_id"] }
  },
  {
    name: "get_my_pages",
    description: "Get all Facebook Pages",
    inputSchema: { type: "object", properties: {}, required: [] }
  },
  {
    name: "get_page_insights",
    description: "Get insights for a Facebook Page",
    inputSchema: { type: "object", properties: { page_id: { type: "string" } }, required: ["page_id"] }
  },
  {
    name: "get_page_posts",
    description: "Get recent posts from a Facebook Page",
    inputSchema: { type: "object", properties: { page_id: { type: "string" } }, required: ["page_id"] }
  },
  {
    name: "get_instagram_account",
    description: "Get Instagram Business account",
    inputSchema: { type: "object", properties: { page_id: { type: "string" } }, required: ["page_id"] }
  },
  {
    name: "get_instagram_media",
    description: "Get recent Instagram posts",
    inputSchema: { type: "object", properties: { instagram_account_id: { type: "string" } }, required: ["instagram_account_id"] }
  },
  {
    name: "get_instagram_insights",
    description: "Get Instagram insights",
    inputSchema: { type: "object", properties: { instagram_account_id: { type: "string" }, metric: { type: "string" }, period: { type: "string" } }, required: ["instagram_account_id"] }
  }
];

const INSIGHT_FIELDS = "spend,impressions,clicks,reach,frequency,ctr,cpc,cpm,actions,action_values,purchase_roas,outbound_clicks,cost_per_action_type";

async function run(name, args) {
  try {
    let res;
    const preset = args.date_preset || "this_month";

    switch (name) {

      case "get_ad_accounts":
        res = await axios.get(`${BASE_URL}/me/adaccounts`, {
          params: { access_token: ACCESS_TOKEN, fields: "id,name,account_status,currency,spend_cap" }
        }); break;

      case "get_ad_campaigns":
        res = await axios.get(`${BASE_URL}/act_${args.account_id}/campaigns`, {
          params: { access_token: ACCESS_TOKEN, fields: "id,name,status,objective,daily_budget,lifetime_budget,budget_remaining" }
        }); break;

      case "get_ad_insights":
        res = await axios.get(`${BASE_URL}/act_${args.account_id}/insights`, {
          params: { access_token: ACCESS_TOKEN, date_preset: preset, fields: INSIGHT_FIELDS }
        }); break;

      case "get_campaign_insights":
        res = await axios.get(`${BASE_URL}/act_${args.account_id}/campaigns`, {
          params: {
            access_token: ACCESS_TOKEN,
            fields: `id,name,status,objective,insights.date_preset(${preset}){${INSIGHT_FIELDS}}`
          }
        }); break;

      case "get_adsets":
        res = await axios.get(`${BASE_URL}/${args.campaign_id}/adsets`, {
          params: {
            access_token: ACCESS_TOKEN,
            fields: `id,name,status,targeting,daily_budget,lifetime_budget,bid_strategy,optimization_goal,billing_event,insights.date_preset(${preset}){${INSIGHT_FIELDS}}`
          }
        }); break;

      case "get_adset_insights":
        res = await axios.get(`${BASE_URL}/${args.adset_id}/insights`, {
          params: { access_token: ACCESS_TOKEN, date_preset: preset, fields: INSIGHT_FIELDS }
        }); break;

      case "get_ads":
        // All ads in an ad set with creative performance
        res = await axios.get(`${BASE_URL}/${args.adset_id}/ads`, {
          params: {
            access_token: ACCESS_TOKEN,
            fields: `id,name,status,creative{id,name,title,body,call_to_action_type,thumbnail_url,image_url,video_id,object_type,asset_feed_spec},insights.date_preset(${preset}){${INSIGHT_FIELDS}}`
          }
        }); break;

      case "get_ads_by_campaign":
        // All ads in a campaign across all ad sets
        res = await axios.get(`${BASE_URL}/${args.campaign_id}/ads`, {
          params: {
            access_token: ACCESS_TOKEN,
            fields: `id,name,status,adset_id,adset{id,name},creative{id,name,title,body,call_to_action_type,thumbnail_url,image_url,video_id,object_type,asset_feed_spec},insights.date_preset(${preset}){${INSIGHT_FIELDS}}`
          }
        }); break;

      case "get_ad_creative":
        res = await axios.get(`${BASE_URL}/${args.ad_id}`, {
          params: {
            access_token: ACCESS_TOKEN,
            fields: "id,name,status,creative{id,name,title,body,call_to_action_type,thumbnail_url,image_url,video_id,object_type,effective_object_story_id,asset_feed_spec,object_story_spec}"
          }
        }); break;

      case "get_my_pages":
        res = await axios.get(`${BASE_URL}/me/accounts`, {
          params: { access_token: ACCESS_TOKEN, fields: "id,name,category,fan_count,followers_count" }
        }); break;

      case "get_page_insights":
        res = await axios.get(`${BASE_URL}/${args.page_id}/insights`, {
          params: { access_token: ACCESS_TOKEN, metric: "page_impressions,page_reach,page_engaged_users,page_fans", period: "day" }
        }); break;

      case "get_page_posts":
        res = await axios.get(`${BASE_URL}/${args.page_id}/posts`, {
          params: { access_token: ACCESS_TOKEN, fields: "id,message,created_time,likes.summary(true),comments.summary(true)" }
        }); break;

      case "get_instagram_account":
        res = await axios.get(`${BASE_URL}/${args.page_id}`, {
          params: { access_token: ACCESS_TOKEN, fields: "instagram_business_account{id,name,username,followers_count,media_count,biography}" }
        }); break;

      case "get_instagram_media":
        res = await axios.get(`${BASE_URL}/${args.instagram_account_id}/media`, {
          params: { access_token: ACCESS_TOKEN, fields: "id,caption,media_type,timestamp,like_count,comments_count,permalink" }
        }); break;

      case "get_instagram_insights":
        res = await axios.get(`${BASE_URL}/${args.instagram_account_id}/insights`, {
          params: { access_token: ACCESS_TOKEN, metric: args.metric || "impressions,reach,profile_views", period: args.period || "day" }
        }); break;

      default:
        return { error: `Unknown tool: ${name}` };
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
import crypto from "crypto";

app.post("/track-order", async (req, res) => {
  const { pixelId, accessToken, name, phone, product, value } = req.body;
  if (!pixelId || !accessToken || !phone || !value) {
    return res.status(400).json({ error: "Missing required fields" });
  }
  const hashedPhone = crypto.createHash("sha256").update(phone.replace(/\D/g, "")).digest("hex");
  try {
    const response = await axios.post(
      `${BASE_URL}/${pixelId}/events?access_token=${accessToken}`,
      {
        data: [{
          event_name: "Purchase",
          event_time: Math.floor(Date.now() / 1000),
          event_id: "order_" + Date.now(),
          action_source: "other",
          user_data: { ph: [hashedPhone] },
          custom_data: { value: parseFloat(value), currency: "EGP", content_name: product, content_type: "product" }
        }]
      }
    );
    res.json({ success: true, events_received: response.data.events_received });
  } catch (e) {
    res.status(500).json({ error: e.response?.data || e.message });
  }
});
app.get("/", (req, res) => res.send("✅ Meta MCP Server is running! Endpoint: POST /mcp"));
app.listen(process.env.PORT || 3000, () => console.log(`🚀 Running on port ${process.env.PORT || 3000}`));
