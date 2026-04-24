# -*- coding: utf-8 -*-
"""FastAPI 应用入口"""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from database import Base, engine
from routers import inventory, stock_in, bom_flow

# 初始化数据库表
Base.metadata.create_all(bind=engine)

app = FastAPI(
    title="EasySorting",
    description="电赛元器件库存管理系统",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(inventory.router)
app.include_router(stock_in.router)
app.include_router(bom_flow.router)


@app.get("/api/health")
def health():
    return {"status": "ok", "name": "EasySorting"}
