let alphaCount = 0;

function alpha(items) {
  for (let i = 0; i < items.length; i++) {
    alphaCount = alphaCount + items[i];
  }
  return alphaCount;
}

console.log(alpha([1, 2, 3]));
