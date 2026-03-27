type QueryValue = string | null | undefined;

export function getValidQueryValue(
  value: QueryValue,
  validValues: string[],
): string | null {
  if (!value) return null;
  return validValues.includes(value) ? value : null;
}

export function getQueryValue(value: QueryValue): string {
  return value ?? '';
}

export function buildQueryString(
  params: Record<string, string | null | undefined>,
) {
  const searchParams = new URLSearchParams();

  Object.entries(params).forEach(([key, value]) => {
    if (value && value.trim() !== '') {
      searchParams.set(key, value);
    }
  });

  return searchParams.toString();
}