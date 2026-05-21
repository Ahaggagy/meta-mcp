import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import express from "express";
import axios from "axios";
import { z } from "zod";

const ACCESS_TOKEN = process.env.META_ACCESS_TOKEN;
const BASE_URL = "https://graph.facebook.com/v19.0";

const server = new McpServer({ name: "meta-mcp", version: "1.0.0" });

// ─── FACEBOOK ADS TOOLS ───────────────────────────────────────────────────────

server.tool(
  "get_ad_accounts",
  "Get all Meta ad accounts associated with the user",
  {},
  async () => {
    const res = await axios.get(`${BASE_URL}/me/adaccounts`, {
      params: { access_token: ACCESS_TOKEN, fields: "id,name,account_status,currency,spend_cap" }
    });
    return { content: [{ type: "text", text: JSON.stringify(res.data, null, 2) }] };
  }
);

server.tool(
  "get_ad_campaigns",
  "Get all campaigns for a specific ad account",
  { account_id: z.string().describe("The ad account ID (without act_ prefix)") },
  async ({ account_id }) => {
    const res = await axios.get(`${BASE_URL}/act_${account_id}/campaigns`, {
      params: {
        access_token: ACCESS_TOKEN,
        fields: "id,name,status,objective,daily_budget,lifetime_budget,start_time,stop_time"
      }
    });
    return { content: [{ type: "text", text: JSON.stringify(res.data, null, 2) }] };
  }
);

server.tool(
  "get_ad_insights",
  "Get performance insights for an ad account",
  {
    account_id: z.string().describe("The ad account ID (without act_ prefix)"),
    date_preset: z.enum(["today", "yesterday", "last_7d", "last_30d", "this_month", "last_month"]).default("last_7d")
  },
  async ({ account_id, date_preset }) => {
    const res = await axios.get(`${BASE_URL}/act_${account_id}/insights`, {
      params: {
        access_token: ACCESS_TOKEN,
        date_preset,
        fields: "impressions,clicks,spend,reach,ctr,cpc,cpm,actions"
      }
    });
    return { content: [{ type: "text", text: JSON.stringify(res.data, null, 2) }] };
  }
);

// ─── FACEBOOK PAGES TOOLS ─────────────────────────────────────────────────────

server.tool(
  "get_my_pages",
  "Get all Facebook Pages managed by the user",
  {},
  async () => {
    const res = await axios.get(`${BASE_URL}/me/accounts`, {
      params: { access_token: ACCESS_TOKEN, fields: "id,name,category,fan_count,followers_count,verification_status" }
    });
    return { content: [{ type: "text", text: JSON.stringify(res.data, null, 2) }] };
  }
);

server.tool(
  "get_page_insights",
  "Get insights/analytics for a Facebook Page",
  {
    page_id: z.string().describe("The Facebook Page ID"),
    metric: z.string().default("page_impressions,page_reach,page_engaged_users,page_fans").describe("Comma-separated metrics")
  },
  async ({ page_id, metric }) => {
    const res = await axios.get(`${BASE_URL}/${page_id}/insights`, {
      params: { access_token: ACCESS_TOKEN, metric, period: "day" }
    });
    return { content: [{ type: "text", text: JSON.stringify(res.data, null, 2) }] };
  }
);

server.tool(
  "get_page_posts",
  "Get recent posts from a Facebook Page",
  { page_id: z.string().describe("The Facebook Page ID") },
  async ({ page_id }) => {
    const res = await axios.get(`${BASE_URL}/${page_id}/posts`, {
      params: {
        access_token: ACCESS_TOKEN,
        fields: "id,message,story,created_time,likes.summary(true),comments.summary(true),shares"
      }
    });
    return { content: [{ type: "text", text: JSON.stringify(res.data, null, 2) }] };
  }
);

// ─── INSTAGRAM TOOLS ──────────────────────────────────────────────────────────

server.tool(
  "get_instagram_account",
  "Get Instagram Business account connected to a Facebook Page",
  { page_id: z.string().describe("The Facebook Page ID connected to Instagram") },
  async ({ page_id }) => {
    const res = await axios.get(`${BASE_URL}/${page_id}`, {
      params: {
        access_token: ACCESS_TOKEN,
        fields: "instagram_business_account{id,name,username,followers_count,media_count,profile_picture_url,biography}"
      }
    });
    return { content: [{ type: "text", text: JSON.stringify(res.data, null, 2) }] };
  }
);

server.tool(
  "get_instagram_media",
  "Get recent Instagram posts/media",
  { instagram_account_id: z.string().describe("The Instagram Business Account ID") },
  async ({ instagram_account_id }) => {
    const res = await axios.get(`${BASE_URL}/${instagram_account_id}/media`, {
      params: {
        access_token: ACCESS_TOKEN,
        fields: "id,caption,media_type,timestamp,like_count,comments_count,permalink"
      }
    });
    return { content: [{ type: "text", text: JSON.stringify(res.data, null, 2) }] };
  }
);

server.tool(
  "get_instagram_insights",
  "Get insights for an Instagram Business account",
  {
    instagram_account_id: z.string().describe("The Instagram Business Account ID"),
    metric: z.string().default("impressions,reach,profile_views,follower_count").describe("Comma-separated metrics"),
    period: z.enum(["day", "week", "month"]).default("day")
  },
  async ({ instagram_account_id, metric, period }) => {
    const res = await axios.get(`${BASE_URL}/${instagram_account_id}/insights`, {
      params: { access_token: ACCESS_TOKEN, metric, period }
    });
    return { content: [{ type: "text", text: JSON.stringify(res.data, null, 2) }] };
  }
);

// ─── EXPRESS SERVER ───────────────────────────────────────────────────────────

const app = express();
app.use(express.json());

app.post("/mcp", async (req, res) => {
  try {
    const transport = new StreamableHTTPServerTransport({ sessionManagement: "none" });
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (err) {
    console.error("MCP error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.get("/", (req, res) => {
  res.send("✅ Meta MCP Server is running! Endpoint: POST /mcp");
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Meta MCP Server running on port ${PORT}`);
});
