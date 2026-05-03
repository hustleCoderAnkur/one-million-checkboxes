import { WebSocketServer } from "ws";
import { v4 as uuidv4 } from "uuid";
import { toggleBit, getCheckedCount, TOTAL } from "./checkbox.js";
import { wsRateLimit } from "./rateLimiter.js";

const clients = new Map();

export function setupWebSocket(server) {
    const wss = new WebSocketServer({ server });

    wss.on("connection", (ws) => {
        const id = uuidv4();
        clients.set(id, ws);

        ws.send(JSON.stringify({ type: "connected", id, total: TOTAL }));

        ws.on("message", async (msg) => {
            if (wsRateLimit(id)) {
                ws.send(JSON.stringify({ type: "error", message: "Rate limited" }));
                return;
            }

            let data;
            try {
                data = JSON.parse(msg);
            } catch {
                return;
            }

            if (data.type === "toggle") {
                const index = data.index;

                if (typeof index !== "number" || index < 0 || index >= TOTAL) return;

                const value = await toggleBit(index);
                const count = await getCheckedCount();

                const payload = JSON.stringify({ type: "update", index, value, count });

                for (const [, client] of clients) {
                    if (client.readyState === 1) {
                        client.send(payload);
                    }
                }
            }
        });

        ws.on("close", () => {
            clients.delete(id);
        });
    });

    console.log("[WebSocket] Running");
}

export function getClientCount() {
    return clients.size;
}