import { X } from "lucide-react";
import { useSyncExternalStore } from "react";

import { useAppData } from "@/app/AppData";
import { Button } from "@/components/ui/Button";
import { getSettings, resetSettings, subscribeSettings, updateSettings, type ThemeSettings } from "@/services/settings";
import { cn } from "@/lib/cn";

function Row({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 py-3">
      <div className="min-w-0">
        <div className="text-sm">{label}</div>
        {hint ? <div className="mt-0.5 text-xs text-muted-foreground">{hint}</div> : null}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

function Segmented<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: Array<{ value: T; label: string }>;
  onChange: (value: T) => void;
}) {
  return (
    <div className="inline-flex rounded-md border border-hairline p-0.5">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          onClick={() => onChange(option.value)}
          className={cn(
            "rounded px-2 py-0.5 text-xs transition-colors",
            value === option.value ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:bg-accent/60",
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

function Toggle({ value, onChange }: { value: boolean; onChange: (value: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={value}
      onClick={() => onChange(!value)}
      className={cn(
        "relative h-5 w-9 rounded-full border border-hairline transition-colors",
        value ? "bg-chart-1/70" : "bg-muted",
      )}
    >
      <span
        className={cn(
          "absolute top-0.5 size-3.5 rounded-full bg-background shadow transition-[left]",
          value ? "left-[18px]" : "left-0.5",
        )}
      />
    </button>
  );
}

export function SettingsPanel({ onClose }: { onClose: () => void }) {
  const { config } = useAppData();
  const settings = useSyncExternalStore(subscribeSettings, getSettings, getSettings);
  const loggedIn = Boolean(config?.authorization);

  const patch = (value: Partial<ThemeSettings>) => updateSettings(value, loggedIn);

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <button
        type="button"
        aria-label="关闭设置"
        className="absolute inset-0 bg-black/30 backdrop-blur-[1px]"
        onClick={onClose}
      />
      <aside className="glass relative flex h-full w-full max-w-sm flex-col overflow-hidden rounded-none border-y-0 border-r-0">
        <header className="flex items-center justify-between border-b border-hairline px-4 py-3">
          <div>
            <h2 className="text-sm font-semibold">主题设置</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {loggedIn ? "改动会同步到后端，所有访客共享" : "改动只保存在本机浏览器"}
            </p>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose} aria-label="关闭">
            <X className="size-4" />
          </Button>
        </header>

        <div className="scroll-thin flex-1 divide-y divide-[var(--hairline)] overflow-y-auto px-4">
          <Row label="外观">
            <Segmented
              value={settings.appearance}
              onChange={(value) => patch({ appearance: value })}
              options={[
                { value: "system", label: "跟随系统" },
                { value: "light", label: "亮" },
                { value: "dark", label: "暗" },
              ]}
            />
          </Row>

          <Row label="首页形态" hint="公园模式需要加载 3D 模型，首次进入较慢">
            <Segmented
              value={settings.view}
              onChange={(value) => patch({ view: value })}
              options={[
                { value: "park", label: "公园" },
                { value: "list", label: "列表" },
              ]}
            />
          </Row>

          <Row label="进化天数" hint="在线每满这么多天，角色进化一阶">
            <input
              type="number"
              min={1}
              max={3650}
              value={settings.evolutionDays}
              onChange={(event) => patch({ evolutionDays: Number(event.target.value) })}
              className="tnum w-20 rounded-md border border-hairline bg-card-subtle px-2 py-1 text-sm"
            />
          </Row>

          <Row label="野生角色" hint="公园里额外摆放的装饰角色数量（不占用真实节点）">
            <input
              type="number"
              min={0}
              max={12}
              value={settings.parkExtra}
              onChange={(event) => patch({ parkExtra: Number(event.target.value) })}
              className="tnum w-20 rounded-md border border-hairline bg-card-subtle px-2 py-1 text-sm"
            />
          </Row>

          <Row label="显示价格">
            <Toggle value={settings.showPrice} onChange={(value) => patch({ showPrice: value })} />
          </Row>

          <Row label="顶栏显示健康分" hint="由延迟与丢包自算，0–100">
            <Toggle value={settings.showScore} onChange={(value) => patch({ showScore: value })} />
          </Row>

          <Row label="降低动态效果" hint="关掉公园里角色的待机动画">
            <Toggle
              value={settings.reduceMotion}
              onChange={(value) => patch({ reduceMotion: value })}
            />
          </Row>

          <Row label="玻璃模糊" hint="面板背景模糊半径">
            <input
              type="range"
              min={0}
              max={40}
              value={settings.glassBlur}
              onChange={(event) => patch({ glassBlur: Number(event.target.value) })}
              className="w-28"
            />
          </Row>

          <Row label="公园背景图" hint="留空则用主题自带的等距插画">
            <input
              type="text"
              value={settings.backgroundUrl}
              onChange={(event) => patch({ backgroundUrl: event.target.value })}
              placeholder="/bg-kame-iso.jpg"
              className="w-40 rounded-md border border-hairline bg-card-subtle px-2 py-1 text-xs"
            />
          </Row>

          <Row label="素材托管前缀" hint="角色模型有 40MB+；挪到别处托管时把前缀填这里，留空即同源">
            <input
              type="text"
              value={settings.assetBase}
              onChange={(event) => patch({ assetBase: event.target.value })}
              placeholder="https://cdn.example.com/park"
              className="w-40 rounded-md border border-hairline bg-card-subtle px-2 py-1 text-xs"
            />
          </Row>
        </div>

        <footer className="flex items-center justify-between gap-2 border-t border-hairline px-4 py-3">
          <Button variant="ghost" size="sm" onClick={() => resetSettings()}>
            恢复默认
          </Button>
          <Button variant="default" size="sm" onClick={onClose}>
            完成
          </Button>
        </footer>
      </aside>
    </div>
  );
}
