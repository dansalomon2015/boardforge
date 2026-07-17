import { createBoardForgeServer } from "./app";

const { app, port } = await createBoardForgeServer();
await app.listen({ port, host: "0.0.0.0" });
