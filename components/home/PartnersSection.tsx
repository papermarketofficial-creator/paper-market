const PartnersSection = () => {
  return (
    <section className="pb-20">
      <div className="container mx-auto px-4 text-center">
        <p className="text-muted-foreground mb-8">
          Our Recent Clients & Partners
        </p>

        <div className="flex flex-wrap justify-center items-center gap-8 md:gap-12 opacity-60">
          {["Logoipsum", "Logoipsum", "Logoipsum", "Logoipsum", "Logoipsum"].map(
            (logo, i) => (
              <div
                key={i}
                className="text-foreground/60 font-semibold text-lg"
              >
                {logo}
              </div>
            )
          )}
        </div>
      </div>
    </section>
  );
};

export default PartnersSection;