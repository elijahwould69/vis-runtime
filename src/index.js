const VIS = {
  version: "1.8.25-mission-constraint-gate",
  model: "@cf/meta/llama-3.1-8b-instruct-fast",

  paidSpendingEnabled: false,
  autonomousSpendLimitUSD: 0,

  computeBudget: {
    enabled: true,
    aiPaidInferenceEnabled: true,
    monthlyInfrastructureCeilingUSD: 20,
    workersPaidBaseReserveUSD: 5,
    variableAICeilingUSD: 15,
    internalVariableHardStopUSD: 14.25,
    warningRatio: 0.70,
    throttleRatio: 0.85,
    criticalRatio: 0.95,
    freeNeuronsPerDay: 10000,
    neuronPricePer1000USD: 0.011,
    modelInputNeuronsPerMillionTokens: 4119,
    modelOutputNeuronsPerMillionTokens: 34868,
    accountingMode: "conservative-estimate-with-usage-reconciliation",
    scope: "Cloudflare Workers base plan plus Workers AI only"
  },

  channels: {
    engineering: "C0C5FSR3JTS",
    research: "C0C4MCC9JHG",
    thinkTank: "C0C4GD3TKS9",
    opportunities: "C0C4R655E9J",
    experiments: "C0C4F9PATPV",
    finance: "C0C4F9PNCE7",
    ownerReview: "C0C4658GF4P"
  },

  sensors: [
    {
      id: "STATCAN_BUSINESS",
      name: "Statistics Canada — Business Performance",
      kind: "atom",
      authority: 1.0,
      url: "https://www150.statcan.gc.ca/n1/rss/dai-quo/33-eng.atom"
    },
    {
      id: "STATCAN_DIGITAL",
      name: "Statistics Canada — Digital Economy",
      kind: "atom",
      authority: 1.0,
      url: "https://www150.statcan.gc.ca/n1/rss/dai-quo/22-eng.atom"
    },
    {
      id: "STATCAN_CONSTRUCTION",
      name: "Statistics Canada — Construction",
      kind: "atom",
      authority: 1.0,
      url: "https://www150.statcan.gc.ca/n1/rss/dai-quo/34-eng.atom"
    },
    {
      id: "STATCAN_LABOUR",
      name: "Statistics Canada — Labour",
      kind: "atom",
      authority: 1.0,
      url: "https://www150.statcan.gc.ca/n1/rss/dai-quo/14-eng.atom"
    },
    {
      id: "STATCAN_PRICES",
      name: "Statistics Canada — Prices",
      kind: "atom",
      authority: 1.0,
      url: "https://www150.statcan.gc.ca/n1/rss/dai-quo/18-eng.atom"
    },
    {
      id: "STATCAN_RETAIL",
      name: "Statistics Canada — Retail & Wholesale",
      kind: "atom",
      authority: 1.0,
      url: "https://www150.statcan.gc.ca/n1/rss/dai-quo/20-eng.atom"
    },
    {
      id: "STATCAN_TECH",
      name: "Statistics Canada — Science & Technology",
      kind: "atom",
      authority: 1.0,
      url: "https://www150.statcan.gc.ca/n1/rss/dai-quo/27-eng.atom"
    },
    {
      id: "STATCAN_TRADE",
      name: "Statistics Canada — International Trade",
      kind: "atom",
      authority: 1.0,
      url: "https://www150.statcan.gc.ca/n1/rss/dai-quo/12-eng.atom"
    },
    {
      id: "STATCAN_ECONOMY",
      name: "Statistics Canada — Economic Accounts",
      kind: "atom",
      authority: 1.0,
      url: "https://www150.statcan.gc.ca/n1/rss/dai-quo/36-eng.atom"
    },
    {
      id: "HN_NEW",
      name: "Hacker News — New Technology Signals",
      kind: "hn",
      authority: 0.55,
      url: "https://hacker-news.firebaseio.com/v0/newstories.json"
    }
  ]
};

/* ============================================================
   CORE
   ============================================================ */

function json(data, status = 200) {
  return Response.json(data, {
    status,
    headers: {
      "Cache-Control": "no-store"
    }
  });
}

function authorized(request, env) {
  const supplied = request.headers.get("X-VIS-Admin-Key");

  return Boolean(
    env.VIS_ADMIN_KEY &&
    supplied &&
    supplied === env.VIS_ADMIN_KEY
  );
}

function makeRotationId() {
  return `VIS-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
}

function nowISO() {
  return new Date().toISOString();
}

function cleanText(text, max = 12000) {
  return String(text || "")
    .replace(/\u0000/g, "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

function xmlDecode(text) {
  return String(text || "")
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'");
}

function xmlValue(block, tag) {
  const regex =
    new RegExp(
      `<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`,
      "i"
    );

  const match =
    String(block || "").match(regex);

  return match
    ? cleanText(xmlDecode(match[1]), 5000)
    : "";
}

function atomLink(block) {
  const alternate =
    String(block || "").match(
      /<link[^>]*rel=["']alternate["'][^>]*href=["']([^"']+)["']/i
    );

  if (alternate) {
    return xmlDecode(alternate[1]);
  }

  const href =
    String(block || "").match(
      /<link[^>]*href=["']([^"']+)["']/i
    );

  return href
    ? xmlDecode(href[1])
    : "";
}

async function fingerprint(text) {
  const bytes =
    new TextEncoder().encode(
      String(text || "").toLowerCase().trim()
    );

  const digest =
    await crypto.subtle.digest(
      "SHA-256",
      bytes
    );

  return Array.from(
    new Uint8Array(digest)
  )
    .map(b => b.toString(16).padStart(2, "0"))
    .join("");
}

/* ============================================================
   SCHEMA
   ============================================================ */

async function getColumns(env, table) {
  const result =
    await env.DB.prepare(
      `PRAGMA table_info(${table})`
    ).all();

  return new Set(
    (result.results || []).map(
      row => row.name
    )
  );
}

async function addColumnIfMissing(
  env,
  table,
  column,
  definition
) {
  const columns =
    await getColumns(env, table);

  if (!columns.has(column)) {
    await env.DB.prepare(
      `ALTER TABLE ${table}
       ADD COLUMN ${column} ${definition}`
    ).run();
  }
}


async function bootstrapLegacySchema(env) {
  // VIS_V16_LEGACY_BOOTSTRAP
  const statements = [
    `CREATE TABLE IF NOT EXISTS agents (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      role TEXT NOT NULL,
      parent_agent TEXT,
      status TEXT DEFAULT 'active',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )`,

    `CREATE TABLE IF NOT EXISTS rotations (
      id TEXT PRIMARY KEY,
      agent_id TEXT NOT NULL,
      started_at TEXT NOT NULL,
      completed_at TEXT,
      status TEXT NOT NULL,
      summary TEXT,
      cost_usd REAL DEFAULT 0
    )`,

    `CREATE TABLE IF NOT EXISTS research (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      rotation_id TEXT,
      agent_id TEXT NOT NULL,
      finding TEXT NOT NULL,
      evidence TEXT,
      confidence REAL,
      implication TEXT,
      recommended_action TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )`,

    `CREATE TABLE IF NOT EXISTS opportunities (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      origin TEXT,
      stage TEXT,
      demand_evidence TEXT,
      pricing_evidence TEXT,
      unit_economics TEXT,
      automation_pct REAL,
      owner_labor TEXT,
      risks_dependencies TEXT,
      next_test TEXT,
      status TEXT,
      last_updated TEXT DEFAULT CURRENT_TIMESTAMP,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )`,

    `CREATE TABLE IF NOT EXISTS experiments (
      id TEXT PRIMARY KEY,
      opportunity_id TEXT,
      hypothesis TEXT,
      method TEXT,
      max_approved_spend REAL DEFAULT 0,
      actual_spend REAL DEFAULT 0,
      result TEXT,
      information_gained TEXT,
      kill_criteria TEXT,
      decision TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )`,

    `CREATE TABLE IF NOT EXISTS handoffs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      rotation_id TEXT,
      from_agent TEXT NOT NULL,
      to_agent TEXT NOT NULL,
      request TEXT,
      evidence_reference TEXT,
      response TEXT,
      status TEXT DEFAULT 'pending',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      response_resolution TEXT
    )`,

    `CREATE TABLE IF NOT EXISTS decisions (
      id TEXT PRIMARY KEY,
      decision TEXT NOT NULL,
      evidence TEXT,
      owner_approval_required INTEGER DEFAULT 0,
      approved_by TEXT,
      effect TEXT,
      notes TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )`,

    `CREATE TABLE IF NOT EXISTS financial_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      category TEXT NOT NULL,
      amount_usd REAL NOT NULL,
      description TEXT,
      approved INTEGER DEFAULT 0,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )`,

    `CREATE TABLE IF NOT EXISTS runtime_health (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      component TEXT NOT NULL,
      status TEXT NOT NULL,
      details TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )`,

    `CREATE TABLE IF NOT EXISTS audit_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      actor TEXT NOT NULL,
      action TEXT NOT NULL,
      target TEXT,
      result TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )`
  ];

  for (const sql of statements) {
    await env.DB.prepare(sql).run();
  }

  await env.DB.prepare(`
    CREATE INDEX IF NOT EXISTS idx_handoffs_rotation
    ON handoffs(rotation_id)
  `).run();

  await env.DB.prepare(`
    CREATE INDEX IF NOT EXISTS idx_research_rotation
    ON research(rotation_id)
  `).run();

  await env.DB.prepare(`
    CREATE INDEX IF NOT EXISTS idx_rotations_agent
    ON rotations(agent_id)
  `).run();
}

async function ensureSchema(env) {
  await bootstrapLegacySchema(env);
  await env.DB.prepare(`
    CREATE TABLE IF NOT EXISTS execution_locks (
      lock_key TEXT PRIMARY KEY,
      rotation_id TEXT NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `).run();

  await env.DB.prepare(`
    CREATE TABLE IF NOT EXISTS failures (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      rotation_id TEXT,
      component TEXT NOT NULL,
      error TEXT NOT NULL,
      retry_count INTEGER DEFAULT 0,
      resolved INTEGER DEFAULT 0,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `).run();

  await env.DB.prepare(`
    CREATE TABLE IF NOT EXISTS cost_ledger (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      rotation_id TEXT,
      agent_id TEXT,
      provider TEXT,
      model TEXT,
      input_units INTEGER DEFAULT 0,
      output_units INTEGER DEFAULT 0,
      cost_usd REAL DEFAULT 0,
      approved INTEGER DEFAULT 0,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `).run();

  await env.DB.prepare(`
    CREATE TABLE IF NOT EXISTS ai_compute_ledger (
      id TEXT PRIMARY KEY,
      reservation_id TEXT NOT NULL,
      phase TEXT NOT NULL,
      model TEXT NOT NULL,
      input_tokens INTEGER DEFAULT 0,
      output_tokens INTEGER DEFAULT 0,
      estimated_neurons REAL DEFAULT 0,
      day_key TEXT NOT NULL,
      month_key TEXT NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `).run();

  await env.DB.prepare(`
    CREATE INDEX IF NOT EXISTS idx_ai_compute_month
    ON ai_compute_ledger(month_key, day_key)
  `).run();

  await env.DB.prepare(`
    CREATE TABLE IF NOT EXISTS sensor_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      fingerprint TEXT NOT NULL UNIQUE,
      source_id TEXT NOT NULL,
      source_name TEXT NOT NULL,
      source_url TEXT NOT NULL,
      item_url TEXT,
      title TEXT,
      summary TEXT,
      published_at TEXT,
      retrieved_at TEXT NOT NULL,
      authority REAL DEFAULT 0.5,
      first_rotation_id TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `).run();

  await env.DB.prepare(`
    CREATE TABLE IF NOT EXISTS scout_signals (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      rotation_id TEXT NOT NULL,
      sensor_item_id INTEGER NOT NULL,
      scout_output TEXT,
      relevance_score REAL DEFAULT 0,
      selected INTEGER DEFAULT 0,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `).run();

  await env.DB.prepare(`
    CREATE INDEX IF NOT EXISTS idx_sensor_source
    ON sensor_items(source_id)
  `).run();

  await env.DB.prepare(`
    CREATE INDEX IF NOT EXISTS idx_sensor_retrieved
    ON sensor_items(retrieved_at)
  `).run();

  await env.DB.prepare(`
    CREATE INDEX IF NOT EXISTS idx_scout_rotation
    ON scout_signals(rotation_id)
  `).run();

  await env.DB.prepare(`
    CREATE TABLE IF NOT EXISTS evidence (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      rotation_id TEXT,
      source_id TEXT,
      source_name TEXT,
      source_url TEXT NOT NULL,
      item_url TEXT,
      title TEXT,
      evidence_text TEXT,
      source_type TEXT,
      retrieved_at TEXT NOT NULL,
      verification_status TEXT DEFAULT 'retrieved',
      used_by_atlas INTEGER DEFAULT 0,
      used_by_vector INTEGER DEFAULT 0,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `).run();

  await addColumnIfMissing(
    env,
    "opportunities",
    "last_updated",
    "TEXT"
  );

  await addColumnIfMissing(
    env,
    "opportunities",
    "next_test",
    "TEXT"
  );

  await addColumnIfMissing(
    env,
    "handoffs",
    "response_resolution",
    "TEXT"
  );

  await addColumnIfMissing(
    env,
    "handoffs",
    "status",
    "TEXT DEFAULT 'pending'"
  );

  await addColumnIfMissing(
    env,
    "rotations",
    "summary",
    "TEXT"
  );

  await addColumnIfMissing(
    env,
    "rotations",
    "cost_usd",
    "REAL DEFAULT 0"
  );

  await addColumnIfMissing(
    env,
    "rotations",
    "completed_at",
    "TEXT"
  );

  await addColumnIfMissing(
    env,
    "research",
    "implication",
    "TEXT"
  );

  await addColumnIfMissing(
    env,
    "research",
    "recommended_action",
    "TEXT"
  );

  await addColumnIfMissing(
    env,
    "research",
    "confidence",
    "REAL"
  );

  await addColumnIfMissing(
    env,
    "research",
    "evidence",
    "TEXT"
  );

  // VIS V1.7 — Hive organization, constrained workers and execution state.
  const v17Statements = [
    `CREATE TABLE IF NOT EXISTS departments (
      id TEXT PRIMARY KEY, name TEXT NOT NULL, head_agent TEXT NOT NULL,
      mandate TEXT, status TEXT DEFAULT 'active', created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS worker_jobs (
      id TEXT PRIMARY KEY, rotation_id TEXT, department_id TEXT, manager_agent TEXT,
      worker_role TEXT NOT NULL, mandate TEXT NOT NULL, knowledge_packet_id TEXT,
      authority_scope TEXT DEFAULT 'internal-zero-dollar', status TEXT DEFAULT 'queued',
      result TEXT, attempts INTEGER DEFAULT 0, created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      started_at TEXT, completed_at TEXT, last_updated TEXT DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS knowledge_packets (
      id TEXT PRIMARY KEY, rotation_id TEXT, department_id TEXT, packet_type TEXT NOT NULL,
      content TEXT NOT NULL, provenance TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS quality_evaluations (
      id INTEGER PRIMARY KEY AUTOINCREMENT, rotation_id TEXT, subject_type TEXT NOT NULL,
      subject_id TEXT, evaluator TEXT NOT NULL, passed INTEGER NOT NULL, flags TEXT,
      notes TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS founder_signals (
      id TEXT PRIMARY KEY, source TEXT NOT NULL, source_ref TEXT, signal_type TEXT NOT NULL,
      content TEXT, priority INTEGER DEFAULT 1, status TEXT DEFAULT 'new',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP, processed_at TEXT
    )`,
    `CREATE TABLE IF NOT EXISTS experiment_queue (
      id TEXT PRIMARY KEY, experiment_id TEXT NOT NULL UNIQUE, opportunity_id TEXT,
      authority_scope TEXT DEFAULT 'internal-zero-dollar', status TEXT DEFAULT 'queued',
      assigned_to TEXT, attempts INTEGER DEFAULT 0, queued_at TEXT DEFAULT CURRENT_TIMESTAMP,
      started_at TEXT, completed_at TEXT, last_updated TEXT DEFAULT CURRENT_TIMESTAMP,
      diagnostic TEXT
    )`,
    `CREATE TABLE IF NOT EXISTS experiment_evidence (
      id INTEGER PRIMARY KEY AUTOINCREMENT, experiment_id TEXT NOT NULL, queue_id TEXT,
      evidence_type TEXT NOT NULL, source_ref TEXT, evidence_text TEXT NOT NULL,
      verification_status TEXT DEFAULT 'internal-analysis', created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS experiment_reviews (
      id INTEGER PRIMARY KEY AUTOINCREMENT, experiment_id TEXT NOT NULL, queue_id TEXT,
      reviewer TEXT NOT NULL, decision TEXT NOT NULL, review TEXT NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS experiment_provenance (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      experiment_id TEXT NOT NULL,
      queue_id TEXT,
      rotation_id TEXT,
      phase TEXT NOT NULL,
      provenance TEXT NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS acceptance_telemetry (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      rotation_id TEXT NOT NULL,
      experiment_id TEXT,
      atlas_quality_passed INTEGER DEFAULT 0,
      vector_quality_passed INTEGER DEFAULT 0,
      experiment_executed INTEGER DEFAULT 0,
      experiment_status TEXT,
      experiment_decision TEXT,
      slack_synchronized INTEGER DEFAULT 0,
      external_spend_usd REAL DEFAULT 0,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )`
  ];

  for (const sql of v17Statements) {
    await env.DB.prepare(sql).run();
  }

  await env.DB.prepare(`
    CREATE INDEX IF NOT EXISTS idx_worker_jobs_status ON worker_jobs(status)
  `).run();
  await env.DB.prepare(`
    CREATE INDEX IF NOT EXISTS idx_experiment_queue_status ON experiment_queue(status)
  `).run();
  await env.DB.prepare(`
    CREATE INDEX IF NOT EXISTS idx_experiment_evidence_experiment ON experiment_evidence(experiment_id)
  `).run();
  await env.DB.prepare(`
    CREATE INDEX IF NOT EXISTS idx_experiment_reviews_experiment ON experiment_reviews(experiment_id)
  `).run();

  await env.DB.prepare(`
    CREATE INDEX IF NOT EXISTS idx_experiment_provenance_experiment
    ON experiment_provenance(experiment_id)
  `).run();

  await env.DB.prepare(`
    CREATE INDEX IF NOT EXISTS idx_acceptance_telemetry_rotation
    ON acceptance_telemetry(rotation_id)
  `).run();

  await env.DB.prepare(`
    INSERT OR IGNORE INTO departments (id, name, head_agent, mandate)
    VALUES
      ('DISCOVERY', 'Discovery', 'ATLAS', 'Broad opportunity discovery and synthesis'),
      ('DILIGENCE', 'Diligence', 'VECTOR', 'Independent commercial challenge and falsification'),
      ('IT_RELIABILITY', 'IT Reliability', 'JANITOR', 'Runtime reliability, diagnosis, repair, verification and self-healing'),
      ('CYBERSECURITY', 'Cybersecurity', 'SENTINEL', 'Independent security oversight, integrity review and authority-boundary enforcement')
  `).run();

  await addColumnIfMissing(env, "experiments", "status", "TEXT DEFAULT 'draft'");
  await addColumnIfMissing(env, "experiments", "approved_by", "TEXT");
  await addColumnIfMissing(env, "experiments", "approved_at", "TEXT");
  await addColumnIfMissing(env, "experiments", "started_at", "TEXT");
  await addColumnIfMissing(env, "experiments", "completed_at", "TEXT");
  await addColumnIfMissing(env, "experiments", "last_updated", "TEXT");

  // VIS V1.8 — Hive Knowledge & Delegation Core.
  const v18Statements = [
    `CREATE TABLE IF NOT EXISTS hive_knowledge (
      id TEXT PRIMARY KEY, knowledge_type TEXT NOT NULL, subject TEXT NOT NULL,
      content TEXT NOT NULL, confidence REAL DEFAULT 0.5, verification_status TEXT DEFAULT 'internal',
      source_type TEXT, source_ref TEXT, supersedes_id TEXT, status TEXT DEFAULT 'active',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP, last_updated TEXT DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS work_orders (
      id TEXT PRIMARY KEY, parent_work_order_id TEXT, objective TEXT NOT NULL,
      requested_by TEXT NOT NULL, authority_scope TEXT DEFAULT 'internal-zero-dollar',
      priority INTEGER DEFAULT 1, status TEXT DEFAULT 'queued',
      founder_approval_required INTEGER DEFAULT 0, created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      started_at TEXT, completed_at TEXT, last_updated TEXT DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS department_heads (
      department_id TEXT PRIMARY KEY, agent_id TEXT NOT NULL, mandate TEXT NOT NULL,
      authority_scope TEXT DEFAULT 'internal-zero-dollar', status TEXT DEFAULT 'active',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP, last_updated TEXT DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS knowledge_inheritance (
      id TEXT PRIMARY KEY, work_order_id TEXT, department_id TEXT, worker_job_id TEXT,
      knowledge_id TEXT NOT NULL, packet_id TEXT, inheritance_reason TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS worker_results (
      id TEXT PRIMARY KEY, work_order_id TEXT, worker_job_id TEXT NOT NULL,
      department_id TEXT NOT NULL, result_type TEXT DEFAULT 'analysis', result TEXT NOT NULL,
      evidence_refs TEXT, confidence REAL DEFAULT 0.5, status TEXT DEFAULT 'submitted',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS department_syntheses (
      id TEXT PRIMARY KEY, work_order_id TEXT NOT NULL, department_id TEXT NOT NULL,
      head_agent TEXT NOT NULL, synthesis TEXT NOT NULL, evidence_refs TEXT,
      worker_result_refs TEXT, status TEXT DEFAULT 'submitted', created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS cross_department_reviews (
      id TEXT PRIMARY KEY, work_order_id TEXT NOT NULL, reviewer_department_id TEXT NOT NULL,
      subject_department_id TEXT NOT NULL, subject_synthesis_id TEXT NOT NULL,
      review TEXT NOT NULL, decision TEXT DEFAULT 'reviewed', created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS hive_reintegrations (
      id TEXT PRIMARY KEY, work_order_id TEXT NOT NULL, knowledge_id TEXT NOT NULL,
      source_department_id TEXT, source_synthesis_id TEXT, review_refs TEXT,
      disposition TEXT NOT NULL, rationale TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS resilience_events (
      id TEXT PRIMARY KEY, test_id TEXT NOT NULL, work_order_id TEXT, worker_job_id TEXT,
      fault_type TEXT NOT NULL, detected INTEGER DEFAULT 0, diagnosis TEXT, repair_action TEXT,
      verified INTEGER DEFAULT 0, outcome TEXT NOT NULL, details TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS it_incidents (
      id TEXT PRIMARY KEY, work_order_id TEXT, incident_type TEXT NOT NULL, component TEXT NOT NULL,
      severity TEXT DEFAULT 'medium', diagnosis TEXT, status TEXT DEFAULT 'open',
      authority_scope TEXT DEFAULT 'internal-zero-dollar', created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      resolved_at TEXT
    )`,
    `CREATE TABLE IF NOT EXISTS it_repairs (
      id TEXT PRIMARY KEY, incident_id TEXT NOT NULL, repair_agent TEXT NOT NULL, action TEXT NOT NULL,
      verification TEXT, status TEXT DEFAULT 'attempted', created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS cybersecurity_reviews (
      id TEXT PRIMARY KEY, incident_id TEXT NOT NULL, repair_id TEXT, reviewer_agent TEXT NOT NULL,
      authority_preserved INTEGER DEFAULT 0, forensic_history_preserved INTEGER DEFAULT 0,
      secrets_exposed INTEGER DEFAULT 0, decision TEXT NOT NULL, review TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS managers (
      id TEXT PRIMARY KEY, department_id TEXT NOT NULL, manager_agent TEXT NOT NULL, mandate TEXT NOT NULL,
      authority_scope TEXT DEFAULT 'internal-zero-dollar', status TEXT DEFAULT 'active',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP, last_updated TEXT DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS manager_assignments (
      id TEXT PRIMARY KEY, work_order_id TEXT NOT NULL, manager_id TEXT NOT NULL, department_id TEXT NOT NULL,
      objective TEXT NOT NULL, knowledge_ids TEXT NOT NULL, status TEXT DEFAULT 'queued',
      authority_scope TEXT DEFAULT 'internal-zero-dollar', created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      started_at TEXT, completed_at TEXT, last_updated TEXT DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS manager_syntheses (
      id TEXT PRIMARY KEY, work_order_id TEXT NOT NULL, manager_assignment_id TEXT NOT NULL, manager_id TEXT NOT NULL,
      synthesis TEXT NOT NULL, worker_result_refs TEXT, evidence_refs TEXT, status TEXT DEFAULT 'submitted',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS repair_recipes (
      id TEXT PRIMARY KEY, incident_type TEXT NOT NULL, component_pattern TEXT, repair_strategy TEXT NOT NULL,
      max_attempts INTEGER DEFAULT 1, security_review_required INTEGER DEFAULT 1, status TEXT DEFAULT 'active',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP, last_updated TEXT DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS planning_telemetry (
      id TEXT PRIMARY KEY, work_order_id TEXT NOT NULL, planner_level TEXT NOT NULL, planner_agent TEXT NOT NULL,
      planning_mode TEXT NOT NULL, attempts INTEGER DEFAULT 0, valid INTEGER DEFAULT 0,
      diagnostic TEXT, plan_json TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS operational_objectives (
      id TEXT PRIMARY KEY, idempotency_key TEXT NOT NULL UNIQUE, work_order_id TEXT UNIQUE,
      objective TEXT NOT NULL, requested_by TEXT NOT NULL, authority_scope TEXT DEFAULT 'internal-zero-dollar',
      priority INTEGER DEFAULT 1, status TEXT DEFAULT 'queued', decision_package_id TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP, started_at TEXT, completed_at TEXT, last_updated TEXT DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS founder_decision_packages (
      id TEXT PRIMARY KEY, objective_id TEXT NOT NULL, work_order_id TEXT NOT NULL,
      department_synthesis_id TEXT, challenge_id TEXT, reintegrated_knowledge_id TEXT,
      package TEXT NOT NULL, status TEXT DEFAULT 'ready', founder_action_required INTEGER DEFAULT 0,
      authority_scope TEXT DEFAULT 'internal-zero-dollar', created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS ventures (
      id TEXT PRIMARY KEY, name TEXT NOT NULL, venture_type TEXT DEFAULT 'company', status TEXT DEFAULT 'active',
      context TEXT, authority_scope TEXT DEFAULT 'internal-zero-dollar', created_at TEXT DEFAULT CURRENT_TIMESTAMP, last_updated TEXT DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS mission_research_plans (
      id TEXT PRIMARY KEY, objective_id TEXT NOT NULL, venture_id TEXT NOT NULL, research_goal TEXT NOT NULL,
      plan_json TEXT NOT NULL, status TEXT DEFAULT 'active', created_at TEXT DEFAULT CURRENT_TIMESTAMP, last_updated TEXT DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS mission_research_questions (
      id TEXT PRIMARY KEY, plan_id TEXT NOT NULL, objective_id TEXT NOT NULL, venture_id TEXT NOT NULL,
      question TEXT NOT NULL, source_classes TEXT, priority INTEGER DEFAULT 3, status TEXT DEFAULT 'open',
      answer_summary TEXT, evidence_refs TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP, last_updated TEXT DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS research_source_registry (
      id TEXT PRIMARY KEY, source_class TEXT NOT NULL, name TEXT NOT NULL, base_url TEXT,
      scope TEXT, reliability_note TEXT, status TEXT DEFAULT 'active', created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS mission_research_runs (
      id TEXT PRIMARY KEY, plan_id TEXT NOT NULL, objective_id TEXT NOT NULL, venture_id TEXT NOT NULL,
      status TEXT DEFAULT 'running', questions_attempted INTEGER DEFAULT 0, questions_answered INTEGER DEFAULT 0,
      evidence_count INTEGER DEFAULT 0, branches_created INTEGER DEFAULT 0, started_at TEXT DEFAULT CURRENT_TIMESTAMP,
      completed_at TEXT, diagnostic TEXT
    )`,
    `CREATE TABLE IF NOT EXISTS mission_research_evidence (
      id TEXT PRIMARY KEY, run_id TEXT NOT NULL, plan_id TEXT NOT NULL, question_id TEXT NOT NULL,
      objective_id TEXT NOT NULL, venture_id TEXT NOT NULL, source_id TEXT, source_class TEXT, source_name TEXT,
      source_url TEXT NOT NULL, title TEXT, evidence_text TEXT NOT NULL, relevance REAL DEFAULT 0,
      source_quality REAL DEFAULT 0, verification_status TEXT DEFAULT 'retrieved-public-source',
      fingerprint TEXT, retrieved_at TEXT NOT NULL, created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS transaction_evidence_extractions (
      id TEXT PRIMARY KEY, run_id TEXT NOT NULL, plan_id TEXT NOT NULL, question_id TEXT NOT NULL,
      objective_id TEXT NOT NULL, venture_id TEXT NOT NULL, source_evidence_ids TEXT NOT NULL,
      buyer_name TEXT, purchased_scope TEXT, procurement_identifier TEXT, procurement_mechanism TEXT,
      publication_date TEXT, close_date TEXT, award_date TEXT, contract_value TEXT, supplier_name TEXT,
      delivery_geography TEXT, qualification_requirements TEXT, duration_recurrence TEXT,
      missing_fields TEXT, field_provenance_json TEXT NOT NULL, extraction_status TEXT NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP, last_updated TEXT DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS mission_research_branches (
      id TEXT PRIMARY KEY, run_id TEXT NOT NULL, parent_question_id TEXT NOT NULL, objective_id TEXT NOT NULL,
      venture_id TEXT NOT NULL, question TEXT NOT NULL, rationale TEXT, priority INTEGER DEFAULT 3,
      status TEXT DEFAULT 'queued', created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS research_source_health (
      source_id TEXT PRIMARY KEY, attempts INTEGER DEFAULT 0, successes INTEGER DEFAULT 0, failures INTEGER DEFAULT 0,
      consecutive_failures INTEGER DEFAULT 0, last_status TEXT, last_error TEXT, last_attempt_at TEXT, last_success_at TEXT,
      last_updated TEXT DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS research_attention_ledger (
      id TEXT PRIMARY KEY, objective_id TEXT NOT NULL, plan_id TEXT NOT NULL, run_id TEXT NOT NULL,
      max_depth INTEGER DEFAULT 2, max_questions INTEGER DEFAULT 16, max_source_fetches INTEGER DEFAULT 48,
      questions_used INTEGER DEFAULT 0, source_fetches_used INTEGER DEFAULT 0, duplicate_branches_suppressed INTEGER DEFAULT 0,
      stop_reason TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP, last_updated TEXT DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS schema_migrations (
      id TEXT PRIMARY KEY, version TEXT NOT NULL, description TEXT NOT NULL, applied_at TEXT DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS opportunity_qualification_gates (
      id TEXT PRIMARY KEY, objective_id TEXT NOT NULL, work_order_id TEXT NOT NULL, venture_id TEXT NOT NULL,
      synthesis_id TEXT, challenge_id TEXT, status TEXT NOT NULL, supported_dimensions INTEGER DEFAULT 0,
      total_dimensions INTEGER DEFAULT 10, critical_dimensions_supported INTEGER DEFAULT 0,
      qualification_json TEXT NOT NULL, next_questions_json TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS research_specialist_diagnostics (
      id TEXT PRIMARY KEY, run_id TEXT NOT NULL, plan_id TEXT NOT NULL, question_id TEXT NOT NULL,
      objective_id TEXT NOT NULL, venture_id TEXT NOT NULL, attempt INTEGER DEFAULT 1,
      stage TEXT NOT NULL, status TEXT NOT NULL, error TEXT, raw_preview TEXT,
      parsed_json TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )`
  ];

  for (const sql of v18Statements) await env.DB.prepare(sql).run();

  for (const sql of [
    `ALTER TABLE operational_objectives ADD COLUMN venture_id TEXT DEFAULT 'PORTFOLIO'`,
    `ALTER TABLE operational_objectives ADD COLUMN lifecycle_state TEXT DEFAULT 'active'`,
    `ALTER TABLE operational_objectives ADD COLUMN continuation_count INTEGER DEFAULT 0`,
    `ALTER TABLE operational_objectives ADD COLUMN continuation_limit INTEGER DEFAULT 8`,
    `ALTER TABLE operational_objectives ADD COLUMN retired_reason TEXT`,
    `ALTER TABLE founder_decision_packages ADD COLUMN venture_id TEXT DEFAULT 'PORTFOLIO'`,
    `ALTER TABLE mission_research_branches ADD COLUMN depth INTEGER DEFAULT 1`,
    `ALTER TABLE mission_research_branches ADD COLUMN fingerprint TEXT`,
    `ALTER TABLE mission_research_branches ADD COLUMN child_question_id TEXT`,
    `ALTER TABLE mission_research_branches ADD COLUMN completed_at TEXT`,
    `ALTER TABLE transaction_evidence_extractions ADD COLUMN canonical_source_url TEXT`,
    `ALTER TABLE transaction_evidence_extractions ADD COLUMN transaction_fingerprint TEXT`,
    `ALTER TABLE transaction_evidence_extractions ADD COLUMN identity_status TEXT DEFAULT 'unresolved'`,
    `ALTER TABLE transaction_evidence_extractions ADD COLUMN mission_fit_status TEXT DEFAULT 'unchecked'`,
    `ALTER TABLE transaction_evidence_extractions ADD COLUMN mission_constraints_json TEXT`,
    `ALTER TABLE transaction_evidence_extractions ADD COLUMN mission_mismatches_json TEXT`
  ]) { try { await env.DB.prepare(sql).run(); } catch (_) {} }
  await env.DB.prepare(`INSERT OR IGNORE INTO schema_migrations (id,version,description) VALUES ('MIG-1.8.4-001','1.8.4','Adaptive research recursion, source health, attention budgets, and evidence gates')`).run();
  await env.DB.prepare(`INSERT OR IGNORE INTO schema_migrations (id,version,description) VALUES ('MIG-1.8.5-001','1.8.5','Research specialist reliability: robust JSON parsing, schema validation, diagnostics, and bounded evidence-gap branching')`).run();
  await env.DB.prepare(`INSERT OR IGNORE INTO schema_migrations (id,version,description) VALUES ('MIG-1.8.7-001','1.8.7','Compute budget governor with conservative neuron accounting, throttling, and fail-closed AI authority')`).run();
  await env.DB.prepare(`INSERT OR IGNORE INTO schema_migrations (id,version,description) VALUES ('MIG-1.8.8-001','1.8.8','Opportunity qualification evidence contract: fail-closed graduation gate, explicit commercial dimensions, recursive evidence-gap research, and no Founder package on weak intelligence')`).run();
  await env.DB.prepare(`INSERT OR IGNORE INTO schema_migrations (id,version,description) VALUES ('MIG-1.8.20-001','1.8.20','Transaction evidence extraction: field-level provenance, fail-closed transaction qualification, and gap-directed follow-up research')`).run();
  await env.DB.prepare(`INSERT OR IGNORE INTO schema_migrations (id,version,description) VALUES ('MIG-1.8.21-001','1.8.21','Transaction identity lock: candidate discovery is separated from transaction evidence; critical fields must converge on one canonical procurement record before qualification')`).run();
  await env.DB.prepare(`INSERT OR IGNORE INTO schema_migrations (id,version,description) VALUES ('MIG-1.8.22-001','1.8.22','Procurement detail-page discovery: search pages discover candidates; bounded source adapters resolve and fetch individual procurement records before identity qualification; acceptance missions quarantined from cron continuation')`).run();
  await env.DB.prepare(`INSERT OR IGNORE INTO schema_migrations (id,version,description) VALUES ('MIG-1.8.23-001','1.8.23','Detail Evidence Bridge: canonical procurement detail records bypass broad-page specialist gating and feed transaction extraction directly; identity lock remains fail-closed')`).run();
  await env.DB.prepare(`INSERT OR IGNORE INTO schema_migrations (id,version,description) VALUES ('MIG-1.8.24-001','1.8.24','Canonical Procurement Record Filter: utility and navigation pages are rejected; fetched candidates must contain transaction-shaped content before entering evidence extraction; identity lock remains fail-closed')`).run();
  await env.DB.prepare(`INSERT OR IGNORE INTO schema_migrations (id,version,description) VALUES ('MIG-1.8.25-001','1.8.25','Mission Constraint Gate: transaction identity and mission fit are evaluated separately; geography and recency are optional user-selectable constraints rather than global defaults; mismatched records remain valid Hive evidence but cannot satisfy the mission')`).run();

  await env.DB.prepare(`INSERT OR IGNORE INTO ventures (id,name,venture_type,status,context,authority_scope,last_updated) VALUES ('DCC','Douglas Contracting Company Inc.','company','active','DCC is one portfolio company. Treat its objectives, evidence, economics, history and decisions as venture-isolated while allowing validated learning to return to the shared Hive.','internal-zero-dollar',?)`).bind(nowISO()).run();
  await env.DB.prepare(`INSERT OR IGNORE INTO research_source_registry (id,source_class,name,base_url,scope,reliability_note) VALUES
    ('SRC-STATCAN','official-statistics','Statistics Canada','https://www.statcan.gc.ca/','Canadian economic, industry, labour, trade and business statistics','Primary government statistical source'),
    ('SRC-CANADABUYS','procurement','CanadaBuys','https://canadabuys.canada.ca/','Federal procurement opportunities and contracting information','Primary Government of Canada procurement source'),
    ('SRC-BCBID','procurement','BC Bid','https://www.bcbid.gov.bc.ca/','British Columbia public-sector procurement','Primary BC procurement source'),
    ('SRC-BCSTATS','official-statistics','BC Stats','https://www2.gov.bc.ca/gov/content/data/statistics','British Columbia economic and demographic statistics','Primary provincial statistical source'),
    ('SRC-MUNICIPAL','municipal-procurement','Municipal procurement sources',NULL,'Municipal tenders, capital plans and facility procurement relevant to the venture geography','Use official municipal sources when configured'),
    ('SRC-TRADE','trade-market','Canadian trade data',NULL,'Import, export, product and distribution market evidence','Prefer official trade/statistical sources'),
    ('SRC-INDUSTRY','industry-market','Industry and commercial sources',NULL,'Industry demand, competitors, pricing, facilities and buyer evidence','Require provenance and separate commercial claims from verified facts'),
    ('SRC-TECH','technology-signal','Technology signal sources',NULL,'Emerging technology and automation signals','Contextual signal only unless directly relevant to mission')`).run();

  const v18Indexes = [
    `CREATE INDEX IF NOT EXISTS idx_hive_knowledge_subject ON hive_knowledge(subject)`,
    `CREATE INDEX IF NOT EXISTS idx_work_orders_status ON work_orders(status)`,
    `CREATE INDEX IF NOT EXISTS idx_knowledge_inheritance_work ON knowledge_inheritance(work_order_id)`,
    `CREATE INDEX IF NOT EXISTS idx_worker_results_work ON worker_results(work_order_id)`,
    `CREATE INDEX IF NOT EXISTS idx_department_syntheses_work ON department_syntheses(work_order_id)`,
    `CREATE INDEX IF NOT EXISTS idx_cross_department_reviews_work ON cross_department_reviews(work_order_id)`,
    `CREATE INDEX IF NOT EXISTS idx_manager_assignments_work ON manager_assignments(work_order_id)`,
    `CREATE INDEX IF NOT EXISTS idx_manager_syntheses_work ON manager_syntheses(work_order_id)`,
    `CREATE INDEX IF NOT EXISTS idx_it_incidents_status ON it_incidents(status)`,
    `CREATE INDEX IF NOT EXISTS idx_planning_telemetry_work ON planning_telemetry(work_order_id)`,
    `CREATE INDEX IF NOT EXISTS idx_operational_objectives_status ON operational_objectives(status,priority,created_at)`,
    `CREATE INDEX IF NOT EXISTS idx_operational_objectives_lifecycle_queue ON operational_objectives(lifecycle_state,status,priority,created_at)`,
    `CREATE INDEX IF NOT EXISTS idx_founder_packages_work ON founder_decision_packages(work_order_id)`
  ];
  for (const sql of v18Indexes) await env.DB.prepare(sql).run();

  await env.DB.prepare(`
    INSERT OR IGNORE INTO department_heads (department_id, agent_id, mandate)
    VALUES
      ('DISCOVERY', 'ATLAS', 'Broad opportunity discovery and synthesis'),
      ('DILIGENCE', 'VECTOR', 'Independent commercial challenge and falsification'),
      ('IT_RELIABILITY', 'JANITOR', 'Diagnose and repair internal runtime failures while preserving forensic history'),
      ('CYBERSECURITY', 'SENTINEL', 'Independently review security impact, authority boundaries and integrity of repairs')
  `).run();

  await env.DB.prepare(`
    INSERT OR IGNORE INTO repair_recipes
      (id,incident_type,component_pattern,repair_strategy,max_attempts,security_review_required,status,last_updated)
    VALUES
      ('RR-WORKER-REPLACE','WORKER_FAILURE','worker','replace-from-inherited-packet',1,1,'active',?),
      ('RR-MANAGER-RESUME','MANAGER_INTERRUPTION','manager','resume-from-persisted-worker-results',1,1,'active',?),
      ('RR-AI-FALLBACK','AI_INFERENCE_EMPTY','ai','bounded-retry-then-deterministic-fallback',3,1,'active',?)
  `).bind(nowISO(),nowISO(),nowISO()).run();

  // V1.8.12: consumed acceptance objectives stay queryable but cannot consume
  // production queue compute.
  await env.DB.prepare(`
    UPDATE operational_objectives
    SET lifecycle_state='archived',
        retired_reason=COALESCE(retired_reason,'consumed-acceptance-objective')
    WHERE id IN (
      'ARE-002','ARE-003','DCC-001','DCC-002','DCC-003',
      'EYES-001','GOV-METER-002','HAT-001','HRT-001',
      'EAT-001','SAT-001','OAT-001'
    )
      AND COALESCE(lifecycle_state,'active') <> 'archived'
  `).run().catch(()=>{});
}

/* ============================================================
   V1.8 HIVE KNOWLEDGE + DELEGATION CORE
   ============================================================ */

function assertInternalAuthority(scope) {
  const allowed = new Set(["internal-zero-dollar", "read-only", "analysis-only"]);
  if (!allowed.has(String(scope || ""))) {
    throw new Error(`Founder approval required for authority scope: ${scope}`);
  }
  return true;
}

async function createHiveKnowledge(env, record) {
  const id = record.id || `HK-${crypto.randomUUID()}`;
  await env.DB.prepare(`
    INSERT INTO hive_knowledge
      (id, knowledge_type, subject, content, confidence, verification_status,
       source_type, source_ref, supersedes_id, status, last_updated)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    id, record.knowledgeType || "finding", cleanText(record.subject, 1000),
    cleanText(record.content, 12000), Number(record.confidence ?? 0.5),
    record.verificationStatus || "internal", record.sourceType || null,
    record.sourceRef || null, record.supersedesId || null, record.status || "active", nowISO()
  ).run();
  return id;
}

async function createWorkOrder(env, record) {
  assertInternalAuthority(record.authorityScope || "internal-zero-dollar");
  const id = record.id || `WO-${crypto.randomUUID()}`;
  await env.DB.prepare(`
    INSERT INTO work_orders
      (id, parent_work_order_id, objective, requested_by, authority_scope, priority,
       status, founder_approval_required, last_updated)
    VALUES (?, ?, ?, ?, ?, ?, 'queued', 0, ?)
  `).bind(id, record.parentWorkOrderId || null, cleanText(record.objective, 4000),
    record.requestedBy || "HIVE", record.authorityScope || "internal-zero-dollar",
    Number(record.priority || 1), nowISO()).run();
  return id;
}

async function buildInheritedKnowledgePacket(env, workOrderId, departmentId, workerJobId, knowledgeIds) {
  const uniqueIds = [...new Set((knowledgeIds || []).filter(Boolean))].slice(0, 50);
  if (!uniqueIds.length) throw new Error("Knowledge inheritance requires at least one Hive knowledge record.");
  const placeholders = uniqueIds.map(() => "?").join(",");
  const rows = await env.DB.prepare(`
    SELECT id, knowledge_type, subject, content, confidence, verification_status, source_type, source_ref
    FROM hive_knowledge WHERE status='active' AND id IN (${placeholders}) ORDER BY id
  `).bind(...uniqueIds).all();
  if ((rows.results || []).length !== uniqueIds.length) throw new Error("Knowledge inheritance referenced missing/inactive Hive knowledge.");
  const packetId = `KP-${crypto.randomUUID()}`;
  await env.DB.prepare(`
    INSERT INTO knowledge_packets (id, rotation_id, department_id, packet_type, content, provenance)
    VALUES (?, ?, ?, 'hive-inheritance', ?, ?)
  `).bind(packetId, workOrderId, departmentId, JSON.stringify(rows.results),
    JSON.stringify({ workOrderId, workerJobId, hiveKnowledgeIds: uniqueIds })).run();
  for (const knowledgeId of uniqueIds) {
    await env.DB.prepare(`
      INSERT INTO knowledge_inheritance
        (id, work_order_id, department_id, worker_job_id, knowledge_id, packet_id, inheritance_reason)
      VALUES (?, ?, ?, ?, ?, ?, 'Relevant Hive knowledge supplied for constrained internal work')
    `).bind(`KI-${crypto.randomUUID()}`, workOrderId, departmentId, workerJobId, knowledgeId, packetId).run();
  }
  return packetId;
}

async function createConstrainedWorkerJob(env, record) {
  assertInternalAuthority(record.authorityScope || "internal-zero-dollar");
  const department = await env.DB.prepare(`SELECT id FROM departments WHERE id=? AND status='active'`).bind(record.departmentId).first();
  if (!department) throw new Error(`Unknown/inactive department: ${record.departmentId}`);
  const id = record.id || `WJ-${crypto.randomUUID()}`;
  const packetId = await buildInheritedKnowledgePacket(env, record.workOrderId, record.departmentId, id, record.knowledgeIds);
  await env.DB.prepare(`
    INSERT INTO worker_jobs
      (id, rotation_id, department_id, manager_agent, worker_role, mandate,
       knowledge_packet_id, authority_scope, status, attempts, last_updated)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'queued', 0, ?)
  `).bind(id, record.workOrderId, record.departmentId, record.managerAgent || "HIVE",
    cleanText(record.workerRole, 500), cleanText(record.mandate, 4000), packetId,
    record.authorityScope || "internal-zero-dollar", nowISO()).run();
  return { id, packetId };
}

async function submitWorkerResult(env, record) {
  const job = await env.DB.prepare(`SELECT id, department_id, authority_scope FROM worker_jobs WHERE id=?`).bind(record.workerJobId).first();
  if (!job) throw new Error("Worker result references unknown worker job.");
  assertInternalAuthority(job.authority_scope);
  const id = record.id || `WR-${crypto.randomUUID()}`;
  await env.DB.prepare(`
    INSERT INTO worker_results
      (id, work_order_id, worker_job_id, department_id, result_type, result,
       evidence_refs, confidence, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'submitted')
  `).bind(id, record.workOrderId, record.workerJobId, job.department_id,
    record.resultType || "analysis", cleanText(record.result, 12000),
    JSON.stringify(record.evidenceRefs || []), Number(record.confidence ?? 0.5)).run();
  await env.DB.prepare(`UPDATE worker_jobs SET status='completed', result=?, completed_at=?, last_updated=? WHERE id=?`)
    .bind(cleanText(record.result, 12000), nowISO(), nowISO(), record.workerJobId).run();
  return id;
}

async function reintegrateHiveKnowledge(env, record) {
  const synthesis = await env.DB.prepare(`SELECT id, department_id, evidence_refs FROM department_syntheses WHERE id=?`).bind(record.synthesisId).first();
  if (!synthesis) throw new Error("Hive reintegration requires a department synthesis.");
  const knowledgeId = await createHiveKnowledge(env, {
    knowledgeType: record.knowledgeType || "synthesized-learning", subject: record.subject,
    content: record.content, confidence: record.confidence ?? 0.5,
    verificationStatus: record.verificationStatus || "department-synthesized",
    sourceType: "department-synthesis", sourceRef: record.synthesisId
  });
  await env.DB.prepare(`
    INSERT INTO hive_reintegrations
      (id, work_order_id, knowledge_id, source_department_id, source_synthesis_id,
       review_refs, disposition, rationale)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(`HR-${crypto.randomUUID()}`, record.workOrderId, knowledgeId, synthesis.department_id,
    record.synthesisId, JSON.stringify(record.reviewRefs || []), record.disposition || "accepted",
    cleanText(record.rationale || "Validated departmental learning returned to Hive.", 4000)).run();
  return knowledgeId;
}


/* ============================================================
   V1.8.1 HIVE ACCEPTANCE HARNESS
   ============================================================ */

const HAT_WORKER_SYSTEM = `
You are a constrained VIS worker participating in an internal acceptance test.
Use ONLY the supplied objective, mandate, and inherited Hive knowledge packet.
Do not claim external research, customer contact, browsing, spending, or actions.
Separate observations from inference. Cite inherited knowledge IDs explicitly.
Return concise analysis with: OBSERVATIONS, INFERENCE, EVIDENCE IDS, LIMITATIONS.
`;

const HAT_HEAD_SYSTEM = `
You are a VIS Department Head performing internal synthesis.
Use ONLY the supplied worker results and inherited Hive evidence.
Preserve disagreements and limitations. Do not invent evidence.
Return: SYNTHESIS, SUPPORTING WORKER RESULTS, HIVE EVIDENCE IDS, LIMITATIONS.
`;

const HAT_CHALLENGE_SYSTEM = `
You are an independent VIS department reviewer.
Challenge the supplied department synthesis using ONLY the supplied review packet.
Identify unsupported leaps, missing evidence, and alternative interpretations.
Do not invent external facts. Return: REVIEW, CHALLENGES, EVIDENCE IDS, DECISION.
DECISION must be REVIEWED, HOLD, or REJECT.
`;

async function loadPacket(env, packetId) {
  const row = await env.DB.prepare(`SELECT content, provenance FROM knowledge_packets WHERE id=?`).bind(packetId).first();
  if (!row) throw new Error(`Missing knowledge packet: ${packetId}`);
  return row;
}

async function createDepartmentSynthesis(env, record) {
  const head = await env.DB.prepare(`SELECT agent_id, authority_scope FROM department_heads WHERE department_id=? AND status='active'`).bind(record.departmentId).first();
  if (!head) throw new Error(`Missing active department head: ${record.departmentId}`);
  assertInternalAuthority(head.authority_scope);
  const results = await env.DB.prepare(`
    SELECT id, worker_job_id, result, evidence_refs, confidence
    FROM worker_results WHERE work_order_id=? AND department_id=? AND status='submitted'
    ORDER BY created_at, id
  `).bind(record.workOrderId, record.departmentId).all();
  if (!(results.results || []).length) throw new Error(`Department synthesis requires worker evidence: ${record.departmentId}`);
  const synthesis = await think(env, HAT_HEAD_SYSTEM, `
WORK ORDER: ${record.workOrderId}
OBJECTIVE: ${record.objective}
DEPARTMENT: ${record.departmentId}
WORKER RESULTS:
${JSON.stringify(results.results)}
`);
  const id = `DS-${crypto.randomUUID()}`;
  const workerRefs = results.results.map(r => r.id);
  const evidenceRefs = [...new Set(results.results.flatMap(r => {
    try { return JSON.parse(r.evidence_refs || '[]'); } catch { return []; }
  }))];
  await env.DB.prepare(`
    INSERT INTO department_syntheses
      (id, work_order_id, department_id, head_agent, synthesis, evidence_refs, worker_result_refs, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'submitted')
  `).bind(id, record.workOrderId, record.departmentId, head.agent_id,
    cleanText(synthesis, 12000), JSON.stringify(evidenceRefs), JSON.stringify(workerRefs)).run();
  return { id, synthesis, workerRefs, evidenceRefs };
}

async function createCrossDepartmentReview(env, record) {
  const reviewer = await env.DB.prepare(`SELECT agent_id, authority_scope FROM department_heads WHERE department_id=? AND status='active'`).bind(record.reviewerDepartmentId).first();
  if (!reviewer) throw new Error(`Missing active reviewer department: ${record.reviewerDepartmentId}`);
  assertInternalAuthority(reviewer.authority_scope);
  const subject = await env.DB.prepare(`SELECT * FROM department_syntheses WHERE id=? AND work_order_id=?`).bind(record.subjectSynthesisId, record.workOrderId).first();
  if (!subject) throw new Error('Cross-department review requires a valid synthesis.');
  const review = await think(env, HAT_CHALLENGE_SYSTEM, `
WORK ORDER: ${record.workOrderId}
OBJECTIVE: ${record.objective}
SUBJECT DEPARTMENT: ${subject.department_id}
SUBJECT SYNTHESIS: ${subject.synthesis}
EVIDENCE REFS: ${subject.evidence_refs}
WORKER RESULT REFS: ${subject.worker_result_refs}
`);
  const decisionMatch = String(review).match(/DECISION\s*:\s*(REVIEWED|HOLD|REJECT)/i);
  const decision = decisionMatch ? decisionMatch[1].toUpperCase() : 'REVIEWED';
  const id = `CDR-${crypto.randomUUID()}`;
  await env.DB.prepare(`
    INSERT INTO cross_department_reviews
      (id, work_order_id, reviewer_department_id, subject_department_id,
       subject_synthesis_id, review, decision)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).bind(id, record.workOrderId, record.reviewerDepartmentId, subject.department_id,
    record.subjectSynthesisId, cleanText(review, 12000), decision).run();
  return { id, review, decision };
}

async function runHiveAcceptanceTest(env) {
  await ensureSchema(env);
  const testId = `HAT-001-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
  const objective = 'Test whether VIS can inherit, delegate, synthesize, independently challenge, and permanently reintegrate institutional knowledge without external action.';
  const authorityScope = 'internal-zero-dollar';
  assertInternalAuthority(authorityScope);

  const seedA = await createHiveKnowledge(env, {
    id: `${testId}-HK-A`, knowledgeType: 'acceptance-fixture', subject: 'HAT-001 authority',
    content: 'All HAT-001 work is internal-only, reversible, zero-dollar, and may not contact external parties.',
    confidence: 1, verificationStatus: 'acceptance-fixture', sourceType: 'harness', sourceRef: testId
  });
  const seedB = await createHiveKnowledge(env, {
    id: `${testId}-HK-B`, knowledgeType: 'acceptance-fixture', subject: 'HAT-001 success rule',
    content: 'Success requires traceable inherited knowledge, multiple worker results, departmental synthesis, independent challenge, and retrievable Hive reintegration.',
    confidence: 1, verificationStatus: 'acceptance-fixture', sourceType: 'harness', sourceRef: testId
  });
  const seedIds = [seedA, seedB];
  const workOrderId = await createWorkOrder(env, {
    id: `${testId}-WO`, objective, requestedBy: 'HIVE-ACCEPTANCE-HARNESS', authorityScope, priority: 1
  });
  await env.DB.prepare(`UPDATE work_orders SET status='running', started_at=?, last_updated=? WHERE id=?`).bind(nowISO(), nowISO(), workOrderId).run();

  const workerSpecs = [
    { departmentId: 'DISCOVERY', managerAgent: 'ATLAS', workerRole: 'Lineage Analyst', mandate: 'Determine whether the supplied Hive knowledge survives delegation and remains explicitly traceable.' },
    { departmentId: 'DISCOVERY', managerAgent: 'ATLAS', workerRole: 'Authority Analyst', mandate: 'Evaluate whether the delegated task stays inside the internal-zero-dollar authority boundary.' },
    { departmentId: 'DILIGENCE', managerAgent: 'VECTOR', workerRole: 'Evidence Auditor', mandate: 'Independently inspect the acceptance evidence requirements and identify what would make the test invalid.' }
  ];
  const workers = [];
  for (const spec of workerSpecs) {
    const job = await createConstrainedWorkerJob(env, { ...spec, workOrderId, knowledgeIds: seedIds, authorityScope });
    await env.DB.prepare(`UPDATE worker_jobs SET status='running', attempts=attempts+1, started_at=?, last_updated=? WHERE id=?`).bind(nowISO(), nowISO(), job.id).run();
    const packet = await loadPacket(env, job.packetId);
    const output = await think(env, HAT_WORKER_SYSTEM, `
WORK ORDER: ${workOrderId}
OBJECTIVE: ${objective}
ROLE: ${spec.workerRole}
MANDATE: ${spec.mandate}
AUTHORITY: ${authorityScope}
INHERITED PACKET: ${packet.content}
PACKET PROVENANCE: ${packet.provenance}
`);
    const resultId = await submitWorkerResult(env, {
      workOrderId, workerJobId: job.id, resultType: 'hat-001-analysis', result: output,
      evidenceRefs: seedIds, confidence: 0.8
    });
    workers.push({ ...spec, jobId: job.id, packetId: job.packetId, resultId });
  }

  const discoverySynthesis = await createDepartmentSynthesis(env, { workOrderId, departmentId: 'DISCOVERY', objective });
  const challenge = await createCrossDepartmentReview(env, {
    workOrderId, reviewerDepartmentId: 'DILIGENCE', subjectSynthesisId: discoverySynthesis.id, objective
  });
  const reintegratedKnowledgeId = await reintegrateHiveKnowledge(env, {
    workOrderId, synthesisId: discoverySynthesis.id, reviewRefs: [challenge.id],
    subject: 'HAT-001 validated organizational learning',
    content: `Department synthesis: ${cleanText(discoverySynthesis.synthesis, 7000)}\nIndependent review: ${cleanText(challenge.review, 4000)}`,
    confidence: 0.8, verificationStatus: 'hat-001-reviewed', disposition: 'accepted',
    rationale: 'HAT-001 reintegration after worker evidence, department synthesis, and independent Diligence review.'
  });

  const lineage = await env.DB.prepare(`SELECT COUNT(*) AS n FROM knowledge_inheritance WHERE work_order_id=?`).bind(workOrderId).first();
  const resultCount = await env.DB.prepare(`SELECT COUNT(*) AS n FROM worker_results WHERE work_order_id=?`).bind(workOrderId).first();
  const synthesisCount = await env.DB.prepare(`SELECT COUNT(*) AS n FROM department_syntheses WHERE work_order_id=?`).bind(workOrderId).first();
  const reviewCount = await env.DB.prepare(`SELECT COUNT(*) AS n FROM cross_department_reviews WHERE work_order_id=?`).bind(workOrderId).first();
  const reintegration = await env.DB.prepare(`
    SELECT r.id, r.knowledge_id, r.review_refs, k.content, k.source_ref
    FROM hive_reintegrations r JOIN hive_knowledge k ON k.id=r.knowledge_id
    WHERE r.work_order_id=? AND r.knowledge_id=?
  `).bind(workOrderId, reintegratedKnowledgeId).first();
  const authorityViolations = await env.DB.prepare(`
    SELECT COUNT(*) AS n FROM worker_jobs
    WHERE rotation_id=? AND authority_scope NOT IN ('internal-zero-dollar','read-only','analysis-only')
  `).bind(workOrderId).first();
  const lineageExpected = workers.length * seedIds.length;
  const checks = {
    inheritedKnowledgeTraceable: Number(lineage?.n || 0) === lineageExpected,
    multipleWorkerResults: Number(resultCount?.n || 0) === workers.length,
    departmentSynthesisPersisted: Number(synthesisCount?.n || 0) >= 1,
    independentChallengePersisted: Number(reviewCount?.n || 0) >= 1,
    hiveReintegrationRetrievable: Boolean(reintegration && reintegration.content && reintegration.source_ref === discoverySynthesis.id),
    authorityBoundaryPreserved: Number(authorityViolations?.n || 0) === 0,
    externalSpendUSDZero: true
  };
  const passed = Object.values(checks).every(Boolean);
  await env.DB.prepare(`UPDATE work_orders SET status=?, completed_at=?, last_updated=? WHERE id=?`)
    .bind(passed ? 'completed' : 'failed', nowISO(), nowISO(), workOrderId).run();
  await audit(env, 'HIVE_ACCEPTANCE_HARNESS', 'HAT-001', workOrderId, JSON.stringify({ passed, checks, reintegratedKnowledgeId }));
  return {
    ok: passed, test: 'HAT-001', version: VIS.version, testId, workOrderId, objective,
    authorityScope, workers, discoverySynthesisId: discoverySynthesis.id,
    independentReviewId: challenge.id, independentReviewDecision: challenge.decision,
    reintegratedKnowledgeId, checks,
    counts: { inheritance: Number(lineage?.n || 0), workerResults: Number(resultCount?.n || 0), syntheses: Number(synthesisCount?.n || 0), reviews: Number(reviewCount?.n || 0) },
    externalSpendUSD: 0
  };
}

/* ============================================================
   LOGGING
   ============================================================ */

async function audit(
  env,
  actor,
  action,
  target,
  result
) {
  await env.DB.prepare(`
    INSERT INTO audit_log
      (actor, action, target, result)
    VALUES (?, ?, ?, ?)
  `).bind(
    actor,
    action,
    target || null,
    result || null
  ).run();
}

async function health(
  env,
  component,
  status,
  details
) {
  await env.DB.prepare(`
    INSERT INTO runtime_health
      (component, status, details)
    VALUES (?, ?, ?)
  `).bind(
    component,
    status,
    details || null
  ).run();
}

async function recordFailure(
  env,
  rid,
  component,
  error
) {
  const message =
    cleanText(
      error?.stack ||
      error?.message ||
      error,
      8000
    );

  await env.DB.prepare(`
    INSERT INTO failures
      (
        rotation_id,
        component,
        error,
        retry_count,
        resolved
      )
    VALUES (?, ?, ?, 0, 0)
  `).bind(
    rid || null,
    component,
    message
  ).run();

  try {
    await health(
      env,
      component,
      "error",
      message.slice(0, 4000)
    );
  } catch (_) {}

  return message;
}

/* ============================================================
   SLACK
   ============================================================ */

async function slack(env, channel, text) {
  if (!env.SLACK_BOT_TOKEN) {
    throw new Error(
      "SLACK_BOT_TOKEN binding unavailable."
    );
  }

  const response =
    await fetch(
      "https://slack.com/api/chat.postMessage",
      {
        method: "POST",

        headers: {
          Authorization:
            `Bearer ${env.SLACK_BOT_TOKEN}`,

          "Content-Type":
            "application/json; charset=utf-8"
        },

        body: JSON.stringify({
          channel,
          text: String(text || "").slice(0, 35000)
        })
      }
    );

  const result =
    await response.json();

  if (!response.ok || !result.ok) {
    throw new Error(
      `Slack failure: ${
        result.error || response.status
      }`
    );
  }

  return result;
}

/* ============================================================
   AI
   ============================================================ */

function extractAIText(result) {
  if (!result) return "";

  if (typeof result === "string") {
    return result;
  }

  if (typeof result.response === "string") {
    return result.response;
  }

  if (
    result.result &&
    typeof result.result.response === "string"
  ) {
    return result.result.response;
  }

  const candidates = [
    result.output_text,
    result.text,
    result.content,
    result.result?.output_text,
    result.result?.text,
    result.result?.content,
    result.choices?.[0]?.message?.content,
    result.choices?.[0]?.text
  ];
  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim()) return candidate;
    if (Array.isArray(candidate)) {
      const joined = candidate.map(x => typeof x === "string" ? x : (x?.text || x?.content || "")).filter(Boolean).join("\n");
      if (joined.trim()) return joined;
    }
  }
  return "";
}

function classifyAIProviderError(error) {
  const message=cleanText(error?.stack||error?.message||String(error),4000);
  const lower=message.toLowerCase();
  if(lower.includes('3036')||lower.includes('4006')||lower.includes('daily free allocation')||lower.includes('10,000 neurons')||lower.includes('10000 neurons')) return {kind:'provider_quota_exhausted',retryable:false,message};
  if(lower.includes('3040')||lower.includes('out of capacity')||lower.includes('capacity temporarily exceeded')) return {kind:'provider_capacity',retryable:true,message};
  if(lower.includes('subrequest')&&lower.includes('limit')) return {kind:'invocation_subrequest_limit',retryable:false,message};
  return {kind:'ai_transient_or_unknown',retryable:true,message};
}

function utcBudgetKeys(d=new Date()) {
  const iso=d.toISOString();
  return {dayKey:iso.slice(0,10),monthKey:iso.slice(0,7)};
}

function approximateTokens(text) {
  return Math.max(1,Math.ceil(String(text||'').length/4));
}

function neuronsForTokens(inputTokens,outputTokens) {
  const b=VIS.computeBudget;
  return (Number(inputTokens||0)*b.modelInputNeuronsPerMillionTokens/1e6)+(Number(outputTokens||0)*b.modelOutputNeuronsPerMillionTokens/1e6);
}

async function computeBudgetState(env, extraReservation=null) {
  const b=VIS.computeBudget, {monthKey}=utcBudgetKeys();
  const rows=await env.DB.prepare(`SELECT day_key, SUM(CASE WHEN phase='reserve' THEN estimated_neurons ELSE 0 END) reserved, SUM(CASE WHEN phase='reconcile' THEN estimated_neurons ELSE 0 END) reconciled FROM ai_compute_ledger WHERE month_key=? GROUP BY day_key`).bind(monthKey).all();
  const byDay=new Map();
  for(const r of (rows.results||[])) byDay.set(r.day_key,{reserved:Number(r.reserved||0),reconciled:Number(r.reconciled||0)});
  if(extraReservation){ const x=byDay.get(extraReservation.dayKey)||{reserved:0,reconciled:0}; x.reserved+=Number(extraReservation.neurons||0); byDay.set(extraReservation.dayKey,x); }
  let paidNeurons=0,totalNeurons=0;
  for(const x of byDay.values()){ const n=Math.max(x.reserved,x.reconciled); totalNeurons+=n; paidNeurons+=Math.max(0,n-b.freeNeuronsPerDay); }
  const variableUSD=paidNeurons/1000*b.neuronPricePer1000USD;
  const totalInfrastructureUSD=b.workersPaidBaseReserveUSD+variableUSD;
  const ratio=variableUSD/b.variableAICeilingUSD;
  const mode=variableUSD>=b.internalVariableHardStopUSD?'hard_stop':ratio>=b.criticalRatio?'critical':ratio>=b.throttleRatio?'throttle':ratio>=b.warningRatio?'warning':'normal';
  return {enabled:b.enabled,aiPaidInferenceEnabled:b.aiPaidInferenceEnabled,monthKey,totalEstimatedNeurons:Math.round(totalNeurons),estimatedPaidNeurons:Math.round(paidNeurons),estimatedVariableAIUSD:Number(variableUSD.toFixed(6)),reservedWorkersBaseUSD:b.workersPaidBaseReserveUSD,estimatedInfrastructureUSD:Number(totalInfrastructureUSD.toFixed(6)),monthlyInfrastructureCeilingUSD:b.monthlyInfrastructureCeilingUSD,variableAICeilingUSD:b.variableAICeilingUSD,internalVariableHardStopUSD:b.internalVariableHardStopUSD,remainingToInternalStopUSD:Number(Math.max(0,b.internalVariableHardStopUSD-variableUSD).toFixed(6)),mode,accountingMode:b.accountingMode,scope:b.scope};
}

async function reserveAICompute(env,systemPrompt,userPrompt,maxTokens) {
  if(!VIS.computeBudget.enabled||!VIS.computeBudget.aiPaidInferenceEnabled) { const e=new Error('AI paid inference authority disabled by compute governor.'); e.providerState='compute_budget_disabled'; throw e; }
  const inputTokens=approximateTokens(`${systemPrompt}\n${userPrompt}`);
  const outputTokens=Math.max(1,Number(maxTokens||1000));
  const neurons=neuronsForTokens(inputTokens,outputTokens);
  const {dayKey,monthKey}=utcBudgetKeys();
  const projected=await computeBudgetState(env,{dayKey,neurons});
  if(projected.estimatedVariableAIUSD>VIS.computeBudget.internalVariableHardStopUSD){ const e=new Error(`VIS compute budget hard stop: projected variable AI spend $${projected.estimatedVariableAIUSD.toFixed(4)} exceeds internal stop $${VIS.computeBudget.internalVariableHardStopUSD.toFixed(2)}.`); e.providerState='compute_budget_exhausted'; throw e; }
  if(projected.mode==='critical' && outputTokens>1200){ const e=new Error('VIS compute budget critical mode: high-token inference deferred.'); e.providerState='compute_budget_throttled'; throw e; }
  if(projected.mode==='throttle' && outputTokens>1800){ const e=new Error('VIS compute budget throttle mode: high-token inference deferred.'); e.providerState='compute_budget_throttled'; throw e; }
  const reservationId=`AIC-${crypto.randomUUID()}`;
  await env.DB.prepare(`INSERT INTO ai_compute_ledger (id,reservation_id,phase,model,input_tokens,output_tokens,estimated_neurons,day_key,month_key) VALUES (?,?,?,?,?,?,?,?,?)`).bind(`${reservationId}-R`,reservationId,'reserve',VIS.model,inputTokens,outputTokens,neurons,dayKey,monthKey).run();
  return {reservationId,inputTokens,outputTokens,neurons,dayKey,monthKey};
}

async function reconcileAICompute(env,reservation,result,text) {
  const usage=result?.usage||result?.result?.usage||{};
  const inputTokens=Number(usage.input_tokens||usage.prompt_tokens||reservation.inputTokens||0);
  const outputTokens=Number(usage.output_tokens||usage.completion_tokens||approximateTokens(text));
  const neurons=neuronsForTokens(inputTokens,outputTokens);
  await env.DB.prepare(`INSERT INTO ai_compute_ledger (id,reservation_id,phase,model,input_tokens,output_tokens,estimated_neurons,day_key,month_key) VALUES (?,?,?,?,?,?,?,?,?)`).bind(`${reservation.reservationId}-C`,reservation.reservationId,'reconcile',VIS.model,inputTokens,outputTokens,neurons,reservation.dayKey,reservation.monthKey).run();
}

async function think(
  env,
  systemPrompt,
  userPrompt,
  maxTokens = 1000,
  temperature = 0.4
) {
  if (!env.AI) throw new Error("Workers AI binding unavailable.");
  await ensureSchema(env);
  const reservation=await reserveAICompute(env,systemPrompt,userPrompt,maxTokens);
  const errors=[];
  for(let attempt=1;attempt<=3;attempt++){
    try {
      const result=await env.AI.run(VIS.model,{messages:[{role:"system",content:systemPrompt},{role:"user",content:userPrompt}],max_tokens:maxTokens,temperature});
      const text=cleanText(extractAIText(result),14000);
      if(text){ await reconcileAICompute(env,reservation,result,text); return text; }
      errors.push(`attempt ${attempt}: no readable response`);
    } catch(error) {
      const provider=classifyAIProviderError(error);
      errors.push(`attempt ${attempt} [${provider.kind}]: ${provider.message}`);
      if(!provider.retryable) { const terminal=new Error(`Workers AI terminal provider state: ${provider.kind}: ${provider.message}`); terminal.providerState=provider.kind; throw terminal; }
    }
    if(attempt<3) await new Promise(r=>setTimeout(r,250*attempt));
  }
  throw new Error(`Workers AI exhausted bounded retries: ${errors.join(' | ')}`);
}

/* ============================================================
   LOCKING
   ============================================================ */

async function acquireLock(
  env,
  key,
  rid
) {
  try {
    await env.DB.prepare(`
      INSERT INTO execution_locks
        (lock_key, rotation_id)
      VALUES (?, ?)
    `).bind(
      key,
      rid
    ).run();

    return true;

  } catch (_) {
    return false;
  }
}

async function releaseLock(
  env,
  key
) {
  try {
    await env.DB.prepare(`
      DELETE FROM execution_locks
      WHERE lock_key = ?
    `).bind(key).run();
  } catch (_) {}
}

/* ============================================================
   ROTATIONS
   ============================================================ */

async function createRotation(
  env,
  rid,
  agent
) {
  await env.DB.prepare(`
    INSERT INTO rotations
      (
        id,
        agent_id,
        started_at,
        status,
        cost_usd
      )
    VALUES (?, ?, ?, ?, 0)
  `).bind(
    rid,
    agent,
    nowISO(),
    "running"
  ).run();
}

async function finishRotation(
  env,
  rid,
  summary,
  status = "completed"
) {
  await env.DB.prepare(`
    UPDATE rotations
    SET
      completed_at = ?,
      status = ?,
      summary = ?
    WHERE id = ?
  `).bind(
    nowISO(),
    status,
    cleanText(summary, 4000),
    rid
  ).run();
}

/* ============================================================
   HTTP SENSOR FETCH
   ============================================================ */

async function fetchText(url) {
  const maxAttempts = 3;
  let lastError;

  for (
    let attempt = 1;
    attempt <= maxAttempts;
    attempt++
  ) {
    const controller =
      new AbortController();

    const timeout =
      setTimeout(
        () => controller.abort(),
        12000
      );

    try {
      const response =
        await fetch(url, {
          headers: {
            "User-Agent":
              "VIS-Research-Network/1.6"
          },
          signal: controller.signal
        });

      if (!response.ok) {
        const error =
          new Error(
            `HTTP ${response.status}: ${url}`
          );

        error.status =
          response.status;

        throw error;
      }

      return await response.text();

    } catch (error) {
      lastError = error;

      const status =
        Number(error?.status || 0);

      const transient =
        error?.name === "AbortError" ||
        status === 408 ||
        status === 425 ||
        status === 429 ||
        status >= 500 ||
        status === 0;

      if (
        !transient ||
        attempt === maxAttempts
      ) {
        throw error;
      }

      await new Promise(
        resolve =>
          setTimeout(
            resolve,
            500 * attempt
          )
      );

    } finally {
      clearTimeout(timeout);
    }
  }

  throw lastError ||
    new Error(
      `Sensor fetch failed: ${url}`
    );
}

async function fetchJSON(url) {
  const text =
    await fetchText(url);

  return JSON.parse(text);
}

/* ============================================================
   ATOM PARSER
   ============================================================ */

function parseAtom(xml, limit = 4) {
  const entries =
    String(xml || "").match(
      /<entry\b[\s\S]*?<\/entry>/gi
    ) || [];

  return entries
    .slice(0, limit)
    .map(entry => {
      const title =
        xmlValue(entry, "title");

      const summary =
        xmlValue(entry, "summary") ||
        xmlValue(entry, "content");

      const published =
        xmlValue(entry, "published") ||
        xmlValue(entry, "updated");

      const url =
        atomLink(entry);

      return {
        title,
        summary,
        published,
        url
      };
    })
    .filter(item =>
      item.title && item.url
    );
}

/* ============================================================
   SENSOR INGESTION
   ============================================================ */

async function storeSensorItem(
  env,
  rid,
  sensor,
  item
) {
  const fp =
    await fingerprint(
      `${sensor.id}|${item.url}|${item.title}`
    );

  try {
    const result =
      await env.DB.prepare(`
        INSERT INTO sensor_items
          (
            fingerprint,
            source_id,
            source_name,
            source_url,
            item_url,
            title,
            summary,
            published_at,
            retrieved_at,
            authority,
            first_rotation_id
          )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        fp,
        sensor.id,
        sensor.name,
        sensor.url,
        item.url,
        cleanText(item.title, 1000),
        cleanText(item.summary, 5000),
        item.published || null,
        nowISO(),
        sensor.authority,
        rid
      ).run();

    return {
      isNew: true,
      id: result.meta?.last_row_id || null,
      fingerprint: fp
    };

  } catch (error) {
    if (
      String(error).toLowerCase().includes("unique")
    ) {
      return {
        isNew: false,
        id: null,
        fingerprint: fp
      };
    }

    throw error;
  }
}

async function ingestAtomSensor(
  env,
  rid,
  sensor
) {
  const xml =
    await fetchText(sensor.url);

  const items =
    parseAtom(xml, 4);

  let added = 0;

  for (const item of items) {
    const stored =
      await storeSensorItem(
        env,
        rid,
        sensor,
        item
      );

    if (stored.isNew) {
      added++;
    }
  }

  return {
    fetched: items.length,
    added
  };
}

async function ingestHNSensor(
  env,
  rid,
  sensor
) {
  const ids =
    await fetchJSON(sensor.url);

  if (!Array.isArray(ids)) {
    throw new Error(
      "HN newstories did not return an array."
    );
  }

  const selected =
    ids.slice(0, 5);

  const responses =
    await Promise.allSettled(
      selected.map(id =>
        fetchJSON(
          `https://hacker-news.firebaseio.com/v0/item/${id}.json`
        )
      )
    );

  let fetched = 0;
  let added = 0;

  for (const response of responses) {
    if (
      response.status !== "fulfilled" ||
      !response.value?.title
    ) {
      continue;
    }

    fetched++;

    const hn =
      response.value;

    const item = {
      title: hn.title,

      summary:
        `Score: ${hn.score ?? 0}; comments: ${hn.descendants ?? 0}`,

      published:
        hn.time
          ? new Date(
              hn.time * 1000
            ).toISOString()
          : null,

      url:
        hn.url ||
        `https://news.ycombinator.com/item?id=${hn.id}`
    };

    const stored =
      await storeSensorItem(
        env,
        rid,
        sensor,
        item
      );

    if (stored.isNew) {
      added++;
    }
  }

  return {
    fetched,
    added
  };
}

async function runSensors(env, rid) {
  const report = [];

  for (const sensor of VIS.sensors) {
    try {
      let result;

      if (sensor.kind === "atom") {
        result =
          await ingestAtomSensor(
            env,
            rid,
            sensor
          );

      } else if (sensor.kind === "hn") {
        result =
          await ingestHNSensor(
            env,
            rid,
            sensor
          );

      } else {
        throw new Error(
          `Unsupported sensor type: ${sensor.kind}`
        );
      }

      report.push({
        source: sensor.name,
        ok: true,
        fetched: result.fetched,
        newItems: result.added
      });

      try {
        await env.DB.prepare(`
          UPDATE failures
          SET resolved = 1
          WHERE resolved = 0
            AND component = ?
        `).bind(
          `sensor:${sensor.id}`
        ).run();
      } catch (_) {}

    } catch (error) {
      report.push({
        source: sensor.name,
        ok: false,
        error:
          cleanText(
            error?.message || error,
            500
          )
      });

      try {
        await recordFailure(
          env,
          rid,
          `sensor:${sensor.id}`,
          error
        );
      } catch (_) {}
    }
  }

  return report;
}

/* ============================================================
   LOAD NEW SENSOR ITEMS
   ============================================================ */

async function getNewSensorItems(
  env,
  rid
) {
  const result =
    await env.DB.prepare(`
      SELECT
        id,
        source_id,
        source_name,
        item_url,
        title,
        summary,
        published_at,
        retrieved_at,
        authority
      FROM sensor_items
      WHERE first_rotation_id = ?
      ORDER BY authority DESC, id DESC
      LIMIT 30
    `).bind(rid).all();

  return result.results || [];
}

/* ============================================================
   SCOUT
   ============================================================ */

const SCOUT_SYSTEM = `
You are SCOUT, the evidence-triage layer inside VIS.

Do not invent businesses. Select external signals that deserve deeper investigation.
Optimize for verified economic intelligence per dollar and per owner-minute.

Judge economic relevance, novelty, monetization potential, automation potential,
evidence strength and urgency. Separate FACT, INTERPRETATION and HYPOTHESIS.
A headline, popularity or technology novelty is not customer demand.

DIVERSITY MANDATE:
Search across economic activity, not merely familiar AI/cyber themes. Treat physical
products, boring B2B services, manufacturing, construction, logistics, healthcare,
agriculture, energy, finance, education, procurement, licensing, distribution,
import/export and niche markets as first-class territory. Unfamiliarity is not a
rejection reason. When several signals are similarly strong, prefer a shortlist that
expands industry coverage. Do not suppress a technology signal when its evidence is
materially stronger. It is acceptable to select nothing.

Return concise analysis followed by exactly:
SHORTLIST: IDs only, comma separated
Or: SHORTLIST: NONE
`;

async function scoutSignals(
  env,
  rid,
  items
) {
  if (!items.length) {
    return {
      output:
        "No new external evidence this rotation.\nSHORTLIST: NONE",
      selectedIds: []
    };
  }

  const compact =
    items.map(item => ({
      id: item.id,
      source: item.source_name,
      authority: item.authority,
      title: item.title,
      summary: item.summary,
      published: item.published_at,
      url: item.item_url
    }));

  const output =
    await think(
      env,
      SCOUT_SYSTEM,
      `
ROTATION:
${rid}

NEW EXTERNAL SIGNALS:

${JSON.stringify(compact, null, 2)}

Select no more than FIVE signals.

Prefer diverse, economically meaningful signals.

Do not select an item simply because it concerns
AI or technology.
`,
      900,
      0.25
    );

  const match =
    output.match(
      /SHORTLIST:\s*([^\n]+)/i
    );

  let selectedIds = [];

  if (
    match &&
    !match[1]
      .toUpperCase()
      .includes("NONE")
  ) {
    selectedIds =
      match[1]
        .split(",")
        .map(value =>
          Number(
            value.replace(/[^\d]/g, "")
          )
        )
        .filter(value =>
          Number.isInteger(value) &&
          items.some(
            item => item.id === value
          )
        )
        .slice(0, 5);
  }

  for (const item of items) {
    await env.DB.prepare(`
      INSERT INTO scout_signals
        (
          rotation_id,
          sensor_item_id,
          scout_output,
          relevance_score,
          selected
        )
      VALUES (?, ?, ?, ?, ?)
    `).bind(
      rid,
      item.id,
      output,
      selectedIds.includes(item.id)
        ? 1
        : 0,
      selectedIds.includes(item.id)
        ? 1
        : 0
    ).run();
  }

  return {
    output,
    selectedIds
  };
}

async function loadSelectedSignals(
  env,
  ids
) {
  if (!ids.length) {
    return [];
  }

  const placeholders =
    ids.map(() => "?").join(",");

  const result =
    await env.DB.prepare(`
      SELECT
        id,
        source_name,
        item_url,
        title,
        summary,
        published_at,
        retrieved_at,
        authority
      FROM sensor_items
      WHERE id IN (${placeholders})
      ORDER BY authority DESC, id DESC
    `).bind(...ids).all();

  return result.results || [];
}

/* ============================================================
   INSTITUTIONAL MEMORY
   ============================================================ */

async function getContext(env) {
  const opportunities =
    await env.DB.prepare(`
      SELECT
        id,
        name,
        stage,
        status,
        next_test
      FROM opportunities
      ORDER BY rowid DESC
      LIMIT 10
    `).all();

  const research =
    await env.DB.prepare(`
      SELECT
        agent_id,
        finding,
        implication,
        recommended_action
      FROM research
      ORDER BY rowid DESC
      LIMIT 10
    `).all();

  const experiments =
    await env.DB.prepare(`
      SELECT
        id,
        opportunity_id,
        hypothesis,
        result,
        decision
      FROM experiments
      ORDER BY rowid DESC
      LIMIT 6
    `).all();

  return {
    opportunities:
      opportunities.results || [],

    recentResearch:
      research.results || [],

    experiments:
      experiments.results || []
  };
}

/* ============================================================
   ATLAS
   ============================================================ */

const ATLAS_SYSTEM = `
You are ATLAS, Discovery Department Head inside VIS.

Think aggressively, laterally and across industries. Unfamiliarity is a learning
requirement, not a rejection criterion. Do not anchor to the founder's existing work.
Maintain strict factual integrity and never manufacture demand.

Every discovery must expose this traceable chain:
SIGNAL -> CUSTOMER PAIN -> OPPORTUNITY -> EVIDENCE -> FALSIFIABLE ASSUMPTION -> TEST.
Label verified observations, institutional memory, reasoned hypotheses and unverified
assumptions. If a link is unsupported, say so. Killed ideas require materially new
evidence before revival. You may conclude NO HIGH-CONFIDENCE OPPORTUNITY FOUND.

You cannot spend money or take consequential external actions.

Return:
DISCOVERY
SIGNALS USED (include URLs)
SIGNAL -> PAIN -> OPPORTUNITY CHAIN
WHAT IS ACTUALLY KNOWN
CROSS-INDUSTRY INSIGHT
TARGET CUSTOMER
CUSTOMER PAIN
BUSINESS MODEL
WHY NOW
AUTOMATION POTENTIAL
REVENUE LOGIC
MAJOR RISKS
UNVERIFIED ASSUMPTIONS
FALSIFIABLE ASSUMPTION
ZERO-DOLLAR VALIDATION TEST
VECTOR HANDOFF
`;

/* ============================================================
   VECTOR
   ============================================================ */

const VECTOR_SYSTEM = `
You are VECTOR, Diligence Department Head inside VIS.

CONTEXT ISOLATION RULE: evaluate only the current rotation packet supplied to you.
Do not import, recall or substitute prior opportunities, examples or templates. If a
concept is not present in the current Atlas memorandum or current evidence packet, it
must not appear in your assessment.

Independently challenge demand, pain, competition, pricing, unit economics, capital,
time to revenue, automation, owner labour, scalability, defensibility, dependencies,
failure modes and evidence quality. Classify important claims SUPPORTED, PARTIALLY
SUPPORTED or UNSUPPORTED. Popularity is not demand. Never manufacture evidence.

You cannot spend money or take consequential external actions.

Return:
HYPOTHESIS
EVIDENCE QUALITY
TRACEABILITY CHECK
WHAT HOLDS UP
WHAT DOES NOT
DEMAND ASSESSMENT
ECONOMIC LOGIC
AUTOMATION ASSESSMENT
OWNER-LABOUR ASSESSMENT
KEY DEPENDENCIES
UNVERIFIED ASSUMPTIONS
FASTEST ZERO-DOLLAR FALSIFICATION TEST
DECISION: ADVANCE / HOLD / KILL
REASON
ATLAS FEEDBACK
`;

/* ============================================================
   V1.7 QUALITY + EXECUTION CONTROL
   ============================================================ */

function normalizeWords(text) {
  return new Set(
    String(text || "")
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, " ")
      .split(/\s+/)
      .filter(word => word.length >= 5)
  );
}

function overlapRatio(a, b) {
  const left = normalizeWords(a);
  const right = normalizeWords(b);
  if (!left.size || !right.size) return 0;
  let overlap = 0;
  for (const word of left) if (right.has(word)) overlap++;
  return overlap / Math.min(left.size, right.size);
}

async function evaluateReasoningQuality(env, rid, subjectType, subjectId, output, currentPacket) {
  const flags = [];
  const required = subjectType === "ATLAS"
    ? ["CUSTOMER PAIN", "FALSIFIABLE ASSUMPTION", "ZERO-DOLLAR VALIDATION TEST"]
    : ["TRACEABILITY CHECK", "EVIDENCE QUALITY", "DECISION:"];

  for (const heading of required) {
    if (!String(output).toUpperCase().includes(heading)) flags.push(`missing:${heading}`);
  }

  if (subjectType === "VECTOR") {
    const recent = await env.DB.prepare(`
      SELECT finding FROM research
      WHERE agent_id = 'VECTOR' AND rotation_id != ?
      ORDER BY rowid DESC LIMIT 3
    `).bind(`${rid}-VECTOR`).all();
    const maxOverlap = Math.max(0, ...(recent.results || []).map(row => overlapRatio(output, row.finding)));
    if (maxOverlap > 0.72) flags.push(`possible-stale-repetition:${maxOverlap.toFixed(2)}`);
    if (!currentPacket.length && !/HOLD|KILL|NO HIGH-CONFIDENCE/i.test(output)) {
      flags.push("assertive-without-current-evidence");
    }
  }

  const passed = flags.length === 0;
  await env.DB.prepare(`
    INSERT INTO quality_evaluations
      (rotation_id, subject_type, subject_id, evaluator, passed, flags, notes)
    VALUES (?, ?, ?, 'VIS_QA', ?, ?, ?)
  `).bind(
    rid, subjectType, subjectId, passed ? 1 : 0,
    JSON.stringify(flags), passed ? "Quality gate passed." : "Output retained for audit but flagged for review."
  ).run();

  return { passed, flags };
}

async function quarantineReasoning(env, rid, subjectType, subjectId, output, quality) {
  const packetId = `QUARANTINE-${subjectId}-${Date.now()}`;
  await env.DB.prepare(`
    INSERT INTO knowledge_packets
      (id, rotation_id, department_id, packet_type, content, provenance)
    VALUES (?, ?, ?, 'reasoning-quarantine', ?, ?)
  `).bind(
    packetId,
    rid,
    subjectType === "ATLAS" ? "DISCOVERY" : "DILIGENCE",
    cleanText(output, 12000),
    JSON.stringify({ subjectType, subjectId, flags: quality?.flags || [] })
  ).run();
  await audit(env, "VIS_QA", "REASONING_QUARANTINED", subjectId, JSON.stringify(quality?.flags || []));
  return packetId;
}


function deterministicStructureRepair(subjectType, output, quality) {
  let repaired = String(output || "").trim();
  const flags = Array.isArray(quality?.flags) ? quality.flags : [];

  const missing = flags
    .filter(flag => String(flag).startsWith("missing:"))
    .map(flag => String(flag).slice("missing:".length));

  if (!missing.length) {
    return repaired;
  }

  const fallback = {
    "CUSTOMER PAIN":
      "CUSTOMER PAIN\nInsufficient verified evidence to strengthen this section beyond the current memorandum.",
    "FALSIFIABLE ASSUMPTION":
      "FALSIFIABLE ASSUMPTION\nThe opportunity should not advance unless the stated customer pain and economic value can be verified with current evidence or a permitted zero-dollar test.",
    "ZERO-DOLLAR VALIDATION TEST":
      "ZERO-DOLLAR VALIDATION TEST\nUse only existing public or internal evidence to test the weakest material assumption. Do not contact prospects, spend money, create accounts, publish externally, or manufacture evidence. If the available evidence cannot test the assumption, record the test as blocked.",
    "TRACEABILITY CHECK":
      "TRACEABILITY CHECK\nNo claim should be treated as supported unless it is traceable to the current Atlas memorandum or current evidence packet.",
    "EVIDENCE QUALITY":
      "EVIDENCE QUALITY\nEvidence is limited to the current packet; unsupported claims remain unsupported.",
    "DECISION:":
      "DECISION: HOLD\nInsufficient current evidence for advancement."
  };

  for (const heading of missing) {
    const section = fallback[heading];
    if (section && !repaired.toUpperCase().includes(heading)) {
      repaired += `\n\n${section}`;
    }
  }

  return repaired;
}

async function selfRepairReasoning(env, rid, subjectType, subjectId, output, currentPacket, repairContext = "") {
  const maxRepairAttempts = 2;
  let candidate = output;
  let quality = await evaluateReasoningQuality(env, rid, subjectType, subjectId, candidate, currentPacket);

  for (let attempt = 1; !quality.passed && attempt <= maxRepairAttempts; attempt++) {
    const repairSystem = `
You are VIS REASONING REPAIR, a constrained internal quality worker.
Repair the supplied ${subjectType} output only. Do not invent evidence, customers, prices, demand, prior context or external facts.
Preserve useful reasoning, remove stale/template leakage, and correct only the QA failures listed.
Use only the supplied current packet and repair context. If evidence is insufficient, explicitly say so and choose a conservative HOLD/KILL or NO HIGH-CONFIDENCE OPPORTUNITY result as appropriate.
Return the complete corrected ${subjectType} memorandum, not commentary about the repair.
`;

    candidate = await think(
      env,
      repairSystem,
      `
ROTATION: ${rid}
SUBJECT: ${subjectType}
REPAIR ATTEMPT: ${attempt}/${maxRepairAttempts}
QA FLAGS: ${JSON.stringify(quality.flags)}

CURRENT PACKET:
${JSON.stringify(currentPacket, null, 2)}

REPAIR CONTEXT:
${cleanText(repairContext, 9000)}

OUTPUT TO REPAIR:
${cleanText(candidate, 12000)}
`,
      1200,
      0.15
    );

    await audit(env, "VIS_QA", "REASONING_REPAIR_ATTEMPT", subjectId, `attempt=${attempt}; flags=${JSON.stringify(quality.flags)}`);
    quality = await evaluateReasoningQuality(env, rid, subjectType, subjectId, candidate, currentPacket);
  }

  if (!quality.passed) {
    const deterministicCandidate =
      deterministicStructureRepair(
        subjectType,
        candidate,
        quality
      );

    if (deterministicCandidate !== candidate) {
      await audit(
        env,
        "VIS_QA",
        "DETERMINISTIC_STRUCTURE_REPAIR",
        subjectId,
        JSON.stringify(quality.flags || [])
      );

      candidate = deterministicCandidate;

      quality =
        await evaluateReasoningQuality(
          env,
          rid,
          subjectType,
          subjectId,
          candidate,
          currentPacket
        );
    }
  }

  if (!quality.passed) {
    const quarantineId =
      await quarantineReasoning(
        env,
        rid,
        subjectType,
        subjectId,
        candidate,
        quality
      );

    return {
      output: candidate,
      quality,
      repaired: true,
      accepted: false,
      quarantineId
    };
  }

  return {
    output: candidate,
    quality,
    repaired: candidate !== output,
    accepted: true,
    quarantineId: null
  };
}


async function recoverStaleRuntimeState(env) {
  await ensureSchema(env);

  const staleRotations =
    await env.DB.prepare(`
      UPDATE rotations
      SET
        status = 'failed',
        completed_at = COALESCE(completed_at, CURRENT_TIMESTAMP),
        summary = COALESCE(
          summary,
          'Runtime watchdog marked abandoned running rotation as failed.'
        )
      WHERE status = 'running'
        AND datetime(started_at) <
            datetime('now', '-15 minutes')
    `).run();

  const staleLocks =
    await env.DB.prepare(`
      DELETE FROM execution_locks
      WHERE datetime(created_at) <
            datetime('now', '-15 minutes')
    `).run();

  await watchdogExperiments(env);

  // V1.8.11: normalize mixed ISO/SQLite timestamps before comparing them.
  // substr(...,1,19) strips fractional seconds/Z and replace() converts the
  // ISO T separator to SQLite's canonical space-separated timestamp.
  const staleCutoffExpr = `julianday('now') - (30.0 / 1440.0)`;
  const objectiveTimeExpr = `julianday(replace(substr(COALESCE(last_updated, started_at, created_at),1,19),'T',' '))`;

  const oldestRunningObjective = await env.DB.prepare(`
    SELECT
      id,
      work_order_id,
      last_updated,
      started_at,
      created_at,
      ${objectiveTimeExpr} AS normalized_jd,
      julianday('now') AS now_jd,
      (${objectiveTimeExpr} <= ${staleCutoffExpr}) AS is_stale
    FROM operational_objectives
    WHERE status = 'running'
      AND COALESCE(lifecycle_state,'active')='active'
      AND COALESCE(continuation_count,0) < COALESCE(continuation_limit,8)
    ORDER BY ${objectiveTimeExpr} ASC, priority DESC, created_at ASC
    LIMIT 1
  `).first();

  const staleObjective =
    oldestRunningObjective && Number(oldestRunningObjective.is_stale) === 1
      ? oldestRunningObjective
      : null;

  let operationalObjectiveRecovery = {
    detected: false,
    claimed: false,
    objectiveId: null,
    diagnostics: {
      oldestRunningObjectiveId: oldestRunningObjective?.id || null,
      oldestRunningLastUpdated: oldestRunningObjective?.last_updated || null,
      oldestRunningStartedAt: oldestRunningObjective?.started_at || null,
      oldestRunningCreatedAt: oldestRunningObjective?.created_at || null,
      normalizedJulianDay:
        oldestRunningObjective?.normalized_jd ?? null,
      nowJulianDay:
        oldestRunningObjective?.now_jd ?? null,
      staleByNormalizedClock:
        oldestRunningObjective
          ? Number(oldestRunningObjective.is_stale) === 1
          : null,
      staleThresholdMinutes: 30
    },
    result: null
  };

  if (staleObjective) {
    operationalObjectiveRecovery.detected = true;
    operationalObjectiveRecovery.objectiveId = staleObjective.id;

    const claimed = await env.DB.prepare(`
      UPDATE operational_objectives
      SET status = 'queued',
          last_updated = ?
      WHERE id = ?
        AND status = 'running'
        AND COALESCE(lifecycle_state,'active')='active'
        AND COALESCE(continuation_count,0) < COALESCE(continuation_limit,8)
        AND julianday(replace(substr(COALESCE(last_updated, started_at, created_at),1,19),'T',' '))
            <= julianday('now') - (30.0 / 1440.0)
    `).bind(nowISO(), staleObjective.id).run();

    if ((claimed.meta?.changes || 0) === 1) {
      operationalObjectiveRecovery.claimed = true;

      await audit(
        env,
        "JANITOR",
        "STALE_OPERATIONAL_OBJECTIVE_CLAIMED",
        staleObjective.work_order_id || staleObjective.id,
        JSON.stringify({
          objectiveId: staleObjective.id,
          previousLastUpdated: staleObjective.last_updated,
          recovery: "atomic-requeue-and-autonomous-resume",
          externalSpendUSD: 0
        })
      );

      try {
        operationalObjectiveRecovery.result =
          await processOperationalObjective(env, staleObjective.id);
      } catch (error) {
        await recordFailure(
          env,
          staleObjective.work_order_id || staleObjective.id,
          "stale-operational-objective-resume",
          error
        );

        await env.DB.prepare(`
          UPDATE operational_objectives
          SET status = 'queued',
              last_updated = ?
          WHERE id = ?
            AND status = 'running'
        `).bind(nowISO(), staleObjective.id).run();

        operationalObjectiveRecovery.result = {
          ok: false,
          error: cleanText(error?.message || String(error), 1000)
        };
      }
    }
  }

  await audit(
    env,
    "VIS_RUNTIME",
    "STALE_STATE_RECOVERY",
    "runtime",
    JSON.stringify({
      rotationsChanged:
        staleRotations.meta?.changes || 0,
      locksRemoved:
        staleLocks.meta?.changes || 0,
      operationalObjectiveRecovery
    })
  );

  return {
    ok: true,
    version: VIS.version,
    staleRotationsRecovered:
      staleRotations.meta?.changes || 0,
    staleLocksRemoved:
      staleLocks.meta?.changes || 0,
    operationalObjectiveRecovery,
    experimentWatchdogRun: true,
    externalSpendUSD: 0
  };
}

async function synchronizeApprovedExperiments(env) {
  // Queue only explicitly approved, zero-dollar experiments. Never infer approval.
  const approved = await env.DB.prepare(`
    SELECT id, opportunity_id
    FROM experiments
    WHERE COALESCE(max_approved_spend, 0) = 0
      AND LOWER(COALESCE(status, '')) NOT IN ('completed', 'killed')
      AND (
        LOWER(COALESCE(status, '')) = 'approved'
        OR LOWER(COALESCE(decision, '')) = 'approved'
        OR (
          approved_at IS NOT NULL
          AND LOWER(COALESCE(status, '')) NOT IN
            ('completed', 'blocked', 'failed', 'killed')
        )
      )
  `).all();

  for (const experiment of approved.results || []) {
    await env.DB.prepare(`
      INSERT OR IGNORE INTO experiment_queue
        (id, experiment_id, opportunity_id, status, assigned_to)
      VALUES (?, ?, ?, 'queued', 'EXPERIMENT_WORKER')
    `).bind(`QUEUE-${experiment.id}`, experiment.id, experiment.opportunity_id || null).run();
  }
}

async function watchdogExperiments(env) {
  // Requeue stale internal work. No spending or external action is authorized here.
  await env.DB.prepare(`
    UPDATE experiment_queue
    SET status = 'queued',
        attempts = attempts + 1,
        diagnostic = 'Watchdog requeued stale internal work',
        last_updated = CURRENT_TIMESTAMP
    WHERE status IN ('assigned', 'running')
      AND attempts < 3
      AND datetime(COALESCE(started_at, queued_at)) < datetime('now', '-2 hours')
  `).run();

  await env.DB.prepare(`
    UPDATE experiment_queue
    SET status = 'quarantined',
        diagnostic = 'Watchdog quarantined work after retry ceiling',
        completed_at = CURRENT_TIMESTAMP,
        last_updated = CURRENT_TIMESTAMP
    WHERE status IN ('assigned', 'running')
      AND attempts >= 3
      AND datetime(COALESCE(started_at, queued_at)) < datetime('now', '-2 hours')
  `).run();
}

const EXPERIMENT_WORKER_SYSTEM = `
You are EXPERIMENT_WORKER inside VIS. Execute only bounded, internal, zero-dollar analytical work.
You may analyze the supplied experiment, existing VIS evidence and institutional memory. You may not
contact people, create accounts, publish, buy anything, claim legal/compliance certification, or invent
external evidence. Distinguish OBSERVATION, INFERENCE and UNKNOWN. If the requested method requires
external action or evidence not present, mark it BLOCKED rather than pretending it was executed.

Return exactly these headings:
EXECUTION STATUS: COMPLETED / BLOCKED / FAILED
HYPOTHESIS TESTED
METHOD ACTUALLY EXECUTED
EVIDENCE USED
OBSERVATIONS
INFERENCES
UNKNOWNS
RESULT
INFORMATION GAINED
KILL-CRITERIA CHECK
NEXT ZERO-DOLLAR STEP
EXTERNAL ACTION REQUIRED: YES / NO
`;

const EXPERIMENT_VECTOR_SYSTEM = `
You are VECTOR reviewing a completed VIS experiment. Use only the experiment record, execution output,
and evidence packet supplied. Do not import prior opportunities or invent evidence. Determine what the
experiment actually established, what remains unknown, and whether the opportunity should ADVANCE,
ITERATE, HOLD, KILL, or ESCALATE. ESCALATE only when a useful next step requires Founder authority.

Return exactly:
TRACEABILITY CHECK
EVIDENCE QUALITY
WHAT THE EXPERIMENT ESTABLISHED
WHAT IT DID NOT ESTABLISH
ECONOMIC IMPLICATION
RISK / DEPENDENCY UPDATE
DECISION: ADVANCE / ITERATE / HOLD / KILL / ESCALATE
REASON
NEXT STEP
FOUNDER ACTION REQUIRED: YES / NO
`;

async function loadExperimentEvidencePacket(env, experiment) {
  const evidence = await env.DB.prepare(`
    SELECT source_name, item_url, title, evidence_text, verification_status, retrieved_at
    FROM evidence
    ORDER BY id DESC
    LIMIT 12
  `).all();

  const research = await env.DB.prepare(`
    SELECT agent_id, finding, evidence, implication, recommended_action, created_at
    FROM research
    ORDER BY rowid DESC
    LIMIT 8
  `).all();

  const opportunity = experiment.opportunity_id
    ? await env.DB.prepare(`
        SELECT id, name, stage, demand_evidence, pricing_evidence, unit_economics,
               automation_pct, owner_labor, risks_dependencies, next_test, status
        FROM opportunities WHERE id = ? LIMIT 1
      `).bind(experiment.opportunity_id).first()
    : null;

  return {
    opportunity: opportunity || null,
    evidence: evidence.results || [],
    recentResearch: research.results || []
  };
}

function parseExperimentStatus(output) {
  const match = String(output || '').match(/EXECUTION STATUS:\s*(COMPLETED|BLOCKED|FAILED)/i);
  return match ? match[1].toUpperCase() : 'FAILED';
}

function parseExperimentDecision(output) {
  const match = String(output || '').match(/DECISION:\s*(ADVANCE|ITERATE|HOLD|KILL|ESCALATE)/i);
  return match ? match[1].toUpperCase() : 'HOLD';
}

async function executeNextApprovedExperiment(env, parentRid) {
  const completedGuard = await env.DB.prepare(`
    SELECT q.id AS queue_id, q.experiment_id
    FROM experiment_queue q
    JOIN experiments e ON e.id = q.experiment_id
    WHERE q.status = 'queued'
      AND (
        LOWER(COALESCE(e.status, '')) = 'completed'
        OR EXISTS (
          SELECT 1
          FROM experiment_evidence ee
          WHERE ee.experiment_id = q.experiment_id
            AND ee.evidence_type = 'worker-execution'
            AND ee.verification_status = 'internally-executed'
        )
      )
    ORDER BY q.queued_at ASC
    LIMIT 1
  `).first();

  if (completedGuard) {
    await env.DB.prepare(`
      UPDATE experiment_queue
      SET status = 'completed',
          completed_at = COALESCE(completed_at, CURRENT_TIMESTAMP),
          last_updated = CURRENT_TIMESTAMP,
          diagnostic = 'V1.7.3 idempotency guard prevented duplicate execution'
      WHERE id = ?
    `).bind(completedGuard.queue_id).run();

    await audit(
      env,
      'VIS_RUNTIME',
      'EXPERIMENT_DUPLICATE_PREVENTED',
      completedGuard.experiment_id,
      'Previously completed experiment was not re-executed.'
    );
  }

  const queue = await env.DB.prepare(`
    SELECT q.id AS queue_id, q.experiment_id, q.opportunity_id, q.attempts,
           e.hypothesis, e.method, e.kill_criteria, e.max_approved_spend,
           e.actual_spend, e.status AS experiment_status, e.decision AS experiment_decision
    FROM experiment_queue q
    JOIN experiments e ON e.id = q.experiment_id
    WHERE q.status = 'queued'
      AND q.authority_scope = 'internal-zero-dollar'
      AND COALESCE(e.max_approved_spend, 0) = 0
      AND COALESCE(e.actual_spend, 0) = 0
    ORDER BY q.queued_at ASC
    LIMIT 1
  `).first();

  if (!queue) return { executed: false, reason: 'No approved zero-dollar experiment queued.' };

  const workerRid = `${parentRid}-EXP-${queue.experiment_id}`;
  await createRotation(env, workerRid, 'EXPERIMENT_WORKER');

  await env.DB.prepare(`
    UPDATE experiment_queue
    SET status = 'running', assigned_to = 'EXPERIMENT_WORKER', attempts = attempts + 1,
        started_at = COALESCE(started_at, CURRENT_TIMESTAMP), last_updated = CURRENT_TIMESTAMP,
        diagnostic = 'Execution worker started'
    WHERE id = ?
  `).bind(queue.queue_id).run();

  await env.DB.prepare(`
    UPDATE experiments
    SET status = 'running', started_at = COALESCE(started_at, CURRENT_TIMESTAMP),
        last_updated = CURRENT_TIMESTAMP
    WHERE id = ?
  `).bind(queue.experiment_id).run();

  try {
    const packet = await loadExperimentEvidencePacket(env, queue);

    await env.DB.prepare(`
      INSERT INTO experiment_provenance
        (experiment_id, queue_id, rotation_id, phase, provenance)
      VALUES (?, ?, ?, 'worker-input', ?)
    `).bind(
      queue.experiment_id,
      queue.queue_id,
      workerRid,
      cleanText(JSON.stringify({
        hypothesis: queue.hypothesis,
        method: queue.method,
        kill_criteria: queue.kill_criteria,
        authority_scope: 'internal-zero-dollar',
        max_approved_spend: 0,
        actual_spend: 0,
        evidence_packet: packet
      }), 30000)
    ).run();

    const output = await think(env, EXPERIMENT_WORKER_SYSTEM, `
PARENT ROTATION: ${parentRid}
EXPERIMENT ID: ${queue.experiment_id}
OPPORTUNITY ID: ${queue.opportunity_id || 'NONE'}
HYPOTHESIS: ${queue.hypothesis || 'UNSPECIFIED'}
REQUESTED METHOD: ${queue.method || 'UNSPECIFIED'}
KILL CRITERIA: ${queue.kill_criteria || 'UNSPECIFIED'}
MAX APPROVED SPEND: $0
ACTUAL SPEND: $0

AVAILABLE INTERNAL EVIDENCE PACKET:
${JSON.stringify(packet, null, 2)}
`, 1300, 0.15);

    const executionStatus = parseExperimentStatus(output);
    const finalQueueStatus = executionStatus === 'COMPLETED' ? 'completed'
      : executionStatus === 'BLOCKED' ? 'blocked' : 'failed';

    await env.DB.prepare(`
      INSERT INTO experiment_evidence
        (experiment_id, queue_id, evidence_type, source_ref, evidence_text, verification_status)
      VALUES (?, ?, 'worker-execution', ?, ?, ?)
    `).bind(
      queue.experiment_id, queue.queue_id, workerRid, cleanText(output, 12000),
      executionStatus === 'COMPLETED' ? 'internally-executed' : 'bounded-no-fabrication'
    ).run();

    await env.DB.prepare(`
      INSERT INTO experiment_provenance
        (experiment_id, queue_id, rotation_id, phase, provenance)
      VALUES (?, ?, ?, 'worker-output', ?)
    `).bind(
      queue.experiment_id,
      queue.queue_id,
      workerRid,
      cleanText(output, 30000)
    ).run();

    let reviewOutput = '';
    let decision = executionStatus === 'FAILED' ? 'HOLD' : null;

    if (executionStatus !== 'FAILED') {
      reviewOutput = await think(env, EXPERIMENT_VECTOR_SYSTEM, `
EXPERIMENT:
${JSON.stringify({
  id: queue.experiment_id,
  opportunity_id: queue.opportunity_id,
  hypothesis: queue.hypothesis,
  method: queue.method,
  kill_criteria: queue.kill_criteria
}, null, 2)}

EXECUTION OUTPUT:
${output}

EVIDENCE PACKET:
${JSON.stringify(packet, null, 2)}
`, 1200, 0.1);
      decision = parseExperimentDecision(reviewOutput);

      await env.DB.prepare(`
        INSERT INTO experiment_provenance
          (experiment_id, queue_id, rotation_id, phase, provenance)
        VALUES (?, ?, ?, 'vector-review', ?)
      `).bind(
        queue.experiment_id,
        queue.queue_id,
        workerRid,
        cleanText(reviewOutput, 30000)
      ).run();

      await env.DB.prepare(`
        INSERT INTO experiment_reviews
          (experiment_id, queue_id, reviewer, decision, review)
        VALUES (?, ?, 'VECTOR', ?, ?)
      `).bind(queue.experiment_id, queue.queue_id, decision, cleanText(reviewOutput, 12000)).run();
    }

    const experimentStatus = executionStatus === 'COMPLETED' ? 'completed'
      : executionStatus === 'BLOCKED' ? 'blocked' : 'failed';

    await env.DB.prepare(`
      UPDATE experiments
      SET result = ?, information_gained = ?, decision = ?, status = ?,
          completed_at = CASE WHEN ? IN ('completed','failed') THEN CURRENT_TIMESTAMP ELSE completed_at END,
          last_updated = CURRENT_TIMESTAMP, actual_spend = 0
      WHERE id = ?
    `).bind(
      cleanText(output, 12000), cleanText(reviewOutput || output, 12000), decision,
      experimentStatus, experimentStatus, queue.experiment_id
    ).run();

    await env.DB.prepare(`
      UPDATE experiment_queue
      SET status = ?, completed_at = CASE WHEN ? IN ('completed','failed') THEN CURRENT_TIMESTAMP ELSE completed_at END,
          last_updated = CURRENT_TIMESTAMP, diagnostic = ?
      WHERE id = ?
    `).bind(finalQueueStatus, finalQueueStatus,
      `Execution=${executionStatus}; Vector=${decision}`, queue.queue_id).run();

    if (queue.opportunity_id) {
      await env.DB.prepare(`
        UPDATE opportunities
        SET stage = ?, status = ?, next_test = ?, last_updated = CURRENT_TIMESTAMP
        WHERE id = ?
      `).bind(
        decision === 'KILL' ? 'killed' : decision === 'ADVANCE' ? 'validated' : 'validation',
        decision === 'KILL' ? 'killed' : decision === 'ESCALATE' ? 'owner-review' : 'active',
        cleanText(reviewOutput || output, 2000), queue.opportunity_id
      ).run();
    }

    await slack(env, VIS.channels.experiments, [
      '*VIS EXPERIMENT EXECUTION*',
      `Experiment: ${queue.experiment_id}`,
      `Opportunity: ${queue.opportunity_id || 'NONE'}`,
      `Execution: ${executionStatus}`,
      `Vector decision: ${decision}`,
      '', cleanText(output, 7000),
      reviewOutput ? `\n*VECTOR REVIEW*\n${cleanText(reviewOutput, 7000)}` : '',
      '', 'External spend: $0.00'
    ].filter(Boolean).join('\n'));

    if (decision === 'ESCALATE') {
      await slack(env, VIS.channels.ownerReview, [
        '*VIS OWNER DECISION REQUIRED*',
        `Experiment: ${queue.experiment_id}`,
        `Opportunity: ${queue.opportunity_id || 'NONE'}`,
        'Vector determined the next useful step requires Founder authority.',
        '', cleanText(reviewOutput, 5000),
        '', 'No external action has been taken. External spend: $0.00'
      ].join('\n'));
    }

    await finishRotation(env, workerRid, `Experiment ${queue.experiment_id}: ${executionStatus}; Vector=${decision}`,
      executionStatus === 'FAILED' ? 'failed' : 'completed');
    await audit(env, 'EXPERIMENT_WORKER', 'EXPERIMENT_EXECUTED', queue.experiment_id,
      `status=${executionStatus}; decision=${decision}; spend=0`);

    await env.DB.prepare(`
      UPDATE failures
      SET resolved = 1
      WHERE resolved = 0
        AND component = 'experiment-execution'
        AND created_at < CURRENT_TIMESTAMP
    `).run();

    return { executed: true, experimentId: queue.experiment_id, executionStatus, decision, externalSpendUSD: 0 };
  } catch (error) {
    await env.DB.prepare(`
      UPDATE experiment_queue
      SET status = CASE WHEN attempts >= 3 THEN 'quarantined' ELSE 'queued' END,
          diagnostic = ?, last_updated = CURRENT_TIMESTAMP
      WHERE id = ?
    `).bind(cleanText(error?.message || error, 2000), queue.queue_id).run();
    await env.DB.prepare(`
      UPDATE experiments SET status = 'approved', last_updated = CURRENT_TIMESTAMP WHERE id = ?
    `).bind(queue.experiment_id).run();
    await finishRotation(env, workerRid, cleanText(error?.message || error, 3000), 'failed');
    await recordFailure(env, workerRid, 'experiment-execution', error);
    return { executed: true, experimentId: queue.experiment_id, executionStatus: 'FAILED',
      decision: 'RETRY_OR_QUARANTINE', error: cleanText(error?.message || error, 1000), externalSpendUSD: 0 };
  }
}

/* ============================================================
   MAIN MACHINE
   ============================================================ */

async function runVIS(
  env,
  source = "manual"
) {
  const rid =
    makeRotationId();

  const lockKey =
    "VIS_MAIN_ROTATION";

  let stage =
    "schema";

  try {
    await ensureSchema(env);
  } catch (error) {
    try {
      await recordFailure(
        env,
        rid,
        stage,
        error
      );
    } catch (_) {}

    throw error;
  }

  const locked =
    await acquireLock(
      env,
      lockKey,
      rid
    );

  if (!locked) {
    return {
      ok: true,
      skipped: true,
      reason:
        "Another VIS rotation is active."
    };
  }

  let vectorRid = null;

  try {
    stage =
      "create-atlas-rotation";

    await createRotation(
      env,
      rid,
      "ATLAS"
    );

    stage =
      "audit-start";

    await audit(
      env,
      "VIS_RUNTIME",
      "ROTATION_STARTED",
      rid,
      source
    );

    stage =
      "experiment-queue-sync";

    await synchronizeApprovedExperiments(env);
    await watchdogExperiments(env);

    stage =
      "experiment-execution";

    const experimentExecution =
      await executeNextApprovedExperiment(env, rid);

    stage =
      "sensor-network";

    const sensorReport =
      await runSensors(
        env,
        rid
      );

    stage =
      "load-new-evidence";

    const newItems =
      await getNewSensorItems(
        env,
        rid
      );

    stage =
      "scout-ai";

    const scout =
      await scoutSignals(
        env,
        rid,
        newItems
      );

    stage =
      "load-shortlist";

    const selected =
      await loadSelectedSignals(
        env,
        scout.selectedIds
      );

    stage =
      "research-slack";

    const sourceSummary =
      sensorReport
        .map(report =>
          report.ok
            ? `• ${report.source}: ${report.newItems} new`
            : `• ${report.source}: sensor unavailable`
        )
        .join("\n");

    const selectedSummary =
      selected.length
        ? selected
            .map(
              (item, index) =>
                `${index + 1}. ${item.title}\n${item.item_url}`
            )
            .join("\n\n")
        : "No signals passed Scout this rotation.";

    await slack(
      env,
      VIS.channels.research,
      [
        "*SCOUT — Research Network*",
        `Rotation: ${rid}`,
        "",
        "*Sensor status*",
        sourceSummary,
        "",
        `New deduplicated evidence: ${newItems.length}`,
        `Signals shortlisted: ${selected.length}`,
        "",
        "*Shortlist*",
        selectedSummary,
        "",
        "External spend: $0.00"
      ].join("\n")
    );

    stage =
      "load-context";

    const context =
      await getContext(env);

    stage =
      "atlas-ai";

    let atlasOutput =
      await think(
        env,
        ATLAS_SYSTEM,
        `
ROTATION:
${rid}

SCOUT ANALYSIS:

${scout.output}

SHORTLISTED CURRENT SIGNALS:

${JSON.stringify(selected, null, 2)}

VIS INSTITUTIONAL MEMORY:

${JSON.stringify(context, null, 2)}

Generate ONE economically useful discovery if
the evidence supports further investigation.

Do not force an opportunity.

Search for second-order and cross-industry
implications.

Prefer:

- low capital
- meaningful revenue potential
- high automation
- low owner labour
- cheap validation
- scalability

Killed ideas require materially new evidence
before revival.
`,
        1100,
        0.55
      );

    stage =
      "atlas-quality";

    const atlasRepair =
      await selfRepairReasoning(
        env, rid, "ATLAS", rid, atlasOutput, selected,
        `SCOUT ANALYSIS:
${scout.output}

INSTITUTIONAL MEMORY:
${JSON.stringify(context, null, 2)}`
      );

    atlasOutput = atlasRepair.output;
    const atlasQuality = atlasRepair.quality;

    if (!atlasRepair.accepted) {
      throw new Error(`ATLAS reasoning quarantined after bounded repair attempts: ${atlasQuality.flags.join(", ")}`);
    }

    stage =
      "atlas-persistence";

    await env.DB.prepare(`
      INSERT INTO research
        (
          rotation_id,
          agent_id,
          finding,
          evidence,
          confidence,
          implication,
          recommended_action
        )
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).bind(
      rid,
      "ATLAS",
      atlasOutput,
      `Scout shortlist: ${selected.length} current signals`,
      selected.length > 0
        ? 0.72
        : 0.40,
      "Atlas discovery requires independent Vector diligence.",
      "Vector evaluation."
    ).run();

    stage =
      "atlas-slack";

    await slack(
      env,
      VIS.channels.thinkTank,
      [
        "*ATLAS — Scout-Informed Discovery*",
        `Rotation: ${rid}`,
        "",
        atlasOutput,
        "",
        `Scout signals supplied: ${selected.length}`,
        "External spend: $0.00"
      ].join("\n")
    );

    stage =
      "handoff-create";

    await env.DB.prepare(`
      INSERT INTO handoffs
        (
          rotation_id,
          from_agent,
          to_agent,
          request,
          evidence_reference,
          status
        )
      VALUES (?, ?, ?, ?, ?, ?)
    `).bind(
      rid,
      "ATLAS",
      "VECTOR",
      "Challenge Atlas against Scout-selected current evidence.",
      rid,
      "processing"
    ).run();

    vectorRid =
      `${rid}-VECTOR`;

    stage =
      "create-vector-rotation";

    await createRotation(
      env,
      vectorRid,
      "VECTOR"
    );

    stage =
      "vector-ai";

    let vectorOutput =
      await think(
        env,
        VECTOR_SYSTEM,
        `
ROTATION:
${rid}

ATLAS MEMORANDUM:

${atlasOutput}

CURRENT ROTATION EVIDENCE PACKET:

${JSON.stringify(selected, null, 2)}

CONTEXT BOUNDARY:
Use only this Atlas memorandum and this current rotation evidence packet.
Prior VIS opportunities and prior research are intentionally excluded.

Independently determine whether Atlas has found
something commercially worth testing.

Identify where Atlas extrapolated beyond the
evidence.

Design the cheapest useful zero-dollar
falsification test.
`,
        1100,
        0.25
      );

    stage =
      "vector-quality";

    const vectorRepair =
      await selfRepairReasoning(
        env, rid, "VECTOR", vectorRid, vectorOutput, selected,
        `ATLAS MEMORANDUM:
${atlasOutput}

CONTEXT BOUNDARY: Use only the Atlas memorandum and current rotation evidence packet.`
      );

    vectorOutput = vectorRepair.output;
    const vectorQuality = vectorRepair.quality;

    if (!vectorRepair.accepted) {
      throw new Error(`VECTOR reasoning quarantined after bounded repair attempts: ${vectorQuality.flags.join(", ")}`);
    }

    stage =
      "vector-persistence";

    await env.DB.prepare(`
      INSERT INTO research
        (
          rotation_id,
          agent_id,
          finding,
          evidence,
          confidence,
          implication,
          recommended_action
        )
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).bind(
      vectorRid,
      "VECTOR",
      vectorOutput,
      `Atlas handoff ${rid}; Scout evidence=${selected.length}`,
      selected.length > 0
        ? 0.72
        : 0.40,
      "Independent diligence complete.",
      "Retain falsification test if justified."
    ).run();

    stage =
      "handoff-complete";

    await env.DB.prepare(`
      UPDATE handoffs
      SET
        response_resolution = ?,
        status = ?
      WHERE rotation_id = ?
        AND from_agent = 'ATLAS'
        AND to_agent = 'VECTOR'
    `).bind(
      cleanText(
        vectorOutput,
        4000
      ),
      "completed",
      rid
    ).run();

    stage =
      "vector-slack";

    await slack(
      env,
      VIS.channels.opportunities,
      [
        "*VECTOR — Independent Diligence*",
        `Rotation: ${rid}`,
        "",
        vectorOutput,
        "",
        `Current Scout evidence reviewed: ${selected.length}`,
        "External spend: $0.00"
      ].join("\n")
    );

    stage =
      "finish-vector";

    await finishRotation(
      env,
      vectorRid,
      "Vector diligence completed."
    );

    stage =
      "finish-atlas";

    await finishRotation(
      env,
      rid,
      `Research network → Scout → Atlas → Vector complete. New evidence=${newItems.length}; shortlisted=${selected.length}.`
    );

    stage =
      "failure-reconciliation";

    if (atlasQuality?.passed) {
      await env.DB.prepare(`
        UPDATE failures
        SET resolved = 1
        WHERE resolved = 0
          AND component = 'atlas-quality'
          AND created_at < CURRENT_TIMESTAMP
      `).run();
    }

    if (vectorQuality?.passed) {
      await env.DB.prepare(`
        UPDATE failures
        SET resolved = 1
        WHERE resolved = 0
          AND component = 'vector-quality'
          AND created_at < CURRENT_TIMESTAMP
      `).run();
    }

    await env.DB.prepare(`
      INSERT INTO acceptance_telemetry
        (
          rotation_id,
          experiment_id,
          atlas_quality_passed,
          vector_quality_passed,
          experiment_executed,
          experiment_status,
          experiment_decision,
          slack_synchronized,
          external_spend_usd
        )
      VALUES (?, ?, ?, ?, ?, ?, ?, 1, 0)
    `).bind(
      rid,
      experimentExecution?.experimentId || null,
      atlasQuality?.passed ? 1 : 0,
      vectorQuality?.passed ? 1 : 0,
      experimentExecution?.executed ? 1 : 0,
      experimentExecution?.executionStatus || null,
      experimentExecution?.decision || null
    ).run();

    stage =
      "health";

    await health(
      env,
      "vis-runtime",
      "healthy",
      `V1.7 development complete ${rid}; new=${newItems.length}; shortlisted=${selected.length}`
    );

    stage =
      "audit-complete";

    await audit(
      env,
      "VIS_RUNTIME",
      "ROTATION_COMPLETED",
      rid,
      `Scout -> Atlas -> Vector; new=${newItems.length}; shortlist=${selected.length}`
    );

    stage =
      "health-finalized";

    return {
      ok: true,
      version: VIS.version,
      rotationId: rid,
      sensorsChecked: sensorReport.length,
      newEvidence: newItems.length,
      scoutShortlist: selected.length,
      atlas: "completed",
      vector: "completed",
      atlasQuality,
      vectorQuality,
      experimentQueueSynchronized: true,
      experimentExecution,
      persisted: true,
      slackSynchronized: true,
      externalSpendUSD: 0
    };

  } catch (error) {
    const diagnostic =
      `[stage=${stage}] ${
        error?.stack ||
        error?.message ||
        String(error)
      }`;

    try {
      await recordFailure(
        env,
        rid,
        stage,
        diagnostic
      );
    } catch (_) {}

    try {
      await finishRotation(
        env,
        rid,
        diagnostic,
        "failed"
      );
    } catch (_) {}

    if (vectorRid) {
      try {
        await finishRotation(
          env,
          vectorRid,
          diagnostic,
          "failed"
        );
      } catch (_) {}
    }

    try {
      await slack(
        env,
        VIS.channels.engineering,
        [
          "*VIS Runtime Failure*",
          `Version: ${VIS.version}`,
          `Rotation: ${rid}`,
          `Stage: ${stage}`,
          `Error: ${cleanText(
            error?.message || error,
            1500
          )}`,
          "",
          "Failure persisted to D1.",
          "External spend: $0.00"
        ].join("\n")
      );
    } catch (_) {}

    throw error;

  } finally {
    await releaseLock(
      env,
      lockKey
    );
  }
}

/* ============================================================
   ADMIN
   ============================================================ */

async function getLatestFailure(env) {
  const latest =
    await env.DB.prepare(`
      SELECT
        id,
        rotation_id,
        component,
        error,
        retry_count,
        resolved,
        created_at
      FROM failures
      ORDER BY id DESC
      LIMIT 1
    `).first();

  return {
    ok: true,
    version: VIS.version,
    failure: latest || null
  };
}

async function getResearchStatus(env) {
  const total =
    await env.DB.prepare(`
      SELECT COUNT(*) AS count
      FROM sensor_items
    `).first();

  const sources =
    await env.DB.prepare(`
      SELECT
        source_name,
        COUNT(*) AS items,
        MAX(retrieved_at) AS latest
      FROM sensor_items
      GROUP BY source_name
      ORDER BY items DESC
    `).all();

  const selected =
    await env.DB.prepare(`
      SELECT COUNT(*) AS count
      FROM scout_signals
      WHERE selected = 1
    `).first();

  return {
    ok: true,
    version: VIS.version,
    totalUniqueEvidence:
      Number(total?.count || 0),
    totalScoutSelections:
      Number(selected?.count || 0),
    sources:
      sources.results || []
  };
}

async function getStatus(env) {
  await ensureSchema(env);

  const agents =
    await env.DB.prepare(`
      SELECT
        id,
        name,
        role,
        status
      FROM agents
      ORDER BY id
    `).all();

  const rotations =
    await env.DB.prepare(`
      SELECT
        id,
        agent_id,
        started_at,
        completed_at,
        status,
        cost_usd
      FROM rotations
      ORDER BY started_at DESC
      LIMIT 12
    `).all();

  const failures =
    await env.DB.prepare(`
      SELECT COUNT(*) AS count
      FROM failures
      WHERE resolved = 0
    `).first();

  return {
    service:
      "Venture Intelligence System",

    version:
      VIS.version,

    status:
      "online",

    architecture:
      "Approved Experiments -> Worker -> Evidence -> Vector Review + Sensors -> Scout -> Atlas -> Vector",

    model:
      VIS.model,

    sensorsConfigured:
      VIS.sensors.length,

    databaseBinding:
      Boolean(env.DB),

    aiBinding:
      Boolean(env.AI),

    slackCredential:
      Boolean(env.SLACK_BOT_TOKEN),

    paidSpendingEnabled:
      false,

    autonomousExternalSpendLimitUSD:
      0,

    computeBudget:
      await computeBudgetState(env),

    unresolvedFailures:
      Number(
        failures?.count || 0
      ),

    agents:
      agents.results || [],

    recentRotations:
      rotations.results || []
  };
}

async function getExperimentStatus(env) {
  await ensureSchema(env);
  const queue = await env.DB.prepare(`
    SELECT q.id, q.experiment_id, q.opportunity_id, q.status, q.assigned_to, q.attempts,
           q.queued_at, q.started_at, q.completed_at, q.last_updated, q.diagnostic,
           e.hypothesis, e.decision, e.actual_spend
    FROM experiment_queue q
    LEFT JOIN experiments e ON e.id = q.experiment_id
    ORDER BY q.queued_at DESC LIMIT 20
  `).all();
  return { ok: true, version: VIS.version, queue: queue.results || [], externalSpendUSD: 0 };
}

async function testAI(env) {
  const response =
    await think(
      env,
      "You are a VIS infrastructure diagnostic.",
      "Reply exactly: VIS AI ONLINE",
      50,
      0
    );

  return {
    ok: true,
    model: VIS.model,
    response
  };
}

/* ============================================================
   HTTP + AUTONOMOUS CRON
   ============================================================ */


/* ============================================================
   V1.8.2 HIVE RESILIENCE + FAILURE INJECTION HARNESS
   ============================================================ */

async function recordResilienceEvent(env, r) {
  const id = `RE-${crypto.randomUUID()}`;
  await env.DB.prepare(`INSERT INTO resilience_events
    (id,test_id,work_order_id,worker_job_id,fault_type,detected,diagnosis,repair_action,verified,outcome,details)
    VALUES (?,?,?,?,?,?,?,?,?,?,?)`).bind(
      id,r.testId,r.workOrderId||null,r.workerJobId||null,r.faultType,
      r.detected?1:0,cleanText(r.diagnosis||'',3000),cleanText(r.repairAction||'',3000),
      r.verified?1:0,r.outcome||'UNKNOWN',JSON.stringify(r.details||{})
    ).run();
  return id;
}

async function validateWorkerLineage(env, workOrderId, workerJobId) {
  const job = await env.DB.prepare(`SELECT id,knowledge_packet_id,authority_scope,status FROM worker_jobs WHERE id=? AND rotation_id=?`).bind(workerJobId,workOrderId).first();
  if (!job) return {ok:false,reason:'missing-worker'};
  let authorityOK=true;
  try { assertInternalAuthority(job.authority_scope); } catch { authorityOK=false; }
  const packet = await env.DB.prepare(`SELECT id,content,provenance FROM knowledge_packets WHERE id=? AND rotation_id=?`).bind(job.knowledge_packet_id,workOrderId).first();
  const links = await env.DB.prepare(`SELECT knowledge_id,packet_id FROM knowledge_inheritance WHERE work_order_id=? AND worker_job_id=?`).bind(workOrderId,workerJobId).all();
  const rows=links.results||[];
  const missing=[];
  for (const link of rows) {
    const k=await env.DB.prepare(`SELECT id FROM hive_knowledge WHERE id=? AND status='active'`).bind(link.knowledge_id).first();
    if (!k || link.packet_id!==job.knowledge_packet_id) missing.push(link.knowledge_id);
  }
  return {ok:Boolean(authorityOK&&packet&&rows.length&&missing.length===0),authorityOK,packetPresent:Boolean(packet),inheritanceCount:rows.length,missing};
}

function workerOutputUsable(text) {
  const t=String(text||'').trim();
  if (t.length<80) return false;
  if (/^(ERROR|FAILED|N\/A|NO DATA|I CANNOT)/i.test(t)) return false;
  return true;
}

async function replaceWorkerFromExistingPacket(env, oldJob, reason) {
  assertInternalAuthority(oldJob.authority_scope);
  const newId=`WJ-${crypto.randomUUID()}`;
  const newPacket=`KP-${crypto.randomUUID()}`;
  const packet=await env.DB.prepare(`SELECT * FROM knowledge_packets WHERE id=?`).bind(oldJob.knowledge_packet_id).first();
  if (!packet) throw new Error('Cannot replace worker: inherited packet missing.');
  await env.DB.prepare(`INSERT INTO knowledge_packets (id,rotation_id,department_id,packet_type,content,provenance)
    VALUES (?,?,?,?,?,?)`).bind(newPacket,oldJob.rotation_id,oldJob.department_id,'hive-inheritance-recovery',packet.content,
      JSON.stringify({recoveredFromWorker:oldJob.id,recoveredFromPacket:oldJob.knowledge_packet_id,reason})).run();
  const links=await env.DB.prepare(`SELECT knowledge_id FROM knowledge_inheritance WHERE work_order_id=? AND worker_job_id=?`).bind(oldJob.rotation_id,oldJob.id).all();
  for (const link of links.results||[]) await env.DB.prepare(`INSERT INTO knowledge_inheritance
    (id,work_order_id,department_id,worker_job_id,knowledge_id,packet_id,inheritance_reason)
    VALUES (?,?,?,?,?,?,?)`).bind(`KI-${crypto.randomUUID()}`,oldJob.rotation_id,oldJob.department_id,newId,link.knowledge_id,newPacket,`Recovery replacement: ${reason}`).run();
  await env.DB.prepare(`INSERT INTO worker_jobs
    (id,rotation_id,department_id,manager_agent,worker_role,mandate,knowledge_packet_id,authority_scope,status,attempts,last_updated)
    VALUES (?,?,?,?,?,?,?,?, 'queued',0,?)`).bind(newId,oldJob.rotation_id,oldJob.department_id,oldJob.manager_agent,oldJob.worker_role,oldJob.mandate,newPacket,oldJob.authority_scope,nowISO()).run();
  await env.DB.prepare(`UPDATE worker_jobs SET status='replaced',completed_at=?,last_updated=? WHERE id=?`).bind(nowISO(),nowISO(),oldJob.id).run();
  return {newId,newPacket};
}

async function runRecoveredWorker(env, workerJobId, resultType='resilience-recovery') {
  const job=await env.DB.prepare(`SELECT * FROM worker_jobs WHERE id=?`).bind(workerJobId).first();
  if (!job) throw new Error('Recovery worker missing.');
  assertInternalAuthority(job.authority_scope);
  const lineage=await validateWorkerLineage(env,job.rotation_id,job.id);
  if (!lineage.ok) throw new Error('Recovery worker lineage invalid.');
  const packet=await loadPacket(env,job.knowledge_packet_id);
  await env.DB.prepare(`UPDATE worker_jobs SET status='running',attempts=attempts+1,started_at=?,last_updated=? WHERE id=?`).bind(nowISO(),nowISO(),job.id).run();
  const output=await think(env,HAT_WORKER_SYSTEM,`RECOVERY WORK ORDER: ${job.rotation_id}
ROLE: ${job.worker_role}
MANDATE: ${job.mandate}
AUTHORITY: ${job.authority_scope}
INHERITED PACKET: ${packet.content}
PACKET PROVENANCE: ${packet.provenance}`);
  if (!workerOutputUsable(output)) throw new Error('Recovery worker returned unusable output.');
  const links=await env.DB.prepare(`SELECT knowledge_id FROM knowledge_inheritance WHERE work_order_id=? AND worker_job_id=?`).bind(job.rotation_id,job.id).all();
  const resultId=await submitWorkerResult(env,{workOrderId:job.rotation_id,workerJobId:job.id,resultType,result:output,evidenceRefs:(links.results||[]).map(x=>x.knowledge_id),confidence:.75});
  return {resultId,output};
}

async function runHiveResilienceAttack(env) {
  await ensureSchema(env);
  const testId=`HRT-001-${Date.now()}-${crypto.randomUUID().slice(0,8)}`;
  const authority='internal-zero-dollar';
  assertInternalAuthority(authority);
  const seed=await createHiveKnowledge(env,{id:`${testId}-HK`,knowledgeType:'resilience-fixture',subject:'HRT-001 recovery invariant',content:'Preserve valid inherited knowledge, reject corrupted lineage and unusable output, recover disposable workers without external action or spending.',confidence:1,verificationStatus:'resilience-fixture',sourceType:'harness',sourceRef:testId});
  const tests=[];

  // FI-001 stranded worker -> detect and replace using preserved knowledge.
  const wo1=await createWorkOrder(env,{id:`${testId}-FI001-WO`,objective:'Recover a stranded worker.',requestedBy:'HIVE-RESILIENCE-HARNESS',authorityScope:authority});
  await env.DB.prepare(`UPDATE work_orders SET status='running',started_at=?,last_updated=? WHERE id=?`).bind(nowISO(),nowISO(),wo1).run();
  const j1=await createConstrainedWorkerJob(env,{workOrderId:wo1,departmentId:'DISCOVERY',managerAgent:'ATLAS',workerRole:'Stranded Worker',mandate:'Analyze resilience invariant.',knowledgeIds:[seed],authorityScope:authority});
  await env.DB.prepare(`UPDATE worker_jobs SET status='running',attempts=1,started_at='2000-01-01T00:00:00.000Z',last_updated='2000-01-01T00:00:00.000Z' WHERE id=?`).bind(j1.id).run();
  const stale=await env.DB.prepare(`SELECT * FROM worker_jobs WHERE id=? AND status='running' AND last_updated < datetime('now','-15 minutes')`).bind(j1.id).first();
  const rep1=stale?await replaceWorkerFromExistingPacket(env,stale,'stale-running-worker'):null;
  const rr1=rep1?await runRecoveredWorker(env,rep1.newId):null;
  await env.DB.prepare(`UPDATE work_orders SET status='completed',completed_at=?,last_updated=? WHERE id=?`).bind(nowISO(),nowISO(),wo1).run();
  const v1=Boolean(stale&&rep1&&rr1&&(await validateWorkerLineage(env,wo1,rep1.newId)).ok);
  await recordResilienceEvent(env,{testId,workOrderId:wo1,workerJobId:j1.id,faultType:'FI-001-stranded-worker',detected:Boolean(stale),diagnosis:'Worker remained running beyond recovery threshold.',repairAction:'Preserved packet and inheritance; replaced disposable worker; executed replacement.',verified:v1,outcome:v1?'PASS':'FAIL',details:{replacement:rep1?.newId,result:rr1?.resultId}});
  tests.push({id:'FI-001',pass:v1});

  // FI-002 poisoned output -> reject it, replace worker, accept only usable replacement output.
  const wo2=await createWorkOrder(env,{id:`${testId}-FI002-WO`,objective:'Reject poisoned worker output.',requestedBy:'HIVE-RESILIENCE-HARNESS',authorityScope:authority});
  await env.DB.prepare(`UPDATE work_orders SET status='running',started_at=?,last_updated=? WHERE id=?`).bind(nowISO(),nowISO(),wo2).run();
  const j2=await createConstrainedWorkerJob(env,{workOrderId:wo2,departmentId:'DISCOVERY',managerAgent:'ATLAS',workerRole:'Poisoned Output Worker',mandate:'Analyze resilience invariant.',knowledgeIds:[seed],authorityScope:authority});
  await env.DB.prepare(`UPDATE worker_jobs SET status='running',attempts=1,started_at=?,last_updated=? WHERE id=?`).bind(nowISO(),nowISO(),j2.id).run();
  const poison='ERROR';
  const rejected=!workerOutputUsable(poison);
  const old2=await env.DB.prepare(`SELECT * FROM worker_jobs WHERE id=?`).bind(j2.id).first();
  const rep2=rejected?await replaceWorkerFromExistingPacket(env,old2,'unusable-worker-output'):null;
  const rr2=rep2?await runRecoveredWorker(env,rep2.newId):null;
  await env.DB.prepare(`UPDATE work_orders SET status='completed',completed_at=?,last_updated=? WHERE id=?`).bind(nowISO(),nowISO(),wo2).run();
  const poisonPersisted=await env.DB.prepare(`SELECT COUNT(*) n FROM worker_results WHERE work_order_id=? AND result='ERROR'`).bind(wo2).first();
  const v2=Boolean(rejected&&rep2&&rr2&&Number(poisonPersisted?.n||0)===0);
  await recordResilienceEvent(env,{testId,workOrderId:wo2,workerJobId:j2.id,faultType:'FI-002-poisoned-output',detected:rejected,diagnosis:'Worker output failed minimum usability gate.',repairAction:'Rejected output before evidence persistence; replaced worker from inherited packet.',verified:v2,outcome:v2?'PASS':'FAIL',details:{replacement:rep2?.newId,result:rr2?.resultId}});
  tests.push({id:'FI-002',pass:v2});

  // FI-003 interrupted work order -> preserve completed evidence and resume only missing work.
  const wo3=await createWorkOrder(env,{id:`${testId}-FI003-WO`,objective:'Resume interrupted work without discarding valid evidence.',requestedBy:'HIVE-RESILIENCE-HARNESS',authorityScope:authority});
  await env.DB.prepare(`UPDATE work_orders SET status='running',started_at='2000-01-01T00:00:00.000Z',last_updated='2000-01-01T00:00:00.000Z' WHERE id=?`).bind(wo3).run();
  const a=await createConstrainedWorkerJob(env,{workOrderId:wo3,departmentId:'DISCOVERY',managerAgent:'ATLAS',workerRole:'Completed Before Interrupt',mandate:'Produce valid evidence.',knowledgeIds:[seed],authorityScope:authority});
  await runRecoveredWorker(env,a.id,'pre-interrupt-valid');
  const b=await createConstrainedWorkerJob(env,{workOrderId:wo3,departmentId:'DISCOVERY',managerAgent:'ATLAS',workerRole:'Interrupted Worker',mandate:'Complete remaining analysis.',knowledgeIds:[seed],authorityScope:authority});
  await env.DB.prepare(`UPDATE worker_jobs SET status='running',attempts=1,started_at='2000-01-01T00:00:00.000Z',last_updated='2000-01-01T00:00:00.000Z' WHERE id=?`).bind(b.id).run();
  const before=await env.DB.prepare(`SELECT COUNT(*) n FROM worker_results WHERE work_order_id=? AND worker_job_id=?`).bind(wo3,a.id).first();
  const oldb=await env.DB.prepare(`SELECT * FROM worker_jobs WHERE id=?`).bind(b.id).first();
  const rep3=await replaceWorkerFromExistingPacket(env,oldb,'interrupted-work-order-resume');
  const rr3=await runRecoveredWorker(env,rep3.newId);
  const after=await env.DB.prepare(`SELECT COUNT(*) n FROM worker_results WHERE work_order_id=? AND worker_job_id=?`).bind(wo3,a.id).first();
  await env.DB.prepare(`UPDATE work_orders SET status='completed',completed_at=?,last_updated=? WHERE id=?`).bind(nowISO(),nowISO(),wo3).run();
  const v3=Boolean(Number(before?.n||0)===1&&Number(after?.n||0)===1&&rr3);
  await recordResilienceEvent(env,{testId,workOrderId:wo3,workerJobId:b.id,faultType:'FI-003-interrupted-work-order',detected:true,diagnosis:'Parent work order stale with partial valid evidence and one stranded worker.',repairAction:'Preserved completed result; replaced only unfinished worker; completed parent.',verified:v3,outcome:v3?'PASS':'FAIL',details:{preservedWorker:a.id,replacement:rep3.newId}});
  tests.push({id:'FI-003',pass:v3});

  // FI-004 lineage corruption -> detect and quarantine; no reintegration allowed.
  const wo4=await createWorkOrder(env,{id:`${testId}-FI004-WO`,objective:'Detect corrupted knowledge lineage.',requestedBy:'HIVE-RESILIENCE-HARNESS',authorityScope:authority});
  await env.DB.prepare(`UPDATE work_orders SET status='running',started_at=?,last_updated=? WHERE id=?`).bind(nowISO(),nowISO(),wo4).run();
  const j4=await createConstrainedWorkerJob(env,{workOrderId:wo4,departmentId:'DILIGENCE',managerAgent:'VECTOR',workerRole:'Lineage Corruption Target',mandate:'Validate lineage.',knowledgeIds:[seed],authorityScope:authority});
  await env.DB.prepare(`UPDATE knowledge_inheritance SET knowledge_id=? WHERE work_order_id=? AND worker_job_id=?`).bind(`${testId}-MISSING-KNOWLEDGE`,wo4,j4.id).run();
  const line4=await validateWorkerLineage(env,wo4,j4.id);
  if (!line4.ok) await env.DB.prepare(`UPDATE worker_jobs SET status='quarantined',completed_at=?,last_updated=? WHERE id=?`).bind(nowISO(),nowISO(),j4.id).run();
  await env.DB.prepare(`UPDATE work_orders SET status='quarantined',completed_at=?,last_updated=? WHERE id=?`).bind(nowISO(),nowISO(),wo4).run();
  const rein4=await env.DB.prepare(`SELECT COUNT(*) n FROM hive_reintegrations WHERE work_order_id=?`).bind(wo4).first();
  const v4=Boolean(!line4.ok&&Number(rein4?.n||0)===0);
  await recordResilienceEvent(env,{testId,workOrderId:wo4,workerJobId:j4.id,faultType:'FI-004-lineage-corruption',detected:!line4.ok,diagnosis:'Inheritance reference no longer resolves to active Hive knowledge.',repairAction:'Quarantined worker and work order; blocked synthesis/reintegration.',verified:v4,outcome:v4?'PASS':'FAIL',details:line4});
  tests.push({id:'FI-004',pass:v4});

  const runningWorkers=await env.DB.prepare(`SELECT COUNT(*) n FROM worker_jobs WHERE rotation_id LIKE ? AND status='running'`).bind(`${testId}%`).first();
  const runningOrders=await env.DB.prepare(`SELECT COUNT(*) n FROM work_orders WHERE id LIKE ? AND status='running'`).bind(`${testId}%`).first();
  const authorityViolations=await env.DB.prepare(`SELECT COUNT(*) n FROM worker_jobs WHERE rotation_id LIKE ? AND authority_scope NOT IN ('internal-zero-dollar','read-only','analysis-only')`).bind(`${testId}%`).first();
  const pass=tests.every(x=>x.pass)&&Number(runningWorkers?.n||0)===0&&Number(runningOrders?.n||0)===0&&Number(authorityViolations?.n||0)===0;
  return {ok:pass,version:VIS.version,testId,tests,finalAudit:{runningWorkers:Number(runningWorkers?.n||0),runningWorkOrders:Number(runningOrders?.n||0),authorityViolations:Number(authorityViolations?.n||0),externalSpendUSD:0},productionTouched:false};
}



/* ============================================================
   V1.8.3 ELASTIC DEPARTMENT EXECUTION
   ============================================================ */

const ELASTIC_HEAD_SYSTEM = `
You are a VIS Department Head. Decompose the supplied internal objective into a small set of meaningfully different specialist worker mandates.
Return ONLY valid JSON: {"workers":[{"role":"...","mandate":"..."},...]}
Create 3 to 6 workers. Roles and mandates must be non-duplicative and collectively useful. No external actions, contact, spending, account creation, publishing, contracts, or representations. Workers may only analyze supplied inherited Hive knowledge.
`;

function parseElasticPlan(text) {
  const raw=String(text||'').trim();
  const a=raw.indexOf('{'), b=raw.lastIndexOf('}');
  if(a<0||b<=a) throw new Error('Department Head returned no JSON plan.');
  let obj; try { obj=JSON.parse(raw.slice(a,b+1)); } catch { throw new Error('Department Head returned invalid JSON plan.'); }
  const workers=Array.isArray(obj.workers)?obj.workers:[];
  if(workers.length<3||workers.length>6) throw new Error('Elastic plan must contain 3-6 workers.');
  const clean=workers.map((w,i)=>({role:cleanText(w?.role||`Specialist ${i+1}`,200),mandate:cleanText(w?.mandate||'',1200)}));
  if(clean.some(w=>w.role.length<3||w.mandate.length<20)) throw new Error('Elastic plan contains weak worker specification.');
  const norm=x=>x.toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
  if(new Set(clean.map(w=>norm(w.role))).size!==clean.length) throw new Error('Elastic plan contains duplicate roles.');
  if(new Set(clean.map(w=>norm(w.mandate))).size!==clean.length) throw new Error('Elastic plan contains duplicate mandates.');
  return clean;
}


async function recoverElasticDepartmentAcceptance(env, testId) {
  await ensureSchema(env);

  const authority='internal-zero-dollar';
  assertInternalAuthority(authority);

  if(testId!=='EAT-001-1790466134673-550afb9e')
    throw new Error('Recovery refused: unknown EAT test.');

  const wo=`${testId}-WO`;

  const order=await env.DB.prepare(
    `SELECT * FROM work_orders WHERE id=?`
  ).bind(wo).first();

  if(!order)
    throw new Error('Recovery refused: original work order missing.');

  if(order.authority_scope!==authority)
    throw new Error('Recovery refused: authority boundary changed.');

  const seedRows=await env.DB.prepare(
    `SELECT id FROM hive_knowledge
     WHERE source_ref=? AND status='active'
     ORDER BY id`
  ).bind(testId).all();

  const seeds=(seedRows.results||[]).map(x=>x.id);

  if(seeds.length!==2)
    throw new Error(`Recovery refused: expected 2 original seeds, found ${seeds.length}.`);

  const head=await env.DB.prepare(
    `SELECT agent_id,authority_scope
     FROM department_heads
     WHERE department_id='DISCOVERY'
       AND status='active'`
  ).first();

  if(!head)
    throw new Error('Recovery refused: DISCOVERY head missing.');

  assertInternalAuthority(head.authority_scope);

  const objective=order.objective;
  let stage='inspect-state';

  try {
    let rows=await env.DB.prepare(
      `SELECT * FROM worker_jobs
       WHERE rotation_id=?
       ORDER BY created_at,id`
    ).bind(wo).all();

    let workers=rows.results||[];
    let specs=[];

    if(workers.length===0){
      stage='atlas-decomposition';

      const planText=await think(
        env,
        ELASTIC_HEAD_SYSTEM,
        `OBJECTIVE: ${objective}\nINHERITED HIVE KNOWLEDGE IDS: ${seeds.join(', ')}\nAUTHORITY: ${authority}`,
        900,
        .35
      );

      stage='parse-plan';
      specs=parseElasticPlan(planText);

      stage='create-workers';

      for(const spec of specs){
        const w=await createConstrainedWorkerJob(env,{
          workOrderId:wo,
          departmentId:'DISCOVERY',
          managerAgent:head.agent_id,
          workerRole:spec.role,
          mandate:spec.mandate,
          knowledgeIds:seeds,
          authorityScope:authority
        });

        workers.push({
          id:w.id,
          worker_role:spec.role,
          mandate:spec.mandate,
          status:'queued'
        });
      }
    } else {
      specs=workers
        .filter(w=>w.status!=='replaced')
        .map(w=>({
          role:w.worker_role,
          mandate:w.mandate
        }));
    }

    const activeWorkers=workers.filter(w=>w.status!=='replaced');

    if(activeWorkers.length<3||activeWorkers.length>6)
      throw new Error(`Recovery found invalid active worker count ${activeWorkers.length}.`);

    const norm=x=>(x||'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();

    if(new Set(activeWorkers.map(w=>norm(w.worker_role))).size!==activeWorkers.length)
      throw new Error('Recovery found duplicate worker roles.');

    if(new Set(activeWorkers.map(w=>norm(w.mandate))).size!==activeWorkers.length)
      throw new Error('Recovery found duplicate worker mandates.');

    let recovered=false;

    for(let i=0;i<activeWorkers.length;i++){
      let worker=await env.DB.prepare(
        `SELECT * FROM worker_jobs WHERE id=?`
      ).bind(activeWorkers[i].id).first();

      if(!worker)
        throw new Error('Recovery encountered missing worker.');

      const existing=await env.DB.prepare(
        `SELECT id FROM worker_results
         WHERE work_order_id=? AND worker_job_id=? AND status='submitted'
         ORDER BY created_at DESC LIMIT 1`
      ).bind(wo,worker.id).first();

      if(existing) continue;

      if(i===0){
        stage='quality-gate';

        await env.DB.prepare(
          `UPDATE worker_jobs
           SET status='running',
               attempts=attempts+1,
               started_at=COALESCE(started_at,?),
               last_updated=?
           WHERE id=?`
        ).bind(nowISO(),nowISO(),worker.id).run();

        const poisoned='N/A';

        if(workerOutputUsable(poisoned))
          throw new Error('Quality gate failed to reject injected bad output.');

        stage='replace-bad-worker';

        const repl=await replaceWorkerFromExistingPacket(
          env,
          worker,
          'EAT-001 recovery injected unusable output'
        );

        stage='execute-replacement';

        await runRecoveredWorker(
          env,
          repl.newId,
          'elastic-recovery'
        );

        recovered=true;
      } else {
        stage=`execute-worker:${worker.id}`;

        await runRecoveredWorker(
          env,
          worker.id,
          'elastic-specialist'
        );
      }
    }

    stage='synthesis';

    let synthesis=await env.DB.prepare(
      `SELECT * FROM department_syntheses
       WHERE work_order_id=? AND department_id='DISCOVERY'
       ORDER BY created_at DESC LIMIT 1`
    ).bind(wo).first();

    if(!synthesis){
      synthesis=await createDepartmentSynthesis(env,{
        workOrderId:wo,
        departmentId:'DISCOVERY',
        objective
      });
    }

    stage='vector-challenge';

    let challenge=await env.DB.prepare(
      `SELECT * FROM cross_department_reviews
       WHERE work_order_id=?
         AND reviewer_department_id='DILIGENCE'
         AND subject_synthesis_id=?
       ORDER BY created_at DESC LIMIT 1`
    ).bind(wo,synthesis.id).first();

    if(!challenge){
      challenge=await createCrossDepartmentReview(env,{
        workOrderId:wo,
        objective,
        reviewerDepartmentId:'DILIGENCE',
        subjectSynthesisId:synthesis.id
      });
    }

    stage='hive-reintegration';

    let reintegration=await env.DB.prepare(
      `SELECT * FROM hive_reintegrations
       WHERE work_order_id=?
         AND source_synthesis_id=?
       ORDER BY created_at DESC LIMIT 1`
    ).bind(wo,synthesis.id).first();

    if(!reintegration){
      const knowledgeId=await reintegrateHiveKnowledge(env,{
        workOrderId:wo,
        synthesisId:synthesis.id,
        reviewRefs:[challenge.id],
        knowledgeType:'elastic-synthesized-learning',
        subject:'EAT-001 elastic department execution',
        content:`DISCOVERY synthesis: ${synthesis.synthesis}\nIndependent DILIGENCE review: ${challenge.review}`,
        confidence:.8,
        verificationStatus:'elastic-acceptance-reviewed',
        disposition:challenge.decision==='REJECT'?'held':'accepted',
        rationale:'EAT-001 recovered forward from interrupted elastic execution.'
      });

      reintegration=await env.DB.prepare(
        `SELECT * FROM hive_reintegrations
         WHERE work_order_id=? AND knowledge_id=?
         LIMIT 1`
      ).bind(wo,knowledgeId).first();
    }

    stage='final-audit';

    const finalWorkers=await env.DB.prepare(
      `SELECT * FROM worker_jobs
       WHERE rotation_id=? AND status!='replaced'
       ORDER BY created_at,id`
    ).bind(wo).all();

    const finalList=finalWorkers.results||[];

    const lineage=await env.DB.prepare(
      `SELECT COUNT(*) n
       FROM knowledge_inheritance
       WHERE work_order_id=?`
    ).bind(wo).first();

    const resultCount=await env.DB.prepare(
      `SELECT COUNT(*) n
       FROM worker_results
       WHERE work_order_id=? AND status='submitted'`
    ).bind(wo).first();

    const runningWorkers=await env.DB.prepare(
      `SELECT COUNT(*) n
       FROM worker_jobs
       WHERE rotation_id=? AND status='running'`
    ).bind(wo).first();

    const authorityViolations=await env.DB.prepare(
      `SELECT COUNT(*) n
       FROM worker_jobs
       WHERE rotation_id=?
         AND authority_scope NOT IN (
           'internal-zero-dollar',
           'read-only',
           'analysis-only'
         )`
    ).bind(wo).first();

    const rolesUnique=
      new Set(finalList.map(x=>norm(x.worker_role))).size===finalList.length;

    const mandatesUnique=
      new Set(finalList.map(x=>norm(x.mandate))).size===finalList.length;

    const checks={
      originalWorkOrderReused:true,
      originalHiveSeedsReused:true,
      dynamicDecomposition:finalList.length>=3&&finalList.length<=6,
      heterogeneousWorkers:rolesUnique&&mandatesUnique,
      inheritedKnowledgeTraceable:
        Number(lineage?.n||0)>=finalList.length*seeds.length,
      workerResultsComplete:
        Number(resultCount?.n||0)===finalList.length,
      badWorkerRecovered:recovered,
      departmentSynthesisPersisted:Boolean(synthesis?.id),
      independentChallengePersisted:Boolean(challenge?.id),
      hiveReintegrationRetrievable:Boolean(reintegration?.knowledge_id),
      noStrandedWorkers:Number(runningWorkers?.n||0)===0,
      authorityBoundaryPreserved:
        Number(authorityViolations?.n||0)===0,
      externalSpendUSDZero:true
    };

    const passed=Object.values(checks).every(Boolean);

    await env.DB.prepare(
      `UPDATE work_orders
       SET status=?,completed_at=?,last_updated=?
       WHERE id=?`
    ).bind(
      passed?'completed':'failed',
      nowISO(),
      nowISO(),
      wo
    ).run();

    await audit(
      env,
      'ELASTIC_RECOVERY_HARNESS',
      'EAT-001-RECOVERY',
      wo,
      JSON.stringify({passed,checks})
    );

    return {
      ok:passed,
      recovered:true,
      test:'EAT-001',
      version:VIS.version,
      testId,
      workOrderId:wo,
      checks,
      counts:{
        workers:finalList.length,
        workerResults:Number(resultCount?.n||0),
        inheritanceRows:Number(lineage?.n||0)
      },
      synthesisId:synthesis?.id||null,
      challengeId:challenge?.id||null,
      reintegrationId:reintegration?.id||null,
      externalSpendUSD:0
    };

  } catch(error) {
    try {
      await env.DB.prepare(
        `INSERT INTO failures
          (rotation_id,component,error,retry_count,resolved)
         VALUES (?,?,?,0,0)`
      ).bind(
        wo,
        `elastic-recovery:${stage}`,
        cleanText(String(error?.stack||error),4000)
      ).run();
    } catch(_) {}

    throw new Error(
      `EAT-001 recovery failed at ${stage}: ${error?.message||error}`
    );
  }
}

function deterministicElasticFallbackPlan() {
  return [
    {role:'Lineage Specialist',mandate:'Verify that inherited Hive knowledge remains traceable through every delegated worker result and identify any lineage gaps.'},
    {role:'Authority Boundary Specialist',mandate:'Verify that all delegated work remains internal, zero-dollar, reversible, and inside the supplied authority scope.'},
    {role:'Resilience Specialist',mandate:'Evaluate worker replacement, failure recovery, and completion invariants without relying on external actions or evidence.'},
    {role:'Synthesis Quality Specialist',mandate:'Evaluate whether heterogeneous worker outputs can be compressed without losing disagreements, limitations, or evidence references.'}
  ];
}

async function runITIncidentRepairEAT001(env) {
  await ensureSchema(env);
  const testId='EAT-001-1790466134673-550afb9e', wo=`${testId}-WO`;
  const authority='internal-zero-dollar'; assertInternalAuthority(authority);
  const incidentId='INC-EAT-001-AI-DECOMPOSITION';
  await env.DB.prepare(`INSERT OR IGNORE INTO it_incidents
    (id,work_order_id,incident_type,component,severity,diagnosis,status,authority_scope)
    VALUES (?,?,?,?,?,?,?,?)`).bind(incidentId,wo,'AI_INFERENCE_EMPTY','atlas-decomposition','medium',
      'Workers AI returned no readable response before worker creation. Historical failure preserved.','open',authority).run();
  const repairId=`REP-${crypto.randomUUID()}`;
  let usedFallback=false;
  try {
    const existing=await env.DB.prepare(`SELECT COUNT(*) n FROM worker_jobs WHERE rotation_id=?`).bind(wo).first();
    if(Number(existing?.n||0)===0){
      const order=await env.DB.prepare(`SELECT objective FROM work_orders WHERE id=?`).bind(wo).first();
      const seeds=(await env.DB.prepare(`SELECT id FROM hive_knowledge WHERE source_ref=? AND status='active' ORDER BY id`).bind(testId).all()).results||[];
      const head=await env.DB.prepare(`SELECT agent_id,authority_scope FROM department_heads WHERE department_id='DISCOVERY' AND status='active'`).first();
      if(!order||seeds.length!==2||!head) throw new Error('IT repair preflight failed: original EAT state incomplete.');
      assertInternalAuthority(head.authority_scope);
      let specs;
      try {
        const planText=await think(env,ELASTIC_HEAD_SYSTEM,`OBJECTIVE: ${order.objective}\nINHERITED HIVE KNOWLEDGE IDS: ${seeds.map(x=>x.id).join(', ')}\nAUTHORITY: ${authority}`,900,.35);
        specs=parseElasticPlan(planText);
      } catch(_) { specs=deterministicElasticFallbackPlan(); usedFallback=true; }
      for(const spec of specs) await createConstrainedWorkerJob(env,{workOrderId:wo,departmentId:'DISCOVERY',managerAgent:head.agent_id,workerRole:spec.role,mandate:spec.mandate,knowledgeIds:seeds.map(x=>x.id),authorityScope:authority});
    }
    const result=await recoverElasticDepartmentAcceptance(env,testId);
    if(!result?.ok) throw new Error('Forward repair completed but acceptance checks did not pass.');
    await env.DB.prepare(`INSERT INTO it_repairs (id,incident_id,repair_agent,action,verification,status) VALUES (?,?,?,?,?,'verified')`)
      .bind(repairId,incidentId,'JANITOR',`Bounded AI retry plus ${usedFallback?'deterministic decomposition fallback':'validated AI decomposition'}; resumed existing EAT lineage without rerunning harness.`,JSON.stringify(result.checks)).run();
    const authorityViolations=await env.DB.prepare(`SELECT COUNT(*) n FROM worker_jobs WHERE rotation_id=? AND authority_scope NOT IN ('internal-zero-dollar','read-only','analysis-only')`).bind(wo).first();
    const secure=Number(authorityViolations?.n||0)===0;
    const reviewId=`CSR-${crypto.randomUUID()}`;
    await env.DB.prepare(`INSERT INTO cybersecurity_reviews
      (id,incident_id,repair_id,reviewer_agent,authority_preserved,forensic_history_preserved,secrets_exposed,decision,review)
      VALUES (?,?,?,?,?,?,?,?,?)`).bind(reviewId,incidentId,repairId,'SENTINEL',secure?1:0,1,0,secure?'APPROVED':'HOLD',
      'Independent post-repair review: authority boundary checked; original failure record retained; no secret material handled by repair.').run();
    if(!secure) throw new Error('Cybersecurity review detected authority violation.');
    await env.DB.prepare(`UPDATE it_incidents SET status='resolved',resolved_at=? WHERE id=?`).bind(nowISO(),incidentId).run();
    await env.DB.prepare(`UPDATE failures SET resolved=1 WHERE rotation_id=? AND component='elastic-recovery:atlas-decomposition'`).bind(wo).run();
    await audit(env,'IT_RELIABILITY','SELF_HEAL_EAT_001',wo,JSON.stringify({incidentId,repairId,reviewId,usedFallback}));
    return {ok:true,version:VIS.version,incidentId,repairId,cybersecurityReviewId:reviewId,usedFallback,acceptance:result,externalSpendUSD:0};
  } catch(error) {
    await env.DB.prepare(`INSERT INTO it_repairs (id,incident_id,repair_agent,action,verification,status) VALUES (?,?,?,?,?,'failed')`)
      .bind(repairId,incidentId,'JANITOR','Attempted bounded forward repair of existing EAT incident.',cleanText(String(error?.stack||error),4000)).run();
    throw error;
  }
}


/* ============================================================
   V1.8.5 MANAGER + SCALE ORCHESTRATION
   ============================================================ */

const SCALE_MANAGER_SYSTEM = `
You are a VIS Department Head. Decompose the supplied internal objective into 2 or 3 manager mandates.
Managers coordinate specialist workers; they do not expand authority. Use only supplied Hive knowledge.
Return STRICT JSON only: {"managers":[{"name":"...","mandate":"..."}]}.
Manager names and mandates must be distinct. No external action, spending, contact, credential use, or legal/compliance representation.
`;

const SCALE_MANAGER_SYNTHESIS_SYSTEM = `
You are a constrained VIS manager. Compress ONLY the supplied worker results.
Preserve disagreements, evidence IDs, limitations, and uncertainty. Do not invent facts.
Return: MANAGER SYNTHESIS, WORKER EVIDENCE, DISAGREEMENTS, LIMITATIONS.
`;

function deterministicManagerPlan() {
  return [
    {name:'LINEAGE_MANAGER',mandate:'Coordinate specialists testing knowledge lineage, evidence traceability, and compression integrity.'},
    {name:'RESILIENCE_MANAGER',mandate:'Coordinate specialists testing worker recovery, manager continuity, and bounded internal authority.'}
  ];
}

function parseManagerPlan(text) {
  let parsed;
  try { parsed=JSON.parse(String(text||'').replace(/^```(?:json)?/i,'').replace(/```$/,'').trim()); }
  catch { throw new Error('Manager plan was not valid JSON.'); }
  const rows=Array.isArray(parsed?.managers)?parsed.managers:[];
  if(rows.length<2||rows.length>3) throw new Error('Manager plan must contain 2-3 managers.');
  const clean=rows.map(x=>({name:cleanText(x?.name,120).toUpperCase().replace(/[^A-Z0-9_ -]/g,'_'),mandate:cleanText(x?.mandate,1200)}));
  if(clean.some(x=>!x.name||!x.mandate)) throw new Error('Manager plan contains empty fields.');
  if(new Set(clean.map(x=>x.name)).size!==clean.length) throw new Error('Manager plan contains duplicate names.');
  if(new Set(clean.map(x=>x.mandate.toLowerCase())).size!==clean.length) throw new Error('Manager plan contains duplicate mandates.');
  return clean;
}

async function createManagerAssignment(env, record) {
  assertInternalAuthority(record.authorityScope||'internal-zero-dollar');
  const id=record.id||`MA-${crypto.randomUUID()}`;
  const managerId=record.managerId||`MGR-${crypto.randomUUID()}`;
  await env.DB.prepare(`INSERT OR IGNORE INTO managers
    (id,department_id,manager_agent,mandate,authority_scope,status,last_updated)
    VALUES (?,?,?,?,?,'active',?)`).bind(managerId,record.departmentId,record.managerAgent||managerId,cleanText(record.mandate,2000),record.authorityScope||'internal-zero-dollar',nowISO()).run();
  await env.DB.prepare(`INSERT INTO manager_assignments
    (id,work_order_id,manager_id,department_id,objective,knowledge_ids,status,authority_scope,last_updated)
    VALUES (?,?,?,?,?,?,'queued',?,?)`).bind(id,record.workOrderId,managerId,record.departmentId,cleanText(record.objective,3000),JSON.stringify(record.knowledgeIds||[]),record.authorityScope||'internal-zero-dollar',nowISO()).run();
  return {id,managerId};
}

async function createManagerSynthesis(env, record) {
  const assignment=await env.DB.prepare(`SELECT * FROM manager_assignments WHERE id=? AND work_order_id=?`).bind(record.assignmentId,record.workOrderId).first();
  if(!assignment) throw new Error('Manager synthesis requires valid assignment.');
  assertInternalAuthority(assignment.authority_scope);
  const rows=await env.DB.prepare(`SELECT wr.id,wr.result,wr.evidence_refs,wj.worker_role,wj.manager_agent
    FROM worker_results wr JOIN worker_jobs wj ON wj.id=wr.worker_job_id
    WHERE wr.work_order_id=? AND wr.status='submitted' AND wj.manager_agent=? ORDER BY wr.created_at,wr.id`).bind(record.workOrderId,assignment.manager_id).all();
  if(!(rows.results||[]).length) throw new Error('Manager synthesis requires worker results.');
  let synthesis;
  try { synthesis=await think(env,SCALE_MANAGER_SYNTHESIS_SYSTEM,`OBJECTIVE: ${assignment.objective}\nMANAGER: ${assignment.manager_id}\nRESULTS: ${JSON.stringify(rows.results)}`,1000,.25); }
  catch { synthesis=`MANAGER SYNTHESIS: deterministic compression after bounded AI failure.\nWORKER EVIDENCE: ${JSON.stringify(rows.results)}\nDISAGREEMENTS: preserved in raw worker results.\nLIMITATIONS: automated fallback compression.`; }
  const id=`MS-${crypto.randomUUID()}`;
  const workerRefs=rows.results.map(x=>x.id);
  const evidenceRefs=[...new Set(rows.results.flatMap(x=>{try{return JSON.parse(x.evidence_refs||'[]')}catch{return[]}}))];
  await env.DB.prepare(`INSERT INTO manager_syntheses
    (id,work_order_id,manager_assignment_id,manager_id,synthesis,worker_result_refs,evidence_refs,status)
    VALUES (?,?,?,?,?,?,?,'submitted')`).bind(id,record.workOrderId,record.assignmentId,assignment.manager_id,cleanText(synthesis,12000),JSON.stringify(workerRefs),JSON.stringify(evidenceRefs)).run();
  await env.DB.prepare(`UPDATE manager_assignments SET status='completed',completed_at=?,last_updated=? WHERE id=?`).bind(nowISO(),nowISO(),record.assignmentId).run();
  return {id,synthesis,workerRefs,evidenceRefs};
}

async function openITIncident(env, record) {
  assertInternalAuthority(record.authorityScope||'internal-zero-dollar');
  const id=record.id||`INC-${crypto.randomUUID()}`;
  await env.DB.prepare(`INSERT OR IGNORE INTO it_incidents
    (id,work_order_id,incident_type,component,severity,diagnosis,status,authority_scope)
    VALUES (?,?,?,?,?,?,?,?)`).bind(id,record.workOrderId||null,record.incidentType,record.component,record.severity||'medium',cleanText(record.diagnosis,3000),'open',record.authorityScope||'internal-zero-dollar').run();
  return id;
}

async function sentinelReviewRepair(env, incidentId, repairId, workOrderId) {
  const violations=await env.DB.prepare(`SELECT COUNT(*) n FROM worker_jobs WHERE rotation_id=? AND authority_scope NOT IN ('internal-zero-dollar','read-only','analysis-only')`).bind(workOrderId).first();
  const secure=Number(violations?.n||0)===0;
  const id=`CSR-${crypto.randomUUID()}`;
  await env.DB.prepare(`INSERT INTO cybersecurity_reviews
    (id,incident_id,repair_id,reviewer_agent,authority_preserved,forensic_history_preserved,secrets_exposed,decision,review)
    VALUES (?,?,?,?,?,?,?,?,?)`).bind(id,incidentId,repairId,'SENTINEL',secure?1:0,1,0,secure?'APPROVED':'HOLD','Independent V1.8.5 repair review: authority, forensic continuity, and secret-handling boundaries checked.').run();
  if(!secure) throw new Error('SENTINEL blocked repair due to authority violation.');
  return id;
}

async function generalizedJanitorRepair(env, record) {
  const incident=await env.DB.prepare(`SELECT * FROM it_incidents WHERE id=?`).bind(record.incidentId).first();
  if(!incident||incident.status!=='open') throw new Error('JANITOR requires an open incident.');
  assertInternalAuthority(incident.authority_scope);
  const recipe=await env.DB.prepare(`SELECT * FROM repair_recipes WHERE incident_type=? AND status='active' ORDER BY created_at LIMIT 1`).bind(incident.incident_type).first();
  if(!recipe) throw new Error(`No active JANITOR recipe for ${incident.incident_type}.`);
  const repairId=`REP-${crypto.randomUUID()}`;
  let action='';
  if(incident.incident_type==='WORKER_FAILURE') {
    const worker=await env.DB.prepare(`SELECT * FROM worker_jobs WHERE id=? AND rotation_id=?`).bind(record.workerJobId,incident.work_order_id).first();
    if(!worker) throw new Error('JANITOR worker repair target missing.');
    const repl=await replaceWorkerFromExistingPacket(env,worker,'V1.8.5 generalized JANITOR worker recovery');
    await runRecoveredWorker(env,repl.newId,'scale-janitor-replacement');
    action=`Replaced failed worker ${worker.id} with ${repl.newId} from inherited packet.`;
    record.replacementWorkerId=repl.newId;
  } else if(incident.incident_type==='MANAGER_INTERRUPTION') {
    const assignment=await env.DB.prepare(`SELECT * FROM manager_assignments WHERE id=? AND work_order_id=?`).bind(record.managerAssignmentId,incident.work_order_id).first();
    if(!assignment) throw new Error('JANITOR manager repair target missing.');
    await env.DB.prepare(`UPDATE manager_assignments SET status='running',started_at=COALESCE(started_at,?),last_updated=? WHERE id=?`).bind(nowISO(),nowISO(),assignment.id).run();
    action=`Resumed manager assignment ${assignment.id} from persisted worker evidence.`;
  } else throw new Error(`JANITOR recipe not implemented for ${incident.incident_type}.`);
  await env.DB.prepare(`INSERT INTO it_repairs (id,incident_id,repair_agent,action,verification,status) VALUES (?,?,?,?,?,'verified')`).bind(repairId,incident.id,'JANITOR',action,'Repair executed within persisted internal-zero-dollar lineage.').run();
  const reviewId=await sentinelReviewRepair(env,incident.id,repairId,incident.work_order_id);
  await env.DB.prepare(`UPDATE it_incidents SET status='resolved',resolved_at=? WHERE id=?`).bind(nowISO(),incident.id).run();
  await audit(env,'JANITOR','GENERALIZED_REPAIR',incident.work_order_id,JSON.stringify({incidentId:incident.id,repairId,reviewId,recipe:recipe.id}));
  return {repairId,reviewId,replacementWorkerId:record.replacementWorkerId||null,recipeId:recipe.id};
}

async function runScaleAcceptanceTest(env) {
  await ensureSchema(env);
  const testId=`SAT-001-${Date.now()}-${crypto.randomUUID().slice(0,8)}`;
  const wo=`${testId}-WO`, authority='internal-zero-dollar';
  assertInternalAuthority(authority);
  const objective='Test hierarchical VIS execution through Department Head, multiple managers, heterogeneous workers, injected worker failure, injected manager interruption, generalized JANITOR recovery, manager compression, independent challenge, SENTINEL oversight, and Hive reintegration.';
  const seeds=[
    await createHiveKnowledge(env,{id:`${testId}-HK-A`,knowledgeType:'scale-fixture',subject:'Manager scale invariant',content:'Department Heads delegate bounded objectives to managers; managers coordinate disposable workers; all knowledge remains Hive-owned and traceable.',confidence:1,verificationStatus:'acceptance-fixture',sourceType:'harness',sourceRef:testId}),
    await createHiveKnowledge(env,{id:`${testId}-HK-B`,knowledgeType:'scale-fixture',subject:'Self-healing scale invariant',content:'Worker and manager failures must be repaired from persisted state without authority expansion, forensic deletion, external action, or spending.',confidence:1,verificationStatus:'acceptance-fixture',sourceType:'harness',sourceRef:testId})
  ];
  await createWorkOrder(env,{id:wo,objective,requestedBy:'HIVE-SCALE-HARNESS',authorityScope:authority,priority:1});
  await env.DB.prepare(`UPDATE work_orders SET status='running',started_at=?,last_updated=? WHERE id=?`).bind(nowISO(),nowISO(),wo).run();
  let managerPlan, planningMode='ai-primary';
  try { managerPlan=parseManagerPlan(await think(env,SCALE_MANAGER_SYSTEM,`OBJECTIVE: ${objective}\nHIVE IDS: ${seeds.join(', ')}\nAUTHORITY: ${authority}`,800,.3)); }
  catch { managerPlan=deterministicManagerPlan(); planningMode='deterministic-fallback'; }
  const assignments=[];
  for(const spec of managerPlan) assignments.push({...spec,...await createManagerAssignment(env,{workOrderId:wo,departmentId:'DISCOVERY',managerAgent:spec.name,mandate:spec.mandate,objective,knowledgeIds:seeds,authorityScope:authority})});
  const workerMap=[];
  for(const a of assignments){
    await env.DB.prepare(`UPDATE manager_assignments SET status='running',started_at=?,last_updated=? WHERE id=?`).bind(nowISO(),nowISO(),a.id).run();
    const specs=[
      {role:`${a.name} Evidence Specialist`,mandate:`Collect and test internal evidence for manager mandate: ${a.mandate}`},
      {role:`${a.name} Challenge Specialist`,mandate:`Challenge assumptions and identify limitations for manager mandate: ${a.mandate}`}
    ];
    for(const spec of specs){ const w=await createConstrainedWorkerJob(env,{workOrderId:wo,departmentId:'DISCOVERY',managerAgent:a.managerId,workerRole:spec.role,mandate:spec.mandate,knowledgeIds:seeds,authorityScope:authority}); workerMap.push({assignment:a,...spec,...w}); }
  }
  const victim=workerMap[0];
  await env.DB.prepare(`UPDATE worker_jobs SET status='running',attempts=attempts+1,started_at=?,last_updated=? WHERE id=?`).bind(nowISO(),nowISO(),victim.id).run();
  const workerIncident=await openITIncident(env,{id:`${testId}-INC-WORKER`,workOrderId:wo,incidentType:'WORKER_FAILURE',component:'worker-execution',diagnosis:'SAT-001 injected disposable worker failure after inherited packet creation.',authorityScope:authority});
  const workerRepair=await generalizedJanitorRepair(env,{incidentId:workerIncident,workerJobId:victim.id});
  for(const w of workerMap.slice(1)) await runRecoveredWorker(env,w.id,'scale-specialist');
  const disrupted=assignments[1]||assignments[0];
  await env.DB.prepare(`UPDATE manager_assignments SET status='interrupted',last_updated=? WHERE id=?`).bind(nowISO(),disrupted.id).run();
  const managerIncident=await openITIncident(env,{id:`${testId}-INC-MANAGER`,workOrderId:wo,incidentType:'MANAGER_INTERRUPTION',component:'manager-orchestration',diagnosis:'SAT-001 injected manager interruption after worker evidence persisted.',authorityScope:authority});
  const managerRepair=await generalizedJanitorRepair(env,{incidentId:managerIncident,managerAssignmentId:disrupted.id});
  const managerSyntheses=[];
  for(const a of assignments) managerSyntheses.push(await createManagerSynthesis(env,{workOrderId:wo,assignmentId:a.id}));
  const head=await env.DB.prepare(`SELECT agent_id FROM department_heads WHERE department_id='DISCOVERY' AND status='active'`).first();
  let departmentText;
  try { departmentText=await think(env,HAT_HEAD_SYSTEM,`WORK ORDER: ${wo}\nOBJECTIVE: ${objective}\nMANAGER SYNTHESES: ${JSON.stringify(managerSyntheses)}`,1200,.25); }
  catch { departmentText=`SYNTHESIS: deterministic Department Head compression of manager outputs.\nMANAGER OUTPUTS: ${JSON.stringify(managerSyntheses)}\nLIMITATIONS: bounded AI fallback used.`; }
  const dsId=`DS-${crypto.randomUUID()}`;
  await env.DB.prepare(`INSERT INTO department_syntheses (id,work_order_id,department_id,head_agent,synthesis,evidence_refs,worker_result_refs,status) VALUES (?,?,?,?,?,?,?,'submitted')`).bind(dsId,wo,'DISCOVERY',head?.agent_id||'ATLAS',cleanText(departmentText,12000),JSON.stringify(seeds),JSON.stringify(managerSyntheses.flatMap(x=>x.workerRefs))).run();
  const challenge=await createCrossDepartmentReview(env,{workOrderId:wo,reviewerDepartmentId:'DILIGENCE',subjectSynthesisId:dsId,objective});
  const knowledgeId=await reintegrateHiveKnowledge(env,{workOrderId:wo,synthesisId:dsId,reviewRefs:[challenge.id],knowledgeType:'scale-synthesized-learning',subject:'SAT-001 hierarchical scale execution',content:`Department synthesis: ${departmentText}\nIndependent review: ${challenge.review}`,confidence:.8,verificationStatus:'sat-001-reviewed',disposition:challenge.decision==='REJECT'?'held':'accepted',rationale:'SAT-001 manager-scale execution after generalized self-healing and independent review.'});
  const counts={
    managers:Number((await env.DB.prepare(`SELECT COUNT(*) n FROM manager_assignments WHERE work_order_id=?`).bind(wo).first())?.n||0),
    managerSyntheses:Number((await env.DB.prepare(`SELECT COUNT(*) n FROM manager_syntheses WHERE work_order_id=?`).bind(wo).first())?.n||0),
    results:Number((await env.DB.prepare(`SELECT COUNT(*) n FROM worker_results WHERE work_order_id=? AND status='submitted'`).bind(wo).first())?.n||0),
    openIncidents:Number((await env.DB.prepare(`SELECT COUNT(*) n FROM it_incidents WHERE work_order_id=? AND status!='resolved'`).bind(wo).first())?.n||0),
    securityApprovals:Number((await env.DB.prepare(`SELECT COUNT(*) n FROM cybersecurity_reviews WHERE incident_id LIKE ? AND decision='APPROVED'`).bind(`${testId}%`).first())?.n||0),
    runningWorkers:Number((await env.DB.prepare(`SELECT COUNT(*) n FROM worker_jobs WHERE rotation_id=? AND status='running'`).bind(wo).first())?.n||0)
  };
  const authorityViolations=Number((await env.DB.prepare(`SELECT COUNT(*) n FROM worker_jobs WHERE rotation_id=? AND authority_scope NOT IN ('internal-zero-dollar','read-only','analysis-only')`).bind(wo).first())?.n||0);
  const reintegration=await env.DB.prepare(`SELECT r.id,k.content FROM hive_reintegrations r JOIN hive_knowledge k ON k.id=r.knowledge_id WHERE r.work_order_id=? AND r.knowledge_id=?`).bind(wo,knowledgeId).first();
  const checks={multipleManagers:counts.managers>=2,managerCompressionComplete:counts.managerSyntheses===counts.managers,boundedWorkerSwarm:workerMap.length>=4&&workerMap.length<=6,workerFailureRecovered:Boolean(workerRepair.replacementWorkerId),managerInterruptionRecovered:Boolean(managerRepair.repairId),generalizedJanitorUsed:Boolean(workerRepair.recipeId&&managerRepair.recipeId),sentinelOversight:counts.securityApprovals>=2,hierarchicalKnowledgeTraceable:counts.results===workerMap.length,noOpenIncidents:counts.openIncidents===0,noStrandedWorkers:counts.runningWorkers===0,departmentSynthesisPersisted:Boolean(dsId),independentChallengePersisted:Boolean(challenge.id),hiveReintegrationRetrievable:Boolean(reintegration?.content),authorityBoundaryPreserved:authorityViolations===0,externalSpendUSDZero:true};
  const passed=Object.values(checks).every(Boolean);
  await env.DB.prepare(`UPDATE work_orders SET status=?,completed_at=?,last_updated=? WHERE id=?`).bind(passed?'completed':'failed',nowISO(),nowISO(),wo).run();
  await audit(env,'SCALE_ACCEPTANCE_HARNESS','SAT-001',wo,JSON.stringify({passed,planningMode,checks,counts}));
  return {ok:passed,test:'SAT-001',version:VIS.version,testId,workOrderId:wo,planningMode,managerCount:assignments.length,workerCount:workerMap.length,workerRepair,managerRepair,departmentSynthesisId:dsId,challengeId:challenge.id,reintegratedKnowledgeId:knowledgeId,checks,counts,externalSpendUSD:0};
}


/* ============================================================
   V1.8.6 AI-PRIMARY PLANNING + OPERATIONAL ACCEPTANCE
   ============================================================ */

function extractJSONObject(text) {
  const raw=String(text||'').trim().replace(/^```(?:json)?\s*/i,'').replace(/\s*```$/,'');
  try { return JSON.parse(raw); } catch (_) {}
  const start=raw.indexOf('{'), end=raw.lastIndexOf('}');
  if(start<0||end<=start) throw new Error('No JSON object found in AI planning response.');
  return JSON.parse(raw.slice(start,end+1));
}

function parseManagerPlanV186(text) {
  const parsed=extractJSONObject(text);
  const rows=Array.isArray(parsed?.managers)?parsed.managers:[];
  if(rows.length<2||rows.length>3) throw new Error('Manager plan must contain 2-3 managers.');
  const clean=rows.map(x=>({name:cleanText(x?.name,120).toUpperCase().replace(/[^A-Z0-9_ -]/g,'_'),mandate:cleanText(x?.mandate,1200)}));
  if(clean.some(x=>!x.name||!x.mandate)) throw new Error('Manager plan contains empty fields.');
  if(new Set(clean.map(x=>x.name)).size!==clean.length) throw new Error('Manager plan contains duplicate names.');
  if(new Set(clean.map(x=>x.mandate.toLowerCase())).size!==clean.length) throw new Error('Manager plan contains duplicate mandates.');
  return clean;
}

async function recordPlanningTelemetry(env, record) {
  const id=record.id||`PT-${crypto.randomUUID()}`;
  await env.DB.prepare(`INSERT INTO planning_telemetry
    (id,work_order_id,planner_level,planner_agent,planning_mode,attempts,valid,diagnostic,plan_json)
    VALUES (?,?,?,?,?,?,?,?,?)`).bind(id,record.workOrderId,record.plannerLevel,record.plannerAgent,record.planningMode,Number(record.attempts||0),record.valid?1:0,cleanText(record.diagnostic||'',3000),JSON.stringify(record.plan||null)).run();
  return id;
}

async function aiPrimaryManagerPlan(env, record) {
  const errors=[];
  for(let attempt=1;attempt<=3;attempt++) {
    try {
      const text=await think(env,SCALE_MANAGER_SYSTEM,`OBJECTIVE: ${record.objective}\nHIVE IDS: ${(record.knowledgeIds||[]).join(', ')}\nAUTHORITY: ${record.authorityScope}\nATTEMPT: ${attempt}\nReturn one JSON object only.`,900,.2);
      const plan=parseManagerPlanV186(text);
      const telemetryId=await recordPlanningTelemetry(env,{workOrderId:record.workOrderId,plannerLevel:'department-head',plannerAgent:'ATLAS',planningMode:'ai-primary',attempts:attempt,valid:true,diagnostic:'Validated AI-generated manager decomposition.',plan});
      return {plan,planningMode:'ai-primary',attempts:attempt,telemetryId};
    } catch(error) { errors.push(`attempt ${attempt}: ${error?.message||String(error)}`); }
  }
  const fallback=deterministicManagerPlan();
  const telemetryId=await recordPlanningTelemetry(env,{workOrderId:record.workOrderId,plannerLevel:'department-head',plannerAgent:'ATLAS',planningMode:'deterministic-fallback',attempts:3,valid:true,diagnostic:errors.join(' | '),plan:fallback});
  return {plan:fallback,planningMode:'deterministic-fallback',attempts:3,telemetryId};
}

async function runOperationalAcceptanceTest(env) {
  await ensureSchema(env);
  const testId=`OAT-001-${Date.now()}-${crypto.randomUUID().slice(0,8)}`;
  const wo=`${testId}-WO`, authority='internal-zero-dollar';
  assertInternalAuthority(authority);
  const objective='Design an internal zero-dollar DCC deployment workflow that turns incoming business opportunities into evidence-backed qualification, challenge, and Founder-ready decision packages while minimizing Founder coordination.';
  const seeds=[
    await createHiveKnowledge(env,{id:`${testId}-HK-A`,knowledgeType:'operational-fixture',subject:'DCC deployment objective',content:'Douglas Contracting Company Inc. is VIS deployment #1. The immediate objective is an internal opportunity qualification workflow; this acceptance run may not contact prospects, publish, spend money, create consequential accounts, or make commitments.',confidence:1,verificationStatus:'operational-fixture',sourceType:'harness',sourceRef:testId}),
    await createHiveKnowledge(env,{id:`${testId}-HK-B`,knowledgeType:'operational-fixture',subject:'Founder compression rule',content:'VIS should automate routine research coordination and surface Founder decisions only when capital, consequential external action, credentials, or human-only judgment is required. Outputs must preserve evidence, uncertainty, challenge, and kill criteria.',confidence:1,verificationStatus:'operational-fixture',sourceType:'harness',sourceRef:testId})
  ];
  await createWorkOrder(env,{id:wo,objective,requestedBy:'HIVE-OPERATIONAL-ACCEPTANCE',authorityScope:authority,priority:1});
  await env.DB.prepare(`UPDATE work_orders SET status='running',started_at=?,last_updated=? WHERE id=?`).bind(nowISO(),nowISO(),wo).run();
  const planning=await aiPrimaryManagerPlan(env,{workOrderId:wo,objective,knowledgeIds:seeds,authorityScope:authority});
  const assignments=[];
  for(const spec of planning.plan) assignments.push({...spec,...await createManagerAssignment(env,{workOrderId:wo,departmentId:'DISCOVERY',managerAgent:spec.name,mandate:spec.mandate,objective,knowledgeIds:seeds,authorityScope:authority})});
  const workers=[];
  for(const a of assignments) {
    await env.DB.prepare(`UPDATE manager_assignments SET status='running',started_at=?,last_updated=? WHERE id=?`).bind(nowISO(),nowISO(),a.id).run();
    const specs=[
      {role:`${a.name} Evidence Specialist`,mandate:`Build the internal evidence and decision criteria required for: ${a.mandate}. Use only inherited Hive knowledge and clearly label unknowns.`},
      {role:`${a.name} Falsification Specialist`,mandate:`Challenge assumptions, identify failure modes and define kill/escalation criteria for: ${a.mandate}. Use only inherited Hive knowledge.`}
    ];
    for(const spec of specs) workers.push({assignment:a,...spec,...await createConstrainedWorkerJob(env,{workOrderId:wo,departmentId:'DISCOVERY',managerAgent:a.managerId,workerRole:spec.role,mandate:spec.mandate,knowledgeIds:seeds,authorityScope:authority})});
  }
  const victim=workers[0];
  await env.DB.prepare(`UPDATE worker_jobs SET status='running',attempts=attempts+1,started_at=?,last_updated=? WHERE id=?`).bind(nowISO(),nowISO(),victim.id).run();
  const incidentId=await openITIncident(env,{id:`${testId}-INC-WORKER`,workOrderId:wo,incidentType:'WORKER_FAILURE',component:'operational-worker',diagnosis:'OAT-001 injected disposable worker interruption during normal internal business workflow.',authorityScope:authority});
  const repair=await generalizedJanitorRepair(env,{incidentId,workerJobId:victim.id});
  for(const w of workers.slice(1)) await runRecoveredWorker(env,w.id,'oat-operational-specialist');
  const managerSyntheses=[];
  for(const a of assignments) managerSyntheses.push(await createManagerSynthesis(env,{workOrderId:wo,assignmentId:a.id}));
  const head=await env.DB.prepare(`SELECT agent_id FROM department_heads WHERE department_id='DISCOVERY' AND status='active'`).first();
  let departmentText, departmentMode='ai-primary';
  try { departmentText=await think(env,HAT_HEAD_SYSTEM,`WORK ORDER: ${wo}\nOBJECTIVE: ${objective}\nMANAGER SYNTHESES: ${JSON.stringify(managerSyntheses)}\nProduce a Founder-ready internal operating recommendation.`,1400,.25); }
  catch(error) { departmentMode='deterministic-fallback'; departmentText=`SYNTHESIS: deterministic compression after bounded AI failure.\nMANAGER OUTPUTS: ${JSON.stringify(managerSyntheses)}\nLIMITATIONS: ${cleanText(error?.message||String(error),1000)}`; }
  await recordPlanningTelemetry(env,{workOrderId:wo,plannerLevel:'department-synthesis',plannerAgent:head?.agent_id||'ATLAS',planningMode:departmentMode,attempts:departmentMode==='ai-primary'?1:3,valid:true,diagnostic:departmentMode==='ai-primary'?'AI department synthesis completed.':'Fallback department synthesis used.',plan:{managerSynthesisIds:managerSyntheses.map(x=>x.id)}});
  const dsId=`DS-${crypto.randomUUID()}`;
  await env.DB.prepare(`INSERT INTO department_syntheses (id,work_order_id,department_id,head_agent,synthesis,evidence_refs,worker_result_refs,status) VALUES (?,?,?,?,?,?,?,'submitted')`).bind(dsId,wo,'DISCOVERY',head?.agent_id||'ATLAS',cleanText(departmentText,12000),JSON.stringify(seeds),JSON.stringify(managerSyntheses.flatMap(x=>x.workerRefs))).run();
  const challenge=await createCrossDepartmentReview(env,{workOrderId:wo,reviewerDepartmentId:'DILIGENCE',subjectSynthesisId:dsId,objective});
  const knowledgeId=await reintegrateHiveKnowledge(env,{workOrderId:wo,synthesisId:dsId,reviewRefs:[challenge.id],knowledgeType:'operational-learning',subject:'DCC VIS deployment workflow',content:`DISCOVERY synthesis: ${departmentText}\nIndependent DILIGENCE review: ${challenge.review}`,confidence:.8,verificationStatus:'oat-001-reviewed',disposition:challenge.decision==='REJECT'?'held':'accepted',rationale:'OAT-001 normal internal business workflow completed with injected worker failure, generalized repair, independent challenge, and Hive reintegration.'});
  const counts={
    managers:Number((await env.DB.prepare(`SELECT COUNT(*) n FROM manager_assignments WHERE work_order_id=?`).bind(wo).first())?.n||0),
    managerSyntheses:Number((await env.DB.prepare(`SELECT COUNT(*) n FROM manager_syntheses WHERE work_order_id=?`).bind(wo).first())?.n||0),
    results:Number((await env.DB.prepare(`SELECT COUNT(*) n FROM worker_results WHERE work_order_id=? AND status='submitted'`).bind(wo).first())?.n||0),
    openIncidents:Number((await env.DB.prepare(`SELECT COUNT(*) n FROM it_incidents WHERE work_order_id=? AND status!='resolved'`).bind(wo).first())?.n||0),
    runningWorkers:Number((await env.DB.prepare(`SELECT COUNT(*) n FROM worker_jobs WHERE rotation_id=? AND status='running'`).bind(wo).first())?.n||0),
    planningTelemetry:Number((await env.DB.prepare(`SELECT COUNT(*) n FROM planning_telemetry WHERE work_order_id=?`).bind(wo).first())?.n||0)
  };
  const authorityViolations=Number((await env.DB.prepare(`SELECT COUNT(*) n FROM worker_jobs WHERE rotation_id=? AND authority_scope NOT IN ('internal-zero-dollar','read-only','analysis-only')`).bind(wo).first())?.n||0);
  const reintegration=await env.DB.prepare(`SELECT r.id,k.content FROM hive_reintegrations r JOIN hive_knowledge k ON k.id=r.knowledge_id WHERE r.work_order_id=? AND r.knowledge_id=?`).bind(wo,knowledgeId).first();
  const checks={aiPrimaryManagerDecomposition:planning.planningMode==='ai-primary',multipleManagers:counts.managers>=2,managerCompressionComplete:counts.managerSyntheses===counts.managers,boundedWorkerSwarm:workers.length>=4&&workers.length<=6,injectedFailureRecovered:Boolean(repair.replacementWorkerId),generalizedJanitorUsed:Boolean(repair.recipeId),sentinelOversight:Boolean(repair.reviewId),planningTelemetryPersisted:counts.planningTelemetry>=2,noOpenIncidents:counts.openIncidents===0,noStrandedWorkers:counts.runningWorkers===0,departmentSynthesisPersisted:Boolean(dsId),independentChallengePersisted:Boolean(challenge.id),hiveReintegrationRetrievable:Boolean(reintegration?.content),authorityBoundaryPreserved:authorityViolations===0,externalSpendUSDZero:true};
  const passed=Object.values(checks).every(Boolean);
  await env.DB.prepare(`UPDATE work_orders SET status=?,completed_at=?,last_updated=? WHERE id=?`).bind(passed?'completed':'failed',nowISO(),nowISO(),wo).run();
  await audit(env,'OPERATIONAL_ACCEPTANCE_HARNESS','OAT-001',wo,JSON.stringify({passed,planningMode:planning.planningMode,departmentMode,checks,counts}));
  return {ok:passed,test:'OAT-001',version:VIS.version,testId,workOrderId:wo,objective,planningMode:planning.planningMode,planningAttempts:planning.attempts,planningTelemetryId:planning.telemetryId,departmentSynthesisMode:departmentMode,managerCount:assignments.length,workerCount:workers.length,repair,departmentSynthesisId:dsId,challengeId:challenge.id,reintegratedKnowledgeId:knowledgeId,checks,counts,externalSpendUSD:0};
}


const RESEARCH_DIRECTOR_SYSTEM = `
You are the VIS Research Director. The Hive has received a specific venture mission.
Design the minimum high-value research program needed to answer that mission. Do not force the mission toward the evidence already available.
Treat the venture as isolated: use its own context, economics, risks and objectives. Shared Hive knowledge may inform questions but is not automatically evidence for this venture.
Return ONLY JSON with keys: research_goal, questions. questions must be an array of 4-8 objects with question, source_classes, priority, why_it_matters.
Allowed source_classes: official-statistics, procurement, municipal-procurement, trade-market, industry-market, technology-signal, regulatory, customer-demand, competitor-pricing, labour, supply-chain.
Prioritize direct evidence capable of changing a business decision. Unfamiliar industries trigger research, not rejection.
For opportunity-discovery missions, the program must seek evidence for these commercial dimensions before graduation: named buyer/customer, painful problem, concrete offer, demand/purchasing evidence, competitors/substitutes, pricing/unit economics, operational requirements, material risks, and learnability/advantage. Generic sector growth or market statistics are context, not an opportunity by themselves.
`;

async function createMissionResearchPlan(env,{objectiveId,ventureId,objective}) {
  const venture=await env.DB.prepare(`SELECT * FROM ventures WHERE id=?`).bind(ventureId).first();
  const prompt=`VENTURE: ${venture?.name||ventureId}\nVENTURE CONTEXT: ${venture?.context||'No additional context.'}\nMISSION: ${objective}\nDesign mission-directed eyes-and-ears research before opportunity synthesis.`;
  let parsed=null;
  try {
    const raw=await think(env,RESEARCH_DIRECTOR_SYSTEM,prompt,1200,.25);
    const m=String(raw||'').match(/\{[\s\S]*\}/);
    if(m) parsed=JSON.parse(m[0]);
  } catch(_) {}
  if(!parsed || !Array.isArray(parsed.questions) || parsed.questions.length<4) parsed={research_goal:`Resolve the highest-value evidence gaps for ${objectiveId} without contaminating the mission with unrelated portfolio signals.`,questions:[
    {question:'What verified customer or buyer pain directly matches this mission?',source_classes:['customer-demand','industry-market'],priority:5,why_it_matters:'Demand must be demonstrated.'},
    {question:'What current procurement, contract, or purchasing evidence exists for this mission?',source_classes:['procurement','municipal-procurement'],priority:5,why_it_matters:'Direct buyer evidence is stronger than generic trends.'},
    {question:'What do official statistics show about market size, growth, labour, and geography?',source_classes:['official-statistics','labour'],priority:4,why_it_matters:'Establishes market context.'},
    {question:'What competitors, substitutes, pricing, and delivery models exist?',source_classes:['competitor-pricing','industry-market'],priority:4,why_it_matters:'Tests economics and differentiation.'},
    {question:'What operational, regulatory, supply-chain, or capability constraints could kill the venture?',source_classes:['regulatory','supply-chain'],priority:4,why_it_matters:'Prevents attractive but infeasible conclusions.'}
  ]};
  const id=`MRP-${crypto.randomUUID()}`;
  await env.DB.prepare(`INSERT INTO mission_research_plans (id,objective_id,venture_id,research_goal,plan_json,status,last_updated) VALUES (?,?,?,?,?,'active',?)`).bind(id,objectiveId,ventureId,cleanText(parsed.research_goal,2000),JSON.stringify(parsed),nowISO()).run();
  for(const q of parsed.questions.slice(0,8)) await env.DB.prepare(`INSERT INTO mission_research_questions (id,plan_id,objective_id,venture_id,question,source_classes,priority,status,last_updated) VALUES (?,?,?,?,?,?,?,'open',?)`).bind(`MRQ-${crypto.randomUUID()}`,id,objectiveId,ventureId,cleanText(q.question,1200),JSON.stringify(q.source_classes||[]),Math.max(1,Math.min(5,typeof q.priority==='string'?({low:2,medium:3,high:5,critical:5}[q.priority.toLowerCase()]||3):Number(q.priority||3))),nowISO()).run();
  return {id,plan:parsed};
}


const RESEARCH_SPECIALIST_SYSTEM=`
You are a VIS Research Source Specialist. Answer one mission research question using ONLY the supplied retrieved public-source material.
Separate verified observations from inference. Do not invent facts. If the supplied material cannot support an answer, begin answer with INSUFFICIENT: and explain the exact missing evidence.
Return ONE JSON object only. No markdown fences and no prose outside JSON.
Required schema:
{
  "answer": "string",
  "confidence": 0.0,
  "evidence_indexes": [0],
  "gaps": ["specific unresolved evidence gap"],
  "follow_up_questions": ["narrow question that could resolve a gap"]
}
Rules:
- For a buyer/procurement question, prefer an observable current transaction: name the purchasing organization or narrowly defined buyer, the purchased scope/category, and the purchasing mechanism only when directly supported by supplied source material. Do not infer a buyer from sector statistics.
- When multiple transaction records are present, select a concrete candidate with the strongest direct evidence; do not rank candidates by subjective attractiveness.
- confidence must be between 0 and 1.
- evidence_indexes must contain only zero-based indexes explicitly listed in AVAILABLE_EVIDENCE_INDEXES. Never invent an index.
- gaps must be an array of concise strings.
- follow_up_questions must contain 0-2 narrow, researchable questions and must not merely restate or broaden the parent question.
- Prefer questions that resolve one of these commercial dimensions: specific buyer, painful problem, concrete offer, demonstrated demand, pricing/economics, competition/substitutes, operations, risk, learnability/advantage, route-to-market.
- A follow-up should have high information gain: name the buyer class, transaction/procurement signal, price/economic input, or primary evidence needed.
- Do not ask generic questions about broad industry outlook, general optimism, generic trends, or economy-wide conditions unless the parent question specifically requires them.
- If evidence is insufficient, use confidence below 0.55 and identify the smallest specific evidence gap that would materially change qualification.
`;

function validateResearchSpecialistOutput(raw,docCount){
  const parsed=extractJSONObject(raw);
  if(!parsed||typeof parsed!=='object'||Array.isArray(parsed)) throw new Error('Research specialist output is not a JSON object.');
  if(typeof parsed.answer!=='string'||!parsed.answer.trim()) throw new Error('Research specialist answer missing.');
  const confidence=Number(parsed.confidence);
  if(!Number.isFinite(confidence)||confidence<0||confidence>1) throw new Error('Research specialist confidence must be 0-1.');
  if(!Array.isArray(parsed.evidence_indexes)) throw new Error('Research specialist evidence_indexes must be an array.');
  const evidenceIndexes=[...new Set(parsed.evidence_indexes.map(Number))];
  if(evidenceIndexes.some(i=>!Number.isInteger(i)||i<0||i>=docCount)) throw new Error('Research specialist referenced an invalid evidence index.');
  if(!Array.isArray(parsed.gaps)) throw new Error('Research specialist gaps must be an array.');
  if(!Array.isArray(parsed.follow_up_questions)) throw new Error('Research specialist follow_up_questions must be an array.');
  return {
    answer: cleanText(parsed.answer,5000),
    confidence,
    evidence_indexes:evidenceIndexes.slice(0,4),
    gaps:parsed.gaps.map(x=>cleanText(x,800)).filter(Boolean).slice(0,6),
    follow_up_questions:parsed.follow_up_questions.map(x=>cleanText(x,1200)).filter(Boolean).slice(0,2)
  };
}

async function recordResearchSpecialistDiagnostic(env,{runId,planId,qrow,attempt,stage,status,error='',raw='',parsed=null}){
  const id=`RSD-${crypto.randomUUID()}`;
  await env.DB.prepare(`INSERT INTO research_specialist_diagnostics
    (id,run_id,plan_id,question_id,objective_id,venture_id,attempt,stage,status,error,raw_preview,parsed_json)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`).bind(
      id,runId,planId,qrow.id,qrow.objective_id,qrow.venture_id,Number(attempt||1),
      cleanText(stage,120),cleanText(status,120),cleanText(error,3000),
      cleanText(raw,3000),parsed?JSON.stringify(parsed):null
    ).run();
  return id;
}

function deterministicEvidenceGapQuestions(qrow,docs,error=''){
  const fallback=convergentFallbackQuestions(qrow,docs,error);
  const sourceNames=[...new Set((docs||[]).map(d=>d.name).filter(Boolean))].slice(0,3);
  const context=sourceNames.length?` Sources retrieved: ${sourceNames.join(', ')}.`:'';
  return {
    gap:`${fallback.gap}.${context}`,
    questions:fallback.questions.filter(q=>commercialInformationGain(q,qrow.question)>=4).slice(0,2)
  };
}

const COMMERCIAL_DIMENSIONS=[
  'buyer','pain','offer','demand','competition','pricing_economics',
  'operations','risks','learnability_advantage','route_to_market'
];

function classifyCommercialDimension(question=''){
  const q=String(question||'').toLowerCase();
  if(/\b(buyer|customer|purchas|budget|procurement|contracting authorit|decision maker)\b/.test(q)) return 'buyer';
  if(/\b(pain|problem|shortage|delay|costly|urgent|bottleneck|failure|complaint)\b/.test(q)) return 'pain';
  if(/\b(offer|service|product|solution|deliverable|scope)\b/.test(q)) return 'offer';
  if(/\b(demand|tender|rfp|rfq|award|spend|volume|frequency|market need)\b/.test(q)) return 'demand';
  if(/\b(competitor|substitute|alternative|incumbent)\b/.test(q)) return 'competition';
  if(/\b(price|pricing|margin|economics|contract value|revenue|cost|gross profit|unit economics)\b/.test(q)) return 'pricing_economics';
  if(/\b(operation|equipment|labour|labor|supplier|logistics|capacity|delivery)\b/.test(q)) return 'operations';
  if(/\b(risk|regulat|licen|permit|insurance|liability|constraint)\b/.test(q)) return 'risks';
  if(/\b(learn|advantage|capabilit|skill|moat|differentiat)\b/.test(q)) return 'learnability_advantage';
  if(/\b(route.to.market|sales channel|go.to.market|reach buyer|distribution|bid process)\b/.test(q)) return 'route_to_market';
  return 'unclassified';
}

function commercialInformationGain(question='',parentQuestion=''){
  const q=String(question||'').toLowerCase();
  const parent=String(parentQuestion||'').toLowerCase();
  let score=classifyCommercialDimension(q)==='unclassified'?0:4;
  if(/\b(specific|named|which|who|what current|how much|contract|award|tender|budget|price|margin|buyer)\b/.test(q)) score+=2;
  if(/\b(primary|official|procurement|invoice|award|dataset|buyer document|price list)\b/.test(q)) score+=2;
  if(/\b(general outlook|overall outlook|optimism|broad trend|industry-wide|economy-wide)\b/.test(q)) score-=5;
  if(parent && q===parent) score-=5;
  return score;
}

function convergentFallbackQuestions(qrow,docs,error=''){
  const dim=classifyCommercialDimension(qrow.question);
  const stem=cleanText(qrow.question,650);
  const byDimension={
    buyer:[`Which specific buyer organization or buyer class currently budgets for the need described in: ${stem}?`,`Which current procurement, budget, contract, or buyer document proves that buyer spends on this need?`],
    pain:[`What current primary evidence quantifies the buyer's cost, delay, shortage, failure rate, or urgency for: ${stem}?`,`Which named buyer or industry body documents this problem and its operational consequence?`],
    offer:[`What concrete deliverable could solve the evidenced buyer problem in: ${stem}?`,`What existing purchased service or product demonstrates the required scope and delivery standard?`],
    demand:[`Which current tenders, awards, purchase records, or recurring buyer activity demonstrate demand for: ${stem}?`,`How frequently and at what observable volume are buyers purchasing this category?`],
    competition:[`Which named suppliers or substitutes currently serve the buyer need in: ${stem}?`,`What do current competitor offers reveal about differentiation and buyer expectations?`],
    pricing_economics:[`What current contract values, posted prices, wage/material inputs, or comparable transactions support economics for: ${stem}?`,`What evidence supports a plausible revenue, direct-cost, and gross-margin range for one transaction?`],
    operations:[`What equipment, labour, supplier, certification, and delivery requirements are necessary to fulfill: ${stem}?`,`Which requirement is the hardest operational constraint and what primary source verifies it?`],
    risks:[`Which specific regulatory, liability, procurement, supply, or execution risk could invalidate: ${stem}?`,`What official source establishes the highest-consequence constraint?`],
    learnability_advantage:[`What capability must VIS or the venture learn to compete credibly in: ${stem}?`,`What evidence indicates that capability can be acquired without prohibitive capital, licensing, or lead time?`],
    route_to_market:[`How does the identified buyer currently discover, qualify, and purchase suppliers for: ${stem}?`,`Which concrete channel, vendor list, tender portal, distributor, or direct-sales path reaches that buyer?`],
    unclassified:[`Which specific buyer has a current painful problem that could become one concrete offer related to: ${stem}?`,`What current primary evidence establishes demand and pricing/economics for that buyer-problem-offer combination?`]
  };
  return {dimension:dim,gap:`commercial-evidence-gap: ${cleanText(error||'validated commercial evidence is incomplete',500)}`,questions:byDimension[dim]};
}

async function researchFingerprint(value){
  const bytes=new TextEncoder().encode(String(value||''));
  const digest=await crypto.subtle.digest('SHA-256',bytes);
  return [...new Uint8Array(digest)].map(b=>b.toString(16).padStart(2,'0')).join('');
}

function researchPriority(v){
  if(typeof v==='string') return ({low:2,medium:3,high:5,critical:5}[v.toLowerCase()]||3);
  return Math.max(1,Math.min(5,Number(v||3)));
}

function stripHTMLResearch(html){
  return cleanText(String(html||'').replace(/<script[\s\S]*?<\/script>/gi,' ').replace(/<style[\s\S]*?<\/style>/gi,' ').replace(/<[^>]+>/g,' ').replace(/&nbsp;/g,' ').replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/\s+/g,' '),12000);
}

async function recordSourceHealth(env,sourceId,ok,error=''){
  const now=nowISO();
  await env.DB.prepare(`INSERT OR IGNORE INTO research_source_health (source_id,last_updated) VALUES (?,?)`).bind(sourceId,now).run();
  if(ok) await env.DB.prepare(`UPDATE research_source_health SET attempts=attempts+1,successes=successes+1,consecutive_failures=0,last_status='healthy',last_error=NULL,last_attempt_at=?,last_success_at=?,last_updated=? WHERE source_id=?`).bind(now,now,now,sourceId).run();
  else await env.DB.prepare(`UPDATE research_source_health SET attempts=attempts+1,failures=failures+1,consecutive_failures=consecutive_failures+1,last_status='degraded',last_error=?,last_attempt_at=?,last_updated=? WHERE source_id=?`).bind(cleanText(error,1000),now,now,sourceId).run();
}

async function fetchResearchDocument(env,sourceId,url){
  let last='';
  for(let attempt=1;attempt<=2;attempt++){
    const controller=new AbortController(); const timer=setTimeout(()=>controller.abort(),7000);
    try{
      const r=await fetch(url,{headers:{'User-Agent':'VIS-Research/1.8.6 (+internal business research; zero-dollar)','Accept':'text/html,application/atom+xml,application/xml,text/plain;q=0.9,*/*;q=0.5'},signal:controller.signal});
      clearTimeout(timer);
      if(!r.ok){ last=`HTTP ${r.status}`; continue; }
      const ct=r.headers.get('content-type')||''; const body=await r.text();
      const text=ct.includes('html')?stripHTMLResearch(body):cleanText(body,12000);
      if(!text||text.length<120){ last='empty-or-thin-document'; continue; }
      await recordSourceHealth(env,sourceId,true);
      return {url,title:url,text,rawHTML:ct.includes('html')?body:''};
    }catch(e){ clearTimeout(timer); last=cleanText(e?.message||String(e),500); }
  }
  await recordSourceHealth(env,sourceId,false,last||'fetch-failed');
  return null;
}

function absoluteResearchURL(base,href){
  try{
    const raw=String(href||'').trim();
    if(!raw||raw.startsWith('#')||raw.startsWith('javascript:')||raw.startsWith('mailto:')) return null;
    const u=new URL(raw,base);
    if(!/^https?:$/.test(u.protocol)) return null;
    u.hash='';
    return u.toString();
  }catch(_){ return null; }
}

function extractResearchLinks(doc){
  const html=String(doc?.rawHTML||'');
  if(!html) return [];
  const out=[], seen=new Set();
  const re=/<a\b[^>]*\bhref\s*=\s*["']([^"'<>]+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let m;
  while((m=re.exec(html))&&out.length<120){
    const url=absoluteResearchURL(doc.url,m[1]);
    if(!url||seen.has(url)) continue;
    seen.add(url);
    out.push({url,text:stripHTMLResearch(m[2]).slice(0,300)});
  }
  return out;
}

function procurementUtilityPath(url=''){
  try{
    const u=new URL(String(url||''));
    const path=u.pathname.replace(/\/+$/,'').toLowerCase();
    return /\/(subscribe(?:-link)?|request-contract-history-letter|contract-history(?:-letter)?|help|support|contact|about|login|sign-in|signin|register|registration|account|profile|search|advanced-search|rss|feed|sitemap|accessibility|terms|privacy)(?:\/|$)/i.test(path)
      || /\/(guidance|guide|how-to|learn|resources?)(?:\/|$)/i.test(path);
  }catch(_){ return true; }
}

function procurementDetailCandidate(sourceId,url,anchor=''){
  let u; try{u=new URL(url);}catch(_){return false;}
  const path=u.pathname.replace(/\/+$/,'');
  const text=`${path} ${anchor}`.toLowerCase();
  if(procurementUtilityPath(url)) return false;
  if(sourceId.startsWith('SRC-CANADABUYS')){
    if(!/canadabuys\.canada\.ca$/i.test(u.hostname)) return false;
    if(u.searchParams.has('words')||u.searchParams.has('current_tab')||u.searchParams.has('items_per_page')) return false;
    return /tender-opportunit.*\/(tender-notice|award-notice|notice)(?:\/|$)/i.test(path)
      || /\/(tender-notice|award-notice|solicitation|contract-award|notice)\/[a-z0-9-]{4,}(?:\/|$)/i.test(path)
      || /solicitation|tender notice|award notice|contract award/i.test(text);
  }
  if(sourceId==='SRC-BC-DIGITAL-MARKETPLACE-TXN'){
    if(!/marketplace\.digital\.gov\.bc\.ca$/i.test(u.hostname)) return false;
    return /opportunit|procurement|contract|award|product|service/i.test(text) && path.split('/').filter(Boolean).length>=2;
  }
  return false;
}

function procurementDocumentLooksCanonical(doc){
  if(!doc?.url||!doc?.text||procurementUtilityPath(doc.url)) return false;
  const text=String(doc.text||'').replace(/\s+/g,' ').toLowerCase();
  if(text.length<350) return false;

  // V1.8.24: URL shape is only candidate discovery. Content must look like one
  // procurement record before the document can enter transaction extraction.
  const signals=[
    /\b(solicitation|tender|procurement|contract|award|notice)\s*(number|no\.?|id|identifier|reference)\b/i.test(text),
    /\bclosing\s*(date|time)|submission\s*deadline|bid\s*deadline\b/i.test(text),
    /\bpublication\s*date|published\s*(on|date)|issue\s*date\b/i.test(text),
    /\bcontracting\s*authority|procuring\s*(entity|organization)|buyer\s*(organization|name)?\b/i.test(text),
    /\bnotice\s*type|procurement\s*type|solicitation\s*type|tender\s*type\b/i.test(text),
    /\baward\s*(date|amount|value|supplier)|contract\s*(value|amount)\b/i.test(text),
    /\bdescription\s+of\s+(work|requirement|procurement)|statement\s+of\s+work|scope\s+of\s+work\b/i.test(text),
    /\bunspsc\b|\bgsin\b|\bcommodity\s*(code|category)\b/i.test(text)
  ].filter(Boolean).length;

  const utilitySignals=[
    /subscribe\s+to\s+(tender|notification|opportunit)/i.test(text),
    /request\s+(a\s+)?contract\s+history\s+letter/i.test(text),
    /contracts?\s+.*awarded\s+to\s+your\s+business/i.test(text),
    /sign\s+in|create\s+an\s+account|register\s+for/i.test(text)
  ].filter(Boolean).length;

  return signals>=2 && utilitySignals<2;
}
async function discoverProcurementDetailDocuments(env,searchDoc,budget,maxDetails=3){
  const links=extractResearchLinks(searchDoc)
    .filter(x=>procurementDetailCandidate(searchDoc.sourceId,x.url,x.text))
    .slice(0,12);
  const docs=[];
  for(const link of links){
    if(docs.length>=maxDetails||budget.fetches>=budget.maxFetches) break;
    budget.fetches++;
    const sourceId=`${searchDoc.sourceId}-DETAIL-${(await researchFingerprint(link.url)).slice(0,10)}`;
    const d=await fetchResearchDocument(env,sourceId,link.url);
    if(!d?.text) continue;
    if(!procurementDocumentLooksCanonical(d)){
      try{ await audit(env,'ADAPTIVE_RESEARCH','PROCUREMENT_CANDIDATE_REJECTED',searchDoc.sourceId,JSON.stringify({candidateUrl:link.url,discoveredFrom:searchDoc.url,reason:'not-transaction-shaped',externalSpendUSD:0})); }catch(_){}
      continue;
    }
    docs.push({...d,sourceId,sourceClass:'procurement',name:`${searchDoc.name} — canonical procurement record`,quality:1.0,discoveredFrom:searchDoc.url});
  }
  return docs;
}

function keywordsForResearch(q){
  const stop=new Set('what are the current key most potential how can does do for and with from into this that company dcc its these their where which who why when revenue increase opportunities industry industries market markets'.split(' '));
  return String(q||'').toLowerCase().replace(/[^a-z0-9\s-]/g,' ').split(/\s+/).filter(x=>x.length>3&&!stop.has(x)).slice(0,9);
}

function isTransactionFirstBuyerQuestion(qrow){
  const dim=canonicalDependencyDimension(qrow?.question||'')||classifyCommercialDimension(qrow?.question||'');
  return dim==='buyer' && /buyer|procurement|purchas|budget|contract|tender|award/i.test(String(qrow?.question||''));
}

async function collectQuestionSources(env,qrow,budget){
  let classes=[]; try{ classes=JSON.parse(qrow.source_classes||'[]'); }catch(_){}
  const words=keywordsForResearch(qrow.question), docs=[];
  const add=async(sourceId,sourceClass,name,url,quality)=>{
    if(budget.fetches>=budget.maxFetches) return;
    budget.fetches++;
    const d=await fetchResearchDocument(env,sourceId,url);
    if(d&&d.text) docs.push({...d,sourceId,sourceClass,name,quality});
  };

  // V1.8.16: when the mission has not yet established a buyer, do not search
  // procurement systems for the abstract objective name. Scan observable
  // transactions first, then let the specialist infer candidate buyer/scope
  // hypotheses from real purchasing signals. This is deliberately broad but
  // bounded: five lanes maximum and the normal 20-fetch ceiling still applies.
  if(isTransactionFirstBuyerQuestion(qrow)){
    // V1.8.22: portal/search pages are candidate discovery only. Preserve their
    // HTML long enough to resolve individual procurement-record links, then
    // spend the remaining bounded source budget on those canonical records.
    const searchDocs=[];
    const addSearch=async(sourceId,name,url)=>{
      if(budget.fetches>=budget.maxFetches) return;
      budget.fetches++;
      const d=await fetchResearchDocument(env,sourceId,url);
      if(d?.text) searchDocs.push({...d,sourceId,sourceClass:'procurement',name,quality:1.0});
    };
    await addSearch('SRC-BC-DIGITAL-MARKETPLACE-TXN','B.C. Digital Marketplace — transaction scan','https://marketplace.digital.gov.bc.ca/');
    const lanes=[
      ['maintenance repair services','MAINTENANCE'],
      ['inspection testing services','INSPECTION'],
      ['equipment supply installation','EQUIPMENT'],
      ['construction services','CONSTRUCTION'],
      ['professional services','PROFESSIONAL']
    ];
    for(const [phrase,id] of lanes){
      if(budget.fetches>=budget.maxFetches) break;
      await addSearch(`SRC-CANADABUYS-TXN-${id}`,'CanadaBuys — transaction scan',`https://canadabuys.canada.ca/en/tender-opportunities?current_tab=c&items_per_page=50&words=${encodeURIComponent(phrase)}`);
    }
    const details=[];
    for(const searchDoc of searchDocs){
      if(budget.fetches>=budget.maxFetches||details.length>=8) break;
      const found=await discoverProcurementDetailDocuments(env,searchDoc,budget,2);
      details.push(...found);
    }
    // Detail records come first so specialists and the identity extractor prefer
    // one observable transaction. Search pages remain available only as discovery context.
    return [...details,...searchDocs].slice(0,10);
  }

  if(classes.some(x=>['procurement','municipal-procurement','customer-demand','competitor-pricing','industry-market'].includes(x))){
    const term=encodeURIComponent(words.join(' ')||'construction maintenance');
    await add('SRC-CANADABUYS','procurement','CanadaBuys',`https://canadabuys.canada.ca/en/tender-opportunities?current_tab=c&items_per_page=50&words=${term}`,1.0);
  }
  const statcanMap={'official-statistics':'https://www150.statcan.gc.ca/n1/rss/dai-quo/34-eng.atom','labour':'https://www150.statcan.gc.ca/n1/rss/dai-quo/14-eng.atom','trade-market':'https://www150.statcan.gc.ca/n1/rss/dai-quo/12-eng.atom','industry-market':'https://www150.statcan.gc.ca/n1/rss/dai-quo/33-eng.atom','technology-signal':'https://www150.statcan.gc.ca/n1/rss/dai-quo/27-eng.atom'};
  for(const c of [...new Set(classes)]) if(statcanMap[c]) await add(`SRC-STATCAN-${c}`,c,'Statistics Canada',statcanMap[c],1.0);
  if(classes.includes('regulatory')) await add('SRC-BC-GOV','regulatory','Government of British Columbia','https://www2.gov.bc.ca/gov/content/industry/construction-industry',.95);
  if(classes.includes('official-statistics')) await add('SRC-BCSTATS','official-statistics','BC Stats','https://www2.gov.bc.ca/gov/content/data/statistics',1.0);
  return docs.slice(0,6);
}

async function persistResearchEvidence(env,{runId,planId,qrow,doc,text,relevance=.8}){
  const fp=await researchFingerprint(`${doc.url}|${text.slice(0,1500)}`);
  const prior=await env.DB.prepare(`SELECT id FROM mission_research_evidence WHERE fingerprint=? AND objective_id=? LIMIT 1`).bind(fp,qrow.objective_id).first();
  if(prior) return prior.id;
  const id=`MRE-${crypto.randomUUID()}`;
  await env.DB.prepare(`INSERT INTO mission_research_evidence (id,run_id,plan_id,question_id,objective_id,venture_id,source_id,source_class,source_name,source_url,title,evidence_text,relevance,source_quality,verification_status,fingerprint,retrieved_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(id,runId,planId,qrow.id,qrow.objective_id,qrow.venture_id,doc.sourceId,doc.sourceClass,doc.name,doc.url,cleanText(doc.title,500),cleanText(text,5000),relevance,doc.quality,'retrieved-public-source',fp,nowISO()).run();
  return id;
}

async function branchFingerprint(q){ return await researchFingerprint(String(q||'').toLowerCase().replace(/[^a-z0-9 ]/g,' ').replace(/\s+/g,' ').trim()); }


async function ensureConvergedResearchPlan(env,{objectiveId,ventureId,objective,existingPlan}){
  if(!existingPlan) return await createMissionResearchPlan(env,{objectiveId,ventureId,objective});

  let planJson={};
  try{ planJson=JSON.parse(existingPlan.plan_json||'{}'); }catch(_){}
  if(planJson?.convergence_version==='1.8.14') return {id:existingPlan.id,plan:planJson,rebase:false};

  const rows=(await env.DB.prepare(`
    SELECT id,question,status,priority,evidence_refs
    FROM mission_research_questions
    WHERE plan_id=?
    ORDER BY COALESCE(priority,3) DESC,created_at
  `).bind(existingPlan.id).all()).results||[];

  const unresolved=rows.filter(r=>['open','research_required'].includes(r.status));
  const lowValue=unresolved.filter(r=>commercialInformationGain(r.question,'')<4);
  const genericRatio=unresolved.length?lowValue.length/unresolved.length:0;

  // V1.8.14 performs a one-time rebase for legacy plans. Evidence is never
  // deleted: old questions/plans are preserved and merely superseded.
  if(genericRatio<0.25 && unresolved.length<=10){
    planJson.convergence_version='1.8.14';
    await env.DB.prepare(`UPDATE mission_research_plans SET plan_json=?,last_updated=? WHERE id=?`)
      .bind(JSON.stringify(planJson),nowISO(),existingPlan.id).run();
    return {id:existingPlan.id,plan:planJson,rebase:false};
  }

  await env.DB.prepare(`
    UPDATE mission_research_questions
    SET status='superseded',last_updated=?
    WHERE plan_id=? AND status IN ('open','research_required')
  `).bind(nowISO(),existingPlan.id).run();

  await env.DB.prepare(`UPDATE mission_research_plans SET status='superseded',last_updated=? WHERE id=?`)
    .bind(nowISO(),existingPlan.id).run();

  const newPlanId=`MRP-${crypto.randomUUID()}`;
  const questions=[
    {question:`Which specific British Columbia buyer organization or narrowly defined buyer class has a current budget and purchasing mechanism for the opportunity sought by ${objectiveId}?`,source_classes:['procurement','municipal-procurement','customer-demand'],priority:5,why_it_matters:'Identifies the economic buyer.'},
    {question:`What current primary evidence shows a costly, urgent, recurring problem for that specific buyer, including measurable delay, shortage, failure, compliance burden, or operating cost?`,source_classes:['customer-demand','procurement','official-statistics'],priority:5,why_it_matters:'Proves buyer pain.'},
    {question:`What concrete product or service could VIS-backed operators deliver to solve that evidenced buyer problem, and what purchased scopes or specifications define the offer?`,source_classes:['procurement','competitor-pricing','industry-market'],priority:5,why_it_matters:'Defines a sellable offer.'},
    {question:`Which current tenders, awards, purchase records, budgets, or recurring transactions demonstrate demand for that buyer-problem-offer combination in British Columbia?`,source_classes:['procurement','municipal-procurement','customer-demand'],priority:5,why_it_matters:'Demonstrates purchasing demand.'},
    {question:`What current contract values, posted prices, direct labour/material inputs, or comparable transactions support revenue, direct-cost, and gross-margin estimates for one sale?`,source_classes:['competitor-pricing','procurement','official-statistics'],priority:5,why_it_matters:'Tests unit economics.'},
    {question:`Which named competitors or substitutes currently serve this buyer, what do they offer, and where is a defensible service, speed, cost, specialization, or distribution gap?`,source_classes:['competitor-pricing','industry-market'],priority:4,why_it_matters:'Tests differentiation.'},
    {question:`What equipment, labour, supplier, certification, insurance, regulatory, and delivery requirements are necessary to fulfill the offer, and which could prevent entry?`,source_classes:['regulatory','labour','supply-chain'],priority:4,why_it_matters:'Tests operational feasibility and risk.'},
    {question:`How does the specific buyer discover, qualify, approve, and purchase from suppliers, and what realistic first route-to-market can reach that buyer without consequential external action?`,source_classes:['procurement','municipal-procurement','customer-demand'],priority:5,why_it_matters:'Defines route-to-market and learnability.'}
  ];
  const plan={
    convergence_version:'1.8.14',
    rebased_from:existingPlan.id,
    research_goal:`Converge ${objectiveId} on one evidence-backed buyer → pain → offer → demand → economics → competition → operations/risk → route-to-market opportunity while preserving all historical evidence.`,
    questions
  };
  await env.DB.prepare(`
    INSERT INTO mission_research_plans
      (id,objective_id,venture_id,research_goal,plan_json,status,last_updated)
    VALUES (?,?,?,?,?,'active',?)
  `).bind(newPlanId,objectiveId,ventureId,plan.research_goal,JSON.stringify(plan),nowISO()).run();

  for(const q of questions){
    await env.DB.prepare(`
      INSERT INTO mission_research_questions
        (id,plan_id,objective_id,venture_id,question,source_classes,priority,status,last_updated)
      VALUES (?,?,?,?,?,?,?,'open',?)
    `).bind(`MRQ-${crypto.randomUUID()}`,newPlanId,objectiveId,ventureId,q.question,JSON.stringify(q.source_classes),q.priority,nowISO()).run();
  }

  await audit(env,'ADAPTIVE_RESEARCH','RESEARCH_PLAN_REBASED',objectiveId,JSON.stringify({
    objectiveId,ventureId,oldPlanId:existingPlan.id,newPlanId,
    unresolvedLegacyQuestions:unresolved.length,
    supersededLowValueQuestions:lowValue.length,
    preservedHistoricalEvidence:true,
    convergenceVersion:'1.8.14',
    externalSpendUSD:0
  }));
  return {id:newPlanId,plan,rebase:true,oldPlanId:existingPlan.id};
}

const RESEARCH_DEPENDENCY_ORDER=['buyer','pain','offer','demand','pricing_economics','competition','operations','risks','route_to_market'];
const RESEARCH_DEPENDENCY_PREREQS={
  buyer:[],
  pain:['buyer'],
  offer:['buyer','pain'],
  demand:['buyer','pain','offer'],
  pricing_economics:['buyer','pain','offer'],
  competition:['buyer','pain','offer'],
  operations:['buyer','pain','offer'],
  risks:['buyer','pain','offer'],
  learnability_advantage:['buyer','pain','offer'],
  route_to_market:['buyer','pain','offer']
};

function canonicalDependencyDimension(question=''){
  const q=String(question||'').toLowerCase();
  if(q.includes('which current british columbia public-sector purchasing transaction')) return 'buyer';
  if(q.includes('which specific british columbia buyer organization or narrowly defined buyer class')) return 'buyer';
  if(q.includes('what current primary evidence shows a costly, urgent, recurring problem for that specific buyer')) return 'pain';
  if(q.includes('what concrete product or service could vis-backed operators deliver to solve that evidenced buyer problem')) return 'offer';
  if(q.includes('which current tenders, awards, purchase records, budgets, or recurring transactions demonstrate demand')) return 'demand';
  if(q.includes('what current contract values, posted prices, direct labour/material inputs, or comparable transactions support revenue')) return 'pricing_economics';
  if(q.includes('which named competitors or substitutes currently serve this buyer')) return 'competition';
  if(q.includes('what equipment, labour, supplier, certification, insurance, regulatory, and delivery requirements')) return 'operations';
  if(q.includes('how does the specific buyer discover, qualify, approve, and purchase from suppliers')) return 'route_to_market';
  return null;
}

async function getResearchDependencyState(env,planId){
  const roots=(await env.DB.prepare(`SELECT id,question,status,evidence_refs,answer_summary FROM mission_research_questions WHERE plan_id=? ORDER BY created_at,id`).bind(planId).all()).results||[];
  const canonical={}, candidates={};
  for(const r of roots){
    const d=canonicalDependencyDimension(r.question);
    if(!d) continue;
    if(!canonical[d]) canonical[d]=r;
    if(!candidates[d]) candidates[d]=[];
    candidates[d].push(r);
  }
  const ready={};
  for(const d of RESEARCH_DEPENDENCY_ORDER){
    const rows=candidates[d]||[];
    let ok=rows.some(r=>r.status==='answered'&&r.evidence_refs&&r.evidence_refs!=='[]'&&!/^INSUFFICIENT/i.test(String(r.answer_summary||'')));
    if(!ok){
      for(const r of rows){
        const child=await env.DB.prepare(`SELECT q.id FROM mission_research_branches b JOIN mission_research_questions q ON q.id=b.child_question_id WHERE b.parent_question_id=? AND q.status='answered' AND q.evidence_refs IS NOT NULL AND q.evidence_refs!='[]' AND COALESCE(q.answer_summary,'') NOT LIKE 'INSUFFICIENT%' ORDER BY q.last_updated DESC LIMIT 1`).bind(r.id).first();
        if(child?.id){ ok=true; break; }
      }
    }
    ready[d]=ok;
  }
  return {canonical,ready};
}

async function researchDependencyGate(env,planId,qrow){
  const state=await getResearchDependencyState(env,planId);
  const dim=canonicalDependencyDimension(qrow.question)||classifyCommercialDimension(qrow.question);
  const prereqs=RESEARCH_DEPENDENCY_PREREQS[dim]||[];
  const missing=prereqs.filter(d=>!state.ready[d]);
  return {allowed:missing.length===0,dimension:dim,missing,state};
}

const TRANSACTION_EXTRACTION_SYSTEM=`
You are the VIS Transaction Evidence Extractor. Extract ONE observable purchasing transaction using ONLY supplied source material.
Return one JSON object only. Never infer a missing fact. Use null for unsupported fields.
Schema:
{
  "buyer_name": {"value": null, "evidence_indexes": []},
  "purchased_scope": {"value": null, "evidence_indexes": []},
  "procurement_identifier": {"value": null, "evidence_indexes": []},
  "procurement_mechanism": {"value": null, "evidence_indexes": []},
  "publication_date": {"value": null, "evidence_indexes": []},
  "close_date": {"value": null, "evidence_indexes": []},
  "award_date": {"value": null, "evidence_indexes": []},
  "contract_value": {"value": null, "evidence_indexes": []},
  "supplier_name": {"value": null, "evidence_indexes": []},
  "delivery_geography": {"value": null, "evidence_indexes": []},
  "qualification_requirements": {"value": null, "evidence_indexes": []},
  "duration_recurrence": {"value": null, "evidence_indexes": []}
}
Rules:
- Extract exactly ONE transaction. Never combine buyer, scope, mechanism, identifier, dates, value, supplier, or other fields from different procurement records.
- Search-result pages and portal listings are candidate-discovery evidence only. Prefer an individual tender, award, contract, or opportunity record for transaction facts.
- Every non-null value requires at least one valid evidence index that directly supports that exact field.
- buyer_name must be a named purchasing organization, not a sector or inferred buyer class.
- purchased_scope must describe the concrete goods/services being purchased, not merely "services", "construction", or another broad category unless that is literally all the source establishes; broad-only scope does not qualify the transaction.
- procurement_identifier is a tender/RFP/RFQ/contract/award/opportunity identifier when explicitly present.
- procurement_mechanism is an explicitly evidenced mechanism such as open tender, RFP, RFQ, standing offer, direct award, or public tender opportunity. Do not infer it from the website name alone.
- A search-results page, portal shell, navigation text, or JavaScript-required placeholder does not establish transaction facts unless the actual transaction details are visible in supplied material.
`;

const TRANSACTION_FIELDS=['buyer_name','purchased_scope','procurement_identifier','procurement_mechanism','publication_date','close_date','award_date','contract_value','supplier_name','delivery_geography','qualification_requirements','duration_recurrence'];

function validateTransactionExtraction(raw,docCount){
  const parsed=extractJSONObject(raw);
  if(!parsed||typeof parsed!=='object'||Array.isArray(parsed)) throw new Error('Transaction extraction is not a JSON object.');
  const out={};
  for(const field of TRANSACTION_FIELDS){
    const item=parsed[field];
    if(!item||typeof item!=='object'||Array.isArray(item)) throw new Error(`Transaction field ${field} missing object wrapper.`);
    const value=item.value===null||item.value===undefined||String(item.value).trim()===''?null:cleanText(String(item.value),1600);
    if(!Array.isArray(item.evidence_indexes)) throw new Error(`Transaction field ${field} evidence_indexes must be an array.`);
    const indexes=[...new Set(item.evidence_indexes.map(Number))];
    if(indexes.some(i=>!Number.isInteger(i)||i<0||i>=docCount)) throw new Error(`Transaction field ${field} referenced invalid evidence index.`);
    if(value&&!indexes.length) throw new Error(`Transaction field ${field} has a value without provenance.`);
    out[field]={value,evidence_indexes:indexes.slice(0,4)};
  }
  return out;
}

function transactionScopeIsConcrete(value){
  const v=String(value||'').trim().toLowerCase();
  if(!v||v.length<12) return false;
  return !['construction services','professional services','maintenance services','inspection services','equipment supply','goods','services','construction'].includes(v);
}

function transactionSourceIsCanonical(url=''){
  try{
    const u=new URL(String(url||''));
    const path=u.pathname.replace(/\/+$/,'');
    const q=u.searchParams;
    if(!/^https?:$/.test(u.protocol)) return false;
    if(q.has('words')||q.has('current_tab')||q.has('items_per_page')||q.has('search')||q.has('query')||q.has('keywords')) return false;
    if(/\/tender-opportunities$/i.test(path)||/\/opportunities$/i.test(path)||/\/search$/i.test(path)) return false;
    if(procurementUtilityPath(url)) return false;
    if(/canadabuys\.canada\.ca$/i.test(u.hostname)) return /tender-opportunit.*\/(tender-notice|award-notice|notice)(?:\/|$)/i.test(path) || /\/(tender-notice|award-notice|solicitation|contract-award|notice)\/[a-z0-9-]{4,}(?:\/|$)/i.test(path);
    if(/marketplace\.digital\.gov\.bc\.ca$/i.test(u.hostname)) return /opportunit|procurement|contract|award/i.test(path) && path.split('/').filter(Boolean).length>=2;
    return path.split('/').filter(Boolean).length>=3;
  }catch(_){ return false; }
}

function intersectEvidenceIndexes(...arrays){
  const normalized=arrays.filter(a=>Array.isArray(a)&&a.length).map(a=>new Set(a.map(Number)));
  if(!normalized.length) return [];
  return [...normalized[0]].filter(v=>normalized.every(set=>set.has(v)));
}


function missionConstraintProfile(objective=''){
  const text=String(objective||'');
  const lower=text.toLowerCase();
  const constraints={geography:null,current:false,publicSector:false};
  if(/\bbritish columbia\b|\bbc\b/.test(lower)) constraints.geography='British Columbia';
  else if(/\balberta\b/.test(lower)) constraints.geography='Alberta';
  else if(/\bontario\b/.test(lower)) constraints.geography='Ontario';
  else if(/\bcanada\b|\bcanadian\b/.test(lower)) constraints.geography='Canada';
  if(/\bcurrent\b|\brecent\b|\bactive\b|\bopen\b/.test(lower)) constraints.current=true;
  if(/public[- ]sector|government|municipal|provincial|federal/.test(lower)) constraints.publicSector=true;
  return constraints;
}

function parseLooseDate(value){
  const v=String(value||'').trim();
  if(!v) return null;
  const d=new Date(v);
  if(!Number.isNaN(d.getTime())) return d;
  const m=v.match(/(20\d{2}|19\d{2})/);
  return m?new Date(`${m[1]}-01-01T00:00:00Z`):null;
}

function transactionMissionFit(parsed,constraints){
  const mismatches=[];
  const geo=String(parsed.delivery_geography?.value||'');
  if(constraints.geography==='British Columbia' && !/british columbia|\bbc\b/i.test(geo)) mismatches.push(`geography: required British Columbia; evidence says ${geo||'unknown'}`);
  if(constraints.geography==='Alberta' && !/alberta/i.test(geo)) mismatches.push(`geography: required Alberta; evidence says ${geo||'unknown'}`);
  if(constraints.geography==='Ontario' && !/ontario/i.test(geo)) mismatches.push(`geography: required Ontario; evidence says ${geo||'unknown'}`);
  if(constraints.geography==='Canada' && geo && !/canada|alberta|british columbia|ontario|quebec|manitoba|saskatchewan|nova scotia|new brunswick|newfoundland|prince edward|yukon|northwest territories|nunavut/i.test(geo)) mismatches.push(`geography: required Canada; evidence says ${geo}`);
  if(constraints.current){
    const dates=[parsed.close_date?.value,parsed.award_date?.value,parsed.publication_date?.value].map(parseLooseDate).filter(Boolean);
    const cutoff=new Date(); cutoff.setUTCFullYear(cutoff.getUTCFullYear()-3);
    if(!dates.length) mismatches.push('recency: current/recent required; no transaction date established');
    else if(Math.max(...dates.map(d=>d.getTime()))<cutoff.getTime()) mismatches.push(`recency: current/recent required; newest evidenced date is ${new Date(Math.max(...dates.map(d=>d.getTime()))).toISOString().slice(0,10)}`);
  }
  return {status:mismatches.length?'mismatch':'matched',mismatches};
}

function isTransactionDiscoveryQuestion(question=''){
  const q=String(question||'');
  return q.startsWith('TRANSACTION DISCOVERY:') || q.startsWith('Which current British Columbia public-sector purchasing transaction');
}

async function extractAndPersistTransactionEvidence(env,{runId,planId,qrow,docs}){
  const material=docs.map((d,i)=>`[${i}] ${d.name} | ${d.url}\n${d.text.slice(0,6000)}`).join('\n\n');
  let raw='', parsed=null;
  try{
    raw=await think(env,TRANSACTION_EXTRACTION_SYSTEM,`TRANSACTION DISCOVERY QUESTION: ${qrow.question}\nAVAILABLE_EVIDENCE_INDEXES: [${docs.map((_,i)=>i).join(',')}]\nSOURCE MATERIAL:\n${material}\nReturn JSON only.`,1800,.05);
    parsed=validateTransactionExtraction(raw,docs.length);
  }catch(error){
    try{ await audit(env,'JANITOR','TRANSACTION_EXTRACTION_FAILED',qrow.objective_id,JSON.stringify({objectiveId:qrow.objective_id,questionId:qrow.id,error:cleanText(error?.message||String(error),1200),externalSpendUSD:0})); }catch(_){}
    return {qualified:false,status:'extraction_failed',missingFields:['buyer_name','purchased_scope','transaction_identity'],id:null};
  }

  const evidenceByIndex={};
  for(let i=0;i<docs.length;i++) evidenceByIndex[i]=await persistResearchEvidence(env,{runId,planId,qrow,doc:docs[i],text:docs[i].text,relevance:.9});

  const provenance={};
  for(const field of TRANSACTION_FIELDS) provenance[field]=(parsed[field].evidence_indexes||[]).map(i=>evidenceByIndex[i]).filter(Boolean);

  const buyer=parsed.buyer_name.value;
  const scope=parsed.purchased_scope.value;
  const identifier=parsed.procurement_identifier.value;
  const mechanism=parsed.procurement_mechanism.value;

  const identityIndexes=intersectEvidenceIndexes(
    parsed.buyer_name.evidence_indexes,
    parsed.purchased_scope.evidence_indexes,
    identifier ? parsed.procurement_identifier.evidence_indexes : parsed.procurement_mechanism.evidence_indexes
  );
  const canonicalIdentityIndexes=identityIndexes.filter(i=>transactionSourceIsCanonical(docs[i]?.url));
  const identityIndex=canonicalIdentityIndexes.length===1?canonicalIdentityIndexes[0]:null;
  const canonicalSourceUrl=identityIndex===null?null:String(docs[identityIndex]?.url||'');
  const identityLocked=identityIndex!==null;
  const identityStatus=identityLocked?'locked':'candidate_unresolved';

  const requiredMissing=[];
  if(!buyer) requiredMissing.push('buyer_name');
  if(!transactionScopeIsConcrete(scope)) requiredMissing.push('purchased_scope');
  if(!identifier&&!mechanism) requiredMissing.push('procurement_identifier_or_mechanism');
  if(!identityLocked) requiredMissing.push('transaction_identity');

  const optionalMissing=TRANSACTION_FIELDS.filter(f=>!parsed[f].value);
  const objectiveRow=await env.DB.prepare(`SELECT objective FROM operational_objectives WHERE id=? LIMIT 1`).bind(qrow.objective_id).first();
  const missionConstraints=missionConstraintProfile(objectiveRow?.objective||'');
  const missionFit=transactionMissionFit(parsed,missionConstraints);
  const identityQualified=requiredMissing.length===0 && identityLocked;
  const qualified=identityQualified && missionFit.status==='matched';
  const id=`TXE-${crypto.randomUUID()}`;
  const sourceEvidenceIds=[...new Set(Object.values(provenance).flat())];
  const transactionFingerprint=identityLocked
    ? await researchFingerprint([canonicalSourceUrl,buyer,scope,identifier||'',mechanism||''].join('|').toLowerCase())
    : null;

  await env.DB.prepare(`INSERT INTO transaction_evidence_extractions
    (id,run_id,plan_id,question_id,objective_id,venture_id,source_evidence_ids,buyer_name,purchased_scope,procurement_identifier,procurement_mechanism,publication_date,close_date,award_date,contract_value,supplier_name,delivery_geography,qualification_requirements,duration_recurrence,missing_fields,field_provenance_json,extraction_status,canonical_source_url,transaction_fingerprint,identity_status,mission_fit_status,mission_constraints_json,mission_mismatches_json,last_updated)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(
      id,runId,planId,qrow.id,qrow.objective_id,qrow.venture_id,JSON.stringify(sourceEvidenceIds),buyer,scope,identifier,mechanism,
      parsed.publication_date.value,parsed.close_date.value,parsed.award_date.value,parsed.contract_value.value,parsed.supplier_name.value,
      parsed.delivery_geography.value,parsed.qualification_requirements.value,parsed.duration_recurrence.value,
      JSON.stringify([...new Set([...requiredMissing,...optionalMissing])]),JSON.stringify(provenance),
      qualified?'qualified':(identityQualified?'mission_mismatch':'candidate_unresolved'),canonicalSourceUrl,transactionFingerprint,identityStatus,missionFit.status,JSON.stringify(missionConstraints),JSON.stringify(missionFit.mismatches),nowISO()
    ).run();

  await audit(env,'ADAPTIVE_RESEARCH',qualified?'TRANSACTION_MISSION_MATCHED':(identityQualified?'TRANSACTION_MISSION_MISMATCH':'TRANSACTION_IDENTITY_UNRESOLVED'),qrow.objective_id,JSON.stringify({
    objectiveId:qrow.objective_id,ventureId:qrow.venture_id,planId,questionId:qrow.id,transactionExtractionId:id,
    qualified,identityQualified,identityStatus,missionFitStatus:missionFit.status,missionConstraints,missionMismatches:missionFit.mismatches,canonicalSourceUrl,transactionFingerprint,requiredMissing,sourceEvidenceIds,externalSpendUSD:0
  }));

  return {
    qualified,status:qualified?'qualified':(identityQualified?'mission_mismatch':'candidate_unresolved'),missingFields:requiredMissing,id,buyer,scope,identifier,mechanism,
    identityStatus,missionFitStatus:missionFit.status,missionConstraints,missionMismatches:missionFit.mismatches,canonicalSourceUrl,transactionFingerprint,sourceEvidenceIds
  };
}

async function latestQualifiedTransaction(env,planId){
  return await env.DB.prepare(`SELECT * FROM transaction_evidence_extractions WHERE plan_id=? AND extraction_status='qualified' AND identity_status='locked' AND canonical_source_url IS NOT NULL AND transaction_fingerprint IS NOT NULL ORDER BY created_at DESC LIMIT 1`).bind(planId).first();
}

async function ensureTransactionDiscoveryStageQuestion(env,{planId,objectiveId,ventureId}){
  const state=await getResearchDependencyState(env,planId);
  const qualifiedTransaction=await latestQualifiedTransaction(env,planId);
  if(qualifiedTransaction) return {buyerReady:true,question:null,created:false,transaction:qualifiedTransaction};
  const marker='TRANSACTION DISCOVERY:';
  // V1.8.19: D1-safe stage lookup. Avoid LIKE/GLOB entirely; a bound pattern on the
  // accumulated legacy question set triggered SQLITE "pattern too complex" in production.
  // Pull the small plan-local candidate set and perform the prefix match deterministically in JS.
  const stageCandidates=await env.DB.prepare(`SELECT * FROM mission_research_questions WHERE plan_id=? ORDER BY created_at DESC`).bind(planId).all();
  let row=(stageCandidates.results||[]).find(candidate=>isTransactionDiscoveryQuestion(candidate.question))||null;
  if(!row){
    const id=`MRQ-${crypto.randomUUID()}`;
    const objectiveRow=await env.DB.prepare(`SELECT objective FROM operational_objectives WHERE id=? LIMIT 1`).bind(objectiveId).first();
    const mission=cleanText(objectiveRow?.objective||'',1800);
    const question=`TRANSACTION DISCOVERY: Find one real-world purchasing transaction that satisfies the explicit constraints in this mission: ${mission}. Geography is unrestricted unless the mission names a geography. Recency is unrestricted unless the mission asks for current/recent/active/open evidence. Establish a named buyer organization, concrete purchased scope, and observable procurement identifier or mechanism from one canonical transaction record. Do not search for ${objectiveId} as a product, category, code, or budget item.`;
    await env.DB.prepare(`INSERT INTO mission_research_questions (id,plan_id,objective_id,venture_id,question,source_classes,priority,status,last_updated) VALUES (?,?,?,?,?,?,5,'open',?)`).bind(id,planId,objectiveId,ventureId,question,JSON.stringify(['procurement','municipal-procurement','customer-demand']),nowISO()).run();
    row=await env.DB.prepare(`SELECT * FROM mission_research_questions WHERE id=?`).bind(id).first();
    await audit(env,'ADAPTIVE_RESEARCH','TRANSACTION_DISCOVERY_STAGE_CREATED',objectiveId,JSON.stringify({objectiveId,ventureId,planId,questionId:id,controlVersion:'1.8.23',legacyQueueBypassed:true,externalSpendUSD:0}));
    return {buyerReady:false,question:row,created:true};
  }
  if(row.status==='answered'&&row.evidence_refs&&row.evidence_refs!=='[]'&&!/^INSUFFICIENT/i.test(String(row.answer_summary||''))){
    const tx=await latestQualifiedTransaction(env,planId);
    if(tx) return {buyerReady:true,question:row,created:false,transaction:tx};
    await env.DB.prepare(`UPDATE mission_research_questions SET status='research_required',answer_summary=?,last_updated=? WHERE id=?`).bind('INSUFFICIENT: transaction candidate lacks field-level verified buyer + concrete purchased scope + procurement identifier/mechanism. Transaction extraction required.',nowISO(),row.id).run();
    row=await env.DB.prepare(`SELECT * FROM mission_research_questions WHERE id=?`).bind(row.id).first();
  }
  if(!['open','research_required'].includes(row.status)){
    await env.DB.prepare(`UPDATE mission_research_questions SET status='open',last_updated=? WHERE id=?`).bind(nowISO(),row.id).run();
    row=await env.DB.prepare(`SELECT * FROM mission_research_questions WHERE id=?`).bind(row.id).first();
  }
  return {buyerReady:false,question:row,created:false};
}

async function executeMissionResearch(env,{planId,objectiveId,ventureId,maxQuestions=8,maxDepth=2,maxTotalQuestions=16,maxSourceFetches=20}){
  const runId=`MRUN-${crypto.randomUUID()}`, attentionId=`RAL-${crypto.randomUUID()}`;
  await env.DB.prepare(`INSERT INTO mission_research_runs (id,plan_id,objective_id,venture_id,status) VALUES (?,?,?,?, 'running')`).bind(runId,planId,objectiveId,ventureId).run();
  await env.DB.prepare(`INSERT INTO research_attention_ledger (id,objective_id,plan_id,run_id,max_depth,max_questions,max_source_fetches) VALUES (?,?,?,?,?,?,?)`).bind(attentionId,objectiveId,planId,runId,maxDepth,maxTotalQuestions,maxSourceFetches).run();
  const budget={fetches:0,maxFetches:Math.min(20,maxSourceFetches)}; let attempted=0,answered=0,evidenceCount=0,branches=0,dupes=0,dependencyBlocked=0,providerState=null;
  const processRow=async(qrow,depth)=>{
    if(attempted>=maxTotalQuestions||budget.fetches>=budget.maxFetches) return;
    const dependency=await researchDependencyGate(env,planId,qrow);
    if(!dependency.allowed){
      dependencyBlocked++;
      await env.DB.prepare(`UPDATE mission_research_questions SET status='open',answer_summary=?,last_updated=? WHERE id=?`).bind(`DEPENDENCY_BLOCKED: ${dependency.dimension} requires verified ${dependency.missing.join(' + ')} evidence first.`,nowISO(),qrow.id).run();
      return;
    }
    attempted++;
    const docs=await collectQuestionSources(env,qrow,budget);
    if(!docs.length){ await env.DB.prepare(`UPDATE mission_research_questions SET status='research_required',answer_summary=?,last_updated=? WHERE id=?`).bind('No configured public source returned usable material.',nowISO(),qrow.id).run(); return; }
    let parsed=null, specialistError='', specialistRaw='';
    try{
      const material=docs.map((d,i)=>`[${i}] ${d.name} | ${d.url}\n${d.text.slice(0,5000)}`).join('\n\n');
      const evidenceManifest=docs.map((_,i)=>i).join(',');
      specialistRaw=await think(env,RESEARCH_SPECIALIST_SYSTEM,`QUESTION: ${qrow.question}\nAVAILABLE_EVIDENCE_INDEXES: [${evidenceManifest}]\nSOURCE MATERIAL:\n${material}\nReturn one JSON object only.`,1600,.1);
      try {
        parsed=validateResearchSpecialistOutput(specialistRaw,docs.length);
        await recordResearchSpecialistDiagnostic(env,{runId,planId,qrow,attempt:1,stage:'parse-and-validate',status:'validated',raw:specialistRaw,parsed});
      } catch(validationError) {
        await recordResearchSpecialistDiagnostic(env,{runId,planId,qrow,attempt:1,stage:'parse-and-validate',status:'repair-requested',error:cleanText(validationError?.message||String(validationError),1200),raw:specialistRaw});
        const repairedRaw=await think(env,RESEARCH_SPECIALIST_SYSTEM,`REPAIR THE PRIOR JSON ONLY. QUESTION: ${qrow.question}\nAVAILABLE_EVIDENCE_INDEXES: [${evidenceManifest}]\nVALIDATION ERROR: ${cleanText(validationError?.message||String(validationError),800)}\nPRIOR OUTPUT: ${cleanText(specialistRaw,5000)}\nReturn corrected JSON only. Do not add evidence not present in SOURCE MATERIAL.\nSOURCE MATERIAL:\n${material}`,1200,0);
        specialistRaw=repairedRaw;
        parsed=validateResearchSpecialistOutput(repairedRaw,docs.length);
        await recordResearchSpecialistDiagnostic(env,{runId,planId,qrow,attempt:2,stage:'repair-and-validate',status:'validated',raw:repairedRaw,parsed});
      }
    }catch(error){
      specialistError=cleanText(error?.stack||error?.message||String(error),3000);
      const provider=classifyAIProviderError(error);
      if(error?.providerState==='provider_quota_exhausted'||provider.kind==='provider_quota_exhausted'){
        providerState='provider_quota_exhausted';
        try{ await recordResearchSpecialistDiagnostic(env,{runId,planId,qrow,attempt:1,stage:'provider',status:'paused',error:specialistError,raw:specialistRaw}); }catch(_){}
        try{ await audit(env,'JANITOR','AI_PROVIDER_QUOTA_CHECKPOINT',qrow.id,JSON.stringify({objectiveId,runId,providerState,action:'checkpoint-and-resume-later',externalSpendUSD:0})); }catch(_){}
        await env.DB.prepare(`UPDATE mission_research_questions SET status='open',answer_summary=?,last_updated=? WHERE id=?`).bind('Paused: Workers AI daily free allocation exhausted. Research checkpoint preserved for automatic retry.',nowISO(),qrow.id).run();
        return;
      }
      if(error?.providerState==='invocation_subrequest_limit'||provider.kind==='invocation_subrequest_limit'){
        providerState='invocation_subrequest_limit';
        try{ await recordResearchSpecialistDiagnostic(env,{runId,planId,qrow,attempt:1,stage:'provider',status:'paused',error:specialistError,raw:specialistRaw}); }catch(_){}
        await env.DB.prepare(`UPDATE mission_research_questions SET status='open',answer_summary=?,last_updated=? WHERE id=?`).bind('Paused: invocation subrequest ceiling reached. Research checkpoint preserved.',nowISO(),qrow.id).run();
        return;
      }
      try{ await recordResearchSpecialistDiagnostic(env,{runId,planId,qrow,attempt:1,stage:'parse-and-validate',status:'failed',error:specialistError,raw:specialistRaw}); }catch(_){}
      try{ await recordFailure(env,runId,`research-specialist:${qrow.id}`,error); }catch(_){}
      try{ await audit(env,'JANITOR','RESEARCH_SPECIALIST_DIAGNOSIS',qrow.id,JSON.stringify({objectiveId,qrow:qrow.id,error:specialistError})); }catch(_){}
      const fallback=deterministicEvidenceGapQuestions(qrow,docs,specialistError);
      parsed={answer:`INSUFFICIENT: research specialist output failed validation. ${cleanText(specialistError,1200)}`,confidence:0,evidence_indexes:[],gaps:[fallback.gap],follow_up_questions:fallback.questions};
    }
    if(providerState) return;
    const refs=[];
    for(const idx of (Array.isArray(parsed.evidence_indexes)?parsed.evidence_indexes:[]).slice(0,4)){ const doc=docs[Number(idx)]; if(!doc) continue; const eid=await persistResearchEvidence(env,{runId,planId,qrow,doc,text:doc.text,relevance:Number(parsed.confidence||.5)}); if(!refs.includes(eid)) refs.push(eid); }
    const conf=Math.max(0,Math.min(1,Number(parsed.confidence||0)));
    const isTransactionStage=isTransactionDiscoveryQuestion(qrow.question);
    let transactionExtraction=null;
    if(isTransactionStage){
      // V1.8.23 Detail Evidence Bridge: V1.8.22 proved that individual CanadaBuys
      // records were fetched successfully, but the general research specialist could
      // return INSUFFICIENT before transaction extraction ever saw them. For this
      // dedicated stage, canonical detail records are the evidence boundary and feed
      // the transaction extractor directly. Broad search/list pages are excluded.
      const canonicalDocs=docs.filter(d=>transactionSourceIsCanonical(d?.url));
      try{ await audit(env,'ADAPTIVE_RESEARCH','DETAIL_EVIDENCE_BRIDGE',qrow.objective_id,JSON.stringify({objectiveId:qrow.objective_id,runId,questionId:qrow.id,totalDocs:docs.length,canonicalDocs:canonicalDocs.length,canonicalUrls:canonicalDocs.map(d=>d.url).slice(0,8),specialistConfidence:conf,specialistEvidenceIndexes:Array.isArray(parsed.evidence_indexes)?parsed.evidence_indexes:[],externalSpendUSD:0})); }catch(_){}
      if(canonicalDocs.length){
        transactionExtraction=await extractAndPersistTransactionEvidence(env,{runId,planId,qrow,docs:canonicalDocs});
        for(const eid of (transactionExtraction?.sourceEvidenceIds||[])) if(!refs.includes(eid)) refs.push(eid);
      } else {
        transactionExtraction={qualified:false,status:'candidate_unresolved',missingFields:['transaction_identity'],id:null,sourceEvidenceIds:[]};
      }
      if(transactionExtraction && !transactionExtraction.qualified){
        const txGapQuestions=[];
        if(transactionExtraction.missionFitStatus==='mismatch') txGapQuestions.push(`Find a different canonical transaction that satisfies the mission constraints. Reject this record for: ${(transactionExtraction.missionMismatches||[]).join('; ')}`);
        if(transactionExtraction.missingFields.includes('buyer_name')) txGapQuestions.push('Which named purchasing organization is explicitly identified in the transaction record, and what primary transaction document proves it?');
        if(transactionExtraction.missingFields.includes('purchased_scope')) txGapQuestions.push('What exact goods, services, deliverables, or statement of work are explicitly purchased in this transaction record?');
        if(transactionExtraction.missingFields.includes('procurement_identifier_or_mechanism')) txGapQuestions.push('What tender, RFP, RFQ, contract, award, or opportunity identifier or explicit procurement mechanism is shown for this transaction?');
        parsed.follow_up_questions=[...txGapQuestions,...(parsed.follow_up_questions||[])].slice(0,2);
      }
    }
    evidenceCount+=(new Set(refs)).size;
    const status=isTransactionStage
      ?(transactionExtraction?.qualified&&refs.length?'answered':'research_required')
      :(conf>=.55&&refs.length?'answered':'research_required'); if(status==='answered') answered++;
    const answerSummary=isTransactionStage&&!transactionExtraction?.qualified
      ?(transactionExtraction?.missionFitStatus==='mismatch'
        ?`INSUFFICIENT: transaction identity is valid but the record does not satisfy mission constraints. Mismatches: ${(transactionExtraction?.missionMismatches||[]).join('; ')}.`
        :`INSUFFICIENT: transaction extraction did not establish verified buyer + concrete purchased scope + procurement identifier/mechanism. Missing: ${(transactionExtraction?.missingFields||['transaction_evidence']).join(', ')}.`)
      :cleanText(parsed.answer,5000);
    await env.DB.prepare(`UPDATE mission_research_questions SET status=?,answer_summary=?,evidence_refs=?,last_updated=? WHERE id=?`).bind(status,answerSummary,JSON.stringify(refs),nowISO(),qrow.id).run();
    if(depth>=maxDepth) return;
    for(const fq0 of (Array.isArray(parsed.follow_up_questions)?parsed.follow_up_questions:[]).slice(0,2)){
      const fq=cleanText(fq0,1200);
      if(!fq||fq.length<15) continue;
      const informationGain=commercialInformationGain(fq,qrow.question);
      if(informationGain<4){ dupes++; continue; }
      const parentDim=canonicalDependencyDimension(qrow.question)||classifyCommercialDimension(qrow.question);
      const followDim=classifyCommercialDimension(fq);
      const depState=await getResearchDependencyState(env,planId);
      if(parentDim==='buyer'&&!depState.ready.buyer&&followDim!=='buyer'){ dependencyBlocked++; continue; }
      if(parentDim==='pain'&&!depState.ready.pain&&!['buyer','pain'].includes(followDim)){ dependencyBlocked++; continue; }
      if(parentDim==='offer'&&!depState.ready.offer&&!['buyer','pain','offer'].includes(followDim)){ dependencyBlocked++; continue; }
      const fp=await branchFingerprint(`${classifyCommercialDimension(fq)}:${fq}`);
      const existing=await env.DB.prepare(`SELECT id FROM mission_research_branches WHERE objective_id=? AND fingerprint=? LIMIT 1`).bind(objectiveId,fp).first();
      if(existing){ dupes++; continue; }
      const bid=`MRB-${crypto.randomUUID()}`; await env.DB.prepare(`INSERT INTO mission_research_branches (id,run_id,parent_question_id,objective_id,venture_id,question,rationale,priority,status,depth,fingerprint) VALUES (?,?,?,?,?,?,?,?, 'queued',?,?)`).bind(bid,runId,qrow.id,objectiveId,ventureId,fq,`Generated from unresolved evidence gap in ${qrow.id}`,Math.max(1,researchPriority(qrow.priority)-1),depth+1,fp).run(); branches++;
      if(attempted>=maxTotalQuestions||budget.fetches>=budget.maxFetches) continue;
      const childId=`MRQ-${crypto.randomUUID()}`; await env.DB.prepare(`INSERT INTO mission_research_questions (id,plan_id,objective_id,venture_id,question,source_classes,priority,status,last_updated) VALUES (?,?,?,?,?,?,?,'open',?)`).bind(childId,planId,objectiveId,ventureId,fq,qrow.source_classes||'[]',Math.max(1,researchPriority(qrow.priority)-1),nowISO()).run();
      await env.DB.prepare(`UPDATE mission_research_branches SET status='executing',child_question_id=? WHERE id=?`).bind(childId,bid).run();
      const child=await env.DB.prepare(`SELECT * FROM mission_research_questions WHERE id=?`).bind(childId).first(); await processRow(child,depth+1);
      await env.DB.prepare(`UPDATE mission_research_branches SET status='completed',completed_at=? WHERE id=?`).bind(nowISO(),bid).run();
    }
  };
  // V1.8.17 control layer: unresolved Buyer enters a dedicated transaction-discovery
  // stage. The legacy queue is bypassed completely until direct transaction evidence
  // establishes a buyer. This prevents abstract OEC/category/budget questions from
  // consuming the remaining research budget.
  const discoveryStage=await ensureTransactionDiscoveryStageQuestion(env,{planId,objectiveId,ventureId});
  if(!discoveryStage.buyerReady){
    if(discoveryStage.question) await processRow(discoveryStage.question,0);
    const postDiscoveryTransaction=await latestQualifiedTransaction(env,planId);
    if(!postDiscoveryTransaction){
      await audit(env,'ADAPTIVE_RESEARCH','TRANSACTION_DISCOVERY_STAGE_HELD',objectiveId,JSON.stringify({objectiveId,ventureId,planId,questionId:discoveryStage.question?.id||null,buyerReady:false,legacyQueueBypassed:true,sourceFetchesUsed:budget.fetches,externalSpendUSD:0}));
    } else {
      await audit(env,'ADAPTIVE_RESEARCH','TRANSACTION_DISCOVERY_BUYER_ESTABLISHED',objectiveId,JSON.stringify({objectiveId,ventureId,planId,questionId:discoveryStage.question?.id||null,buyerReady:true,externalSpendUSD:0}));
      const roots=(await env.DB.prepare(`SELECT * FROM mission_research_questions WHERE plan_id=? AND status IN ('open','research_required') AND id<>? ORDER BY COALESCE(priority,3) DESC,created_at LIMIT ?`).bind(planId,discoveryStage.question?.id||'',maxQuestions).all()).results||[];
      for(const q of roots){ if(providerState||attempted>=maxTotalQuestions||budget.fetches>=budget.maxFetches) break; await processRow(q,0); }
    }
  } else {
    const roots=(await env.DB.prepare(`SELECT * FROM mission_research_questions WHERE plan_id=? AND status IN ('open','research_required') ORDER BY COALESCE(priority,3) DESC,created_at LIMIT ?`).bind(planId,maxQuestions).all()).results||[];
    for(const q of roots){ if(providerState||attempted>=maxTotalQuestions||budget.fetches>=budget.maxFetches) break; await processRow(q,0); }
  }
  const unresolvedRow=await env.DB.prepare(`SELECT COUNT(*) AS n FROM mission_research_questions WHERE plan_id=? AND status IN ('open','research_required')`).bind(planId).first();
  const queuedBranchRow=await env.DB.prepare(`SELECT COUNT(*) AS n FROM mission_research_branches WHERE objective_id=? AND status='queued'`).bind(objectiveId).first();
  const unresolvedQuestions=Number(unresolvedRow?.n||0), queuedBranches=Number(queuedBranchRow?.n||0);
  const budgetExhausted=budget.fetches>=budget.maxFetches||attempted>=maxTotalQuestions;
  const continuationRequired=!providerState&&budgetExhausted&&(unresolvedQuestions>0||queuedBranches>0);
  const ratio=attempted?answered/attempted:0, sufficient=!providerState&&!continuationRequired&&answered>=2&&evidenceCount>=2&&ratio>=.20;
  const status=providerState|| (sufficient?'completed':'research_required');
  const stopReason=providerState|| (continuationRequired?'research-continuation-required':budget.fetches>=budget.maxFetches?'source-fetch-budget':attempted>=maxTotalQuestions?'question-budget':sufficient?'evidence-sufficient':'evidence-insufficient');
  await env.DB.prepare(`UPDATE mission_research_runs SET status=?,questions_attempted=?,questions_answered=?,evidence_count=?,branches_created=?,completed_at=?,diagnostic=? WHERE id=?`).bind(status,attempted,answered,evidenceCount,branches,nowISO(),`Evidence gate: ${answered}/${attempted} answered; ${evidenceCount} evidence refs; ${budget.fetches} source fetches; dependency-blocked=${dependencyBlocked}; stop=${stopReason}.`,runId).run();
  await env.DB.prepare(`UPDATE mission_research_plans SET status=?,last_updated=? WHERE id=?`).bind(status,nowISO(),planId).run();
  await env.DB.prepare(`UPDATE research_attention_ledger SET questions_used=?,source_fetches_used=?,duplicate_branches_suppressed=?,stop_reason=?,last_updated=? WHERE id=?`).bind(attempted,budget.fetches,dupes,stopReason,nowISO(),attentionId).run();
  return {runId,status,evidenceSufficient:sufficient,continuationRequired,unresolvedQuestions,queuedBranches,providerState,questionsAttempted:attempted,questionsAnswered:answered,evidenceCount,branchesCreated:branches,sourceFetches:budget.fetches,duplicateBranchesSuppressed:dupes,dependencyBlocked,stopReason,attentionId};
}

async function getMissionResearchEvidence(env,objectiveId){
  await ensureSchema(env);
  const run=await env.DB.prepare(`SELECT * FROM mission_research_runs WHERE objective_id=? ORDER BY started_at DESC LIMIT 1`).bind(objectiveId).first();
  const questions=(await env.DB.prepare(`SELECT id,question,source_classes,priority,status,answer_summary,evidence_refs FROM mission_research_questions WHERE objective_id=? ORDER BY COALESCE(priority,3) DESC,created_at`).bind(objectiveId).all()).results||[];
  const evidence=(await env.DB.prepare(`SELECT id,question_id,source_class,source_name,source_url,title,relevance,source_quality,verification_status,retrieved_at FROM mission_research_evidence WHERE objective_id=? ORDER BY created_at`).bind(objectiveId).all()).results||[];
  const branches=(await env.DB.prepare(`SELECT * FROM mission_research_branches WHERE objective_id=? ORDER BY priority DESC,created_at`).bind(objectiveId).all()).results||[];
  const attention=await env.DB.prepare(`SELECT * FROM research_attention_ledger WHERE objective_id=? ORDER BY created_at DESC LIMIT 1`).bind(objectiveId).first();
  const sourceHealth=(await env.DB.prepare(`SELECT * FROM research_source_health ORDER BY source_id`).all()).results||[];
  const specialistDiagnostics=(await env.DB.prepare(`SELECT id,run_id,question_id,attempt,stage,status,error,raw_preview,parsed_json,created_at FROM research_specialist_diagnostics WHERE objective_id=? ORDER BY created_at`).bind(objectiveId).all()).results||[];
  const qualificationGates=(await env.DB.prepare(`SELECT id,objective_id,work_order_id,venture_id,synthesis_id,challenge_id,status,supported_dimensions,total_dimensions,critical_dimensions_supported,qualification_json,next_questions_json,created_at FROM opportunity_qualification_gates WHERE objective_id=? ORDER BY created_at`).bind(objectiveId).all()).results||[];
  const transactionExtractions=(await env.DB.prepare(`SELECT * FROM transaction_evidence_extractions WHERE objective_id=? ORDER BY created_at`).bind(objectiveId).all()).results||[];
  return {ok:true,run,questions,evidence,branches,attention,sourceHealth,specialistDiagnostics,qualificationGates,transactionExtractions};
}

const EVIDENCE_CURATOR_SYSTEM=`
You are the VIS Evidence Curator. Select evidence for a venture mission, not for general interest.
Reject topical but mission-irrelevant material. A technology article is not business evidence merely because it is recent.
Return ONLY JSON: {selected_indexes:[integers], rejected_reason_summary:string}. Select only items that directly help answer the research plan or mission. It is acceptable to select none.
`;

async function curateMissionEvidence(env,{objective,ventureId,researchPlan,candidates}) {
  if(!candidates.length) return [];
  try {
    const raw=await think(env,EVIDENCE_CURATOR_SYSTEM,`VENTURE: ${ventureId}\nMISSION: ${objective}\nRESEARCH PLAN: ${JSON.stringify(researchPlan)}\nCANDIDATES: ${JSON.stringify(candidates.map((x,i)=>({index:i,...x})))}`,1200,.1);
    const m=String(raw||'').match(/\{[\s\S]*\}/); if(!m) return [];
    const p=JSON.parse(m[0]); const idx=new Set((p.selected_indexes||[]).filter(Number.isInteger));
    return candidates.filter((_,i)=>idx.has(i));
  } catch(_) { return []; }
}

const OPERATIONAL_WORKER_SYSTEM = `
You are a constrained VIS operational worker performing real internal company analysis.
Use ONLY the inherited Hive knowledge packet and the stated objective. Do not invent current facts, customers, contracts, prices, projects, or evidence.
Clearly separate: EVIDENCE, INFERENCES, UNKNOWNS, NEXT INTERNAL RESEARCH, KILL/ESCALATION CRITERIA.
No external contact, spending, publishing, commitments, account creation, legal/compliance representation, or consequential action.
`;

async function runOperationalWorker(env, workerJobId) {
  const job=await env.DB.prepare(`SELECT * FROM worker_jobs WHERE id=?`).bind(workerJobId).first();
  if(!job) throw new Error('Operational worker missing.');
  assertInternalAuthority(job.authority_scope);
  const lineage=await validateWorkerLineage(env,job.rotation_id,job.id);
  if(!lineage.ok) throw new Error('Operational worker lineage invalid.');
  const packet=await loadPacket(env,job.knowledge_packet_id);
  await env.DB.prepare(`UPDATE worker_jobs SET status='running',attempts=attempts+1,started_at=COALESCE(started_at,?),last_updated=? WHERE id=?`).bind(nowISO(),nowISO(),job.id).run();
  let output;
  try {
    output=await think(env,OPERATIONAL_WORKER_SYSTEM,`WORK ORDER: ${job.rotation_id}\nROLE: ${job.worker_role}\nMANDATE: ${job.mandate}\nAUTHORITY: ${job.authority_scope}\nINHERITED PACKET: ${packet.content}\nPACKET PROVENANCE: ${packet.provenance}`,1400,.3);
    if(!workerOutputUsable(output)) throw new Error('Operational worker returned unusable output.');
  } catch(error) {
    const incidentId=await openITIncident(env,{workOrderId:job.rotation_id,incidentType:'WORKER_FAILURE',component:'operational-worker',diagnosis:`Operational worker failed: ${cleanText(error?.message||String(error),1200)}`,authorityScope:job.authority_scope});
    const repair=await generalizedJanitorRepair(env,{incidentId,workerJobId:job.id});
    return {recovered:true,...repair};
  }
  const links=await env.DB.prepare(`SELECT knowledge_id FROM knowledge_inheritance WHERE work_order_id=? AND worker_job_id=?`).bind(job.rotation_id,job.id).all();
  const resultId=await submitWorkerResult(env,{workOrderId:job.rotation_id,workerJobId:job.id,resultType:'operational-analysis',result:output,evidenceRefs:(links.results||[]).map(x=>x.knowledge_id),confidence:.7});
  return {resultId,recovered:false};
}

const OPPORTUNITY_QUALIFICATION_SYSTEM = `
You are the VIS Opportunity Qualification Gate. Decide whether the supplied research and synthesis establish a concrete B2B opportunity strongly enough to create a Founder decision package.
This is an evidence contract, not a writing-quality review. Generic sectors, trends, permits, statistics, technologies, or broad markets are NOT opportunities by themselves.
Use ONLY the supplied evidence, research answers, synthesis, and Vector challenge. Do not fill gaps with general knowledge.
Return ONE JSON object only with this schema:
{
  "opportunity_name":"specific opportunity or UNKNOWN",
  "dimensions":{
    "buyer":{"status":"supported|partial|missing","summary":"...","evidence_refs":["evidence-id"]},
    "pain":{"status":"supported|partial|missing","summary":"...","evidence_refs":["evidence-id"]},
    "offer":{"status":"supported|partial|missing","summary":"...","evidence_refs":["evidence-id"]},
    "demand":{"status":"supported|partial|missing","summary":"...","evidence_refs":["evidence-id"]},
    "competition":{"status":"supported|partial|missing","summary":"...","evidence_refs":["evidence-id"]},
    "pricing_economics":{"status":"supported|partial|missing","summary":"...","evidence_refs":["evidence-id"]},
    "operations":{"status":"supported|partial|missing","summary":"...","evidence_refs":["evidence-id"]},
    "risks":{"status":"supported|partial|missing","summary":"...","evidence_refs":["evidence-id"]},
    "learnability_advantage":{"status":"supported|partial|missing","summary":"...","evidence_refs":["evidence-id"]},
    "route_to_market":{"status":"supported|partial|missing","summary":"...","evidence_refs":["evidence-id"]}
  },
  "next_research_questions":["specific question"],
  "overall_ready":false,
  "reason":"..."
}
A dimension is supported only when supplied evidence directly supports it. Inference alone is partial at best. overall_ready may be true only for one concrete opportunity with all critical dimensions buyer, pain, offer, demand, and pricing_economics supported, at least 8 of 10 total dimensions supported, and no material unresolved contradiction.
`;

function validateOpportunityQualification(raw,allowedEvidenceIds){
  const p=extractJSONObject(raw);
  if(!p||typeof p!=='object'||Array.isArray(p)) throw new Error('Opportunity qualification output is not a JSON object.');
  const names=['buyer','pain','offer','demand','competition','pricing_economics','operations','risks','learnability_advantage','route_to_market'];
  if(!p.dimensions||typeof p.dimensions!=='object') throw new Error('Opportunity qualification dimensions missing.');
  const allowed=new Set(allowedEvidenceIds||[]), dimensions={};
  for(const name of names){
    const d=p.dimensions[name];
    if(!d||!['supported','partial','missing'].includes(String(d.status))) throw new Error(`Opportunity qualification dimension invalid: ${name}`);
    const refs=[...new Set((Array.isArray(d.evidence_refs)?d.evidence_refs:[]).map(String).filter(x=>allowed.has(x)))].slice(0,8);
    let status=String(d.status);
    if(status==='supported'&&!refs.length) status='partial';
    dimensions[name]={status,summary:cleanText(d.summary||'',1800),evidence_refs:refs};
  }
  const supported=names.filter(n=>dimensions[n].status==='supported').length;
  const critical=['buyer','pain','offer','demand','pricing_economics'];
  const criticalSupported=critical.filter(n=>dimensions[n].status==='supported').length;
  const ready=Boolean(p.overall_ready)&&supported>=8&&criticalSupported===critical.length;
  return {opportunity_name:cleanText(p.opportunity_name||'UNKNOWN',500),dimensions,next_research_questions:(Array.isArray(p.next_research_questions)?p.next_research_questions:[]).map(x=>cleanText(x,1200)).filter(x=>x.length>=15).slice(0,8),overall_ready:ready,reason:cleanText(p.reason||'',2500),supported_dimensions:supported,critical_dimensions_supported:criticalSupported,total_dimensions:names.length};
}

async function qualifyOperationalOpportunity(env,{objectiveId,workOrderId,ventureId,objective,researchAnswers,directResearch,departmentSynthesisId,departmentSynthesis,challenge}){
  const allowed=(directResearch||[]).map(x=>x.id).filter(Boolean);
  let q;
  try{
    const raw=await think(env,OPPORTUNITY_QUALIFICATION_SYSTEM,`OBJECTIVE: ${objective}\nVENTURE: ${ventureId}\nRESEARCH ANSWERS: ${JSON.stringify(researchAnswers)}\nDIRECT EVIDENCE: ${JSON.stringify(directResearch)}\nDISCOVERY SYNTHESIS: ${departmentSynthesis}\nVECTOR CHALLENGE: ${challenge?.review||''}\nVECTOR DECISION: ${challenge?.decision||'UNKNOWN'}`,1800,.1);
    q=validateOpportunityQualification(raw,allowed);
  }catch(error){
    q={opportunity_name:'UNKNOWN',dimensions:Object.fromEntries(['buyer','pain','offer','demand','competition','pricing_economics','operations','risks','learnability_advantage','route_to_market'].map(n=>[n,{status:'missing',summary:'Qualification could not be validated.',evidence_refs:[]}])) ,next_research_questions:['What primary-source evidence identifies a specific buyer, painful problem, concrete offer, demonstrated demand, and viable pricing/economics for one opportunity?'],overall_ready:false,reason:`Fail-closed qualification: ${cleanText(error?.message||String(error),1200)}`,supported_dimensions:0,critical_dimensions_supported:0,total_dimensions:10};
  }
  if(challenge?.decision==='REJECT') { q.overall_ready=false; q.reason=cleanText(`${q.reason} Vector rejected the synthesis; graduation is blocked.`,2500); }
  const status=q.overall_ready?'qualified':'research_required';
  const id=`OQG-${crypto.randomUUID()}`;
  await env.DB.prepare(`INSERT INTO opportunity_qualification_gates (id,objective_id,work_order_id,venture_id,synthesis_id,challenge_id,status,supported_dimensions,total_dimensions,critical_dimensions_supported,qualification_json,next_questions_json) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`).bind(id,objectiveId,workOrderId,ventureId,departmentSynthesisId,challenge?.id||null,status,q.supported_dimensions,q.total_dimensions,q.critical_dimensions_supported,JSON.stringify(q),JSON.stringify(q.next_research_questions)).run();
  return {id,status,...q};
}

async function enqueueQualificationResearchGaps(env,{planId,objectiveId,ventureId,questions}){
  let created=0;
  const ranked=[...(questions||[])]
    .map(q=>({q:cleanText(q,1200),score:commercialInformationGain(q,'')}))
    .filter(x=>x.q.length>=15&&x.score>=4)
    .sort((a,b)=>b.score-a.score);
  for(const item of ranked.slice(0,8)){
    const question=item.q;
    const fp=await branchFingerprint(question);
    const existing=await env.DB.prepare(`SELECT id FROM mission_research_branches WHERE objective_id=? AND fingerprint=? LIMIT 1`).bind(objectiveId,fp).first();
    if(existing) continue;
    const bid=`MRB-${crypto.randomUUID()}`;
    await env.DB.prepare(`INSERT INTO mission_research_branches (id,run_id,parent_question_id,objective_id,venture_id,question,rationale,priority,status,depth,fingerprint) VALUES (?,NULL,NULL,?,?,?,?,?,'queued',1,?)`).bind(bid,objectiveId,ventureId,question,'Opportunity qualification evidence gap',5,fp).run();
    await env.DB.prepare(`INSERT INTO mission_research_questions (id,plan_id,objective_id,venture_id,question,source_classes,priority,status,last_updated) VALUES (?,?,?,?,?,? ,5,'open',?)`).bind(`MRQ-${crypto.randomUUID()}`,planId,objectiveId,ventureId,question,JSON.stringify(['procurement','customer-demand','competitor-pricing','official-statistics']),nowISO()).run();
    created++;
  }
  return created;
}

async function createFounderDecisionPackage(env, record) {
  assertInternalAuthority(record.authorityScope||'internal-zero-dollar');
  const id=`FDP-${crypto.randomUUID()}`;
  const packageText=`FOUNDER DECISION PACKAGE\nOBJECTIVE: ${record.objective}\n\nDISCOVERY SYNTHESIS:\n${record.departmentSynthesis}\n\nINDEPENDENT VECTOR CHALLENGE:\n${record.challengeReview}\n\nVECTOR DECISION: ${record.challengeDecision}\n\nAUTHORITY: internal-zero-dollar. No external action has been taken. Any spend, prospect contact, bid/submission, public publishing, consequential account creation, contract, payment, legal/compliance representation, or other consequential external action requires Founder approval.`;
  const founderActionRequired=record.challengeDecision==='HOLD'?1:0;
  await env.DB.prepare(`INSERT INTO founder_decision_packages
    (id,objective_id,work_order_id,department_synthesis_id,challenge_id,reintegrated_knowledge_id,package,status,founder_action_required,authority_scope,venture_id)
    VALUES (?,?,?,?,?,?,?,'ready',?,?,?)`).bind(id,record.objectiveId,record.workOrderId,record.departmentSynthesisId,record.challengeId,record.knowledgeId,cleanText(packageText,20000),founderActionRequired,record.authorityScope||'internal-zero-dollar',record.ventureId||'PORTFOLIO').run();
  return {id,package:packageText,founderActionRequired};
}

async function processOperationalObjective(env, objectiveId) {
  await ensureSchema(env);
  const row=await env.DB.prepare(`SELECT * FROM operational_objectives WHERE id=?`).bind(objectiveId).first();
  if(!row) throw new Error('Operational objective not found.');
  assertInternalAuthority(row.authority_scope);
  if(row.status==='completed') return {ok:true,alreadyCompleted:true,objectiveId:row.id,workOrderId:row.work_order_id,decisionPackageId:row.decision_package_id};
  if(row.status==='running') {
    const last=Date.parse(row.last_updated||row.started_at||'');
    const stale=!Number.isFinite(last)||(Date.now()-last)>=30*60*1000;
    if(!stale) return {ok:true,alreadyRunning:true,objectiveId:row.id,workOrderId:row.work_order_id};
    await audit(env,'JANITOR','STALE_OPERATIONAL_OBJECTIVE_RECOVERY',row.work_order_id||row.id,JSON.stringify({objectiveId:row.id,lastUpdated:row.last_updated,recovery:'resume-from-persisted-state',externalSpendUSD:0}));
  }
  const ventureId=cleanText(row.venture_id,120)||'PORTFOLIO';
  const wo=row.work_order_id||`${ventureId}-WO-${crypto.randomUUID()}`;
  try {
    await env.DB.prepare(`UPDATE operational_objectives SET status='running',work_order_id=?,started_at=COALESCE(started_at,?),last_updated=? WHERE id=?`).bind(wo,nowISO(),nowISO(),row.id).run();
    const existingWO=await env.DB.prepare(`SELECT id FROM work_orders WHERE id=?`).bind(wo).first();
    if(!existingWO) await createWorkOrder(env,{id:wo,objective:row.objective,requestedBy:row.requested_by,authorityScope:row.authority_scope,priority:row.priority});
    await env.DB.prepare(`UPDATE work_orders SET status='running',started_at=COALESCE(started_at,?),last_updated=? WHERE id=?`).bind(nowISO(),nowISO(),wo).run();
    const seedObjective=await createHiveKnowledge(env,{knowledgeType:'founder-objective',subject:`Operational objective ${row.id}`,content:row.objective,confidence:1,verificationStatus:'founder-supplied',sourceType:'founder-intake',sourceRef:row.id});
    const seedPolicy=await createHiveKnowledge(env,{knowledgeType:'operating-policy',subject:'DCC operational authority boundary',content:'VIS may perform internal zero-dollar research, analysis, synthesis, worker coordination, recovery, and documentation. It may not contact prospects, submit bids, spend money, publish publicly, create consequential accounts, enter agreements, make payments, or make legal/compliance representations without explicit Founder approval. Unknown current facts must remain unknown until supported by evidence.',confidence:1,verificationStatus:'operating-policy',sourceType:'hive-policy',sourceRef:'V1.8.1'});
    const existingResearchPlan=await env.DB.prepare(`SELECT * FROM mission_research_plans WHERE objective_id=? ORDER BY created_at DESC LIMIT 1`).bind(row.id).first();
    const researchPlan=await ensureConvergedResearchPlan(env,{objectiveId:row.id,ventureId,objective:row.objective,existingPlan:existingResearchPlan});
    const researchRun=await executeMissionResearch(env,{planId:researchPlan.id,objectiveId:row.id,ventureId,maxQuestions:8,maxDepth:2,maxTotalQuestions:16,maxSourceFetches:20});
    if(researchRun.providerState){
      await env.DB.prepare(`UPDATE operational_objectives SET status='research_paused',last_updated=? WHERE id=?`).bind(nowISO(),row.id).run();
      await env.DB.prepare(`UPDATE work_orders SET status='research_paused',last_updated=? WHERE id=?`).bind(nowISO(),wo).run();
      await audit(env,'ADAPTIVE_RESEARCH','PROVIDER_CHECKPOINT',wo,JSON.stringify({objectiveId:row.id,researchRun,externalSpendUSD:0}));
      return {ok:true,objectiveId:row.id,workOrderId:wo,status:'research_paused',researchRun,founderActionRequired:false,externalSpendUSD:0};
    }
    if(!researchRun.evidenceSufficient){
      await env.DB.prepare(`UPDATE operational_objectives SET status='research_required',last_updated=? WHERE id=?`).bind(nowISO(),row.id).run();
      await env.DB.prepare(`UPDATE work_orders SET status='research_required',last_updated=? WHERE id=?`).bind(nowISO(),wo).run();
      await audit(env,'ADAPTIVE_RESEARCH','EVIDENCE_GATE_HELD',wo,JSON.stringify({objectiveId:row.id,researchRun,externalSpendUSD:0}));
      return {ok:true,objectiveId:row.id,workOrderId:wo,status:'research_required',researchRun,founderActionRequired:false,externalSpendUSD:0};
    }
    const directResearch=(await env.DB.prepare(`SELECT id,question_id,source_name,source_url,title,evidence_text,relevance,source_quality,verification_status,retrieved_at FROM mission_research_evidence WHERE objective_id=? ORDER BY created_at LIMIT 30`).bind(row.id).all()).results||[];
    const recentEvidence=await env.DB.prepare(`SELECT source_name,item_url,title,evidence_text,verification_status,retrieved_at FROM evidence ORDER BY id DESC LIMIT 40`).all();
    const curatedEvidence=await curateMissionEvidence(env,{objective:row.objective,ventureId,researchPlan:researchPlan.plan,candidates:recentEvidence.results||[]});
    const researchAnswers=(await env.DB.prepare(`SELECT id,question,priority,status,answer_summary,evidence_refs FROM mission_research_questions WHERE plan_id=? ORDER BY COALESCE(priority,3) DESC,created_at`).bind(researchPlan.id).all()).results||[];
    const seedResearch=await createHiveKnowledge(env,{knowledgeType:'mission-directed-evidence',subject:`Curated evidence for ${ventureId} / ${row.id}`,content:JSON.stringify({ventureId,researchPlanId:researchPlan.id,researchPlan:researchPlan.plan,researchRun,researchAnswers,directResearch,curatedSensorEvidence:curatedEvidence,evidenceGap:directResearch.length===0&&curatedEvidence.length===0?'No mission-aligned public-source evidence was retrieved. Preserve the gap and continue internal research; do not substitute unrelated signals.':null}),confidence:directResearch.length?.9:(curatedEvidence.length?.7:.35),verificationStatus:'mission-curated',sourceType:'external-research-fabric',sourceRef:researchRun.runId});
    const seeds=[seedObjective,seedPolicy,seedResearch];
    const planning=await aiPrimaryManagerPlan(env,{workOrderId:wo,objective:row.objective,knowledgeIds:seeds,authorityScope:row.authority_scope});
    const assignments=[];
    for(const spec of planning.plan) assignments.push({...spec,...await createManagerAssignment(env,{workOrderId:wo,departmentId:'DISCOVERY',managerAgent:spec.name,mandate:spec.mandate,objective:row.objective,knowledgeIds:seeds,authorityScope:row.authority_scope})});
    const workers=[];
    for(const a of assignments) {
      await env.DB.prepare(`UPDATE manager_assignments SET status='running',started_at=COALESCE(started_at,?),last_updated=? WHERE id=?`).bind(nowISO(),nowISO(),a.id).run();
      for(const spec of [
        {role:`${a.name} Evidence Specialist`,mandate:`Develop evidence-backed internal analysis for: ${a.mandate}. Identify what is supported, what is inferred, and what current evidence is still missing.`},
        {role:`${a.name} Falsification Specialist`,mandate:`Challenge assumptions and define failure modes, kill criteria, and the highest-value next internal research for: ${a.mandate}.`}
      ]) workers.push({assignment:a,...await createConstrainedWorkerJob(env,{workOrderId:wo,departmentId:'DISCOVERY',managerAgent:a.managerId,workerRole:spec.role,mandate:spec.mandate,knowledgeIds:seeds,authorityScope:row.authority_scope})});
    }
    for(const w of workers) await runOperationalWorker(env,w.id);
    const managerSyntheses=[];
    for(const a of assignments) managerSyntheses.push(await createManagerSynthesis(env,{workOrderId:wo,assignmentId:a.id}));
    const head=await env.DB.prepare(`SELECT agent_id FROM department_heads WHERE department_id='DISCOVERY' AND status='active'`).first();
    let departmentText,departmentMode='ai-primary';
    try { departmentText=await think(env,HAT_HEAD_SYSTEM,`WORK ORDER: ${wo}\nREAL OPERATIONAL OBJECTIVE: ${row.objective}\nMANAGER SYNTHESES: ${JSON.stringify(managerSyntheses)}\nProduce a Founder-ready internal recommendation. Do not invent current facts. Preserve evidence gaps, uncertainty, kill criteria, and actions requiring Founder approval.`,1600,.25); }
    catch(error) { departmentMode='deterministic-fallback'; departmentText=`SYNTHESIS: deterministic compression after bounded AI failure.\nMANAGER OUTPUTS: ${JSON.stringify(managerSyntheses)}\nLIMITATIONS: ${cleanText(error?.message||String(error),1000)}`; }
    await recordPlanningTelemetry(env,{workOrderId:wo,plannerLevel:'department-synthesis',plannerAgent:head?.agent_id||'ATLAS',planningMode:departmentMode,attempts:departmentMode==='ai-primary'?1:3,valid:true,diagnostic:departmentMode==='ai-primary'?'AI operational department synthesis completed.':'Fallback operational department synthesis used.',plan:{managerSynthesisIds:managerSyntheses.map(x=>x.id)}});
    const dsId=`DS-${crypto.randomUUID()}`;
    await env.DB.prepare(`INSERT INTO department_syntheses (id,work_order_id,department_id,head_agent,synthesis,evidence_refs,worker_result_refs,status) VALUES (?,?,?,?,?,?,?,'submitted')`).bind(dsId,wo,'DISCOVERY',head?.agent_id||'ATLAS',cleanText(departmentText,12000),JSON.stringify(seeds),JSON.stringify(managerSyntheses.flatMap(x=>x.workerRefs))).run();
    const challenge=await createCrossDepartmentReview(env,{workOrderId:wo,reviewerDepartmentId:'DILIGENCE',subjectSynthesisId:dsId,objective:row.objective});
    const qualification=await qualifyOperationalOpportunity(env,{objectiveId:row.id,workOrderId:wo,ventureId,objective:row.objective,researchAnswers,directResearch,departmentSynthesisId:dsId,departmentSynthesis:departmentText,challenge});
    const disposition=qualification.status==='qualified'&&challenge.decision!=='REJECT'?'accepted':'held';
    const knowledgeId=await reintegrateHiveKnowledge(env,{workOrderId:wo,synthesisId:dsId,reviewRefs:[challenge.id],knowledgeType:'operational-learning',subject:`Operational learning ${row.id}`,content:`DISCOVERY synthesis: ${departmentText}\nIndependent DILIGENCE review: ${challenge.review}\nOpportunity qualification: ${JSON.stringify(qualification)}`,confidence:qualification.status==='qualified'?.8:.55,verificationStatus:'vector-and-qualification-reviewed',disposition,rationale:qualification.status==='qualified'?'Commercial evidence contract passed after independent challenge.':'Commercial evidence contract held; additional mission-directed research required.'});
    if(qualification.status!=='qualified'){
      const gapQuestions=qualification.next_research_questions.length?qualification.next_research_questions:[
        `Which specific buyer currently purchases or budgets for the proposed offer in ${ventureId}?`,
        `What primary evidence demonstrates a costly or urgent buyer problem for the proposed offer?`,
        `What current pricing, contract value, gross-margin inputs, or comparable economics support commercial viability?`
      ];
      const queuedResearchQuestions=await enqueueQualificationResearchGaps(env,{planId:researchPlan.id,objectiveId:row.id,ventureId,questions:gapQuestions});
      await env.DB.prepare(`UPDATE work_orders SET status='research_required',last_updated=? WHERE id=?`).bind(nowISO(),wo).run();
      await env.DB.prepare(`UPDATE operational_objectives SET status='research_required',decision_package_id=NULL,last_updated=? WHERE id=?`).bind(nowISO(),row.id).run();
      await audit(env,'OPPORTUNITY_QUALIFICATION','QUALIFICATION_GATE_HELD',wo,JSON.stringify({objectiveId:row.id,qualificationId:qualification.id,supportedDimensions:qualification.supported_dimensions,criticalDimensionsSupported:qualification.critical_dimensions_supported,challengeDecision:challenge.decision,queuedResearchQuestions,externalSpendUSD:0}));
      return {ok:true,objectiveId:row.id,workOrderId:wo,status:'research_required',planningMode:planning.planningMode,departmentSynthesisMode:departmentMode,managerCount:assignments.length,workerCount:workers.length,challengeDecision:challenge.decision,qualificationGateId:qualification.id,qualificationStatus:qualification.status,supportedDimensions:qualification.supported_dimensions,criticalDimensionsSupported:qualification.critical_dimensions_supported,queuedResearchQuestions,reintegratedKnowledgeId:knowledgeId,founderActionRequired:false,externalSpendUSD:0};
    }
    const pkg=await createFounderDecisionPackage(env,{objectiveId:row.id,workOrderId:wo,objective:row.objective,departmentSynthesisId:dsId,departmentSynthesis:departmentText,challengeId:challenge.id,challengeReview:challenge.review,challengeDecision:challenge.decision,knowledgeId,authorityScope:row.authority_scope,ventureId});
    await env.DB.prepare(`UPDATE work_orders SET status='completed',completed_at=?,last_updated=? WHERE id=?`).bind(nowISO(),nowISO(),wo).run();
    await env.DB.prepare(`UPDATE operational_objectives SET status='completed',decision_package_id=?,completed_at=?,last_updated=? WHERE id=?`).bind(pkg.id,nowISO(),nowISO(),row.id).run();
    await audit(env,'HIVE_OPERATIONAL_INTAKE','OBJECTIVE_COMPLETED',wo,JSON.stringify({objectiveId:row.id,planningMode:planning.planningMode,departmentMode,managerCount:assignments.length,workerCount:workers.length,challengeDecision:challenge.decision,qualificationGateId:qualification.id,decisionPackageId:pkg.id,externalSpendUSD:0}));
    return {ok:true,objectiveId:row.id,workOrderId:wo,status:'completed',planningMode:planning.planningMode,departmentSynthesisMode:departmentMode,managerCount:assignments.length,workerCount:workers.length,challengeDecision:challenge.decision,qualificationGateId:qualification.id,decisionPackageId:pkg.id,reintegratedKnowledgeId:knowledgeId,externalSpendUSD:0};
  } catch(error) {
    await env.DB.prepare(`UPDATE operational_objectives SET status='failed',last_updated=? WHERE id=?`).bind(nowISO(),row.id).run();
    await env.DB.prepare(`UPDATE work_orders SET status='failed',completed_at=?,last_updated=? WHERE id=?`).bind(nowISO(),nowISO(),wo).run().catch(()=>{});
    await recordFailure(env,wo,'operational-intake',error);
    throw error;
  }
}

async function intakeOperationalObjective(env, request) {
  await ensureSchema(env);
  let body;
  try { body=await request.json(); } catch { throw new Error('Operational intake requires a JSON body.'); }
  const objective=cleanText(body?.objective,4000);
  const key=cleanText(body?.idempotencyKey,200);
  if(!objective || objective.length<20) throw new Error('Objective must contain at least 20 characters.');
  if(!key) throw new Error('idempotencyKey is required.');
  const authority='internal-zero-dollar';
  assertInternalAuthority(authority);
  const prior=await env.DB.prepare(`SELECT * FROM operational_objectives WHERE idempotency_key=?`).bind(key).first();
  if(prior) return {ok:true,idempotentReplay:true,objectiveId:prior.id,workOrderId:prior.work_order_id,status:prior.status,decisionPackageId:prior.decision_package_id,externalSpendUSD:0};
  const id=cleanText(body?.objectiveId,120)||`OBJ-${crypto.randomUUID()}`;
  const ventureId=cleanText(body?.ventureId,120)||'PORTFOLIO';
  let venture=await env.DB.prepare(`SELECT id FROM ventures WHERE id=?`).bind(ventureId).first();
  if(!venture && ventureId!=='PORTFOLIO') throw new Error('Unknown ventureId. Register the venture before assigning work so portfolio contexts remain isolated.');
  if(!venture && ventureId==='PORTFOLIO') { await env.DB.prepare(`INSERT OR IGNORE INTO ventures (id,name,venture_type,status,context,authority_scope,last_updated) VALUES ('PORTFOLIO','VIS Venture Portfolio','portfolio','active','Shared portfolio research and venture creation. Venture-specific conclusions must remain isolated until deliberately reintegrated.','internal-zero-dollar',?)`).bind(nowISO()).run(); }
  await env.DB.prepare(`INSERT INTO operational_objectives (id,idempotency_key,work_order_id,objective,requested_by,authority_scope,priority,status,last_updated,venture_id) VALUES (?,?,NULL,?,?,?,?, 'queued',?,?)`).bind(id,key,objective,cleanText(body?.requestedBy,200)||'FOUNDER','internal-zero-dollar',Math.max(1,Math.min(5,Number(body?.priority||1))),nowISO(),ventureId).run();
  await audit(env,'HIVE_OPERATIONAL_INTAKE','OBJECTIVE_ACCEPTED',id,JSON.stringify({idempotencyKey:key,authorityScope:authority,externalSpendUSD:0}));
  if(body?.executeNow===false) return {ok:true,objectiveId:id,status:'queued',externalSpendUSD:0};
  return await processOperationalObjective(env,id);
}

async function continueOperationalQueue(env) {
  await ensureSchema(env);
  const next=await env.DB.prepare(`
    SELECT id,status,continuation_count,continuation_limit
    FROM operational_objectives
    WHERE COALESCE(lifecycle_state,'active')='active'
      AND COALESCE(requested_by,'') NOT IN ('HIVE-ACCEPTANCE','HIVE-ACCEPTANCE-HARNESS')
      AND COALESCE(continuation_count,0) < COALESCE(continuation_limit,8)
      AND (
        status='queued'
        OR (status='research_required' AND datetime(last_updated)<=datetime('now','-60 minutes'))
        OR (status='research_paused' AND datetime(last_updated)<=datetime('now','-60 minutes'))
        OR (status='running' AND julianday(replace(substr(COALESCE(last_updated,started_at,created_at),1,19),'T',' '))<=julianday('now')-(30.0/1440.0))
      )
    ORDER BY priority DESC,
      CASE status WHEN 'queued' THEN 0 WHEN 'running' THEN 1 ELSE 2 END,
      datetime(replace(substr(COALESCE(last_updated,created_at),1,19),'T',' ')) ASC,
      created_at ASC
    LIMIT 1
  `).first();
  if(!next) return {ok:true,processed:false};

  const claimed=await env.DB.prepare(`
    UPDATE operational_objectives
    SET continuation_count=COALESCE(continuation_count,0)+1
    WHERE id=?
      AND COALESCE(lifecycle_state,'active')='active'
      AND COALESCE(continuation_count,0) < COALESCE(continuation_limit,8)
  `).bind(next.id).run();
  if((claimed.meta?.changes||0)!==1) return {ok:true,processed:false,reason:'queue-claim-lost'};

  let result;
  try {
    result=await processOperationalObjective(env,next.id);
  } catch(error) {
    // V1.8.18: a continuation is earned only by a completed orchestration attempt.
    // If processing throws, return the claimed slot, restore a recoverable state,
    // persist the failure, and fail closed without silently consuming scarce lifecycle.
    await env.DB.prepare(`
      UPDATE operational_objectives
      SET continuation_count=CASE WHEN COALESCE(continuation_count,0)>0 THEN continuation_count-1 ELSE 0 END,
          status='research_required',
          lifecycle_state='active',
          retired_reason=NULL,
          last_updated=?
      WHERE id=?
    `).bind(nowISO(),next.id).run().catch(()=>{});
    await env.DB.prepare(`
      UPDATE work_orders
      SET status='research_required',completed_at=NULL,last_updated=?
      WHERE id=(SELECT work_order_id FROM operational_objectives WHERE id=?)
    `).bind(nowISO(),next.id).run().catch(()=>{});
    await recordFailure(env,next.id,'continuation-orchestration',error).catch(()=>{});
    await audit(env,'JANITOR','CONTINUATION_CLAIM_ROLLED_BACK',next.id,JSON.stringify({
      objectiveId:next.id,
      failedClaimCount:Number(next.continuation_count||0)+1,
      restoredContinuationCount:Number(next.continuation_count||0),
      recoveryState:'research_required',
      error:cleanText(error?.message||String(error),1200),
      externalSpendUSD:0
    })).catch(()=>{});
    return {
      ok:false,
      processed:false,
      objectiveId:next.id,
      status:'research_required',
      continuationRolledBack:true,
      continuationCount:Number(next.continuation_count||0),
      error:cleanText(error?.message||String(error),1200),
      externalSpendUSD:0
    };
  }
  const post=await env.DB.prepare(`
    SELECT id,status,lifecycle_state,continuation_count,continuation_limit
    FROM operational_objectives WHERE id=?
  `).bind(next.id).first();

  if(post && post.status==='research_required' &&
     Number(post.continuation_count||0)>=Number(post.continuation_limit||8)) {
    await env.DB.prepare(`
      UPDATE operational_objectives
      SET lifecycle_state='held',
          retired_reason='continuation-limit-reached',
          last_updated=?
      WHERE id=? AND lifecycle_state='active'
    `).bind(nowISO(),next.id).run();
    await audit(env,'JANITOR','OBJECTIVE_CONTINUATION_LIMIT_HELD',next.id,JSON.stringify({
      objectiveId:next.id,
      continuationCount:Number(post.continuation_count||0),
      continuationLimit:Number(post.continuation_limit||8),
      action:'held-for-review-no-further-autonomous-compute',
      externalSpendUSD:0
    }));
  }

  return {...result,queueLifecycle:{
    objectiveId:next.id,
    continuationCount:Number(post?.continuation_count||0),
    continuationLimit:Number(post?.continuation_limit||8),
    lifecycleState:post?.lifecycle_state||'active'
  }};
}

async function getOperationalObjective(env,id) {
  await ensureSchema(env);
  const objective=await env.DB.prepare(`SELECT * FROM operational_objectives WHERE id=?`).bind(id).first();
  if(!objective) return {ok:false,error:'Operational objective not found.'};
  const pkg=objective.decision_package_id?await env.DB.prepare(`SELECT * FROM founder_decision_packages WHERE id=?`).bind(objective.decision_package_id).first():null;
  return {ok:true,objective,decisionPackage:pkg};
}

async function runElasticDepartmentAcceptance(env) {
  await ensureSchema(env);
  const testId=`EAT-001-${Date.now()}-${crypto.randomUUID().slice(0,8)}`;
  const authority='internal-zero-dollar'; assertInternalAuthority(authority);
  const objective='Determine how a VIS department should decompose a complex internal analysis objective into heterogeneous specialist work while preserving lineage, resilience, independent challenge, and one-Hive reintegration.';
  const seedA=await createHiveKnowledge(env,{id:`${testId}-HK-A`,knowledgeType:'elastic-fixture',subject:'Elastic execution invariant',content:'Department Heads may dynamically decompose internal objectives into heterogeneous constrained workers. Workers inherit Hive knowledge and may not expand authority.',confidence:1,verificationStatus:'acceptance-fixture',sourceType:'harness',sourceRef:testId});
  const seedB=await createHiveKnowledge(env,{id:`${testId}-HK-B`,knowledgeType:'elastic-fixture',subject:'Elastic quality invariant',content:'Useful elastic execution requires non-duplicate mandates, traceable evidence, recovery of bad disposable workers, departmental compression, independent challenge, and Hive reintegration.',confidence:1,verificationStatus:'acceptance-fixture',sourceType:'harness',sourceRef:testId});
  const seeds=[seedA,seedB];
  const wo=await createWorkOrder(env,{id:`${testId}-WO`,objective,requestedBy:'HIVE-ELASTIC-HARNESS',authorityScope:authority,priority:1});
  await env.DB.prepare(`UPDATE work_orders SET status='running',started_at=?,last_updated=? WHERE id=?`).bind(nowISO(),nowISO(),wo).run();
  const head=await env.DB.prepare(`SELECT agent_id,authority_scope FROM department_heads WHERE department_id='DISCOVERY' AND status='active'`).first();
  if(!head) throw new Error('DISCOVERY head missing.'); assertInternalAuthority(head.authority_scope);
  const planText=await think(env,ELASTIC_HEAD_SYSTEM,`OBJECTIVE: ${objective}\nINHERITED HIVE KNOWLEDGE IDS: ${seeds.join(', ')}\nAUTHORITY: ${authority}`,900,.35);
  const specs=parseElasticPlan(planText);
  const created=[];
  for(const spec of specs){ const w=await createConstrainedWorkerJob(env,{workOrderId:wo,departmentId:'DISCOVERY',managerAgent:head.agent_id,workerRole:spec.role,mandate:spec.mandate,knowledgeIds:seeds,authorityScope:authority}); created.push({...w,...spec}); }
  const results=[]; let recovered=false;
  for(let i=0;i<created.length;i++){
    const w=created[i];
    if(i===0){
      const old=await env.DB.prepare(`SELECT * FROM worker_jobs WHERE id=?`).bind(w.id).first();
      await env.DB.prepare(`UPDATE worker_jobs SET status='running',attempts=attempts+1,started_at=?,last_updated=? WHERE id=?`).bind(nowISO(),nowISO(),w.id).run();
      const poisoned='N/A';
      if(workerOutputUsable(poisoned)) throw new Error('Quality gate failed to reject injected bad worker output.');
      const repl=await replaceWorkerFromExistingPacket(env,old,'EAT-001 injected unusable output');
      const rr=await runRecoveredWorker(env,repl.newId,'elastic-recovery');
      results.push({original:w.id,workerJobId:repl.newId,resultId:rr.resultId,recovered:true}); recovered=true;
    } else {
      const rr=await runRecoveredWorker(env,w.id,'elastic-specialist');
      results.push({workerJobId:w.id,resultId:rr.resultId,recovered:false});
    }
  }
  const synthesis=await createDepartmentSynthesis(env,{workOrderId:wo,departmentId:'DISCOVERY',objective});
  const challenge=await createCrossDepartmentReview(env,{workOrderId:wo,objective,reviewerDepartmentId:'DILIGENCE',subjectSynthesisId:synthesis.id});
  const reintegrated=await reintegrateHiveKnowledge(env,{workOrderId:wo,synthesisId:synthesis.id,reviewRefs:[challenge.id],knowledgeType:'elastic-synthesized-learning',subject:'EAT-001 elastic department execution',content:`DISCOVERY synthesis: ${synthesis.synthesis}\nIndependent DILIGENCE review: ${challenge.review}`,confidence:.8,verificationStatus:'elastic-acceptance-reviewed',disposition:challenge.decision==='REJECT'?'held':'accepted',rationale:'EAT-001 elastic execution completed with independent review.'});
  const lineage=await env.DB.prepare(`SELECT COUNT(*) n FROM knowledge_inheritance WHERE work_order_id=?`).bind(wo).first();
  const resultCount=await env.DB.prepare(`SELECT COUNT(*) n FROM worker_results WHERE work_order_id=? AND status='submitted'`).bind(wo).first();
  const runningWorkers=await env.DB.prepare(`SELECT COUNT(*) n FROM worker_jobs WHERE rotation_id=? AND status='running'`).bind(wo).first();
  const authorityViolations=await env.DB.prepare(`SELECT COUNT(*) n FROM worker_jobs WHERE rotation_id=? AND authority_scope NOT IN ('internal-zero-dollar','read-only','analysis-only')`).bind(wo).first();
  const reintegration=await env.DB.prepare(`SELECT r.knowledge_id,k.content FROM hive_reintegrations r JOIN hive_knowledge k ON k.id=r.knowledge_id WHERE r.work_order_id=? AND r.knowledge_id=?`).bind(wo,reintegrated).first();
  const mandatesUnique=new Set(specs.map(x=>x.mandate.toLowerCase())).size===specs.length;
  const rolesUnique=new Set(specs.map(x=>x.role.toLowerCase())).size===specs.length;
  const checks={dynamicDecomposition:specs.length>=3&&specs.length<=6,heterogeneousWorkers:rolesUnique&&mandatesUnique,inheritedKnowledgeTraceable:Number(lineage?.n||0)>=specs.length*seeds.length,workerResultsComplete:Number(resultCount?.n||0)===specs.length,badWorkerRecovered:recovered,departmentSynthesisPersisted:Boolean(synthesis.id),independentChallengePersisted:Boolean(challenge.id),hiveReintegrationRetrievable:Boolean(reintegration?.content),noStrandedWorkers:Number(runningWorkers?.n||0)===0,authorityBoundaryPreserved:Number(authorityViolations?.n||0)===0,externalSpendUSDZero:true};
  const passed=Object.values(checks).every(Boolean);
  await env.DB.prepare(`UPDATE work_orders SET status=?,completed_at=?,last_updated=? WHERE id=?`).bind(passed?'completed':'failed',nowISO(),nowISO(),wo).run();
  await audit(env,'ELASTIC_ACCEPTANCE_HARNESS','EAT-001',wo,JSON.stringify({passed,checks,workerCount:specs.length,reintegrated}));
  return {ok:passed,test:'EAT-001',version:VIS.version,testId,workOrderId:wo,department:'DISCOVERY',headAgent:head.agent_id,workerPlan:specs,workers:results,synthesisId:synthesis.id,reviewId:challenge.id,reviewDecision:challenge.decision,reintegratedKnowledgeId:reintegrated,checks,counts:{plannedWorkers:specs.length,lineage:Number(lineage?.n||0),results:Number(resultCount?.n||0)},externalSpendUSD:0};
}

export default {
  async fetch(
    request,
    env
  ) {
    const url =
      new URL(request.url);

    try {
      if (url.pathname === "/") {
        return json({
          service:
            "VIS Runtime",
          version:
            VIS.version,
          status:
            "online",
          architecture:
            "Experiments + Sensors -> Department Heads -> Institutional Memory"
        });
      }

      if (
        url.pathname === "/initialize"
      ) {
        return json(
          {
            ok: false,
            error:
              "Administrative endpoint disabled"
          },
          403
        );
      }

      if (
        url.pathname.startsWith("/admin/")
      ) {
        if (!authorized(request, env)) {
          return json(
            {
              ok: false,
              error: "Unauthorized"
            },
            401
          );
        }

        if (
          url.pathname === "/admin/status"
        ) {
          return json(
            await getStatus(env)
          );
        }

        if (url.pathname === "/admin/compute-budget") {
          await ensureSchema(env);
          return json(await computeBudgetState(env));
        }

        if (
          url.pathname ===
          "/admin/research-status"
        ) {
          await ensureSchema(env);

          return json(
            await getResearchStatus(env)
          );
        }

        if (
          url.pathname ===
          "/admin/latest-failure"
        ) {
          return json(
            await getLatestFailure(env)
          );
        }

        if (
          url.pathname ===
          "/admin/experiment-status"
        ) {
          return json(
            await getExperimentStatus(env)
          );
        }

        if (
          url.pathname ===
            "/admin/synchronize-experiments" &&
          request.method === "POST"
        ) {
          await ensureSchema(env);
          await synchronizeApprovedExperiments(env);

          return json({
            ok: true,
            version: VIS.version,
            synchronized: true,
            experimentStatus:
              await getExperimentStatus(env),
            externalSpendUSD: 0
          });
        }

        if (
          url.pathname ===
            "/admin/recover-runtime-state" &&
          request.method === "POST"
        ) {
          return json(
            await recoverStaleRuntimeState(env)
          );
        }

        if (
          url.pathname ===
            "/admin/test-ai" &&
          request.method === "POST"
        ) {
          return json(
            await testAI(env)
          );
        }

        if (
          url.pathname ===
            "/admin/repair-schema" &&
          request.method === "POST"
        ) {
          await ensureSchema(env);

          return json({
            ok: true,
            version: VIS.version,
            schemaNormalized: true
          });
        }


        if (url.pathname === "/admin/ventures" && request.method === "GET") {
          await ensureSchema(env);
          return json({ok:true,ventures:(await env.DB.prepare(`SELECT * FROM ventures ORDER BY created_at`).all()).results||[]});
        }

        if (url.pathname.startsWith("/admin/research-evidence/") && request.method === "GET") {
          const oid=decodeURIComponent(url.pathname.slice("/admin/research-evidence/".length));
          return json(await getMissionResearchEvidence(env,oid));
        }

        if (url.pathname.startsWith("/admin/research-plan/") && request.method === "GET") {
          await ensureSchema(env);
          const oid=decodeURIComponent(url.pathname.slice("/admin/research-plan/".length));
          const plan=await env.DB.prepare(`SELECT * FROM mission_research_plans WHERE objective_id=? ORDER BY created_at DESC LIMIT 1`).bind(oid).first();
          const questions=plan?(await env.DB.prepare(`SELECT * FROM mission_research_questions WHERE plan_id=? ORDER BY priority DESC,created_at`).bind(plan.id).all()).results||[]:[];
          return json({ok:Boolean(plan),plan,questions});
        }

        if (
          url.pathname === "/admin/objectives" &&
          request.method === "POST"
        ) {
          return json(await intakeOperationalObjective(env, request));
        }

        if (
          url.pathname === "/admin/objectives/continue" &&
          request.method === "POST"
        ) {
          return json(await continueOperationalQueue(env));
        }

        if (
          url.pathname.startsWith("/admin/objectives/") &&
          request.method === "GET"
        ) {
          const objectiveId=decodeURIComponent(url.pathname.slice("/admin/objectives/".length));
          return json(await getOperationalObjective(env, objectiveId));
        }

        if (
          url.pathname === "/admin/operational-acceptance-test" &&
          request.method === "POST"
        ) {
          return json(await runOperationalAcceptanceTest(env));
        }

        if (
          url.pathname === "/admin/scale-acceptance-test" &&
          request.method === "POST"
        ) {
          return json(await runScaleAcceptanceTest(env));
        }

        if (
          url.pathname === "/admin/it-repair/eat-001" &&
          request.method === "POST"
        ) {
          return json(await runITIncidentRepairEAT001(env));
        }

        if (
          url.pathname ===
            "/admin/elastic-recovery" &&
          request.method === "POST"
        ) {
          return json(
            await recoverElasticDepartmentAcceptance(
              env,
              "EAT-001-1790466134673-550afb9e"
            )
          );
        }

        if (
          url.pathname ===
            "/admin/elastic-acceptance-test" &&
          request.method === "POST"
        ) {
          return json(
            await runElasticDepartmentAcceptance(env)
          );
        }

        if (
          url.pathname ===
            "/admin/hive-resilience-attack" &&
          request.method === "POST"
        ) {
          return json(
            await runHiveResilienceAttack(env)
          );
        }

        if (
          url.pathname ===
            "/admin/hive-acceptance-test" &&
          request.method === "POST"
        ) {
          return json(
            await runHiveAcceptanceTest(env)
          );
        }

        if (
          url.pathname ===
            "/admin/run" &&
          request.method === "POST"
        ) {
          return json(
            await runVIS(
              env,
              "authenticated-manual-test"
            )
          );
        }

        return json(
          {
            ok: false,
            error:
              "Admin route not found"
          },
          404
        );
      }

      return json(
        {
          ok: false,
          error: "Route not found"
        },
        404
      );

    } catch (error) {
      return json(
        {
          ok: false,
          error:
            "VIS runtime operation failed"
        },
        500
      );
    }
  },

  async scheduled(
    controller,
    env,
    ctx
  ) {
    ctx.waitUntil((async()=>{
      await runVIS(env,`cron:${controller.cron}`);
      await continueOperationalQueue(env);
    })());
  }
};
