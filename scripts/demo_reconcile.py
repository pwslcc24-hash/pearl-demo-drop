"""Reconcile Pearl Demo Drop counts with the HubSpot SDR 2026 dashboard definition."""
from __future__ import annotations

from collections import Counter, defaultdict
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any

# Matches HubSpot dashboard 19853435 (SDR 2026) report filters.
IB_CS_TEAMS = frozenset({"Cross Sell SMB SDR's", "Partner SMB SDR's", "Inbound SMB SDR's"})
OUTBOUND_TEAMS = frozenset({"Outbound SMB SDR's", "Blitz SMB SDR's"})
ALL_SDR_TEAMS = IB_CS_TEAMS | OUTBOUND_TEAMS

REPORT_IDS = {
    "outbound_completes_this_month": "166997069",
    "ib_cs_completes_this_month": "167095939",
    "total_completes_this_month": "168992989",
}
DASHBOARD_ID = "19853435"


def props(result: dict) -> dict[str, Any]:
    return {key: value.get("value") for key, value in result.get("properties", {}).items()}


def hubspot_demo_month(raw: str | None) -> str | None:
    """Calendar month key using HubSpot date-at-midnight-UTC storage."""
    if not raw:
        return None
    try:
        ms = float(raw)
        sec = ms / 1000 if ms > 10_000_000_000 else ms
        return datetime.fromtimestamp(sec, timezone.utc).strftime("%Y-%m")
    except (ValueError, OverflowError, OSError):
        return None


def demo_flagged_complete(props_map: dict) -> bool:
    return str(props_map.get("was_a_demo_completed_") or "").strip().lower() == "yes"


@dataclass
class DealIssue:
    deal_id: str
    dealname: str
    rep_name: str | None
    issue: str
    detail: str


@dataclass
class Reconciliation:
    month: str
    dashboard_counts: dict[str, int] = field(default_factory=dict)
    strict_counts: dict[str, int] = field(default_factory=dict)
    synced_counts: dict[str, int] = field(default_factory=dict)
    by_team: dict[str, dict[str, int]] = field(default_factory=dict)
    issues: list[DealIssue] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)

    def drift_reps(self) -> list[tuple[str, int, int, int]]:
        reps = set(self.dashboard_counts) | set(self.strict_counts) | set(self.synced_counts)
        out = []
        for rep in sorted(reps):
            dash = self.dashboard_counts.get(rep, 0)
            strict = self.strict_counts.get(rep, 0)
            synced = self.synced_counts.get(rep, 0)
            if dash != synced:
                out.append((rep, dash, strict, synced))
        return out

    def explain_drift(self) -> list[str]:
        notes = []
        for rep, dash, strict, synced in self.drift_reps():
            if dash > strict:
                notes.append(f"{rep}: dashboard {dash} vs old strict filter {strict} — demo_complete set but was_a_demo_completed_≠Yes")
            elif dash < synced:
                notes.append(f"{rep}: synced {synced} but dashboard {dash} — deal likely missing smb_sdr_team")
            else:
                notes.append(f"{rep}: dashboard {dash} vs synced {synced}")
        return notes

    def summary_message(self) -> str:
        parts = []
        drift = self.drift_reps()
        if drift:
            parts.append(f"{len(drift)} reps off dashboard: " + "; ".join(self.explain_drift()[:3]))
        flag_issues = [i for i in self.issues if i.issue == "demo_complete_without_yes_flag"]
        if flag_issues:
            parts.append(f"{len(flag_issues)} deals counted on dashboard with was_a_demo_completed_≠Yes")
        missing = [i for i in self.issues if i.issue == "missing_sdr_owner"]
        if missing:
            parts.append(f"{len(missing)} demo_complete deals missing sdr_owner in HubSpot")
        if not parts:
            parts.append("Counts match SDR 2026 dashboard")
        return " · ".join(parts)

    def to_payload(self) -> dict[str, Any]:
        return {
            "month": self.month,
            "dashboardId": DASHBOARD_ID,
            "reportIds": REPORT_IDS,
            "dashboardCounts": self.dashboard_counts,
            "strictCounts": self.strict_counts,
            "syncedCounts": self.synced_counts,
            "byTeam": self.by_team,
            "drift": [
                {"repName": rep, "dashboard": dash, "strict": strict, "synced": synced}
                for rep, dash, strict, synced in self.drift_reps()
            ],
            "issues": [
                {
                    "dealId": issue.deal_id,
                    "dealname": issue.dealname,
                    "repName": issue.rep_name,
                    "issue": issue.issue,
                    "detail": issue.detail,
                }
                for issue in self.issues[:50]
            ],
            "warnings": self.warnings,
            "summary": self.summary_message(),
        }


def analyze_deals(results: list[dict], owners, month: str, synced_counts: dict[str, int] | None = None) -> Reconciliation:
    recon = Reconciliation(month=month, synced_counts=dict(synced_counts or {}))
    dash_deals: dict[str, set[str]] = defaultdict(set)
    strict_deals: dict[str, set[str]] = defaultdict(set)
    team_counts: dict[str, Counter] = defaultdict(Counter)

    for item in results:
        deal_id = str(item.get("objectId") or "")
        props_map = props(item)
        if hubspot_demo_month(props_map.get("demo_complete")) != month:
            continue

        owner_id, rep_name = owners.resolve_sdr(props_map)
        team = str(props_map.get("smb_sdr_team") or "")
        dealname = str(props_map.get("dealname") or deal_id)
        flagged = demo_flagged_complete(props_map)

        if not owner_id or not rep_name:
            recon.issues.append(DealIssue(
                deal_id=deal_id,
                dealname=dealname,
                rep_name=None,
                issue="missing_sdr_owner",
                detail=f"smb_sdr_team={team or 'empty'}",
            ))
            continue

        if team in ALL_SDR_TEAMS:
            dash_deals[rep_name].add(deal_id)
            team_counts[rep_name][team] += 1

        if flagged:
            strict_deals[rep_name].add(deal_id)
        elif team in ALL_SDR_TEAMS:
            recon.issues.append(DealIssue(
                deal_id=deal_id,
                dealname=dealname,
                rep_name=rep_name,
                issue="demo_complete_without_yes_flag",
                detail=f"was_a_demo_completed_={props_map.get('was_a_demo_completed_')!r}; team={team}",
            ))

    recon.dashboard_counts = {rep: len(ids) for rep, ids in dash_deals.items()}
    recon.strict_counts = {rep: len(ids) for rep, ids in strict_deals.items()}
    recon.by_team = {rep: dict(counts) for rep, counts in team_counts.items()}

    drift = recon.drift_reps()
    if drift and not any(i.issue == "demo_complete_without_yes_flag" for i in recon.issues):
        recon.warnings.append(
            "Rep totals differ from strict was_a_demo_completed_=Yes filter; dashboard uses demo_complete date only."
        )
    return recon
