"use client";

import * as React from "react";
import { Drawer as DrawerPrimitive } from "@base-ui/react/drawer";
import { X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const Drawer = DrawerPrimitive.Root;
const DrawerTrigger = DrawerPrimitive.Trigger;
const DrawerPortal = DrawerPrimitive.Portal;
const DrawerClose = DrawerPrimitive.Close;

type DrawerBackdropProps = Omit<
  React.ComponentProps<typeof DrawerPrimitive.Backdrop>,
  "className"
> & {
  className?: string;
};

function DrawerBackdrop({ className, ...props }: DrawerBackdropProps) {
  return (
    <DrawerPrimitive.Backdrop
      data-slot="drawer-backdrop"
      className={cn(
        "fixed inset-0 z-[70] bg-foreground/45 opacity-100 backdrop-blur-sm transition-opacity duration-200 data-[ending-style]:opacity-0 data-[starting-style]:opacity-0",
        className,
      )}
      {...props}
    />
  );
}

type DrawerViewportProps = Omit<
  React.ComponentProps<typeof DrawerPrimitive.Viewport>,
  "className"
> & {
  className?: string;
};

function DrawerViewport({ className, ...props }: DrawerViewportProps) {
  return (
    <DrawerPrimitive.Viewport
      data-slot="drawer-viewport"
      className={cn("fixed inset-0 z-[70] overflow-hidden", className)}
      {...props}
    />
  );
}

type DrawerContentProps = Omit<
  React.ComponentProps<typeof DrawerPrimitive.Popup>,
  "className"
> & {
  className?: string;
  children: React.ReactNode;
};

function DrawerContent({ className, children, ...props }: DrawerContentProps) {
  return (
    <DrawerPortal>
      <DrawerBackdrop />
      <DrawerViewport>
        <DrawerPrimitive.Popup
          data-slot="drawer-content"
          className={cn(
            "fixed right-0 top-0 z-[70] flex h-dvh w-full max-w-sm translate-x-0 flex-col border-l border-border bg-popover text-popover-foreground shadow-2xl outline-none transition-[opacity,transform] duration-200 data-[ending-style]:translate-x-full data-[ending-style]:opacity-0 data-[starting-style]:translate-x-full data-[starting-style]:opacity-0 data-[swiping]:transition-none sm:w-96",
            className,
          )}
          {...props}
        >
          <DrawerPrimitive.Content className="flex min-h-0 flex-1 flex-col">
            {children}
          </DrawerPrimitive.Content>
        </DrawerPrimitive.Popup>
      </DrawerViewport>
    </DrawerPortal>
  );
}

function DrawerHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="drawer-header"
      className={cn(
        "flex flex-col gap-2 border-b border-border p-5",
        className,
      )}
      {...props}
    />
  );
}

function DrawerBody({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="drawer-body"
      data-lenis-prevent
      className={cn(
        "flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-5",
        className,
      )}
      {...props}
    />
  );
}

function DrawerFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="drawer-footer"
      className={cn(
        "flex items-center justify-end gap-2 border-t border-border p-5",
        className,
      )}
      {...props}
    />
  );
}

type DrawerTitleProps = Omit<
  React.ComponentProps<typeof DrawerPrimitive.Title>,
  "className"
> & {
  className?: string;
};

function DrawerTitle({ className, ...props }: DrawerTitleProps) {
  return (
    <DrawerPrimitive.Title
      data-slot="drawer-title"
      className={cn(
        "text-lg font-extrabold tracking-tight text-foreground",
        className,
      )}
      {...props}
    />
  );
}

type DrawerDescriptionProps = Omit<
  React.ComponentProps<typeof DrawerPrimitive.Description>,
  "className"
> & {
  className?: string;
};

function DrawerDescription({ className, ...props }: DrawerDescriptionProps) {
  return (
    <DrawerPrimitive.Description
      data-slot="drawer-description"
      className={cn("text-sm leading-relaxed text-muted-foreground", className)}
      {...props}
    />
  );
}

function DrawerCloseButton() {
  return (
    <DrawerClose
      render={
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          className="absolute right-4 top-4 rounded-xl hover:bg-primary/20 hover:text-primary"
        />
      }
      aria-label="关闭设置"
    >
      <X data-icon="inline-start" />
    </DrawerClose>
  );
}

export {
  Drawer,
  DrawerTrigger,
  DrawerPortal,
  DrawerClose,
  DrawerBackdrop,
  DrawerViewport,
  DrawerContent,
  DrawerHeader,
  DrawerBody,
  DrawerFooter,
  DrawerTitle,
  DrawerDescription,
  DrawerCloseButton,
};
