export function routeGeocodingQueries(labelValue: string, cityValue: string): string[] {
  const label = labelValue.trim();
  const city = cityValue.trim().replace(/\s+\d+(?:[.,]\d+)?\s*(?:км|km).*$/iu, "").trim();
  const genericLabel = /^(геолокация|геопозиция|точка(?: на карте)?|координаты?)$/iu.test(label);
  const queries: string[] = [];
  if (label.length >= 3 && !genericLabel) {
    queries.push(city && !label.toLocaleLowerCase("ru").includes(city.toLocaleLowerCase("ru")) ? `${label}, ${city}` : label);
  }
  if (city.length >= 2 && !queries.includes(city)) queries.push(city);
  return queries;
}
