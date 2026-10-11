import { useState, type ReactNode } from "react";

import { TopBar } from "@/components/shell/TopBar";
import { SettingsPanel } from "@/components/shell/SettingsPanel";
import { useAppData } from "@/app/AppData";

/** 页脚：官方规范要求展示 Powered by 并链回仓库。 */
export function SiteFooter() {
  const { config } = useAppData();
  return (
    <footer className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1 px-3 py-3 text-xs text-muted-foreground">
      <span>
        Powered by{" "}
        <a
          className="underline underline-offset-2 hover:text-foreground"
          href="https://github.com/huilang-me/CF-Server-Monitor/"
          target="_blank"
          rel="noreferrer"
        >
          CF-Server-Monitor
        </a>
        {config?.version ? ` v${config.version}` : ""}
      </span>
      <span className="opacity-40">·</span>
      <span>
        主题{" "}
        <a
          className="underline underline-offset-2 hover:text-foreground"
          href="https://github.com/volcano-1025/CFSM-Theme-LuminaPlus"
          target="_blank"
          rel="noreferrer"
          title="界面与玩法参考 Exia Monitor「龙珠公园」"
        >
          龙珠公园
        </a>
      </span>
    </footer>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const { sessionTimedOut, continueSession, endSession } = useAppData();

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <TopBar onOpenSettings={() => setSettingsOpen(true)} />
      <main className="scroll-thin flex min-h-0 flex-1 flex-col overflow-y-auto">{children}</main>
      <SiteFooter />

      {sessionTimedOut ? (
        <div className="fixed inset-x-0 bottom-0 z-50 flex flex-wrap items-center justify-center gap-3 border-t border-hairline bg-card px-4 py-3 text-sm shadow-lg">
          <span>实时连接已到站点设置的上限，已暂停推送。</span>
          <span className="flex gap-2">
            <button
              type="button"
              className="rounded-md border border-hairline px-3 py-1 hover:bg-accent"
              onClick={continueSession}
            >
              继续连接
            </button>
            <button
              type="button"
              className="rounded-md px-3 py-1 text-muted-foreground hover:bg-accent"
              onClick={endSession}
            >
              关闭
            </button>
          </span>
        </div>
      ) : null}

      {settingsOpen ? <SettingsPanel onClose={() => setSettingsOpen(false)} /> : null}
    </div>
  );
}
