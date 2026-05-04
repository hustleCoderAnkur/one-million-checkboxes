import redis from "./redis.js" 

const KEY = "checkboxes" 
const TOTAL = 2000 

export async function toggleBit(index) {
    const current = await redis.getBit(KEY, index) 
    const newVal = current === 1 ? 0 : 1 
    await redis.setBit(KEY, index, newVal) 
    return newVal 
}

export async function getCheckedCount() {
    return await redis.bitCount(KEY) 
}

export async function getAllBits() {
    const data = await redis.get(KEY);

    if (!data) {
        return Buffer.alloc(Math.ceil(TOTAL / 8));
    }

    return Buffer.from(data, "binary");
}
export { TOTAL } 