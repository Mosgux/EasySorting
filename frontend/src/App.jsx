import {
  BrowserRouter,
  Routes,
  Route,
  Navigate,
  useLocation,
  useNavigate,
} from "react-router-dom";
import { Layout, Menu } from "antd";
import {
  InboxOutlined,
  DatabaseOutlined,
  FileSearchOutlined,
} from "@ant-design/icons";
import StockIn from "./pages/StockIn";
import BomFlow from "./pages/BomFlow";
import Inventory from "./pages/Inventory";
import "./index.css";

const { Sider, Content } = Layout;

const NAV_ITEMS = [
  { key: "/stock-in", icon: <InboxOutlined />, label: "元件入库" },
  { key: "/inventory", icon: <DatabaseOutlined />, label: "库存管理" },
  { key: "/bom-flow", icon: <FileSearchOutlined />, label: "BOM匹配导出" },
];

function AppLayout() {
  const location = useLocation();
  const navigate = useNavigate();

  return (
    <Layout style={{ minHeight: "100vh" }}>
      <Sider width={200} theme="dark">
        <div
          style={{
            color: "#fff",
            padding: "16px",
            fontWeight: "bold",
            fontSize: 16,
          }}
        >
          EasySorting
        </div>
        <Menu
          theme="dark"
          mode="inline"
          selectedKeys={[location.pathname]}
          items={NAV_ITEMS}
          onClick={({ key }) => navigate(key)}
          style={{ borderRight: 0 }}
        />
      </Sider>
      <Layout>
        <Content
          style={{ padding: "24px", background: "#fff", minHeight: "100vh" }}
        >
          <Routes>
            <Route path="/" element={<Navigate to="/stock-in" replace />} />
            <Route path="/stock-in" element={<StockIn />} />
            <Route path="/inventory" element={<Inventory />} />
            <Route path="/bom-flow" element={<BomFlow />} />
          </Routes>
        </Content>
      </Layout>
    </Layout>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AppLayout />
    </BrowserRouter>
  );
}
