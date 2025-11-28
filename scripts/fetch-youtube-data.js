#!/usr/bin/env node

/**
 * YouTube Data Fetcher for GitHub Actions
 *
 * Fetches playlist and video data from YouTube Data API v3
 * and saves as JSON files in the data/ directory.
 *
 * Requires: Node.js 18+ (for native fetch support)
 * Environment: YOUTUBE_API_KEY must be set
 */

const fs = require('fs/promises');
const path = require('path');

// Configuration (copied from src/config.js)
const WIDGET_CONFIG = {
  YOUTUBE_CHANNEL_ID: "UCz72pwrQRTXibU14NmHep8w",
  YOUTUBE_API_BASE: "https://www.googleapis.com/youtube/v3",
};

/**
 * YouTube API Client (adapted from src/youtube-api.js for Node.js)
 */
class YouTubeAPI {
  constructor(apiKey) {
    this.apiKey = apiKey;
    this.baseUrl = WIDGET_CONFIG.YOUTUBE_API_BASE;
    this.channelId = WIDGET_CONFIG.YOUTUBE_CHANNEL_ID;
  }

  async fetchWithErrorHandling(url) {
    const response = await fetch(url);

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      if (response.status === 403) {
        throw new Error('Invalid API key or quota exceeded. Please check your API key.');
      } else if (response.status === 404) {
        throw new Error('Resource not found. Please verify the channel ID.');
      } else {
        throw new Error(errorData.error?.message || `API error: ${response.status}`);
      }
    }

    return response.json();
  }

  async getPlaylists() {
    const playlists = [];
    let nextPageToken = '';

    do {
      const url = `${this.baseUrl}/playlists?part=snippet,contentDetails&channelId=${this.channelId}&maxResults=50&key=${this.apiKey}${nextPageToken ? `&pageToken=${nextPageToken}` : ''}`;

      const data = await this.fetchWithErrorHandling(url);

      if (data.items) {
        playlists.push(...data.items.map(item => ({
          id: item.id,
          title: item.snippet.title,
          description: item.snippet.description,
          thumbnailUrl: item.snippet.thumbnails?.medium?.url || item.snippet.thumbnails?.default?.url || '',
          videoCount: item.contentDetails.itemCount,
          publishedAt: item.snippet.publishedAt
        })));
      }

      nextPageToken = data.nextPageToken || '';
    } while (nextPageToken);

    return playlists;
  }

  isPrivateOrDeletedVideo(video) {
    const title = video.title || '';
    const lowerTitle = title.toLowerCase();

    // Check for common private/deleted video indicators
    return (
      lowerTitle === 'private video' ||
      lowerTitle === 'deleted video' ||
      lowerTitle === '[private video]' ||
      lowerTitle === '[deleted video]' ||
      title === '' ||
      !video.thumbnailUrl ||
      video.thumbnailUrl.includes('hqdefault_live.jpg') // Live stream placeholder
    );
  }

  async getPlaylistVideos(playlistId) {
    const videos = [];
    let nextPageToken = '';

    do {
      const url = `${this.baseUrl}/playlistItems?part=snippet,contentDetails&playlistId=${playlistId}&maxResults=50&key=${this.apiKey}${nextPageToken ? `&pageToken=${nextPageToken}` : ''}`;

      const data = await this.fetchWithErrorHandling(url);

      if (data.items) {
        const validVideos = data.items
          .map(item => ({
            id: item.contentDetails.videoId,
            playlistId: playlistId,
            title: item.snippet.title,
            description: item.snippet.description,
            thumbnailUrl: item.snippet.thumbnails?.medium?.url || item.snippet.thumbnails?.default?.url || '',
            publishedAt: item.contentDetails.videoPublishedAt || item.snippet.publishedAt
          }))
          .filter(video => !this.isPrivateOrDeletedVideo(video));

        videos.push(...validVideos);
      }

      nextPageToken = data.nextPageToken || '';
    } while (nextPageToken);

    return videos;
  }

  async getVideoDetails(videoIds) {
    if (!videoIds || videoIds.length === 0) return [];

    const details = [];
    const batches = [];

    for (let i = 0; i < videoIds.length; i += 50) {
      batches.push(videoIds.slice(i, i + 50));
    }

    for (const batch of batches) {
      const ids = batch.join(',');
      const url = `${this.baseUrl}/videos?part=snippet,contentDetails,statistics&id=${ids}&key=${this.apiKey}`;

      const data = await this.fetchWithErrorHandling(url);

      if (data.items) {
        details.push(...data.items.map(item => ({
          id: item.id,
          duration: item.contentDetails.duration,
          durationFormatted: this.formatDuration(item.contentDetails.duration),
          viewCount: parseInt(item.statistics.viewCount) || 0
        })));
      }
    }

    return details;
  }

  formatDuration(duration) {
    const match = duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
    if (!match) return '0:00';

    const hours = parseInt(match[1] || 0);
    const minutes = parseInt(match[2] || 0);
    const seconds = parseInt(match[3] || 0);

    if (hours > 0) {
      return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
    } else {
      return `${minutes}:${String(seconds).padStart(2, '0')}`;
    }
  }

  async getAllVideos() {
    const playlists = await this.getPlaylists();

    const videoMap = new Map();

    for (const playlist of playlists) {
      const playlistVideos = await this.getPlaylistVideos(playlist.id);

      for (const video of playlistVideos) {
        if (videoMap.has(video.id)) {
          videoMap.get(video.id).playlistIds.push(playlist.id);
        } else {
          videoMap.set(video.id, {
            ...video,
            playlistIds: [playlist.id],
            videoUrl: `https://www.youtube.com/watch?v=${video.id}`
          });
        }
      }
    }

    const uniqueVideos = Array.from(videoMap.values());

    const videoIds = uniqueVideos.map(v => v.id);
    const videoDetails = await this.getVideoDetails(videoIds);

    const detailsMap = new Map(videoDetails.map(d => [d.id, d]));

    // Filter out videos that don't have details (likely private/deleted)
    return uniqueVideos
      .filter(video => detailsMap.has(video.id))
      .map(video => ({
        ...video,
        duration: detailsMap.get(video.id).duration,
        durationFormatted: detailsMap.get(video.id).durationFormatted,
        viewCount: detailsMap.get(video.id).viewCount
      }));
  }
}

/**
 * Main execution function
 */
async function main() {
  console.log('Starting YouTube data fetch...\n');

  // Validate API key
  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey) {
    console.error('Error: YOUTUBE_API_KEY environment variable is not set');
    console.error('Set it with: export YOUTUBE_API_KEY=your_api_key_here');
    process.exit(1);
  }

  try {
    // Create API client
    const api = new YouTubeAPI(apiKey);

    // Fetch playlists
    console.log('Fetching playlists...');
    const playlists = await api.getPlaylists();
    console.log(`Found ${playlists.length} playlists`);

    // Fetch videos
    console.log('\nFetching videos from all playlists...');
    const videos = await api.getAllVideos();
    console.log(`Found ${videos.length} videos (deduplicated)`);

    // Create metadata
    const metadata = {
      timestamp: new Date().toISOString(),
      videoCount: videos.length,
      playlistCount: playlists.length
    };

    // Create data directory if it doesn't exist
    const dataDir = path.join(process.cwd(), 'data');
    await fs.mkdir(dataDir, { recursive: true });

    // Write JSON files
    console.log('\nWriting data files...');

    await fs.writeFile(
      path.join(dataDir, 'playlists.json'),
      JSON.stringify(playlists, null, 2)
    );
    console.log('Created data/playlists.json');

    await fs.writeFile(
      path.join(dataDir, 'videos.json'),
      JSON.stringify(videos, null, 2)
    );
    console.log('Created data/videos.json');

    await fs.writeFile(
      path.join(dataDir, 'metadata.json'),
      JSON.stringify(metadata, null, 2)
    );
    console.log('Created data/metadata.json');

    // Summary
    console.log('\nData fetch complete!');
    console.log(`\nSummary:`);
    console.log(`  Playlists: ${playlists.length}`);
    console.log(`  Videos: ${videos.length}`);
    console.log(`  Last updated: ${metadata.timestamp}`);

    // Calculate file sizes
    const playlistsSize = JSON.stringify(playlists).length;
    const videosSize = JSON.stringify(videos).length;
    const totalSize = playlistsSize + videosSize;

    console.log(`\nFile sizes:`);
    console.log(`  playlists.json: ${(playlistsSize / 1024).toFixed(2)} KB`);
    console.log(`  videos.json: ${(videosSize / 1024).toFixed(2)} KB`);
    console.log(`  Total: ${(totalSize / 1024).toFixed(2)} KB`);

  } catch (error) {
    console.error('\nError fetching YouTube data:');
    console.error(`  ${error.message}`);
    console.error('\nStack trace:');
    console.error(error.stack);
    process.exit(1);
  }
}

// Run main function
if (require.main === module) {
  main();
}

module.exports = { YouTubeAPI, main };
