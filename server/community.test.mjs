import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createCommunityServer } from "./index.mjs";
const recipe = {
  version: 1,
  name: "Quiet light",
  edits: [{ id: "one", tool: "tune", params: { brightness: 12 } }],
};
async function fixture(run, options = {}) {
  const server = createCommunityServer(options);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const api = async (
    path,
    { token, body, method = "GET", headers = {} } = {},
  ) => {
    const response = await fetch(base + path, {
      method,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...headers,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return {
      status: response.status,
      headers: response.headers,
      data: response.status === 204 ? null : await response.json(),
    };
  };
  const register = async (username = "photographer") =>
    (
      await api("/api/auth/register", {
        method: "POST",
        body: { username, password: "a-long-test-password" },
      })
    ).data;
  try {
    return await run({ api, register });
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}
test("accounts authenticate, expire on logout, and do not expose password hashes", () =>
  fixture(async ({ api, register }) => {
    const auth = await register();
    assert.match(auth.token, /^[a-f0-9]{64}$/);
    assert.deepEqual(Object.keys(auth.user).sort(), ["id", "username"]);
    assert.equal(
      (await api("/api/me", { token: auth.token })).data.user.username,
      "photographer",
    );
    assert.equal(
      (
        await api("/api/auth/login", {
          method: "POST",
          body: { username: "PHOTOGRAPHER", password: "a-long-test-password" },
        })
      ).status,
      200,
    );
    await api("/api/auth/logout", { method: "POST", token: auth.token });
    assert.equal((await api("/api/me", { token: auth.token })).status, 401);
  }));
test("invalid and duplicate credentials fail with bounded account rules", () =>
  fixture(async ({ api, register }) => {
    await register();
    assert.equal((await register()).error, "That username is already taken.");
    for (const username of ["photographer", "missing-user"]) {
      const res = await api("/api/auth/login", {
        method: "POST",
        body: { username, password: "wrong-password-long" },
      });
      assert.equal(res.status, 401);
      assert.equal(res.data.error, "Username or password is incorrect.");
    }
    assert.equal(
      (
        await api("/api/auth/register", {
          method: "POST",
          body: { username: "bad", password: "short" },
        })
      ).status,
      400,
    );
  }));
test("looks, likes, comments and owner deletion work together", () =>
  fixture(async ({ api, register }) => {
    const author = await register("author"),
      reader = await register("reader");
    const published = await api("/api/looks", {
      method: "POST",
      token: author.token,
      body: {
        recipe,
        name: "Quiet light",
        tags: ["soft"],
        description: "A gentle look.",
      },
    });
    assert.equal(published.status, 201);
    const id = published.data.id;
    let feed = await api("/api/looks");
    assert.equal(feed.data.looks.length, 1);
    assert.equal(feed.data.looks[0].username, "author");
    assert.equal(
      (
        await api(`/api/looks/${id}/like`, {
          method: "POST",
          token: reader.token,
        })
      ).data.likes,
      1,
    );
    assert.equal(
      (
        await api(`/api/looks/${id}/like`, {
          method: "POST",
          token: reader.token,
        })
      ).data.likes,
      0,
    );
    assert.equal(
      (
        await api(`/api/looks/${id}/comments`, {
          method: "POST",
          token: reader.token,
          body: { text: "Love this light." },
        })
      ).status,
      201,
    );
    assert.equal(
      (await api(`/api/looks/${id}/comments`)).data.comments[0].text,
      "Love this light.",
    );
    assert.equal(
      (await api(`/api/looks/${id}`, { method: "DELETE", token: reader.token }))
        .status,
      403,
    );
    assert.equal(
      (await api(`/api/looks/${id}`, { method: "DELETE", token: author.token }))
        .status,
      200,
    );
    assert.equal((await api(`/api/looks/${id}/comments`)).status, 404);
  }));
test("writes require authentication and external image overlays are rejected", () =>
  fixture(async ({ api, register }) => {
    assert.equal(
      (await api("/api/looks", { method: "POST", body: { recipe } })).status,
      401,
    );
    const { token } = await register();
    for (const bad of [
      { ...recipe, version: 9 },
      { ...recipe, edits: [{ tool: "unknown", params: {} }] },
      {
        ...recipe,
        edits: [
          {
            tool: "double",
            params: {},
            image: "https://tracking.invalid/photo.jpg",
          },
        ],
      },
    ])
      assert.equal(
        (
          await api("/api/looks", {
            method: "POST",
            token,
            body: { recipe: bad },
          })
        ).status,
        400,
      );
  }));
test("offline retries do not publish duplicate looks", () =>
  fixture(async ({ api, register }) => {
    const { token } = await register();
    const payload = { recipe, clientId: "reviewed-outbox-id" };
    const first = await api("/api/looks", {
        method: "POST",
        token,
        body: payload,
      }),
      second = await api("/api/looks", {
        method: "POST",
        token,
        body: payload,
      });
    assert.equal(first.status, 201);
    assert.equal(second.status, 200);
    assert.equal(first.data.id, second.data.id);
    assert.equal((await api("/api/looks")).data.looks.length, 1);
  }));
test("CORS allows the configured editor and rejects other origins", () =>
  fixture(async ({ api }) => {
    const allowed = await api("/api/health", {
      headers: { Origin: "http://localhost:5173" },
    });
    assert.equal(allowed.status, 200);
    assert.equal(
      allowed.headers.get("access-control-allow-origin"),
      "http://localhost:5173",
    );
    assert.equal(
      (
        await api("/api/health", {
          headers: { Origin: "https://not-allowed.example" },
        })
      ).status,
      403,
    );
    assert.equal(
      (
        await api("/api/looks", {
          method: "OPTIONS",
          headers: { Origin: "http://localhost:5173" },
        })
      ).status,
      204,
    );
  }));
test("shared looks can be searched without interpolating SQL", () =>
  fixture(async ({ api, register }) => {
    const { token } = await register();
    await api("/api/looks", {
      method: "POST",
      token,
      body: { recipe, name: "Forest", tags: ["green"] },
    });
    assert.equal((await api("/api/looks?q=green")).data.looks.length, 1);
    assert.equal((await api("/api/looks?q=absent")).data.looks.length, 0);
    assert.equal(
      (await api("/api/looks?q=%27%3BDELETE%20FROM%20looks%3B--")).status,
      200,
    );
    assert.equal((await api("/api/looks")).data.looks.length, 1);
  }));
test("accounts, sessions and published looks survive a server restart", async () => {
  const directory = await mkdtemp(join(tmpdir(), "still-community-"));
  const database = join(directory, "community.sqlite");
  let token;
  try {
    await fixture(
      async ({ api, register }) => {
        token = (await register()).token;
        await api("/api/looks", { method: "POST", token, body: { recipe } });
      },
      { database },
    );
    await fixture(
      async ({ api }) => {
        assert.equal((await api("/api/me", { token })).status, 200);
        assert.equal((await api("/api/looks")).data.looks[0].name, recipe.name);
      },
      { database },
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
test("request rates are bounded", () =>
  fixture(
    async ({ api }) => {
      assert.equal((await api("/api/health")).status, 200);
      assert.equal((await api("/api/health")).status, 200);
      assert.equal((await api("/api/health")).status, 429);
    },
    { rateLimit: 2 },
  ));

test("oversized JSON returns a usable 413 response", () =>
  fixture(async ({ api, register }) => {
    const { token } = await register();
    const result = await api("/api/looks", {
      method: "POST",
      token,
      body: { recipe, description: "x".repeat(1024 * 1024 + 32) },
    });
    assert.equal(result.status, 413);
    assert.match(result.data.error, /smaller than 1 MB/);
    assert.equal((await api("/api/health")).status, 200);
  }));

test("malformed render data is rejected before it can poison the public feed", () =>
  fixture(async ({ api, register }) => {
    const { token } = await register();
    for (const invalid of [
      { tool: "curves", params: { curveRGB: "bad-json" } },
      { tool: "lut", params: { cube: "LUT_3D_SIZE 4\n0 0 0" } },
      { tool: "lut", params: { lutPng: "https://tracker.invalid/image.png" } },
      {
        tool: "collage",
        params: {},
        images: ["https://tracker.invalid/photo.png"],
      },
      {
        tool: "collage",
        params: {},
        images: Array(9).fill("data:image/png;base64,AAAA"),
      },
    ]) {
      const result = await api("/api/looks", {
        method: "POST",
        token,
        body: { recipe: { version: 1, name: "bad", edits: [invalid] } },
      });
      assert.equal(result.status, 400);
    }
    assert.equal((await api("/api/looks")).data.looks.length, 0);
    assert.equal(
      (await api("/api/auth/login", { method: "POST", body: null })).status,
      400,
    );
  }));
