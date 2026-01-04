
const PartnersSection = () => {
  // Mock data for logos - in a real app, these would be SVG paths or Image URLs
  const partners = [
    { name: "Logoipsum", id: 1 },
    { name: "Logoipsum", id: 2 },
    { name: "Logoipsum", id: 3 },
    { name: "Logoipsum", id: 4 },
    { name: "Logoipsum", id: 5 },
  ];

  return (
    <section className="py-12 md:py-20   bg-blue-50/45 dark:bg-background transition-colors duration-300">
      <div className="container mx-auto px-4">
        <p className="text-center text-sm font-medium uppercase tracking-widest text-slate-500 dark:text-slate-400 mb-10">
          Trusted by Industry Leaders
        </p>

        <div className="flex flex-wrap justify-center items-center gap-x-12 gap-y-8 md:gap-x-20">
          {partners.map((partner) => (
            <div
              key={partner.id}
              className="group relative flex items-center justify-center transition-all duration-300"
            >
              {/* Logo Placeholder - Stylized as a real logo */}
              <div className="flex items-center gap-2">
                {/* Mock Logo Icon */}
                <div className="w-8 h-8 rounded-lg bg-blue-600/10 dark:bg-blue-400/10 flex items-center justify-center group-hover:bg-blue-600/20 transition-colors">
                  <div className="w-4 h-4 rounded-sm bg-blue-600 dark:bg-blue-400" />
                </div>
                
                {/* Logo Text */}
                <span className="text-xl font-bold tracking-tight
                  text-slate-400 grayscale group-hover:grayscale-0 group-hover:text-slate-900 
                  dark:text-slate-500 dark:group-hover:text-white
                  transition-all duration-300">
                  {partner.name}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default PartnersSection;