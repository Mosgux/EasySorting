import axios from "axios";

const api = axios.create({
  baseURL: "/api",
  timeout: 30000,
});

// 拦截器：统一错误处理
api.interceptors.response.use(
  (res) => res.data,
  (err) => {
    const msg = err?.response?.data?.detail || err.message || "请求失败";
    return Promise.reject(new Error(msg));
  },
);

// ─── 库存 API ───────────────────────────────────────────
export const inventoryApi = {
  list: (params) => api.get("/inventory/", { params }),
  getTypes: () => api.get("/inventory/types"),
  create: (data) => api.post("/inventory/", data),
  update: (id, data) => api.put(`/inventory/${id}`, data),
  delete: (id) => api.delete(`/inventory/${id}`),
};

// ─── 入库 API（流程B） ──────────────────────────────────
export const stockInApi = {
  parse: (formData) =>
    api.post("/stock-in/parse", formData, {
      headers: { "Content-Type": "multipart/form-data" },
    }),
  confirm: (items) => api.post("/stock-in/confirm", { items }),
  history: () => api.get("/stock-in/history"),
  rollback: (batchId) => api.post(`/stock-in/rollback/${batchId}`),
};

// ─── 出库 API ─────────────────────────────────────────
export const stockOutApi = {
  confirm: (items) => api.post("/stock-out/confirm", { items }),
  history: () => api.get("/stock-out/history"),
  rollback: (batchId) => api.post(`/stock-out/rollback/${batchId}`),
};

// ─── BOM 流程 API（流程A） ────────────────────────────
export const bomFlowApi = {
  upload: (formData) =>
    api.post("/bom-flow/upload", formData, {
      headers: { "Content-Type": "multipart/form-data" },
    }),
  export: async (sessionId, excludedIndices) => {
    const res = await axios.post(
      "/api/bom-flow/export",
      { session_id: sessionId, excluded_indices: excludedIndices },
      { responseType: "blob" },
    );
    // 下载文件
    const url = URL.createObjectURL(res.data);
    const a = document.createElement("a");
    a.href = url;
    a.download = "采购单.xlsx";
    a.click();
    URL.revokeObjectURL(url);
  },
  clearSession: (sessionId) => api.delete(`/bom-flow/session/${sessionId}`),
};
