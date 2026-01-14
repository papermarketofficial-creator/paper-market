"use client";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { LogOut, User } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

export function UserProfile() {
    const router = useRouter();

    return (
        <div className="border-t border-sidebar-border p-2 flex-shrink-0">
            <DropdownMenu>
                <DropdownMenuTrigger asChild>
                    <Button
                        variant="ghost"
                        className="w-full flex items-center justify-start gap-3 px-2 py-2 h-auto hover:bg-sidebar-accent hover:text-sidebar-accent-foreground rounded-lg transition-colors group/user"
                    >
                        <Avatar className="h-8 w-8 border border-primary/20 flex-shrink-0">
                            <AvatarFallback className="bg-primary/10 text-primary text-xs font-semibold">
                                JD
                            </AvatarFallback>
                        </Avatar>

                        {/* Desktop: Hidden when collapsed, visible when expanded */}
                        <div
                            className={cn(
                                "flex flex-col items-start text-left overflow-hidden transition-all duration-300",
                                // Desktop logic: Handled by parent 'group' class usually, but here we rely on md: styles 
                                // We keep the logic simple: md:flex but hidden if parent is collapsed?
                                // The original logic relied on sidebar state or group-hover.
                                // Re-implementing class logic carefully to match previous behavior.
                                "hidden md:flex md:opacity-0 md:w-0 md:group-hover:opacity-100 md:group-hover:w-auto",
                                // Mobile logic
                                "flex opacity-100 w-auto"
                            )}
                        >
                            <span className="text-sm font-medium truncate">John Doe</span>
                            <span className="text-xs text-muted-foreground truncate w-32">
                                john@example.com
                            </span>
                        </div>
                    </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                    className="w-56"
                    align="start"
                    side="right"
                    sideOffset={10}
                >
                    <DropdownMenuItem
                        onClick={() => router.push("/profile")}
                        className="cursor-pointer"
                    >
                        <User className="mr-2 h-4 w-4" />
                        Profile
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                        onClick={() => {
                            toast.success("Logged out successfully");
                            router.push("/");
                        }}
                        className="text-destructive focus:text-destructive cursor-pointer"
                    >
                        <LogOut className="mr-2 h-4 w-4" />
                        Logout
                    </DropdownMenuItem>
                </DropdownMenuContent>
            </DropdownMenu>
        </div>
    );
}
