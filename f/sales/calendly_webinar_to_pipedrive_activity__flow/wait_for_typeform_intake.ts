export async function main() {
  await new Promise((resolve) => setTimeout(resolve, 5000));
  return { waited_seconds: 5 };
}
