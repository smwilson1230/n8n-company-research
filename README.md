# n8n Company Research Automation

Two n8n workflows that automate IT leadership research: one for initial company research, one for weekly incremental updates.

## Prerequisites

- [n8n](https://n8n.io/) instance (self-hosted or cloud)
- Google Cloud project with Sheets and Docs APIs enabled
- [Proxycurl](https://nubela.co/proxycurl/) API key
- [Anthropic](https://console.anthropic.com/) API key

## Workflows

### 1. Company Research Pipeline (`workflow-research-pipeline.json`)

Triggered when a new row is added to the Google Sheet or run manually. For each company it:

1. Resolves the company's LinkedIn URL via Proxycurl
2. Searches for IT leaders (CIO, CTO, CISO, CDO, VPs, Directors) via Proxycurl Employee Search
3. Searches SEC EDGAR for recent 10-K filings and extracts technology-related sections
4. Sends all collected data to Claude for structured analysis
5. Writes leader profiles to the "Leaders" sheet tab
6. Creates a per-company Google Doc with the full research report
7. Updates the company's status and last-researched date

### 2. Weekly Report Generator (`workflow-weekly-report.json`)

Runs every Monday at 8:00 AM (or manually). For each company it:

1. Re-runs Proxycurl search for current IT leaders
2. Checks SEC EDGAR for new filings since the last research date
3. Reads existing leader records from the sheet
4. Sends current + previous data to Claude for delta analysis
5. Appends a dated weekly update section to the company's Google Doc
6. Adds any new leaders to the "Leaders" sheet
7. After all companies, appends a cross-company summary to a master Google Doc

## Setup

### 1. Google Sheets Template

Create a Google Sheet with two tabs:

**Tab: "Companies"**

| Company Name | Ticker | Website | LinkedIn URL | Status | Last Researched |
|---|---|---|---|---|---|

**Tab: "Leaders"**

| Company | Name | Title | LinkedIn URL | Key Background | Talking Points | Date Found |
|---|---|---|---|---|---|---|

### 2. Google Docs

Create two Google Docs:

- **Master Summary Doc** — the weekly cross-company summary will be appended here
- Per-company docs are created automatically by Workflow 1

### 3. Configure n8n Credentials

In your n8n instance, create the following credentials:

#### Google OAuth2
- Type: **Google OAuth2 API**
- Name: `Google OAuth2`
- Scopes: Google Sheets (read/write), Google Docs (read/write), Google Drive (read)
- Follow [n8n Google OAuth2 guide](https://docs.n8n.io/integrations/builtin/credentials/google/oauth-single-service/)

#### Proxycurl API Key
- Type: **Header Auth**
- Name: `Proxycurl API Key`
- Header Name: `Authorization`
- Header Value: `Bearer YOUR_PROXYCURL_API_KEY`

#### Anthropic API Key
- Type: **Header Auth**
- Name: `Anthropic API Key`
- Header Name: `x-api-key`
- Header Value: `YOUR_ANTHROPIC_API_KEY`

> **Note:** The workflows reference these credentials by name. If you use different names, update the credential references in each workflow after import.

### 4. Environment Variables

Set these environment variables in your n8n instance (Settings → Environment Variables, or via `N8N_` prefix in your env):

| Variable | Description | Example |
|---|---|---|
| `GOOGLE_SHEET_ID` | ID of your Google Sheet (from the URL) | `1AbCdEfGhIjKlMnOpQrStUvWxYz` |
| `GOOGLE_DRIVE_FOLDER_ID` | Google Drive folder for research docs (optional) | `1AbCdEfGhIjKl` |
| `MASTER_SUMMARY_DOC_ID` | Google Doc ID for the weekly master summary | `1AbCdEfGhIjKlMnOp` |
| `ANTHROPIC_API_KEY` | Your Anthropic API key | `sk-ant-...` |
| `SEC_EDGAR_USER_AGENT` | Required by SEC — your name and email | `CompanyName research@yourcompany.com` |

For per-company Google Doc updates in Workflow 2, set environment variables in the format:
```
COMPANY_DOC_<COMPANY_NAME>=<GOOGLE_DOC_ID>
```
Where `<COMPANY_NAME>` is the company name with non-alphanumeric characters replaced by underscores, uppercased. For example:
```
COMPANY_DOC_ACME_CORP=1xYzAbCdEfGh
```

### 5. Import Workflows

1. Open your n8n instance
2. Go to **Workflows** → **Import from File**
3. Import `workflow-research-pipeline.json`
4. Import `workflow-weekly-report.json`
5. Open each workflow, verify credential bindings on all nodes, and activate

## How It Works

### Data Flow — Research Pipeline

```
Google Sheet (new row)
  → Proxycurl: resolve company LinkedIn URL
  → Proxycurl: search IT leaders by title keywords
  → SEC EDGAR: search for 10-K filings (past year)
  → SEC EDGAR: fetch and parse filing HTML
  → Claude: analyze leaders + filings → structured JSON
  → Google Sheets: write leader profiles to "Leaders" tab
  → Google Docs: create per-company research document
  → Google Sheets: update company status
```

### Data Flow — Weekly Report

```
Cron (Monday 8am)
  → Read all companies from sheet
  → For each company:
      → Proxycurl: fresh leader search
      → SEC EDGAR: check for new filings since last run
      → Read existing leaders from sheet
      → Claude: compare new vs existing → delta JSON
      → Google Docs: append weekly update to company doc
      → Google Sheets: write any new leaders
      → Google Sheets: update last-researched date
  → Claude/Code: build cross-company summary
  → Google Docs: append to master summary doc
```

### Rate Limiting

The workflows include Wait nodes between API calls:
- **Proxycurl**: 1-second pause between calls
- **SEC EDGAR**: 0.5-second pause (SEC allows 10 req/sec but conservative is safer)
- **Claude API**: No explicit wait needed (rate limits are per-minute)

### Error Handling

All HTTP Request nodes have `continueOnFail: true` so the workflow continues processing remaining companies even if one API call fails. Check n8n execution logs for any failures.

## Verification

1. Import both workflows into n8n
2. Configure all credentials (Google OAuth2, Proxycurl, Anthropic)
3. Set the required environment variables
4. Add 1-2 test companies to the "Companies" sheet tab
5. Run **Workflow 1** manually — verify:
   - Leader rows appear in the "Leaders" tab
   - A Google Doc is created for each company
   - Company status updated to "Researched"
6. Run **Workflow 2** manually — verify:
   - Weekly update section appended to company docs
   - Master summary doc updated
   - Last Researched date updated

## API Reference

- [Proxycurl API Docs](https://nubela.co/proxycurl/docs)
- [SEC EDGAR Full-Text Search](https://efts.sec.gov/LATEST/)
- [Anthropic API Reference](https://docs.anthropic.com/en/api)
- [n8n Documentation](https://docs.n8n.io/)

## Cost Considerations

- **Proxycurl**: Company resolve (~$1/call) + Employee search (~$10/call with enrichment). Budget ~$11 per company per run.
- **Anthropic Claude**: ~$0.01-0.10 per analysis depending on filing length.
- **SEC EDGAR**: Free, no API key required (just a User-Agent header).
- **Google APIs**: Free within standard quotas.
