"""
The certificate LIST must not ship the template artwork.

Every certificate stores a snapshot of its warranty template — seal, logo and
signature as base64 data: URIs — so on the live server 157 certificates carried
~21 MB of the same eight images, all fetched before the app could render
anything. The renderer reads those fields from the LIVE template, never from
the snapshot, so the list drops them; the detail route and the stored record
keep everything.
"""
import asyncio
import json

from database import SessionLocal
from models import WarrantyCertificate
from routers.warranties import get_warranty, list_warranties, save_warranty

PNG = "data:image/png;base64," + "A" * 2000


def _stream(response):
    async def read():
        out = []
        async for chunk in response.body_iterator:
            out.append(chunk if isinstance(chunk, bytes) else chunk.encode())
        return b"".join(out)
    return json.loads(asyncio.run(read()))


def _with_template(seed, wid="W1", qid="Q1"):
    seed.add_quotation(qid)
    seed.add_warranty(wid, qid, extra={"template": {
        "id": "stone_coated", "sections": ["keep me"],
        "logo": PNG, "sealImage": PNG, "signImage": PNG,
    }})


def test_list_drops_artwork_but_keeps_the_text(seed):
    _with_template(seed)
    [cert] = _stream(list_warranties())
    tpl = cert["template"]

    assert "logo" not in tpl and "sealImage" not in tpl and "signImage" not in tpl
    assert tpl["sections"] == ["keep me"], "text fallback must survive"
    assert tpl["id"] == "stone_coated"
    assert len(json.dumps(cert)) < 500, "the list row should be small now"


def test_the_record_itself_still_has_everything(seed):
    _with_template(seed)
    assert json.loads(get_warranty("W1").body)["template"]["sealImage"] == PNG


def test_saving_a_listed_certificate_does_not_wipe_the_stored_artwork(seed):
    _with_template(seed)
    [cert] = _stream(list_warranties())          # what the UI now holds
    cert["customer"] = {"name": "Edited"}
    save_warranty(cert)                          # …and echoes back on edit

    stored = json.loads(get_warranty("W1").body)
    assert stored["template"]["sealImage"] == PNG
    assert stored["template"]["logo"] == PNG
    assert stored["customer"]["name"] == "Edited"


def test_a_certificate_without_a_template_is_untouched(seed):
    seed.add_quotation("Q2")
    seed.add_warranty("W2", "Q2", extra={"template": "stone_coated"})
    [cert] = _stream(list_warranties())
    assert cert["template"] == "stone_coated"

    db = SessionLocal()
    try:
        assert db.query(WarrantyCertificate).count() == 1
    finally:
        db.close()
