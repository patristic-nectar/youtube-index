#!/usr/bin/env node

/**
 * Fetches Patristic Nectar GraphQL collection/content data and writes:
 * - data/api-collections.json
 * - data/api-content.json
 * - data/api-metadata.json
 */

const fs = require("fs/promises");
const path = require("path");

const ENDPOINT =
  process.env.PAT_API_ENDPOINT || "https://api.patristicnectar.org/graphql";
const ROOT_PARENT_ID = Number(process.env.PAT_API_ROOT_PARENT_ID || 2);
const DISPLAY_MODE = process.env.PAT_API_DISPLAY_MODE || "CAROUSEL";
const PER_PAGE = Number(process.env.PAT_API_PER_PAGE || 50);
const MAX_DEPTH = Number(process.env.PAT_API_MAX_DEPTH || 8);

const QUERY = `
query allCollectionItems(
  $parentId: ID!
  $displayMode: DisplayMode!
  $terminatingTypes: [CollectionItemType!]
  $perPage: Int
  $page: Int
  $sortField: String
  $sortOrder: String
  $playbackFilter: PlaybackFilter
) {
  items: allCollectionItems(
    parentId: $parentId
    displayMode: $displayMode
    terminatingTypes: $terminatingTypes
    perPage: $perPage
    page: $page
    sortField: $sortField
    sortOrder: $sortOrder
    playbackFilter: $playbackFilter
  ) {
    __typename
    id
    position
    parentId
    depth
    item {
      ... on Carousel {
        __typename
        id
        name
        slides {
          __typename
          id
          link
          cover {
            id
            src
          }
        }
      }
      ... on Collection {
        __typename
        id
        name
        slug
        description
        cover {
          __typename
          id
          src
        }
      }
      ... on Content {
        __typename
        id
        slug
        externalId
        name
        description
        availableAt
        cover {
          id
          src
          type
        }
        asset {
          id
          type
          duration
        }
      }
    }
  }
  meta: _allCollectionItemsMeta(
    parentId: $parentId
    displayMode: $displayMode
    terminatingTypes: $terminatingTypes
    perPage: $perPage
    page: $page
    sortField: $sortField
    sortOrder: $sortOrder
    playbackFilter: $playbackFilter
  ) {
    count
    pageCount
    page
    nextPage
    prevPage
    perPage
  }
}
`;

async function fetchGraphQL(variables) {
  const response = await fetch(ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query: QUERY, variables }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`HTTP ${response.status}: ${text.slice(0, 400)}`);
  }

  const payload = await response.json();
  if (payload.errors?.length) {
    throw new Error(JSON.stringify(payload.errors));
  }

  return payload.data;
}

async function fetchAllPagesForParent(parentId) {
  let page = 0;
  let pageCount = 1;
  const items = [];

  while (page < pageCount) {
    const data = await fetchGraphQL({
      parentId,
      displayMode: DISPLAY_MODE,
      perPage: PER_PAGE,
      page,
    });

    const pageItems = data?.items || [];
    const meta = data?.meta || {};

    items.push(...pageItems);
    pageCount = Number(meta.pageCount || 1);
    page += 1;
  }

  return items;
}

function stripHtml(value) {
  if (!value) return "";
  return String(value)
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, "\"")
    .replace(/&#39;/gi, "'");
}

function normalizeText(value) {
  return stripHtml(value).replace(/\s+/g, " ").trim();
}

function toDiscoverUrl(slug) {
  if (!slug) return "";
  if (/^https?:\/\//i.test(slug)) return slug;
  return `https://app.patristicnectar.org/discover/${slug}`;
}

function resolveExternalUrl(externalId) {
  const value = String(externalId || "").trim();
  if (!value) return "";
  if (/^https?:\/\//i.test(value)) return value;

  const ytVideoMatch = value.match(/^yt:video:([A-Za-z0-9_-]{6,})$/i);
  if (ytVideoMatch) return `https://www.youtube.com/watch?v=${ytVideoMatch[1]}`;

  const ytPlaylistMatch = value.match(/^yt:playlist:([A-Za-z0-9_-]{6,})$/i);
  if (ytPlaylistMatch) {
    return `https://www.youtube.com/playlist?list=${ytPlaylistMatch[1]}`;
  }

  return "";
}

function inferContentType(assetType, collectionPath) {
  const upperType = String(assetType || "").toUpperCase();
  const pathText = String(collectionPath || "").toLowerCase();

  if (upperType.includes("AUDIO")) return "podcast";
  if (upperType.includes("VIDEO")) return "lecture";
  if (pathText.includes("podcast") || pathText.includes("audio")) return "podcast";
  return "lecture";
}

async function main() {
  console.log("Fetching Patristic API data...");
  console.log(`Endpoint: ${ENDPOINT}`);
  console.log(
    `Root parent ID: ${ROOT_PARENT_ID}, perPage: ${PER_PAGE}, maxDepth: ${MAX_DEPTH}`,
  );

  const queue = [{ parentId: ROOT_PARENT_ID, depth: 0 }];
  const visitedParents = new Set();
  const collectionsById = new Map();
  const contentById = new Map();
  const ancestryMajorByCollectionId = new Map();

  while (queue.length > 0) {
    const current = queue.shift();
    const parentId = current.parentId;
    const depth = current.depth;

    if (visitedParents.has(parentId)) continue;
    visitedParents.add(parentId);

    const pageItems = await fetchAllPagesForParent(parentId);

    for (const row of pageItems) {
      const item = row?.item;
      const typename = item?.__typename;
      if (!item || !typename) continue;

      if (typename === "Collection") {
        const parentCollectionId = Number(row.parentId);
        const collectionId = Number(item.id);

        let majorCollection = "";
        if (parentCollectionId === ROOT_PARENT_ID) {
          majorCollection = normalizeText(item.name);
        } else {
          majorCollection = ancestryMajorByCollectionId.get(parentCollectionId) || "";
        }
        ancestryMajorByCollectionId.set(collectionId, majorCollection);

        collectionsById.set(collectionId, {
          id: collectionId,
          parentCollectionId,
          collectionItemId: Number(row.id),
          title: normalizeText(item.name),
          description: normalizeText(item.description),
          slug: item.slug || "",
          url: toDiscoverUrl(item.slug),
          coverUrl: item.cover?.src || "",
          position: Number(row.position || 0),
          depth: depth + 1,
          majorCollection: majorCollection || "Other",
          source: "patristic_api",
        });

        if (depth < MAX_DEPTH) {
          queue.push({ parentId: collectionId, depth: depth + 1 });
        }
      } else if (typename === "Content") {
        const parentCollectionId = Number(row.parentId);
        const majorCollection =
          ancestryMajorByCollectionId.get(parentCollectionId) || "Other";
        const inferredType = inferContentType(item.asset?.type, majorCollection);
        const durationSeconds = Number(item.asset?.duration?.length || 0);

        contentById.set(Number(item.id), {
          id: Number(item.id),
          parentCollectionId,
          collectionItemId: Number(row.id),
          title: normalizeText(item.name),
          description: normalizeText(item.description),
          slug: item.slug || "",
          externalId: item.externalId || "",
          url: resolveExternalUrl(item.externalId) || toDiscoverUrl(item.slug),
          coverUrl: item.cover?.src || "",
          availableAt: item.availableAt || null,
          assetType: item.asset?.type || null,
          durationSeconds,
          position: Number(row.position || 0),
          depth: depth + 1,
          majorCollection,
          contentType: inferredType,
          source: "patristic_api",
        });
      }
    }
  }

  const collections = Array.from(collectionsById.values()).sort((a, b) => {
    if (a.parentCollectionId !== b.parentCollectionId) {
      return a.parentCollectionId - b.parentCollectionId;
    }
    if (a.position !== b.position) return a.position - b.position;
    return a.title.localeCompare(b.title);
  });

  const content = Array.from(contentById.values()).sort((a, b) => {
    if (a.parentCollectionId !== b.parentCollectionId) {
      return a.parentCollectionId - b.parentCollectionId;
    }
    if (a.position !== b.position) return a.position - b.position;
    return a.title.localeCompare(b.title);
  });

  const metadata = {
    timestamp: new Date().toISOString(),
    endpoint: ENDPOINT,
    rootParentId: ROOT_PARENT_ID,
    perPage: PER_PAGE,
    maxDepth: MAX_DEPTH,
    collectionCount: collections.length,
    contentCount: content.length,
    visitedParentCount: visitedParents.size,
  };

  const dataDir = path.join(process.cwd(), "data");
  await fs.mkdir(dataDir, { recursive: true });

  await fs.writeFile(
    path.join(dataDir, "api-collections.json"),
    JSON.stringify(collections, null, 2) + "\n",
    "utf8",
  );
  await fs.writeFile(
    path.join(dataDir, "api-content.json"),
    JSON.stringify(content, null, 2) + "\n",
    "utf8",
  );
  await fs.writeFile(
    path.join(dataDir, "api-metadata.json"),
    JSON.stringify(metadata, null, 2) + "\n",
    "utf8",
  );

  console.log(`Collections: ${collections.length}`);
  console.log(`Content items: ${content.length}`);
  console.log("Wrote data/api-collections.json");
  console.log("Wrote data/api-content.json");
  console.log("Wrote data/api-metadata.json");
}

main().catch((error) => {
  console.error(`Failed to fetch Patristic API data: ${error.message}`);
  process.exit(1);
});
