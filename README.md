Meta MCP Server v2 — 360 Nutrition
Custom MCP server exposing the Meta Marketing API to Claude, plus a CAPI `/track-order` endpoint for COD/DM order attribution.
What's new in v2
Custom date ranges — every insights tool accepts `since` / `until` (YYYY-MM-DD), not just fixed `date_preset` values
Daily breakdowns — pass `time_increment: 1` to get per-day rows (powers the Weekly Report format directly, no more CSV exports)
Breakdowns — `region`, `age,gender`, `publisher_platform`, etc.
Multi-account — every tool takes an optional `account_id`; defaults to the primary account
Tools (15)
Level	Tools
Account	`get_account_info`, `get_account_insights`
Campaign	`list_campaigns`, `get_campaign_insights`, `update_campaign_status`, `update_campaign_budget`
Adset	`list_adsets`, `get_adset_insights`, `update_adset_status`, `update_adset_budget`
Ad	`list_ads`, `get_ad_insights`, `update_ad_status`
Creative	`get_ad_creatives`, `get_creative_performance`
Plus REST endpoints: `POST /track-order` (CAPI Purchase events) and `GET /health`.
Deploy: GitHub → Railway (new account)
Create the GitHub repo
```bash
   cd meta-mcp-server
   git init
   git add .
   git commit -m "Meta MCP server v2"
   git branch -M main
   git remote add origin https://github.com/YOUR_USERNAME/meta-mcp-server.git
   git push -u origin main
   ```
Railway (new account)
New Project → Deploy from GitHub repo → select `meta-mcp-server`
Railway auto-detects Node and runs `npm start`
Set environment variables (Railway → project → Variables):
`META_ACCESS_TOKEN` — your System User token
`META_AD_ACCOUNT_ID` — `act_547254374038898`
`META_PIXEL_ID` — `1802945236759436`
Generate a public domain
Railway → Settings → Networking → Generate Domain. You'll get something like `https://meta-mcp-server-production-xxxx.up.railway.app`
Verify it's alive
Open `https://YOUR-DOMAIN.up.railway.app/health` in a browser — should return `{"ok":true,...}`
Connect to Claude
Claude → Settings → Connectors → Add custom connector:
Name: `META 360`
URL: `https://YOUR-DOMAIN.up.railway.app/mcp`
Token tips
Use a System User token from Business Settings (doesn't expire like user tokens)
Required permissions: `ads_read`, `ads_management`
If tools stop surfacing in Claude, first check `/health`, then check the token hasn't been invalidated
CAPI usage
```bash
curl -X POST https://YOUR-DOMAIN.up.railway.app/track-order \
  -H "Content-Type: application/json" \
  -d '{"order_id":"1234","value":850,"currency":"EGP","phone":"+201001234567","city":"Giza","source":"cod"}'
```
Events are deduplicated by `event_id = order_{order_id}`, so re-sending the same order is safe.
