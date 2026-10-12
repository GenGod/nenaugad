// The arguments of `npm run ai:holds` (B47-001). The command moves money in the
// ledger, so an argument it does not understand is a refusal — never read as "just
// list" or as a different action (the B32 rule for `--limit`, scripts/cli-limit.ts).
export type HoldsCommand =
  | Readonly<{ kind: "list" }>
  | Readonly<{ kind: "cancel"; operationId: string }>
  | Readonly<{ kind: "settle"; operationId: string; amountMicroUsd: bigint; aboveReservation: boolean }>;

// What reserveBudget mints (src/server/ai/spending.ts).
const OPERATION_ID = /^op_[0-9a-f]{24}$/u;
// Micro-dollars, the ledger's unit ($0.0123 is 12300): a positive integer with no
// sign, point, exponent or leading zero. Twelve digits is $999,999, far above any cap.
const AMOUNT_MICRO_USD = /^[1-9][0-9]{0,11}$/u;
const FLAG = /^--(cancel|settle|amount|above-reservation)(?:=(.*))?$/u;

export function holdsCommand(argv: readonly string[]): Readonly<{ ok: true; command: HoldsCommand } | { ok: false }> {
  // A flag's value, or `true` for a flag given without `=`.
  const flags = new Map<string, string | true>();
  for (const argument of argv) {
    const match = FLAG.exec(argument);
    const name = match?.[1];
    if (name === undefined || flags.has(name)) return { ok: false };
    flags.set(name, match?.[2] ?? true);
  }
  const value = (name: string, pattern: RegExp): string | undefined => {
    const raw = flags.get(name);
    return typeof raw === "string" && pattern.test(raw) ? raw : undefined;
  };

  if (flags.size === 0) return { ok: true, command: { kind: "list" } };
  if (flags.has("cancel")) {
    const operationId = value("cancel", OPERATION_ID);
    return operationId !== undefined && flags.size === 1
      ? { ok: true, command: { kind: "cancel", operationId } }
      : { ok: false };
  }
  const operationId = value("settle", OPERATION_ID);
  const amount = value("amount", AMOUNT_MICRO_USD);
  const above = flags.get("above-reservation");
  if (operationId === undefined || amount === undefined || (above !== undefined && above !== true)) {
    return { ok: false };
  }
  return {
    ok: true,
    command: { kind: "settle", operationId, amountMicroUsd: BigInt(amount), aboveReservation: above === true },
  };
}
