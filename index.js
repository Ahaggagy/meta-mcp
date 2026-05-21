import express from "express";
import axios from "axios";

const ACCESS_TOKEN = process.env.META_ACCESS_TOKEN;
const BASE_URL = "https://graph.facebook.com/v19.0";

const app = express();
app.use(express.json());

// ─── TOOL DEFINITIONS ─────────────────────────────────────────────────────────

const tools = [
  {
    name: "get_ad_accounts",
    description: "Get all Meta ad accounts associated with the user",
    inputSchema: { type: "object", properties: {}, required: [] }
  },
  {
    name: "get_ad_campaigns",
    description: "Get all campaigns for a specific ad account",
    inputSchema: {
      type: "object",
      properties: {
        account_id: { type: "string", description: "The ad account ID (without act_ prefix)" }
      },
      required: ["account_id"]
    }
  },
  {
    name: "get_ad_insights",
    description: "Get performance insights for an ad account",
    inputSchema: {
      type: "object",
      properties: {
        account_id: { type: "string", description: "The ad account ID (without act_ prefix)" },
        date_preset: {
          type: "string",
          enum: ["today", "yesterday", "last_7d", "last_30d", "this_month", "last_month"],
          description: "Date range preset"
        }
      },
      required: ["account_id"]
    }
  },
  {
    name: "get_my_pages",
    description: "Get all Facebook Pages managed by the user",
    inputSchema: { type: "object", properties: {}, required: [] }
  },
  {
    name: "get_page_insights",
    description: "Get insights and analytics for a Facebook Page",
    inputSchema: {
      type: "object",
      properties: {
        page_id: { type: "string", description: "The Facebook Page ID" },
        metric: { type: "string", description: "Comma-separated metrics" }
      },
      required: ["page_id"]
    }
  },
  {
    name: "get_page_posts",
    description: "Get recent posts from a Facebook Page",
    inputSchema: {
      type: "object",
      properties: {
        page_id: { type: "string", description: "The Facebook Page ID" }
      },
      required: ["page_id"]
    }
  },
  {
    name: "get_instagram_account",
    description: "Get Instagram Business account connected to a Facebook Page",
    inputSchema: {
      type: "object",
      properties: {
        page_id: { type: "string", description: "The Facebook Page ID connected to Instagram" }
      },
      required: ["page_id"]
    }
  },
  {
    name: "get_instagram_media",
    description: "Get recent Instagram posts and media",
    inputSchema: {
      type: "object",
      properties: {
        instagram_account_id: { type: "string", description: "The Instagram Business Account ID" }
      },
      required: ["instagram_account_id"]
    }
  },
  {
    name: "get_instagram_insights",
    description: "Get insights for an Instagram Business account",
    inputSchema: {
      type: "object",
      properties: {
        instagram_account_id: { type: "string", description: "The Instagram Business Account ID" },
        metric: { type: "string", description: "Comma-separated metrics" },
        period: { type: "string", enum: ["day", "week", "month"] }
      },
      required: ["instagram_account_id"]
    }
  }
];

// ─── TOOL EXECUTION ───────────────────────────────────────────────────────────

async function executeTool(name, args) {
  try {
    let res;
    switch (name) {
      case "get_ad_accounts":
        res = await axios.get(`${BASE_URL}/me/adaccounts`, {
          params: { access_token: ACCESS_TOKEN, fields: "id,name,account_status,currency,spend_cap" }
        });
        break;
      case "get_ad_campaigns":
        res = await axios.get(`${BASE_URL}/act_${args.account_id}/campaigns`, {
          params: { access_token: ACCESS_TOKEN, fields: "id,name,status,objective,daily_budget,lifetime_budget" }
        });
        break;
      case "get_ad_insights":
        res = await axios.get(`${BASE_URL}/act_${args.account_id}/insights`, {
          params: { access_token: ACCESS_TOKEN, date_preset: args.date_preset || "last_7d", fields: "impressions,clicks,spend,reach,ctr,cpc,cpm" }
        });
        break;
      case "get_my_pages":
        res = await axios.get(`${BASE_URL}/me/accounts`, {
          params: { access_token: ACCESS_TOKEN, fields: "id,name,category,fan_count,followers_count" }
        });
        break;
      case "get_page_insights":
        res = await axios.get(`${BASE_URL}/${args.page_id}/insights`, {
          params: { access_token: ACCESS_TOKEN, metric: args.metric || "page_impressions,page_reach,page_engaged_users,page_fans", period: "day" }
        });
        break;
      case "get_page_posts":
        res = await axios.get(`${BASE_URL}/${args.page_id}/posts`, {
          params: { access_token: ACCESS_TOKEN, fields: "id,message,created_time,likes.summary(true),comments.summary(true)" }
        });
        break;
      case "get_instagram_account":
        res = await axios.get(`${BASE_URL}/${args.page_id}`, {
          params: { access_token: ACCESS_TOKEN, fields: "instagram_business_account{id,name,username,followers_count,media_count,biography}" }
        });
        break;
      case "get_instagram_media":
        res = await axios.get(`${BASE_URL}/${args.instagram_account_id}/media`, {
          params: { access_token: ACCESS_TOKEN, fields: "id,caption,media_type,timestamp,like_count,comments_count,permalink" }
        });
        break;
      case "get_instagram_insights":
        res = await axios.get(`${BASE_URL}/${args.instagram_account_id}/insights`, {
          params: { access_token: ACCESS_TOKEN, metric: args.metric || "impressions,reach,profile_views", period: args.period || "day" }
        });
        break;
      default:
        return { error: `Unknown tool: ${name}` };
    }
    return res.data;
  } catch (err) {
    return { error: err.response?.data || err.message };
  }
}

// ─── MCP ENDPOINT ─────────────────────────────────────────────────────────────

app.post("/mcp", async (req, res) => {
  const { method, params, id } = req.body;

  console.log("MCP Request:", method, JSON.stringify(params));

  if (method === "initialize") {
    return res.json({
      jsonrpc: "2.0",
      id,
      result: {
        protocolVersion: "2024-11-05",
        capabilities: { tools: {} },
        serverInfo: { name: "meta-mcp", version: "1.0.0" }
      }
    });
  }

  if (method === "notifications/initialized") {
    return res.status(204).send();
  }

  if (method === "tools/list") {
    return res.json({
      jsonrpc: "2.0",
      id,
      result: { tools }
    });
  }

  if (method === "tools/call") {
    const { name, arguments: args } = params;
    const result = await executeTool(name, args || {});
    return res.json({
      jsonrpc: "2.0",
      id,
      result: {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }]
      }
    });
  }

  return res.json({
    jsonrpc: "2.0",
    id,
    error: { code: -32601, message: `Method not found: ${method}` }
  });
});

app.get("/", (req, res) => {
  res.send("✅ Meta MCP Server is running! Endpoint: POST /mcp");
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Meta MCP Server running on port ${PORT}`);
});
