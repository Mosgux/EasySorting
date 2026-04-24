# -*- coding: utf-8 -*-
"""入库计算服务（流程 B）"""
import re
from typing import List, Dict, Any, Optional

from parsers import order_parser, bom_quote_parser
from services.value_normalizer import normalize_value


def _extract_value_str(name: str) -> str:
    """从商品名称中提取主要数值字符串，如 '10kΩ', '100nF'"""
    m = re.search(
        r'([\d.]+\s*[pnuμmkKMG]?\s*(?:Ω|ohm|F|H))',
        name or '', re.IGNORECASE
    )
    return m.group(1).strip() if m else ''


def _resolve_component_type(order: Dict[str, Any], bom: Dict[str, Any]) -> str:
    """流程B入库类型只使用 BOM 报价单目录列，缺失时标记为未分类。"""
    bom_catalog = (bom.get('catalog') or '').strip()
    if bom_catalog:
        return bom_catalog
    return '未分类'


def parse_stock_in(
    order_file_path: Optional[str],
    bom_quote_file_path: Optional[str],
    manual_quantities: Optional[Dict[str, int]] = None,
) -> List[Dict[str, Any]]:
    """
    解析订单详情与BOM报价单，计算各元件的入库数量。

    入库量 = 订单数量 - BOM需求数量(每套×套数)
    若无BOM报价单，则 BOM需求数量 从 manual_quantities 获取，
    若两者均无，入库量 = 订单数量（全入库）。

    返回预览列表，包含 will_stock / quantity_to_stock 字段。
    """
    # 解析订单详情
    order_items: Dict[str, Dict] = {}
    if order_file_path:
        for item in order_parser.parse(order_file_path):
            if item['lcsc_id']:
                order_items[item['lcsc_id']] = item

    # 解析BOM报价单
    bom_items: Dict[str, Dict] = {}
    sets_count = 1
    if bom_quote_file_path:
        raw_boms, sets_count = bom_quote_parser.parse(bom_quote_file_path)
        for item in raw_boms:
            if item['lcsc_id']:
                bom_items[item['lcsc_id']] = item

    preview: List[Dict] = []
    for lcsc_id, order in order_items.items():
        bom = bom_items.get(lcsc_id, {})

        qty_ordered = order.get('quantity_ordered', 0)

        # 计算需求数量
        if bom:
            qty_needed = (bom.get('quantity_per_set') or 0) * sets_count
        elif manual_quantities and lcsc_id in manual_quantities:
            qty_needed = manual_quantities[lcsc_id]
        else:
            qty_needed = 0  # 无BOM信息时全量入库

        qty_to_stock = qty_ordered - qty_needed

        # 聚合元件信息
        name    = order.get('name') or bom.get('name', '')
        model   = order.get('model') or bom.get('model', '')
        package = order.get('package') or bom.get('package', '')
        spec    = bom.get('spec', '')
        comp_type = _resolve_component_type(order, bom)

        val_str = _extract_value_str(name)
        value_norm, value_unit = normalize_value(val_str, comp_type)

        preview.append({
            'lcsc_id':          lcsc_id,
            'name':             name,
            'model':            model,
            'package':          package,
            'spec':             spec,
            'type':             comp_type,
            'value':            val_str,
            'value_norm':       value_norm,
            'value_unit':       value_unit,
            'quantity_ordered': qty_ordered,
            'quantity_needed':  qty_needed,
            'quantity_to_stock': qty_to_stock,
            'will_stock':       qty_to_stock > 0,
        })

    # 按类型+名称排序
    preview.sort(key=lambda x: (x['type'], x['name']))
    return preview
