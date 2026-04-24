# -*- coding: utf-8 -*-
"""Parse 立创商城订单详情 (xls format)"""
import re
import xlrd
from typing import List, Dict, Any


def _parse_quantity(qty_str: str) -> int:
    """从 '20个'、'100 个'、'3个' 等格式中解析数量"""
    if not qty_str:
        return 0
    cleaned = str(qty_str).replace(',', '').replace(' ', '')
    m = re.search(r'(\d+)', cleaned)
    return int(m.group(1)) if m else 0


def parse(file_path: str) -> List[Dict[str, Any]]:
    """
    解析立创商城订单详情.xls。
    自动定位"商品明细列表"区域，返回元件列表。
    """
    wb = xlrd.open_workbook(file_path)
    ws = wb.sheet_by_index(0)

    # 自动定位列标题行（含 '序号' 且含 '商品编号'）
    header_row_idx = None
    for i in range(ws.nrows):
        row_vals = [str(ws.cell_value(i, j)).strip() for j in range(ws.ncols)]
        if '序号' in row_vals and '商品编号' in row_vals:
            header_row_idx = i
            break

    if header_row_idx is None:
        return []

    # 构建列名→索引映射（strip 空格）
    header = [str(ws.cell_value(header_row_idx, j)).strip() for j in range(ws.ncols)]
    col = {name: idx for idx, name in enumerate(header)}

    def _gcv(row_i: int, col_name: str, default: str = '') -> str:
        c = col.get(col_name)
        if c is None:
            return default
        v = ws.cell_value(row_i, c)
        if v == '' or (isinstance(v, float) and v != v):
            return default
        if isinstance(v, float) and v == int(v):
            return str(int(v))
        return str(v).strip()

    # 兼容"订购数量（修改后）"和"订购数量"两种列名
    qty_col = '订购数量（修改后）' if '订购数量（修改后）' in col else '订购数量'

    items = []
    for i in range(header_row_idx + 1, ws.nrows):
        lcsc_id = _gcv(i, '商品编号')
        if not lcsc_id or not re.match(r'^C\d+$', lcsc_id):
            continue

        qty_str = _gcv(i, qty_col)
        item = {
            'no':               _gcv(i, '序号'),
            'lcsc_id':          lcsc_id,
            'brand':            _gcv(i, '品牌'),
            'model':            _gcv(i, '厂家型号'),
            'package':          _gcv(i, '封装'),
            'name':             _gcv(i, '商品名称'),
            'quantity_ordered': _parse_quantity(qty_str),
            'unit_price':       _gcv(i, '商品单价'),
        }
        items.append(item)

    return items
