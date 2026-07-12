/**
 * Meta Ads MCP Server v2 — 360 Nutrition
 * ---------------------------------------
 * Streamable HTTP MCP server (endpoint: /mcp) exposing Meta Marketing API tools
 * + a /track-order REST endpoint for Meta CAPI (COD / DM order attribution).
 *
 * v2 improvements over v1:
 *  - Custom date ranges (since/until) on ALL insights tools — no longer limited to date_preset
 *  - time_increment support (e.g. 1 = per-day breakdown) for daily report extraction
 *  - Multi-account: account_id param on every tool, defaults to META_AD_ACCOUNT_ID env var
 *  - Breakdowns support (region, age, gender, publisher_platform, etc.)
 *
 * Env vars (set these in Railway):
 *  META_ACCESS_TOKEN   (required) System User long-lived token
 *  META_AD_ACCOUNT_ID  (default primary account, e.g. act_547254374038898)
 *  META_PIXEL_ID       (for /track-order CAPI events, e.g. 1802945236759436)
 *  PORT                (Railway injects this automatically)
 */

import express from "express";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";

const GRAPH = "https://graph.facebook.com/v21.0";
const TOKEN = process.env.META_ACCESS_TOKEN;
const DEFAULT_ACCOUNT = process.env.META_AD_ACCOUNT_ID || "act_547254374038898";
const PIXEL_ID = process.env.META_PIXEL_ID || "";

if (!TOKEN) {
  console.error("FATAL: META_ACCESS_TOKEN env var is not set.");
  process.exit(1);
}

/* ----------------------------- Graph API helpers ----------------------------- */

async function graph(path, params = {}, method = "GET") {
  const url = new URL(`${GRAPH}/${path}`);
  const opts = { method, headers: {} };

  if (method === "GET") {
    url.searchParams.set("access_token", TOKEN);
    for (const [k, v] of Object.entries(params)) {
      if (v === undefined || v === null || v === "") continue;
      url.searchParams.set(k, typeof v === "object" ? JSON.stringify(v) : String(v));
    }
  } else {
    const body = new URLSearchParams({ access_token: TOKEN });
    for (const [k, v] of Object.entries(params)) {
      if (v === undefined || v === null || v === "") continue;
      body.set(k, typeof v === "object" ? JSON.stringify(v) : String(v));
    }
    opts.body = body;
  }

  const res = await fetch(url, opts);
  const json = await res.json();
  if (json.error) {
    throw new Error(`Meta API error ${json.error.code}: ${json.error.message}`);
  }
  return json;
}

/** Normalize account id: accepts "act_123", "123" */
function acct(id) {
  const a = id || DEFAULT_ACCOUNT;
  return a.startsWith("act_") ? a : `act_${a}`;
}

/** Build insights params supporting both date_preset and custom since/until */
function insightsParams({ date_preset, since, until, time_increment, breakdowns, level, extra_fields }) {
  const fields = [
    "spend",
    "impressions",
    "reach",
    "frequency",
    "clicks",
    "ctr",
    "cpm",
    "cpc",
    "actions",
    "action_values",
    "purchase_roas",
    "cost_per_action_type",
  ];
  if (extra_fields) fields.push(...extra_fields);

  const p = { fields: fields.join(","), limit: 500 };

  if (since && until) {
    p.time_range = { since, until };
  } else {
    p.date_preset = date_preset || "yesterday";
  }
  if (time_increment) p.time_increment = time_increment;
  if (breakdowns) p.breakdowns = breakdowns;
  if (level) p.level = level;
  return p;
}

/** Extract purchases + revenue from an insights row for readability */
function summarizeRow(row) {
  const purchases =
    row.actions?.find((a) => a.action_type === "purchase" || a.action_type === "omni_purchase")?.value || "0";
  const revenue =
    row.action_values?.find((a) => a.action_type === "purchase" || a.action_type === "omni_purchase")?.value || "0";
  const roas = row.purchase_roas?.[0]?.value || (Number(row.spend) > 0 ? (Number(revenue) / Number(row.spend)).toFixed(2) : "0");
  const cpp = Number(purchases) > 0 ? (Number(row.spend) / Number(purchases)).toFixed(2) : null;
  return {
    ...row,
    _summary: {
      spend: row.spend,
      purchases,
      revenue,
      roas,
      cost_per_purchase: cpp,
      ctr: row.ctr,
      date: row.date_start === row.date_stop ? row.date_start : `${row.date_start} → ${row.date_stop}`,
    },
  };
}

function ok(data) {
  return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
}

/* --------------------------- Shared tool schemas --------------------------- */

const dateArgs = {
  date_preset: z
    .enum(["today", "yesterday", "last_7d", "last_14d", "last_28d", "last_30d", "this_month", "last_month", "this_quarter", "maximum"])
    .optional()
    .describe("Fixed date preset. Ignored if since/until are provided. Default: yesterday"),
  since: z.string().optional().describe("Custom range start, YYYY-MM-DD (use together with until)"),
  until: z.string().optional().describe("Custom range end, YYYY-MM-DD (use together with since)"),
  time_increment: z
    .number()
    .optional()
    .describe("Break results into N-day chunks. Use 1 for a per-day breakdown (daily report)."),
  breakdowns: z
    .string()
    .optional()
    .describe("Comma-separated breakdowns, e.g. 'region', 'age,gender', 'publisher_platform'"),
  account_id: z.string().optional().describe("Ad account id (act_...). Defaults to primary account."),
};

/* ------------------------------ Build MCP server ------------------------------ */

function buildServer() {
  const server = new McpServer({ name: "meta-360", version: "2.0.0" });

  /* ============ ACCOUNT LEVEL ============ */

  server.tool(
    "get_account_info",
    "Get ad account details: name, currency, timezone, spend cap, amount spent, account status.",
    { account_id: dateArgs.account_id },
    async ({ account_id }) => {
      const data = await graph(acct(account_id), {
        fields: "name,account_status,currency,timezone_name,spend_cap,amount_spent,balance,funding_source_details",
      });
      return ok(data);
    }
  );

  server.tool(
    "get_account_insights",
    "Account-level performance: spend, purchases, revenue, ROAS, CPP, CTR. Supports date_preset OR custom since/until, plus time_increment=1 for per-day rows and breakdowns (e.g. region).",
    dateArgs,
    async (args) => {
      const data = await graph(`${acct(args.account_id)}/insights`, insightsParams(args));
      return ok((data.data || []).map(summarizeRow));
    }
  );

  /* ============ CAMPAIGN LEVEL ============ */

  server.tool(
    "list_campaigns",
    "List campaigns with status, objective, budget, and start time. Filter by effective_status.",
    {
      account_id: dateArgs.account_id,
      effective_status: z
        .array(z.enum(["ACTIVE", "PAUSED", "ARCHIVED", "WITH_ISSUES"]))
        .optional()
        .describe("Filter, e.g. ['ACTIVE']"),
    },
    async ({ account_id, effective_status }) => {
      const params = {
        fields: "id,name,status,effective_status,objective,daily_budget,lifetime_budget,start_time,stop_time,buying_type",
        limit: 200,
      };
      if (effective_status) params.effective_status = effective_status;
      const data = await graph(`${acct(account_id)}/campaigns`, params);
      return ok(data.data || []);
    }
  );

  server.tool(
    "get_campaign_insights",
    "Per-campaign performance (spend, purchases, revenue, ROAS, CPP, CTR). Supports custom since/until dates, time_increment=1 for daily rows, and breakdowns.",
    {
      ...dateArgs,
      campaign_id: z.string().optional().describe("Specific campaign id. Omit to get ALL campaigns at account level."),
    },
    async (args) => {
      const path = args.campaign_id ? `${args.campaign_id}/insights` : `${acct(args.account_id)}/insights`;
      const params = insightsParams({ ...args, level: args.campaign_id ? undefined : "campaign", extra_fields: ["campaign_id", "campaign_name"] });
      const data = await graph(path, params);
      return ok((data.data || []).map(summarizeRow));
    }
  );

  server.tool(
    "update_campaign_status",
    "Pause or activate a campaign.",
    {
      campaign_id: z.string(),
      status: z.enum(["ACTIVE", "PAUSED"]),
    },
    async ({ campaign_id, status }) => {
      const data = await graph(campaign_id, { status }, "POST");
      return ok({ campaign_id, new_status: status, result: data });
    }
  );

  server.tool(
    "update_campaign_budget",
    "Update a campaign's daily budget (CBO campaigns). Amount in account currency minor units (EGP piasters: 1000 EGP = 100000).",
    {
      campaign_id: z.string(),
      daily_budget: z.number().describe("New daily budget in minor units (EGP x 100)"),
    },
    async ({ campaign_id, daily_budget }) => {
      const data = await graph(campaign_id, { daily_budget }, "POST");
      return ok({ campaign_id, new_daily_budget: daily_budget, result: data });
    }
  );

  /* ============ ADSET LEVEL ============ */

  server.tool(
    "list_adsets",
    "List ad sets, optionally within one campaign. Includes budget, targeting summary, optimization goal.",
    {
      account_id: dateArgs.account_id,
      campaign_id: z.string().optional().describe("Limit to one campaign"),
      effective_status: z.array(z.enum(["ACTIVE", "PAUSED", "ARCHIVED", "WITH_ISSUES"])).optional(),
    },
    async ({ account_id, campaign_id, effective_status }) => {
      const path = campaign_id ? `${campaign_id}/adsets` : `${acct(account_id)}/adsets`;
      const params = {
        fields:
          "id,name,status,effective_status,campaign_id,daily_budget,lifetime_budget,optimization_goal,billing_event,bid_strategy,targeting{age_min,age_max,genders,geo_locations,custom_audiences,flexible_spec},start_time",
        limit: 200,
      };
      if (effective_status) params.effective_status = effective_status;
      const data = await graph(path, params);
      return ok(data.data || []);
    }
  );

  server.tool(
    "get_adset_insights",
    "Per-adset performance. Supports custom since/until, time_increment=1 for daily rows, breakdowns.",
    {
      ...dateArgs,
      adset_id: z.string().optional().describe("Specific adset id. Omit for all adsets at account level."),
      campaign_id: z.string().optional().describe("Or scope to one campaign's adsets."),
    },
    async (args) => {
      let path;
      if (args.adset_id) path = `${args.adset_id}/insights`;
      else if (args.campaign_id) path = `${args.campaign_id}/insights`;
      else path = `${acct(args.account_id)}/insights`;
      const params = insightsParams({
        ...args,
        level: args.adset_id ? undefined : "adset",
        extra_fields: ["adset_id", "adset_name", "campaign_name"],
      });
      const data = await graph(path, params);
      return ok((data.data || []).map(summarizeRow));
    }
  );

  server.tool(
    "update_adset_status",
    "Pause or activate an ad set.",
    { adset_id: z.string(), status: z.enum(["ACTIVE", "PAUSED"]) },
    async ({ adset_id, status }) => {
      const data = await graph(adset_id, { status }, "POST");
      return ok({ adset_id, new_status: status, result: data });
    }
  );

  server.tool(
    "update_adset_budget",
    "Update an ad set's daily budget (ABO). Amount in minor units (EGP x 100).",
    { adset_id: z.string(), daily_budget: z.number() },
    async ({ adset_id, daily_budget }) => {
      const data = await graph(adset_id, { daily_budget }, "POST");
      return ok({ adset_id, new_daily_budget: daily_budget, result: data });
    }
  );

  /* ============ AD LEVEL ============ */

  server.tool(
    "list_ads",
    "List ads, optionally within one adset or campaign.",
    {
      account_id: dateArgs.account_id,
      adset_id: z.string().optional(),
      campaign_id: z.string().optional(),
      effective_status: z.array(z.enum(["ACTIVE", "PAUSED", "ARCHIVED", "WITH_ISSUES"])).optional(),
    },
    async ({ account_id, adset_id, campaign_id, effective_status }) => {
      let path;
      if (adset_id) path = `${adset_id}/ads`;
      else if (campaign_id) path = `${campaign_id}/ads`;
      else path = `${acct(account_id)}/ads`;
      const params = {
        fields: "id,name,status,effective_status,adset_id,campaign_id,creative{id}",
        limit: 200,
      };
      if (effective_status) params.effective_status = effective_status;
      const data = await graph(path, params);
      return ok(data.data || []);
    }
  );

  server.tool(
    "get_ad_insights",
    "Per-ad performance — use for creative winners/losers. Supports custom since/until, time_increment, breakdowns.",
    {
      ...dateArgs,
      ad_id: z.string().optional().describe("Specific ad id. Omit for all ads at account level."),
      adset_id: z.string().optional(),
    },
    async (args) => {
      let path;
      if (args.ad_id) path = `${args.ad_id}/insights`;
      else if (args.adset_id) path = `${args.adset_id}/insights`;
      else path = `${acct(args.account_id)}/insights`;
      const params = insightsParams({
        ...args,
        level: args.ad_id ? undefined : "ad",
        extra_fields: ["ad_id", "ad_name", "adset_name", "campaign_name"],
      });
      const data = await graph(path, params);
      return ok((data.data || []).map(summarizeRow));
    }
  );

  server.tool(
    "update_ad_status",
    "Pause or activate a single ad.",
    { ad_id: z.string(), status: z.enum(["ACTIVE", "PAUSED"]) },
    async ({ ad_id, status }) => {
      const data = await graph(ad_id, { status }, "POST");
      return ok({ ad_id, new_status: status, result: data });
    }
  );

  /* ============ CREATIVE LEVEL ============ */

  server.tool(
    "get_ad_creatives",
    "Get creative details (title, body, image/video, CTA, link) for an ad or list account creatives.",
    {
      account_id: dateArgs.account_id,
      ad_id: z.string().optional().describe("Get the creative of one ad. Omit to list account creatives."),
      limit: z.number().optional().default(50),
    },
    async ({ account_id, ad_id, limit }) => {
      if (ad_id) {
        const data = await graph(ad_id, {
          fields: "creative{id,name,title,body,object_story_spec,thumbnail_url,image_url,video_id,call_to_action_type,effective_object_story_id}",
        });
        return ok(data);
      }
      const data = await graph(`${acct(account_id)}/adcreatives`, {
        fields: "id,name,title,body,thumbnail_url,call_to_action_type,object_story_spec",
        limit,
      });
      return ok(data.data || []);
    }
  );

  server.tool(
    "get_creative_performance",
    "Ranked creative report: all ads with spend/ROAS/CPP/CTR sorted by spend, for the chosen period. Ideal for finding winning UGC/statics.",
    dateArgs,
    async (args) => {
      const params = insightsParams({ ...args, level: "ad", extra_fields: ["ad_id", "ad_name", "adset_name", "campaign_name"] });
      const data = await graph(`${acct(args.account_id)}/insights`, params);
      const rows = (data.data || []).map(summarizeRow).sort((a, b) => Number(b.spend) - Number(a.spend));
      return ok(rows);
    }
  );

  return server;
}

/* ------------------------------ Express + transport ------------------------------ */

const app = express();
app.use(express.json({ limit: "1mb" }));

// Health check (Railway + manual diagnostics)
app.get("/health", (_req, res) => {
  res.json({ ok: true, service: "meta-mcp-server", version: "2.0.0", default_account: DEFAULT_ACCOUNT, pixel_configured: Boolean(PIXEL_ID) });
});

// MCP endpoint — stateless: new server+transport per request (simple & robust on Railway)
app.post("/mcp", async (req, res) => {
  try {
    const server = buildServer();
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    res.on("close", () => {
      transport.close();
      server.close();
    });
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (err) {
    console.error("MCP request error:", err);
    if (!res.headersSent) {
      res.status(500).json({ jsonrpc: "2.0", error: { code: -32603, message: "Internal server error" }, id: null });
    }
  }
});

app.get("/mcp", (_req, res) => {
  res.status(405).json({ jsonrpc: "2.0", error: { code: -32000, message: "Method not allowed. Use POST." }, id: null });
});

/* ---------------------- CAPI: /track-order (COD & DM orders) ---------------------- */

import { createHash } from "crypto";
const sha256 = (s) => createHash("sha256").update(String(s).trim().toLowerCase()).digest("hex");

app.post("/track-order", async (req, res) => {
  try {
    if (!PIXEL_ID) return res.status(400).json({ error: "META_PIXEL_ID not configured" });

    const { order_id, value, currency = "EGP", phone, email, first_name, last_name, city, event_time, source = "cod" } = req.body || {};
    if (!order_id || !value) return res.status(400).json({ error: "order_id and value are required" });

    const user_data = {};
    if (phone) user_data.ph = [sha256(phone.replace(/\D/g, ""))];
    if (email) user_data.em = [sha256(email)];
    if (first_name) user_data.fn = [sha256(first_name)];
    if (last_name) user_data.ln = [sha256(last_name)];
    if (city) user_data.ct = [sha256(city)];
    user_data.country = [sha256("eg")];

    const event = {
      event_name: "Purchase",
      event_time: event_time || Math.floor(Date.now() / 1000),
      event_id: `order_${order_id}`,
      action_source: "website",
      user_data,
      custom_data: { currency, value: Number(value), order_id: String(order_id), content_type: "product", delivery_category: source === "cod" ? "home_delivery" : undefined },
    };

    const result = await graph(`${PIXEL_ID}/events`, { data: [event] }, "POST");
    res.json({ ok: true, events_received: result.events_received, order_id });
  } catch (err) {
    console.error("track-order error:", err);
    res.status(500).json({ error: err.message });
  }
});

/* --------------------------------- Start --------------------------------- */

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Meta MCP server v2 listening on :${PORT}`);
  console.log(`  MCP endpoint : POST /mcp`);
  console.log(`  CAPI endpoint: POST /track-order`);
  console.log(`  Health check : GET  /health`);
  console.log(`  Default acct : ${DEFAULT_ACCOUNT}`);
});
