import json
from datetime import datetime

from fastapi import APIRouter, Body, HTTPException

from database import get_db
from models import WarrantyCertificate, Quotation
import sync_state

router = APIRouter()


@router.get("/api/warranties")
def list_warranties():
    db = next(get_db())
    try:
        rows = (
            db.query(WarrantyCertificate)
            .order_by(WarrantyCertificate.created_at.desc())
            .all()
        )
        return [json.loads(r.data) for r in rows]
    finally:
        db.close()


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
        return json.loads(row.data)
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
        if row is None:
            row = WarrantyCertificate(id=wid)
            db.add(row)
        row.quotation_id = quotation_id
        row.customer_name = customer.get("name", "")
        row.date = body.get("date", "")
        row.data = json.dumps(body)
        row.updated_at = datetime.utcnow()
        db.commit()
        db.refresh(row)
        sync_state.bump()
        return json.loads(row.data)
    finally:
        db.close()


@router.delete("/api/warranties")
def clear_warranties():
    db = next(get_db())
    try:
        db.query(WarrantyCertificate).delete()
        db.commit()
        sync_state.bump()
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
        sync_state.bump()
        return {"status": "deleted" if deleted else "not_found"}
    finally:
        db.close()
