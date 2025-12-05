function patristicNectarWidget() {
  return {
    loading: false,
    error: null,
    playlists: [],
    videos: [],
    lastUpdated: null,
    searchQuery: '',
    selectedPlaylist: '',
    sortBy: WIDGET_CONFIG.DEFAULT_SORT,
    collapsedPlaylists: {},
    layoutMode: 'list',
    currentPage: 1,
    itemsPerPage: WIDGET_CONFIG.DEFAULT_ITEMS_PER_PAGE,

    // Extract category from playlist title (e.g., "Name - Category" -> {name: "Name", category: "Category"})
    parsePlaylistTitle(title) {
      const match = title.match(/^(.+?)\s*-\s*([^-]+)$/);
      if (match) {
        return {
          displayName: match[1].trim(),
          category: match[2].trim()
        };
      }
      return {
        displayName: title,
        category: 'Other'
      };
    },

    get playlistsWithVideos() {
      const categoryGroups = {};

      // Parse playlists and group by category
      for (const playlist of this.playlists) {
        let playlistVideos = this.videos.filter(v =>
          v.playlistIds.includes(playlist.id)
        );

        if (this.searchQuery) {
          const query = this.searchQuery.toLowerCase();
          playlistVideos = playlistVideos.filter(v =>
            v.title.toLowerCase().includes(query) ||
            v.description.toLowerCase().includes(query)
          );
        }

        if (this.selectedPlaylist && this.selectedPlaylist !== playlist.id) {
          continue;
        }

        playlistVideos = this.sortVideos(playlistVideos);

        if (playlistVideos.length > 0) {
          const { displayName, category } = this.parsePlaylistTitle(playlist.title);

          if (!categoryGroups[category]) {
            categoryGroups[category] = [];
          }

          categoryGroups[category].push({
            playlist: {
              ...playlist,
              displayName: displayName
            },
            videos: playlistVideos,
            isCollapsed: this.collapsedPlaylists[playlist.id] !== false
          });
        }
      }

      // Sort playlists within each category alphabetically by display name
      Object.keys(categoryGroups).forEach(category => {
        categoryGroups[category].sort((a, b) =>
          a.playlist.displayName.localeCompare(b.playlist.displayName)
        );
      });

      // Convert to array format with category headers
      const result = [];
      const sortedCategories = Object.keys(categoryGroups).sort((a, b) => {
        // Always show "Other" last
        if (a === 'Other') return 1;
        if (b === 'Other') return -1;
        return a.localeCompare(b);
      });

      for (const category of sortedCategories) {
        result.push({
          isCategory: true,
          categoryName: category,
          playlists: categoryGroups[category]
        });
      }

      return result;
    },

    get totalVideos() {
      const uniqueVideoIds = new Set();
      this.playlistsWithVideos.forEach(categoryGroup => {
        categoryGroup.playlists.forEach(playlistGroup => {
          playlistGroup.videos.forEach(video => {
            uniqueVideoIds.add(video.id);
          });
        });
      });
      return uniqueVideoIds.size;
    },

    get allFilteredVideos() {
      let filtered = this.videos;

      if (this.searchQuery) {
        const query = this.searchQuery.toLowerCase();
        filtered = filtered.filter(v =>
          v.title.toLowerCase().includes(query) ||
          v.description.toLowerCase().includes(query)
        );
      }

      if (this.selectedPlaylist) {
        filtered = filtered.filter(v =>
          v.playlistIds.includes(this.selectedPlaylist)
        );
      }

      return this.sortVideos(filtered);
    },

    get paginatedVideos() {
      const start = (this.currentPage - 1) * this.itemsPerPage;
      const end = start + this.itemsPerPage;
      return this.allFilteredVideos.slice(start, end);
    },

    get totalPages() {
      return Math.ceil(this.allFilteredVideos.length / this.itemsPerPage);
    },

    async init() {
      await this.loadData();

      this.$watch('searchQuery', () => { this.currentPage = 1; });
      this.$watch('selectedPlaylist', () => { this.currentPage = 1; });
      this.$watch('sortBy', () => { this.currentPage = 1; });
    },

    toggleLayout() {
      this.layoutMode = this.layoutMode === 'list' ? 'grid' : 'list';
      this.currentPage = 1;
    },

    async loadData() {
      this.loading = true;
      this.error = null;

      try {
        const baseUrl = WIDGET_CONFIG.DATA_BASE_URL;

        // Fetch all three JSON files in parallel
        const [playlistsRes, videosRes, metadataRes] = await Promise.all([
          fetch(`${baseUrl}/playlists.json`),
          fetch(`${baseUrl}/videos.json`),
          fetch(`${baseUrl}/metadata.json`)
        ]);

        if (!playlistsRes.ok || !videosRes.ok) {
          throw new Error('Failed to load video data');
        }

        this.playlists = await playlistsRes.json();
        this.videos = await videosRes.json();

        // Load metadata (optional, won't fail if missing)
        if (metadataRes.ok) {
          const metadata = await metadataRes.json();
          this.lastUpdated = metadata.timestamp;
        }

        // Initialize all playlists as collapsed
        this.collapsedPlaylists = {};
        this.playlists.forEach(playlist => {
          this.collapsedPlaylists[playlist.id] = true;
        });
      } catch (err) {
        this.error = err.message || 'Failed to load videos. Please try again later.';
        console.error('Widget error:', err);
      } finally {
        this.loading = false;
      }
    },

    togglePlaylist(playlistId) {
      this.collapsedPlaylists[playlistId] = !this.collapsedPlaylists[playlistId];
    },

    expandAll() {
      Object.keys(this.collapsedPlaylists).forEach(id => {
        this.collapsedPlaylists[id] = false;
      });
    },

    collapseAll() {
      Object.keys(this.collapsedPlaylists).forEach(id => {
        this.collapsedPlaylists[id] = true;
      });
    },

    sortVideos(videos) {
      const sorted = [...videos];
      switch (this.sortBy) {
        case 'date-desc':
          return sorted.sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt));
        case 'date-asc':
          return sorted.sort((a, b) => new Date(a.publishedAt) - new Date(b.publishedAt));
        case 'title-asc':
          return sorted.sort((a, b) => a.title.localeCompare(b.title));
        case 'title-desc':
          return sorted.sort((a, b) => b.title.localeCompare(a.title));
        case 'views-desc':
          return sorted.sort((a, b) => (b.viewCount || 0) - (a.viewCount || 0));
        case 'duration-desc':
          return sorted.sort((a, b) => this.parseDuration(b.duration) - this.parseDuration(a.duration));
        case 'duration-asc':
          return sorted.sort((a, b) => this.parseDuration(a.duration) - this.parseDuration(b.duration));
        default:
          return sorted;
      }
    },

    parseDuration(duration) {
      const match = duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
      if (!match) return 0;
      const hours = parseInt(match[1] || 0);
      const minutes = parseInt(match[2] || 0);
      const seconds = parseInt(match[3] || 0);
      return hours * 3600 + minutes * 60 + seconds;
    },

    formatDate(dateString) {
      return new Date(dateString).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
      });
    },

    formatViews(views) {
      if (views >= 1000000) return (views / 1000000).toFixed(1) + 'M';
      if (views >= 1000) return (views / 1000).toFixed(1) + 'K';
      return views?.toString() || '0';
    }
  };
}

window.patristicNectarWidget = patristicNectarWidget;
