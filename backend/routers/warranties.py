import json

from fastapi import APIRouter, Body, HTTPException

from database import get_db
from models import WarrantyCertificate

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
    customer = body.get("customer", {})
    db = next(get_db())
    try:
        row = (
            db.query(WarrantyCertificate)
            .filter(WarrantyCertificate.id == wid)
            .first()
        )
        if row is None:
            row = WarrantyCertificate(id=wid)
            db.add(row)
        row.quotation_id = body.get("quotationId", "")
        row.customer_name = customer.get("name", "")
        row.date = body.get("date", "")
        row.data = json.dumps(body)
        db.commit()
        db.refresh(row)
        return json.loads(row.data)
    finally:
        db.close()


@router.delete("/api/warranties")
def clear_warranties():
    db = next(get_db())
    try:
        db.query(WarrantyCertificate).delete()
        db.commit()
        return {"status": "cleared"}
    finally:
        db.close()
