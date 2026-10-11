import { Link } from "react-router-dom";

import { AppShell } from "@/components/shell/AppShell";
import { LINK_BUTTON_CLASS } from "@/components/ui/linkButton";

export function NotFound() {
  return (
    <AppShell>
      <div className="grid flex-1 place-items-center p-8">
        <div className="text-center">
          <p className="text-2xl font-semibold">页面不存在</p>
          <p className="mt-1 text-sm text-muted-foreground">节点不存在或未公开</p>
          <Link to="/" className={`${LINK_BUTTON_CLASS} mt-4`}>
            返回列表
          </Link>
        </div>
      </div>
    </AppShell>
  );
}
