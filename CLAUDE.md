# Project Preferences

## Workflow
- For every task, always open a GitHub issue to track it
- Work through issues systematically, closing them as completed
- Create PRs for code changes and link them to issues

## Project Context
- This repo contains two n8n workflow JSON files for company IT leadership research
- **workflow-research-pipeline.json** — triggered on new Google Sheet row, researches a company end-to-end
- **workflow-weekly-report.json** — runs weekly on cron, produces delta reports on leadership changes
- External services: Anthropic Claude API, Google Sheets/Docs/Drive, SEC EDGAR, LinkedIn data (currently Apollo.io, may migrate to Google Custom Search)
- **test-dry-run.js** — offline validation script (schema, connections, references, code execution, Claude prompts)

## Tech Stack
- n8n (workflow automation, self-hosted instance exists)
- Node.js
- Google Cloud (OAuth2 for Sheets/Docs/Drive APIs)
- Anthropic Claude API (claude-sonnet-4-20250514)

## Conventions
- Commit messages should be descriptive with a summary line and body
- PRs should include a test plan
