/** Expose only guest-facing amenity settings from the property's configuration. */
export function publicProperty(property: Record<string, any>) {
  const {features, ...details} = property;
  return {...details, features: {
    amenities: Array.isArray(features?.amenities) ? features.amenities : [],
    ...(Array.isArray(features?.amenity_highlights) ? {amenity_highlights: features.amenity_highlights} : {}),
    ...(features?.amenity_categories && typeof features.amenity_categories === "object" ? {amenity_categories: features.amenity_categories} : {}),
  }};
}
