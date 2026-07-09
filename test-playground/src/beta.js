function beta(value) {
  const label = "beta";
  if (value === 0) {
    return label;
  }
  return label + value;
}

console.log(beta(0));
