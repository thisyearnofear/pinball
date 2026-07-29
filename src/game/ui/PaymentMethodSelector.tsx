import React, { useEffect, useState } from "react";
import { colors, spacing, typography, radius } from "@/theme/tokens";
import { Button } from "./Button";
import { getAppConfig } from "@/config/app-config";
import { isNimPaymentAvailable } from "@/services/nimiq/nimiq-payment";
import { isInsideNimiqPay } from "@/services/nimiq/nimiq-provider";
import { getPaymentTokenSymbol } from "@/services/contracts/payment-token-client";

export type PaymentMethod = "usdt" | "nim";

type Props = {
  entryFeeLabel: string;
  onSelect: (method: PaymentMethod) => void;
  onCancel: () => void;
  busy?: boolean;
};

export function PaymentMethodSelector(props: Props) {
  const cfg = getAppConfig();
  const nimAvailable = isNimPaymentAvailable() && isInsideNimiqPay();
  const evmSymbol = getPaymentTokenSymbol();
  const [selected, setSelected] = useState<PaymentMethod>("usdt");

  useEffect(() => {
    if (!nimAvailable) setSelected("usdt");
  }, [nimAvailable]);

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: colors.background.overlay,
        backdropFilter: "blur(8px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: spacing.lg,
        zIndex: 250,
        animation: "fadeIn 150ms ease",
      }}
      onClick={props.onCancel}
    >
      <div
        style={{
          width: "min(400px, 100%)",
          background: colors.background.surface,
          border: `1px solid ${colors.border.default}`,
          borderRadius: radius.xl,
          padding: spacing["2xl"],
          boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
          animation: "slideUp 200ms ease",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ fontSize: typography.size.xl, fontWeight: typography.weight.bold, color: colors.text.primary, marginBottom: spacing.xs }}>
          Choose Payment Method
        </div>
        <div style={{ fontSize: typography.size.sm, color: colors.text.secondary, marginBottom: spacing.lg }}>
          Entry fee: {props.entryFeeLabel}
        </div>

        {/* USDT option */}
        <button
          type="button"
          onClick={() => setSelected("usdt")}
          style={{
            display: "flex",
            alignItems: "center",
            gap: spacing.md,
            width: "100%",
            padding: `${spacing.md}px ${spacing.lg}px`,
            marginBottom: spacing.sm,
            borderRadius: radius.md,
            border: selected === "usdt" ? "2px solid #26a17b" : `1px solid ${colors.border.default}`,
            background: selected === "usdt" ? "rgba(38,161,123,0.1)" : "transparent",
            cursor: "pointer",
            textAlign: "left",
            transition: "border-color 150ms, background 150ms",
          }}
        >
          <span style={{ fontSize: 28 }}>💵</span>
          <div>
            <div style={{ fontSize: typography.size.md, fontWeight: typography.weight.bold, color: colors.text.primary }}>
              USDT <span style={{ fontWeight: 400, color: colors.text.muted, fontSize: typography.size.xs }}>(Polygon)</span>
            </div>
            <div style={{ fontSize: typography.size.xs, color: colors.text.secondary }}>
              Tether on Polygon · via Nimiq Pay EVM wallet
            </div>
          </div>
          {selected === "usdt" && <span style={{ marginLeft: "auto", color: "#26a17b", fontWeight: 700 }}>✓</span>}
        </button>

        {/* NIM option */}
        <button
          type="button"
          onClick={() => nimAvailable && setSelected("nim")}
          style={{
            display: "flex",
            alignItems: "center",
            gap: spacing.md,
            width: "100%",
            padding: `${spacing.md}px ${spacing.lg}px`,
            marginBottom: spacing.lg,
            borderRadius: radius.md,
            border: selected === "nim" ? "2px solid #e9b217" : `1px solid ${colors.border.default}`,
            background: selected === "nim" ? "rgba(233,178,23,0.1)" : "transparent",
            cursor: nimAvailable ? "pointer" : "not-allowed",
            textAlign: "left",
            opacity: nimAvailable ? 1 : 0.5,
            transition: "border-color 150ms, background 150ms",
          }}
        >
          <span style={{ fontSize: 28 }}>🪙</span>
          <div>
            <div style={{ fontSize: typography.size.md, fontWeight: typography.weight.bold, color: colors.text.primary }}>
              NIM <span style={{ fontWeight: 400, color: colors.text.muted, fontSize: typography.size.xs }}>(Nimiq native)</span>
            </div>
            <div style={{ fontSize: typography.size.xs, color: colors.text.secondary }}>
              {nimAvailable
                ? `Pay ${cfg.nim.entryFeeNim} NIM · earns bonus points`
                : "Available inside Nimiq Pay app"}
            </div>
          </div>
          {selected === "nim" && nimAvailable && <span style={{ marginLeft: "auto", color: "#e9b217", fontWeight: 700 }}>✓</span>}
        </button>

        <div style={{ display: "flex", gap: spacing.sm }}>
          <Button variant="ghost" onClick={props.onCancel} style={{ flex: 1 }}>
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={() => props.onSelect(selected)}
            disabled={props.busy}
            style={{ flex: 2 }}
          >
            {props.busy ? "Processing..." : selected === "nim" ? "Pay with NIM" : `Pay with ${evmSymbol}`}
          </Button>
        </div>
      </div>
    </div>
  );
}
