# -*- coding: utf-8 -*-
"""元器件类型自动分类"""
import re
from typing import Set

COMPONENT_TYPES = [
    "集成芯片", "电阻", "电容", "电感",
    "二极管", "三极管", "MOSFET", "LED",
    "晶振", "连接器", "磁珠", "其他",
]

# 精确匹配类（型号 + 封装一致才算库存可用）
PRECISE_MATCH_TYPES: Set[str] = {
    "集成芯片", "MOSFET", "二极管", "三极管", "LED", "晶振", "连接器", "磁珠",
}

# 参数匹配类（封装 + 归一化值匹配，进入二次确认）
PARAM_MATCH_TYPES: Set[str] = {"电阻", "电容", "电感"}


def classify_component(
    designator: str,
    name: str,
    model: str,
    value: str = "",
    spec: str = "",
) -> str:
    """
    根据位号前缀 > 名称/型号关键字 判断元器件类型。
    """
    des = (designator or "").upper().strip()
    # 取第一个位号（可能是 "C1,C2" 这样的组合位号）
    if "," in des:
        des = des.split(",")[0].strip()

    text = " ".join([
        (name or "").lower(),
        (model or "").lower(),
        (spec or "").lower(),
        (value or "").lower(),
    ])

    # ---- 位号前缀优先匹配 ----
    if re.match(r'^R\d', des) or re.match(r'^RN\d', des):
        return "电阻"
    if re.match(r'^C\d', des):
        return "电容"
    if re.match(r'^FB\d', des) or re.match(r'^BL\d', des) or re.match(r'^FL\d', des):
        return "磁珠"
    if re.match(r'^L\d', des):
        return "电感"
    if re.match(r'^U\d', des) or re.match(r'^IC\d', des):
        return "集成芯片"
    if re.match(r'^Q\d', des) or re.match(r'^MOS\d', des):
        if any(kw in text for kw in ("mosfet", "mos管", "nmos", "pmos", "nch", "pch")):
            return "MOSFET"
        return "三极管"
    if re.match(r'^D\d', des):
        if any(kw in text for kw in ("led", "发光")):
            return "LED"
        return "二极管"
    if re.match(r'^LED', des):
        return "LED"
    if re.match(r'^Y\d', des) or re.match(r'^X\d', des) or re.match(r'^XT\d', des):
        return "晶振"
    if re.match(r'^(J\d|CN\d|P\d)', des):
        return "连接器"

    # ---- 名称/规格关键字匹配 ----
    kw_map = {
        "电阻":   ["电阻", "薄膜电阻", "厚膜电阻", "精密电阻", "resistor"],
        "电容":   ["电容", "capacitor", "陶瓷电容", "铝电解", "钽电容"],
        "电感":   ["电感", "inductor", "绕线电感", "功率电感"],
        "磁珠":   ["磁珠", "ferrite", "阻抗@"],
        "LED":    ["led", "发光二极管", "发光管", "红灯", "绿灯", "蓝灯", "白灯"],
        "二极管": ["二极管", "diode", "肖特基", "tvs", "稳压管", "zener", "整流"],
        "三极管": ["三极管", "npn", "pnp", "transistor", "bjt"],
        "MOSFET": ["mosfet", "mos管", "场效应", "nmos", "pmos", "nch", "pch"],
        "晶振":   ["晶振", "振荡器", "crystal", "谐振"],
        "连接器": ["连接器", "插座", "接插件", "header", "connector", "wafer", "端子"],
        "集成芯片": [
            "芯片", "单片机", "mcu", "adc", "dac", "运放", "ldo",
            "降压", "升压", "并联调整", "稳压器", "比较器", "驱动器",
            "控制器", "处理器",
        ],
    }
    for comp_type, kws in kw_map.items():
        if any(kw in text for kw in kws):
            return comp_type

    # 型号看起来像IC（字母+数字组合且较长）
    m = model or ""
    if len(m) >= 4 and re.search(r'[A-Z]{2,}\d', m.upper()):
        return "集成芯片"

    return "其他"
