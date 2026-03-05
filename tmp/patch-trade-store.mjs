import { createRequire } from "module";
const require = createRequire(import.meta.url);
const fs = require("fs");
const path = "stores/trading/tradeExecution.store.ts";
let content = fs.readFileSync(path, "utf8");

const oldSnippet = `        const backendMessage =\r\n          errorCode === "PARTIAL_EXIT_NOT_ALLOWED"\r\n            ? "Partial exit is disabled in paper trading mode."\r\n            : (typeof apiError === "string" && apiError) ||\r\n              apiError?.message ||\r\n              (typeof data?.message === "string" && data.message) ||\r\n              (!data && rawBody ? rawBody.slice(0, 300) : null) ||\r\n              \`Order placement failed (HTTP \${res.status})\`;`;

const newSnippet = `        const backendMessage = (() => {\r\n          if (errorCode === "MARKET_CLOSED")\r\n            return "Market is closed. Trading hours are 9:15 AM \u2013 3:30 PM IST (Mon\u2013Fri). You can still exit existing positions anytime.";\r\n          if (errorCode === "INSUFFICIENT_FUNDS")\r\n            return apiError?.message || data?.message || "Insufficient balance to place this order.";\r\n          if (errorCode === "INSTRUMENT_INACTIVE")\r\n            return "This instrument is no longer active or has expired.";\r\n          if (errorCode === "INSTRUMENT_NOT_ALLOWED")\r\n            return "Trading this instrument is not allowed in paper trading mode.";\r\n          if (errorCode === "PARTIAL_EXIT_NOT_ALLOWED")\r\n            return "Partial exit is disabled in paper trading mode.";\r\n          return (\r\n            (typeof apiError === "string" && apiError) ||\r\n            apiError?.message ||\r\n            (typeof data?.message === "string" && data.message) ||\r\n            (!data && rawBody ? rawBody.slice(0, 300) : null) ||\r\n            \`Order placement failed (HTTP \${res.status})\`\r\n          );\r\n        })();`;

if (content.includes(oldSnippet)) {
  content = content.replace(oldSnippet, newSnippet);
  fs.writeFileSync(path, content);
  console.log("Replaced (CRLF) successfully!");
} else {
  // Try LF
  const oldLF = oldSnippet.replace(/\r\n/g, "\n");
  const newLF = newSnippet.replace(/\r\n/g, "\n");
  if (content.includes(oldLF)) {
    content = content.replace(oldLF, newLF);
    fs.writeFileSync(path, content);
    console.log("Replaced (LF) successfully!");
  } else {
    // Show context
    const idx = content.indexOf("PARTIAL_EXIT_NOT_ALLOWED");
    console.log(
      "NOT FOUND. Context:",
      JSON.stringify(content.substring(idx - 100, idx + 400)),
    );
  }
}
