# -*- coding: utf-8 -*-
"""BOM 与库存匹配引擎"""
import re
from typing import List, Dict, Any, Optional

from sqlalchemy.orm import Session
from models import Component
from services.classifier import PRECISE_MATCH_TYPES, PARAM_MATCH_TYPES
from services.value_normalizer import normalize_value, values_match


# ──────────────────────────────────────────────
# 工具函数
# ──────────────────────────────────────────────

def _norm_model(s: str) -> str:
    """型号归一化：去空格、大写"""
    return re.sub(r'\s+', '', (s or '').strip().upper())


def _norm_pkg(s: str) -> str:
    """
    封装归一化：去掉 EDA 工具的位号前缀（C0603 / R0603 / L1206 / FB1206），
    去除连字符/下划线/空格，统一大写。
    """
    s = (s or '').strip().upper()
    s = re.split(r'[_\-\s]', s)[0]

    # 去掉立创EDA常见的被动器件位号前缀，仅在后续明显是封装码时才处理。
    prefix_match = re.match(
        r'^(?:C|R|L|FB|BL|FL)(0[24568]\d\d|12\d\d|16\d\d|20\d\d|25\d\d)$',
        s,
    )
    if prefix_match:
        return prefix_match.group(1)

    # 去掉立创EDA常见的 C 前缀 (C0402, C0603, C0805 ...)
    if re.match(r'^C(0[24568]|12|16|20|25)\d\d', s):
        s = s[1:]
    return s


def _inv_to_dict(inv: Component) -> Dict:
    return {
        'id':         inv.id,
        'type':       inv.type,
        'name':       inv.name,
        'model':      inv.model,
        'lcsc_id':    inv.lcsc_id,
        'package':    inv.package,
        'value':      inv.value,
        'value_norm': inv.value_norm,
        'value_unit': inv.value_unit,
        'spec':       inv.spec,
        'quantity':   inv.quantity,
    }


# ──────────────────────────────────────────────
# 公共接口
# ──────────────────────────────────────────────

def match_bom_items(bom_items: List[Dict], db: Session) -> List[Dict]:
    """
    对 BOM 中每条元件与库存进行匹配。
    返回带 match_status / matched_inventory / match_candidates 字段的列表。

    match_status:
      'precise_match'  — 型号+封装完全匹配（IC 类）
      'param_match'    — 封装+参数值匹配（电阻/电容/电感，需二次确认）
      'no_match'       — 未找到库存
    """
    # 一次性加载库存（本地小应用不存在性能问题）
    all_invs = db.query(Component).filter(Component.quantity > 0).all()

    result = []
    for idx, item in enumerate(bom_items):
        comp_type = item.get('type', '其他')
        qty_need  = item.get('quantity', 0)

        # 对所有器件先做一次“同料号/同封装”的精确命中，避免类型误判导致漏配。
        exact_match = _precise_match(item, all_invs, qty_need)
        if exact_match.get('match_status') == 'precise_match':
            match = exact_match
        elif comp_type in PARAM_MATCH_TYPES:
            match = _param_match(item, comp_type, all_invs, qty_need)
        else:
            match = exact_match

        result.append({**item, **match, 'index': idx})

    return result


# ──────────────────────────────────────────────
# 精确匹配（IC / MOSFET / 二极管 / 三极管 / LED …）
# ──────────────────────────────────────────────

def _precise_match(item: Dict, inventory: List[Component], qty_need: int) -> Dict:
    # 1. 优先按 LCSC 编号匹配
    lcsc = (item.get('supplier_part') or '').strip()
    if lcsc.startswith('C'):
        for inv in inventory:
            if inv.lcsc_id == lcsc:
                return _hit('precise_match', inv, qty_need)

    # 2. 型号 + 封装匹配
    bom_model = _norm_model(item.get('manufacturer_part') or item.get('comment') or '')
    bom_pkg   = _norm_pkg(item.get('footprint') or '')

    if bom_model:
        for inv in inventory:
            if _norm_model(inv.model or '') == bom_model:
                if not bom_pkg or not inv.package or _norm_pkg(inv.package) == bom_pkg:
                    return _hit('precise_match', inv, qty_need)

    return {'match_status': 'no_match', 'matched_inventory': None, 'match_candidates': []}


# ──────────────────────────────────────────────
# 参数匹配（电阻 / 电容 / 电感）
# ──────────────────────────────────────────────

def _param_match(item: Dict, comp_type: str, inventory: List[Component], qty_need: int) -> Dict:
    val_str = item.get('value') or item.get('comment') or ''
    bom_norm, bom_unit = normalize_value(val_str, comp_type)
    bom_pkg = _norm_pkg(item.get('footprint') or '')

    if bom_norm is None or bom_unit is None:
        return {'match_status': 'no_match', 'matched_inventory': None, 'match_candidates': []}

    candidates = []
    for inv in inventory:
        if inv.type != comp_type:
            continue

        inv_norm = inv.value_norm
        inv_unit = inv.value_unit
        if inv_norm is None:
            inv_norm, inv_unit = normalize_value(inv.value or inv.name or '', inv.type)

        if inv_norm is None or inv_unit != bom_unit:
            continue
        # 封装必须一致（若均有值）
        if bom_pkg and inv.package and _norm_pkg(inv.package) != bom_pkg:
            continue
        if values_match(bom_norm, bom_unit, inv_norm, inv_unit):
            candidates.append(inv)

    if not candidates:
        return {'match_status': 'no_match', 'matched_inventory': None, 'match_candidates': []}

    # 优先推荐库存最多的
    best = max(candidates, key=lambda x: x.quantity)
    return {
        'match_status':     'param_match',
        'matched_inventory': _inv_to_dict(best),
        'match_candidates':  [_inv_to_dict(c) for c in candidates],
        'stock_sufficient':  any(c.quantity >= qty_need for c in candidates),
    }


def _hit(status: str, inv: Component, qty_need: int) -> Dict:
    return {
        'match_status':      status,
        'matched_inventory': _inv_to_dict(inv),
        'match_candidates':  [_inv_to_dict(inv)],
        'stock_sufficient':  inv.quantity >= qty_need,
    }
