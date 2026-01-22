import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import Logo from "@/components/general/Logo";

export default function AuthLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <div className="min-h-screen w-full lg:grid lg:grid-cols-2">
            {/* Left Panel - Visuals */}
            <div className="hidden lg:flex flex-col relative bg-zinc-900 border-r border-zinc-800 text-white p-10 overflow-hidden">
                {/* Abstract Background Effects */}
                <div className="absolute top-0 left-0 w-full h-full bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-emerald-900/40 via-zinc-900 to-zinc-900" />
                <div className="absolute inset-0 bg-[url('/grid-pattern.svg')] opacity-10" />

                {/* Floating Abstract "Market" Element circles */}
                <div className="absolute top-1/3 left-1/4 w-72 h-72 bg-emerald-500/10 rounded-full blur-3xl animate-pulse" />
                <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-blue-500/10 rounded-full blur-3xl" />

                <div className="relative z-10 mb-20">
                    <Logo className="text-white [&_path.stroke-primary]:stroke-emerald-500 [&_span]:text-white" />
                </div>

                <div className="relative z-10 mt-auto mb-20 space-y-4">
                    <blockquote className="space-y-2">
                        <p className="text-xl font-medium leading-relaxed font-serif text-zinc-200">
                            &ldquo;The goal of a successful trader is to make the best trades. Money is secondary.&rdquo;
                        </p>
                        <footer className="text-sm text-zinc-500 uppercase tracking-widest font-semibold">
                            — Alexander Elder
                        </footer>
                    </blockquote>
                </div>

                {/* Dynamic Chart Line Decoration */}
                <div className="absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-zinc-900 to-transparent z-20" />
                <svg
                    className="absolute bottom-0 left-0 right-0 w-full h-48 text-emerald-500/20 z-10"
                    fill="none"
                    viewBox="0 0 400 100"
                    preserveAspectRatio="none"
                >
                    <path
                        d="M0,80 C100,70 150,90 200,60 C250,30 300,50 350,20 L400,0 L400,100 L0,100 Z"
                        fill="currentColor"
                    />
                </svg>
            </div>

            {/* Right Panel - Form Content */}
            <div className="flex flex-col min-h-screen bg-background relative">
                <div className="absolute top-4 left-4 lg:top-8 lg:left-8">
                    <Link
                        href="/"
                        className="inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 hover:bg-accent hover:text-accent-foreground h-9 px-4 py-2 group"
                    >
                        <ArrowLeft className="mr-2 h-4 w-4 transition-transform group-hover:-translate-x-1" />
                        Back to Home
                    </Link>
                </div>

                <main className="flex-1 flex items-center justify-center p-8">
                    <div className="w-full max-w-[400px] flex flex-col justify-center space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
                        {children}
                    </div>
                </main>

                <div className="p-8 text-center text-sm text-muted-foreground w-full">
                    <p>
                        By continuing, you buy agree to our{" "}
                        <Link href="/terms" className="underline underline-offset-4 hover:text-primary">
                            Terms
                        </Link>{" "}
                        and{" "}
                        <Link href="/privacy" className="underline underline-offset-4 hover:text-primary">
                            Privacy Policy
                        </Link>
                        .
                    </p>
                </div>
            </div>
        </div>
    );
}
