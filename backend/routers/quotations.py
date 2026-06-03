import json

from fastapi import APIRouter, Body, HTTPException

from database import get_db
from models import Quotation, WarrantyCertificate
import sync_state

router = APIRouter()


@router.get("/api/quotations")
def list_quotations():
    db = next(get_db())
    try:
        rows = db.query(Quotation).order_by(Quotation.created_at.desc()).all()
        return [json.loads(r.data) for r in rows]
    finally:
        db.close()


@router.get("/api/quotations/{qid}")
def get_quotation(qid: str):
    db = next(get_db())
    try:
        row = db.query(Quotation).filter(Quotation.id == qid).first()
        if row is None:
            raise HTTPException(status_code=404, detail="Quotation not found")
        return json.loads(row.data)
    finally:
        db.close()


@router.post("/api/quotations")
def save_quotation(body: dict = Body(...)):
    qid = body.get("id")
    if not qid:
        raise HTTPException(status_code=400, detail="id is required")
    customer = body.get("customer", {})
    db = next(get_db())
    try:
        row = db.query(Quotation).filter(Quotation.id == qid).first()
        if row is None:
            row = Quotation(id=qid)
            db.add(row)
        row.customer_name = customer.get("name", "")
        row.grand_total = body.get("grandTotal", 0)
        row.date = body.get("date", "")
        row.data = json.dumps(body)
        db.commit()
        db.refresh(row)
        sync_state.bump()
        return json.loads(row.data)
    finally:
        db.close()


@router.delete("/api/quotations/{qid}")
def delete_quotation(qid: str):
    """Delete a single quotation and CASCADE to its warranty certificates, so no
    orphan warranties are ever left behind."""
    db = next(get_db())
    try:
        deleted = db.query(Quotation).filter(Quotation.id == qid).delete()
        db.query(WarrantyCertificate).filter(
            WarrantyCertificate.quotation_id == qid
        ).delete()
        db.commit()
        sync_state.bump()
        return {"status": "deleted" if deleted else "not_found"}
    finally:
        db.close()


@router.delete("/api/quotations")
def clear_quotations():
    db = next(get_db())
    try:
        # Cascade: clearing all quotations removes every warranty too (warranties
        # cannot exist without their parent quotation).
        db.query(Quotation).delete()
        db.query(WarrantyCertificate).delete()
        db.commit()
        sync_state.bump()
        return {"status": "cleared"}
    finally:
        db.close()
