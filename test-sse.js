// Test SSE connection manually
// Run this in browser console to test if SSE works

const testSSE = () => {
  console.log("🧪 Testing SSE Connection...");

  const eventSource = new EventSource(
    "/api/v1/market/stream?symbols=RELIANCE,TCS",
  );

  eventSource.onopen = () => {
    console.log("✅ SSE Connected!");
  };

  eventSource.onmessage = (event) => {
    console.log("📨 SSE Message:", event.data);
    try {
      const data = JSON.parse(event.data);
      console.log("📊 Parsed:", data);
    } catch (e) {
      console.log("Raw message:", event.data);
    }
  };

  eventSource.onerror = (error) => {
    console.error("❌ SSE Error:", error);
    console.log("ReadyState:", eventSource.readyState);
  };

  // Close after 10 seconds
  setTimeout(() => {
    console.log("🛑 Closing SSE connection");
    eventSource.close();
  }, 10000);
};

// Run the test
testSSE();
