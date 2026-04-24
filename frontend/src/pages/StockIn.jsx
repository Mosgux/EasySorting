import { useState } from "react";
import {
  Upload,
  AutoComplete,
  Button,
  Table,
  Tabs,
  Tag,
  Typography,
  Space,
  Alert,
  Image,
  message,
  Collapse,
  Statistic,
  Row,
  Col,
  Card,
  Tooltip,
  Switch,
  InputNumber,
  Input,
  Form,
  Modal,
  Divider,
} from "antd";
import {
  InboxOutlined,
  CheckCircleOutlined,
  HistoryOutlined,
  CloudUploadOutlined,
} from "@ant-design/icons";
import { stockInApi, stockOutApi } from "../api";
import { getTypeColor } from "../utils/type_color";

const { Title, Text } = Typography;
const { Dragger } = Upload;

const STOCK_IN_GUIDE_STEPS = [
  {
    key: "step_1",
    title: "步骤 1：进入“我的BOM”",
    description: "先访问立创 BOM 页面，再从页面右上角进入“我的BOM”。",
    image: "/guides/stock_in_guide_step_1.png",
    link: "https://bom.szlcsc.com/bom.html",
    linkLabel: "打开 BOM 页面",
  },
  {
    key: "step_2",
    title: "步骤 2：下载下单 BOM 报价单",
    description:
      "在“我的BOM”里找到带“关联订单”的记录，点击该行“下载”，得到下单 BOM 报价单 Excel。",
    image: "/guides/stock_in_guide_step_2.png",
  },
  {
    key: "step_3",
    title: "步骤 3：下载订单详情 Excel",
    description:
      "点击该条 BOM 对应的订单编号进入订单页，再点击“导出/下载”，得到订单详情 Excel。",
    image: "/guides/stock_in_guide_step_3.png",
  },
];

export default function StockIn() {
  const [orderFile, setOrderFile] = useState(null);
  const [bomFile, setBomFile] = useState(null);
  const [noBomMode, setNoBomMode] = useState(false);
  const [loading, setLoading] = useState(false);
  const [parsedItems, setParsedItems] = useState([]);
  const [previewItems, setPreviewItems] = useState([]);
  const [selectedKeys, setSelectedKeys] = useState([]);
  const [step, setStep] = useState(0); // 0=上传 1=预览 2=完成
  const [history, setHistory] = useState([]);
  const [stockOutHistory, setStockOutHistory] = useState([]);
  const [historyVisible, setHistoryVisible] = useState(false);
  const [historyTab, setHistoryTab] = useState("stock_in");
  const [historyLoading, setHistoryLoading] = useState(false);
  const [manualQtys, setManualQtys] = useState({});
  const [needDivisor, setNeedDivisor] = useState(1);
  const [editVisible, setEditVisible] = useState(false);
  const [editingRowId, setEditingRowId] = useState(null);
  const [editForm] = Form.useForm();

  const typeOptions = [
    ...new Set(
      [...parsedItems, ...previewItems]
        .map((item) => String(item.type || "").trim())
        .filter(Boolean),
    ),
  ].map((type) => ({ label: type, value: type }));

  const decoratePreviewItems = (items = []) =>
    items.map((item, index) => ({
      ...item,
      row_id: item.row_id || `row_${index}`,
      original_quantity_needed: Number(item.quantity_needed || 0),
    }));

  const getPositiveRowKeys = (items = []) =>
    items
      .filter((item) => Number(item.quantity_to_stock) > 0)
      .map((item) => item.row_id);

  const syncSelectedKeys = (items, currentKeys) => {
    const enabledKeys = new Set(getPositiveRowKeys(items));
    return currentKeys.filter((key) => enabledKeys.has(key));
  };

  const applyPreviewItems = (items, { autoSelectPositive = false } = {}) => {
    setPreviewItems(items);
    setSelectedKeys((currentKeys) =>
      autoSelectPositive
        ? getPositiveRowKeys(items)
        : syncSelectedKeys(items, currentKeys),
    );
  };

  const toInt = (value, fallback = 0) => {
    const num = Number(value);
    return Number.isFinite(num) ? Math.round(num) : fallback;
  };

  const updatePreviewItem = (rowId, updater) => {
    const nextItems = previewItems.map((item) => {
      if (item.row_id !== rowId) return item;
      const nextItem = typeof updater === "function" ? updater(item) : updater;
      return {
        ...nextItem,
        will_stock: Number(nextItem.quantity_to_stock) > 0,
      };
    });
    applyPreviewItems(nextItems);
  };

  const handleNeedChange = (rowId, value) => {
    updatePreviewItem(rowId, (item) => {
      const quantityNeeded = Math.max(0, toInt(value, item.quantity_needed));
      const quantityToStock = toInt(item.quantity_ordered, 0) - quantityNeeded;
      return {
        ...item,
        quantity_needed: quantityNeeded,
        quantity_to_stock: quantityToStock,
      };
    });
  };

  const handleStockChange = (rowId, value) => {
    updatePreviewItem(rowId, (item) => ({
      ...item,
      quantity_to_stock: toInt(value, item.quantity_to_stock),
    }));
  };

  const handleApplyDivisor = () => {
    const divisor = Math.max(1, toInt(needDivisor, 1));
    const baseMap = new Map(parsedItems.map((item) => [item.row_id, item]));
    const nextItems = previewItems.map((item) => {
      const baseItem = baseMap.get(item.row_id) || item;
      const originalNeed = toInt(
        baseItem.original_quantity_needed,
        baseItem.quantity_needed,
      );
      const quantityNeeded =
        divisor === 1 ? originalNeed : Math.ceil(originalNeed / divisor);
      const quantityToStock = toInt(item.quantity_ordered, 0) - quantityNeeded;
      return {
        ...item,
        quantity_needed: quantityNeeded,
        quantity_to_stock: quantityToStock,
        will_stock: quantityToStock > 0,
      };
    });
    applyPreviewItems(nextItems, { autoSelectPositive: true });
    message.success(`已按原始需求量 ÷ ${divisor} 重新计算入库数量`);
  };

  const handleFullStock = () => {
    const nextItems = previewItems.map((item) => {
      const quantityToStock = toInt(item.quantity_ordered, 0);
      return {
        ...item,
        quantity_needed: 0,
        quantity_to_stock: quantityToStock,
        will_stock: quantityToStock > 0,
      };
    });
    applyPreviewItems(nextItems, { autoSelectPositive: true });
    message.success("已将所有元件改为按订购数量直接入库");
  };

  const restoreParsedResult = () => {
    const restoredItems = parsedItems.map((item) => ({ ...item }));
    applyPreviewItems(restoredItems, { autoSelectPositive: true });
    setNeedDivisor(1);
    message.success("已恢复到原始解析结果");
  };

  const openEditModal = (record) => {
    setEditingRowId(record.row_id);
    editForm.setFieldsValue({
      lcsc_id: record.lcsc_id,
      type: record.type,
      name: record.name,
      model: record.model,
      package: record.package,
      value: record.value,
      spec: record.spec,
    });
    setEditVisible(true);
  };

  const handleSaveItem = async () => {
    const values = await editForm.validateFields();
    updatePreviewItem(editingRowId, (item) => ({
      ...item,
      lcsc_id: (values.lcsc_id || "").trim(),
      type: (values.type || "").trim(),
      name: (values.name || "").trim(),
      model: (values.model || "").trim(),
      package: (values.package || "").trim(),
      value: (values.value || "").trim(),
      spec: (values.spec || "").trim(),
    }));
    setEditVisible(false);
    setEditingRowId(null);
    message.success("元件信息已更新");
  };

  // 上传文件对象（不自动触发）
  const makeUploadProps = (setter) => ({
    beforeUpload: (file) => {
      setter(file);
      return false;
    },
    maxCount: 1,
    onRemove: () => setter(null),
    accept: ".xls,.xlsx",
  });

  const handleParse = async () => {
    if (!bomFile) {
      message.warning("请先上传BOM报价单文件");
      return;
    }
    if (noBomMode && !orderFile) {
      message.warning("已开启附带订单，请上传订单详情文件");
      return;
    }
    setLoading(true);
    try {
      const fd = new FormData();
      if (orderFile) fd.append("order_file", orderFile);
      if (bomFile) fd.append("bom_quote_file", bomFile);
      if (noBomMode && Object.keys(manualQtys).length > 0) {
        fd.append("manual_quantities", JSON.stringify(manualQtys));
      }
      const res = await stockInApi.parse(fd);
      const items = decoratePreviewItems(res.items || []);
      setParsedItems(items);
      applyPreviewItems(items, { autoSelectPositive: true });
      setNeedDivisor(1);
      setStep(1);
    } catch (e) {
      message.error(e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleConfirm = async () => {
    const toStock = previewItems.filter((i) => selectedKeys.includes(i.row_id));
    if (toStock.length === 0) {
      message.warning("没有选中任何元件");
      return;
    }
    setLoading(true);
    try {
      await stockInApi.confirm(toStock);
      message.success(`成功入库 ${toStock.length} 种元件`);
      setStep(2);
    } catch (e) {
      message.error(e.message);
    } finally {
      setLoading(false);
    }
  };

  const loadHistory = async () => {
    setHistoryLoading(true);
    try {
      const [inData, outData] = await Promise.all([
        stockInApi.history(),
        stockOutApi.history(),
      ]);
      setHistory(inData || []);
      setStockOutHistory(outData || []);
      setHistoryVisible(true);
    } catch (e) {
      message.error(e.message);
    } finally {
      setHistoryLoading(false);
    }
  };

  const handleRollbackStockIn = async (batchId) => {
    try {
      await stockInApi.rollback(batchId);
      message.success("入库批次已回滚，库存已恢复");
      const data = await stockInApi.history();
      setHistory(data || []);
    } catch (e) {
      message.error(e.message);
    }
  };

  const handleRollbackStockOut = async (batchId) => {
    try {
      await stockOutApi.rollback(batchId);
      message.success("出库批次已回滚，库存已恢复");
      const data = await stockOutApi.history();
      setStockOutHistory(data || []);
    } catch (e) {
      message.error(e.message);
    }
  };

  const reset = () => {
    setOrderFile(null);
    setBomFile(null);
    setParsedItems([]);
    setPreviewItems([]);
    setSelectedKeys([]);
    setStep(0);
    setManualQtys({});
    setNeedDivisor(1);
    setEditVisible(false);
    setEditingRowId(null);
    editForm.resetFields();
  };

  // ─── 预览表格列 ───────────────────────────────────────
  const previewCols = [
    {
      title: "立创编号",
      dataIndex: "lcsc_id",
      width: 100,
      fixed: "left",
      render: (v) => (
        <a
          href={`https://item.szlcsc.com/${v?.replace("C", "")}.html`}
          target="_blank"
          rel="noreferrer"
        >
          {v}
        </a>
      ),
    },
    {
      title: "类型",
      dataIndex: "type",
      width: 80,
      render: (value) => (
        <Tag color={getTypeColor(value)}>{value || "未分类"}</Tag>
      ),
    },
    { title: "型号", dataIndex: "model", ellipsis: true },
    { title: "封装", dataIndex: "package", width: 110 },
    { title: "商品名称", dataIndex: "name", ellipsis: true },
    {
      title: "订单数量",
      dataIndex: "quantity_ordered",
      width: 90,
      align: "right",
    },
    {
      title: "需求数量",
      width: 90,
      align: "right",
      render: (_, record) => (
        <InputNumber
          size="small"
          min={0}
          value={record.quantity_needed}
          onChange={(value) => handleNeedChange(record.row_id, value)}
          style={{ width: "100%" }}
        />
      ),
    },
    {
      title: "入库数量",
      width: 90,
      align: "right",
      render: (_, record) => (
        <InputNumber
          size="small"
          value={record.quantity_to_stock}
          onChange={(value) => handleStockChange(record.row_id, value)}
          style={{ width: "100%" }}
        />
      ),
    },
    {
      title: "操作",
      width: 100,
      fixed: "right",
      render: (_, record) => (
        <Button size="small" onClick={() => openEditModal(record)}>
          编辑元件
        </Button>
      ),
    },
  ];

  // 按类型分tab
  const types = [...new Set(previewItems.map((i) => i.type))];
  const tabItems = [
    {
      key: "__all__",
      label: `全部 (${previewItems.length})`,
      children: renderTable(previewItems),
    },
    ...types.map((t) => {
      const items = previewItems.filter((i) => i.type === t);
      return {
        key: t,
        label: `${t} (${items.length})`,
        children: renderTable(items),
      };
    }),
  ];

  function renderTable(data) {
    return (
      <Table
        rowKey="row_id"
        columns={previewCols}
        dataSource={data}
        size="small"
        scroll={{ x: 900 }}
        rowSelection={{
          selectedRowKeys: selectedKeys,
          onChange: setSelectedKeys,
          getCheckboxProps: (r) => ({ disabled: r.quantity_to_stock <= 0 }),
        }}
        rowClassName={(r) =>
          r.quantity_to_stock <= 0 ? "ant-table-row-disabled" : ""
        }
        pagination={{ pageSize: 50 }}
      />
    );
  }

  // ─── 历史弹窗列 ───────────────────────────────────────
  const histCols = [
    { title: "立创编号", dataIndex: "lcsc_id", width: 100 },
    { title: "型号", dataIndex: "model", ellipsis: true },
    { title: "封装", dataIndex: "package", width: 110 },
    { title: "订购", dataIndex: "quantity_ordered", width: 70, align: "right" },
    { title: "需求", dataIndex: "quantity_needed", width: 70, align: "right" },
    {
      title: "入库",
      dataIndex: "quantity_added",
      width: 70,
      align: "right",
      render: (v) => (
        <Text style={{ color: "#52c41a", fontWeight: 600 }}>+{v}</Text>
      ),
    },
  ];

  const stockOutCols = [
    { title: "立创编号", dataIndex: "lcsc_id", width: 100 },
    { title: "型号", dataIndex: "model", ellipsis: true },
    { title: "封装", dataIndex: "package", width: 110 },
    { title: "位号", dataIndex: "designator", ellipsis: true, width: 140 },
    {
      title: "出库量",
      dataIndex: "quantity_out",
      width: 70,
      align: "right",
      render: (v) => (
        <Text style={{ color: "#fa8c16", fontWeight: 600 }}>-{v}</Text>
      ),
    },
    {
      title: "出库前",
      dataIndex: "quantity_before",
      width: 70,
      align: "right",
    },
    {
      title: "出库后",
      dataIndex: "quantity_after",
      width: 70,
      align: "right",
      render: (v) => (
        <Text style={{ color: v <= 0 ? "#ff4d4f" : undefined }}>{v}</Text>
      ),
    },
  ];

  return (
    <div>
      <Title level={3}>元件入库</Title>
      <Text type="secondary">
        下单完成后，上传 BOM 报价单；如需按订单差量入库，可再附带订单详情。
      </Text>

      <Divider />

      {/* ── 步骤 0：上传 ── */}
      {step === 0 && (
        <>
          <Row gutter={24}>
            <Col xs={24} md={10}>
              <Card title="① BOM报价单（必填）" size="small">
                <Dragger
                  {...makeUploadProps(setBomFile)}
                  style={{ background: "#fafafa" }}
                >
                  <p className="ant-upload-drag-icon">
                    <CloudUploadOutlined />
                  </p>
                  <p>立创商城BOM报价单 .xls</p>
                  <p className="ant-upload-hint">点击或拖拽上传</p>
                </Dragger>
              </Card>
            </Col>

            <Col xs={24} md={10}>
              <Card
                title={
                  <Space>
                    <span>② 订单详情（选填）</span>
                    <Tooltip title="开启后需上传订单详情，系统将按订单实际采购量计算入库差量；关闭则直接按报价单购买数量入库">
                      <Switch
                        size="small"
                        checked={noBomMode}
                        onChange={setNoBomMode}
                        checkedChildren="附订单"
                        unCheckedChildren="仅BOM"
                      />
                    </Tooltip>
                  </Space>
                }
                size="small"
              >
                {noBomMode ? (
                  <Dragger
                    {...makeUploadProps(setOrderFile)}
                    style={{ background: "#fafafa" }}
                  >
                    <p className="ant-upload-drag-icon">
                      <CloudUploadOutlined />
                    </p>
                    <p>立创商城订单详情 .xls</p>
                    <p className="ant-upload-hint">点击或拖拽上传</p>
                  </Dragger>
                ) : (
                  <Alert
                    type="info"
                    message="仅BOM模式：直接按报价单购买数量入库，无需上传订单详情"
                    showIcon
                  />
                )}
              </Card>
            </Col>

            <Col
              xs={24}
              md={4}
              style={{ display: "flex", alignItems: "flex-end" }}
            >
              <Space direction="vertical" style={{ width: "100%" }}>
                <Button
                  type="primary"
                  size="large"
                  block
                  loading={loading}
                  onClick={handleParse}
                  icon={<InboxOutlined />}
                >
                  解析文件
                </Button>
                <Button
                  size="large"
                  block
                  onClick={loadHistory}
                  loading={historyLoading}
                  icon={<HistoryOutlined />}
                >
                  操作历史
                </Button>
              </Space>
            </Col>
          </Row>

          <Card
            title="如何获取导出 Excel"
            size="small"
            style={{ marginTop: 24 }}
          >
            <Alert
              type="info"
              showIcon
              style={{ marginBottom: 16 }}
              message={
                <span>
                  如果你还没有“下单 BOM 报价单”，或需要额外导出“订单详情
                  Excel”，可以按下面三步从立创商城导出。第一步入口：
                  <a
                    href="https://bom.szlcsc.com/bom.html"
                    target="_blank"
                    rel="noreferrer"
                    style={{ marginLeft: 6 }}
                  >
                    https://bom.szlcsc.com/bom.html
                  </a>
                </span>
              }
            />

            <Row gutter={[16, 16]}>
              {STOCK_IN_GUIDE_STEPS.map((stepItem, index) => (
                <Col xs={24} lg={8} key={stepItem.key}>
                  <Card
                    size="small"
                    title={`步骤 ${index + 1}`}
                    extra={
                      stepItem.link ? (
                        <a
                          href={stepItem.link}
                          target="_blank"
                          rel="noreferrer"
                        >
                          {stepItem.linkLabel}
                        </a>
                      ) : null
                    }
                    bodyStyle={{ padding: 12 }}
                  >
                    <Text strong style={{ display: "block", marginBottom: 8 }}>
                      {stepItem.title}
                    </Text>
                    <Text type="secondary">{stepItem.description}</Text>
                    <Image
                      src={stepItem.image}
                      alt={stepItem.title}
                      style={{ marginTop: 12, borderRadius: 8 }}
                    />
                  </Card>
                </Col>
              ))}
            </Row>
          </Card>
        </>
      )}

      {/* ── 步骤 1：预览确认 ── */}
      {step === 1 && (
        <>
          <Row gutter={16} style={{ marginBottom: 16 }}>
            <Col span={6}>
              <Statistic
                title="共识别元件"
                value={previewItems.length}
                suffix="种"
              />
            </Col>
            <Col span={6}>
              <Statistic
                title="可入库"
                value={
                  previewItems.filter((i) => i.quantity_to_stock > 0).length
                }
                suffix="种"
                valueStyle={{ color: "#52c41a" }}
              />
            </Col>
            <Col span={6}>
              <Statistic
                title="已选中"
                value={selectedKeys.length}
                suffix="种"
                valueStyle={{ color: "#1890ff" }}
              />
            </Col>
            <Col span={6}>
              <Space>
                <Button danger onClick={reset}>
                  重新上传
                </Button>
                <Button
                  type="primary"
                  icon={<CheckCircleOutlined />}
                  onClick={handleConfirm}
                  loading={loading}
                  disabled={selectedKeys.length === 0}
                >
                  确认入库 ({selectedKeys.length})
                </Button>
              </Space>
            </Col>
          </Row>

          <Alert
            type="info"
            showIcon
            style={{ marginBottom: 12 }}
            message="现在可以直接修改需求数量、入库数量和元件信息。改需求数量会自动重算差值；改入库数量则会直接覆盖差值结果。"
          />

          <Card size="small" style={{ marginBottom: 12 }}>
            <Space wrap>
              <Text strong>批量调整</Text>
              <Text>按原始需求量 ÷</Text>
              <InputNumber
                min={1}
                precision={0}
                value={needDivisor}
                onChange={(value) =>
                  setNeedDivisor(Math.max(1, toInt(value, 1)))
                }
              />
              <Button onClick={handleApplyDivisor}>应用到全部元件</Button>
              <Button onClick={handleFullStock}>全部按订购数量入库</Button>
              <Button onClick={restoreParsedResult}>恢复原始结果</Button>
            </Space>
          </Card>

          <Tabs items={tabItems} />
        </>
      )}

      {/* ── 步骤 2：完成 ── */}
      {step === 2 && (
        <Card style={{ textAlign: "center", padding: 32 }}>
          <CheckCircleOutlined style={{ fontSize: 48, color: "#52c41a" }} />
          <Title level={3} style={{ marginTop: 16 }}>
            入库完成！
          </Title>
          <Text type="secondary">元件已成功写入库存，数量已累加。</Text>
          <br />
          <br />
          <Space>
            <Button type="primary" onClick={reset}>
              继续入库
            </Button>
            <Button onClick={loadHistory} icon={<HistoryOutlined />}>
              查看操作历史
            </Button>
          </Space>
        </Card>
      )}

      {/* ── 历史弹窗 ── */}
      <Modal
        title="操作历史"
        open={historyVisible}
        onCancel={() => setHistoryVisible(false)}
        footer={null}
        width={900}
      >
        <Tabs
          activeKey={historyTab}
          onChange={setHistoryTab}
          items={[
            {
              key: "stock_in",
              label: `入库记录（${history.length} 批次）`,
              children: (
                <Collapse
                  items={(history || []).map((b, i) => ({
                    key: i,
                    label: (
                      <Space>
                        <Text>
                          批次 {b.batch_id.slice(0, 8)}… &nbsp;&nbsp;入库时间:{" "}
                          {b.created_at?.slice(0, 16) || "-"}
                          &nbsp;&nbsp;共 {b.items?.length} 种
                        </Text>
                        {b.rolled_back && <Tag color="default">已回滚</Tag>}
                      </Space>
                    ),
                    extra: b.rolled_back ? (
                      <Tag color="default">已回滚</Tag>
                    ) : (
                      <Button
                        size="small"
                        danger
                        onClick={(e) => {
                          e.stopPropagation();
                          Modal.confirm({
                            title: "确认回滚此入库批次？",
                            content: `将撤销该批次 ${b.items?.length} 种元件的入库操作，库存数量会相应减少。`,
                            okText: "确认回滚",
                            okType: "danger",
                            cancelText: "取消",
                            onOk: () => handleRollbackStockIn(b.batch_id),
                          });
                        }}
                      >
                        回滚
                      </Button>
                    ),
                    children: (
                      <Table
                        rowKey="id"
                        columns={histCols}
                        dataSource={b.items}
                        size="small"
                        pagination={false}
                      />
                    ),
                  }))}
                />
              ),
            },
            {
              key: "stock_out",
              label: `出库记录（${stockOutHistory.length} 批次）`,
              children: (
                <Collapse
                  items={(stockOutHistory || []).map((b, i) => ({
                    key: i,
                    label: (
                      <Space>
                        <Text>
                          批次 {b.batch_id.slice(0, 8)}… &nbsp;&nbsp;出库时间:{" "}
                          {b.created_at?.slice(0, 16) || "-"}
                          &nbsp;&nbsp;共 {b.items?.length} 种
                        </Text>
                        {b.rolled_back && <Tag color="default">已回滚</Tag>}
                      </Space>
                    ),
                    extra: b.rolled_back ? (
                      <Tag color="default">已回滚</Tag>
                    ) : (
                      <Button
                        size="small"
                        danger
                        onClick={(e) => {
                          e.stopPropagation();
                          Modal.confirm({
                            title: "确认回滚此出库批次？",
                            content: `将撤销该批次 ${b.items?.length} 种元件的出库操作，库存数量会相应恢复。`,
                            okText: "确认回滚",
                            okType: "danger",
                            cancelText: "取消",
                            onOk: () => handleRollbackStockOut(b.batch_id),
                          });
                        }}
                      >
                        回滚
                      </Button>
                    ),
                    children: (
                      <Table
                        rowKey="id"
                        columns={stockOutCols}
                        dataSource={b.items}
                        size="small"
                        pagination={false}
                      />
                    ),
                  }))}
                />
              ),
            },
          ]}
        />
      </Modal>

      <Modal
        title="编辑元件"
        open={editVisible}
        onCancel={() => {
          setEditVisible(false);
          setEditingRowId(null);
        }}
        onOk={handleSaveItem}
        destroyOnClose
        width={680}
      >
        <Form form={editForm} layout="vertical">
          <Row gutter={12}>
            <Col span={12}>
              <Form.Item label="立创编号" name="lcsc_id">
                <Input />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                label="类型"
                name="type"
                rules={[{ required: true, message: "请输入元件类型" }]}
              >
                <AutoComplete
                  options={typeOptions}
                  filterOption={(inputValue, option) =>
                    option?.value
                      ?.toUpperCase()
                      .includes(inputValue.toUpperCase())
                  }
                >
                  <Input placeholder="可直接输入或选择目录类型" />
                </AutoComplete>
              </Form.Item>
            </Col>
          </Row>

          <Form.Item
            label="商品名称"
            name="name"
            rules={[{ required: true, message: "请输入商品名称" }]}
          >
            <Input />
          </Form.Item>

          <Row gutter={12}>
            <Col span={12}>
              <Form.Item label="型号" name="model">
                <Input />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item label="封装" name="package">
                <Input />
              </Form.Item>
            </Col>
          </Row>

          <Form.Item label="参数值" name="value">
            <Input />
          </Form.Item>

          <Form.Item label="规格" name="spec">
            <Input.TextArea rows={4} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
