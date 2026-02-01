
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { auth } from "@/lib/auth";
import { UpstoxService } from "@/services/upstox.service";
import Link from "next/link";
import { AlertCircle, CheckCircle2 } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { StreamControl } from "@/components/admin/StreamControl";

export default async function UpstoxAdminPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; message?: string }>;
}) {
  const { status, message } = await searchParams;
  const session = await auth();
  const userId = session?.user?.id;
  
  let isConnected = false;
  let token = null;

  if (userId) {
     token = await UpstoxService.getAccessToken(userId);
     isConnected = !!token;
  }

  return (
    <div className="space-y-6 container mx-auto py-8">
      <div>
        <h2 className="text-3xl font-bold tracking-tight">Upstox Integration</h2>
        <p className="text-muted-foreground">
          Manage your Real-Time Data Connection.
        </p>
      </div>

      {status === "success" && (
        <Alert className="bg-green-500/15 border-green-500/30 text-green-600">
          <CheckCircle2 className="h-4 w-4" />
          <AlertTitle>Success</AlertTitle>
          <AlertDescription>
            Successfully connected to Upstox! Token generated.
          </AlertDescription>
        </Alert>
      )}

      {status === "error" && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Connection Failed</AlertTitle>
          <AlertDescription>
            {message || "Unknown error occurred"}
          </AlertDescription>
        </Alert>
      )}

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Connection Status</CardTitle>
            <CardDescription>
                Live Market Data Feed
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
             <div className="flex items-center space-x-2">
                <div className={`h-3 w-3 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500'}`} />
                <span className="font-medium">
                    {isConnected ? "Connected" : "Disconnected"}
                </span>
             </div>
             
             {isConnected ? (
                 <div className="p-4 bg-muted rounded-md text-xs font-mono break-all">
                    Token Active
                 </div>
             ) : (
                 <Alert variant="default" className="bg-yellow-500/10 border-yellow-500/20 text-yellow-700">
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>
                        You must connect to Upstox to enable real-time trading.
                    </AlertDescription>
                 </Alert>
             )}

             <Button asChild className="w-full" variant={isConnected ? "outline" : "default"}>
                <Link href="/api/upstox/login">
                    {isConnected ? "Reconnect Upstox" : "Connect Upstox Account"}
                </Link>
             </Button>
          </CardContent>
        </Card>
        
        {isConnected && <StreamControl />}
      </div>
    </div>
  );
}
