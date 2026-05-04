import { createClient } from "redis" 

const redis = createClient({
    url: process.env.REDIS_URL || "redis://127.0.0.1:6379",
}) 

export async function connectRedis() {
    redis.on("error", (err) => console.error("[Redis Error]", err)) 
    await redis.connect() 
    console.log("[Redis] Connected") 
}

export default redis 