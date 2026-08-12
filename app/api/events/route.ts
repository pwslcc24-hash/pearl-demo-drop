export const dynamic = "force-dynamic";

type D1Result<T> = { results?: T[] };
type DemoEvent = {
  id: string;
  repName: string;
  company: string;
  product: string;
  songId: string;
  createdAt: string;
  aeName?: string;
};

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

const DISPLAY_TIMEZONE = "America/Denver";

function monthContext() {
  const localDate = new Intl.DateTimeFormat("en-CA", {
    timeZone: DISPLAY_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  const monthKey = localDate.slice(0, 7);
  const [year, month] = monthKey.split("-").map(Number);
  const monthStartIso = new Date(Date.UTC(year, month - 1, 1)).toISOString();
  return { monthKey, monthStartIso };
}

function json(data: unknown, status = 200) {
  return Response.json(data, { status, headers: { ...cors, "Cache-Control": "no-store" } });
}

async function ready() {
  const { env } = await import("cloudflare:workers");
  const db = env.DB;
  if (!db) throw new Error("Database unavailable");
  await db.batch([
    db.prepare(`CREATE TABLE IF NOT EXISTS demo_events (
      id TEXT PRIMARY KEY NOT NULL,
      rep_name TEXT NOT NULL,
      company TEXT NOT NULL,
      product TEXT NOT NULL,
      song_id TEXT NOT NULL,
      created_at TEXT NOT NULL
    )`),
    db.prepare("CREATE INDEX IF NOT EXISTS demo_events_created_at_idx ON demo_events (created_at)"),
  ]);
  try { await db.prepare("ALTER TABLE demo_events ADD COLUMN ae_name TEXT NOT NULL DEFAULT ''").run(); } catch {}
  return db;
}

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: cors });
}

export async function GET() {
  try {
    const db = await ready();
    const result = await db.prepare(`SELECT id, rep_name AS repName, company, product, song_id AS songId, created_at AS createdAt, ae_name AS aeName
      FROM demo_events WHERE id NOT LIKE 'monthly-count:%' AND id NOT LIKE 'replay-%' ORDER BY rowid DESC LIMIT 10`).all() as D1Result<DemoEvent>;
    const { monthKey, monthStartIso } = monthContext();
    const liveTotals = await db.prepare(`SELECT rep_name AS repName, CAST(SUBSTR(product, 15) AS INTEGER) AS count FROM demo_events WHERE id LIKE ? AND id NOT LIKE 'test-%' AND id NOT LIKE 'replay-%' ORDER BY count DESC`).bind(`monthly-count:${monthKey}:%`).all() as D1Result<{repName:string;count:number}>;
    const syncMeta = await db.prepare(`SELECT MAX(created_at) AS syncedAt FROM demo_events WHERE id LIKE ?`).bind(`monthly-count:${monthKey}:%`).first() as { syncedAt?: string } | null;
    const totals = liveTotals.results?.length ? liveTotals : await db.prepare(`SELECT rep_name AS repName, COUNT(*) AS count FROM demo_events WHERE created_at >= ? AND id NOT LIKE 'test-%' AND id NOT LIKE 'replay-%' AND id NOT LIKE 'monthly-count:%' GROUP BY rep_name ORDER BY count DESC`).bind(monthStartIso).all() as D1Result<{repName:string;count:number}>;
    const events = (result.results ?? []).map(event =>
      event.id === "63436217740" && !event.aeName
        ? { ...event, aeName: "Paul Bills" }
        : event
    );
    return json({ events, monthlyCounts: totals.results ?? [], month: monthKey, syncedAt: syncMeta?.syncedAt ?? null, source: liveTotals.results?.length ? "hubspot-sync" : "event-fallback" });
  } catch {
    return json({ events: [], status: "initializing" });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as Record<string, unknown>;
    if (body.action === "replay-most-recent") {
      const db = await ready();
      const result = await db.prepare(`SELECT id, rep_name AS repName, company, product, song_id AS songId, created_at AS createdAt, ae_name AS aeName
        FROM demo_events WHERE id NOT LIKE 'monthly-count:%' AND id NOT LIKE 'replay-%' AND id NOT LIKE 'test-%' ORDER BY rowid DESC LIMIT 1`).first() as DemoEvent | null;
      if (!result) return json({ error: "There is no completed demo to replay yet" }, 404);
      return json({ ok: true, event: result }, 200);
    }
    if (body.action === "backfill-timestamp") {
      const id = String(body.id ?? "").trim();
      const createdAt = String(body.createdAt ?? "").trim();
      if (!id || !createdAt) return json({ error: "id and createdAt are required" }, 400);
      const db = await ready();
      await db.prepare("UPDATE demo_events SET created_at = ? WHERE id = ? AND id NOT LIKE 'monthly-count:%'")
        .bind(createdAt, id).run();
      return json({ ok: true, id, createdAt });
    }
    if (body.action === "test-demo-complete") {
      const repName = String(body.repName ?? body.rep_name ?? "").trim();
      if (!repName) return json({ error: "repName is required" }, 400);
      const db = await ready();
      await db.prepare("DELETE FROM demo_events WHERE id LIKE 'test-%'").run();
      const event: DemoEvent = {
        id: `test-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        repName,
        company: "Demo Complete Test",
        product: "Demo completed",
        songId: "victory-lap",
        createdAt: new Date().toISOString(),
        aeName: String(body.aeName ?? body.ae_name ?? ""),
      };
      await db.prepare("INSERT INTO demo_events (id, rep_name, company, product, song_id, created_at, ae_name) VALUES (?, ?, ?, ?, ?, ?, ?)")
        .bind(event.id, event.repName, event.company, event.product, event.songId, event.createdAt, event.aeName).run();
      return json({ ok: true, event }, 201);
    }
    if (Array.isArray(body.monthlyCounts)) {
      const month = String(body.month ?? monthContext().monthKey);
      const rows = body.monthlyCounts.slice(0,200).map(item=>item as Record<string,unknown>).filter(item=>String(item.repName??"").trim());
      const db = await ready();
      await db.prepare("DELETE FROM demo_events WHERE id LIKE ?").bind(`monthly-count:${month}:%`).run();
      if(rows.length) await db.batch(rows.map(item=>{const rep=String(item.repName).trim();return db.prepare("INSERT INTO demo_events (id, rep_name, company, product, song_id, created_at, ae_name) VALUES (?, ?, '', ?, '', ?, '')").bind(`monthly-count:${month}:${rep}`,rep,`MONTHLY_COUNT:${Math.max(0,Number(item.count)||0)}`,new Date().toISOString())}));
      return json({ok:true,month,count:rows.length});
    }
    const repName = String(body.repName ?? body.rep_name ?? body.owner_name ?? "").trim();
    const company = String(body.company ?? body.company_name ?? body.dealname ?? "Pearl customer").trim();
    const product = String(body.product ?? body.demo_type ?? "Demo completed").trim();
    const songId = String(body.songId ?? body.song_id ?? "victory-lap").trim();
    if (!repName) return json({ error: "repName is required" }, 400);

    const event: DemoEvent = {
      id: String(body.id ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`),
      repName,
      company,
      product,
      songId,
      createdAt: String(body.createdAt ?? body.created_at ?? new Date().toISOString()),
      // HubSpot commonly exposes the AE as the Deal owner. Accept the
      // alternate names used by the watcher/webhook as well.
      aeName: String(
        body.aeName ?? body.ae_name ?? body.account_executive ??
        body.dealOwner ?? body.deal_owner ?? body.ownerName ?? body.owner_name ??
        body.hubspot_owner_name ?? ""
      ).trim(),
    };
    const db = await ready();
    await db.prepare("INSERT OR IGNORE INTO demo_events (id, rep_name, company, product, song_id, created_at, ae_name) VALUES (?, ?, ?, ?, ?, ?, ?)")
      .bind(event.id, event.repName, event.company, event.product, event.songId, event.createdAt, event.aeName ?? "").run();
    // Allow the live watcher to fill in the Deal owner after an event was
    // initially created without an AE.
    if (event.aeName) {
      await db.prepare("UPDATE demo_events SET ae_name = ? WHERE id = ? AND (ae_name IS NULL OR ae_name = '' OR ae_name LIKE 'Owner %')")
        .bind(event.aeName, event.id).run();
    }
    return json({ ok: true, event }, 201);
  } catch {
    return json({ error: "Invalid demo event" }, 400);
  }
}
