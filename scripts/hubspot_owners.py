"""Resolve HubSpot owner IDs to display names with a cached directory."""
from __future__ import annotations

import json
import time
import urllib.error
import urllib.request
from pathlib import Path

HUBSPOT_API = "https://api.hubapi.com"
PORTAL_ID = "5664760"
DEFAULT_CACHE_PATH = Path(__file__).resolve().parent / "owner_cache.json"


def _display_name(owner: dict) -> str:
    first = (owner.get("firstName") or "").strip()
    last = (owner.get("lastName") or "").strip()
    name = f"{first} {last}".strip()
    if name:
        return name
    email = (owner.get("email") or "").strip()
    return email.split("@")[0].replace(".", " ").title() if email else ""


class OwnerDirectory:
    def __init__(
        self,
        cache_path: str | Path | None = None,
        ttl_seconds: int = 24 * 60 * 60,
        overrides: dict[str, str] | None = None,
    ):
        self.cache_path = Path(cache_path or DEFAULT_CACHE_PATH)
        self.ttl_seconds = ttl_seconds
        self.overrides = {str(key): value for key, value in (overrides or {}).items()}
        self.by_id: dict[str, str] = dict(self.overrides)
        self.loaded_at = 0.0

    def load_cache(self) -> bool:
        try:
            payload = json.loads(self.cache_path.read_text())
        except (FileNotFoundError, json.JSONDecodeError):
            return False
        if time.time() - float(payload.get("fetchedAt", 0)) > self.ttl_seconds:
            return False
        owners = payload.get("owners") or {}
        self.by_id = {**owners, **self.overrides}
        self.loaded_at = float(payload.get("fetchedAt", 0))
        return True

    def save_cache(self, owners: dict[str, str]) -> None:
        self.cache_path.parent.mkdir(parents=True, exist_ok=True)
        temp = self.cache_path.with_suffix(".tmp")
        payload = {"fetchedAt": time.time(), "owners": owners}
        temp.write_text(json.dumps(payload, indent=2, sort_keys=True))
        temp.replace(self.cache_path)
        self.by_id = {**owners, **self.overrides}
        self.loaded_at = payload["fetchedAt"]

    def refresh(self, token: str, force: bool = False) -> None:
        if not force and self.load_cache():
            return
        owners: dict[str, str] = {}
        after = None
        for _ in range(10):
            url = f"{HUBSPOT_API}/crm/v3/owners?limit=500"
            if after:
                url += f"&after={after}"
            request = urllib.request.Request(url, headers={"Authorization": f"Bearer {token}"})
            try:
                with urllib.request.urlopen(request, timeout=30) as response:
                    data = json.loads(response.read())
            except urllib.error.HTTPError as exc:
                if exc.code in (401, 403):
                    raise PermissionError(f"HubSpot owners API rejected ({exc.code})") from exc
                raise RuntimeError(f"HubSpot owners API returned {exc.code}") from exc
            for row in data.get("results", []):
                owner_id = str(row.get("id") or "")
                name = _display_name(row)
                if owner_id and name:
                    owners[owner_id] = name
            after = (data.get("paging") or {}).get("next", {}).get("after")
            if not after:
                break
        self.save_cache(owners)

    def name_for(self, owner_id: str | None) -> str | None:
        if not owner_id:
            return None
        return self.by_id.get(str(owner_id))

    def resolve_sdr(self, props_map: dict) -> tuple[str | None, str | None]:
        owner_id = str(props_map.get("sdr_owner") or "").strip()
        if not owner_id:
            return None, None
        return owner_id, self.name_for(owner_id)

    def resolve_ae(self, props_map: dict) -> str | None:
        owner_id = str(props_map.get("hubspot_owner_id") or "").strip()
        return self.name_for(owner_id)
