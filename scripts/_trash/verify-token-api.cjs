const { UpstoxService } = require("../services/upstox.service");
const axios = require("axios");

async function verifyToken() {
  console.log("🔍 Fetching token from DB...");
  const token = await UpstoxService.getSystemToken();

  if (!token) {
    console.error("❌ No token found in DB");
    process.exit(1);
  }

  console.log("📡 Sending test request to Upstox Profile API...");
  try {
    const response = await axios.get("https://api.upstox.com/v2/user/profile", {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
      },
    });

    if (response.status === 200) {
      console.log("✅ SUCCESS: Token is VALID");
      console.log("👤 User Name:", response.data.data.user_name);
      console.log("🆔 User ID:", response.data.data.user_id);
    } else {
      console.log(`⚠️ Status: ${response.status}`);
      console.log("Response:", response.data);
    }
  } catch (error) {
    if (error.response) {
      console.error(
        `❌ FAILED: ${error.response.status} ${error.response.statusText}`,
      );
      console.error("Data:", error.response.data);
    } else {
      console.error("❌ ERROR:", error.message);
    }
  }
}

verifyToken();
