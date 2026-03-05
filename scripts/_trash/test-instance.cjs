const sdk = require("upstox-js-sdk");
console.log("ApiClient.instance exists?", !!sdk.ApiClient.instance);
try {
  const streamer = new sdk.MarketDataStreamerV3([], "full");
  console.log("Streamer instantiated with 2 args successfully");
} catch (e) {
  console.log("Streamer instantiation with 2 args failed:", e.message);
}
