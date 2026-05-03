import { v4 as uuidv4 } from "uuid";
import bcrypt from "bcrypt";
import pool from "./db.js";

const sessions = new Map();



function createSession(userId, username) {
    const sessionId = uuidv4();
    sessions.set(sessionId, { userId, username });
    return sessionId;
}

function getSessionUser(req) {
    const cookie = req.headers.cookie || "";
    const match = cookie.match(/sessionId=([^;]+)/);
    const sessionId = match ? match[1] : null;
    return sessionId && sessions.has(sessionId) ? sessions.get(sessionId) : null;
}

function destroySession(req) {
    const cookie = req.headers.cookie || "";
    const match = cookie.match(/sessionId=([^;]+)/);
    const sessionId = match ? match[1] : null;
    if (sessionId) sessions.delete(sessionId);
}

function setSessionCookie(res, sessionId) {
    const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
    res.setHeader("Set-Cookie", `sessionId=${sessionId}; Path=/; HttpOnly; SameSite=Lax${secure}`);
}


export async function signupHandler(req, res) {
    const { username, email, password } = req.body;

    if (!username || !email || !password) {
        return res.status(400).json({ error: "All fields are required" });
    }

    if (password.length < 8) {
        return res.status(400).json({ error: "Password must be at least 8 characters" });
    }

    try {
        const exists = await pool.query(
            "SELECT id FROM users WHERE email = $1 OR username = $2",
            [email, username]
        );

        if (exists.rows.length > 0) {
            return res.status(409).json({ error: "Username or email already taken" });
        }

        const password_hash = await bcrypt.hash(password, 12);

        const result = await pool.query(
            "INSERT INTO users (username, email, password_hash) VALUES ($1, $2, $3) RETURNING id, username",
            [username, email, password_hash]
        );

        const user = result.rows[0];
        const sessionId = createSession(user.id, user.username);
        setSessionCookie(res, sessionId);

        res.status(201).json({ success: true, username: user.username });
    } catch (err) {
        console.error("[Signup Error]", err);
        res.status(500).json({ error: "Internal server error" });
    }
}


export async function loginHandler(req, res) {
    const { email, password } = req.body;

    if (!email || !password) {
        return res.status(400).json({ error: "Email and password are required" });
    }

    try {
        const result = await pool.query(
            "SELECT id, username, password_hash FROM users WHERE email = $1 AND password_hash IS NOT NULL",
            [email]
        );

        const user = result.rows[0];

        if (!user) {
            return res.status(401).json({ error: "Invalid credentials" });
        }

        const valid = await bcrypt.compare(password, user.password_hash);

        if (!valid) {
            return res.status(401).json({ error: "Invalid credentials" });
        }

        const sessionId = createSession(user.id, user.username);
        setSessionCookie(res, sessionId);

        res.json({ success: true, username: user.username });
    } catch (err) {
        console.error("[Login Error]", err);
        res.status(500).json({ error: "Internal server error" });
    }
}


export function logoutHandler(req, res) {
    destroySession(req);
    res.setHeader("Set-Cookie", "sessionId=; Max-Age=0; Path=/");
    res.json({ success: true });
}


export function authMiddleware(req, res, next) {
    req.user = getSessionUser(req);
    next();
}



import { Issuer, generators } from "openid-client";

let oidcClient = null;
const oidcStates = new Map();

export async function initOIDC() {
    if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
        console.warn("[OIDC] GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET not set — OIDC disabled");
        return;
    }

    const googleIssuer = await Issuer.discover("https://accounts.google.com");

    oidcClient = new googleIssuer.Client({
        client_id: process.env.GOOGLE_CLIENT_ID,
        client_secret: process.env.GOOGLE_CLIENT_SECRET,
        redirect_uris: [`${process.env.APP_BASE_URL}/auth/google/callback`],
        response_types: ["code"],
    });

    console.log("[OIDC] Google client ready");
}

export function oidcLoginHandler(req, res) {
    if (!oidcClient) {
        return res.status(503).json({ error: "OIDC not configured" });
    }

    const state = generators.state();
    const codeVerifier = generators.codeVerifier();
    const codeChallenge = generators.codeChallenge(codeVerifier);

    oidcStates.set(state, codeVerifier);

    const redirectUrl = oidcClient.authorizationUrl({
        scope: "openid email profile",
        state,
        code_challenge: codeChallenge,
        code_challenge_method: "S256",
    });

    res.redirect(redirectUrl);
}

export async function oidcCallbackHandler(req, res) {
    if (!oidcClient) {
        return res.status(503).json({ error: "OIDC not configured" });
    }

    const { state } = req.query;
    const codeVerifier = oidcStates.get(state);

    if (!codeVerifier) {
        return res.status(400).json({ error: "Invalid or expired state" });
    }

    oidcStates.delete(state);

    try {
        const params = oidcClient.callbackParams(req);
        const tokenSet = await oidcClient.oauthCallback(
            `${process.env.APP_BASE_URL}/auth/google/callback`,
            params,
            { state, code_verifier: codeVerifier }
        );

        const userInfo = await oidcClient.userinfo(tokenSet.access_token);

        const { sub, email, name } = userInfo;

        const result = await pool.query(
            `INSERT INTO users (email, username, oidc_provider, oidc_sub)
             VALUES ($1, $2, 'google', $3)
             ON CONFLICT (email) DO UPDATE SET oidc_sub = EXCLUDED.oidc_sub
             RETURNING id, username`,
            [email, name?.replace(/\s+/g, "_").toLowerCase().slice(0, 50) || email.split("@")[0], sub]
        );

        const user = result.rows[0];
        const sessionId = createSession(user.id, user.username);
        setSessionCookie(res, sessionId);

        res.redirect("/");
    } catch (err) {
        console.error("[OIDC Callback Error]", err);
        res.redirect("/?error=oidc_failed");
    }
}