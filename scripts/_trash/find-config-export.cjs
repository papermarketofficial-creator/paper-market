const sdk = require("upstox-js-sdk");
const keys = Object.keys(sdk);
const configKeys = keys.filter((k) => k.toLowerCase().includes("config"));
console.log("Keys matching 'config':", configKeys);

console.log("ApiClient exists?", !!sdk.ApiClient);
if (sdk.ApiClient) {
  console.log("ApiClient.Configuration exists?", !!sdk.ApiClient.Configuration);
}

// Try to instantiate ApiClient with plain object
try {
  const client = new sdk.ApiClient();
  client.authentications = {
    OAUTH2: { accessToken: "test" },
  };
  console.log("ApiClient instantiated successfully with default ctor");
} catch (e) {
  console.log("ApiClient instantiation failed:", e.message);
}
