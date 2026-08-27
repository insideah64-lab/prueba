import app from "./index.tsx";

const port = parseInt(Bun.env.PORT || "8080", 10);

console.log(`Starting Aethelraed MUD server on port ${port}...`);

Bun.serve({
  fetch: app.fetch,
  port: port,
  hostname: "0.0.0.0",
});

console.log(`✅ Server running at http://0.0.0.0:${port}`);

