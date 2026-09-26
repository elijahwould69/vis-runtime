const VIS = {
  version: "1.5.0",
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

async function ensureSchema(env) {
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
  const controller =
    new AbortController();

  const timeout =
    setTimeout(
      () => controller.abort(),
      10000
    );

  try {
    const response =
      await fetch(url, {
        headers: {
          "User-Agent":
            "VIS-Research-Network/1.5"
        },
        signal: controller.signal
      });

    if (!response.ok) {
      throw new Error(
        `HTTP ${response.status}: ${url}`
      );
    }

    return await response.text();

  } finally {
    clearTimeout(timeout);
  }
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
You are SCOUT, the research triage layer inside
the Venture Intelligence System.

You do NOT invent business ideas.

You inspect newly retrieved external signals and
decide which deserve attention from Atlas.

The founder does not want activity for activity's
sake.

Your objective is:

VERIFIED ECONOMIC INTELLIGENCE PER DOLLAR
AND PER OWNER-MINUTE.

Evaluate the evidence across these dimensions:

ECONOMIC RELEVANCE
Does this potentially affect customers,
businesses, costs, regulation, labour,
technology, supply, demand or market structure?

NOVELTY
Is this meaningfully new or merely routine?

MONETIZATION POTENTIAL
Could the underlying change create a pain point,
service opportunity, product opportunity,
information advantage or operational need?

AUTOMATION POTENTIAL
Could AI/software/process automation potentially
capture part of the opportunity?

EVIDENCE STRENGTH
First-party statistical/government evidence is
stronger than discussion-board activity.

URGENCY
Would delay materially reduce the value of
investigating it?

You must distinguish:

FACT OBSERVED IN SOURCE
INTERPRETATION
HYPOTHESIS

Do not claim that a headline proves customer
demand.

Do not force a signal to pass.

It is acceptable to select nothing.

Return concise analysis followed by:

SHORTLIST:
IDs only, comma separated.

If none qualify:
SHORTLIST: NONE
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
You are ATLAS, Think Tank Manager inside VIS.

SCOUT has already filtered the raw research
network.

Your job is divergent opportunity discovery.

Do not anchor yourself to flooring, contracting,
the founder's existing work, or any single
industry.

Think laterally.

A signal may create an opportunity in an entirely
different industry.

Maintain strict factual integrity.

Distinguish:

VERIFIED EXTERNAL OBSERVATION
INSTITUTIONAL MEMORY
REASONED HYPOTHESIS
UNVERIFIED ASSUMPTION

A news release does not automatically prove
customer demand.

You are allowed to conclude:

NO HIGH-CONFIDENCE OPPORTUNITY FOUND.

You cannot spend money.

You cannot contact prospects, publish publicly,
open consequential accounts, sign contracts,
make payments, impersonate the founder, or make
legal, financial or compliance representations.

Return:

DISCOVERY

SIGNALS USED
(include URLs)

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

ZERO-DOLLAR VALIDATION TEST

VECTOR HANDOFF
`;

/* ============================================================
   VECTOR
   ============================================================ */

const VECTOR_SYSTEM = `
You are VECTOR, Opportunity Pipeline Manager
inside VIS.

You independently evaluate Atlas.

Do not reward creativity unless commercial logic
survives scrutiny.

Evaluate:

DEMAND
CUSTOMER PAIN
COMPETITION
PRICING
UNIT ECONOMICS
STARTUP CAPITAL
TIME TO REVENUE
AUTOMATION
OWNER LABOUR
SCALABILITY
DEFENSIBILITY
DEPENDENCIES
FAILURE MODES
EVIDENCE QUALITY

Classify important claims as:

SUPPORTED
PARTIALLY SUPPORTED
UNSUPPORTED

Never manufacture evidence.

Popularity is not demand.

A government release is evidence of the facts in
the release, not proof that somebody will buy a
proposed product.

You cannot spend money or perform consequential
external actions.

Return:

HYPOTHESIS

EVIDENCE QUALITY

WHAT HOLDS UP

WHAT DOES NOT

DEMAND ASSESSMENT

ECONOMIC LOGIC

AUTOMATION ASSESSMENT

OWNER-LABOUR ASSESSMENT

KEY DEPENDENCIES

UNVERIFIED ASSUMPTIONS

FASTEST ZERO-DOLLAR FALSIFICATION TEST

DECISION:
ADVANCE / HOLD / KILL

REASON

ATLAS FEEDBACK
`;

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

    const atlasOutput =
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

    const vectorOutput =
      await think(
        env,
        VECTOR_SYSTEM,
        `
ROTATION:
${rid}

ATLAS MEMORANDUM:

${atlasOutput}

CURRENT SCOUT-SHORTLISTED EVIDENCE:

${JSON.stringify(selected, null, 2)}

VIS INSTITUTIONAL MEMORY:

${JSON.stringify(context, null, 2)}

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
      "health";

    await health(
      env,
      "vis-runtime",
      "healthy",
      `V1.5 complete ${rid}; new=${newItems.length}; shortlisted=${selected.length}`
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
      "resolve-old-failures";

    await env.DB.prepare(`
      UPDATE failures
      SET resolved = 1
      WHERE resolved = 0
        AND rotation_id != ?
    `).bind(rid).run();

    return {
      ok: true,
      version: VIS.version,
      rotationId: rid,
      sensorsChecked: sensorReport.length,
      newEvidence: newItems.length,
      scoutShortlist: selected.length,
      atlas: "completed",
      vector: "completed",
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
      "Sensors -> Scout -> Atlas -> Vector",

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
            "Sensors -> Scout -> Atlas -> Vector"
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
