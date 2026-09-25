"use client";

// Animate UI Radix Popover primitive, adapted from the official manual registry
// component to use this project's CSS Modules instead of shadcn/Tailwind styles.
import * as React from "react";
import * as RadixPopover from "@radix-ui/react-popover";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";

const OpenContext = React.createContext<boolean | null>(null);

type PopoverProps = React.ComponentProps<typeof RadixPopover.Root>;

export function Popover({ open, defaultOpen, onOpenChange, children, ...props }: PopoverProps) {
  const [internalOpen, setInternalOpen] = React.useState(defaultOpen ?? false);
  const isOpen = open ?? internalOpen;

  function setOpen(next: boolean) {
    if (open === undefined) setInternalOpen(next);
    onOpenChange?.(next);
  }

  return (
    <OpenContext.Provider value={isOpen}>
      <RadixPopover.Root {...props} open={isOpen} onOpenChange={setOpen}>
        {children}
      </RadixPopover.Root>
    </OpenContext.Provider>
  );
}

export const PopoverTrigger = RadixPopover.Trigger;

type ContentProps = Omit<React.ComponentProps<typeof RadixPopover.Content>, "asChild" | "forceMount">;

export function PopoverContent({ children, className, ...props }: ContentProps) {
  const isOpen = React.useContext(OpenContext);
  const reduceMotion = useReducedMotion();
  if (isOpen === null) throw new Error("PopoverContent requires Popover.");

  return (
    <AnimatePresence>
      {isOpen && (
        <RadixPopover.Portal forceMount>
          <RadixPopover.Content asChild forceMount {...props}>
            <motion.div
              className={className}
              initial={reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.96, y: -4 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.96, y: -4 }}
              transition={{ duration: reduceMotion ? 0.01 : 0.16, ease: "easeOut" }}
            >
              {children}
            </motion.div>
          </RadixPopover.Content>
        </RadixPopover.Portal>
      )}
    </AnimatePresence>
  );
}
