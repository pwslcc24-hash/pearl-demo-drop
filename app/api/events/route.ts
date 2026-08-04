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
    db.prepare(`CREATE TABLE IF NOT EXISTS monthly_demo_counts (
      month TEXT NOT NULL,
      rep_name TEXT NOT NULL,
      demo_count INTEGER NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (month, rep_name)
    )`),
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
      FROM demo_events ORDER BY rowid DESC LIMIT 10`).all() as D1Result<DemoEvent>;
    const monthStart = new Date(); monthStart.setUTCDate(1); monthStart.setUTCHours(0,0,0,0);
    const month = monthStart.toISOString().slice(0,7);
    const liveTotals = await db.prepare(`SELECT rep_name AS repName, demo_count AS count FROM monthly_demo_counts WHERE month = ? ORDER BY demo_count DESC`).bind(month).all() as D1Result<{repName:string;count:number}>;
    const totals = liveTotals.results?.length ? liveTotals : await db.prepare(`SELECT rep_name AS repName, COUNT(*) AS count FROM demo_events WHERE created_at >= ? GROUP BY rep_name ORDER BY count DESC`).bind(monthStart.toISOString()).all() as D1Result<{repName:string;count:number}>;
    return json({ events: result.results ?? [], monthlyCounts: totals.results ?? [] });
  } catch {
    return json({ events: [], status: "initializing" });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as Record<string, unknown>;
    if (Array.isArray(body.monthlyCounts)) {
      const month = String(body.month ?? new Date().toISOString().slice(0,7));
      const rows = body.monthlyCounts.slice(0,100).map(item=>item as Record<string,unknown>).filter(item=>String(item.repName??"").trim());
      const db = await ready();
      await db.prepare("DELETE FROM monthly_demo_counts WHERE month = ?").bind(month).run();
      if(rows.length) await db.batch(rows.map(item=>db.prepare("INSERT INTO monthly_demo_counts (month, rep_name, demo_count, updated_at) VALUES (?, ?, ?, ?)").bind(month,String(item.repName).trim(),Math.max(0,Number(item.count)||0),new Date().toISOString())));
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
      aeName: String(body.aeName ?? body.ae_name ?? body.account_executive ?? "").trim(),
    };
    const db = await ready();
    await db.prepare("INSERT OR IGNORE INTO demo_events (id, rep_name, company, product, song_id, created_at, ae_name) VALUES (?, ?, ?, ?, ?, ?, ?)")
      .bind(event.id, event.repName, event.company, event.product, event.songId, event.createdAt, event.aeName ?? "").run();
    return json({ ok: true, event }, 201);
  } catch {
    return json({ error: "Invalid demo event" }, 400);
  }
}
