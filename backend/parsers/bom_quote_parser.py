# -*- coding: utf-8 -*-
"""Parse 立创商城BOM报价单 (xls format)"""
import re
import xlrd
from typing import List, Dict, Any, Tuple


def _parse_sets_count(ws) -> int:
    """从第3行中提取采购套数，格式：'采购套数：3'"""
    for j in range(ws.ncols):
        v = str(ws.cell_value(2, j))
        m = re.search(r'采购套数[：:]\s*(\d+)', v)
        if m:
            return int(m.group(1))
    return 1


def parse(file_path: str) -> Tuple[List[Dict[str, Any]], int]:
    """
    解析立创商城BOM报价单.xls。
    返回 (items, sets_count)
    """
    wb = xlrd.open_workbook(file_path)
    ws = wb.sheet_by_index(0)
    sets_count = _parse_sets_count(ws)

    # 自动定位列标题行（含 'Quantity' 且含 'Manufacturer Part'）
    header_row_idx = None
    for i in range(ws.nrows):
        row_vals = [str(ws.cell_value(i, j)).strip() for j in range(ws.ncols)]
        if 'Quantity' in row_vals and 'Manufacturer Part' in row_vals:
            header_row_idx = i
            break

    if header_row_idx is None:
        return [], sets_count

    header = [str(ws.cell_value(header_row_idx, j)).strip() for j in range(ws.ncols)]
    col = {name: idx for idx, name in enumerate(header)}

    def _gcv(row_i: int, col_name: str, default: str = '') -> str:
        idx = col.get(col_name)
        if idx is None:
            return default
        v = ws.cell_value(row_i, idx)
        if v == '' or (isinstance(v, float) and v != v):   # handle nan
            return default
        # xlrd 有时将整数读成浮点，如 1.0 → '1'
        if isinstance(v, float) and v == int(v):
            return str(int(v))
        return str(v).strip()

    def _gcv_first(row_i: int, col_names, default: str = '') -> str:
        for col_name in col_names:
            value = _gcv(row_i, col_name, '')
            if value:
                return value
        return default

    def _gcv_int(row_i: int, col_name: str, default: int = 0) -> int:
        v = _gcv(row_i, col_name)
        try:
            return int(float(v)) if v else default
        except (ValueError, TypeError):
            return default

    items = []
    for i in range(header_row_idx + 1, ws.nrows):
        lcsc_id = _gcv(i, '商品编号').strip()
        # 跳过非数据行：LCSC编号必须以 C 开头且不为空
        if not lcsc_id or not re.match(r'^C\d+$', lcsc_id):
            continue

        item = {
            'lcsc_id':           lcsc_id,
            'manufacturer_part': _gcv(i, 'Manufacturer Part'),
            'manufacturer':      _gcv(i, 'Manufacturer'),
            'footprint_orig':    _gcv(i, 'Footprint'),   # 立创EDA原始封装字符串
            'designator':        _gcv(i, 'Designator'),
            'quantity_per_set':  _gcv_int(i, 'Quantity'),  # 每套需求数
            'catalog':           _gcv_first(i, ['目录', '分类', '类别']),
            'name':              _gcv(i, '商品名称'),
            'model':             _gcv(i, '型号'),
            'brand':             _gcv(i, '品牌'),
            'package':           _gcv(i, '封装'),
            'spec':              _gcv(i, '参数'),
            'quantity_purchased': _gcv_int(i, '购买数量'),  # BOM表中实际购买数
        }
        items.append(item)

    return items, sets_count
