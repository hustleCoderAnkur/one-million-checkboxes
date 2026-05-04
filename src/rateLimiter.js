const store = new Map() 

function isRateLimited(key, max, windowMs) {
    const now = Date.now() 

    if (!store.has(key)) {
        store.set(key, []) 
    }

    const timestamps = store.get(key) 
    const filtered = timestamps.filter((t) => now - t < windowMs) 
    filtered.push(now) 
    store.set(key, filtered) 

    return filtered.length > max 
}

export function httpRateLimiter({ max = 50, windowMs = 60000 } = {}) {
    return (req, res, next) => {
        const ip = req.ip || req.socket.remoteAddress || "unknown" 

        if (isRateLimited(ip, max, windowMs)) {
            return res.status(429).json({ error: "Too many requests" }) 
        }

        next() 
    } 
}

export function wsRateLimit(id) {
    return isRateLimited(id, 20, 10000) 
}