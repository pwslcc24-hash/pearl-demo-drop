export const dynamic = "force-dynamic";

type D1Result<T> = { results?: T[] };
type WorkerStatus = { status:string; message:string; checkedAt:string };

function json(data:unknown,status=200){
  return Response.json(data,{status,headers:{"Cache-Control":"no-store"}});
}

async function db(){
  const {env}=await import("cloudflare:workers");
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS worker_status (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    status TEXT NOT NULL,
    message TEXT NOT NULL,
    checked_at TEXT NOT NULL
  )`).run();
  return {database:env.DB,secret:String(env.DEMO_DROP_STATUS_SECRET??"")};
}

export async function GET(){
  try{
    const {database}=await db();
    const result=await database.prepare("SELECT status, message, checked_at AS checkedAt FROM worker_status WHERE id = 1").all() as D1Result<WorkerStatus>;
    return json({worker:result.results?.[0]??{status:"not_started",message:"Watcher has not reported yet",checkedAt:null}});
  }catch{return json({worker:{status:"unknown",message:"Status unavailable",checkedAt:null}},503)}
}

export async function POST(request:Request){
  try{
    const {database,secret}=await db();
    const authorization=request.headers.get("authorization")??"";
    if(!secret||authorization!==`Bearer ${secret}`)return json({error:"Unauthorized"},401);
    const body=await request.json() as Record<string,unknown>;
    const status=String(body.status??"").trim();
    const message=String(body.message??"").trim().slice(0,500);
    const checkedAt=String(body.checkedAt??new Date().toISOString());
    if(!["ok","reauth_required","error"].includes(status))return json({error:"Invalid status"},400);
    await database.prepare("INSERT OR REPLACE INTO worker_status (id,status,message,checked_at) VALUES (1,?,?,?)")
      .bind(status,message,checkedAt).run();
    return json({ok:true});
  }catch{return json({error:"Could not update worker status"},400)}
}
