# -*- coding: utf-8 -*-
"""库存 CRUD API"""
from datetime import datetime
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session

from database import get_db
from models import Component
from services.value_normalizer import normalize_value

router = APIRouter(prefix="/api/inventory", tags=["inventory"])


# ──────── Pydantic 模型 ────────

class ComponentCreate(BaseModel):
    type: str
    name: str
    model: Optional[str] = ""
    lcsc_id: Optional[str] = ""
    package: Optional[str] = ""
    value: Optional[str] = ""
    spec: Optional[str] = ""
    quantity: int = 0


class ComponentUpdate(BaseModel):
    type: Optional[str] = None
    name: Optional[str] = None
    model: Optional[str] = None
    lcsc_id: Optional[str] = None
    package: Optional[str] = None
    value: Optional[str] = None
    spec: Optional[str] = None
    quantity: Optional[int] = None


# ──────── 辅助函数 ────────

def _to_dict(comp: Component) -> dict:
    return {
        "id":         comp.id,
        "type":       comp.type,
        "name":       comp.name,
        "model":      comp.model,
        "lcsc_id":    comp.lcsc_id,
        "package":    comp.package,
        "value":      comp.value,
        "value_norm": comp.value_norm,
        "value_unit": comp.value_unit,
        "spec":       comp.spec,
        "quantity":   comp.quantity,
        "created_at": comp.created_at.isoformat() if comp.created_at else None,
        "updated_at": comp.updated_at.isoformat() if comp.updated_at else None,
    }


# ──────── 端点 ────────

@router.get("/")
def list_components(
    comp_type: Optional[str] = Query(None, alias="type"),
    search: Optional[str] = Query(None),
    db: Session = Depends(get_db),
):
    """列出库存元件，支持按类型过滤和智能搜索。"""
    query = db.query(Component)
    if comp_type and comp_type != "全部":
        query = query.filter(Component.type == comp_type)

    items = query.order_by(Component.type, Component.name).all()

    if search and search.strip():
        sl = search.strip().lower()
        sv, su = normalize_value(sl)  # 尝试解析为数值

        filtered = []
        for it in items:
            text = " ".join(filter(None, [
                it.type, it.name, it.model, it.lcsc_id,
                it.package, it.spec, it.value,
            ])).lower()
            # 文本搜索
            if sl in text:
                filtered.append(it)
                continue
            # 数值搜索（±5%）
            if sv is not None and su and it.value_norm and it.value_unit == su:
                diff = abs(it.value_norm - sv) / max(abs(it.value_norm), abs(sv))
                if diff <= 0.05:
                    filtered.append(it)
        items = filtered

    return [_to_dict(c) for c in items]


@router.get("/types")
def get_types(db: Session = Depends(get_db)):
    """返回库存中已有的全部类型，保留原始文本，不再注入本地分类。"""
    raw_types = db.query(Component.type).distinct().order_by(Component.type).all()
    dynamic_types = [item[0] for item in raw_types if item[0]]
    return ["全部"] + dynamic_types


@router.post("/")
def create_component(data: ComponentCreate, db: Session = Depends(get_db)):
    vn, vu = normalize_value(data.value, data.type) if data.value else (None, None)
    if vn is None and data.name:
        vn, vu = normalize_value(data.name, data.type)

    comp = Component(
        type=data.type,
        name=data.name,
        model=data.model or "",
        lcsc_id=data.lcsc_id or "",
        package=data.package or "",
        value=data.value or "",
        value_norm=vn,
        value_unit=vu,
        spec=data.spec or "",
        quantity=data.quantity,
    )
    db.add(comp)
    db.commit()
    db.refresh(comp)
    return _to_dict(comp)


@router.put("/{comp_id}")
def update_component(comp_id: int, data: ComponentUpdate, db: Session = Depends(get_db)):
    comp = db.query(Component).filter(Component.id == comp_id).first()
    if not comp:
        raise HTTPException(status_code=404, detail="Component not found")

    update_data = data.model_dump(exclude_none=True)
    for field, val in update_data.items():
        setattr(comp, field, val)

    # 重新计算归一化值
    if data.value is not None:
        comp.value_norm, comp.value_unit = normalize_value(data.value, comp.type)

    comp.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(comp)
    return _to_dict(comp)


@router.delete("/{comp_id}")
def delete_component(comp_id: int, db: Session = Depends(get_db)):
    comp = db.query(Component).filter(Component.id == comp_id).first()
    if not comp:
        raise HTTPException(status_code=404, detail="Component not found")
    db.delete(comp)
    db.commit()
    return {"ok": True}
