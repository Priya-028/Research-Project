import React from 'react';

const FeaturePageHero = ({
  badgeIcon,
  badgeText,
  titleLeading,
  titleHighlight,
  subtitle,
  features = [],
  className = ''
}) => {
  const heroClassName = ['feature-page-hero', 'prod-hero', className]
    .filter(Boolean)
    .join(' ');

  return (
    <section className={heroClassName}>
      <div className="prod-hero-heading">
        <div className="prod-hero-badge">
          <i className={badgeIcon}></i>
          <span>{badgeText}</span>
        </div>
        <h1 className="prod-hero-title">
          {titleLeading ? <>{titleLeading} </> : null}
          <span className="prod-hero-highlight">{titleHighlight}</span>
        </h1>
        <p className="prod-hero-subtitle">{subtitle}</p>
      </div>

      {features.length > 0 && (
        <>
          <div className="prod-hero-divider"></div>

          <div className="prod-hero-pills">
            {features.map((feature) => (
              <div className="prod-hero-pill" key={feature.label}>
                <span className="prod-pill-icon">
                  <i className={feature.icon}></i>
                </span>
                <span className="prod-pill-label">{feature.label}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </section>
  );
};

export default FeaturePageHero;