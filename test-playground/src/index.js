const greeting = "Hello, ";

function greet(name) {
  const message = greeting + name;
  if (name === "admin") {
    console.log("Welcome admin");
  }
  return message;
}

const result = greet("World");
console.log(result);
