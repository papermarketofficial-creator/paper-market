// import fetch from "node-fetch"; // Using global fetch

const BASE_URL = "http://localhost:3000";
const EMAIL = `auto_test_${Date.now()}@example.com`;
const PASSWORD = "securepass123";

async function runTest() {
    console.log("🚀 Starting Auth & OMS Flow Test...");

    // 1. Signup
    console.log(`\n1️⃣  Signing up user: ${EMAIL}`);
    const signupRes = await fetch(`${BASE_URL}/api/auth/signup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            name: "Auto Tester",
            email: EMAIL,
            password: PASSWORD,
        }),
    });

    if (signupRes.status !== 201) {
        console.error("❌ Signup Failed:", await signupRes.text());
        process.exit(1);
    }
    console.log("✅ Signup Successful!");

    // 2. Get CSRF Token
    console.log("\n2️⃣  Fetching CSRF Token...");
    const csrfRes = await fetch(`${BASE_URL}/api/auth/csrf`);
    const csrfData = await csrfRes.json();
    const csrfToken = csrfData.csrfToken;

    // Extract cookies from CSRF response to maintain session for login

    const csrfCookies = csrfRes.headers.getSetCookie ? csrfRes.headers.getSetCookie() : [csrfRes.headers.get('set-cookie') || ''];
    const cookieHeader = csrfCookies?.map((c: string) => c.split(';')[0]).join('; ');

    console.log("✅ CSRF Token retrieved:", csrfToken);

    // 3. Login
    console.log("\n3️⃣  Logging in...");
    const loginParams = new URLSearchParams();
    loginParams.append("email", EMAIL);
    loginParams.append("password", PASSWORD);
    loginParams.append("csrfToken", csrfToken);
    loginParams.append("redirect", "false");
    loginParams.append("json", "true");

    const loginRes = await fetch(`${BASE_URL}/api/auth/callback/credentials`, {
        method: "POST",
        headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            "Cookie": cookieHeader || ""
        },
        body: loginParams,
    });

    if (loginRes.status !== 200) {
        console.error("❌ Login Failed:", await loginRes.text());
        process.exit(1);
    }

    // Get Session Cookie

    const loginCookies = loginRes.headers.getSetCookie ? loginRes.headers.getSetCookie() : [loginRes.headers.get('set-cookie') || ''];
    const sessionCookie = loginCookies?.find(c => c.includes("next-auth.session-token"));

    if (!sessionCookie) {
        console.error("❌ No Session Cookie received!");
        process.exit(1);
    }
    const fullCookieHeader = [...(csrfCookies || []), ...(loginCookies || [])].map(c => c.split(';')[0]).join('; ');
    console.log("✅ Login Successful! Session Cookie retrieved.");

    // 4. Place Order
    console.log("\n4️⃣  Placing Market Order...");
    const orderRes = await fetch(`${BASE_URL}/api/v1/orders`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "Cookie": fullCookieHeader
        },
        body: JSON.stringify({
            symbol: "RELIANCE",
            side: "BUY",
            quantity: 1,
            orderType: "MARKET"
        }),
    });

    const orderData = await orderRes.json();

    if (!orderData.success) {
        console.error("❌ Order Placement Failed:", orderData);
        process.exit(1);
    }

    console.log("✅ Order Placed Successfully!");
    console.log("   Order ID:", orderData.data.id);
    console.log("   Status:", orderData.data.status);

    console.log("\n🎉 TEST COMPLETE: Auth + OMS Flow is working perfectly!");
}

runTest();
