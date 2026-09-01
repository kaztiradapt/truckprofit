export type LongitudeLatitude = [number, number];

export function decodeGooglePolyline(value: unknown): LongitudeLatitude[] | null {
  if (typeof value !== "string" || !value || value.length > 500_000) return null;
  const encoded = value;
  const coordinates: LongitudeLatitude[] = [];
  let index = 0;
  let latitude = 0;
  let longitude = 0;

  function decodeNumber(): number | null {
    let result = 0;
    let shift = 0;
    while (index < encoded.length) {
      const byte = encoded.charCodeAt(index++) - 63;
      if (byte < 0 || byte > 63 || shift > 30) return null;
      result |= (byte & 0x1f) << shift;
      shift += 5;
      if (byte < 0x20) return (result & 1) ? ~(result >> 1) : result >> 1;
    }
    return null;
  }

  while (index < encoded.length) {
    const latitudeDelta = decodeNumber();
    const longitudeDelta = decodeNumber();
    if (latitudeDelta === null || longitudeDelta === null) return null;
    latitude += latitudeDelta;
    longitude += longitudeDelta;
    const decodedLatitude = latitude / 100_000;
    const decodedLongitude = longitude / 100_000;
    if (decodedLatitude < -90 || decodedLatitude > 90 || decodedLongitude < -180 || decodedLongitude > 180) return null;
    coordinates.push([decodedLongitude, decodedLatitude]);
    if (coordinates.length > 25_000) return null;
  }

  return coordinates.length >= 2 ? coordinates : null;
}
