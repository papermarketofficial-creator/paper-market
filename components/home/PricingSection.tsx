import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Check, X } from "lucide-react";

const plans = [
  {
    name: "Free Learner",
    price: "₹0",
    period: "/forever",
    description: "Perfect for beginners learning market basics",
    buttonText: "Start Free",
    features: [
      { text: "Virtual trading account", included: true },
      { text: "Basic price charts", included: true },
      { text: "Limited daily paper trades", included: true },
      { text: "Basic performance stats", included: true },
      { text: "Beginner learning guides", included: true },
    ],
    popular: false,
  },
  {
    name: "Pro Learner",
    price: "₹299",
    period: "/month",
    description: "For serious learners practicing daily",
    buttonText: "Upgrade to Pro",
    features: [
      { text: "Unlimited paper trades", included: true },
      { text: "Advanced charts & indicators", included: true },
      { text: "Trade journal & notes", included: true },
      { text: "Detailed P&L analytics", included: true },
      { text: "Priority learning support", included: true },
    ],
    popular: true,
  },
  {
    name: "Elite Simulator",
    price: "₹999",
    period: "/month",
    description: "For advanced strategy testing & analysis",
    buttonText: "Get Elite Access",
    features: [
      { text: "All Pro Learner features", included: true },
      { text: "Strategy performance analytics", included: true },
      { text: "Advanced risk & drawdown stats", included: true },
      { text: "Trade history export (CSV)", included: true },
      { text: "Early access to new features", included: true },
    ],
    popular: false,
  },
];

const PricingSection = () => {
  return (
    <section
      id="pricing"
      className="py-20 bg-blue-50/45 dark:bg-background transition-colors duration-300"
    >
      <div className="container mx-auto px-4">
        {/* Section Tag */}
        <div className="flex justify-center mb-6">
          <span className="px-4 py-2 bg-muted/50 text-muted-foreground rounded-full text-sm font-medium">
            Pricing
          </span>
        </div>

        {/* Heading */}
        <h2 className="text-3xl md:text-4xl font-bold text-center text-foreground mb-4">
          Simple Plans for Learning & Practice
        </h2>
        <p className="text-muted-foreground text-center mb-12 max-w-xl mx-auto">
          Choose a plan based on how deeply you want to practice and analyze your
          paper trading performance.
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
                  <span className="text-primary text-sm font-medium mb-2 block">
                    Most Popular
                  </span>
                )}
                {!plan.popular && (
                  <span className="text-muted-foreground text-sm font-medium mb-2 block">
                    {plan.name}
                  </span>
                )}

                {/* Price */}
                <div className="mb-4">
                  <span className="text-4xl font-bold text-foreground">
                    {plan.price}
                  </span>
                  <span className="text-muted-foreground">{plan.period}</span>
                </div>

                <p className="text-muted-foreground mb-6">
                  {plan.description}
                </p>

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
                      <span className="text-muted-foreground">
                        {feature.text}
                      </span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Disclaimer */}
        <p className="mt-16 text-center text-xs text-muted-foreground max-w-2xl mx-auto">
          All plans are for educational paper trading only. No real money trading,
          investment advice, or guaranteed outcomes are provided.
        </p>
      </div>
    </section>
  );
};

export default PricingSection;
