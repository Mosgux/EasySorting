# -*- coding: utf-8 -*-
"""FastAPI 搴旂敤鍏ュ彛"""
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse

from database import Base, engine
from routers import inventory, stock_in, bom_flow

ROOT_DIR = Path(__file__).resolve().parent.parent
FRONTEND_DIST_DIR = ROOT_DIR / "frontend" / "dist"

# 鍒濆鍖栨暟鎹簱琛?
Base.metadata.create_all(bind=engine)

app = FastAPI(
    title="EasySorting",
    description="鐢佃禌鍏冨櫒浠跺簱瀛樼鐞嗙郴缁?,
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


if FRONTEND_DIST_DIR.exists():
    @app.get("/", include_in_schema=False)
    def serve_root():
        return FileResponse(FRONTEND_DIST_DIR / "index.html")


    @app.get("/{full_path:path}", include_in_schema=False)
    def serve_frontend(full_path: str):
        if full_path == "api" or full_path.startswith("api/"):
            raise HTTPException(status_code=404, detail="Not Found")

        asset_path = (FRONTEND_DIST_DIR / full_path).resolve()
        try:
            asset_path.relative_to(FRONTEND_DIST_DIR.resolve())
        except ValueError as exc:
            raise HTTPException(status_code=404, detail="Not Found") from exc

        if asset_path.is_file():
            return FileResponse(asset_path)

        return FileResponse(FRONTEND_DIST_DIR / "index.html")
