const sdk = require("upstox-js-sdk");
try {
  const streamer = new sdk.MarketDataStreamerV3([], "ltpc");
  console.log("Streamer Keys:", Object.keys(streamer).join(", "));
  console.log(
    "Streamer Prototype Keys:",
    Object.keys(Object.getPrototypeOf(streamer)).join(", "),
  );

  const methods = Object.getOwnPropertyNames(Object.getPrototypeOf(streamer));
  console.log("Streamer Methods:", methods.join(", "));

  console.log("Has auto_reconnect?", typeof streamer.auto_reconnect);
  console.log("Has autoReconnect?", typeof streamer.autoReconnect);
} catch (e) {
  console.log("Error:", e.message);
}
