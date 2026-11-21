import pytest
from backend.app import nasa_service


class FakeResponse:
    def __init__(self, status_code=200, body=None):
        self.status_code = status_code
        self._body = body or {
            "title": "Test image", "date": "2026-01-01", "explanation": "Test explanation",
            "url": "https://science.nasa.gov/image-article/test/", "permalink": "https://science.nasa.gov/image-article/test/",
            "hdurl": "https://assets.science.nasa.gov/test.jpg", "media_type": "image", "copyright": "Demo credit",
        }

    def json(self):
        return self._body


def test_apod_retrieval_and_key_not_in_response(monkeypatch):
    nasa_service.clear_cache()
    captured = {}
    def fake_get(url, params, timeout, headers):
        captured["url"] = url
        captured.update(params)
        return FakeResponse()
    monkeypatch.setattr(nasa_service.requests, "get", fake_get)
    result = nasa_service.get_apod("2026-01-01")
    assert result["title"] == "Test image"
    assert result["source"] == "NASA Astronomy Picture of the Day (APOD Basic)"
    assert result["url"] == "https://assets.science.nasa.gov/test.jpg"
    assert result["page_url"] == "https://science.nasa.gov/image-article/test/"
    assert captured["url"] == nasa_service.settings.nasa_apod_url
    assert "api_key" not in result
    assert captured["api_key"] == nasa_service.settings.nasa_api_key


def test_nasa_rate_limit_error(monkeypatch):
    nasa_service.clear_cache()
    monkeypatch.setattr(nasa_service.requests, "get", lambda *args, **kwargs: FakeResponse(status_code=429))
    with pytest.raises(nasa_service.NasaAPIError) as error:
        nasa_service.get_apod()
    assert error.value.status_code == 429
    assert "rate limit" in str(error.value).lower()


def test_invalid_nasa_key_error(monkeypatch):
    nasa_service.clear_cache()
    monkeypatch.setattr(nasa_service.requests, "get", lambda *args, **kwargs: FakeResponse(status_code=403))
    with pytest.raises(nasa_service.NasaAPIError) as error:
        nasa_service.get_apod()
    assert error.value.status_code == 403
    assert "api key" in str(error.value).lower()


def test_nasa_timeout_is_handled(monkeypatch):
    import requests
    nasa_service.clear_cache()
    def timeout(*args, **kwargs):
        raise requests.Timeout("slow")
    monkeypatch.setattr(nasa_service.requests, "get", timeout)
    with pytest.raises(nasa_service.NasaAPIError, match="timed out"):
        nasa_service.get_apod()


def test_donki_notifications_are_labeled_as_operational_context(monkeypatch):
    nasa_service.clear_cache()
    record = [{
        "messageID": "evt-1", "messageType": "CME", "messageIssueTime": "2026-01-01T10:00Z",
        "messageURL": "https://example.test/event", "messageBody": "Test coronal mass ejection notice",
    }]
    monkeypatch.setattr(nasa_service.requests, "get", lambda *args, **kwargs: FakeResponse(body=record))
    result = nasa_service.get_donki_notifications("2026-01-01", "2026-01-07")
    assert result["count"] == 1
    assert result["items"][0]["type"] == "CME"
    assert "local lunar topography" in result["mission_relevance"]


def test_donki_unexpected_response_is_rejected(monkeypatch):
    nasa_service.clear_cache()
    monkeypatch.setattr(nasa_service.requests, "get", lambda *args, **kwargs: FakeResponse(body={"unexpected": True}))
    with pytest.raises(nasa_service.NasaAPIError, match="unexpected response"):
        nasa_service.get_donki_notifications("2026-01-01", "2026-01-07")


def test_nasa_image_library_search_uses_public_api_without_api_key(monkeypatch):
    nasa_service.clear_cache()
    body = {"collection": {"items": [{
        "data": [{"nasa_id": "AS11-40-5875", "title": "Apollo lunar surface", "description": "Lunar surface photograph", "date_created": "1969-07-20T00:00:00Z", "center": "JSC"}],
        "links": [{"rel": "preview", "href": "https://images.nasa.gov/details/AS11-40-5875"}],
    }]}}
    captured = {}
    def fake_get(url, params, timeout, headers):
        captured["url"] = url
        captured["params"] = params
        return FakeResponse(body=body)
    monkeypatch.setattr(nasa_service.requests, "get", fake_get)
    result = nasa_service.get_lunar_imagery("Moon", 4)
    assert result["count"] == 1
    assert result["items"][0]["nasa_id"] == "AS11-40-5875"
    assert captured["url"] == "https://images-api.nasa.gov/search"
    assert "api_key" not in captured["params"]


def test_placeholder_key_falls_back_to_demo_key(monkeypatch):
    nasa_service.clear_cache()
    monkeypatch.setattr(nasa_service.settings, "nasa_api_key", "YOUR_NASA_API_KEY")
    captured = {}
    def fake_get(url, params, timeout, headers):
        captured.update(params)
        return FakeResponse()
    monkeypatch.setattr(nasa_service.requests, "get", fake_get)
    status = nasa_service.get_status()
    assert captured["api_key"] == "DEMO_KEY"
    assert status["key_configured"] is False
    assert status["key_type"] == "NASA DEMO_KEY"
