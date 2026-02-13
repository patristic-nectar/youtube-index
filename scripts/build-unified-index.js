#!/usr/bin/env node

/**
 * Builds unified index JSON files from YouTube + Patristic API snapshots:
 * - data/index-collections.json
 * - data/index-items.json
 * - data/index-metadata.json
 */

const fs = require("fs/promises");
const path = require("path");

const DATA_DIR = path.join(process.cwd(), "data");

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

function slugify(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function parseIsoDurationToSeconds(iso) {
  if (!iso || typeof iso !== "string") return 0;
  const match = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!match) return 0;
  const hours = Number(match[1] || 0);
  const minutes = Number(match[2] || 0);
  const seconds = Number(match[3] || 0);
  return hours * 3600 + minutes * 60 + seconds;
}

function formatDurationFromSeconds(totalSeconds) {
  const value = Number(totalSeconds || 0);
  const hours = Math.floor(value / 3600);
  const minutes = Math.floor((value % 3600) / 60);
  const seconds = Math.floor(value % 60);
  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

async function readJson(fileName, fallback = null) {
  const filePath = path.join(DATA_DIR, fileName);
  try {
    const content = await fs.readFile(filePath, "utf8");
    return JSON.parse(content);
  } catch (error) {
    if (fallback !== null) return fallback;
    throw new Error(`Missing required file: data/${fileName}`);
  }
}

function mapMajorCollectionForApi(value) {
  const key = normalizeText(value).toLowerCase();
  const overrides = {
    "weekly vlog": "Videos",
    "theological lectures": "Lectures",
    "all conference videos": "Videos",
    "reflections with bp. irenei": "Videos",
    "patristic nectar kids": "Videos",
    "hidden gems": "Lectures",
  };
  return overrides[key] || normalizeText(value) || "Other";
}

function resolveApiContentUrl(content, parentCollectionUrl, parentCollectionSlug) {
  const externalId = String(content.externalId || "").trim();
  if (/^https?:\/\//i.test(externalId)) return externalId;

  const ytVideoMatch = externalId.match(/^yt:video:([A-Za-z0-9_-]{6,})$/i);
  if (ytVideoMatch) return `https://www.youtube.com/watch?v=${ytVideoMatch[1]}`;

  const ytPlaylistMatch = externalId.match(/^yt:playlist:([A-Za-z0-9_-]{6,})$/i);
  if (ytPlaylistMatch) {
    return `https://www.youtube.com/playlist?list=${ytPlaylistMatch[1]}`;
  }

  // For catalog-style IDs (e.g. LS0883.001), build direct item path when possible.
  if (externalId && content.slug && parentCollectionSlug) {
    return `https://app.patristicnectar.org/discover/${parentCollectionSlug}/item/${content.slug}`;
  }
  if (externalId) {
    return parentCollectionUrl || "";
  }

  if (/^https?:\/\//i.test(String(content.url || ""))) return content.url;

  if (content.slug) {
    return `https://app.patristicnectar.org/discover/${content.slug}`;
  }

  return "";
}

async function main() {
  const playlists = await readJson("playlists.json");
  const videos = await readJson("videos.json");
  const youtubeMetadata = await readJson("metadata.json");
  const apiCollections = await readJson("api-collections.json");
  const apiContent = await readJson("api-content.json");
  const apiMetadata = await readJson("api-metadata.json");

  const collectionRecords = [];
  const itemRecords = [];

  const majorCollectionSet = new Set();
  const ytPlaylistById = new Map();
  for (const playlist of playlists) {
    const majorCollection = normalizeText(playlist.category) || "Other";
    majorCollectionSet.add(majorCollection);
    ytPlaylistById.set(playlist.id, {
      ...playlist,
      majorCollection,
    });
  }

  for (const apiCollection of apiCollections) {
    majorCollectionSet.add(mapMajorCollectionForApi(apiCollection.majorCollection));
  }

  for (const major of Array.from(majorCollectionSet).sort((a, b) => {
    if (a === "Other") return 1;
    if (b === "Other") return -1;
    return a.localeCompare(b);
  })) {
    collectionRecords.push({
      id: `major:${slugify(major) || "other"}`,
      source: "system",
      type: "major",
      title: major,
      description: "",
      parentId: "root",
      majorCollection: major,
      url: "",
      coverUrl: "",
      position: 0,
    });
  }

  const ytCollectionIds = new Map();
  for (const playlist of playlists) {
    const majorCollection = normalizeText(playlist.category) || "Other";
    const collectionId = `yt:collection:${playlist.id}`;
    ytCollectionIds.set(playlist.id, collectionId);
    collectionRecords.push({
      id: collectionId,
      source: "youtube",
      type: "collection",
      title: playlist.title,
      description: normalizeText(playlist.description),
      parentId: `major:${slugify(majorCollection) || "other"}`,
      majorCollection,
      url: `https://www.youtube.com/playlist?list=${playlist.id}`,
      coverUrl: playlist.thumbnailUrl || "",
      position: 0,
      sourceId: playlist.id,
    });
  }

  const patCollectionIds = new Map();
  const patCollectionUrlById = new Map();
  const patCollectionSlugById = new Map();
  for (const apiCollection of apiCollections) {
    const majorCollection = mapMajorCollectionForApi(apiCollection.majorCollection);
    const collectionId = `pat:collection:${apiCollection.id}`;
    patCollectionIds.set(apiCollection.id, collectionId);
    patCollectionUrlById.set(apiCollection.id, apiCollection.url || "");
    patCollectionSlugById.set(apiCollection.id, apiCollection.slug || "");
    const parentId =
      apiCollection.parentCollectionId === apiMetadata.rootParentId
        ? `major:${slugify(majorCollection) || "other"}`
        : `pat:collection:${apiCollection.parentCollectionId}`;

    collectionRecords.push({
      id: collectionId,
      source: "patristic_api",
      type: "collection",
      title: apiCollection.title,
      description: normalizeText(apiCollection.description),
      parentId,
      majorCollection,
      url: apiCollection.url || "",
      coverUrl: apiCollection.coverUrl || "",
      position: Number(apiCollection.position || 0),
      sourceId: String(apiCollection.id),
    });
  }

  const playlistMembership = new Map();
  for (const playlist of playlists) {
    const collectionId = ytCollectionIds.get(playlist.id);
    if (!collectionId) continue;
    for (const videoId of playlist.videoIds || []) {
      if (!playlistMembership.has(videoId)) playlistMembership.set(videoId, []);
      playlistMembership.get(videoId).push(collectionId);
    }
  }

  for (const video of videos) {
    const parentCollectionIds = playlistMembership.get(video.id) || [];
    const majorCollections = Array.from(
      new Set(
        parentCollectionIds
          .map((collectionId) => {
            const playlistId = collectionId.replace("yt:collection:", "");
            return ytPlaylistById.get(playlistId)?.majorCollection || null;
          })
          .filter(Boolean),
      ),
    );

    const primaryMajor = majorCollections[0] || "Other";
    const durationSeconds =
      Number(video.durationSeconds || 0) || parseIsoDurationToSeconds(video.duration);

    const record = {
      id: `yt:item:${video.id}`,
      source: "youtube",
      sourceId: video.id,
      contentType: "video",
      title: normalizeText(video.title),
      description: normalizeText(video.description),
      parentCollectionIds,
      majorCollection: primaryMajor,
      majorCollections,
      publishedAt: video.publishedAt || null,
      durationSeconds,
      durationFormatted:
        video.durationFormatted || formatDurationFromSeconds(durationSeconds),
      thumbnailUrl: video.thumbnailUrl || "",
      url: video.videoUrl || `https://www.youtube.com/watch?v=${video.id}`,
      viewCount: Number(video.viewCount || 0),
      likeCount: Number(video.likeCount || 0),
    };
    record.searchText =
      `${record.title} ${record.description} ${record.majorCollections.join(" ")}`.toLowerCase();
    itemRecords.push(record);
  }

  for (const content of apiContent) {
    const majorCollection = mapMajorCollectionForApi(content.majorCollection);
    const parentCollectionId =
      patCollectionIds.get(content.parentCollectionId) ||
      `pat:collection:${content.parentCollectionId}`;
    const parentCollectionUrl = patCollectionUrlById.get(content.parentCollectionId) || "";
    const parentCollectionSlug =
      patCollectionSlugById.get(content.parentCollectionId) || "";
    const durationSeconds = Number(content.durationSeconds || 0);
    const record = {
      id: `pat:item:${content.id}`,
      source: "patristic_api",
      sourceId: String(content.id),
      contentType: content.contentType || "lecture",
      title: normalizeText(content.title),
      description: normalizeText(content.description),
      parentCollectionIds: [parentCollectionId],
      majorCollection,
      majorCollections: [majorCollection],
      publishedAt: content.availableAt || null,
      durationSeconds,
      durationFormatted: formatDurationFromSeconds(durationSeconds),
      thumbnailUrl: content.coverUrl || "",
      url: resolveApiContentUrl(content, parentCollectionUrl, parentCollectionSlug),
      viewCount: 0,
      likeCount: 0,
      assetType: content.assetType || null,
      externalId: content.externalId || "",
    };
    record.searchText =
      `${record.title} ${record.description} ${record.majorCollection}`.toLowerCase();
    itemRecords.push(record);
  }

  collectionRecords.sort((a, b) => {
    if (a.parentId !== b.parentId) return a.parentId.localeCompare(b.parentId);
    if (a.position !== b.position) return a.position - b.position;
    return a.title.localeCompare(b.title);
  });

  itemRecords.sort((a, b) => {
    const aDate = a.publishedAt ? new Date(a.publishedAt).getTime() : 0;
    const bDate = b.publishedAt ? new Date(b.publishedAt).getTime() : 0;
    if (aDate !== bDate) return bDate - aDate;
    return a.title.localeCompare(b.title);
  });

  const metadata = {
    timestamp: new Date().toISOString(),
    collectionCount: collectionRecords.length,
    itemCount: itemRecords.length,
    sources: {
      youtube: {
        timestamp: youtubeMetadata?.timestamp || null,
        playlistCount: Number(youtubeMetadata?.playlistCount || playlists.length),
        videoCount: Number(youtubeMetadata?.videoCount || videos.length),
      },
      patristic_api: {
        timestamp: apiMetadata?.timestamp || null,
        collectionCount: Number(apiMetadata?.collectionCount || apiCollections.length),
        contentCount: Number(apiMetadata?.contentCount || apiContent.length),
      },
    },
    contentTypeCounts: {
      video: itemRecords.filter((item) => item.contentType === "video").length,
      lecture: itemRecords.filter((item) => item.contentType === "lecture").length,
      podcast: itemRecords.filter((item) => item.contentType === "podcast").length,
    },
  };

  await fs.writeFile(
    path.join(DATA_DIR, "index-collections.json"),
    JSON.stringify(collectionRecords, null, 2) + "\n",
    "utf8",
  );
  await fs.writeFile(
    path.join(DATA_DIR, "index-items.json"),
    JSON.stringify(itemRecords, null, 2) + "\n",
    "utf8",
  );
  await fs.writeFile(
    path.join(DATA_DIR, "index-metadata.json"),
    JSON.stringify(metadata, null, 2) + "\n",
    "utf8",
  );

  console.log(`Unified collections: ${collectionRecords.length}`);
  console.log(`Unified items: ${itemRecords.length}`);
  console.log("Wrote data/index-collections.json");
  console.log("Wrote data/index-items.json");
  console.log("Wrote data/index-metadata.json");
}

main().catch((error) => {
  console.error(`Failed to build unified index: ${error.message}`);
  process.exit(1);
});
