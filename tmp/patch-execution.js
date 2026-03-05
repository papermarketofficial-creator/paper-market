const fs = require("fs");
const path = "services/execution.service.ts";
let content = fs.readFileSync(path, "utf8");
const old =
  'idempotencyKey: this.buildLedgerIdempotencyKey(order, "REALIZED_PNL_DEBIT"),\r\n                                    }';
const replacement =
  'idempotencyKey: this.buildLedgerIdempotencyKey(order, "REALIZED_PNL_DEBIT"),\r\n                                        isSettlement: true, // Loss settled via blocked margin — skip cash check\r\n                                    }';
if (content.includes(old)) {
  content = content.replace(old, replacement);
  fs.writeFileSync(path, content);
  console.log("Replaced successfully!");
} else {
  // Try LF version
  const oldLF =
    'idempotencyKey: this.buildLedgerIdempotencyKey(order, "REALIZED_PNL_DEBIT"),\n                                    }';
  const replacementLF =
    'idempotencyKey: this.buildLedgerIdempotencyKey(order, "REALIZED_PNL_DEBIT"),\n                                        isSettlement: true, // Loss settled via blocked margin\n                                    }';
  if (content.includes(oldLF)) {
    content = content.replace(oldLF, replacementLF);
    fs.writeFileSync(path, content);
    console.log("Replaced (LF) successfully!");
  } else {
    console.log("NOT FOUND. Showing context around REALIZED_PNL_DEBIT:");
    const idx = content.indexOf("REALIZED_PNL_DEBIT");
    console.log(JSON.stringify(content.substring(idx - 20, idx + 200)));
  }
}
