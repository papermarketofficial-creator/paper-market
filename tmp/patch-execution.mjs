import { createRequire } from "module";
const require = createRequire(import.meta.url);
const fs = require("fs");
const path = "services/execution.service.ts";
let content = fs.readFileSync(path, "utf8");
const old =
  'idempotencyKey: this.buildLedgerIdempotencyKey(order, "REALIZED_PNL_DEBIT"),\r\n                                    }';
const replacement =
  'idempotencyKey: this.buildLedgerIdempotencyKey(order, "REALIZED_PNL_DEBIT"),\r\n                                        isSettlement: true,\r\n                                    }';
if (content.includes(old)) {
  content = content.replace(old, replacement);
  fs.writeFileSync(path, content);
  console.log("Replaced (CRLF) successfully!");
} else {
  const oldLF =
    'idempotencyKey: this.buildLedgerIdempotencyKey(order, "REALIZED_PNL_DEBIT"),\n                                    }';
  const replacementLF =
    'idempotencyKey: this.buildLedgerIdempotencyKey(order, "REALIZED_PNL_DEBIT"),\n                                        isSettlement: true,\n                                    }';
  if (content.includes(oldLF)) {
    content = content.replace(oldLF, replacementLF);
    fs.writeFileSync(path, content);
    console.log("Replaced (LF) successfully!");
  } else {
    const idx = content.indexOf("REALIZED_PNL_DEBIT");
    console.log(
      "NOT FOUND. Context:",
      JSON.stringify(content.substring(idx - 20, idx + 200)),
    );
  }
}
