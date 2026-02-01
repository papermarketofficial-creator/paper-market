const sdk = require("upstox-js-sdk");
console.log("SDK Exports:", Object.keys(sdk));
console.log("Has Configuration?", !!sdk.Configuration);
console.log("Has MarketDataStreamerV3?", !!sdk.MarketDataStreamerV3);
console.log("SDK Type:", typeof sdk);
