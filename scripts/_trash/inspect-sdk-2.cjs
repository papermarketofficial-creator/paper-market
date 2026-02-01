const sdk = require("upstox-js-sdk");
console.log("Has Configuration?", "Configuration" in sdk);
console.log("Has MarketDataStreamerV3?", "MarketDataStreamerV3" in sdk);
console.log("All Keys:", Object.keys(sdk).join(", "));
