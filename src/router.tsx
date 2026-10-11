import { Navigate, Route, Routes } from "react-router-dom";

import { Home } from "@/pages/Home";
import { NodeDetail } from "@/pages/NodeDetail";
import { NotFound } from "@/pages/NotFound";

/**
 * 路由用 hash（官方规范）：首页 `/#/`，详情页 `/#/server/:id`。
 * 旧的 `#/instance/:id` 一并兼容跳转。
 */
export function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/server/:id" element={<NodeDetail />} />
      <Route path="/instance/:id" element={<LegacyRedirect />} />
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}

function LegacyRedirect() {
  return <Navigate to="/" replace />;
}
