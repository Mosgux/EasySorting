# -*- coding: utf-8 -*-
"""出库 API — 记录、回滚"""
import uuid
from datetime import datetime
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from database import get_db
from models import Component, StockOutHistory

router = APIRouter(prefix="/api/stock-out", tags=["stock-out"])


# ──────── Schema ────────

class StockOutItemSchema(BaseModel):
    component_id: int
    lcsc_id: Optional[str] = ""
    model: Optional[str] = ""
    package: Optional[str] = ""
    name: Optional[str] = ""
    designator: Optional[str] = ""
    quantity_out: int          # BOM 中的需求量


class StockOutConfirmRequest(BaseModel):
    items: List[StockOutItemSchema]


# ──────── 端点 ────────

@router.post("/confirm")
def confirm_stock_out(
    request: StockOutConfirmRequest,
    db: Session = Depends(get_db),
):
    """
    执行出库操作。
    - 库存充足的元件正常出库并记录历史；
    - 库存不足的元件跳过（quantity_out > quantity），记录在 skipped_items 中返回。
    每次出库共享同一个 batch_id，支持整批次回滚。
    """
    batch_id = str(uuid.uuid4())
    success_count = 0
    skipped_items = []

    for item in request.items:
        if item.quantity_out <= 0:
            continue

        comp = db.query(Component).filter(Component.id == item.component_id).first()
        if not comp:
            skipped_items.append({
                "lcsc_id": item.lcsc_id,
                "model": item.model,
                "reason": "元件不存在于库存",
            })
            continue

        if comp.quantity < item.quantity_out:
            skipped_items.append({
                "lcsc_id": item.lcsc_id,
                "model": item.model or comp.model,
                "package": item.package or comp.package,
                "quantity_out": item.quantity_out,
                "quantity_available": comp.quantity,
                "reason": f"库存不足（需要 {item.quantity_out}，仅有 {comp.quantity}）",
            })
            continue

        qty_before = comp.quantity
        comp.quantity -= item.quantity_out
        comp.updated_at = datetime.utcnow()
        qty_after = comp.quantity

        db.add(StockOutHistory(
            batch_id=batch_id,
            component_id=comp.id,
            lcsc_id=item.lcsc_id or comp.lcsc_id or "",
            model=item.model or comp.model or "",
            package=item.package or comp.package or "",
            name=item.name or comp.name or "",
            designator=item.designator or "",
            quantity_out=item.quantity_out,
            quantity_before=qty_before,
            quantity_after=qty_after,
        ))
        success_count += 1

    db.commit()
    return {
        "ok": True,
        "batch_id": batch_id,
        "success_count": success_count,
        "skipped_items": skipped_items,
    }


@router.get("/history")
def get_history(db: Session = Depends(get_db)):
    """按批次分组返回出库历史，每批次包含明细列表。"""
    records = (
        db.query(StockOutHistory)
        .order_by(StockOutHistory.created_at.desc())
        .all()
    )
    batches: dict = {}
    for h in records:
        if h.batch_id not in batches:
            batches[h.batch_id] = {
                "batch_id":   h.batch_id,
                "created_at": h.created_at.isoformat() if h.created_at else None,
                "rolled_back": h.rolled_back,
                "items":      [],
            }
        batches[h.batch_id]["items"].append({
            "id":              h.id,
            "component_id":    h.component_id,
            "lcsc_id":         h.lcsc_id,
            "model":           h.model,
            "package":         h.package,
            "name":            h.name,
            "designator":      h.designator,
            "quantity_out":    h.quantity_out,
            "quantity_before": h.quantity_before,
            "quantity_after":  h.quantity_after,
        })
    return list(batches.values())


@router.post("/rollback/{batch_id}")
def rollback_stock_out(batch_id: str, db: Session = Depends(get_db)):
    """
    整批次回滚出库操作：
    - 将该批次所有记录的出库量加回对应元件的库存；
    - 标记批次为 rolled_back=True；
    - 防止重复回滚。
    """
    records = (
        db.query(StockOutHistory)
        .filter(StockOutHistory.batch_id == batch_id)
        .all()
    )
    if not records:
        raise HTTPException(status_code=404, detail="找不到该出库批次")

    if any(r.rolled_back for r in records):
        raise HTTPException(status_code=400, detail="该批次已回滚，不可重复操作")

    restored_count = 0
    for h in records:
        comp = db.query(Component).filter(Component.id == h.component_id).first()
        if comp:
            comp.quantity += h.quantity_out
            comp.updated_at = datetime.utcnow()
        h.rolled_back = True
        restored_count += 1

    db.commit()
    return {"ok": True, "restored_count": restored_count}
