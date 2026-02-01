
"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Play, Loader2 } from "lucide-react";
import { toast } from "sonner";

export function StreamControl() {
  const [loading, setLoading] = useState(false);

  async function startStream() {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/stream/control", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "start" }),
      });
      
      const data = await res.json();
      
      if (!res.ok) throw new Error(data.error);
      
      toast.success(data.message);
    } catch (error: any) {
      toast.error("Failed to start stream: " + error.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Stream Control</CardTitle>
        <CardDescription>
          Start the WebSocket feed to receive real-time ticks.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Button onClick={startStream} disabled={loading} className="w-full">
            {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Play className="mr-2 h-4 w-4" />}
            Start Data Stream
        </Button>
      </CardContent>
    </Card>
  );
}
