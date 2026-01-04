import Link from 'next/link';
import { Button } from "@/components/ui/button";
import { ArrowRight } from "lucide-react";

const CTASection = () => {
  return (
    <section className="py-20">
      <div className="container mx-auto px-4">
        <div className="relative bg-gradient-to-br from-primary/20 via-background to-primary/10 rounded-[48px] p-12 md:p-20 text-center overflow-hidden border border-primary/20">
          {/* Background Effects */}
          <div className="absolute inset-0 pointer-events-none">
            <div className="absolute top-0 left-1/4 w-[400px] h-[400px] bg-primary/30 rounded-full blur-[200px]" />
            <div className="absolute bottom-0 right-1/4 w-[300px] h-[300px] bg-primary/20 rounded-full blur-[150px]" />
          </div>

          <div className="relative z-10">
            <h2 className="text-3xl md:text-4xl lg:text-5xl font-bold text-foreground mb-6">
              Ready to Trade Smarter?
            </h2>
            <p className="text-muted-foreground mb-8 max-w-xl mx-auto">
              A trusted platform designed for every type of trader.
            </p>
            <div className="flex flex-wrap justify-center gap-4">
              <Link href="/dashboard">
                <Button size="lg" className="rounded-full bg-primary hover:bg-primary/90 px-8 gap-2">
                  Create your free account <ArrowRight className="w-4 h-4" />
                </Button>
              </Link>
              <Button size="lg" variant="outline" className="rounded-full px-8 border-foreground/20 hover:bg-foreground/5">
                Learn More
              </Button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default CTASection;
