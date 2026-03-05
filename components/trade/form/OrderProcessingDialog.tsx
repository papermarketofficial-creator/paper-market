"use client";

import { AlertTriangle, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import FailureIndicator from "@/components/ui/failure-indicator";
import SuccessIndicator from "@/components/ui/success-indicator";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface OrderProcessingDialogProps {
  isProcessing: boolean;
  errorMessage?: string | null;
  onDismissError?: () => void;
}

export function OrderProcessingDialog({
  isProcessing,
  errorMessage = null,
  onDismissError,
}: OrderProcessingDialogProps) {
  const hasError = Boolean(errorMessage);
  const open = isProcessing || hasError;

  return (
    <AlertDialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen && !isProcessing && hasError) {
          onDismissError?.();
        }
      }}
    >
      <AlertDialogContent className="max-w-md border-border bg-card p-0">
        <div className="rounded-sm border border-border/70 bg-gradient-to-b from-card to-card/80 p-5">
          <AlertDialogHeader className="items-center text-center">
            <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-border/70 bg-background/70 px-3 py-1 text-[11px] uppercase tracking-wider text-muted-foreground">
              {hasError ? <AlertTriangle className="h-3.5 w-3.5 text-red-400" /> : <ShieldCheck className="h-3.5 w-3.5 text-emerald-400" />}
              {hasError ? "Order Rejected" : "Order Gateway"}
            </div>

            {hasError ? (
              <FailureIndicator size={42} strokeWidth={4.5} />
            ) : (
              <SuccessIndicator isComplete={false} size={42} strokeWidth={4} />
            )}

            <AlertDialogTitle className="text-base font-semibold">
              {hasError ? "Order Failed" : "Processing Order"}
            </AlertDialogTitle>
            <AlertDialogDescription className="max-w-xs text-center">
              {hasError
                ? String(errorMessage)
                : "Running risk checks and routing your order. Please wait..."}
            </AlertDialogDescription>
          </AlertDialogHeader>

          {hasError ? (
            <div className="mt-5 flex justify-center">
              <Button type="button" className="h-8 px-4 text-xs" onClick={onDismissError}>
                Dismiss
              </Button>
            </div>
          ) : (
            <p className="mt-4 text-center text-[11px] text-muted-foreground">
              Do not refresh or close this tab while the request is in-flight.
            </p>
          )}
        </div>
      </AlertDialogContent>
    </AlertDialog>
  );
}
