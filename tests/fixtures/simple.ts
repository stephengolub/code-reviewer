function greet(name: string): string {
  return formatMessage(name);
}

function formatMessage(name: string): string {
  return `Hello, ${name}`;
}

async function fetchAndGreet(url: string): Promise<string> {
  const name = await fetchName(url);
  return greet(name);
}

async function fetchName(url: string): Promise<string> {
  return "world";
}
