import redis from "./redis.js";

const KEY = "checkboxes";
const TOTAL = 1000000;

export async function toggleBit(index) {
    const current = await redis.getBit(KEY, index);
    const newVal = current === 1 ? 0 : 1;
    await redis.setBit(KEY, index, newVal);
    return newVal;
}

export async function getCheckedCount() {
    return await redis.bitCount(KEY);
}

export { TOTAL };