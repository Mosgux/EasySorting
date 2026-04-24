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
    解析BOM报价单（必填）与订单详情（选填），计算各元件的入库数量。

    有订单：入库量 = 订单采购量 - BOM需求量(每套×套数)
    无订单：入库量 = 报价单购买数量 - BOM需求量(每套×套数)，均为0时全量入库
    元件名称/类型/型号/封装/参数 全部来自报价单。

    返回预览列表，包含 will_stock / quantity_to_stock 字段。
    """
    # 解析BOM报价单（必填）
    bom_items: Dict[str, Dict] = {}
    sets_count = 1
    if bom_quote_file_path:
        raw_boms, sets_count = bom_quote_parser.parse(bom_quote_file_path)
        for item in raw_boms:
            if item['lcsc_id']:
                bom_items[item['lcsc_id']] = item

    # 解析订单详情（选填）
    order_items: Dict[str, Dict] = {}
    if order_file_path:
        for item in order_parser.parse(order_file_path):
            if item['lcsc_id']:
                order_items[item['lcsc_id']] = item

    preview: List[Dict] = []

    # 以报价单为主迭代，订单数据仅用于获取采购量
    for lcsc_id, bom in bom_items.items():
        order = order_items.get(lcsc_id, {})

        qty_needed = (bom.get('quantity_per_set') or 0) * sets_count

        if order:
            # 有订单：以订单实际采购量为准
            qty_ordered = order.get('quantity_ordered', 0)
        else:
            # 无订单：以报价单的购买数量为采购量
            qty_ordered = bom.get('quantity_purchased') or qty_needed or 0

        qty_to_stock = qty_ordered - qty_needed

        # 全部来自报价单
        name      = bom.get('name', '')
        model     = bom.get('model', '')
        package   = bom.get('package', '')
        spec      = bom.get('spec', '')
        comp_type = _resolve_component_type({}, bom)

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
