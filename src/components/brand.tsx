export function Brand() {
  const logo = process.env.NEXT_PUBLIC_LOGO_URL;
  return (
    <span className="brand">
      {logo ? (
        <img className="brand-logo" src={logo} alt="Cedar Winds" />
      ) : (
        <span className="logo-placeholder" title="Company logo placeholder">
          LOGO<span>placeholder</span>
        </span>
      )}
      <span className="brand-name">
        CEDAR WINDS<small>DESIGN~BUILD</small>
      </span>
    </span>
  );
}
