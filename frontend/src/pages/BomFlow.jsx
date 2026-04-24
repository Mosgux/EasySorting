import { useEffect, useState } from "react";
import {
  Upload,
  Button,
  Table,
  Tabs,
  Tag,
  Typography,
  Space,
  Alert,
  Divider,
  message,
  Card,
  Row,
  Col,
  Checkbox,
  Drawer,
  Descriptions,
  Badge,
  Tooltip,
  Steps,
  Modal,
  Input,
  Select,
} from "antd";
import {
  CloudUploadOutlined,
  DownloadOutlined,
  ExportOutlined,
  QuestionCircleOutlined,
  DatabaseOutlined,
} from "@ant-design/icons";
import { bomFlowApi, inventoryApi, stockOutApi } from "../api";

const { Title, Text } = Typography;
const { Dragger } = Upload;

const STORAGE_KEY = "easy_sorting_bom_flow_state";

const TYPE_COLORS = {
  电阻: "blue",
  电容: "cyan",
  电感: "green",
  集成芯片: "purple",
  二极管: "magenta",
  三极管: "orange",
  MOSFET: "volcano",
  LED: "gold",
  晶振: "lime",
  连接器: "geekblue",
  磁珠: "teal",
  其他: "default",
};

const STATUS_CONFIG = {
  precise_match: { color: "success", text: "精确匹配" },
  param_match: { color: "warning", text: "参数匹配" },
  manual_match: { color: "processing", text: "手动匹配" },
  no_match: { color: "error", text: "未匹配" },
};

const INVENTORY_TYPE_OPTIONS = ["全部", ...Object.keys(TYPE_COLORS)];

const INVENTORY_SORT_OPTIONS = [
  { label: "推荐优先，库存从高到低", value: "quantity_desc" },
  { label: "推荐优先，库存从低到高", value: "quantity_asc" },
];

const normalizeCompareText = (value) =>
  String(value || "")
    .trim()
    .replace(/\s+/g, "")
    .toUpperCase();

const getCompareStatus = (candidateValue, bomValue) => {
  const left = normalizeCompareText(candidateValue);
  const right = normalizeCompareText(bomValue);

  if (!left || !right) return "unknown";
  return left === right ? "match" : "mismatch";
};

const getRecommendationMeta = (candidate, bomItem) => {
  const checks = [
    { label: "类型", status: getCompareStatus(candidate?.type, bomItem?.type) },
    {
      label: "封装",
      status: getCompareStatus(candidate?.package, bomItem?.footprint),
    },
    {
      label: "参数值",
      status: getCompareStatus(candidate?.value, bomItem?.value),
    },
  ];

  const matchedLabels = checks
    .filter((item) => item.status === "match")
    .map((item) => item.label);
  const score = matchedLabels.length;

  if (score >= 3) {
    return {
      score,
      label: "优先推荐",
      color: "green",
      matchedLabels,
    };
  }
  if (score === 2) {
    return {
      score,
      label: "较推荐",
      color: "gold",
      matchedLabels,
    };
  }
  if (score === 1) {
    return {
      score,
      label: "部分匹配",
      color: "blue",
      matchedLabels,
    };
  }

  return {
    score,
    label: "低相关",
    color: "default",
    matchedLabels,
  };
};

const stopEvent = (event) => {
  event?.stopPropagation?.();
};

const setsEqual = (left, right) => {
  if (left.size !== right.size) return false;
  for (const value of left) {
    if (!right.has(value)) return false;
  }
  return true;
};

const decorateItems = (items = []) =>
  items.map((item) => ({
    ...item,
    original_match_status: item.original_match_status ?? item.match_status,
    original_matched_inventory:
      item.original_matched_inventory ?? item.matched_inventory ?? null,
    original_match_candidates:
      item.original_match_candidates ?? item.match_candidates ?? [],
    original_stock_sufficient:
      item.original_stock_sufficient ?? Boolean(item.stock_sufficient),
  }));

export default function BomFlow() {
  const [bomFile, setBomFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [sessionId, setSessionId] = useState(null);
  const [items, setItems] = useState([]);
  const [step, setStep] = useState(0);
  const [activeTab, setActiveTab] = useState("precise");
  const [paramConfirmed, setParamConfirmed] = useState({});
  const [excluded, setExcluded] = useState(new Set());
  const [drawerItem, setDrawerItem] = useState(null);
  const [forceTarget, setForceTarget] = useState(null);
  const [inventoryModalOpen, setInventoryModalOpen] = useState(false);
  const [inventoryLoading, setInventoryLoading] = useState(false);
  const [inventorySearch, setInventorySearch] = useState("");
  const [inventoryItems, setInventoryItems] = useState([]);
  const [selectedInventoryId, setSelectedInventoryId] = useState(null);
  const [inventoryTypeFilter, setInventoryTypeFilter] = useState("全部");
  const [showInStockOnly, setShowInStockOnly] = useState(true);
  const [inventorySortOrder, setInventorySortOrder] = useState("quantity_desc");

  // 出库相关状态
  const [stockOutModalOpen, setStockOutModalOpen] = useState(false);
  const [stockOutLoading, setStockOutLoading] = useState(false);
  const [stockOutResult, setStockOutResult] = useState(null); // { batch_id, success_count, skipped_items }

  const replaceItems = (nextItems) => {
    setItems(decorateItems(nextItems));
  };

  useEffect(() => {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return;

    try {
      const saved = JSON.parse(raw);
      if (!saved?.sessionId || !(saved.items || []).length) return;

      setSessionId(saved.sessionId);
      setItems(decorateItems(saved.items || []));
      setParamConfirmed(saved.paramConfirmed || {});
      setExcluded(new Set(saved.excluded || []));
      setStep(typeof saved.step === "number" ? saved.step : 1);
      setActiveTab(saved.activeTab || "precise");
    } catch {
      sessionStorage.removeItem(STORAGE_KEY);
    }
  }, []);

  useEffect(() => {
    if (!sessionId || items.length === 0) {
      sessionStorage.removeItem(STORAGE_KEY);
      return;
    }

    sessionStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        sessionId,
        items,
        paramConfirmed,
        excluded: [...excluded],
        step,
        activeTab,
      }),
    );
  }, [sessionId, items, paramConfirmed, excluded, step, activeTab]);

  useEffect(() => {
    if (!drawerItem) return;
    const latest = items.find((item) => item.index === drawerItem.index);
    if (latest) {
      setDrawerItem(latest);
    }
  }, [items, drawerItem]);

  useEffect(() => {
    setExcluded((prev) => {
      const next = new Set(
        [...prev].filter((index) => {
          const item = items.find((entry) => entry.index === index);
          if (!item) return false;
          if (item.match_status === "precise_match") return true;
          if (item.match_status === "manual_match") return true;
          if (item.match_status === "param_match") {
            return Boolean(paramConfirmed[index]);
          }
          return false;
        }),
      );
      return setsEqual(prev, next) ? prev : next;
    });
  }, [items, paramConfirmed]);

  const uploaderProps = {
    beforeUpload: (file) => {
      setBomFile(file);
      return false;
    },
    maxCount: 1,
    onRemove: () => setBomFile(null),
    accept: ".xlsx,.xls",
  };

  const preciseItems = items.filter(
    (item) => item.match_status === "precise_match",
  );
  const paramItems = items.filter(
    (item) => item.match_status === "param_match",
  );
  const manualItems = items.filter(
    (item) => item.match_status === "manual_match",
  );
  const noMatchItems = items.filter((item) => item.match_status === "no_match");

  const confirmableParamItems = paramItems.filter(
    (item) => item.matched_inventory,
  );
  const confirmedParamCount = confirmableParamItems.filter(
    (item) => paramConfirmed[item.index],
  ).length;

  const isEligible = (item) => {
    if (item.match_status === "precise_match") return true;
    if (item.match_status === "manual_match") return true;
    if (item.match_status === "param_match" && paramConfirmed[item.index]) {
      return true;
    }
    return false;
  };

  const eligibleItems = items.filter((item) => isEligible(item));
  const allParamConfirmed =
    confirmableParamItems.length > 0 &&
    confirmableParamItems.every((item) => paramConfirmed[item.index]);
  const someParamConfirmed = confirmableParamItems.some(
    (item) => paramConfirmed[item.index],
  );
  const allEligibleSelected =
    eligibleItems.length > 0 &&
    eligibleItems.every((item) => excluded.has(item.index));
  const someEligibleSelected = eligibleItems.some((item) =>
    excluded.has(item.index),
  );
  const exportCount = items.length - excluded.size;

  const handleUpload = async () => {
    if (!bomFile) {
      message.warning("请先选择原始BOM文件");
      return;
    }

    setLoading(true);
    try {
      const formData = new FormData();
      formData.append("bom_file", bomFile);
      const res = await bomFlowApi.upload(formData);
      setSessionId(res.session_id);
      replaceItems(res.items || []);
      setParamConfirmed({});
      setExcluded(new Set());
      setStep(1);
      setActiveTab("precise");
      setDrawerItem(null);
    } catch (error) {
      message.error(error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleExport = async () => {
    setLoading(true);
    try {
      await bomFlowApi.export(sessionId, [...excluded]);
      message.success("采购单已下载");
    } catch (error) {
      message.error(error.message);
    } finally {
      setLoading(false);
    }
  };

  // 构造出库条目：仅对 excluded 集合中有 matched_inventory 的项执行出库
  const buildStockOutItems = () => {
    return items
      .filter(
        (item) =>
          excluded.has(item.index) && item.matched_inventory?.id != null,
      )
      .map((item) => ({
        component_id: item.matched_inventory.id,
        lcsc_id: item.matched_inventory.lcsc_id || "",
        model: item.matched_inventory.model || "",
        package: item.matched_inventory.package || "",
        name: item.matched_inventory.name || "",
        designator: item.designator || "",
        quantity_out: Number(item.quantity || 0),
      }));
  };

  const handleStockOut = async () => {
    const stockOutItems = buildStockOutItems();
    if (stockOutItems.length === 0) {
      message.warning("没有可出库的元件（请先勾选使用库存的行）");
      return;
    }
    setStockOutLoading(true);
    try {
      const res = await stockOutApi.confirm(stockOutItems);
      setStockOutResult(res);
      if (res.success_count > 0) {
        message.success(`出库成功：${res.success_count} 种元件`);
      }
    } catch (error) {
      message.error(error.message);
    } finally {
      setStockOutLoading(false);
    }
  };

  const reset = async () => {
    if (sessionId) {
      await bomFlowApi.clearSession(sessionId).catch(() => {});
    }
    sessionStorage.removeItem(STORAGE_KEY);
    setBomFile(null);
    setSessionId(null);
    setItems([]);
    setParamConfirmed({});
    setExcluded(new Set());
    setStep(0);
    setActiveTab("precise");
    setDrawerItem(null);
    setForceTarget(null);
    setInventoryModalOpen(false);
    setInventorySearch("");
    setInventoryItems([]);
    setSelectedInventoryId(null);
  };

  const handleToggleParam = (index, checked) => {
    setParamConfirmed((prev) => ({
      ...prev,
      [index]: checked,
    }));
  };

  const handleToggleAllParams = (checked) => {
    setParamConfirmed((prev) => {
      const next = { ...prev };
      confirmableParamItems.forEach((item) => {
        next[item.index] = checked;
      });
      return next;
    });
  };

  const handleToggleExcluded = (index, checked) => {
    setExcluded((prev) => {
      const next = new Set(prev);
      if (checked) {
        next.add(index);
      } else {
        next.delete(index);
      }
      return next;
    });
  };

  const handleToggleAllExcluded = (checked) => {
    setExcluded(
      checked ? new Set(eligibleItems.map((item) => item.index)) : new Set(),
    );
  };

  const sortInventoryItems = (list, sortOrder, target = forceTarget) => {
    const next = list.map((item) => ({
      ...item,
      _recommendation: getRecommendationMeta(item, target),
    }));

    next.sort((left, right) => {
      const scoreDiff =
        Number(right._recommendation?.score || 0) -
        Number(left._recommendation?.score || 0);
      if (scoreDiff !== 0) return scoreDiff;

      const leftQty = Number(left.quantity || 0);
      const rightQty = Number(right.quantity || 0);
      const qtyDiff =
        sortOrder === "quantity_asc" ? leftQty - rightQty : rightQty - leftQty;
      if (qtyDiff !== 0) return qtyDiff;

      return normalizeCompareText(left.model || left.name).localeCompare(
        normalizeCompareText(right.model || right.name),
      );
    });

    return next;
  };

  const loadInventoryItems = async ({
    search = inventorySearch,
    typeFilter = inventoryTypeFilter,
    inStockOnly = showInStockOnly,
    sortOrder = inventorySortOrder,
    target = forceTarget,
  } = {}) => {
    setInventoryLoading(true);
    try {
      const data = await inventoryApi.list({
        search: search || undefined,
        type: typeFilter === "全部" ? undefined : typeFilter,
      });
      const filtered = inStockOnly
        ? (data || []).filter((item) => Number(item.quantity || 0) > 0)
        : data || [];
      setInventoryItems(sortInventoryItems(filtered, sortOrder, target));
    } catch (error) {
      message.error(error.message);
    } finally {
      setInventoryLoading(false);
    }
  };

  const openForceMatch = async (record) => {
    setForceTarget(record);
    setSelectedInventoryId(record.matched_inventory?.id || null);
    setInventorySearch("");
    setInventoryTypeFilter("全部");
    setShowInStockOnly(true);
    setInventorySortOrder("quantity_desc");
    setInventoryModalOpen(true);
    await loadInventoryItems({
      search: "",
      typeFilter: "全部",
      inStockOnly: true,
      sortOrder: "quantity_desc",
      target: record,
    });
  };

  const handleForceMatchConfirm = () => {
    const selectedInventory = inventoryItems.find(
      (item) => item.id === selectedInventoryId,
    );
    if (!selectedInventory || !forceTarget) {
      message.warning("请先选择一个库存元件");
      return;
    }

    replaceItems(
      items.map((item) => {
        if (item.index !== forceTarget.index) return item;
        return {
          ...item,
          match_status: "manual_match",
          matched_inventory: selectedInventory,
          match_candidates: [selectedInventory],
          stock_sufficient:
            Number(selectedInventory.quantity || 0) >=
            Number(item.quantity || 0),
        };
      }),
    );

    setInventoryModalOpen(false);
    setForceTarget(null);
    setSelectedInventoryId(null);
    setActiveTab("none");
    message.success("已完成强制匹配");
  };

  const handleClearManualMatch = (record) => {
    replaceItems(
      items.map((item) => {
        if (item.index !== record.index) return item;
        return {
          ...item,
          match_status: item.original_match_status,
          matched_inventory: item.original_matched_inventory,
          match_candidates: item.original_match_candidates,
          stock_sufficient: item.original_stock_sufficient,
        };
      }),
    );
    message.success("已恢复为自动匹配结果");
  };

  const renderMatchedInventory = (record, accentColor = "#52c41a") => {
    if (!record.matched_inventory) return "-";

    return (
      <Space size={4}>
        <DatabaseOutlined style={{ color: accentColor }} />
        <Text>
          {record.matched_inventory.model || record.matched_inventory.name}
        </Text>
        {record.matched_inventory.value ? (
          <Text type="secondary">({record.matched_inventory.value})</Text>
        ) : null}
        <Tag color={record.stock_sufficient ? "green" : "red"}>
          库存: {record.matched_inventory.quantity}
        </Tag>
      </Space>
    );
  };

  const makeCols = (extra = []) => [
    { title: "#", dataIndex: "index", width: 50 },
    {
      title: "类型",
      dataIndex: "type",
      width: 80,
      render: (value) => (
        <Tag color={TYPE_COLORS[value] || "default"}>{value}</Tag>
      ),
    },
    { title: "位号", dataIndex: "designator", ellipsis: true, width: 150 },
    { title: "数量", dataIndex: "quantity", width: 70, align: "right" },
    { title: "封装", dataIndex: "footprint", width: 110 },
    {
      title: "型号/注释",
      ellipsis: true,
      render: (_, record) => (
        <Text strong>{record.manufacturer_part || record.comment}</Text>
      ),
    },
    { title: "参数值", dataIndex: "value", width: 90 },
    ...extra,
  ];

  const renderMatchTable = (data, mode) => {
    const extraCols = [];

    if (mode === "precise") {
      extraCols.push({
        title: "匹配库存",
        render: (_, record) => renderMatchedInventory(record, "#52c41a"),
      });
    }

    if (mode === "param") {
      extraCols.push(
        {
          title: "匹配库存",
          render: (_, record) => renderMatchedInventory(record, "#faad14"),
        },
        {
          title: (
            <Space size={8} onClick={stopEvent}>
              <Tooltip title="确认该库存元件的规格满足当前 BOM 需求">
                <span>
                  规格满足需求 <QuestionCircleOutlined />
                </span>
              </Tooltip>
              <Checkbox
                indeterminate={someParamConfirmed && !allParamConfirmed}
                checked={allParamConfirmed}
                onClick={stopEvent}
                onChange={(event) => {
                  stopEvent(event);
                  handleToggleAllParams(event.target.checked);
                }}
              >
                全选
              </Checkbox>
            </Space>
          ),
          width: 180,
          render: (_, record) => (
            <span onClick={stopEvent}>
              <Checkbox
                checked={!!paramConfirmed[record.index]}
                disabled={!record.matched_inventory}
                onClick={stopEvent}
                onChange={(event) => {
                  stopEvent(event);
                  handleToggleParam(record.index, event.target.checked);
                }}
              >
                确认
              </Checkbox>
            </span>
          ),
        },
      );
    }

    if (mode === "manual") {
      extraCols.push(
        {
          title: "匹配库存",
          render: (_, record) => renderMatchedInventory(record, "#1677ff"),
        },
        {
          title: "操作",
          width: 120,
          render: (_, record) => (
            <span onClick={stopEvent}>
              <Button
                size="small"
                onClick={() => handleClearManualMatch(record)}
              >
                取消强制匹配
              </Button>
            </span>
          ),
        },
      );
    }

    if (mode === "none") {
      extraCols.push({
        title: "操作",
        width: 110,
        render: (_, record) => (
          <span onClick={stopEvent}>
            <Button
              size="small"
              type="primary"
              ghost
              onClick={() => openForceMatch(record)}
            >
              强制匹配
            </Button>
          </span>
        ),
      });
    }

    return (
      <Table
        rowKey="index"
        columns={makeCols(extraCols)}
        dataSource={data}
        size="small"
        scroll={{ x: 980 }}
        pagination={{ pageSize: 30 }}
        onRow={(record) => ({ onClick: () => setDrawerItem(record) })}
        rowClassName={() => "clickable-row"}
      />
    );
  };

  const matchResultTabs = [
    {
      key: "precise",
      label: (
        <span>
          <Badge
            count={preciseItems.length}
            color="#52c41a"
            style={{ marginRight: 4 }}
          />
          精确匹配
        </span>
      ),
      children: renderMatchTable(preciseItems, "precise"),
    },
    {
      key: "param",
      label: (
        <span>
          <Badge
            count={paramItems.length}
            color="#faad14"
            style={{ marginRight: 4 }}
          />
          参数匹配（待确认）
          {confirmableParamItems.length > 0 ? (
            <Tag color="green" style={{ marginLeft: 4 }}>
              已确认 {confirmedParamCount}/{confirmableParamItems.length}
            </Tag>
          ) : null}
        </span>
      ),
      children: renderMatchTable(paramItems, "param"),
    },
    {
      key: "manual",
      label: (
        <span>
          <Badge
            count={manualItems.length}
            color="#1677ff"
            style={{ marginRight: 4 }}
          />
          手动匹配
        </span>
      ),
      children: renderMatchTable(manualItems, "manual"),
    },
    {
      key: "none",
      label: (
        <span>
          <Badge
            count={noMatchItems.length}
            color="#ff4d4f"
            style={{ marginRight: 4 }}
          />
          未匹配
        </span>
      ),
      children: renderMatchTable(noMatchItems, "none"),
    },
  ];

  const finalCols = [
    {
      title: (
        <Checkbox
          indeterminate={someEligibleSelected && !allEligibleSelected}
          checked={allEligibleSelected}
          onClick={stopEvent}
          onChange={(event) => {
            stopEvent(event);
            handleToggleAllExcluded(event.target.checked);
          }}
        >
          全选
        </Checkbox>
      ),
      width: 110,
      align: "center",
      render: (_, record) =>
        isEligible(record) ? (
          <span onClick={stopEvent}>
            <Checkbox
              checked={excluded.has(record.index)}
              onClick={stopEvent}
              onChange={(event) => {
                stopEvent(event);
                handleToggleExcluded(record.index, event.target.checked);
              }}
            />
          </span>
        ) : null,
    },
    { title: "#", dataIndex: "index", width: 50 },
    {
      title: "类型",
      dataIndex: "type",
      width: 80,
      render: (value) => (
        <Tag color={TYPE_COLORS[value] || "default"}>{value}</Tag>
      ),
    },
    {
      title: "匹配状态",
      dataIndex: "match_status",
      width: 110,
      render: (value) => {
        const config = STATUS_CONFIG[value] || {};
        return <Tag color={config.color}>{config.text}</Tag>;
      },
    },
    { title: "位号", dataIndex: "designator", ellipsis: true, width: 140 },
    { title: "数量", dataIndex: "quantity", width: 60, align: "right" },
    { title: "封装", dataIndex: "footprint", width: 110 },
    {
      title: "型号/注释",
      ellipsis: true,
      render: (_, record) => (
        <Text>{record.manufacturer_part || record.comment}</Text>
      ),
    },
    { title: "参数值", dataIndex: "value", width: 90 },
    {
      title: "对应库存",
      ellipsis: true,
      render: (_, record) =>
        record.matched_inventory ? (
          <Space size={4}>
            <Text type="secondary">
              {record.matched_inventory.model || record.matched_inventory.name}
            </Text>
            <Tag color={record.stock_sufficient ? "green" : "red"}>
              {record.matched_inventory.quantity} 个
            </Tag>
          </Space>
        ) : (
          <Text type="secondary">—</Text>
        ),
    },
  ];

  const inventoryColumns = [
    {
      title: "推荐",
      width: 170,
      render: (_, record) => {
        const recommendation =
          record._recommendation || getRecommendationMeta(record, forceTarget);
        return (
          <Space direction="vertical" size={2}>
            <Tag color={recommendation.color}>{recommendation.label}</Tag>
            <Text type="secondary">
              {recommendation.matchedLabels.length > 0
                ? `命中: ${recommendation.matchedLabels.join("/")}`
                : "未命中核心字段"}
            </Text>
          </Space>
        );
      },
    },
    {
      title: "类型",
      dataIndex: "type",
      width: 150,
      render: (value) => {
        const compareStatus = getCompareStatus(value, forceTarget?.type);
        return (
          <Space size={4} wrap>
            <Tag color={TYPE_COLORS[value] || "default"}>{value || "-"}</Tag>
            {compareStatus === "match" ? <Tag color="green">同BOM</Tag> : null}
            {compareStatus === "mismatch" ? <Tag color="red">不同</Tag> : null}
          </Space>
        );
      },
    },
    { title: "立创编号", dataIndex: "lcsc_id", width: 110 },
    { title: "型号", dataIndex: "model", ellipsis: true },
    {
      title: "封装",
      dataIndex: "package",
      width: 170,
      render: (value) => {
        const compareStatus = getCompareStatus(value, forceTarget?.footprint);
        return (
          <Space size={4} wrap>
            <Text
              style={{
                padding: "0 6px",
                borderRadius: 4,
                background:
                  compareStatus === "match"
                    ? "#f6ffed"
                    : compareStatus === "mismatch"
                      ? "#fff2f0"
                      : "transparent",
                color:
                  compareStatus === "match"
                    ? "#389e0d"
                    : compareStatus === "mismatch"
                      ? "#cf1322"
                      : undefined,
              }}
            >
              {value || "-"}
            </Text>
            {compareStatus === "match" ? <Tag color="green">同BOM</Tag> : null}
            {compareStatus === "mismatch" ? <Tag color="red">不同</Tag> : null}
          </Space>
        );
      },
    },
    {
      title: "参数值",
      dataIndex: "value",
      width: 170,
      render: (value) => {
        const compareStatus = getCompareStatus(value, forceTarget?.value);
        return (
          <Space size={4} wrap>
            <Text
              style={{
                padding: "0 6px",
                borderRadius: 4,
                background:
                  compareStatus === "match"
                    ? "#f6ffed"
                    : compareStatus === "mismatch"
                      ? "#fff2f0"
                      : "transparent",
                color:
                  compareStatus === "match"
                    ? "#389e0d"
                    : compareStatus === "mismatch"
                      ? "#cf1322"
                      : undefined,
              }}
            >
              {value || "-"}
            </Text>
            {compareStatus === "match" ? <Tag color="green">同BOM</Tag> : null}
            {compareStatus === "mismatch" ? <Tag color="red">不同</Tag> : null}
          </Space>
        );
      },
    },
    {
      title: "库存",
      dataIndex: "quantity",
      width: 80,
      align: "right",
      render: (value) => (
        <Text strong style={{ color: value > 0 ? "#52c41a" : "#ff4d4f" }}>
          {value}
        </Text>
      ),
    },
    {
      title: "规格/名称",
      ellipsis: true,
      render: (_, record) => record.spec || record.name || "-",
    },
  ];

  return (
    <div>
      <Title level={3}>BOM匹配与采购单导出</Title>
      <Text type="secondary">
        上传立创EDA原始BOM，自动与库存匹配，确认后导出最终采购单（格式与原始BOM相同）。
      </Text>

      <Divider />

      <Steps
        current={step}
        items={[
          { title: "上传原始BOM" },
          { title: "匹配结果确认" },
          { title: "最终BOM编辑导出" },
        ]}
        style={{ marginBottom: 24 }}
      />

      {step === 0 && (
        <Card style={{ maxWidth: 500 }}>
          <Dragger {...uploaderProps} style={{ background: "#fafafa" }}>
            <p className="ant-upload-drag-icon">
              <CloudUploadOutlined />
            </p>
            <p>立创EDA原始BOM.xlsx</p>
            <p className="ant-upload-hint">点击或拖拽上传</p>
          </Dragger>
          <Button
            block
            type="primary"
            size="large"
            style={{ marginTop: 16 }}
            loading={loading}
            onClick={handleUpload}
          >
            解析并匹配库存
          </Button>
        </Card>
      )}

      {step === 1 && (
        <>
          <Row gutter={16} style={{ marginBottom: 16 }}>
            <Col xs={12} md={4}>
              <Card size="small" style={{ borderColor: "#52c41a" }}>
                <Text style={{ color: "#52c41a", fontWeight: 600 }}>
                  精确匹配
                </Text>
                <Title level={2} style={{ color: "#52c41a", margin: 0 }}>
                  {preciseItems.length}
                </Title>
              </Card>
            </Col>
            <Col xs={12} md={4}>
              <Card size="small" style={{ borderColor: "#faad14" }}>
                <Text style={{ color: "#faad14", fontWeight: 600 }}>
                  参数匹配
                </Text>
                <Title level={2} style={{ color: "#faad14", margin: 0 }}>
                  {paramItems.length}
                </Title>
              </Card>
            </Col>
            <Col xs={12} md={4}>
              <Card size="small" style={{ borderColor: "#1677ff" }}>
                <Text style={{ color: "#1677ff", fontWeight: 600 }}>
                  手动匹配
                </Text>
                <Title level={2} style={{ color: "#1677ff", margin: 0 }}>
                  {manualItems.length}
                </Title>
              </Card>
            </Col>
            <Col xs={12} md={4}>
              <Card size="small" style={{ borderColor: "#ff4d4f" }}>
                <Text style={{ color: "#ff4d4f", fontWeight: 600 }}>
                  未匹配
                </Text>
                <Title level={2} style={{ color: "#ff4d4f", margin: 0 }}>
                  {noMatchItems.length}
                </Title>
              </Card>
            </Col>
            <Col xs={24} md={8}>
              <Space direction="vertical" style={{ width: "100%" }}>
                <Button danger onClick={reset} block>
                  重新上传
                </Button>
                <Button type="primary" block onClick={() => setStep(2)}>
                  进入最终BOM编辑 →
                </Button>
              </Space>
            </Col>
          </Row>

          <Alert
            type="info"
            showIcon
            style={{ marginBottom: 12 }}
            message={
              <span>
                点击行可查看详细信息；直接勾选不会再弹详情。参数匹配项可直接逐条或全选确认；未匹配项可强制绑定到任意库存元件，忽略类型和参数限制。
              </span>
            }
          />

          <Tabs
            activeKey={activeTab}
            onChange={setActiveTab}
            items={matchResultTabs}
          />
        </>
      )}

      {step === 2 && (
        <>
          <Row gutter={16} style={{ marginBottom: 16 }} align="middle">
            <Col span={14}>
              <Alert
                type="info"
                showIcon
                message={
                  <span>
                    勾选“使用库存”表示该元件从库存取用，
                    <strong>不会出现在导出采购单中</strong>（不影响库存数量）。
                    你可以使用表头全选，或右侧按钮批量勾选/清空。
                  </span>
                }
              />
            </Col>
            <Col span={10}>
              <Space style={{ float: "right" }} wrap>
                <Button onClick={() => setStep(1)}>← 返回匹配结果</Button>
                <Button onClick={() => handleToggleAllExcluded(true)}>
                  全选可用库存
                </Button>
                <Button onClick={() => handleToggleAllExcluded(false)}>
                  清空勾选
                </Button>
                <Button danger onClick={reset}>
                  重新开始
                </Button>
                <Button
                  icon={<ExportOutlined />}
                  disabled={excluded.size === 0}
                  onClick={() => setStockOutModalOpen(true)}
                >
                  执行出库（{buildStockOutItems().length} 种）
                </Button>
                <Button
                  type="primary"
                  icon={<DownloadOutlined />}
                  loading={loading}
                  onClick={handleExport}
                >
                  导出采购单（{exportCount} 种）
                </Button>
              </Space>
            </Col>
          </Row>

          <Table
            rowKey="index"
            columns={finalCols}
            dataSource={items}
            size="small"
            scroll={{ x: 1150 }}
            pagination={{ pageSize: 50 }}
            rowClassName={(record) =>
              excluded.has(record.index)
                ? "ant-table-row-selected"
                : "clickable-row"
            }
            onRow={(record) => ({ onClick: () => setDrawerItem(record) })}
          />
        </>
      )}

      <Drawer
        title="元件详情"
        open={!!drawerItem}
        onClose={() => setDrawerItem(null)}
        width={500}
      >
        {drawerItem ? (
          <>
            <Descriptions column={1} size="small" bordered>
              <Descriptions.Item label="类型">
                <Tag color={TYPE_COLORS[drawerItem.type] || "default"}>
                  {drawerItem.type}
                </Tag>
              </Descriptions.Item>
              <Descriptions.Item label="位号">
                {drawerItem.designator}
              </Descriptions.Item>
              <Descriptions.Item label="需求数量">
                {drawerItem.quantity}
              </Descriptions.Item>
              <Descriptions.Item label="封装">
                {drawerItem.footprint}
              </Descriptions.Item>
              <Descriptions.Item label="型号/注释">
                {drawerItem.manufacturer_part || drawerItem.comment}
              </Descriptions.Item>
              <Descriptions.Item label="参数值">
                {drawerItem.value || "-"}
              </Descriptions.Item>
              <Descriptions.Item label="LCSC编号">
                {drawerItem.supplier_part || "-"}
              </Descriptions.Item>
              <Descriptions.Item label="匹配状态">
                <Tag color={STATUS_CONFIG[drawerItem.match_status]?.color}>
                  {STATUS_CONFIG[drawerItem.match_status]?.text}
                </Tag>
              </Descriptions.Item>
            </Descriptions>

            {drawerItem.matched_inventory ? (
              <>
                <Divider>匹配的库存元件</Divider>
                <Descriptions column={1} size="small" bordered>
                  <Descriptions.Item label="型号">
                    {drawerItem.matched_inventory.model ||
                      drawerItem.matched_inventory.name}
                  </Descriptions.Item>
                  <Descriptions.Item label="立创编号">
                    {drawerItem.matched_inventory.lcsc_id || "-"}
                  </Descriptions.Item>
                  <Descriptions.Item label="封装">
                    {drawerItem.matched_inventory.package || "-"}
                  </Descriptions.Item>
                  <Descriptions.Item label="参数值">
                    {drawerItem.matched_inventory.value || "-"}
                  </Descriptions.Item>
                  <Descriptions.Item label="规格">
                    {drawerItem.matched_inventory.spec ||
                      drawerItem.matched_inventory.name ||
                      "-"}
                  </Descriptions.Item>
                  <Descriptions.Item label="库存数量">
                    <Text
                      strong
                      style={{
                        color: drawerItem.stock_sufficient
                          ? "#52c41a"
                          : "#ff4d4f",
                      }}
                    >
                      {drawerItem.matched_inventory.quantity} 个
                      {!drawerItem.stock_sufficient ? "（库存不足）" : ""}
                    </Text>
                  </Descriptions.Item>
                </Descriptions>
              </>
            ) : null}

            {drawerItem.match_status === "param_match" &&
            (drawerItem.match_candidates || []).length > 0 ? (
              <>
                <Divider>其他候选库存</Divider>
                {(drawerItem.match_candidates || []).map((candidate, index) => (
                  <Card key={index} size="small" style={{ marginBottom: 8 }}>
                    <Text strong>{candidate.model || candidate.name}</Text>
                    <Text type="secondary">
                      {" "}
                      | {candidate.package || "-"} | {candidate.value || "-"}
                    </Text>
                    <Text style={{ float: "right", color: "#52c41a" }}>
                      库存: {candidate.quantity}
                    </Text>
                  </Card>
                ))}
              </>
            ) : null}
          </>
        ) : null}
      </Drawer>

      <Modal
        title="强制匹配库存元件"
        open={inventoryModalOpen}
        onCancel={() => {
          setInventoryModalOpen(false);
          setForceTarget(null);
          setSelectedInventoryId(null);
        }}
        onOk={handleForceMatchConfirm}
        width={960}
        okText="确认强制匹配"
      >
        {forceTarget ? (
          <>
            <Alert
              type="warning"
              showIcon
              style={{ marginBottom: 12 }}
              message={`正在为 ${forceTarget.designator || "当前元件"} 强制匹配库存。此操作会忽略类型、参数和封装限制，仅用于人工调整最终 BOM。`}
            />

            <Descriptions
              column={2}
              size="small"
              bordered
              style={{ marginBottom: 12 }}
            >
              <Descriptions.Item label="BOM位号">
                {forceTarget.designator}
              </Descriptions.Item>
              <Descriptions.Item label="需求数量">
                {forceTarget.quantity}
              </Descriptions.Item>
              <Descriptions.Item label="封装">
                {forceTarget.footprint || "-"}
              </Descriptions.Item>
              <Descriptions.Item label="参数值">
                {forceTarget.value || "-"}
              </Descriptions.Item>
              <Descriptions.Item label="型号/注释" span={2}>
                {forceTarget.manufacturer_part || forceTarget.comment}
              </Descriptions.Item>
            </Descriptions>

            <Alert
              type="info"
              showIcon
              style={{ marginBottom: 12 }}
              message={
                <Space wrap>
                  <Text type="secondary">高亮说明：</Text>
                  <Tag color="green">绿色表示与当前 BOM 相同</Tag>
                  <Tag color="red">红色表示与当前 BOM 存在差异</Tag>
                  <Tag color="blue">推荐列按类型/封装/参数值命中数排序</Tag>
                </Space>
              }
            />

            <Input.Search
              allowClear
              placeholder="搜索库存型号、立创编号、封装、规格..."
              value={inventorySearch}
              onChange={(event) => {
                setInventorySearch(event.target.value);
                if (!event.target.value) {
                  void loadInventoryItems({ search: "" });
                }
              }}
              onSearch={(value) => void loadInventoryItems({ search: value })}
              style={{ marginBottom: 12 }}
            />

            <Space wrap style={{ marginBottom: 12 }}>
              <Text type="secondary">类型</Text>
              <Select
                value={inventoryTypeFilter}
                style={{ width: 140 }}
                options={INVENTORY_TYPE_OPTIONS.map((value) => ({
                  label: value,
                  value,
                }))}
                onChange={(value) => {
                  setInventoryTypeFilter(value);
                  void loadInventoryItems({ typeFilter: value });
                }}
              />

              <Checkbox
                checked={showInStockOnly}
                onChange={(event) => {
                  const checked = event.target.checked;
                  setShowInStockOnly(checked);
                  void loadInventoryItems({ inStockOnly: checked });
                }}
              >
                仅显示有库存项
              </Checkbox>

              <Text type="secondary">排序</Text>
              <Select
                value={inventorySortOrder}
                style={{ width: 180 }}
                options={INVENTORY_SORT_OPTIONS}
                onChange={(value) => {
                  setInventorySortOrder(value);
                  void loadInventoryItems({ sortOrder: value });
                }}
              />
            </Space>

            <Table
              rowKey="id"
              columns={inventoryColumns}
              dataSource={inventoryItems}
              loading={inventoryLoading}
              size="small"
              scroll={{ x: 1200 }}
              pagination={{ pageSize: 8 }}
              rowSelection={{
                type: "radio",
                selectedRowKeys: selectedInventoryId
                  ? [selectedInventoryId]
                  : [],
                onChange: (selectedRowKeys) => {
                  setSelectedInventoryId(selectedRowKeys[0] || null);
                },
              }}
              onRow={(record) => ({
                onClick: () => setSelectedInventoryId(record.id),
              })}
            />
          </>
        ) : null}
      </Modal>

      <style>{`.clickable-row { cursor: pointer; } .clickable-row:hover td { background: #f0f9ff !important; }`}</style>

      {/* ── 出库确认弹窗 ── */}
      <Modal
        title="执行出库"
        open={stockOutModalOpen}
        onCancel={() => {
          setStockOutModalOpen(false);
          setStockOutResult(null);
        }}
        footer={
          stockOutResult ? (
            <Button
              onClick={() => {
                setStockOutModalOpen(false);
                setStockOutResult(null);
              }}
            >
              关闭
            </Button>
          ) : (
            <Space>
              <Button onClick={() => setStockOutModalOpen(false)}>取消</Button>
              <Button
                type="primary"
                icon={<ExportOutlined />}
                loading={stockOutLoading}
                onClick={handleStockOut}
              >
                确认出库
              </Button>
            </Space>
          )
        }
        width={760}
        destroyOnClose
      >
        {stockOutResult ? (
          <>
            <Alert
              type={stockOutResult.success_count > 0 ? "success" : "warning"}
              showIcon
              style={{ marginBottom: 12 }}
              message={`出库完成：成功 ${stockOutResult.success_count} 种，跳过 ${stockOutResult.skipped_items?.length || 0} 种`}
              description={`批次ID：${stockOutResult.batch_id}`}
            />
            {stockOutResult.skipped_items?.length > 0 && (
              <>
                <Text
                  type="secondary"
                  style={{ display: "block", marginBottom: 8 }}
                >
                  以下元件因库存不足被跳过：
                </Text>
                <Table
                  rowKey={(r) => r.lcsc_id || r.model}
                  dataSource={stockOutResult.skipped_items}
                  size="small"
                  pagination={false}
                  columns={[
                    { title: "立创编号", dataIndex: "lcsc_id", width: 100 },
                    { title: "型号", dataIndex: "model", ellipsis: true },
                    { title: "封装", dataIndex: "package", width: 100 },
                    {
                      title: "需求量",
                      dataIndex: "quantity_out",
                      width: 80,
                      align: "right",
                    },
                    {
                      title: "可用库存",
                      dataIndex: "quantity_available",
                      width: 80,
                      align: "right",
                      render: (v) => (
                        <Text style={{ color: "#ff4d4f" }}>{v ?? "—"}</Text>
                      ),
                    },
                    { title: "原因", dataIndex: "reason", ellipsis: true },
                  ]}
                />
              </>
            )}
          </>
        ) : (
          <>
            <Alert
              type="warning"
              showIcon
              style={{ marginBottom: 12 }}
              message="出库操作会从库存中扣减数量，操作后可在入库历史中回滚。"
            />
            <Text
              type="secondary"
              style={{ display: "block", marginBottom: 8 }}
            >
              即将出库以下元件（库存不足的元件将被跳过）：
            </Text>
            <Table
              rowKey="component_id"
              dataSource={buildStockOutItems().map((it) => {
                const bomItem = items.find(
                  (i) =>
                    excluded.has(i.index) &&
                    i.matched_inventory?.id === it.component_id,
                );
                return {
                  ...it,
                  current_quantity: bomItem?.matched_inventory?.quantity ?? "—",
                };
              })}
              size="small"
              pagination={{ pageSize: 10 }}
              columns={[
                { title: "立创编号", dataIndex: "lcsc_id", width: 100 },
                { title: "型号", dataIndex: "model", ellipsis: true },
                { title: "封装", dataIndex: "package", width: 100 },
                {
                  title: "位号",
                  dataIndex: "designator",
                  ellipsis: true,
                  width: 140,
                },
                {
                  title: "出库量",
                  dataIndex: "quantity_out",
                  width: 80,
                  align: "right",
                  render: (v) => (
                    <Text style={{ color: "#fa8c16", fontWeight: 600 }}>
                      -{v}
                    </Text>
                  ),
                },
                {
                  title: "当前库存",
                  dataIndex: "current_quantity",
                  width: 80,
                  align: "right",
                  render: (v, r) => (
                    <Text
                      style={{
                        color:
                          typeof v === "number" && v < r.quantity_out
                            ? "#ff4d4f"
                            : "#52c41a",
                      }}
                    >
                      {v}
                    </Text>
                  ),
                },
              ]}
            />
          </>
        )}
      </Modal>
    </div>
  );
}
