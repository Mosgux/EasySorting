# -*- coding: utf-8 -*-
"""Parse 立创EDA 原始BOM (xlsx format)"""
import pandas as pd
from typing import List, Dict, Any


def parse(file_path: str) -> List[Dict[str, Any]]:
    """
    解析立创EDA导出的原始BOM.xlsx。
    Row1 = 列标题, Row2+ = 数据。
    返回元件列表。
    """
    df = pd.read_excel(file_path, header=0, dtype=str)
    df.columns = [str(c).strip() for c in df.columns]

    # 尝试兼容可能的列名变体
    col_map = {
        'No.': ['No.', 'No', '序号', '#'],
        'Quantity': ['Quantity', 'Qty', '数量'],
        'Comment': ['Comment', '注释', 'Description'],
        'Designator': ['Designator', '位号', 'RefDes'],
        'Footprint': ['Footprint', '封装', 'Package'],
        'Value': ['Value', '值', 'Val'],
        'Manufacturer Part': ['Manufacturer Part', 'MPN', '制造商料号', 'ManufacturerPart'],
        'Manufacturer': ['Manufacturer', '制造商', 'Mfr'],
        'Supplier Part': ['Supplier Part', 'LCSC#', '供应商料号', '商品编号'],
        'Supplier': ['Supplier', '供应商'],
    }

    def find_col(candidates):
        for c in candidates:
            if c in df.columns:
                return c
        return None

    col_no      = find_col(col_map['No.'])
    col_qty     = find_col(col_map['Quantity'])
    col_comment = find_col(col_map['Comment'])
    col_des     = find_col(col_map['Designator'])
    col_fp      = find_col(col_map['Footprint'])
    col_val     = find_col(col_map['Value'])
    col_mpn     = find_col(col_map['Manufacturer Part'])
    col_mfr     = find_col(col_map['Manufacturer'])
    col_sp      = find_col(col_map['Supplier Part'])
    col_sup     = find_col(col_map['Supplier'])

    def gcell(row, col):
        if col is None:
            return ''
        v = row.get(col, '')
        return '' if (v is None or str(v).strip().lower() == 'nan') else str(v).strip()

    items = []
    for _, row in df.iterrows():
        qty_str = gcell(row, col_qty)
        if not qty_str:
            continue
        try:
            qty = int(float(qty_str))
        except (ValueError, TypeError):
            continue
        if qty <= 0:
            continue

        item = {
            'no':               gcell(row, col_no),
            'quantity':         qty,
            'comment':          gcell(row, col_comment),
            'designator':       gcell(row, col_des),
            'footprint':        gcell(row, col_fp),
            'value':            gcell(row, col_val),
            'manufacturer_part': gcell(row, col_mpn),
            'manufacturer':     gcell(row, col_mfr),
            'supplier_part':    gcell(row, col_sp),
            'supplier':         gcell(row, col_sup),
        }
        items.append(item)

    return items
