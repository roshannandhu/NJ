import json
from pathlib import Path

from fastapi import APIRouter, HTTPException
from fastapi.responses import Response
from jinja2 import Environment, FileSystemLoader

from database import get_db
from models import AppConfig, Quotation, WarrantyCertificate

WEASY_OK = True
try:
    import weasyprint
except Exception:
    WEASY_OK = False


router = APIRouter()

TEMPLATES_DIR = Path(__file__).resolve().parent.parent / "templates"
env = Environment(loader=FileSystemLoader(str(TEMPLATES_DIR)))


@router.get("/api/quotations/{qid}/pdf")
def quotation_pdf(qid: str):
    if not WEASY_OK:
        raise HTTPException(
            status_code=500,
            detail="WeasyPrint not installed. Install GTK3 runtime.",
        )

    db = next(get_db())
    try:
        q_row = db.query(Quotation).filter(Quotation.id == qid).first()
        if q_row is None:
            raise HTTPException(status_code=404, detail="Quotation not found")

        cfg_row = db.query(AppConfig).filter(AppConfig.id == 1).first()
        cfg = json.loads(cfg_row.data) if cfg_row else {}
    finally:
        db.close()

    company = cfg.get("company", {})
    settings = cfg.get("settings", {})
    currency = settings.get("currencySymbol", "\u20b9")
    quotation = json.loads(q_row.data)

    template = env.get_template("quotation.html")
    html = template.render(
        company=company,
        settings=settings,
        quotation=quotation,
        currency=currency,
    )

    pdf_bytes = weasyprint.HTML(string=html).write_pdf()

    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={
            "Content-Disposition": f'inline; filename="{qid}.pdf"'
        },
    )


@router.get("/api/warranties/{wid}/pdf")
def warranty_pdf(wid: str):
    if not WEASY_OK:
        raise HTTPException(
            status_code=500,
            detail="WeasyPrint not installed. Install GTK3 runtime.",
        )

    db = next(get_db())
    try:
        w_row = (
            db.query(WarrantyCertificate)
            .filter(WarrantyCertificate.id == wid)
            .first()
        )
        if w_row is None:
            raise HTTPException(status_code=404, detail="Warranty not found")
    finally:
        db.close()

    cert = json.loads(w_row.data)
    template = cert.get("template", {})
    certData = cert.get("certData", {})
    customer = cert.get("customer", {})

    tmpl = env.get_template("warranty.html")
    html = tmpl.render(
        cert=cert,
        template=template,
        certData=certData,
        customer=customer,
    )

    pdf_bytes = weasyprint.HTML(string=html).write_pdf()

    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={
            "Content-Disposition": f'inline; filename="{wid}.pdf"'
        },
    )
