# Patristic Nectar Content Index

A searchable index of Patristic Nectar content (YouTube videos + Patristic API content), organized into collections.

![Widget Screenshot](screenshot.png)

## Tutorial

This index pulls and merges data from YouTube and the Patristic API into unified JSON files.

### YouTube Playlists

The playlists themselves are direct copies of playlists from YouTube, so to add, remove, or update playlists, simply modify or create them as needed on YouTube. The index updates every 6 hours so the changes may take some time to reflect.

Any videos not in a playlist will be placed in an **"Uncategorized"** playlist at the bottom of the index.

### Major Collections

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

## Technical information

### Rationale

This index was designed to be user-friendly and integrated with the current video upload flow to ensure that it is kept up-to-date easily. To accomplish this, all of the formatting/grouping information is stored in YouTube itself in the form of YouTube playlists and description tags. This has the added benefit of creating detailed playlists that anyone can view on YouTube itself or on this index.

### Implementation

#### Automatic Update System

Data is fetched and cached in GitHub Actions every 6 hours, then committed into `data/`.
The workflow runs:
- `node scripts/fetch-youtube-data.js`
- `node scripts/fetch-patristic-api-data.js`
- `node scripts/build-unified-index.js`

The widget reads unified runtime files:
- `data/index-collections.json`
- `data/index-items.json`
- `data/index-metadata.json`

#### Widget

When embedded in a website, the widget fetches the index data from the public GitHub page and displays it. The widget supports sorting, filtering, and searching through every video and displaying the results in a few different formats. In addition, the widget follows the fonts and colors of the Squarespace website it is a part of, to prevent wonky colors if the website changes.
