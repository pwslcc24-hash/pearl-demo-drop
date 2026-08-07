"""Watch HubSpot for new completed demos and sync live monthly counts to Pearl Demo Drop."""
import asyncio
import json
import os
from datetime import datetime, timezone
from pathlib import Path
from urllib.request import Request, urlopen
from zoneinfo import ZoneInfo

from playwright.async_api import async_playwright
from hubspot_browser import get_browser_context

PORTAL_ID = "5664760"
DISPLAY_TZ = ZoneInfo(os.getenv("DEMO_WATCH_TIMEZONE", "America/Denver"))
PAGE_SIZE = max(50, int(os.getenv("DEMO_WATCH_PAGE_SIZE", "100")))
MAX_PAGES = max(1, int(os.getenv("DEMO_WATCH_MAX_PAGES", "50")))
POLL_SECONDS = max(10, int(os.getenv("DEMO_WATCH_POLL_SECONDS", "20")))
EVENT_URL = os.getenv("DEMO_DROP_EVENT_URL", "https://pearl-demo-drop.pwhitworth5.chatgpt.site/api/events")
STATUS_URL = os.getenv("DEMO_DROP_STATUS_URL", "https://pearl-demo-drop.pwhitworth5.chatgpt.site/api/worker-status")
STATUS_SECRET = os.getenv("DEMO_DROP_STATUS_SECRET", "")
STATE_PATH = Path(os.getenv("DEMO_WATCH_STATE_PATH", "/data/demo_watch_state.json"))
SDR_NAMES = {
    "75559357": "Logan Baker", "75559358": "Payton Clayson", "77273426": "Cason Clarke",
    "77551641": "Kody Davis", "78869608": "Kana Makuakane", "79032738": "Lexee Cheney",
    "79370229": "Christian Hawkins", "92306095": "Porter Whitworth", "91603073": "Kenzie Sacks",
    "91603071": "Jeremy Thompson", "90394450": "Kyla Probst", "91603074": "Aaron Hill",
    "83843749": "Aldo Lopez", "87170093": "Audrey Linder", "94021606": "Ava Geertsen",
    "90394448": "Carson Heber", "1685445082": "Devin Stika", "92610689": "Dylan Hamilton",
    "93005873": "Easton Christiansen", "91603075": "Jace Muir", "92610687": "Josh Cheney",
    "1123178347": "Nick Crawford", "617876029": "Preston Francis", "1446744295": "Shaline Vogler",
    "91603076": "Spencer Anderson", "89053888": "Trey Falkner",
    "92610688": "Ben PoVey", "92306772": "Jack Gardner", "92306094": "Kaden Backlund",
    "84746328": "Spencer Gowan", "77007228": "Ty Armstrong",
}
PROPERTIES = ["dealname", "demo_complete", "was_a_demo_completed_", "sdr_owner", "hubspot_owner_id", "hs_lastmodifieddate"]
AE_NAMES = {
    "355267768": "Jordan Pappas", "365247824": "Kyle Lemperle", "84508983": "Kobe Dixon",
    "85536027": "Brock Mearian", "85536028": "Jackson O'Hara", "85865580": "Shirae Durfey",
    "87170093": "Audrey Linder", "87817193": "Chad Tippets", "89053885": "Justin Jolley",
    "89053886": "Seth Wilkins", "89053888": "Trey Falkner", "89053889": "Peyton Anderson",
    "90394448": "Carson Heber", "90394450": "Kyla Probst", "91603071": "Jeremy Thompson",
    "91603073": "Kenzie Sacks", "91603074": "Aaron Hill", "91603075": "Jace Muir",
    "91603076": "Spencer Anderson", "92610687": "Josh Cheney", "92610689": "Dylan Hamilton",
    "92610690": "Dallin McAllister", "92610691": "Marcus Smith Jr.", "94021606": "Ava Geertsen",
    "95965275": "Hayden Love", "1094276884": "Cy Evans", "1123178347": "Nick Crawford",
    "1437916112": "Paul Bills", "1446744295": "Shaline Vogler", "1459543271": "Branson Lewis",
    "1688013106": "Ike Rutter", "503938905": "Nika Aguba", "715298350": "Ethan Sherman",
    "79190747": "Matthew Larsen", "596306513": "Kaylee Bott", "2114106112": "Isaac Jackman",
    "650013581": "Bryson Thomas", "85078959": "Harrison Sanford", "2051237658": "Lindsey Simser",
    "77591895": "Sarah Parker", "85780304": "Kayne Bosma", "596299266": "Brody Wright",
    "79527250": "Mia Pecek", "1568710378": "Chase Meyer", "248448768": "Jared PoVey",
}


def now_iso():
    return datetime.now(timezone.utc).isoformat()


def current_month_label():
    return datetime.now(DISPLAY_TZ).strftime("%Y-%m")


def month_start_local():
    now = datetime.now(DISPLAY_TZ)
    return now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)


def post_json(url, payload):
    headers = {"Content-Type": "application/json", "User-Agent": "Pearl-Demo-Watcher/1.1"}
    if STATUS_SECRET:
        headers["Authorization"] = f"Bearer {STATUS_SECRET}"
    with urlopen(Request(url, data=json.dumps(payload).encode(), headers=headers, method="POST"), timeout=30) as response:
        return response.status


async def report_status(status, message=""):
    try:
        await asyncio.to_thread(post_json, STATUS_URL, {"status": status, "message": message[:500], "checkedAt": now_iso()})
    except Exception as exc:
        print(f"Could not report status: {exc}", flush=True)


def demo_complete_month(raw_value):
    completed = str(raw_value or "")
    try:
        numeric = float(completed)
        seconds = numeric / 1000 if numeric > 10_000_000_000 else numeric
        return datetime.fromtimestamp(seconds, DISPLAY_TZ).strftime("%Y-%m")
    except (ValueError, OverflowError, OSError):
        if len(completed) >= 7 and completed[4:5] == "-":
            return completed[:7]
        if "/" in completed:
            parts = completed.split("/")
            if len(parts) >= 3:
                return f"{parts[2][:4]}-{int(parts[0]):02d}"
    return ""


async def report_monthly_counts(results):
    month = current_month_label()
    counts = {}
    for item in results:
        props_map = props(item)
        rep_name = SDR_NAMES.get(str(props_map.get("sdr_owner") or ""))
        if not rep_name:
            continue
        if demo_complete_month(props_map.get("demo_complete")) != month:
            continue
        counts[rep_name] = counts.get(rep_name, 0) + 1
    payload = {
        "month": month,
        "monthlyCounts": [{"repName": name, "count": count} for name, count in sorted(counts.items())],
    }
    await asyncio.to_thread(post_json, EVENT_URL, payload)
    print(f"Synced monthly counts: {sum(counts.values())} demos across {len(counts)} SDRs", flush=True)


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


async def csrf_token(context):
    cookies = await context.cookies("https://app.hubspot.com")
    return next((cookie["value"] for cookie in cookies if cookie["name"] == "hubspotapi-csrf"), "")


async def search_completed_page(context, csrf, offset, month_start_ms):
    response = await context.request.post(
        "https://app.hubspot.com/api/crm-search/search",
        params={"portalId": PORTAL_ID, "hs_static_app": "crm-index-ui"},
        headers={"x-hubspot-csrf-hubspotapi": csrf, "content-type": "application/json"},
        data=json.dumps({
            "objectTypeId": "0-3",
            "count": PAGE_SIZE,
            "offset": offset,
            "requestOptions": {"properties": PROPERTIES},
            "filterGroups": [{"filters": [
                {"property": "was_a_demo_completed_", "operator": "EQ", "value": "Yes"},
                {"property": "demo_complete", "operator": "HAS_PROPERTY"},
                {"property": "demo_complete", "operator": "GTE", "value": month_start_ms},
            ]}],
            "sorts": [{"property": "demo_complete", "order": "DESC"}],
        }),
        timeout=30000,
    )
    if response.status in (401, 403) or "text/html" in response.headers.get("content-type", ""):
        raise PermissionError(f"HubSpot session rejected ({response.status})")
    if response.status != 200:
        raise RuntimeError(f"HubSpot search returned {response.status}")
    return await response.json()


async def all_completed_this_month(context, csrf):
    month_start_ms = str(int(month_start_local().timestamp() * 1000))
    results = []
    offset = 0
    for _ in range(MAX_PAGES):
        payload = await search_completed_page(context, csrf, offset, month_start_ms)
        batch = payload.get("results", [])
        results.extend(batch)
        total = int(payload.get("total") or len(results))
        offset += len(batch)
        if not batch or offset >= total:
            break
    return results


async def run():
    sent = load_state()
    seeded = STATE_PATH.exists()
    auth_alerted = False
    async with async_playwright() as playwright:
        browser, context = await get_browser_context(playwright)
        try:
            while True:
                try:
                    csrf = await csrf_token(context)
                    if not csrf:
                        raise PermissionError("HubSpot CSRF cookie missing; reauthentication required")
                    results = await all_completed_this_month(context, csrf)
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
                            owner_id = str(props_map.get("sdr_owner") or "")
                            rep_name = SDR_NAMES.get(owner_id)
                            ae_id = str(props_map.get("hubspot_owner_id") or "")
                            ae_name = AE_NAMES.get(ae_id) or "Not assigned"
                            if not rep_name:
                                print(f"Skipping {deal_id}: unknown/missing SDR {owner_id}", flush=True)
                                sent.add(deal_id)
                                save_state(sent)
                                continue
                            created_at = props_map.get("demo_complete") or props_map.get("hs_lastmodifieddate") or now_iso()
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
                    await report_monthly_counts(results)
                    if auth_alerted:
                        await report_status("ok", "HubSpot session restored")
                    else:
                        await report_status("ok", f"Synced {len(results)} completed demos for {current_month_label()}")
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
        finally:
            await context.close()
            await browser.close()


if __name__ == "__main__":
    asyncio.run(run())
