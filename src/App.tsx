import { HashRouter } from "react-router-dom";

import { AppDataProvider } from "@/app/AppData";
import { AppRoutes } from "@/router";

export function App() {
  return (
    <HashRouter>
      <AppDataProvider>
        <AppRoutes />
      </AppDataProvider>
    </HashRouter>
  );
}
