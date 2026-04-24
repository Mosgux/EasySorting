# EasySorting

EasySorting 是一个面向电赛/硬件打样场景的元器件库存管理工具，支持 BOM 匹配、订单入库、库存维护和采购单导出。

## 功能概览

- 元件入库：导入立创商城订单详情和 BOM 报价单，自动计算可入库数量，并支持手动修正数量与元件信息。
- 库存管理：支持按类型、型号、封装、参数值和规格搜索库存，并支持批量选择、批量删除、批量倍乘/除以库存数量。
- BOM 匹配导出：导入原始 BOM，与库存自动匹配，支持参数确认、强制匹配和最终采购单导出。
- 动态类型：流程 B 入库类型优先使用立创报价单中的“目录”原文，支持新类型原样流转。

## 技术栈

- 后端：FastAPI、SQLAlchemy、SQLite、pandas、openpyxl、xlrd
- 前端：React、Vite、Ant Design、axios、React Router

## 目录结构

```text
backend/   FastAPI 后端、解析器、匹配服务、库存 API
frontend/  React 前端页面与静态资源
start.bat  一键启动脚本，自动安装缺失后端依赖
release/   本地生成的发布压缩包
```

## 本地启动

### 方式一：一键启动

直接运行 [start.bat](start.bat)。

- 使用系统已安装的 Python 3 启动，不创建虚拟环境。
- 如缺少后端依赖，会自动按 [backend/requirements.txt](backend/requirements.txt) 安装。
- 发布包模式下直接访问 http://127.0.0.1:8000 ，无需再单独启动前端开发服务器。

### 方式二：手动启动

后端：

```powershell
cd backend
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

前端：

```powershell
cd frontend
npm install
npm run dev
```

默认访问地址：

- 前端：http://localhost:5173
- 后端健康检查：http://localhost:8000/api/health

## 使用流程

### 流程 A：BOM 匹配与采购单导出

1. 上传原始 BOM 文件。
2. 查看自动匹配结果。
3. 对参数匹配项进行确认，必要时对未匹配项执行强制匹配。
4. 勾选“使用库存”的元件并导出采购单。

### 流程 B：订单入库

1. 上传订单详情 Excel。
2. 上传 BOM 报价单 Excel。
3. 在预览页调整需求数量、入库数量和元件类型。
4. 确认入库并写入库存数据库。

## 如何获取立创导出文件

元件入库页已内置三步图文引导，说明如何从立创商城导出：

1. 在 BOM 页面进入“我的BOM”。
2. 下载有关联订单的 BOM 报价单。
3. 进入订单页导出订单详情 Excel。

## 版本信息

- 当前本地发布标签：`v1.0.0`
- 本地发布压缩包：[release/easy_sorting_v1_0_0.zip](release/easy_sorting_v1_0_0.zip)

## 说明

- 本项目默认面向本地单用户使用。
- SQLite 数据库文件位于 `backend/easysorting.db`，已通过 `.gitignore` 排除，不纳入仓库版本控制。
