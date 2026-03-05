import Link from 'next/link';
import { Twitter, Instagram, Linkedin, Github } from "lucide-react";
import Logo from '@/components/general/Logo';

const footerLinks = {
  Products: ["Trading Platform", "Mobile App", "API Access", "TradingBot"],
  Resources: ["Learning Center", "How It Works", "Trading Basics", "FAQ"],
  Company: ["About Us", "Careers", "Contact", "Legal"],
};

const Footer = () => {
  return (
    <footer className="py-16 border-t border-border/20 bg-blue-50/45 dark:bg-background">
      <div className="container mx-auto px-4">
        <div className="grid md:grid-cols-5 gap-12 mb-12">
          {/* Logo & Description */}
          <div className="md:col-span-2">
            <Link href="/" className="flex items-center gap-2 mb-4">
              <Logo />
            </Link>
            <p className="text-muted-foreground mb-6 max-w-xs">
              Empowering traders since 2020 with cutting-edge tools and reliable services.
            </p>
            {/* Social Icons */}
            <div className="flex gap-4">
              <a href="#" className="text-muted-foreground hover:text-foreground transition-colors">
                <Twitter className="w-5 h-5" />
              </a>
              <a href="#" className="text-muted-foreground hover:text-foreground transition-colors">
                <Instagram className="w-5 h-5" />
              </a>
              <a href="#" className="text-muted-foreground hover:text-foreground transition-colors">
                <Linkedin className="w-5 h-5" />
              </a>
              <a href="#" className="text-muted-foreground hover:text-foreground transition-colors">
                <Github className="w-5 h-5" />
              </a>
            </div>
          </div>

          {/* Link Columns */}
          {Object.entries(footerLinks).map(([title, links]) => (
            <div key={title}>
              <h4 className="text-foreground font-semibold mb-4">{title}</h4>
              <ul className="space-y-3">
                {links.map((link) => (
                  <li key={link}>
                    <a href="#" className="text-muted-foreground hover:text-foreground transition-colors">
                      {link}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* Copyright */}
        <div className="pt-8 border-t border-border/20 text-center">
          <p className="text-muted-foreground text-sm">
            © 2025 Paper Market Pro. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
