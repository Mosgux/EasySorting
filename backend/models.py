from sqlalchemy import Column, Integer, String, Float, DateTime, Text
from datetime import datetime
from database import Base


class Component(Base):
    __tablename__ = "components"

    id = Column(Integer, primary_key=True, index=True)
    type = Column(String(50))          # 电阻, 电容, 集成芯片 ...
    name = Column(String(255))         # 商品名称
    model = Column(String(255))        # 型号 / 厂家型号
    lcsc_id = Column(String(50), index=True)  # C12345
    package = Column(String(100))
    value = Column(String(100))        # "10kΩ", "100nF"
    value_norm = Column(Float, nullable=True)   # 归一化数值
    value_unit = Column(String(10), nullable=True)  # Ω / F / H
    spec = Column(Text)                # 完整规格全文
    quantity = Column(Integer, default=0)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class StockInHistory(Base):
    __tablename__ = "stock_in_history"

    id = Column(Integer, primary_key=True, index=True)
    batch_id = Column(String(50), index=True)
    lcsc_id = Column(String(50))
    model = Column(String(255))
    package = Column(String(100))
    quantity_ordered = Column(Integer)
    quantity_needed = Column(Integer)
    quantity_added = Column(Integer)
    created_at = Column(DateTime, default=datetime.utcnow)
