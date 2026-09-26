const VIS = {
  version: "1.7.3-development",
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
      ('DILIGENCE', 'Diligence', 'VECTOR', 'Independent commercial challenge and falsification')
  `).run();

  await addColumnIfMissing(env, "experiments", "status", "TEXT DEFAULT 'draft'");
  await addColumnIfMissing(env, "experiments", "approved_by", "TEXT");
  await addColumnIfMissing(env, "experiments", "approved_at", "TEXT");
  await addColumnIfMissing(env, "experiments", "started_at", "TEXT");
  await addColumnIfMissing(env, "experiments", "completed_at", "TEXT");
  await addColumnIfMissing(env, "experiments", "last_updated", "TEXT");
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

  return "";
}

async function think(
  env,
  systemPrompt,
  userPrompt,
  maxTokens = 1000,
  temperature = 0.4
) {
  if (!env.AI) {
    throw new Error(
      "Workers AI binding unavailable."
    );
  }

  let result;

  try {
    result =
      await env.AI.run(
        VIS.model,
        {
          messages: [
            {
              role: "system",
              content: systemPrompt
            },
            {
              role: "user",
              content: userPrompt
            }
          ],

          max_tokens: maxTokens,
          temperature
        }
      );

  } catch (error) {
    throw new Error(
      `Workers AI invocation failed: ${
        error?.message || String(error)
      }`
    );
  }

  const text =
    cleanText(
      extractAIText(result),
      14000
    );

  if (!text) {
    throw new Error(
      "Workers AI returned no readable response."
    );
  }

  return text;
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
    ctx.waitUntil(
      runVIS(
        env,
        `cron:${controller.cron}`
      )
    );
  }
};
