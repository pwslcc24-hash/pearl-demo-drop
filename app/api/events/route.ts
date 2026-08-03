export const dynamic = "force-dynamic";

type D1Result<T> = { results?: T[] };
type DemoEvent = {
  id: string;
  repName: string;
  company: string;
  product: string;
  songId: string;
  createdAt: string;
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
  ]);
  return db;
}

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: cors });
}

export async function GET() {
  try {
    const db = await ready();
    const result = await db.prepare(`SELECT id, rep_name AS repName, company, product, song_id AS songId, created_at AS createdAt
      FROM demo_events ORDER BY rowid DESC LIMIT 10`).all() as D1Result<DemoEvent>;
    return json({ events: result.results ?? [] });
  } catch {
    return json({ events: [], status: "initializing" });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as Record<string, unknown>;
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
    };
    const db = await ready();
    await db.prepare("INSERT OR IGNORE INTO demo_events (id, rep_name, company, product, song_id, created_at) VALUES (?, ?, ?, ?, ?, ?)")
      .bind(event.id, event.repName, event.company, event.product, event.songId, event.createdAt).run();
    return json({ ok: true, event }, 201);
  } catch {
    return json({ error: "Invalid demo event" }, 400);
  }
}
