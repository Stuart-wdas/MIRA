interface BrandProps {
  style?: string;
}

export function Brand({ style = "simple" }: BrandProps) {
  let logo = "";

  switch (style) {
    case "simple":
      logo = "/AppLogo.png";
      break;
    case "block":
      logo = "/AppBanner.png";
      break;
    case "banner":
      logo = "/AppBannerLogo.png";
  }

  return (
    <div className="brand" aria-label="Mira home">
      <img src={logo} className="brand-logo" />
    </div>
  );
}
