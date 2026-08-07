export const dynamic = "force-dynamic";

type ReconciliationRow = {
  month: string;
  payload: string;
  checked_at: string;
};

function json(data: unknown, status = 200) {
  return Response.json(data, { status, headers: { "Cache-Control": "no-store" } });
}

async function ready() {
  const { env } = await import("cloudflare:workers");
  const db = env.DB;
  if (!db) throw new Error("Database unavailable");
  await db.prepare(`CREATE TABLE IF NOT EXISTS demo_reconciliation (
    month TEXT PRIMARY KEY NOT NULL,
    payload TEXT NOT NULL,
    checked_at TEXT NOT NULL
  )`).run();
  return { db, secret: String(env.DEMO_DROP_STATUS_SECRET ?? "") };
}

export async function GET() {
  try {
    const { db } = await ready();
    const row = await db.prepare(
      "SELECT month, payload, checked_at AS checkedAt FROM demo_reconciliation ORDER BY checked_at DESC LIMIT 1"
    ).first() as ReconciliationRow | null;
    if (!row) return json({ reconciliation: null });
    return json({
      reconciliation: {
        month: row.month,
        checkedAt: row.checkedAt,
        ...(JSON.parse(row.payload) as Record<string, unknown>),
      },
    });
  } catch {
    return json({ reconciliation: null, status: "unavailable" }, 503);
  }
}

export async function POST(request: Request) {
  try {
    const { db, secret } = await ready();
    const authorization = request.headers.get("authorization") ?? "";
    if (!secret || authorization !== `Bearer ${secret}`) return json({ error: "Unauthorized" }, 401);

    const body = await request.json() as Record<string, unknown>;
    const month = String(body.month ?? "").trim();
    if (!month) return json({ error: "month is required" }, 400);
    const checkedAt = String(body.checkedAt ?? new Date().toISOString());
    const { month: _month, checkedAt: _checkedAt, ...payload } = body;

    await db.prepare(
      "INSERT OR REPLACE INTO demo_reconciliation (month, payload, checked_at) VALUES (?, ?, ?)"
    ).bind(month, JSON.stringify(payload), checkedAt).run();

    return json({ ok: true, month });
  } catch {
    return json({ error: "Could not store reconciliation" }, 400);
  }
}
