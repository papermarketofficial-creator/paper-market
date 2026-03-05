"use client";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useSession } from "next-auth/react";
import { cn } from "@/lib/utils";
import { useRouter } from "next/navigation";


export function UserProfile() {
    const router = useRouter();
    const { data: session } = useSession();

    if (!session?.user) return null;

    return (
        <div className="border-t border-sidebar-border p-2 flex-shrink-0">
            <button
                onClick={() => router.push("/profile")}
                className="w-full flex items-center justify-start gap-3 px-2 py-2 h-auto hover:bg-sidebar-accent hover:text-sidebar-accent-foreground rounded-lg transition-colors group/user"
            >
                <Avatar className="h-8 w-8 border border-primary/20 flex-shrink-0">
                    <AvatarImage src={session?.user?.image || ""} alt={session?.user?.name || "User"} />
                    <AvatarFallback className="bg-primary/10 text-primary text-xs font-semibold">
                        {session?.user?.name?.charAt(0) || "U"}
                    </AvatarFallback>
                </Avatar>

                {/* Desktop: Hidden when collapsed, visible when expanded */}
                <div
                    className={cn(
                        "flex flex-col items-start text-left overflow-hidden transition-all duration-300",
                        // Desktop logic
                        "hidden md:flex md:opacity-0 md:w-0 md:group-hover:opacity-100 md:group-hover:w-auto",
                        // Mobile logic
                        "flex opacity-100 w-auto"
                    )}
                >
                    <span className="text-sm font-medium truncate">{session?.user?.name || "User"}</span>
                    <span className="text-xs text-muted-foreground truncate w-32">
                        {session?.user?.email}
                    </span>
                </div>
            </button>
        </div>
    );
}
