export async function main() {
  await new Promise((resolve) => setTimeout(resolve, 120000));
  return { waited_seconds: 120 };
}
