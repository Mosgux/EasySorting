# -*- coding: utf-8 -*-
"""流程 A：BOM 匹配与导出 API"""
import os
import uuid
from typing import List

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from fastapi.responses import FileResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session

from database import get_db
from parsers.bom_parser import parse as parse_bom
from services.classifier import classify_component
from services.export_service import export_pruned_bom
from services.matching_service import match_bom_items
from services.value_normalizer import normalize_value

router = APIRouter(prefix="/api/bom-flow", tags=["bom-flow"])

TEMP_DIR = os.path.join(os.path.dirname(__file__), "..", "temp")
os.makedirs(TEMP_DIR, exist_ok=True)

# 内存会话存储（单用户本地应用，无需持久化）
# key: session_id, value: {"file_path": str, "items": list}
_sessions: dict = {}


# ──────── 上传 & 匹配 ────────

@router.post("/upload")
async def upload_bom(
    bom_file: UploadFile = File(...),
    db: Session = Depends(get_db),
):
    """
    上传原始 BOM.xlsx，自动分类、与库存匹配，返回 session_id 和匹配结果。
    """
    session_id = uuid.uuid4().hex
    file_path = os.path.join(TEMP_DIR, f"bom_{session_id}.xlsx")

    with open(file_path, "wb") as f:
        f.write(await bom_file.read())

    # 解析
    items = parse_bom(file_path)

    # 分类 & 归一化值
    for item in items:
        item["type"] = classify_component(
            item.get("designator", ""),
            item.get("comment", ""),
            item.get("manufacturer_part", ""),
            item.get("value", ""),
        )
        val_str = item.get("value") or item.get("comment") or ""
        item["value_norm"], item["value_unit"] = normalize_value(
            val_str,
            item["type"],
        )

    # 与库存匹配
    matched = match_bom_items(items, db)

    _sessions[session_id] = {
        "file_path": file_path,
        "items": matched,
    }

    return {"session_id": session_id, "items": matched}


# ──────── 刷新匹配（库存变化后重新匹配） ────────

@router.post("/refresh/{session_id}")
def refresh_match(session_id: str, db: Session = Depends(get_db)):
    session = _sessions.get(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="会话不存在或已过期")

    # 重新匹配
    matched = match_bom_items(session["items"], db)
    session["items"] = matched
    return {"items": matched}


# ──────── 导出采购单 ────────

class ExportRequest(BaseModel):
    session_id: str
    excluded_indices: List[int]  # 0-based，用户勾选"使用库存"的行索引


@router.post("/export")
def export_bom(request: ExportRequest):
    """
    导出最终采购单：原始 BOM 中删去 excluded_indices 对应的行。
    导出文件格式与原始 BOM 完全一致。
    """
    session = _sessions.get(request.session_id)
    if not session:
        raise HTTPException(status_code=404, detail="会话不存在或已过期，请重新上传 BOM 文件")

    original_path = session["file_path"]
    if not os.path.exists(original_path):
        raise HTTPException(status_code=404, detail="原始文件已丢失，请重新上传")

    output_path = os.path.join(TEMP_DIR, f"export_{request.session_id}.xlsx")
    export_pruned_bom(original_path, set(request.excluded_indices), output_path)

    return FileResponse(
        path=output_path,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        filename="采购单.xlsx",
    )


# ──────── 清理会话 ────────

@router.delete("/session/{session_id}")
def clear_session(session_id: str):
    """前端关闭流程时主动清理临时文件。"""
    session = _sessions.pop(session_id, None)
    if session:
        fp = session.get("file_path")
        if fp and os.path.exists(fp):
            os.remove(fp)
    return {"ok": True}
