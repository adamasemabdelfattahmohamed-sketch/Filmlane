"use client";

import * as React from "react";
import { toast } from "sonner";

export type ToastProps = {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  variant?: "default" | "destructive";
};

export type ToastActionElement = React.ReactElement;

export { toast };
