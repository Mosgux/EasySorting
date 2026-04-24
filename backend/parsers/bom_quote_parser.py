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

    # 自动定位列标题行
    # 支持两种格式：
    #   1. 立创EDA英文BOM报价单（含 'Quantity' 且含 'Manufacturer Part'）
    #   2. 立创商城网站中文报价单（含 '商品编号'）
    header_row_idx = None
    for i in range(ws.nrows):
        row_vals = [str(ws.cell_value(i, j)).strip() for j in range(ws.ncols)]
        is_eng = 'Quantity' in row_vals and 'Manufacturer Part' in row_vals
        is_chn = '商品编号' in row_vals
        if is_eng or is_chn:
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

    def _gcv_int_first(row_i: int, col_names, default: int = 0) -> int:
        """在多个候选列名中取第一个有值的整数"""
        for col_name in col_names:
            v = _gcv(row_i, col_name, '')
            if v:
                try:
                    return int(float(v))
                except (ValueError, TypeError):
                    pass
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
            # 数量：兼容英文EDA格式('Quantity')和中文报价单('数量'/'购买数量'/'采购数量')
            'quantity_per_set':  _gcv_int_first(i, ['Quantity', '数量', '购买数量', '采购数量']),
            # 目录/分类 → 元件类型，按列名检索，与列位置无关
            'catalog':           _gcv_first(i, ['目录', '分类', '类别', 'Category']),
            # 以下字段均按列名检索，列位置无关
            'name':              _gcv_first(i, ['商品名称', 'Product Name', 'Description']),
            'model':             _gcv_first(i, ['型号', 'Manufacturer Part', 'MPN']),
            'brand':             _gcv_first(i, ['品牌', 'Manufacturer', 'Brand']),
            'package':           _gcv_first(i, ['封装', 'Footprint', 'Package']),
            'spec':              _gcv_first(i, ['参数', '规格', 'Specification', 'Specs']),
            'quantity_purchased': _gcv_int_first(i, ['购买数量', '采购数量', '订购数量']),
        }
        items.append(item)

    return items, sets_count
