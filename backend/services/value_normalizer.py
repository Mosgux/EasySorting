# -*- coding: utf-8 -*-
"""元器件数值归一化（电阻/电容/电感）"""
import re
from typing import Optional, Tuple

# 单位前缀
_MULT = {
    'p': 1e-12, 'n': 1e-9,
    'u': 1e-6,  'μ': 1e-6,
    'm': 1e-3,
    'k': 1e3,   'K': 1e3,
    'M': 1e6,   'G': 1e9,
}

_RESISTOR_SHORTHAND_MULT = {
    'R': 1.0,
    'K': 1e3,
    'M': 1e6,
    'G': 1e9,
}


def _normalize_resistor_shorthand(value_str: str) -> Tuple[Optional[float], Optional[str]]:
    """解析电阻常见简写，如 1k5 / 200R / 10K / 4M7。"""
    s = re.sub(r'\s+', '', str(value_str or '').strip())
    if not s:
        return None, None

    match = re.search(
        r'(?<![A-Za-z0-9])([\d.]+)([RrKkMmGg])(\d+)?(?:Ω|ohm|ohms)?(?![A-Za-z0-9])',
        s,
    )
    if match:
        int_part, mult_char, frac_part = match.groups()
        try:
            number = float(f"{int_part}.{frac_part}") if frac_part else float(int_part)
        except (ValueError, TypeError):
            return None, None
        scale = _RESISTOR_SHORTHAND_MULT.get(mult_char.upper())
        if scale is None:
            return None, None
        return number * scale, 'Ω'

    if re.fullmatch(r'[\d.]+', s):
        try:
            return float(s), 'Ω'
        except (ValueError, TypeError):
            return None, None

    return None, None


def normalize_value(
    value_str: str,
    component_type: Optional[str] = None,
) -> Tuple[Optional[float], Optional[str]]:
    """
    从字符串中提取并归一化元器件数值。
    支持完整规格字符串，如 '薄膜电阻 10kΩ ±0.1% 100mW'。

    返回 (归一化数值, 单位)，单位为 'Ω' / 'F' / 'H'。
    找不到则返回 (None, None)。

    示例:
        '10kΩ'              -> (10000.0, 'Ω')
        '100nF'             -> (1e-07,   'F')
        '2.2uH'             -> (2.2e-06, 'H')
        '1uF ±10% 50V'      -> (1e-06,   'F')
        '薄膜电阻 10kΩ ...'  -> (10000.0, 'Ω')
        '500mΩ'             -> (0.5,     'Ω')
        '1k5'               -> (1500.0,  'Ω')
        '200R'              -> (200.0,   'Ω')
    """
    if not value_str:
        return None, None

    s = str(value_str).strip()

    resistor_norm = _normalize_resistor_shorthand(s)
    if resistor_norm[0] is not None:
        return resistor_norm

    if component_type == '电阻':
        compact = re.sub(r'\s+', '', s)
        if re.fullmatch(r'[\d.]+', compact):
            try:
                return float(compact), 'Ω'
            except (ValueError, TypeError):
                return None, None

    # 模式：数值 [前缀] 单位
    # 例: 10k Ω, 100n F, 2.2u H, 33 Ω, 500m Ω
    patterns = [
        # 电阻: 数值+前缀+Ω (或 ohm)
        (r'([\d.]+)\s*([pnuμmkKMG]?)\s*(Ω|ohm|ohms)\b', 'Ω'),
        # 电容: 数值+前缀+F (F必须有前缀或单独出现在数字后)
        (r'([\d.]+)\s*([pnuμmkKM])\s*F\b', 'F'),
        (r'([\d.]+)\s*F\b(?!\s*[a-zA-Z])', 'F'),
        # 电感: 数值+前缀+H
        (r'([\d.]+)\s*([pnuμmkKM]?)\s*H\b', 'H'),
    ]

    for pattern, unit in patterns:
        m = re.search(pattern, s, re.IGNORECASE)
        if not m:
            continue
        groups = m.groups()
        # groups = (数值, 前缀, 单位) 或 (数值, 前缀) 或 (数值, 单位)
        num_str = groups[0]
        mult_char = ''
        if len(groups) == 3:
            mult_char = groups[1] or ''
        elif len(groups) == 2:
            # 无前缀模式 (second group is unit itself)
            if groups[1] and groups[1] not in ('F',):
                mult_char = groups[1]

        try:
            val = float(num_str)
        except (ValueError, TypeError):
            continue

        if mult_char in _MULT:
            val *= _MULT[mult_char]
        elif mult_char.lower() == 'u':
            val *= 1e-6
        elif mult_char.lower() == 'm' and unit in ('F', 'H'):
            val *= 1e-3
        elif mult_char.lower() == 'm' and unit == 'Ω':
            val *= 1e-3

        return val, unit

    return None, None


def values_match(
    v1: float, u1: Optional[str],
    v2: float, u2: Optional[str],
    tolerance: float = 0.01,
) -> bool:
    """判断两组归一化值是否在容差范围内相等。"""
    if u1 != u2:
        return False
    if v1 == 0 and v2 == 0:
        return True
    if v1 == 0 or v2 == 0:
        return False
    return abs(v1 - v2) / max(abs(v1), abs(v2)) <= tolerance
