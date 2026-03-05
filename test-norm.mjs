// Test normalization
import { toInstrumentKey } from "./lib/market/symbol-normalization.js";

console.log("=== Testing toInstrumentKey ===");
console.log("");

console.log("INDICES (should be mixed case):");
console.log(
  "1. NSE_INDEX|NIFTY 50     →",
  toInstrumentKey("NSE_INDEX|NIFTY 50"),
);
console.log(
  "2. NSE_INDEX|Nifty 50     →",
  toInstrumentKey("NSE_INDEX|Nifty 50"),
);
console.log(
  "3. nse_index|nifty 50     →",
  toInstrumentKey("nse_index|nifty 50"),
);
console.log("");

console.log("EQUITIES (should be uppercase):");
console.log(
  "4. NSE_EQ|INE002A01018    →",
  toInstrumentKey("NSE_EQ|INE002A01018"),
);
console.log(
  "5. nse_eq|ine002a01018    →",
  toInstrumentKey("nse_eq|ine002a01018"),
);
console.log(
  "6. NSE_EQ|INE467B01029    →",
  toInstrumentKey("NSE_EQ|INE467B01029"),
);
console.log("");

console.log("EXPECTED:");
console.log(
  "Indices: NSE_INDEX|Nifty 50, NSE_INDEX|Nifty Bank, NSE_INDEX|Nifty Fin Service",
);
console.log("Equities: NSE_EQ|INE002A01018, NSE_EQ|INE467B01029");
