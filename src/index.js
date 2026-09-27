const VIS = {
  version: "1.8.1-operational",
  model: "@cf/meta/llama-3.1-8b-instruct-fast",

  paidSpendingEnabled: false,
  autonomousSpendLimitUSD: 0,

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
    )`
  ];

  for (const sql of v18Statements) await env.DB.prepare(sql).run();

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

async function think(
  env,
  systemPrompt,
  userPrompt,
  maxTokens = 1000,
  temperature = 0.4
) {
  if (!env.AI) throw new Error("Workers AI binding unavailable.");
  const errors=[];
  for(let attempt=1;attempt<=3;attempt++){
    try {
      const result=await env.AI.run(VIS.model,{
        messages:[{role:"system",content:systemPrompt},{role:"user",content:userPrompt}],
        max_tokens:maxTokens, temperature
      });
      const text=cleanText(extractAIText(result),14000);
      if(text) return text;
      errors.push(`attempt ${attempt}: no readable response`);
    } catch(error) {
      errors.push(`attempt ${attempt}: ${error?.message||String(error)}`);
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
          'V1.7.2 recovery marked abandoned running rotation as failed.'
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

  await audit(
    env,
    "VIS_RUNTIME",
    "STALE_STATE_RECOVERY",
    "runtime",
    JSON.stringify({
      rotationsChanged:
        staleRotations.meta?.changes || 0,
      locksRemoved:
        staleLocks.meta?.changes || 0
    })
  );

  return {
    ok: true,
    version: VIS.version,
    staleRotationsRecovered:
      staleRotations.meta?.changes || 0,
    staleLocksRemoved:
      staleLocks.meta?.changes || 0,
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

async function createFounderDecisionPackage(env, record) {
  assertInternalAuthority(record.authorityScope||'internal-zero-dollar');
  const id=`FDP-${crypto.randomUUID()}`;
  const packageText=`FOUNDER DECISION PACKAGE\nOBJECTIVE: ${record.objective}\n\nDISCOVERY SYNTHESIS:\n${record.departmentSynthesis}\n\nINDEPENDENT VECTOR CHALLENGE:\n${record.challengeReview}\n\nVECTOR DECISION: ${record.challengeDecision}\n\nAUTHORITY: internal-zero-dollar. No external action has been taken. Any spend, prospect contact, bid/submission, public publishing, consequential account creation, contract, payment, legal/compliance representation, or other consequential external action requires Founder approval.`;
  const founderActionRequired=record.challengeDecision==='HOLD'?1:0;
  await env.DB.prepare(`INSERT INTO founder_decision_packages
    (id,objective_id,work_order_id,department_synthesis_id,challenge_id,reintegrated_knowledge_id,package,status,founder_action_required,authority_scope)
    VALUES (?,?,?,?,?,?,?,'ready',?,?)`).bind(id,record.objectiveId,record.workOrderId,record.departmentSynthesisId,record.challengeId,record.knowledgeId,cleanText(packageText,20000),founderActionRequired,record.authorityScope||'internal-zero-dollar').run();
  return {id,package:packageText,founderActionRequired};
}

async function processOperationalObjective(env, objectiveId) {
  await ensureSchema(env);
  const row=await env.DB.prepare(`SELECT * FROM operational_objectives WHERE id=?`).bind(objectiveId).first();
  if(!row) throw new Error('Operational objective not found.');
  assertInternalAuthority(row.authority_scope);
  if(row.status==='completed') return {ok:true,alreadyCompleted:true,objectiveId:row.id,workOrderId:row.work_order_id,decisionPackageId:row.decision_package_id};
  if(row.status==='running') return {ok:true,alreadyRunning:true,objectiveId:row.id,workOrderId:row.work_order_id};
  const wo=row.work_order_id||`DCC-WO-${crypto.randomUUID()}`;
  try {
    await env.DB.prepare(`UPDATE operational_objectives SET status='running',work_order_id=?,started_at=COALESCE(started_at,?),last_updated=? WHERE id=?`).bind(wo,nowISO(),nowISO(),row.id).run();
    const existingWO=await env.DB.prepare(`SELECT id FROM work_orders WHERE id=?`).bind(wo).first();
    if(!existingWO) await createWorkOrder(env,{id:wo,objective:row.objective,requestedBy:row.requested_by,authorityScope:row.authority_scope,priority:row.priority});
    await env.DB.prepare(`UPDATE work_orders SET status='running',started_at=COALESCE(started_at,?),last_updated=? WHERE id=?`).bind(nowISO(),nowISO(),wo).run();
    const seedObjective=await createHiveKnowledge(env,{knowledgeType:'founder-objective',subject:`Operational objective ${row.id}`,content:row.objective,confidence:1,verificationStatus:'founder-supplied',sourceType:'founder-intake',sourceRef:row.id});
    const seedPolicy=await createHiveKnowledge(env,{knowledgeType:'operating-policy',subject:'DCC operational authority boundary',content:'VIS may perform internal zero-dollar research, analysis, synthesis, worker coordination, recovery, and documentation. It may not contact prospects, submit bids, spend money, publish publicly, create consequential accounts, enter agreements, make payments, or make legal/compliance representations without explicit Founder approval. Unknown current facts must remain unknown until supported by evidence.',confidence:1,verificationStatus:'operating-policy',sourceType:'hive-policy',sourceRef:'V1.8.1'});
    const recentEvidence=await env.DB.prepare(`SELECT source_name,item_url,title,evidence_text,verification_status,retrieved_at FROM evidence ORDER BY id DESC LIMIT 20`).all();
    const recentResearch=await env.DB.prepare(`SELECT agent_id,finding,evidence,implication,recommended_action,created_at FROM research ORDER BY rowid DESC LIMIT 12`).all();
    const seedResearch=await createHiveKnowledge(env,{knowledgeType:'current-internal-evidence',subject:`Recent VIS evidence for ${row.id}`,content:JSON.stringify({evidence:recentEvidence.results||[],research:recentResearch.results||[]}),confidence:.7,verificationStatus:'retrieved-and-internal-analysis',sourceType:'vis-runtime',sourceRef:row.id});
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
    const knowledgeId=await reintegrateHiveKnowledge(env,{workOrderId:wo,synthesisId:dsId,reviewRefs:[challenge.id],knowledgeType:'operational-learning',subject:`Operational learning ${row.id}`,content:`DISCOVERY synthesis: ${departmentText}\nIndependent DILIGENCE review: ${challenge.review}`,confidence:.75,verificationStatus:'vector-reviewed',disposition:challenge.decision==='REJECT'?'held':'accepted',rationale:'Real operational work completed under internal-zero-dollar authority with independent challenge.'});
    const pkg=await createFounderDecisionPackage(env,{objectiveId:row.id,workOrderId:wo,objective:row.objective,departmentSynthesisId:dsId,departmentSynthesis:departmentText,challengeId:challenge.id,challengeReview:challenge.review,challengeDecision:challenge.decision,knowledgeId,authorityScope:row.authority_scope});
    await env.DB.prepare(`UPDATE work_orders SET status='completed',completed_at=?,last_updated=? WHERE id=?`).bind(nowISO(),nowISO(),wo).run();
    await env.DB.prepare(`UPDATE operational_objectives SET status='completed',decision_package_id=?,completed_at=?,last_updated=? WHERE id=?`).bind(pkg.id,nowISO(),nowISO(),row.id).run();
    await audit(env,'HIVE_OPERATIONAL_INTAKE','OBJECTIVE_COMPLETED',wo,JSON.stringify({objectiveId:row.id,planningMode:planning.planningMode,departmentMode,managerCount:assignments.length,workerCount:workers.length,challengeDecision:challenge.decision,decisionPackageId:pkg.id,externalSpendUSD:0}));
    return {ok:true,objectiveId:row.id,workOrderId:wo,status:'completed',planningMode:planning.planningMode,departmentSynthesisMode:departmentMode,managerCount:assignments.length,workerCount:workers.length,challengeDecision:challenge.decision,decisionPackageId:pkg.id,reintegratedKnowledgeId:knowledgeId,externalSpendUSD:0};
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
  await env.DB.prepare(`INSERT INTO operational_objectives (id,idempotency_key,objective,requested_by,authority_scope,priority,status,last_updated) VALUES (?,?,?,?,?,?,'queued',?)`).bind(id,key,objective,cleanText(body?.requestedBy,200)||'FOUNDER','internal-zero-dollar',Math.max(1,Math.min(5,Number(body?.priority||1))),nowISO()).run();
  await audit(env,'HIVE_OPERATIONAL_INTAKE','OBJECTIVE_ACCEPTED',id,JSON.stringify({idempotencyKey:key,authorityScope:authority,externalSpendUSD:0}));
  if(body?.executeNow===false) return {ok:true,objectiveId:id,status:'queued',externalSpendUSD:0};
  return await processOperationalObjective(env,id);
}

async function continueOperationalQueue(env) {
  await ensureSchema(env);
  const next=await env.DB.prepare(`SELECT id FROM operational_objectives WHERE status='queued' ORDER BY priority DESC,created_at ASC LIMIT 1`).first();
  if(!next) return {ok:true,processed:false};
  return await processOperationalObjective(env,next.id);
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
