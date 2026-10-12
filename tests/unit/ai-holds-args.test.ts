import test from "node:test";
import assert from "node:assert/strict";
import { holdsCommand } from "../../scripts/ai-holds-args.ts";

const ID = "op_0123456789abcdef01234567";

test("ai:holds arguments: list, cancel and settle parse (B47)", () => {
  assert.deepEqual(holdsCommand([]), { ok: true, command: { kind: "list" } });
  assert.deepEqual(holdsCommand([`--cancel=${ID}`]), { ok: true, command: { kind: "cancel", operationId: ID } });
  assert.deepEqual(holdsCommand([`--settle=${ID}`, "--amount=12300"]), {
    ok: true, command: { kind: "settle", operationId: ID, amountMicroUsd: 12_300n, aboveReservation: false },
  });
  assert.deepEqual(holdsCommand(["--amount=999999999999", "--above-reservation", `--settle=${ID}`]), {
    ok: true, command: { kind: "settle", operationId: ID, amountMicroUsd: 999_999_999_999n, aboveReservation: true },
  });
});

test("ai:holds arguments: anything malformed is refused, never read as a list or another action (B47)", () => {
  const settle = (amount: string) => [`--settle=${ID}`, `--amount=${amount}`];
  for (const argv of [
    // The operation id: empty, separated by a space, malformed, repeated.
    ["--cancel="], ["--cancel"], ["--cancel", ID], ["--cancel=op_123"], [`--cancel=${ID}…`],
    [`--cancel=${ID.toUpperCase()}`], [`--cancel=${ID}`, `--cancel=${ID}`],
    ["--settle=", "--amount=5"], ["--settle", ID, "--amount=5"], [`--settle=${ID}`, `--settle=${ID}`, "--amount=5"],
    // The amount: missing, empty, separated, not a positive integer of micro-dollars, repeated.
    [`--settle=${ID}`], [`--settle=${ID}`, "--amount="], [`--settle=${ID}`, "--amount", "5"],
    settle("0"), settle("-1"), settle("+5"), settle("1.5"), settle("5x"), settle("05"), settle(" 5"),
    settle("1e3"), settle("1_000"), settle("0x10"), settle("1000000000000"),
    [...settle("5"), "--amount=6"],
    // The flag that books above the reservation takes no value and only goes with --settle.
    [...settle("5"), "--above-reservation=yes"], [...settle("5"), "--above-reservation", "--above-reservation"],
    // Settle flags without --settle, or mixed with --cancel.
    ["--amount=5"], ["--above-reservation"], [`--cancel=${ID}`, "--amount=5"],
    [`--cancel=${ID}`, "--above-reservation"], [`--cancel=${ID}`, ...settle("5")],
    // Anything else.
    [`--cancle=${ID}`], ["list"], [...settle("5"), "--dry-run"],
  ]) {
    assert.deepEqual(holdsCommand(argv), { ok: false }, argv.join(" "));
  }
});
