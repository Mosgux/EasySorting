# -*- coding: utf-8 -*-
"""流程 B：入库 API"""
import json
import os
import uuid
from datetime import datetime
from typing import List, Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from pydantic import BaseModel
from sqlalchemy.orm import Session

from database import get_db
from models import Component, StockInHistory
from services import stock_in_service
from services.value_normalizer import normalize_value

router = APIRouter(prefix="/api/stock-in", tags=["stock-in"])

TEMP_DIR = os.path.join(os.path.dirname(__file__), "..", "temp")
os.makedirs(TEMP_DIR, exist_ok=True)


# ──────── 端点 ────────

@router.post("/parse")
async def parse_stock_in(
    order_file: Optional[UploadFile] = File(None),
    bom_quote_file: Optional[UploadFile] = File(None),
    manual_quantities: Optional[str] = Form(None),  # JSON: {"C12345": 10}
):
    """
    解析订单详情 + BOM报价单，返回入库预览列表。
    至少需要上传 order_file；bom_quote_file 可选。
    若不提供 bom_quote_file，可通过 manual_quantities 指定需求数量。
    """
    if not order_file:
        raise HTTPException(status_code=400, detail="必须上传订单详情文件")

    order_path = bom_path = None
    try:
        # 保存临时文件
        order_path = os.path.join(TEMP_DIR, f"order_{uuid.uuid4().hex}.xls")
        with open(order_path, "wb") as f:
            f.write(await order_file.read())

        if bom_quote_file:
            bom_path = os.path.join(TEMP_DIR, f"bom_quote_{uuid.uuid4().hex}.xls")
            with open(bom_path, "wb") as f:
                f.write(await bom_quote_file.read())

        manual_qty = json.loads(manual_quantities) if manual_quantities else None

        items = stock_in_service.parse_stock_in(order_path, bom_path, manual_qty)
        return {"items": items, "total": len(items)}

    finally:
        for p in [order_path, bom_path]:
            if p and os.path.exists(p):
                os.remove(p)


# ──────── 确认入库 ────────

class StockInItemSchema(BaseModel):
    lcsc_id: Optional[str] = ""
    name: str
    model: Optional[str] = ""
    package: Optional[str] = ""
    type: str
    value: Optional[str] = ""
    value_norm: Optional[float] = None
    value_unit: Optional[str] = None
    spec: Optional[str] = ""
    quantity_ordered: int
    quantity_needed: int
    quantity_to_stock: int


class StockInConfirmRequest(BaseModel):
    items: List[StockInItemSchema]


@router.post("/confirm")
def confirm_stock_in(
    request: StockInConfirmRequest,
    db: Session = Depends(get_db),
):
    """将用户确认的预览条目写入库存（数量累加），并记录入库历史。"""
    batch_id = str(uuid.uuid4())
    added_count = 0

    for item in request.items:
        if item.quantity_to_stock <= 0:
            continue

        # 查找已有库存条目
        comp = None
        if item.lcsc_id:
            comp = db.query(Component).filter(Component.lcsc_id == item.lcsc_id).first()
        if not comp and item.model and item.package:
            comp = (
                db.query(Component)
                .filter(Component.model == item.model, Component.package == item.package)
                .first()
            )

        if comp:
            comp.quantity += item.quantity_to_stock
            comp.updated_at = datetime.utcnow()
        else:
            vn = item.value_norm
            vu = item.value_unit
            if not vn and item.value:
                vn, vu = normalize_value(item.value, item.type)
            if not vn and item.name:
                vn, vu = normalize_value(item.name, item.type)
            comp = Component(
                type=item.type,
                name=item.name,
                model=item.model or "",
                lcsc_id=item.lcsc_id or "",
                package=item.package or "",
                value=item.value or "",
                value_norm=vn,
                value_unit=vu,
                spec=item.spec or "",
                quantity=item.quantity_to_stock,
            )
            db.add(comp)

        db.add(StockInHistory(
            batch_id=batch_id,
            lcsc_id=item.lcsc_id or "",
            model=item.model or "",
            package=item.package or "",
            quantity_ordered=item.quantity_ordered,
            quantity_needed=item.quantity_needed,
            quantity_added=item.quantity_to_stock,
        ))
        added_count += 1

    db.commit()
    return {"ok": True, "batch_id": batch_id, "added_count": added_count}


@router.get("/history")
def get_history(db: Session = Depends(get_db)):
    """按批次分组返回入库历史。"""
    records = (
        db.query(StockInHistory)
        .order_by(StockInHistory.created_at.desc())
        .all()
    )
    batches: dict = {}
    for h in records:
        if h.batch_id not in batches:
            batches[h.batch_id] = {
                "batch_id":   h.batch_id,
                "created_at": h.created_at.isoformat() if h.created_at else None,
                "items":      [],
            }
        batches[h.batch_id]["items"].append({
            "id":               h.id,
            "lcsc_id":          h.lcsc_id,
            "model":            h.model,
            "package":          h.package,
            "quantity_ordered": h.quantity_ordered,
            "quantity_needed":  h.quantity_needed,
            "quantity_added":   h.quantity_added,
        })
    return list(batches.values())
