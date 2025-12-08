# Patristic Nectar YouTube Index

A simple and searchable index of all Patristic Nectar YouTube videos, organized by playlists.

## Tutorial

This index pulls all video and organization information from YouTube itself, which makes it simple to update from a single location.

### Playlists

The playlists themselves are direct copies of playlists from YouTube, so to add, remove, or update playlists, simply modify or create them as needed on YouTube. The index updates every 6 hours so the changes may take some time to reflect.

Any videos not in a playlist will be placed in an **"Uncategorized"** playlist at the bottom of the index.

### Categories

Playlists can be separated into major categories, such as Author, Topic, or anything else, to organize them cleanly in the index. These categories are completely customizable from YouTube. To change the category of a playlist, alter the playlist description by adding a tag at the end `` `[XXXX]` `` where XXXX is the name of the category.

Example Playlist Description for the "Authors" Category:
```
This playlist holds all of the videos from Fr. Josiah Trenham.
[Authors]
```

Any playlist not in a category will be placed in an **"Other"** category.

### Embeddable Widget

The index is embedded through the below code. Copy it into an HTML/Code block on Squarespace or another website to display the index.

```html
<div id="patristic-nectar-widget"></div>
<link rel="stylesheet" href="https://patristic-nectar.github.io/youtube-index/dist/widget.css">
<script src="https://patristic-nectar.github.io/youtube-index/dist/widget.js"></script>
```
