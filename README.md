# Meta MCP Server

A Model Context Protocol (MCP) server for Facebook Ads, Facebook Pages, and Instagram.

## Tools Available

### Facebook Ads
- `get_ad_accounts` — List all your ad accounts
- `get_ad_campaigns` — Get campaigns for an account
- `get_ad_insights` — Get performance metrics

### Facebook Pages
- `get_my_pages` — List all your pages
- `get_page_insights` — Get page analytics
- `get_page_posts` — Get recent posts

### Instagram
- `get_instagram_account` — Get Instagram account info
- `get_instagram_media` — Get recent posts
- `get_instagram_insights` — Get account insights

## Deploy to Railway

1. Upload this folder to GitHub
2. Go to railway.app → New Project → Deploy from GitHub
3. Add environment variable: `META_ACCESS_TOKEN` = your token
4. Copy the deployed URL
5. Add `<your-url>/mcp` to Claude connectors

## Environment Variables

| Variable | Description |
|---|---|
| `META_ACCESS_TOKEN` | Your Meta Graph API access token |
| `PORT` | Auto-set by Railway |
