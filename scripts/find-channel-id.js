// Quick script to find YouTube channel ID by username

const API_KEY = process.env.YOUTUBE_API_KEY;
if (!API_KEY) {
  console.error('Error: YOUTUBE_API_KEY environment variable not set');
  console.error('Usage: YOUTUBE_API_KEY=your_key node find-channel-id.js [username]');
  process.exit(1);
}

const USERNAME = process.argv[2] || "PatristicNectarFilms";

async function findChannelId() {
  try {
    // Try searching by username
    const searchUrl = `https://www.googleapis.com/youtube/v3/search?part=snippet&type=channel&q=${USERNAME}&key=${API_KEY}`;

    const response = await fetch(searchUrl);
    const data = await response.json();

    if (data.items && data.items.length > 0) {
      const channelId = data.items[0].snippet.channelId;
      console.log("\nFound Channel ID:", channelId);
      console.log("Channel Title:", data.items[0].snippet.title);
      console.log("\nUpdate src/config.js with:");
      console.log(`YOUTUBE_CHANNEL_ID: "${channelId}",`);
    } else {
      console.log("Channel not found");
    }
  } catch (error) {
    console.error("Error:", error.message);
  }
}

findChannelId();
