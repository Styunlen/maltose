"use client";

import * as React from "react";
import { Settings2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Drawer,
  DrawerBody,
  DrawerCloseButton,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "@/components/ui/drawer";
import { useMcAvatarVisibility } from "@/hooks/useMcAvatarVisibility";
import { useHomeEffects } from "@/hooks/useHomeEffects";
import { cn } from "@/lib/utils";

function SettingsSection({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-border bg-card p-4 shadow-sm">
      <div className="flex flex-col gap-1">
        <h3 className="text-sm font-extrabold tracking-tight text-foreground">
          {title}
        </h3>
        <p className="text-xs leading-relaxed text-muted-foreground">
          {description}
        </p>
      </div>
      <div className="mt-4 flex flex-col gap-3">{children}</div>
    </section>
  );
}

function SettingsRow({
  label,
  description,
  children,
}: {
  label: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-xl bg-muted/60 p-3">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-bold text-foreground">{label}</p>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
          {description}
        </p>
      </div>
      {children}
    </div>
  );
}

function McAvatarVisibilitySwitch() {
  const [visible, setVisible] = useMcAvatarVisibility();

  return (
    <button
      type="button"
      role="switch"
      aria-checked={visible}
      aria-label="显示 MC 看板娘"
      className={cn(
        "group inline-flex h-7 w-12 shrink-0 items-center rounded-full border border-border p-1 shadow-xs outline-none transition-[background-color,border-color,box-shadow] duration-200 focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 active:scale-95",
        visible ? "bg-primary" : "bg-secondary",
      )}
      onClick={() => setVisible(!visible)}
    >
      <span
        className={cn(
          "size-5 rounded-full bg-background shadow-sm transition-transform duration-200 group-aria-checked:translate-x-5",
          visible
            ? "border border-primary-foreground/20"
            : "border border-border",
        )}
      />
    </button>
  );
}

function HomeEffectsSwitch() {
  const [enabled, setEnabled] = useHomeEffects();

  return (
    <button
      type="button"
      role="switch"
      aria-checked={enabled}
      aria-label="启用首页视觉特效"
      className={cn(
        "group inline-flex h-7 w-12 shrink-0 items-center rounded-full border border-border p-1 shadow-xs outline-none transition-[background-color,border-color,box-shadow] duration-200 focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 active:scale-95",
        enabled ? "bg-primary" : "bg-secondary",
      )}
      onClick={() => setEnabled(!enabled)}
    >
      <span
        className={cn(
          "size-5 rounded-full bg-background shadow-sm transition-transform duration-200 group-aria-checked:translate-x-5",
          enabled
            ? "border border-primary-foreground/20"
            : "border border-border",
        )}
      />
    </button>
  );
}

export default function SettingsDrawer() {
  const [open, setOpen] = React.useState(false);

  // The left-rail "设置" entry opens this drawer via a window event
  // (the drawer lives in SiteHeader, the trigger lives in SidebarLeft).
  React.useEffect(() => {
    const onOpen = () => setOpen(true);
    window.addEventListener("maltose:open-settings", onOpen);
    return () => window.removeEventListener("maltose:open-settings", onOpen);
  }, []);

  return (
    <Drawer open={open} onOpenChange={setOpen} swipeDirection="right">
      <DrawerTrigger
        render={
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-8 rounded-xl hover:bg-primary/20 hover:text-primary transition-all duration-200"
          />
        }
        aria-label="打开设置"
        title="设置"
      >
        <Settings2 data-icon="inline-start" />
      </DrawerTrigger>
      <DrawerContent>
        <DrawerHeader>
          <DrawerTitle>设置</DrawerTitle>
          <DrawerDescription>
            调整站点界面偏好。现在只有 MC 看板娘，后续设置会继续放在这里。
          </DrawerDescription>
        </DrawerHeader>
        <DrawerCloseButton />
        <DrawerBody>
          <SettingsSection
            title="显示"
            description="控制首页的视觉特效与页面角落的 Minecraft 皮肤看板娘。"
          >
            <SettingsRow
              label="首页视觉特效"
              description="控制首页欢迎层与品牌 Banner 的光束、点阵和装饰动画。默认开启，系统减弱动效时会自动降低效果。"
            >
              <HomeEffectsSwitch />
            </SettingsRow>
            <SettingsRow
              label="MC 看板娘"
              description="关闭后不会加载 3D 皮肤查看器，下一次打开网站也会保持关闭。"
            >
              <McAvatarVisibilitySwitch />
            </SettingsRow>
          </SettingsSection>
        </DrawerBody>
      </DrawerContent>
    </Drawer>
  );
}
