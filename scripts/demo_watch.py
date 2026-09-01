"""Watch HubSpot for new completed demos and sync live monthly counts to Pearl Demo Drop."""

# DEPLOYMENT NOTE
# The persistent production process does NOT run from this Sites repository.
# Railway project "zonal-celebration", service "demo-watcher", deploys the live
# watcher from pwslcc24-hash/customer-data-pull/demo_watch.py using
# /Dockerfile.demo-watch. Changes here must be copied to that runtime source and
# its Railway deployment must become Active before they affect live polling.
# HubSpot's demo_complete is date-only and stored at UTC midnight, so the first
# day of each month must be queried from UTC midnight (never Denver midnight).
import asyncio
import json
import os
from datetime import datetime, timezone
from pathlib import Path
from urllib.error import HTTPError
from urllib.request import Request, urlopen
from zoneinfo import ZoneInfo

from hubspot_owners import OwnerDirectory

from demo_reconcile import ALL_SDR_TEAMS, analyze_deals, hubspot_demo_month


def _load_dotenv():
    env_path = Path(__file__).resolve().parent / ".env"
    try:
        lines = env_path.read_text().splitlines()
    except FileNotFoundError:
        return
    for line in lines:
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


_load_dotenv()

HUBSPOT_API = "https://api.hubapi.com"
HUBSPOT_ACCESS_TOKEN = os.getenv("HUBSPOT_ACCESS_TOKEN", "")
PORTAL_ID = "5664760"
DISPLAY_TZ = ZoneInfo(os.getenv("DEMO_WATCH_TIMEZONE", "America/Denver"))
PAGE_SIZE = max(50, int(os.getenv("DEMO_WATCH_PAGE_SIZE", "100")))
MAX_PAGES = max(1, int(os.getenv("DEMO_WATCH_MAX_PAGES", "50")))
POLL_SECONDS = max(10, int(os.getenv("DEMO_WATCH_POLL_SECONDS", "20")))
OWNER_CACHE_TTL_HOURS = max(1, int(os.getenv("DEMO_WATCH_OWNER_CACHE_TTL_HOURS", "24")))
EVENT_URL = os.getenv("DEMO_DROP_EVENT_URL", "https://pearl-demo-drop.pwhitworth5.chatgpt.site/api/events")
STATUS_URL = os.getenv("DEMO_DROP_STATUS_URL", "https://pearl-demo-drop.pwhitworth5.chatgpt.site/api/worker-status")
RECONCILE_URL = os.getenv("DEMO_DROP_RECONCILE_URL", "https://pearl-demo-drop.pwhitworth5.chatgpt.site/api/reconciliation")
STATUS_SECRET = os.getenv("DEMO_DROP_STATUS_SECRET", "")
STATE_PATH = Path(os.getenv("DEMO_WATCH_STATE_PATH", "/data/demo_watch_state.json"))
OWNER_CACHE_PATH = Path(os.getenv("DEMO_WATCH_OWNER_CACHE_PATH", "/data/owner_cache.json"))

# Canonical spellings for owner IDs we care about. New SDRs are discovered automatically
# via the HubSpot owners API — this map only overrides display names when needed.
NAME_OVERRIDES = {
    "75559357": "Logan Baker", "75559358": "Payton Clayson", "77273426": "Cason Clarke",
    "77551641": "Kody Davis", "78869608": "Kana Makuakane", "79032738": "Lexee Cheney",
    "79370229": "Christian Hawkins", "92306095": "Porter Whitworth", "91603073": "Kenzie Sacks",
    "91603071": "Jeremy Thompson", "90394450": "Kyla Probst", "91603074": "Aaron Hill",
    "83843749": "Aldo Lopez", "87170093": "Audrey Linder", "94021606": "Ava Geertsen",
    "90394448": "Carson Heber", "1685445082": "Devin Stika", "92610689": "Dylan Hamilton",
    "93005873": "Easton Christiansen", "91603075": "Jace Muir", "92610687": "Josh Cheney",
    "1123178347": "Nick Crawford", "617876029": "Preston Francis", "1446744295": "Shaline Vogler",
    "91603076": "Spencer Anderson", "89053888": "Trey Falkner", "92610688": "Ben PoVey",
    "92306772": "Jack Gardner", "92306094": "Kaden Backlund", "84746328": "Spencer Gowan",
    "77007228": "Ty Armstrong", "90989337": "Amber Washington",
    "355267768": "Jordan Pappas", "365247824": "Kyle Lemperle", "84508983": "Kobe Dixon",
    "85536027": "Brock Mearian", "85536028": "Jackson O'Hara", "85865580": "Shirae Durfey",
    "87817193": "Chad Tippets", "89053885": "Justin Jolley", "89053886": "Seth Wilkins",
    "89053889": "Peyton Anderson", "92610690": "Dallin McAllister", "92610691": "Marcus Smith Jr.",
    "95965275": "Hayden Love", "1094276884": "Cy Evans", "1437916112": "Paul Bills",
    "1459543271": "Branson Lewis", "1688013106": "Ike Rutter", "503938905": "Jace Rogers",
    "715298350": "Ethan Sherman", "79190747": "Matthew Larsen", "596306513": "Kaylee Bott",
    "2114106112": "Isaac Jackman", "650013581": "Bryson Thomas", "85078959": "Harrison Sanford",
    "2051237658": "Lindsey Simser", "77591895": "Sarah Parker", "85780304": "Kayne Bosma",
    "596299266": "Brody Wright", "79527250": "Mia Pecek", "1568710378": "Chase Meyer",
    "248448768": "Jared PoVey",
}

PROPERTIES = [
    "dealname", "demo_complete", "was_a_demo_completed_", "sdr_owner", "smb_sdr_team",
    "hubspot_owner_id", "hs_lastmodifieddate",
]


def now_iso():
    return datetime.now(timezone.utc).isoformat()


def current_month_label():
    return datetime.now(DISPLAY_TZ).strftime("%Y-%m")


def month_start_local():
    # demo_complete is a HubSpot date-only property: it's always stored as
    # UTC midnight of the calendar day picked, regardless of portal timezone.
    # Anchoring this bound at America/Denver midnight (~6-7h after UTC
    # midnight) silently excludes every deal dated on the 1st of the month
    # from the search filter for the rest of that month. Use Denver only to
    # decide which (year, month) we're in, then anchor at UTC midnight to
    # match how HubSpot actually stores the value.
    now = datetime.now(DISPLAY_TZ)
    return datetime(now.year, now.month, 1, tzinfo=timezone.utc)


def post_json(url, payload):
    headers = {"Content-Type": "application/json", "User-Agent": "Pearl-Demo-Watcher/1.2"}
    if STATUS_SECRET:
        headers["Authorization"] = f"Bearer {STATUS_SECRET}"
    with urlopen(Request(url, data=json.dumps(payload).encode(), headers=headers, method="POST"), timeout=30) as response:
        return response.status


async def report_status(status, message=""):
    try:
        await asyncio.to_thread(post_json, STATUS_URL, {"status": status, "message": message[:500], "checkedAt": now_iso()})
    except Exception as exc:
        print(f"Could not report status: {exc}", flush=True)


async def report_reconciliation(payload):
    try:
        await asyncio.to_thread(post_json, RECONCILE_URL, payload)
    except Exception as exc:
        print(f"Could not report reconciliation: {exc}", flush=True)


def summarize_counts(results, owners: OwnerDirectory):
    month = current_month_label()
    counts: dict[str, int] = {}
    missing_sdr = 0
    unknown_sdr = 0
    unknown_ids: set[str] = set()

    for item in results:
        props_map = props(item)
        if hubspot_demo_month(props_map.get("demo_complete")) != month:
            continue
        owner_id, rep_name = owners.resolve_sdr(props_map)
        if not owner_id:
            missing_sdr += 1
            continue
        if not rep_name:
            unknown_sdr += 1
            unknown_ids.add(owner_id)
            continue
        team = str(props_map.get("smb_sdr_team") or "")
        if team not in ALL_SDR_TEAMS:
            continue
        counts[rep_name] = counts.get(rep_name, 0) + 1

    return {
        "counts": counts,
        "missing_sdr": missing_sdr,
        "unknown_sdr": unknown_sdr,
        "unknown_ids": sorted(unknown_ids),
    }


async def report_monthly_counts(results, owners: OwnerDirectory):
    month = current_month_label()
    summary = summarize_counts(results, owners)
    payload = {
        "month": month,
        "monthlyCounts": [{"repName": name, "count": count} for name, count in sorted(summary["counts"].items())],
    }
    await asyncio.to_thread(post_json, EVENT_URL, payload)
    mapped = sum(summary["counts"].values())
    parts = [f"Synced monthly counts: {mapped} demos across {len(summary['counts'])} SDRs"]
    if summary["missing_sdr"]:
        parts.append(f"{summary['missing_sdr']} missing sdr_owner")
    if summary["unknown_sdr"]:
        parts.append(f"{summary['unknown_sdr']} unknown owner IDs ({', '.join(summary['unknown_ids'][:5])})")
    print(" · ".join(parts), flush=True)
    return summary


def load_state():
    try:
        return set(json.loads(STATE_PATH.read_text()).get("sentDealIds", []))
    except (FileNotFoundError, json.JSONDecodeError):
        return set()


def save_state(ids):
    STATE_PATH.parent.mkdir(parents=True, exist_ok=True)
    temp = STATE_PATH.with_suffix(".tmp")
    temp.write_text(json.dumps({"sentDealIds": sorted(ids), "updatedAt": now_iso()}))
    temp.replace(STATE_PATH)


def props(result):
    return {key: value.get("value") for key, value in result.get("properties", {}).items()}


def hubspot_search(token, body):
    request = Request(
        f"{HUBSPOT_API}/crm/v3/objects/deals/search",
        data=json.dumps(body).encode(),
        headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urlopen(request, timeout=30) as response:
            return json.loads(response.read())
    except HTTPError as exc:
        if exc.code in (401, 403):
            raise PermissionError(f"HubSpot API rejected ({exc.code})") from exc
        raise RuntimeError(f"HubSpot search returned {exc.code}") from exc


def all_completed_this_month(token):
    month_start_ms = str(int(month_start_local().timestamp() * 1000))
    results = []
    after = None
    for _ in range(MAX_PAGES):
        body = {
            "filterGroups": [{"filters": [
                {"propertyName": "demo_complete", "operator": "HAS_PROPERTY"},
                {"propertyName": "demo_complete", "operator": "GTE", "value": month_start_ms},
                {"propertyName": "sdr_owner", "operator": "HAS_PROPERTY"},
            ]}],
            "sorts": [{"propertyName": "demo_complete", "direction": "DESCENDING"}],
            "properties": PROPERTIES,
            "limit": min(PAGE_SIZE, 200),
        }
        if after:
            body["after"] = after
        payload = hubspot_search(token, body)
        batch = payload.get("results", [])
        for row in batch:
            results.append({
                "objectId": row["id"],
                "properties": {key: {"value": value} for key, value in (row.get("properties") or {}).items()},
            })
        after = (payload.get("paging") or {}).get("next", {}).get("after")
        if not batch or not after:
            break
    return results


async def run():
    sent = load_state()
    seeded = STATE_PATH.exists()
    auth_alerted = False
    owners = OwnerDirectory(
        cache_path=OWNER_CACHE_PATH,
        ttl_seconds=OWNER_CACHE_TTL_HOURS * 3600,
        overrides=NAME_OVERRIDES,
    )

    while True:
        try:
            if not HUBSPOT_ACCESS_TOKEN:
                raise PermissionError("HUBSPOT_ACCESS_TOKEN not configured")
            await asyncio.to_thread(owners.refresh, HUBSPOT_ACCESS_TOKEN)
            results = await asyncio.to_thread(all_completed_this_month, HUBSPOT_ACCESS_TOKEN)
            current_ids = {str(item["objectId"]) for item in results}
            if not seeded:
                sent.update(current_ids)
                save_state(sent)
                seeded = True
                print(f"Seeded {len(current_ids)} existing demos; none replayed.", flush=True)
            else:
                for item in [entry for entry in reversed(results) if str(entry["objectId"]) not in sent]:
                    deal_id = str(item["objectId"])
                    props_map = props(item)
                    owner_id, rep_name = owners.resolve_sdr(props_map)
                    ae_name = owners.resolve_ae(props_map) or "Not assigned"
                    if not rep_name:
                        reason = "missing sdr_owner" if not owner_id else f"unknown SDR owner {owner_id}"
                        print(f"Skipping {deal_id}: {reason}", flush=True)
                        sent.add(deal_id)
                        save_state(sent)
                        continue
                    created_at = props_map.get("hs_lastmodifieddate") or props_map.get("demo_complete") or now_iso()
                    event = {
                        "id": deal_id,
                        "repName": rep_name,
                        "aeName": ae_name,
                        "ae": ae_name,
                        "company": props_map.get("dealname") or "Pearl customer",
                        "product": "Demo completed",
                        "songId": "",
                        "createdAt": created_at,
                    }
                    await asyncio.to_thread(post_json, EVENT_URL, event)
                    sent.add(deal_id)
                    save_state(sent)
                    print(f"Sent demo: {rep_name} — {event['company']}", flush=True)
            summary = await report_monthly_counts(results, owners)
            recon = analyze_deals(results, owners, current_month_label(), summary["counts"])
            await report_reconciliation({**recon.to_payload(), "checkedAt": now_iso()})
            status_bits = [
                f"Synced {len(results)} demo_complete deals for {current_month_label()}",
                f"{sum(summary['counts'].values())} on SDR 2026 dashboard definition",
            ]
            drift = recon.drift_reps()
            if drift:
                status_bits.append(recon.summary_message()[:180])
            if summary["missing_sdr"]:
                status_bits.append(f"{summary['missing_sdr']} missing sdr_owner in HubSpot")
            if summary["unknown_sdr"]:
                status_bits.append(f"{summary['unknown_sdr']} unknown owner IDs")
            if auth_alerted:
                await report_status("ok", "HubSpot auth restored · " + " · ".join(status_bits))
            else:
                await report_status("ok", " · ".join(status_bits))
            auth_alerted = False
        except PermissionError as exc:
            if not auth_alerted:
                await report_status("reauth_required", str(exc))
            auth_alerted = True
            print(f"REAUTH REQUIRED: {exc}", flush=True)
        except Exception as exc:
            await report_status("error", str(exc))
            print(f"Watcher error: {exc}", flush=True)
        await asyncio.sleep(POLL_SECONDS)


if __name__ == "__main__":
    asyncio.run(run())
