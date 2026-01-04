import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Check, X } from "lucide-react";

const plans = [
  {
    name: "Starter",
    price: "$0",
    period: "/mo",
    description: "Perfect for beginners",
    buttonText: "Create Free Plan",
    features: [
      { text: "Demo account", included: true },
      { text: "Basic charts", included: true },
      { text: "Email support", included: true },
      { text: "Limited trades", included: true },
      { text: "Starter guides", included: true },
    ],
    popular: false,
  },
  {
    name: "Popular",
    price: "$29",
    period: "/mo",
    description: "For active traders",
    buttonText: "Create Popular",
    features: [
      { text: "Full trading panel", included: true },
      { text: "Real-time data", included: true },
      { text: "Advanced charting", included: true },
      { text: "Unlimited trades", included: true },
      { text: "Priority support", included: true },
    ],
    popular: true,
  },
  {
    name: "Elite",
    price: "$99",
    period: "/mo",
    description: "For professionals",
    buttonText: "Create Elite Plan",
    features: [
      { text: "All Popular features", included: true },
      { text: "Market analysis", included: true },
      { text: "AI insights", included: true },
      { text: "Custom trading bots", included: true },
      { text: "VIP support", included: true },
    ],
    popular: false,
  },
];

const PricingSection = () => {
  return (
    <section id="pricing" className="py-20">
      <div className="container mx-auto px-4">
        {/* Section Tag */}
        <div className="flex justify-center mb-6">
          <span className="px-4 py-2 bg-muted/50 text-muted-foreground rounded-full text-sm font-medium">
            Pricing
          </span>
        </div>

        {/* Heading */}
        <h2 className="text-3xl md:text-4xl font-bold text-center text-foreground mb-4">
          Choose the Right Plan for You
        </h2>
        <p className="text-muted-foreground text-center mb-12 max-w-xl mx-auto">
          Find a plan that's tailored for beginners, pros, and everyone in between.
        </p>

        {/* Pricing Cards */}
        <div className="grid md:grid-cols-3 gap-6 max-w-5xl mx-auto">
          {plans.map((plan, index) => (
            <Card 
              key={index} 
              className={`rounded-[32px] transition-all ${
                plan.popular 
                  ? "bg-card border-primary/50 scale-105" 
                  : "bg-card/50 backdrop-blur-sm border-border/30"
              }`}
            >
              <CardContent className="p-8">
                {/* Plan Label */}
                {plan.popular && (
                  <span className="text-primary text-sm font-medium mb-2 block">Popular</span>
                )}
                {!plan.popular && (
                  <span className="text-muted-foreground text-sm font-medium mb-2 block">{plan.name}</span>
                )}

                {/* Price */}
                <div className="mb-4">
                  <span className="text-4xl font-bold text-foreground">{plan.price}</span>
                  <span className="text-muted-foreground">{plan.period}</span>
                </div>

                <p className="text-muted-foreground mb-6">{plan.description}</p>

                {/* CTA Button */}
                <Button 
                  className={`w-full rounded-full mb-6 ${
                    plan.popular 
                      ? "bg-primary hover:bg-primary/90" 
                      : "bg-muted hover:bg-muted/80 text-foreground"
                  }`}
                >
                  {plan.buttonText}
                </Button>

                {/* Features */}
                <ul className="space-y-3">
                  {plan.features.map((feature, i) => (
                    <li key={i} className="flex items-center gap-3">
                      {feature.included ? (
                        <Check className="w-5 h-5 text-success" />
                      ) : (
                        <X className="w-5 h-5 text-muted-foreground" />
                      )}
                      <span className="text-muted-foreground">{feature.text}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
};

export default PricingSection;
