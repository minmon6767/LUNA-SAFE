from __future__ import annotations
from datetime import datetime, timedelta, timezone
import requests
from .config import settings


class NasaAPIError(RuntimeError):
    def __init__(self, message: str, status_code: int | None = None):
        super().__init__(message)
        self.status_code = status_code


_cache: dict[str, tuple[float, object]] = {}
_CACHE_TTL_SECONDS = 900


def _effective_api_key() -> str:
    value = (settings.nasa_api_key or "").strip()
    return "DEMO_KEY" if value in ("", "YOUR_NASA_API_KEY") else value


def _get_json(endpoint: str, params: dict | None = None, include_api_key: bool = True):
    import time
    query = dict(params or {})
    if include_api_key:
        query["api_key"] = _effective_api_key()
    key = endpoint + "?" + "&".join(f"{k}={v}" for k, v in sorted(query.items()) if k != "api_key")
    now = time.time()
    cached = _cache.get(key)
    if cached and now - cached[0] < _CACHE_TTL_SECONDS:
        return cached[1]
    try:
        request_url = endpoint if endpoint.startswith("https://") else f"{settings.nasa_base_url.rstrip('/')}/{endpoint.lstrip('/')}"
        response = requests.get(
            request_url,
            params=query,
            timeout=settings.nasa_timeout_seconds,
            headers={"User-Agent": "LUNA-SAFE-2.0/1.0 (educational research demonstration)"},
        )
    except requests.Timeout as exc:
        raise NasaAPIError("NASA API request timed out. Check the connection and retry.") from exc
    except requests.RequestException as exc:
        raise NasaAPIError("Could not connect to NASA API. The offline terrain demo remains available.") from exc

    if response.status_code == 429:
        raise NasaAPIError("NASA API rate limit reached. Try again later or use your own API key.", 429)
    if response.status_code in (401, 403):
        raise NasaAPIError("NASA rejected the API key. Check NASA_API_KEY in the backend .env file.", response.status_code)
    if response.status_code >= 400:
        raise NasaAPIError(f"NASA API returned HTTP {response.status_code}.", response.status_code)
    try:
        data = response.json()
    except ValueError as exc:
        raise NasaAPIError("NASA API returned an unreadable response.", response.status_code) from exc
    _cache[key] = (now, data)
    return data


def get_apod(date: str | None = None) -> dict:
    # NASA has migrated APOD to APOD Basic (WordPress JSON). The old
    # /planetary/apod API is scheduled for retirement on 2026-12-01.
    params: dict[str, str] = {}
    if date:
        params["date"] = date
    data = _get_json(settings.nasa_apod_url, params)
    if isinstance(data, list):
        if not data:
            raise NasaAPIError("NASA APOD returned no item for the requested date.")
        data = data[0]
    media_type = data.get("media_type")
    page_url = data.get("permalink") or data.get("url")
    image_url = data.get("hdurl") or data.get("url") if media_type == "image" else None
    return {
        "title": data.get("title", "NASA Astronomy Picture of the Day"),
        "date": data.get("date"),
        "explanation": data.get("explanation", ""),
        "url": image_url or data.get("url") or page_url,
        "hdurl": image_url,
        "page_url": page_url,
        "media_type": media_type,
        "copyright": data.get("copyright") or data.get("credit"),
        "source": "NASA Astronomy Picture of the Day (APOD Basic)",
        "lunar_terrain_warning": "APOD is general astronomy imagery, not necessarily lunar, georeferenced or suitable for rover terrain analysis.",
        "retrieved_at": datetime.now(timezone.utc).isoformat(),
    }


def get_lunar_imagery(query: str = "Moon lunar surface", page_size: int = 8) -> dict:
    """Search NASA's public Image and Video Library for lunar imagery."""
    data = _get_json(
        "https://images-api.nasa.gov/search",
        {"q": query, "media_type": "image", "page_size": page_size},
        include_api_key=False,
    )
    collection = data.get("collection", {}) if isinstance(data, dict) else {}
    items = collection.get("items", []) if isinstance(collection, dict) else []
    results = []
    for item in items[:page_size]:
        metadata = (item.get("data") or [{}])[0]
        links = item.get("links") or []
        preview = next((link.get("href") for link in links if link.get("rel") == "preview"), None)
        if not preview:
            preview = next((link.get("href") for link in links if link.get("href", "").lower().endswith((".jpg", ".jpeg", ".png"))), None)
        nasa_id = metadata.get("nasa_id")
        results.append({
            "nasa_id": nasa_id,
            "title": metadata.get("title", "Untitled NASA image"),
            "description": (metadata.get("description") or "")[:700],
            "date_created": metadata.get("date_created"),
            "center": metadata.get("center"),
            "thumbnail": preview,
            "source_url": f"https://images.nasa.gov/details/{nasa_id}" if nasa_id else None,
        })
    return {
        "query": query,
        "count": len(results),
        "items": results,
        "source": "NASA Image and Video Library API",
        "warning": "NASA archive imagery is not automatically georeferenced and is not used as DEM input or rover sensor truth.",
        "retrieved_at": datetime.now(timezone.utc).isoformat(),
    }


def get_donki_notifications(start_date: str | None = None, end_date: str | None = None) -> dict:
    """Return recent NASA DONKI notifications as mission-context metadata."""
    end = datetime.now(timezone.utc).date()
    start = end - timedelta(days=6)
    params = {
        "startDate": start_date or start.isoformat(),
        "endDate": end_date or end.isoformat(),
        "type": "all",
    }
    data = _get_json("/DONKI/notifications", params)
    if not isinstance(data, list):
        raise NasaAPIError("NASA DONKI returned an unexpected response format.")
    items = []
    for record in data:
        items.append({
            "id": record.get("messageID"),
            "type": record.get("messageType", "Unclassified"),
            "issued_at": record.get("messageIssueTime"),
            "url": record.get("messageURL"),
            "summary": record.get("messageBody", ""),
        })
    return {
        "count": len(items),
        "items": items[:30],
        "source": "NASA DONKI Notifications",
        "date_range": {"start": params["startDate"], "end": params["endDate"]},
        "mission_relevance": "Space-weather alerts can inform radiation, communications and operational context. These notifications do not measure local lunar topography and are not included in the terrain risk or A* cost calculation.",
        "retrieved_at": datetime.now(timezone.utc).isoformat(),
    }


def get_status() -> dict:
    configured = _effective_api_key() != "DEMO_KEY"
    try:
        apod = get_apod()
        return {
            "connected": True,
            "key_configured": configured,
            "key_type": "personal" if configured else "NASA DEMO_KEY",
            "checked_at": datetime.now(timezone.utc).isoformat(),
            "message": "NASA API responded successfully. APOD provides general space imagery, not lunar terrain elevation.",
            "apod_date": apod.get("date"),
        }
    except NasaAPIError as exc:
        return {
            "connected": False,
            "key_configured": configured,
            "key_type": "personal" if configured else "NASA DEMO_KEY",
            "checked_at": datetime.now(timezone.utc).isoformat(),
            "message": str(exc),
            "http_status": exc.status_code,
        }


def clear_cache() -> int:
    count = len(_cache)
    _cache.clear()
    return count
