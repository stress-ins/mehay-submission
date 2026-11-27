const letters: Record<string, string> = { A: "А", B: "В", E: "Е", K: "К", M: "М", H: "Н", O: "О", P: "Р", C: "С", T: "Т", Y: "У", X: "Х" };

export function normalizePlate(value: string) {
  return value.toUpperCase().replace(/[\s-]+/g, "").replace(/[ABEKMHOPCTYX]/g, (letter) => letters[letter]);
}

export function plateMatches(value: string, query: string) {
  const plate = normalizePlate(query);
  return /^[АВЕКМНОРСТУХ0-9]+$/.test(plate) && normalizePlate(value).includes(plate);
}
