// A list from an API response: a plain array, a paginated { data: [...] }, or
// anything else (error body, null) as an empty list, so .map() never crashes.
export const toList = (d) => (Array.isArray(d) ? d : Array.isArray(d?.data) ? d.data : []);
