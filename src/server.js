import "dotenv/config" 
import express from "express" 
import http from "http" 
import path from "path" 
import { fileURLToPath } from "url" 

import { connectRedis } from "./redis.js" 
import { connectDB } from "./db.js" 
import { setupWebSocket, getClientCount } from "./websocket.js" 
import { getCheckedCount } from "./checkbox.js" 

import {
    loginHandler,
    signupHandler,
    logoutHandler,
    authMiddleware,
    oidcLoginHandler,
    oidcCallbackHandler,
    initOIDC,
} from "./auth.js" 

import { httpRateLimiter } from "./rateLimiter.js" 

const app = express() 
app.set("trust proxy", 1) 
const PORT = process.env.PORT || 3000 

const __filename = fileURLToPath(import.meta.url) 
const __dirname = path.dirname(__filename) 

const publicDir = path.join(__dirname, "../public") 

app.use(express.json()) 
app.use(express.static(publicDir)) 

app.get("/", (req, res) => {
    res.sendFile(path.join(publicDir, "index.html")) 
}) 


const authLimiter = httpRateLimiter({ max: 10, windowMs: 60000 }) 

app.post("/api/signup", authLimiter, signupHandler) 
app.post("/api/login", authLimiter, loginHandler) 
app.post("/api/logout", logoutHandler) 

app.get("/api/me", authMiddleware, (req, res) => {
    res.json({ user: req.user }) 
}) 


app.get("/auth/google", oidcLoginHandler) 
app.get("/auth/google/callback", oidcCallbackHandler) 


app.get("/api/stats", async (req, res) => {
    const count = await getCheckedCount() 
    res.json({
        checked: count,
        clients: getClientCount(),
    }) 
}) 


async function start() {
    await connectDB() 
    await connectRedis() 
    await initOIDC() 

    const server = http.createServer(app) 
    setupWebSocket(server) 

    server.listen(PORT, () => {
        console.log(`[Server] Running on http: localhost:${PORT}`) 
    }) 
}

start() 