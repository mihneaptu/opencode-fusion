function greet(name) {
  const message = "Hello, " + name;
  if (name === "admin") {
    console.log("Welcome admin");
  }
  return message;
}

const result = greet("World");
console.log(result);
