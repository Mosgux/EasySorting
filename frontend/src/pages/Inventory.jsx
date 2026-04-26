import { useState, useEffect, useCallback } from "react";
import {
  AutoComplete,
  Table,
  Input,
  Select,
  Button,
  Tag,
  Space,
  Typography,
  Divider,
  Modal,
  Form,
  InputNumber,
  message,
  Popconfirm,
  Card,
  Row,
  Col,
} from "antd";
import {
  PlusOutlined,
  SearchOutlined,
  EditOutlined,
  DeleteOutlined,
} from "@ant-design/icons";
import { inventoryApi } from "../api";
import { getTypeColor } from "../utils/type_color";

const { Title, Text } = Typography;
const { Option } = Select;

export default function Inventory() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("全部");
  const [typeOptions, setTypeOptions] = useState(["全部"]);
  const [selectedRowKeys, setSelectedRowKeys] = useState([]);

  // 编辑/新增弹窗
  const [modalOpen, setModalOpen] = useState(false);
  const [editRecord, setEditRecord] = useState(null);
  const [form] = Form.useForm();
  const [batchModalOpen, setBatchModalOpen] = useState(false);
  const [batchForm] = Form.useForm();

  const loadTypes = useCallback(async () => {
    try {
      const types = await inventoryApi.getTypes();
      setTypeOptions(types?.length ? types : ["全部"]);
    } catch (e) {
      message.error(e.message);
    }
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await inventoryApi.list({
        type: typeFilter === "全部" ? undefined : typeFilter,
        search: search || undefined,
      });
      setItems(data || []);
    } catch (e) {
      message.error(e.message);
    } finally {
      setLoading(false);
    }
  }, [typeFilter, search]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    void loadTypes();
  }, [loadTypes]);

  useEffect(() => {
    setSelectedRowKeys((currentKeys) =>
      currentKeys.filter((key) => items.some((item) => item.id === key)),
    );
  }, [items]);

  const openAdd = () => {
    setEditRecord(null);
    form.resetFields();
    form.setFieldsValue({ quantity: 0 });
    setModalOpen(true);
  };

  const openEdit = (record) => {
    setEditRecord(record);
    form.setFieldsValue(record);
    setModalOpen(true);
  };

  const handleSave = async () => {
    try {
      const values = await form.validateFields();
      if (editRecord) {
        await inventoryApi.update(editRecord.id, values);
        message.success("已更新");
      } else {
        await inventoryApi.create(values);
        message.success("已添加");
      }
      setModalOpen(false);
      void loadTypes();
      void load();
    } catch (e) {
      if (e.message) message.error(e.message);
    }
  };

  const handleDelete = async (id) => {
    try {
      await inventoryApi.delete(id);
      message.success("已删除");
      void loadTypes();
      void load();
    } catch (e) {
      message.error(e.message);
    }
  };

  const handleSelectAll = () => {
    setSelectedRowKeys(items.map((item) => item.id));
  };

  const handleClearSelection = () => {
    setSelectedRowKeys([]);
  };

  const handleBatchDelete = async () => {
    if (selectedRowKeys.length === 0) {
      message.warning("请先选择要删除的元件");
      return;
    }

    setLoading(true);
    try {
      const results = await Promise.allSettled(
        selectedRowKeys.map((id) => inventoryApi.delete(id)),
      );
      const successCount = results.filter(
        (result) => result.status === "fulfilled",
      ).length;
      const failureCount = results.length - successCount;

      if (successCount > 0) {
        message.success(
          failureCount > 0
            ? `已删除 ${successCount} 项，${failureCount} 项失败`
            : `已删除 ${successCount} 项`,
        );
      } else {
        message.error("批量删除失败");
      }

      setSelectedRowKeys([]);
      await loadTypes();
      await load();
    } catch (e) {
      message.error(e.message);
    } finally {
      setLoading(false);
    }
  };

  const openBatchModal = () => {
    if (selectedRowKeys.length === 0) {
      message.warning("请先选择要调整库存的元件");
      return;
    }

    batchForm.setFieldsValue({ action: "multiply", factor: 2 });
    setBatchModalOpen(true);
  };

  const handleBatchAdjust = async () => {
    const values = await batchForm.validateFields();
    const factor = Number(values.factor || 1);
    const selectedItems = items.filter((item) =>
      selectedRowKeys.includes(item.id),
    );

    if (selectedItems.length === 0) {
      message.warning("当前没有可调整的选中项");
      return;
    }

    setLoading(true);
    try {
      const results = await Promise.allSettled(
        selectedItems.map((item) => {
          const nextQuantity =
            values.action === "divide"
              ? Math.floor(Number(item.quantity || 0) / factor)
              : Math.round(Number(item.quantity || 0) * factor);

          return inventoryApi.update(item.id, {
            quantity: Math.max(0, nextQuantity),
          });
        }),
      );

      const successCount = results.filter(
        (result) => result.status === "fulfilled",
      ).length;
      const failureCount = results.length - successCount;

      if (successCount > 0) {
        message.success(
          failureCount > 0
            ? `已更新 ${successCount} 项，${failureCount} 项失败`
            : `已更新 ${successCount} 项库存`,
        );
      } else {
        message.error("批量调整失败");
      }

      setBatchModalOpen(false);
      setSelectedRowKeys([]);
      await load();
    } catch (e) {
      if (e.message) {
        message.error(e.message);
      }
    } finally {
      setLoading(false);
    }
  };

  const columns = [
    {
      title: "类型",
      dataIndex: "type",
      width: 90,
      render: (value) => <Tag color={getTypeColor(value)}>{value}</Tag>,
    },
    {
      title: "立创编号",
      dataIndex: "lcsc_id",
      width: 105,
      render: (v) =>
        v ? (
          <a
            href={`https://so.szlcsc.com/global.html?k=${v}`}
            target="_blank"
            rel="noreferrer"
          >
            {v}
          </a>
        ) : (
          "-"
        ),
    },
    {
      title: "型号",
      dataIndex: "model",
      ellipsis: true,
      render: (v) => <Text strong>{v}</Text>,
    },
    { title: "封装", dataIndex: "package", width: 110 },
    { title: "参数值", dataIndex: "value", width: 90 },
    {
      title: "规格/名称",
      dataIndex: "name",
      ellipsis: true,
      render: (v, r) => r.spec || v,
    },
    {
      title: "库存数量",
      dataIndex: "quantity",
      width: 90,
      align: "right",
      render: (v) => (
        <Text strong style={{ color: v > 0 ? "#52c41a" : "#ff4d4f" }}>
          {v}
        </Text>
      ),
    },
    {
      title: "操作",
      width: 95,
      align: "center",
      render: (_, r) => (
        <Space size={4}>
          <Button
            size="small"
            icon={<EditOutlined />}
            onClick={() => openEdit(r)}
          />
          <Popconfirm title="确认删除？" onConfirm={() => handleDelete(r.id)}>
            <Button size="small" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div>
      <Title level={3}>库存管理</Title>
      <Text type="secondary">
        查看、搜索、手动增删改库存元件（独立于入库/BOM流程）。
      </Text>

      <Divider />

      {/* ── 搜索栏 ── */}
      <Row gutter={12} style={{ marginBottom: 16 }}>
        <Col flex="200px">
          <Select
            value={typeFilter}
            onChange={setTypeFilter}
            style={{ width: "100%" }}
            size="large"
          >
            {typeOptions.map((t) => (
              <Option key={t} value={t}>
                {t === "全部" ? t : <Tag color={getTypeColor(t)}>{t}</Tag>}
              </Option>
            ))}
          </Select>
        </Col>
        <Col flex="auto">
          <Input.Search
            size="large"
            placeholder="搜索类型、型号、封装、规格…（支持 10k、100nF 等数值）"
            allowClear
            enterButton={<SearchOutlined />}
            onSearch={(v) => setSearch(v)}
            onChange={(e) => !e.target.value && setSearch("")}
          />
        </Col>
        <Col>
          <Space>
            <Button size="large" onClick={handleSelectAll}>
              全选当前结果
            </Button>
            <Button size="large" onClick={handleClearSelection}>
              清空选择
            </Button>
            <Button
              size="large"
              disabled={selectedRowKeys.length === 0}
              onClick={openBatchModal}
            >
              批量倍乘/除以
            </Button>
            <Popconfirm
              title={`确认删除已选中的 ${selectedRowKeys.length} 项？`}
              onConfirm={handleBatchDelete}
              disabled={selectedRowKeys.length === 0}
            >
              <Button
                danger
                size="large"
                disabled={selectedRowKeys.length === 0}
              >
                批量删除
              </Button>
            </Popconfirm>
            <Button
              type="primary"
              size="large"
              icon={<PlusOutlined />}
              onClick={openAdd}
            >
              手动添加
            </Button>
          </Space>
        </Col>
      </Row>

      {/* ── 统计 ── */}
      <Text type="secondary" style={{ marginBottom: 8, display: "block" }}>
        共 {items.length} 种元件
      </Text>
      <Text type="secondary" style={{ marginBottom: 8, display: "block" }}>
        已选中 {selectedRowKeys.length} 种
      </Text>

      {/* ── 表格 ── */}
      <Table
        rowKey="id"
        columns={columns}
        dataSource={items}
        loading={loading}
        rowSelection={{
          selectedRowKeys,
          onChange: setSelectedRowKeys,
        }}
        size="small"
        scroll={{ x: 900 }}
        pagination={{ pageSize: 50, showSizeChanger: true }}
      />

      {/* ── 新增/编辑弹窗 ── */}
      <Modal
        title={editRecord ? "编辑元件" : "手动添加元件"}
        open={modalOpen}
        onOk={handleSave}
        onCancel={() => setModalOpen(false)}
        okText="保存"
        cancelText="取消"
        destroyOnClose
      >
        <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
          <Row gutter={12}>
            <Col span={12}>
              <Form.Item name="type" label="类型" rules={[{ required: true }]}>
                <AutoComplete
                  options={typeOptions
                    .filter((type) => type !== "全部")
                    .map((type) => ({ label: type, value: type }))}
                  filterOption={(inputValue, option) =>
                    option?.value
                      ?.toUpperCase()
                      .includes(inputValue.toUpperCase())
                  }
                >
                  <Input placeholder="可直接输入或选择已有类型" />
                </AutoComplete>
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="lcsc_id" label="立创编号 (C...)">
                <Input placeholder="C12345" />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={12}>
            <Col span={12}>
              <Form.Item
                name="name"
                label="商品名称"
                rules={[{ required: true }]}
              >
                <Input />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="model" label="型号">
                <Input />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={12}>
            <Col span={12}>
              <Form.Item name="package" label="封装">
                <Input placeholder="0603 / SOT-23 / TSSOP-16" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="value" label="参数值">
                <Input placeholder="10kΩ / 100nF / 2.2uH" />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="spec" label="规格描述">
            <Input.TextArea rows={2} />
          </Form.Item>
          <Form.Item
            name="quantity"
            label="库存数量"
            rules={[{ required: true }]}
          >
            <InputNumber min={0} style={{ width: "100%" }} />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title="批量调整库存"
        open={batchModalOpen}
        onOk={handleBatchAdjust}
        onCancel={() => setBatchModalOpen(false)}
        okText="应用"
        cancelText="取消"
        destroyOnClose
      >
        <Text type="secondary" style={{ display: "block", marginBottom: 16 }}>
          当前已选 {selectedRowKeys.length}{" "}
          项。除法会向下取整，保证库存仍为整数。
        </Text>
        <Form form={batchForm} layout="vertical">
          <Form.Item
            name="action"
            label="操作"
            rules={[{ required: true, message: "请选择操作" }]}
          >
            <Select
              options={[
                { label: "倍乘", value: "multiply" },
                { label: "除以", value: "divide" },
              ]}
            />
          </Form.Item>
          <Form.Item
            name="factor"
            label="系数"
            rules={[{ required: true, message: "请输入系数" }]}
          >
            <InputNumber min={1} precision={0} style={{ width: "100%" }} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
