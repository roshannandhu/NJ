import json
from datetime import datetime

from fastapi import APIRouter, Body, HTTPException, Response

from database import get_db
from models import WarrantyCertificate, Quotation
import backup_service
from routers.json_stream import stream_json_rows

router = APIRouter()


def _without_snapshot_artwork(cert):
    """Drop the base64 seal / logo / signature copied into a certificate's
    template snapshot.

    Every certificate stores a snapshot of its warranty template, artwork and
    all, so 157 certificates carry ~21 MB of the same eight images — 96% of
    what this list returns, fetched before the app can show anything. Nothing
    renders from it: WarrantyDocument and QuotationDocument resolve the LIVE
    template for logo, seal and signature and use the snapshot only when the
    template was deleted (and the seal then falls back to the drawn one).
    Text (sections, tables, opening) stays, so that fallback still works, and
    GET /api/warranties/{id} still returns the record whole.
    """
    tpl = cert.get("template")
    if isinstance(tpl, dict):
        for key, value in list(tpl.items()):
            if isinstance(value, str) and value.startswith("data:"):
                del tpl[key]
    return cert


def _keep_stored_artwork(incoming, stored_raw):
    """Put back any base64 artwork the stored snapshot has and the incoming
    template is missing — the read side strips it, so a round-trip through the
    UI would otherwise delete it."""
    if not isinstance(incoming, dict):
        return incoming
    try:
        stored = (json.loads(stored_raw or "{}") or {}).get("template")
    except (ValueError, TypeError):
        return incoming
    if not isinstance(stored, dict):
        return incoming
    for key, value in stored.items():
        if key not in incoming and isinstance(value, str) and value.startswith("data:"):
            incoming[key] = value
    return incoming


@router.get("/api/warranties")
def list_warranties():
    return stream_json_rows(
        WarrantyCertificate,
        order_by=WarrantyCertificate.created_at.desc(),
        transform=_without_snapshot_artwork,
    )


@router.get("/api/warranties/{wid}")
def get_warranty(wid: str):
    db = next(get_db())
    try:
        row = (
            db.query(WarrantyCertificate)
            .filter(WarrantyCertificate.id == wid)
            .first()
        )
        if row is None:
            raise HTTPException(status_code=404, detail="Warranty not found")
        return Response(content=row.data, media_type="application/json")
    finally:
        db.close()


@router.post("/api/warranties")
def save_warranty(body: dict = Body(...)):
    wid = body.get("id")
    if not wid:
        raise HTTPException(status_code=400, detail="id is required")
    # A warranty is never standalone — it must be linked to an existing quotation.
    # This guarantees no orphan certificates can ever be created or updated.
    quotation_id = body.get("quotationId", "")
    if not quotation_id:
        raise HTTPException(status_code=400, detail="warranty must be linked to a quotation")
    customer = body.get("customer", {})
    db = next(get_db())
    try:
        parent = db.query(Quotation).filter(Quotation.id == quotation_id).first()
        if parent is None:
            raise HTTPException(status_code=400, detail="linked quotation does not exist")
        row = (
            db.query(WarrantyCertificate)
            .filter(WarrantyCertificate.id == wid)
            .first()
        )
        is_new = row is None
        if is_new:
            row = WarrantyCertificate(id=wid)
            db.add(row)
        new_version = 1 if is_new else (row.version or 1) + 1
        now = datetime.utcnow()
        row.quotation_id = quotation_id
        row.customer_name = customer.get("name", "")
        row.date = body.get("date", "")
        row.version = new_version
        row.updated_at = now
        body["version"] = new_version
        body["updatedAt"] = now.isoformat()
        if is_new:
            body["createdAt"] = now.isoformat()
        # A client that loaded this certificate from the list has no snapshot
        # artwork any more (see _without_snapshot_artwork), so saving an edit
        # must not wipe it from the stored record.
        if not is_new:
            body["template"] = _keep_stored_artwork(body.get("template"), row.data)
        row.data = json.dumps(body)
        db.commit()
        db.refresh(row)
        backup_service.notify_change("warranty", "created" if is_new else "edited", wid)
        return json.loads(row.data)
    finally:
        db.close()


@router.delete("/api/warranties")
def clear_warranties():
    db = next(get_db())
    try:
        db.query(WarrantyCertificate).delete()
        db.commit()
        backup_service.notify_change("warranty", "cleared", None)
        return {"status": "cleared"}
    finally:
        db.close()


@router.delete("/api/warranties/{wid}")
def delete_warranty(wid: str):
    """Delete a single warranty certificate by id. Used when a quotation is
    regenerated and a previously auto-generated warranty no longer applies
    (its product class was removed from the cart)."""
    db = next(get_db())
    try:
        deleted = (
            db.query(WarrantyCertificate)
            .filter(WarrantyCertificate.id == wid)
            .delete()
        )
        db.commit()
        if deleted:
            backup_service.notify_change("warranty", "deleted", wid)
        return {"status": "deleted" if deleted else "not_found"}
    finally:
        db.close()
