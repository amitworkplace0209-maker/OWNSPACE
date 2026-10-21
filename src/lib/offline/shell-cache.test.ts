import { describe, expect, it } from "vitest";
import {
  isCacheablePath,
  isPrefetchRequest,
  normalisePath,
  selectWarmRoutes,
  shellCacheKey,
  shellCacheName,
  warmHeadersFor,
  warmUrlsFor,
  WARM_RSC_TOKEN,
} from "@/lib/offline/shell-cache";

describe("isCacheablePath", () => {
  it.each([
    "/login",
    "/signup",
    "/auth/callback",
    "/auth/gdrive",
    "/forgot-password",
    "/offline",
    "/api/push/public-key",
    "/login/extra",
  ])("refuses %s", (path) => {
    expect(isCacheablePath(path)).toBe(false);
  });

  it.each(["/dashboard", "/tasks", "/settings", "/finance"])(
    "allows %s",
    (path) => {
      expect(isCacheablePath(path)).toBe(true);
    }
  );

  it("refuses per-record pages, whose ids are not in the route list", () => {
    expect(isCacheablePath("/notes/abc")).toBe(false);
    expect(isCacheablePath("/projects/abc")).toBe(false);
    expect(isCacheablePath("/tasks/abc")).toBe(false);
  });

  it("allows the listing page that a record page lives under", () => {
    expect(isCacheablePath("/notes")).toBe(true);
    expect(isCacheablePath("/projects")).toBe(true);
  });
});

describe("normalisePath", () => {
  it("drops a trailing slash", () => {
    expect(normalisePath("/tasks/")).toBe("/tasks");
  });

  it("collapses repeated slashes", () => {
    expect(normalisePath("//tasks//now")).toBe("/tasks/now");
  });

  it("leaves the root alone", () => {
    expect(normalisePath("/")).toBe("/");
  });

  it("leaves an already-normal path untouched", () => {
    expect(normalisePath("/finance/report")).toBe("/finance/report");
  });
});

describe("shellCacheName", () => {
  it("namespaces the account into the cache name", () => {
    expect(shellCacheName("ownspece-v5", "user-1")).toBe("ownspece-v5-shell-user-1");
  });

  it("gives two accounts two different buckets", () => {
    expect(shellCacheName("v5", "a")).not.toBe(shellCacheName("v5", "b"));
  });

  it("changes wholesale when the version changes", () => {
    expect(shellCacheName("v5", "a")).not.toBe(shellCacheName("v6", "a"));
  });
});

describe("shellCacheKey", () => {
  it("gives a document and a payload different keys for the same route", () => {
    expect(shellCacheKey("/tasks", "", "document")).not.toBe(
      shellCacheKey("/tasks", "", "rsc")
    );
  });

  it("strips Next's per-build RSC cache-buster", () => {
    // Left in, every deploy would store a second full copy of every page and
    // orphan the first.
    expect(shellCacheKey("/tasks", "?_rsc=9f2ab", "rsc")).toBe("/tasks?_ownspece=rsc");
  });

  it("strips cache-busting timestamps", () => {
    expect(shellCacheKey("/tasks", "?t=1712&ts=99", "document")).toBe("/tasks");
  });

  it("strips the deployment id, which changes on every rollout", () => {
    expect(shellCacheKey("/dashboard", "?dpl=abc", "document")).toBe("/dashboard");
  });

  it("keeps a query that changes what is rendered", () => {
    expect(shellCacheKey("/tasks", "?new=1", "document")).toBe("/tasks?new=1");
  });

  it("normalises the path", () => {
    expect(shellCacheKey("/tasks/", "", "document")).toBe("/tasks");
    expect(shellCacheKey("//tasks", "", "document")).toBe("/tasks");
  });

  it("produces the same key whatever the query order", () => {
    expect(shellCacheKey("/search", "?a=1&b=2", "document")).toBe(
      shellCacheKey("/search", "?b=2&a=1", "document")
    );
  });
});

describe("isPrefetchRequest", () => {
  it("detects a route prefetch", () => {
    expect(isPrefetchRequest(new Headers({ "Next-Router-Prefetch": "1" }))).toBe(true);
  });

  it("detects a segment prefetch", () => {
    expect(isPrefetchRequest(new Headers({ "Next-Router-Segment-Prefetch": "1" }))).toBe(true);
  });

  it("treats a real navigation as not a prefetch", () => {
    expect(isPrefetchRequest(new Headers({ RSC: "1" }))).toBe(false);
  });

  it("treats a document request as not a prefetch", () => {
    expect(isPrefetchRequest(new Headers())).toBe(false);
  });
});

describe("warmHeadersFor", () => {
  it("asks for a payload when warming an RSC URL", () => {
    // Without the header Next returns HTML, which would be stored under a
    // payload's key and render blank on the first offline navigation.
    expect(warmHeadersFor(`/tasks?_rsc=${WARM_RSC_TOKEN}`)).toEqual({ RSC: "1" });
  });

  it("sends nothing for a document URL", () => {
    expect(warmHeadersFor("/tasks")).toEqual({});
  });
});

describe("selectWarmRoutes", () => {
  const base = {
    routes: ["/dashboard", "/tasks"],
    stored: new Set<string>(),
    lastWarmedAt: null,
    now: 1_000_000,
    enabled: true,
    online: true,
  };

  it("warms everything when nothing is cached and nothing was warmed", () => {
    expect(selectWarmRoutes(base)).toEqual(["/dashboard", "/tasks"]);
  });

  it("does nothing when turned off", () => {
    expect(selectWarmRoutes({ ...base, enabled: false })).toEqual([]);
  });

  it("does nothing while offline — there is no network to warm from", () => {
    expect(selectWarmRoutes({ ...base, online: false })).toEqual([]);
  });

  it("does nothing under data saver", () => {
    expect(selectWarmRoutes({ ...base, saveData: true })).toEqual([]);
  });

  it("skips routes already in the cache", () => {
    expect(
      selectWarmRoutes({ ...base, stored: new Set(["/dashboard"]) })
    ).toEqual(["/tasks"]);
  });

  it("skips entirely when the copy is still fresh", () => {
    expect(
      selectWarmRoutes({ ...base, lastWarmedAt: base.now - 60_000 })
    ).toEqual([]);
  });

  it("warms again once the copy is older than the TTL", () => {
    expect(
      selectWarmRoutes({ ...base, lastWarmedAt: base.now - 7 * 60 * 60 * 1000 })
    ).toEqual(["/dashboard", "/tasks"]);
  });

  it("honours a custom TTL", () => {
    const options = { ...base, lastWarmedAt: base.now - 5_000, ttlMs: 1_000 };
    expect(selectWarmRoutes(options)).toEqual(["/dashboard", "/tasks"]);
  });

  it("deduplicates a route list that names the same page twice", () => {
    expect(
      selectWarmRoutes({ ...base, routes: ["/tasks", "/tasks/", "//tasks"] })
    ).toEqual(["/tasks"]);
  });

  it("copes with an empty route list", () => {
    expect(selectWarmRoutes({ ...base, routes: [] })).toEqual([]);
  });
});

describe("warmUrlsFor", () => {
  it("asks for a document and an RSC payload per route", () => {
    expect(warmUrlsFor(["/tasks"])).toEqual([
      "/tasks",
      `/tasks?_rsc=${WARM_RSC_TOKEN}`,
    ]);
  });

  it("normalises before building the URL", () => {
    expect(warmUrlsFor(["/tasks/"])).toEqual([
      "/tasks",
      `/tasks?_rsc=${WARM_RSC_TOKEN}`,
    ]);
  });

  it("covers several routes in order", () => {
    expect(warmUrlsFor(["/dashboard", "/tasks"])).toHaveLength(4);
  });
});