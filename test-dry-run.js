#!/usr/bin/env node
'use strict';

/**
 * Dry-run validation for n8n workflow JSON files.
 * Validates structure, connections, node references, code execution, and Claude prompts.
 * No dependencies required — run with: node test-dry-run.js
 */

const fs = require('fs');
const path = require('path');

// ─── Helpers ────────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;
const failures = [];

function pass(label) {
  passed++;
  console.log(`  ✓ ${label}`);
}

function fail(label, detail) {
  failed++;
  const msg = detail ? `${label}: ${detail}` : label;
  failures.push(msg);
  console.log(`  ✗ ${msg}`);
}

function assert(condition, label, detail) {
  if (condition) pass(label);
  else fail(label, detail);
}

function section(title) {
  console.log(`\n━━━ ${title} ━━━`);
}

// ─── Load workflows ─────────────────────────────────────────────────────────

const DIR = __dirname;
const WORKFLOW_FILES = [
  'workflow-research-pipeline.json',
  'workflow-weekly-report.json',
];

const workflows = {};

section('0. File Loading');
for (const file of WORKFLOW_FILES) {
  const fp = path.join(DIR, file);
  try {
    const raw = fs.readFileSync(fp, 'utf8');
    workflows[file] = JSON.parse(raw);
    pass(`${file} parses as valid JSON`);
  } catch (e) {
    fail(`${file} parses as valid JSON`, e.message);
    workflows[file] = null;
  }
}

// ─── Mock data ──────────────────────────────────────────────────────────────

const MOCK_SEARXNG_COMPANY = {
  results: [
    {
      title: 'Acme Corp | LinkedIn',
      url: 'https://www.linkedin.com/company/acme',
      content: 'Acme Corp is a technology company specializing in cloud solutions...',
    },
  ],
};

const MOCK_SEARXNG_LEADERS = {
  results: [
    {
      title: 'Jane Doe - CTO - Acme Corp | LinkedIn',
      url: 'https://www.linkedin.com/in/janedoe',
      content: 'Chief Technology Officer at Acme Corp. Former VP Engineering at BigCo.',
    },
    {
      title: 'John Smith - CISO - Acme Corp | LinkedIn',
      url: 'https://www.linkedin.com/in/johnsmith',
      content: 'Chief Information Security Officer at Acme Corp. Cybersecurity expert.',
    },
  ],
};

const MOCK_PARSED_LEADERS = {
  people: [
    {
      name: 'Jane Doe',
      title: 'CTO',
      linkedin_url: 'https://www.linkedin.com/in/janedoe',
      source: 'searxng',
      snippet: 'Chief Technology Officer at Acme Corp. Former VP Engineering at BigCo.',
    },
    {
      name: 'John Smith',
      title: 'CISO',
      linkedin_url: 'https://www.linkedin.com/in/johnsmith',
      source: 'searxng',
      snippet: 'Chief Information Security Officer at Acme Corp. Cybersecurity expert.',
    },
  ],
  totalFound: 2,
};

const MOCK_SEC_EDGAR = {
  hits: {
    hits: [
      {
        _source: {
          form_type: '10-K',
          file_date: '2025-06-15',
          entity_name: 'Acme Corp',
          file_url: '/Archives/edgar/data/123/filing.htm',
          accession_no: '0001234-25-000001',
        },
      },
    ],
  },
};

const MOCK_FILING_HTML =
  '<html><body>Technology investments include cloud migration and cybersecurity initiatives. ' +
  'Information technology infrastructure modernization is underway.</body></html>';

const MOCK_CLAUDE_RESPONSE = {
  content: [
    {
      text: JSON.stringify({
        company: { name: 'Acme Corp', ticker: 'ACME', website: 'acme.com' },
        it_leaders: [
          {
            name: 'Jane Doe',
            title: 'CTO',
            linkedin_url: 'https://linkedin.com/in/janedoe',
            key_background: 'Former VP Engineering at BigCo',
            talking_points: ['Cloud migration expert', 'Led digital transformation'],
          },
        ],
        strategic_initiatives: [
          {
            initiative: 'Cloud Migration',
            description: 'Multi-year cloud migration program',
            filing_reference: '10-K 2025',
          },
        ],
        technology_themes: [
          { theme: 'Cloud', priority: 'high', evidence: '10-K filing mentions cloud 15 times' },
        ],
        summary: 'Acme Corp is investing heavily in cloud and cybersecurity.',
      }),
    },
  ],
};

const MOCK_CLAUDE_DELTA_RESPONSE = {
  content: [
    {
      text: JSON.stringify({
        company: 'Acme Corp',
        week_of: '2026-01-30',
        new_leaders: [],
        changed_leaders: [],
        departed_leaders: [],
        new_filings: [],
        new_initiatives: [],
        updated_themes: [],
        executive_summary: 'No significant changes this week.',
      }),
    },
  ],
};

const MOCK_COMPANY_ROW = {
  'Company Name': 'Acme Corp',
  Ticker: 'ACME',
  Website: 'acme.com',
  'LinkedIn URL': '',
  Status: '',
  'Last Researched': '',
};

const MOCK_EXISTING_LEADERS = [
  {
    Company: 'Acme Corp',
    Name: 'Jane Doe',
    Title: 'CTO',
    'LinkedIn URL': 'https://linkedin.com/in/janedoe',
    'Key Background': 'Former VP Engineering at BigCo',
    'Talking Points': 'Cloud migration expert; Led digital transformation',
    'Date Found': '2026-01-20',
  },
];

// ─── 1. Schema Validation ───────────────────────────────────────────────────

section('1. Schema Validation');

const REQUIRED_TOP_KEYS = ['name', 'nodes', 'connections', 'settings'];
const REQUIRED_NODE_KEYS = ['id', 'name', 'type', 'position'];

for (const [file, wf] of Object.entries(workflows)) {
  if (!wf) continue;
  const label = wf.name || file;

  // Top-level keys
  for (const key of REQUIRED_TOP_KEYS) {
    assert(
      wf[key] !== undefined,
      `[${label}] has top-level key "${key}"`,
    );
  }

  assert(Array.isArray(wf.nodes), `[${label}] "nodes" is an array`);
  assert(
    typeof wf.connections === 'object' && !Array.isArray(wf.connections),
    `[${label}] "connections" is an object`,
  );

  // Node structure
  let allNodesValid = true;
  const badNodes = [];
  for (const node of wf.nodes) {
    for (const key of REQUIRED_NODE_KEYS) {
      if (node[key] === undefined) {
        allNodesValid = false;
        badNodes.push(`${node.name || node.id || '?'} missing "${key}"`);
      }
    }
    // Position must be array of 2 numbers
    if (
      !Array.isArray(node.position) ||
      node.position.length !== 2 ||
      typeof node.position[0] !== 'number' ||
      typeof node.position[1] !== 'number'
    ) {
      allNodesValid = false;
      badNodes.push(`${node.name || '?'} invalid position`);
    }
    // Type prefix
    if (typeof node.type === 'string' && !node.type.startsWith('n8n-nodes-base.')) {
      allNodesValid = false;
      badNodes.push(`${node.name || '?'} type "${node.type}" missing n8n-nodes-base. prefix`);
    }
  }
  assert(
    allNodesValid,
    `[${label}] all nodes have required fields and valid structure`,
    badNodes.join('; '),
  );
}

// ─── 2. Connection Graph ────────────────────────────────────────────────────

section('2. Connection Graph');

for (const [file, wf] of Object.entries(workflows)) {
  if (!wf) continue;
  const label = wf.name || file;
  const nodeNames = new Set(wf.nodes.map((n) => n.name));

  // Trigger node types
  const TRIGGER_TYPES = [
    'n8n-nodes-base.manualTrigger',
    'n8n-nodes-base.googleSheetsTrigger',
    'n8n-nodes-base.scheduleTrigger',
  ];
  const triggerNames = new Set(
    wf.nodes.filter((n) => TRIGGER_TYPES.includes(n.type)).map((n) => n.name),
  );

  // Every source node in connections exists
  let allSourcesValid = true;
  const badSources = [];
  for (const srcName of Object.keys(wf.connections)) {
    if (!nodeNames.has(srcName)) {
      allSourcesValid = false;
      badSources.push(srcName);
    }
  }
  assert(
    allSourcesValid,
    `[${label}] all connection source nodes exist`,
    `missing: ${badSources.join(', ')}`,
  );

  // Every target node in connections exists
  let allTargetsValid = true;
  const badTargets = [];
  for (const [srcName, outputs] of Object.entries(wf.connections)) {
    const mainOutputs = outputs.main || [];
    for (const outputGroup of mainOutputs) {
      if (!Array.isArray(outputGroup)) continue;
      for (const conn of outputGroup) {
        if (!nodeNames.has(conn.node)) {
          allTargetsValid = false;
          badTargets.push(`${srcName} → ${conn.node}`);
        }
      }
    }
  }
  assert(
    allTargetsValid,
    `[${label}] all connection target nodes exist`,
    `missing: ${badTargets.join(', ')}`,
  );

  // Reachability: BFS from triggers
  const reachable = new Set(triggerNames);
  const queue = [...triggerNames];
  while (queue.length > 0) {
    const current = queue.shift();
    const outputs = wf.connections[current];
    if (!outputs || !outputs.main) continue;
    for (const outputGroup of outputs.main) {
      if (!Array.isArray(outputGroup)) continue;
      for (const conn of outputGroup) {
        if (!reachable.has(conn.node)) {
          reachable.add(conn.node);
          queue.push(conn.node);
        }
      }
    }
  }

  const unreachableNodes = [];
  for (const node of wf.nodes) {
    if (!triggerNames.has(node.name) && !reachable.has(node.name)) {
      unreachableNodes.push(node.name);
    }
  }
  assert(
    unreachableNodes.length === 0,
    `[${label}] all non-trigger nodes are reachable`,
    `unreachable: ${unreachableNodes.join(', ')}`,
  );

  // Loop-back connects to splitInBatches
  const splitNodes = new Set(
    wf.nodes
      .filter((n) => n.type === 'n8n-nodes-base.splitInBatches')
      .map((n) => n.name),
  );
  const loopBackNodes = wf.nodes.filter((n) => n.type === 'n8n-nodes-base.noOp');
  for (const lb of loopBackNodes) {
    const conn = wf.connections[lb.name];
    if (!conn || !conn.main) continue;
    const targets = conn.main
      .flat()
      .filter(Boolean)
      .map((c) => c.node);
    const connectsToSplit = targets.some((t) => splitNodes.has(t));
    assert(
      connectsToSplit,
      `[${label}] "${lb.name}" loops back to a splitInBatches node`,
      `targets: ${targets.join(', ')}`,
    );
  }
}

// ─── 3. Node Name References ────────────────────────────────────────────────

section('3. Node Name References');

for (const [file, wf] of Object.entries(workflows)) {
  if (!wf) continue;
  const label = wf.name || file;
  const nodeNames = new Set(wf.nodes.map((n) => n.name));

  // Collect all $('...') references from the entire JSON
  const jsonStr = JSON.stringify(wf);
  const refPattern = /\$\('([^']+)'\)/g;
  const allRefs = new Set();
  let match;
  while ((match = refPattern.exec(jsonStr)) !== null) {
    allRefs.add(match[1]);
  }

  const missingRefs = [];
  for (const ref of allRefs) {
    if (!nodeNames.has(ref)) {
      missingRefs.push(ref);
    }
  }
  assert(
    missingRefs.length === 0,
    `[${label}] all $('NodeName') references point to existing nodes`,
    `missing: ${missingRefs.join(', ')}`,
  );

  pass(`[${label}] found ${allRefs.size} node references, all valid`);
}

// ─── 4. Code Node Execution ─────────────────────────────────────────────────

section('4. Code Node Execution');

/**
 * Build a mock $() function and $input/$json for executing code nodes.
 * The mock returns data appropriate for the referenced node name.
 */
function buildMockContext(workflowName) {
  const mockNodeData = {
    // Research Pipeline mocks
    'SEC EDGAR Search 10-K': MOCK_SEC_EDGAR,
    'Fetch 10-K Filing': { data: MOCK_FILING_HTML, body: MOCK_FILING_HTML },
    'Parse EDGAR Results': {
      filingUrl: 'https://www.sec.gov/Archives/edgar/data/123/filing.htm',
      filings: [
        { form: '10-K', date: '2025-06-15', company: 'Acme Corp', url: '/Archives/edgar/data/123/filing.htm' },
      ],
      rawResultAvailable: true,
    },
    'Claude Analysis': MOCK_CLAUDE_RESPONSE,
    'Loop Over Companies': MOCK_COMPANY_ROW,
    'SearXNG Company Search': MOCK_SEARXNG_COMPANY,
    'SearXNG Search IT Leaders': MOCK_SEARXNG_LEADERS,
    'Parse LinkedIn Results': MOCK_PARSED_LEADERS,
    'Format Results': {
      companyName: 'Acme Corp',
      leaderRows: [
        {
          Company: 'Acme Corp',
          Name: 'Jane Doe',
          Title: 'CTO',
          'LinkedIn URL': 'https://linkedin.com/in/janedoe',
          'Key Background': 'Former VP Engineering at BigCo',
          'Talking Points': 'Cloud migration expert; Led digital transformation',
          'Date Found': '2026-01-30',
        },
        {
          Company: 'Acme Corp',
          Name: 'John Smith',
          Title: 'CISO',
          'LinkedIn URL': 'https://linkedin.com/in/johnsmith',
          'Key Background': 'Security expert',
          'Talking Points': 'Zero trust advocate',
          'Date Found': '2026-01-30',
        },
      ],
      docContent: '# Acme Corp - IT Leadership Research\n...',
      analysis: JSON.parse(MOCK_CLAUDE_RESPONSE.content[0].text),
    },
    // Weekly Report mocks
    'SEC EDGAR Check New Filings': MOCK_SEC_EDGAR,
    'Claude Delta Analysis': MOCK_CLAUDE_DELTA_RESPONSE,
    'Read Existing Leaders': MOCK_EXISTING_LEADERS,
    'Format Weekly Delta': {
      companyName: 'Acme Corp',
      weeklyUpdateText: '### Week of 2026-01-30\n\n**Summary:** No significant changes.',
      newLeaderRows: [],
      masterSummaryLine: '**Acme Corp:** No significant changes this week.',
      weekOf: '2026-01-30',
      delta: JSON.parse(MOCK_CLAUDE_DELTA_RESPONSE.content[0].text),
    },
    'Parse New Filings': {
      newFilings: [
        { form: '10-K', date: '2025-06-15', company: 'Acme Corp', url: '/Archives/edgar/data/123/filing.htm', accession: '0001234-25-000001' },
      ],
      hasNewFilings: true,
    },
  };

  // $('NodeName') returns an object with .item.json
  function $(nodeName) {
    const data = mockNodeData[nodeName];
    if (data === undefined) {
      return { item: { json: {} } };
    }
    // If data is an array, treat as multiple items (e.g. Read Existing Leaders)
    if (Array.isArray(data)) {
      return { item: { json: data[0] || {} } };
    }
    return { item: { json: data } };
  }

  // $input for nodes that use $input.all()
  const $input = {
    all() {
      return [
        { json: { companyName: 'Acme Corp', summaryLine: '**Acme Corp:** No significant changes this week.' } },
        { json: { companyName: 'Widget Inc', summaryLine: '**Widget Inc:** New CTO appointed.' } },
      ];
    },
  };

  // $json is the current item's json
  const $json = {
    filingText: 'Technology investments include cloud migration and cybersecurity...',
    filingUrl: 'https://www.sec.gov/Archives/edgar/data/123/filing.htm',
    filings: [{ form: '10-K', date: '2025-06-15', company: 'Acme Corp', url: '' }],
  };

  return { $, $input, $json };
}

for (const [file, wf] of Object.entries(workflows)) {
  if (!wf) continue;
  const label = wf.name || file;

  const codeNodes = wf.nodes.filter((n) => n.type === 'n8n-nodes-base.code');

  for (const node of codeNodes) {
    const jsCode = node.parameters?.jsCode;
    if (!jsCode) {
      fail(`[${label}] "${node.name}" has jsCode`);
      continue;
    }

    const { $, $input, $json } = buildMockContext(label);

    try {
      // Wrap the code in a function. n8n code nodes implicitly return the last expression
      // or use explicit `return`. We wrap in an IIFE.
      const wrappedCode = `
        const $ = arguments[0];
        const $input = arguments[1];
        const $json = arguments[2];
        ${jsCode}
      `;

      const fn = new Function(wrappedCode);
      const result = fn($, $input, $json);

      // Verify it returns something (not undefined/null for most nodes)
      if (result === undefined || result === null) {
        // Some code nodes return arrays — check if the code uses `return [...`
        // Actually n8n code nodes always return; if undefined, that's also OK in some cases
        // But per the plan we want to verify it returns an object
        fail(`[${label}] "${node.name}" returns a value`, 'got undefined/null');
      } else {
        pass(`[${label}] "${node.name}" executes without error and returns ${typeof result}`);
      }
    } catch (e) {
      fail(`[${label}] "${node.name}" executes without error`, e.message);
    }
  }
}

// ─── 5. Claude Request Validation ───────────────────────────────────────────

section('5. Claude Request Validation');

for (const [file, wf] of Object.entries(workflows)) {
  if (!wf) continue;
  const label = wf.name || file;

  // Find HTTP request nodes that POST to Claude
  const claudeNodes = wf.nodes.filter(
    (n) =>
      n.type === 'n8n-nodes-base.httpRequest' &&
      n.parameters?.url === 'https://api.anthropic.com/v1/messages' &&
      n.parameters?.method === 'POST',
  );

  for (const node of claudeNodes) {
    const jsonBodyRaw = node.parameters?.jsonBody;
    if (!jsonBodyRaw) {
      fail(`[${label}] "${node.name}" has jsonBody`);
      continue;
    }

    // Strip the leading = that n8n uses for expression mode
    let bodyStr = jsonBodyRaw;
    if (bodyStr.startsWith('=')) bodyStr = bodyStr.slice(1);

    // Replace n8n expressions {{ ... }} with a plain placeholder for JSON
    // validation.  All current expressions live inside JSON string values,
    // so we must NOT add extra quotes around the placeholder.
    bodyStr = bodyStr.replace(/\{\{[^}]+\}\}/g, '__EXPRESSION__');

    try {
      const bodyObj = JSON.parse(bodyStr);

      assert(
        typeof bodyObj.model === 'string' && bodyObj.model.length > 0,
        `[${label}] "${node.name}" has "model" field`,
        `got: ${bodyObj.model}`,
      );
      assert(
        typeof bodyObj.max_tokens === 'number' && bodyObj.max_tokens > 0,
        `[${label}] "${node.name}" has valid "max_tokens"`,
        `got: ${bodyObj.max_tokens}`,
      );
      assert(
        typeof bodyObj.system === 'string' && bodyObj.system.length > 0,
        `[${label}] "${node.name}" has "system" prompt`,
      );
      assert(
        Array.isArray(bodyObj.messages) && bodyObj.messages.length > 0,
        `[${label}] "${node.name}" has "messages" array`,
      );

      // Check that messages have role and content
      for (let i = 0; i < bodyObj.messages.length; i++) {
        const msg = bodyObj.messages[i];
        assert(
          msg.role && msg.content,
          `[${label}] "${node.name}" message[${i}] has role and content`,
        );
      }

      // Check that expression node references in the user message exist in workflow
      const nodeNames = new Set(wf.nodes.map((n) => n.name));
      const userContent = jsonBodyRaw; // Use original with expressions
      const exprRefPattern = /\$\('([^']+)'\)/g;
      const promptRefs = new Set();
      let m;
      while ((m = exprRefPattern.exec(userContent)) !== null) {
        promptRefs.add(m[1]);
      }
      const missingPromptRefs = [];
      for (const ref of promptRefs) {
        if (!nodeNames.has(ref)) {
          missingPromptRefs.push(ref);
        }
      }
      assert(
        missingPromptRefs.length === 0,
        `[${label}] "${node.name}" prompt node references are valid`,
        `missing: ${missingPromptRefs.join(', ')}`,
      );

      pass(`[${label}] "${node.name}" JSON body is structurally valid`);
    } catch (e) {
      fail(
        `[${label}] "${node.name}" jsonBody parses as valid JSON (after expression substitution)`,
        e.message,
      );
    }
  }
}

// ─── Report ─────────────────────────────────────────────────────────────────

section('RESULTS');
console.log(`  Passed: ${passed}`);
console.log(`  Failed: ${failed}`);

if (failures.length > 0) {
  console.log('\nFailures:');
  for (const f of failures) {
    console.log(`  - ${f}`);
  }
}

console.log(`\n${failed === 0 ? 'ALL CHECKS PASSED' : 'SOME CHECKS FAILED'}`);
process.exit(failed === 0 ? 0 : 1);
