import http from "node:http";
import { DatabaseSync } from "node:sqlite";
import {
  randomBytes,
  scrypt as scryptCallback,
  timingSafeEqual,
  createHash,
} from "node:crypto";
import { promisify } from "node:util";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { parseCube } from "../src/lib/color.ts";
const scrypt = promisify(scryptCallback),
  hash = (value) => createHash("sha256").update(value).digest("hex");
const toolIds = new Set([
  "look",
  "tune",
  "details",
  "curves",
  "white-balance",
  "crop",
  "rotate",
  "perspective",
  "expand",
  "selective",
  "brush",
  "healing",
  "hdr",
  "glamour",
  "tonal",
  "drama",
  "vintage",
  "grain",
  "retrolux",
  "grunge",
  "bw",
  "noir",
  "portrait",
  "head-pose",
  "lens-blur",
  "vignette",
  "double",
  "text",
  "frames",
  "raw",
  "hsl",
  "color-grade",
  "dehaze",
  "motion",
  "bloom",
  "halation",
  "lut",
]);
class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}
function validateRecipe(recipe) {
  if (
    !recipe ||
    recipe.version !== 1 ||
    typeof recipe.name !== "string" ||
    recipe.name.length < 1 ||
    recipe.name.length > 100 ||
    !Array.isArray(recipe.edits) ||
    recipe.edits.length > 200
  )
    throw new HttpError(400, "A valid Still look is required.");
  for (const edit of recipe.edits) {
    if (
      !edit ||
      !toolIds.has(edit.tool) ||
      !edit.params ||
      typeof edit.params !== "object" ||
      Array.isArray(edit.params)
    )
      throw new HttpError(400, "Invalid adjustment in look.");
    for (const [key, value] of Object.entries(edit.params)) {
      if (
        ["__proto__", "constructor", "prototype"].includes(key) ||
        !(
          (typeof value === "number" &&
            Number.isFinite(value) &&
            Math.abs(value) <= 10000) ||
          (typeof value === "string" && value.length <= 200000)
        )
      )
        throw new HttpError(400, "Invalid look parameter.");
    }
    for (const key of ["image", "mask", "depth"])
      if (
        edit[key] &&
        !(
          typeof edit[key] === "string" &&
          /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(edit[key])
        )
      )
        throw new HttpError(400, "External image URLs are not accepted.");
    if (
      edit.params.lutPng &&
      !/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(edit.params.lutPng)
    )
      throw new HttpError(400, "LUT images must be embedded PNG files.");
    if (edit.tool === "lut" && edit.params.cube) {
      try {
        parseCube(edit.params.cube);
      } catch {
        throw new HttpError(400, "Invalid 3D LUT.");
      }
    }
    if (edit.tool === "curves")
      for (const key of [
        "curveRGB",
        "curveRed",
        "curveGreen",
        "curveBlue",
        "curveLuma",
      ])
        if (edit.params[key]) {
          try {
            const points = JSON.parse(edit.params[key]);
            if (
              !Array.isArray(points) ||
              points.length < 2 ||
              points.length > 64 ||
              points.some(
                (point, i) =>
                  !Array.isArray(point) ||
                  point.length !== 2 ||
                  point.some(
                    (v) =>
                      typeof v !== "number" ||
                      !Number.isFinite(v) ||
                      v < 0 ||
                      v > 1,
                  ) ||
                  (i > 0 && point[0] <= points[i - 1][0]),
              )
            )
              throw new Error();
          } catch {
            throw new HttpError(400, "Invalid tone curve.");
          }
        }
    if (
      edit.points &&
      (!Array.isArray(edit.points) ||
        edit.points.length > 20000 ||
        edit.points.some(
          (p) =>
            !p ||
            !["x", "y", "radius", "amount"].every(
              (k) => typeof p[k] === "number" && Number.isFinite(p[k]),
            ) ||
            p.x < 0 ||
            p.x > 1 ||
            p.y < 0 ||
            p.y > 1 ||
            p.radius <= 0 ||
            p.radius > 1,
        ))
    )
      throw new HttpError(400, "Invalid brush points.");
    if (
      edit.faces &&
      (!Array.isArray(edit.faces) ||
        edit.faces.length > 5 ||
        edit.faces.some(
          (face) =>
            !Array.isArray(face) ||
            face.length < 468 ||
            face.length > 478 ||
            face.some(
              (p) =>
                !p ||
                ![p.x, p.y, p.z].every(
                  (v) =>
                    typeof v === "number" &&
                    Number.isFinite(v) &&
                    Math.abs(v) <= 5,
                ),
            ),
        ))
    )
      throw new HttpError(400, "Invalid face landmarks.");
    if (
      edit.mesh &&
      (!Array.isArray(edit.mesh) ||
        edit.mesh.length > 2000 ||
        !edit.faces?.length ||
        edit.mesh.some(
          (t) =>
            !Array.isArray(t) ||
            t.length !== 3 ||
            t.some(
              (i) =>
                !Number.isInteger(i) ||
                i < 0 ||
                edit.faces.some((f) => i >= f.length),
            ),
        ))
    )
      throw new HttpError(400, "Invalid face mesh.");
  }
  return {
    version: 1,
    name: recipe.name,
    edits: recipe.edits,
    ...(typeof recipe.nativeSnapseed === "string" &&
    recipe.nativeSnapseed.length < 200000 &&
    /^https:\/\/(www\.)?snapseed\.com\/qr\?l=/.test(recipe.nativeSnapseed)
      ? { nativeSnapseed: recipe.nativeSnapseed }
      : {}),
    ...(Array.isArray(recipe.warnings)
      ? {
          warnings: recipe.warnings
            .filter((v) => typeof v === "string")
            .slice(0, 10)
            .map((v) => v.slice(0, 500)),
        }
      : {}),
  };
}
async function body(req) {
  let size = 0,
    chunks = [];
  for await (const chunk of req.iterator({ destroyOnReturn: false })) {
    size += chunk.length;
    if (size > 1024 * 1024) {
      req.resume();
      throw new HttpError(
        413,
        "A shared look must be smaller than 1 MB. Use a file to share larger recipes.",
      );
    }
    chunks.push(chunk);
  }
  try {
    const value = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    if (!value || typeof value !== "object" || Array.isArray(value))
      throw new Error();
    return value;
  } catch {
    throw new HttpError(400, "Invalid JSON body.");
  }
}

export function createCommunityServer({
  database = ":memory:",
  origins = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:4173",
    "http://127.0.0.1:4173",
  ],
  rateLimit = 180,
} = {}) {
  if (database !== ":memory:")
    mkdirSync(dirname(resolve(database)), { recursive: true });
  const db = new DatabaseSync(database);
  db.exec(`PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL;
    CREATE TABLE IF NOT EXISTS users(id INTEGER PRIMARY KEY,username TEXT NOT NULL UNIQUE COLLATE NOCASE,salt TEXT NOT NULL,password_hash TEXT NOT NULL,created_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS sessions(token_hash TEXT PRIMARY KEY,user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,expires INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS looks(id INTEGER PRIMARY KEY,user_id INTEGER NOT NULL REFERENCES users(id),name TEXT NOT NULL,description TEXT NOT NULL,tags TEXT NOT NULL,recipe TEXT NOT NULL,thumbnail TEXT NOT NULL,created_at INTEGER NOT NULL,client_id TEXT NOT NULL DEFAULT '');
    CREATE TABLE IF NOT EXISTS likes(user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,look_id INTEGER NOT NULL REFERENCES looks(id) ON DELETE CASCADE,PRIMARY KEY(user_id,look_id));
    CREATE TABLE IF NOT EXISTS comments(id INTEGER PRIMARY KEY,user_id INTEGER NOT NULL REFERENCES users(id),look_id INTEGER NOT NULL REFERENCES looks(id) ON DELETE CASCADE,text TEXT NOT NULL,created_at INTEGER NOT NULL);`);
  if (
    !db
      .prepare("PRAGMA table_info(looks)")
      .all()
      .some((column) => column.name === "client_id")
  )
    db.exec("ALTER TABLE looks ADD COLUMN client_id TEXT NOT NULL DEFAULT ''");
  db.exec(
    "CREATE UNIQUE INDEX IF NOT EXISTS looks_client_id ON looks(user_id,client_id) WHERE client_id<>''",
  );
  const limits = new Map();
  const session = (req) => {
    const match = /^Bearer ([a-f0-9]{64})$/i.exec(
      req.headers.authorization || "",
    );
    if (!match) return undefined;
    return db
      .prepare(
        "SELECT users.id,users.username FROM sessions JOIN users ON sessions.user_id=users.id WHERE token_hash=? AND expires>?",
      )
      .get(hash(match[1]), Date.now());
  };
  const requireUser = (req) => {
    const user = session(req);
    if (!user) throw new HttpError(401, "Sign in to continue.");
    return user;
  };
  const issue = (user) => {
    const token = randomBytes(32).toString("hex");
    db.prepare("DELETE FROM sessions WHERE expires<?").run(Date.now());
    db.prepare("INSERT INTO sessions VALUES(?,?,?)").run(
      hash(token),
      user.id,
      Date.now() + 7 * 86400000,
    );
    return { token, user: { id: user.id, username: user.username } };
  };
  const server = http.createServer(async (req, res) => {
    const send = (status, value) => {
      res.writeHead(status, {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      });
      res.end(JSON.stringify(value));
    };
    try {
      const origin = req.headers.origin;
      if (origin) {
        if (!origins.includes(origin))
          throw new HttpError(
            403,
            "This editor origin is not allowed. Configure ALLOWED_ORIGINS on the community server.",
          );
        res.setHeader("Access-Control-Allow-Origin", origin);
        res.setHeader("Vary", "Origin");
      }
      if (req.method === "OPTIONS") {
        res.writeHead(204, {
          "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type, Authorization",
          "Access-Control-Max-Age": "600",
        });
        res.end();
        return;
      }
      const ip = req.socket.remoteAddress || "unknown",
        now = Date.now();
      let bucket = limits.get(ip);
      if (!bucket || now - bucket.at > 60000) {
        bucket = { at: now, count: 0, auth: 0 };
        limits.set(ip, bucket);
      }
      if (++bucket.count > rateLimit)
        throw new HttpError(
          429,
          "Too many requests. Please try again in a minute.",
        );
      if (limits.size > 10000)
        for (const [key, value] of limits)
          if (now - value.at > 60000) limits.delete(key);
      const url = new URL(req.url, "http://community.local"),
        route = url.pathname,
        method = req.method;
      if (method === "GET" && route === "/api/health")
        return send(200, { status: "ready", version: 1 });
      if (
        method === "POST" &&
        ["/api/auth/register", "/api/auth/login"].includes(route)
      ) {
        if (++bucket.auth > 15)
          throw new HttpError(
            429,
            "Too many sign-in attempts. Try again in a minute.",
          );
        const input = await body(req),
          username = String(input.username || "").trim(),
          password = input.password;
        if (
          !/^[a-z0-9_-]{3,32}$/i.test(username) ||
          typeof password !== "string" ||
          password.length < 10 ||
          password.length > 128
        )
          throw new HttpError(
            400,
            "Use a 3–32 character username and a password of 10–128 characters.",
          );
        let user = db
          .prepare("SELECT * FROM users WHERE username=?")
          .get(username);
        if (route.endsWith("/register")) {
          if (user) throw new HttpError(409, "That username is already taken.");
          const salt = randomBytes(16).toString("hex"),
            key = await scrypt(password, salt, 64);
          try {
            const result = db
              .prepare(
                "INSERT INTO users(username,salt,password_hash,created_at) VALUES(?,?,?,?)",
              )
              .run(username, salt, key.toString("hex"), now);
            user = { id: Number(result.lastInsertRowid), username };
          } catch (error) {
            if (String(error).includes("UNIQUE"))
              throw new HttpError(409, "That username is already taken.");
            throw error;
          }
        } else {
          const key = await scrypt(
              password,
              user?.salt || "0000000000000000",
              64,
            ),
            expected = Buffer.from(
              user?.password_hash || "00".repeat(64),
              "hex",
            );
          if (!user || !timingSafeEqual(key, expected))
            throw new HttpError(401, "Username or password is incorrect.");
        }
        return send(200, issue(user));
      }
      if (method === "GET" && route === "/api/me")
        return send(200, { user: requireUser(req) });
      if (method === "POST" && route === "/api/auth/logout") {
        const token = (req.headers.authorization || "").replace(/^Bearer /, "");
        db.prepare("DELETE FROM sessions WHERE token_hash=?").run(hash(token));
        return send(200, { ok: true });
      }
      if (method === "GET" && route === "/api/looks") {
        const q = (url.searchParams.get("q") || "").slice(0, 100),
          cursor = Math.max(
            1,
            Number(url.searchParams.get("before")) || Number.MAX_SAFE_INTEGER,
          ),
          user = session(req);
        const rows = db
          .prepare(
            `SELECT l.*,u.username,(SELECT count(*) FROM likes WHERE look_id=l.id) AS likes,(SELECT count(*) FROM comments WHERE look_id=l.id) AS comments FROM looks l JOIN users u ON l.user_id=u.id WHERE l.id<? AND (l.name LIKE ? OR l.tags LIKE ? OR l.description LIKE ?) ORDER BY l.id DESC LIMIT 30`,
          )
          .all(cursor, `%${q}%`, `%${q}%`, `%${q}%`);
        return send(200, {
          looks: rows.map((row) => ({
            ...row,
            recipe: JSON.parse(row.recipe),
            tags: JSON.parse(row.tags),
            liked: !!(
              user &&
              db
                .prepare("SELECT 1 FROM likes WHERE user_id=? AND look_id=?")
                .get(user.id, row.id)
            ),
          })),
          next: rows.length === 30 ? rows.at(-1).id : null,
        });
      }
      if (method === "POST" && route === "/api/looks") {
        const user = requireUser(req),
          input = await body(req),
          recipe = validateRecipe(input.recipe),
          name = String(input.name || recipe.name)
            .trim()
            .slice(0, 100),
          description = String(input.description || "").slice(0, 2000),
          tags = Array.isArray(input.tags)
            ? input.tags
                .filter((t) => typeof t === "string" && t.length <= 30)
                .slice(0, 8)
            : [],
          thumbnail = input.thumbnail || "";
        if (
          !name ||
          typeof thumbnail !== "string" ||
          thumbnail.length > 180000 ||
          (thumbnail &&
            !/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(
              thumbnail,
            ))
        )
          throw new HttpError(
            400,
            "Use a short name and a small embedded preview.",
          );
        const clientId =
          typeof input.clientId === "string" &&
          /^[a-zA-Z0-9-]{1,64}$/.test(input.clientId)
            ? input.clientId
            : "";
        if (clientId) {
          const existing = db
            .prepare("SELECT id FROM looks WHERE user_id=? AND client_id=?")
            .get(user.id, clientId);
          if (existing) return send(200, { id: existing.id });
        }
        const result = db
          .prepare(
            "INSERT INTO looks(user_id,name,description,tags,recipe,thumbnail,created_at,client_id) VALUES(?,?,?,?,?,?,?,?)",
          )
          .run(
            user.id,
            name,
            description,
            JSON.stringify(tags),
            JSON.stringify(recipe),
            thumbnail,
            now,
            clientId,
          );
        return send(201, { id: Number(result.lastInsertRowid) });
      }
      const match = /^\/api\/looks\/(\d+)(?:\/(like|comments))?$/.exec(route);
      if (match) {
        const id = Number(match[1]),
          action = match[2],
          look = db.prepare("SELECT * FROM looks WHERE id=?").get(id);
        if (!look) throw new HttpError(404, "This look was not found.");
        if (method === "DELETE" && !action) {
          const user = requireUser(req);
          if (look.user_id !== user.id)
            throw new HttpError(403, "Only the author can remove this look.");
          db.prepare("DELETE FROM looks WHERE id=?").run(id);
          return send(200, { ok: true });
        }
        if (method === "POST" && action === "like") {
          const user = requireUser(req),
            liked = db
              .prepare("SELECT 1 FROM likes WHERE user_id=? AND look_id=?")
              .get(user.id, id);
          if (liked)
            db.prepare("DELETE FROM likes WHERE user_id=? AND look_id=?").run(
              user.id,
              id,
            );
          else db.prepare("INSERT INTO likes VALUES(?,?)").run(user.id, id);
          return send(200, {
            liked: !liked,
            likes: db
              .prepare("SELECT count(*) AS n FROM likes WHERE look_id=?")
              .get(id).n,
          });
        }
        if (method === "GET" && action === "comments")
          return send(200, {
            comments: db
              .prepare(
                "SELECT c.id,c.text,c.created_at,u.username FROM comments c JOIN users u ON c.user_id=u.id WHERE c.look_id=? ORDER BY c.id DESC LIMIT 100",
              )
              .all(id),
          });
        if (method === "POST" && action === "comments") {
          const user = requireUser(req),
            input = await body(req),
            text = String(input.text || "").trim();
          if (!text || text.length > 2000)
            throw new HttpError(400, "Write a comment of 1–2000 characters.");
          const result = db
            .prepare(
              "INSERT INTO comments(user_id,look_id,text,created_at) VALUES(?,?,?,?)",
            )
            .run(user.id, id, text, now);
          return send(201, { id: Number(result.lastInsertRowid) });
        }
      }
      throw new HttpError(404, "This API route was not found.");
    } catch (error) {
      send(error instanceof HttpError ? error.status : 500, {
        error:
          error instanceof HttpError
            ? error.message
            : "The community service could not complete this request.",
      });
    }
  });
  server.on("close", () => db.close());
  return server;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  const server = createCommunityServer({
    database: process.env.STILL_COMMUNITY_DB || ".data/community.sqlite",
    origins: (
      process.env.ALLOWED_ORIGINS ||
      "http://localhost:5173,http://127.0.0.1:5173,http://localhost:4173,http://127.0.0.1:4173"
    )
      .split(",")
      .map((s) => s.trim()),
  });
  server.listen(
    Number(process.env.PORT || 8787),
    process.env.HOST || "127.0.0.1",
    () =>
      console.log(
        `Still community is listening on port ${server.address().port}.`,
      ),
  );
  for (const signal of ["SIGTERM", "SIGINT"])
    process.on(signal, () => server.close(() => process.exit(0)));
}
