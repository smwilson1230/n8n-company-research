# Project Preferences

## Workflow
- For every task, always open a GitHub issue to track it
- Work through issues systematically, closing them as completed
- Create PRs for code changes and link them to issues

## Project Context
- This repo contains two n8n workflow JSON files for company IT leadership research
- **workflow-research-pipeline.json** — triggered on new Google Sheet row, researches a company end-to-end
- **workflow-weekly-report.json** — runs weekly on cron, produces delta reports on leadership changes
- External services: Anthropic Claude API, Google Sheets/Docs/Drive, SEC EDGAR, SearXNG (self-hosted, LinkedIn X-ray search)
- SearXNG runs locally (default `http://localhost:8080`), configured via `SEARXNG_URL` env var
- LinkedIn data is gathered via X-ray search (`site:linkedin.com/in` queries), parsed by a Code node
- **test-dry-run.js** — offline validation script (schema, connections, references, code execution, Claude prompts)

## Tech Stack
- n8n (workflow automation, self-hosted instance exists)
- Node.js
- Google Cloud (OAuth2 for Sheets/Docs/Drive APIs)
- Anthropic Claude API (claude-sonnet-4-20250514)

## Setup: Google Sheet & Drive Folder
1. Go to https://script.google.com → **New Project**
2. Paste the contents of `scripts/setup-google-sheet.gs` into the editor
3. Run the `setup()` function and authorize when prompted
4. Copy the three environment variable IDs from the alert dialog:
   - `GOOGLE_SHEET_ID`
   - `GOOGLE_DRIVE_FOLDER_ID`
   - `MASTER_SUMMARY_DOC_ID`
5. Add these to your n8n instance environment variables

## Setup: n8n Environment Variables
1. Copy `.env.example` to `.env` and fill in your `ANTHROPIC_API_KEY`
2. Pass the `.env` file to your n8n instance (e.g. `docker run --env-file .env ...` or source it before `npx n8n`)

## Testing
- Run `node test-dry-run.js` before committing changes to workflow JSON files or the test script
- All checks must pass (0 failures) before merging

## Conventions
- Commit messages should be descriptive with a summary line and body
- PRs should include a test plan
